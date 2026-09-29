import path from "node:path";
import fs from "node:fs/promises";
import { JobQueue } from "@moi/processing-queue";
import { buildFilename, pad, productName, type MarketplaceConfig, type OptimizeOptions, type OptimizeResult } from "@moi/shared";
import { optimizeMultiple } from "./pipeline";
import type { ImageEnhancementProvider } from "./providers";

export const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".gif", ".avif", ".heic", ".heif"]);

/** Expand files/directories into a flat, sorted list of image paths (directories are read non-recursively by default). */
export async function collectInputs(paths: string[], recursive = false): Promise<string[]> {
  const out: string[] = [];
  const walk = async (p: string, depth: number) => {
    const st = await fs.stat(p);
    if (st.isDirectory()) {
      const entries = (await fs.readdir(p)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      for (const e of entries) {
        if (e.startsWith(".")) continue;
        const full = path.join(p, e);
        const s = await fs.stat(full);
        if (s.isDirectory()) {
          if (recursive && depth < 8) await walk(full, depth + 1);
        } else if (IMAGE_EXTENSIONS.has(path.extname(e).toLowerCase())) out.push(full);
      }
    } else out.push(p);
  };
  for (const p of paths) await walk(p, 0);
  return out;
}

export interface BatchInput {
  path: string;
  sku?: string;
}

export interface OptimizeBatchArgs {
  inputs: Array<string | BatchInput>;
  marketplaces: MarketplaceConfig[];
  options?: Partial<OptimizeOptions>;
  outputDir: string;
  namingTemplate?: string;
  productNameMode?: "sequential" | "original";
  concurrency?: number;
  /** Copy each original next to its outputs (product-001/original.jpg) */
  copyOriginals?: boolean;
  provider?: ImageEnhancementProvider;
  onProgress?: (p: { done: number; failed: number; total: number; input: string }) => void;
  signal?: AbortSignal;
}

export interface BatchItemResult {
  input: string;
  productFolder: string;
  results: OptimizeResult[];
  ok: boolean;
}

export interface OptimizeBatchResult {
  total: number;
  succeeded: number;
  failed: number;
  items: BatchItemResult[];
}

/**
 * Folder layout per product:  <out>/<product>/original.<ext>, <out>/<product>/<marketplace>/<name>.<ext>
 * Runs through the shared JobQueue so a failed image never affects the rest.
 */
export async function optimizeBatch(args: OptimizeBatchArgs): Promise<OptimizeBatchResult> {
  const inputs: BatchInput[] = args.inputs.map((i) => (typeof i === "string" ? { path: i } : i));
  const items: BatchItemResult[] = new Array(inputs.length);

  const queue = new JobQueue<number, BatchItemResult>(
    async (idx, { signal }) => {
      const inp = inputs[idx]!;
      const index = idx + 1;
      const folder = productName({ original: path.basename(inp.path), index, productNameMode: args.productNameMode });
      const dir = path.join(args.outputDir, folder);
      const { results } = await optimizeMultiple({
        input: inp.path,
        marketplaces: args.marketplaces,
        options: args.options,
        provider: args.provider,
        returnBuffer: false,
        signal,
        outputPathFor: (m, ext) =>
          path.join(dir, m.id, buildFilename(args.namingTemplate, { original: path.basename(inp.path), index, marketplace: m.id, sku: inp.sku, extension: ext, productNameMode: args.productNameMode })),
      });
      const ok = results.every((r) => r.success);
      if (args.copyOriginals !== false && results.some((r) => r.success)) {
        await fs.mkdir(dir, { recursive: true });
        await fs.copyFile(inp.path, path.join(dir, `original${path.extname(inp.path).toLowerCase() || ".jpg"}`));
      }
      return { input: inp.path, productFolder: folder, results, ok };
    },
    { concurrency: args.concurrency ?? 2 },
  );

  queue.onChange((job, snap) => {
    if (job.state === "done" || job.state === "failed") {
      args.onProgress?.({ done: snap.done + snap.failed, failed: snap.failed, total: snap.total, input: inputs[Number(job.id)]!.path });
    }
  });
  queue.pause(); // enqueue everything first so an already-aborted signal cancels before any work starts
  inputs.forEach((_, i) => queue.add(String(i), i));
  if (args.signal?.aborted) queue.cancel();
  else args.signal?.addEventListener("abort", () => queue.cancel(), { once: true });
  queue.resume();
  await queue.onIdle();

  for (const job of queue.list()) {
    const i = Number(job.id);
    const inp = inputs[i]!;
    if (job.state === "done" && job.result) items[i] = job.result;
    else {
      const message = job.error?.message ?? "Cancelled";
      items[i] = {
        input: inp.path,
        productFolder: `product-${pad(i + 1)}`,
        ok: false,
        results: args.marketplaces.map((m) => ({ success: false as const, marketplace: m.id, error: { code: job.state === "cancelled" ? "CANCELLED" : "INTERNAL", message } })),
      };
    }
  }
  const succeeded = items.filter((x) => x.ok).length;
  return { total: items.length, succeeded, failed: items.length - succeeded, items };
}
