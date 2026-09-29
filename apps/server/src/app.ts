import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import archiver from "archiver";
import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import sharp from "sharp";
import { z } from "zod";
import { marketplaceConfigSchema, optionsSchema, parseOptions, type MarketplaceConfig, type ProcessRequest, type UploadedItem } from "@moi/shared";
import { orientedSize, SHARP_OPTS } from "@moi/image-engine";
import { cleanUploadName, localOnly } from "./security";
import { Batch, Store, type StoredItem } from "./store";

const ALLOWED = new Set(["jpeg", "png", "webp", "tiff", "gif", "heif", "avif"]);
const MAX_UPLOAD_BYTES = 250 * 1024 * 1024;

const processSchema = z.object({
  items: z.array(z.object({ id: z.string().uuid(), sku: z.string().max(80).optional() })).min(1).max(5000),
  marketplaces: z.array(marketplaceConfigSchema).min(1).max(20),
  options: z.record(z.unknown()).default({}),
  namingTemplate: z.string().max(120).optional(),
  productNameMode: z.enum(["sequential", "original"]).optional(),
  provider: z.object({ kind: z.enum(["local", "removebg", "http"]), apiKey: z.string().max(300).optional(), baseUrl: z.string().url().optional() }).optional(),
  startIndex: z.number().int().min(1).max(100000).optional(),
});

export interface AppOptions {
  store?: Store;
  webDist?: string;
  concurrency?: number;
}

const uuidParam = z.string().uuid();

export function createApp(opts: AppOptions = {}) {
  const store = opts.store ?? new Store();
  const concurrency = opts.concurrency ?? Number(process.env.MOI_CONCURRENCY ?? Math.min(4, Math.max(1, Math.floor(os.cpus().length / 2))));
  const app = express();
  app.disable("x-powered-by");
  app.use(localOnly);
  app.use(express.json({ limit: "1mb" }));

  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, store.uploadDir),
      filename: (_req, _file, cb) => cb(null, randomUUID()), // client-supplied names never touch the file system
    }),
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 40 },
  });

  const wrap = (fn: (req: Request, res: Response) => Promise<void>) => (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
  const id = (req: Request, key: string): string => {
    const parsed = uuidParam.safeParse(req.params[key]);
    if (!parsed.success) throw Object.assign(new Error("Invalid id"), { status: 400 });
    return parsed.data;
  };
  const batchOr404 = (req: Request): Batch => {
    const b = store.batches.get(id(req, "bid"));
    if (!b) throw Object.assign(new Error("Batch not found"), { status: 404 });
    return b;
  };

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, version: "1.0.0", concurrency, providers: { removebg: !!process.env.REMOVE_BG_API_KEY, http: !!process.env.MOI_HTTP_PROVIDER_URL } });
  });

  // ---- uploads ----
  app.post("/api/upload", upload.array("files", 40), wrap(async (req, res) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const items: UploadedItem[] = [];
    const rejected: { name: string; reason: string }[] = [];
    for (const f of files) {
      const name = cleanUploadName(f.originalname);
      try {
        const meta = await sharp(f.path, SHARP_OPTS).metadata();
        if (!meta.format || !ALLOWED.has(meta.format)) throw new Error(`Unsupported image format${meta.format ? ` (${meta.format})` : ""}`);
        const size = await orientedSize(f.path);
        const item: StoredItem = { id: path.basename(f.path), name, width: size.width, height: size.height, size: f.size, format: meta.format, hasAlpha: !!meta.hasAlpha, path: f.path };
        store.items.set(item.id, item);
        const { path: _p, ...pub } = item;
        void _p;
        items.push(pub);
      } catch (e) {
        await fsp.rm(f.path, { force: true });
        const msg = (e as Error).message;
        rejected.push({ name, reason: /unsupported|not a|bad|corrupt|premature|Input/i.test(msg) ? (msg.startsWith("Unsupported") ? msg : "Unsupported or unreadable image format") : msg });
      }
    }
    res.json({ items, rejected });
  }));

  app.get("/api/items/:id/preview", wrap(async (req, res) => {
    const item = store.items.get(id(req, "id"));
    if (!item) { res.status(404).json({ error: "Not found" }); return; }
    const w = Math.min(2400, Math.max(64, Number(req.query.w) || 400));
    const cache = store.thumbPath(item.id, w);
    if (!fs.existsSync(cache)) {
      await sharp(item.path, SHARP_OPTS).rotate().resize({ width: w, height: w, fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 82 }).toFile(cache);
    }
    res.set("Cache-Control", "private, max-age=3600").type("image/jpeg");
    fs.createReadStream(cache).pipe(res);
  }));

  app.delete("/api/items/:id", wrap(async (req, res) => {
    await store.removeItem(id(req, "id"));
    res.json({ ok: true });
  }));

  // ---- processing ----
  app.post("/api/process", wrap(async (req, res) => {
    const body = parseProcess(req);
    const batch = new Batch(store, body, concurrency);
    store.batches.set(batch.id, batch);
    batch.upsert(body);
    res.json(batch.status());
  }));

  app.post("/api/batches/:bid/tasks", wrap(async (req, res) => {
    const batch = batchOr404(req);
    const body = parseProcess(req);
    const { busy } = batch.upsert(body);
    if (busy.length && busy.length === body.items.length) { res.status(409).json({ error: "Those images are currently processing" }); return; }
    res.json(batch.status());
  }));

  app.get("/api/batches/:bid", (req, res) => { res.json(batchOr404(req).status()); });

  app.post("/api/batches/:bid/pause", (req, res) => { const b = batchOr404(req); b.queue.pause(); res.json(b.status()); });
  app.post("/api/batches/:bid/resume", (req, res) => { const b = batchOr404(req); b.queue.resume(); res.json(b.status()); });
  app.post("/api/batches/:bid/cancel", (req, res) => { const b = batchOr404(req); b.queue.cancel(); res.json(b.status()); });
  app.post("/api/batches/:bid/retry", (req, res) => {
    const b = batchOr404(req);
    const itemId = typeof req.body?.itemId === "string" ? req.body.itemId : undefined;
    if (itemId) b.queue.retry(itemId);
    else { b.queue.retryFailed(); for (const j of b.queue.list()) if (j.state === "cancelled") b.queue.retry(j.id); }
    res.json(b.status());
  });
  app.delete("/api/batches/:bid", wrap(async (req, res) => { await store.removeBatch(id(req, "bid")); res.json({ ok: true }); }));

  // ---- downloads ----
  app.get("/api/batches/:bid/items/:iid/:mp/file", (req, res) => {
    const batch = batchOr404(req);
    const found = batch.outputFile(id(req, "iid"), String(req.params.mp));
    if (!found) { res.status(404).json({ error: "Output not found" }); return; }
    res.set("Cache-Control", "no-store");
    const inline = req.query.inline === "1";
    res.type(path.extname(found.file));
    if (!inline) res.attachment(found.filename);
    fs.createReadStream(found.file).pipe(res);
  });

  app.get("/api/batches/:bid/zip", (req, res, next) => {
    const batch = batchOr404(req);
    const only = typeof req.query.items === "string" && req.query.items ? new Set(req.query.items.split(",")) : null;
    const status = batch.status();
    res.set("Cache-Control", "no-store");
    res.attachment("optimized-products.zip");
    const archive = archiver("zip", { zlib: { level: 1 } });
    archive.on("error", next);
    archive.pipe(res);
    for (const t of status.tasks) {
      if (t.state !== "done" || (only && !only.has(t.itemId))) continue;
      const folder = batch.folderFor(t.itemId)!;
      const item = store.items.get(t.itemId);
      if (item && fs.existsSync(item.path) && req.query.originals !== "0") {
        const ext = { jpeg: "jpg", png: "png", webp: "webp", tiff: "tif", gif: "gif", heif: "heif" }[item.format] ?? "img";
        archive.file(item.path, { name: `${folder}/original.${ext}` });
      }
      for (const o of t.outputs) {
        const f = batch.outputFile(t.itemId, o.marketplace);
        if (f) archive.file(f.file, { name: `${folder}/${o.marketplace}/${o.filename}` });
      }
    }
    void archive.finalize();
  });

  // ---- housekeeping ----
  app.get("/api/storage", wrap(async (_req, res) => { res.json(await store.usage()); }));
  app.delete("/api/data", wrap(async (_req, res) => { await store.clearAll(); res.json({ ok: true }); }));

  app.use("/api", (_req, res) => { res.status(404).json({ error: "Not found" }); });

  if (opts.webDist && fs.existsSync(opts.webDist)) {
    app.use(express.static(opts.webDist, { index: false, maxAge: "1h" }));
    app.get("/{*splat}", (_req, res) => { res.sendFile(path.join(opts.webDist!, "index.html")); });
  }

  app.use((err: Error & { status?: number; code?: string }, _req: Request, res: Response, _next: NextFunction) => {
    void _next;
    if (err instanceof z.ZodError) { res.status(400).json({ error: "Invalid request", details: err.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`) }); return; }
    if (err.code === "LIMIT_FILE_SIZE") { res.status(413).json({ error: "File is too large (limit 250 MB)" }); return; }
    if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE") { res.status(413).json({ error: "Too many files in one request" }); return; }
    res.status(err.status ?? 500).json({ error: err.message || "Internal error" });
  });

  return { app, store };
}

function parseProcess(req: Request): ProcessRequest {
  const body = processSchema.parse(req.body);
  const options = parseOptions(body.options);
  void optionsSchema;
  return { ...body, options, marketplaces: body.marketplaces as MarketplaceConfig[] };
}
