import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { JobQueue } from "@moi/processing-queue";
import {
  buildFilename,
  productName,
  pad,
  type BatchStatus,
  type BatchTask,
  type MarketplaceConfig,
  type OptimizeOptions,
  type ProcessRequest,
  type ProviderSettings,
  type UploadedItem,
} from "@moi/shared";
import { createProvider, optimizeMultiple, toErrorInfo } from "@moi/image-engine";

export interface StoredItem extends UploadedItem {
  path: string;
}

interface TaskConfig {
  marketplaces: MarketplaceConfig[];
  options: OptimizeOptions;
}

export class Batch {
  readonly id = randomUUID();
  readonly createdAt = Date.now();
  readonly dir: string;
  readonly queue: JobQueue<string, void>;
  private tasks = new Map<string, BatchTask>();
  private configs = new Map<string, TaskConfig>();
  private folders = new Map<string, string>();
  private nextIndex: number;
  namingTemplate?: string;
  productNameMode: "sequential" | "original";
  provider?: ProviderSettings;

  constructor(private store: Store, req: Pick<ProcessRequest, "namingTemplate" | "productNameMode" | "provider" | "startIndex">, concurrency: number) {
    this.dir = path.join(store.root, "batches", this.id);
    this.namingTemplate = req.namingTemplate;
    this.productNameMode = req.productNameMode ?? "sequential";
    this.provider = req.provider;
    this.nextIndex = Math.max(1, req.startIndex ?? 1);
    this.queue = new JobQueue<string, void>((itemId, ctx) => this.run(itemId, ctx.signal), { concurrency });
  }

  /** Add new tasks or replace the settings of existing ones (and run them). Returns ids that were busy. */
  upsert(req: ProcessRequest): { busy: string[] } {
    if (req.provider) this.provider = req.provider;
    const busy: string[] = [];
    for (const it of req.items) {
      const item = this.store.items.get(it.id);
      if (!item) continue;
      const existing = this.tasks.get(it.id);
      if (existing?.state === "processing") {
        busy.push(it.id);
        continue;
      }
      const index = existing?.index ?? this.nextIndex++;
      const task: BatchTask = {
        itemId: it.id,
        name: item.name,
        index,
        sku: it.sku,
        state: "queued",
        marketplaces: req.marketplaces.map((m) => m.id),
        attempts: existing?.attempts ?? 0,
        outputs: [],
        failures: [],
      };
      this.tasks.set(it.id, task);
      this.configs.set(it.id, { marketplaces: req.marketplaces, options: req.options });
      if (!this.folders.has(it.id)) this.folders.set(it.id, this.uniqueFolder(item.name, index));
      if (existing) this.queue.requeue(it.id);
      else this.queue.add(it.id, it.id);
    }
    return { busy };
  }

  private uniqueFolder(name: string, index: number): string {
    const base = productName({ original: name, index, productNameMode: this.productNameMode });
    const taken = new Set(this.folders.values());
    return taken.has(base) ? `${base}-${pad(index)}` : base;
  }

  folderFor(itemId: string): string | undefined {
    return this.folders.get(itemId);
  }

  taskFor(itemId: string): BatchTask | undefined {
    return this.tasks.get(itemId);
  }

  private async run(itemId: string, signal: AbortSignal): Promise<void> {
    const task = this.tasks.get(itemId)!;
    const cfg = this.configs.get(itemId)!;
    const item = this.store.items.get(itemId);
    const started = Date.now();
    task.state = "processing";
    task.attempts++;
    task.outputs = [];
    task.failures = [];
    task.error = undefined;
    task.stage = "analysis";
    if (!item) {
      task.state = "failed";
      task.error = { code: "MISSING", message: "The original image is no longer available — upload it again" };
      throw new Error(task.error.message);
    }
    const outDir = path.join(this.dir, itemId);
    await fs.rm(outDir, { recursive: true, force: true });
    let provider;
    try {
      provider = createProvider(this.provider);
    } catch (e) {
      task.error = toErrorInfo(e);
      throw e;
    }
    const names = new Map<string, string>();
    const { analysis, results } = await optimizeMultiple({
      input: item.path,
      marketplaces: cfg.marketplaces,
      options: cfg.options,
      provider,
      returnBuffer: false,
      signal,
      onStage: (s) => { task.stage = s; },
      outputPathFor: (m, ext) => {
        const filename = buildFilename(this.namingTemplate, { original: item.name, index: task.index, marketplace: m.id, sku: task.sku, extension: ext, productNameMode: this.productNameMode });
        names.set(m.id, filename);
        return path.join(outDir, m.id, filename);
      },
    });
    task.analysis = analysis;
    task.durationMs = Date.now() - started;
    for (const r of results) {
      const m = cfg.marketplaces.find((x) => x.id === r.marketplace)!;
      if (r.success) {
        task.outputs.push({ marketplace: m.id, marketplaceName: m.name, filename: names.get(m.id)!, metadata: r.metadata, validation: r.validation, warnings: r.warnings });
      } else {
        task.failures.push({ marketplace: m.id, marketplaceName: m.name, code: r.error.code, message: r.error.message });
      }
    }
    if (signal.aborted) {
      task.state = "cancelled";
      return;
    }
    if (task.outputs.length === 0) {
      task.error = { code: task.failures[0]?.code ?? "INTERNAL", message: task.failures[0]?.message ?? "Processing failed" };
      task.state = "failed";
      throw new Error(task.error.message);
    }
    task.state = "done";
    task.stage = undefined;
  }

  syncStates(): void {
    for (const job of this.queue.list()) {
      const t = this.tasks.get(job.id);
      if (!t) continue;
      t.state = job.state;
      if (job.state === "failed" && !t.error) t.error = { code: "INTERNAL", message: job.error?.message ?? "Failed" };
      if (job.state === "queued") { t.stage = undefined; t.error = undefined; }
    }
  }

  status(): BatchStatus {
    this.syncStates();
    const snap = this.queue.snapshot();
    const tasks = [...this.tasks.values()].sort((a, b) => a.index - b.index);
    return {
      id: this.id,
      createdAt: this.createdAt,
      paused: snap.paused,
      cancelled: snap.cancelled > 0,
      total: snap.total,
      queued: snap.queued,
      processing: snap.processing,
      done: snap.done,
      failed: snap.failed,
      cancelledCount: snap.cancelled,
      finished: snap.finished,
      marketplaces: [...new Set(tasks.flatMap((t) => t.marketplaces))],
      tasks,
    };
  }

  outputFile(itemId: string, marketplace: string): { file: string; filename: string } | null {
    const t = this.tasks.get(itemId);
    const o = t?.outputs.find((x) => x.marketplace === marketplace);
    if (!t || !o) return null;
    const file = path.join(this.dir, itemId, marketplace, o.filename);
    return fsSync.existsSync(file) ? { file, filename: o.filename } : null;
  }

  async destroy(): Promise<void> {
    this.queue.cancel();
    await fs.rm(this.dir, { recursive: true, force: true });
  }
}

export class Store {
  readonly root: string;
  readonly items = new Map<string, StoredItem>();
  readonly batches = new Map<string, Batch>();

  constructor(root?: string) {
    this.root = root ?? fsSync.mkdtempSync(path.join(os.tmpdir(), "moi-"));
    fsSync.mkdirSync(path.join(this.root, "uploads"), { recursive: true });
    fsSync.mkdirSync(path.join(this.root, "thumbs"), { recursive: true });
  }

  get uploadDir(): string {
    return path.join(this.root, "uploads");
  }

  thumbPath(id: string, w: number): string {
    return path.join(this.root, "thumbs", `${id}-${w}.jpg`);
  }

  async removeItem(id: string): Promise<void> {
    const it = this.items.get(id);
    if (!it) return;
    this.items.delete(id);
    await fs.rm(it.path, { force: true });
    const thumbs = await fs.readdir(path.join(this.root, "thumbs")).catch(() => []);
    await Promise.all(thumbs.filter((t) => t.startsWith(id)).map((t) => fs.rm(path.join(this.root, "thumbs", t), { force: true })));
  }

  async removeBatch(id: string): Promise<void> {
    const b = this.batches.get(id);
    if (!b) return;
    this.batches.delete(id);
    await b.destroy();
  }

  /** Delete every temporary file (originals, thumbnails, outputs). */
  async clearAll(): Promise<void> {
    for (const b of this.batches.values()) b.queue.cancel();
    this.batches.clear();
    this.items.clear();
    await fs.rm(this.root, { recursive: true, force: true });
    await fs.mkdir(this.uploadDir, { recursive: true });
    await fs.mkdir(path.join(this.root, "thumbs"), { recursive: true });
  }

  async usage(): Promise<{ bytes: number; files: number }> {
    let bytes = 0, files = 0;
    const walk = async (dir: string): Promise<void> => {
      for (const e of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) await walk(p);
        else {
          files++;
          bytes += (await fs.stat(p).catch(() => ({ size: 0 }))).size;
        }
      }
    };
    await walk(this.root);
    return { bytes, files };
  }

  dispose(): void {
    fsSync.rmSync(this.root, { recursive: true, force: true });
  }
}
