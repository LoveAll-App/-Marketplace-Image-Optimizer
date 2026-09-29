import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { getBuiltinMarketplace, getRules } from "@moi/marketplace-rules";
import { validate } from "@moi/validation";
import {
  parseOptions,
  type Box,
  type MarketplaceConfig,
  type OptimizeOptions,
  type OptimizeResult,
  type OutputFormat,
  type ProductAnalysis,
  type RGB,
  type Stage,
  type ValidationRule,
} from "@moi/shared";
import { joinAlpha, maskToAlpha, type RawImage } from "./cutout";
import { detectProduct, orientedSize, SHARP_OPTS, type Detection } from "./detect";
import { enhanceRgb } from "./enhance";
import { encodeImage } from "./encode";
import { OptimizerError, toErrorInfo } from "./errors";
import { inspectEncoded, toValidationInput } from "./inspect";
import { computeCanvas, computePlacement, resolveAspectRatio } from "./layout";
import { localProvider, type ImageEnhancementProvider } from "./providers";

const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp", "tiff", "gif", "heif", "avif"]);

export interface RunContext {
  onStage?: (stage: Stage) => void;
  signal?: AbortSignal;
}

function step(ctx: RunContext, stage: Stage) {
  if (ctx.signal?.aborted) throw new OptimizerError("CANCELLED", "Cancelled");
  ctx.onStage?.(stage);
}

export interface PreparedSource {
  /** Pixel source (original file, or the provider's cut-out) */
  input: string | Buffer;
  detection: Detection;
  warnings: string[];
  providerId?: string;
}

const hexToRgb = (hex: string): RGB => ({ r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) });

export type ResolvedBackground = { kind: "original" } | { kind: "transparent" } | { kind: "color"; color: RGB; custom: boolean };

export function resolveBackground(opts: OptimizeOptions, config: MarketplaceConfig): ResolvedBackground {
  const choice = opts.background === "auto" ? config.backgroundMode : opts.background;
  if (choice === "original") return { kind: "original" };
  if (choice === "transparent") return { kind: "transparent" };
  if (choice === "custom") return { kind: "color", color: hexToRgb(opts.customBackground), custom: true };
  return { kind: "color", color: { r: 255, g: 255, b: 255 }, custom: false };
}

/** Steps shared by every marketplace: format check, detection, optional AI cut-out. */
export async function prepareSource(
  input: string | Buffer,
  args: { options: OptimizeOptions; wantRemoval: boolean; provider?: ImageEnhancementProvider },
  ctx: RunContext = {},
): Promise<PreparedSource> {
  const warnings: string[] = [];
  const provider = args.provider ?? localProvider;
  step(ctx, "analysis");

  let meta: sharp.Metadata;
  try {
    meta = await sharp(input, SHARP_OPTS).metadata();
  } catch (e) {
    const info = toErrorInfo(e);
    throw new OptimizerError(/unsupported/i.test(String(e)) ? "UNSUPPORTED_FORMAT" : "CORRUPT_IMAGE", /unsupported/i.test(String(e)) ? "Unsupported image format" : info.message);
  }
  if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) throw new OptimizerError("UNSUPPORTED_FORMAT", `Unsupported image format${meta.format ? ` (${meta.format})` : ""}`);
  await orientedSize(input);

  let source = input;
  let providerId: string | undefined;

  if (args.wantRemoval && args.options.processingMode !== "local") {
    if (provider.external && !args.options.allowExternal) {
      if (args.options.processingMode === "ai") throw new OptimizerError("EXTERNAL_NOT_ALLOWED", "External AI processing is disabled in settings");
      warnings.push("External AI processing is disabled — used local processing instead");
    } else if (provider.id !== "local") {
      step(ctx, "background-removal");
      try {
        const bytes = typeof input === "string" ? await fs.readFile(input) : input;
        const file = new File([new Uint8Array(bytes)], "image.png", { type: "image/png" });
        const out = await provider.removeBackground(file);
        source = Buffer.from(await out.arrayBuffer());
        providerId = provider.id;
      } catch (e) {
        if (args.options.processingMode === "ai") throw e instanceof OptimizerError ? e : new OptimizerError("PROVIDER_ERROR", `AI provider failed: ${(e as Error).message}`);
        warnings.push(`AI provider failed (${(e as Error).message}) — used local processing instead`);
      }
    } else if (args.options.processingMode === "ai") {
      warnings.push("No AI provider configured — used local processing");
    }
  }

  step(ctx, "detection");
  const detection = await detectProduct(source);
  step(ctx, "background-detection");
  if (detection.analysis.fullFrame && args.wantRemoval) {
    warnings.push("No distinct background was found, so the whole frame is treated as the product");
  }
  return { input: source, detection, warnings, providerId };
}

async function rgbCrop(source: string | Buffer, box: Box, w: number, h: number): Promise<RawImage> {
  const { data, info } = await sharp(source, SHARP_OPTS)
    .rotate()
    .extract({ left: box.x, top: box.y, width: box.width, height: box.height })
    .removeAlpha()
    .toColourspace("srgb")
    .resize(w, h, { kernel: "lanczos3", fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** Marketplace-specific half of the pipeline: layout → compose → enhance → encode → validate. */
export async function renderForMarketplace(
  prep: PreparedSource,
  config: MarketplaceConfig,
  options: OptimizeOptions,
  extra: { rules?: ValidationRule[]; provider?: ImageEnhancementProvider; returnBuffer?: boolean; outputPath?: string; ctx?: RunContext } = {},
): Promise<OptimizeResult> {
  const ctx = extra.ctx ?? {};
  const warnings = [...prep.warnings];
  try {
    const det = prep.detection;
    const a: ProductAnalysis = det.analysis;
    const bg = resolveBackground(options, config);
    const provider = extra.provider ?? localProvider;

    // ---- cropping / centering / padding: pure geometry ----
    step(ctx, "cropping");
    const productBox: Box = a.bbox;
    const ratio = resolveAspectRatio(options.aspectRatio, options.customAspect, productBox.width / productBox.height, config);
    const canvas = computeCanvas(ratio, options.targetSize ?? config.targetSize, config);
    step(ctx, "centering");
    const fill = options.productFill === "auto" ? config.recommendedProductFillPercent ?? 80 : options.productFill;
    const place = computePlacement({
      canvas,
      product: { width: productBox.width, height: productBox.height },
      fillPercent: fill,
      safeMarginPercent: config.safeMarginPercent,
      position: options.position,
      customPosition: options.customPosition,
    });
    step(ctx, "padding");
    if (place.appliedFillPercent + 0.5 < fill) warnings.push(`Product fill limited to ${place.appliedFillPercent.toFixed(0)}% to keep the safe margin`);

    // ---- output format ----
    let format: OutputFormat = options.format === "auto" ? config.defaultFormat : options.format;
    let effectiveBg = bg;
    if (bg.kind === "original" && det.analysis.backgroundKind === "transparent") effectiveBg = { kind: "transparent" };
    if (effectiveBg.kind === "transparent" && format === "jpeg") {
      const alt = config.supportedFormats.map((f) => f.toLowerCase()).includes("png") ? "png" : null;
      if (alt) {
        format = "png";
        warnings.push("JPEG cannot store transparency — saved as PNG");
      } else {
        effectiveBg = { kind: "color", color: { r: 255, g: 255, b: 255 }, custom: false };
        warnings.push("JPEG cannot store transparency — used a white background");
      }
    }
    const wantsAlpha = effectiveBg.kind === "transparent";

    // ---- isolation + enhancement + background generation ----
    const scaleUp = place.scale;
    step(ctx, "enhancement");
    const level = options.enhancement.level;
    const useAiUpscale = level === "high" && options.processingMode !== "local" && provider.capabilities.upscale && scaleUp > 1.3 && (!provider.external || options.allowExternal);

    let composed: { data: Buffer; width: number; height: number; channels: 3 | 4 };

    if (bg.kind === "original") {
      // Keep the original background: scale the region of the source that lands on the canvas.
      step(ctx, "background-generation");
      const s = place.scale;
      const offX = place.x - productBox.x * s;
      const offY = place.y - productBox.y * s;
      const sx0 = Math.max(0, Math.floor(-offX / s));
      const sy0 = Math.max(0, Math.floor(-offY / s));
      const sx1 = Math.min(det.fullWidth, Math.ceil((canvas.width - offX) / s));
      const sy1 = Math.min(det.fullHeight, Math.ceil((canvas.height - offY) / s));
      const left = Math.max(0, Math.round(offX + sx0 * s));
      const top = Math.max(0, Math.round(offY + sy0 * s));
      const w = Math.max(1, Math.min(canvas.width - left, Math.round((sx1 - sx0) * s)));
      const h = Math.max(1, Math.min(canvas.height - top, Math.round((sy1 - sy0) * s)));
      let region = await rgbCrop(prep.input, { x: sx0, y: sy0, width: sx1 - sx0, height: sy1 - sy0 }, w, h);
      region = await enhanceRgb(region, options.enhancement);
      const fillColor: RGB = a.backgroundKind === "transparent" ? { r: 255, g: 255, b: 255 } : a.backgroundColor;
      if (w < canvas.width || h < canvas.height) {
        warnings.push("Original background was extended with its sampled colour to reach the target frame");
      }
      const base = sharp({ create: { width: canvas.width, height: canvas.height, channels: 3, background: fillColor } });
      const out = await base
        .composite([{ input: region.data, raw: { width: region.width, height: region.height, channels: 3 }, left, top }])
        .raw()
        .toBuffer({ resolveWithObject: true });
      composed = { data: out.data, width: out.info.width, height: out.info.height, channels: out.info.channels as 3 | 4 };
    } else {
      step(ctx, "isolation");
      let rgb = await rgbCrop(prep.input, productBox, place.width, place.height);
      if (useAiUpscale) {
        try {
          const big = await sharp(rgb.data, { raw: { width: rgb.width, height: rgb.height, channels: 3 } }).png().toBuffer();
          const up = await provider.upscale(new File([new Uint8Array(big)], "crop.png", { type: "image/png" }));
          const upBuf = Buffer.from(await up.arrayBuffer());
          const resized = await sharp(upBuf).removeAlpha().resize(place.width, place.height, { fit: "fill", kernel: "lanczos3" }).raw().toBuffer({ resolveWithObject: true });
          rgb = { data: resized.data, width: resized.info.width, height: resized.info.height };
        } catch (e) {
          if (options.processingMode === "ai") throw e instanceof OptimizerError ? e : new OptimizerError("PROVIDER_ERROR", `AI upscale failed: ${(e as Error).message}`);
          warnings.push(`AI upscale failed (${(e as Error).message}) — used local resampling`);
        }
      }
      rgb = await enhanceRgb(rgb, options.enhancement);

      // alpha: the source's own transparency, or the detected mask
      let alpha: Buffer;
      if (det.hadAlpha) {
        alpha = await sharp(prep.input, SHARP_OPTS)
          .rotate()
          .extract({ left: productBox.x, top: productBox.y, width: productBox.width, height: productBox.height })
          .ensureAlpha()
          .extractChannel(3)
          .resize(place.width, place.height, { kernel: "lanczos3", fit: "fill" })
          .raw()
          .toBuffer();
      } else if (det.analysis.fullFrame) {
        alpha = Buffer.alloc(place.width * place.height, 255);
      } else {
        alpha = await maskToAlpha(det, det.workBox, place.width, place.height);
      }
      const rgba = await joinAlpha(rgb, alpha);

      step(ctx, "background-generation");
      const background =
        effectiveBg.kind === "transparent"
          ? { r: 0, g: 0, b: 0, alpha: 0 }
          : { ...(effectiveBg.kind === "color" ? effectiveBg.color : { r: 255, g: 255, b: 255 }), alpha: 1 };
      const out = await sharp({ create: { width: canvas.width, height: canvas.height, channels: 4, background } })
        .composite([{ input: rgba, raw: { width: rgb.width, height: rgb.height, channels: 4 }, left: place.x, top: place.y }])
        .raw()
        .toBuffer({ resolveWithObject: true });
      composed = { data: out.data, width: out.info.width, height: out.info.height, channels: out.info.channels as 3 | 4 };
      if (!wantsAlpha && composed.channels === 4) {
        const flat = await sharp(composed.data, { raw: { width: composed.width, height: composed.height, channels: 4 } }).removeAlpha().raw().toBuffer();
        composed = { data: flat, width: composed.width, height: composed.height, channels: 3 };
      }
    }

    // ---- resize/compression ----
    step(ctx, "resize");
    step(ctx, "compression");
    const quality = options.quality === "auto" ? config.jpegQuality : options.quality;
    const enc = await encodeImage({
      ...composed,
      format,
      quality,
      maxBytes: config.maxFileSizeMB ? Math.floor(config.maxFileSizeMB * 1024 * 1024) : undefined,
      minWidth: config.minWidth,
      minHeight: config.minHeight,
    });
    warnings.push(...enc.notes);

    // ---- validation ----
    step(ctx, "validation");
    const ins = await inspectEncoded(enc.buffer);
    const scaleFinal = enc.width / canvas.width;
    const finalBox: Box = { x: place.x * scaleFinal, y: place.y * scaleFinal, width: place.width * scaleFinal, height: place.height * scaleFinal };
    const requested = bg.kind === "color" ? (bg.custom ? "custom" : "white") : bg.kind;
    const validation = validate(toValidationInput(ins, finalBox, requested), config, extra.rules ?? getRules(config.id));

    let outputPath: string | undefined;
    if (extra.outputPath) {
      await writeAtomic(extra.outputPath, enc.buffer);
      outputPath = extra.outputPath;
    }
    step(ctx, "preview");
    return {
      success: true,
      marketplace: config.id,
      outputPath,
      metadata: { width: enc.width, height: enc.height, format, fileSize: enc.buffer.length, quality: format === "png" ? undefined : enc.quality, hasAlpha: ins.hasAlpha },
      validation,
      analysis: a,
      warnings,
      buffer: extra.returnBuffer === false ? undefined : enc.buffer,
    };
  } catch (e) {
    return { success: false, marketplace: config.id, error: toErrorInfo(e) };
  }
}

export async function writeAtomic(file: string, data: Buffer): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, file);
  } catch (e) {
    await fs.rm(tmp, { force: true });
    throw e;
  }
}

export type MarketplaceRef = string | MarketplaceConfig;

function resolveConfig(ref: MarketplaceRef): MarketplaceConfig {
  if (typeof ref !== "string") return ref;
  const found = getBuiltinMarketplace(ref);
  if (!found) throw new OptimizerError("INVALID_OPTIONS", `Unknown marketplace "${ref}"`);
  return found;
}

export interface OptimizeImageArgs {
  input: string | Buffer;
  marketplace: MarketplaceRef;
  options?: Partial<OptimizeOptions>;
  outputPath?: string;
  provider?: ImageEnhancementProvider;
  returnBuffer?: boolean;
  onStage?: (stage: Stage) => void;
  signal?: AbortSignal;
}

/** One image → one marketplace. Never throws: failures come back as `{ success: false }`. */
export async function optimizeImage(args: OptimizeImageArgs): Promise<OptimizeResult> {
  const id = typeof args.marketplace === "string" ? args.marketplace : args.marketplace.id;
  try {
    const config = resolveConfig(args.marketplace);
    const options = parseOptions(args.options ?? {});
    const ctx: RunContext = { onStage: args.onStage, signal: args.signal };
    const prep = await prepareSource(args.input, { options, wantRemoval: resolveBackground(options, config).kind !== "original", provider: args.provider }, ctx);
    return await renderForMarketplace(prep, config, options, { provider: args.provider, returnBuffer: args.returnBuffer, outputPath: args.outputPath, ctx });
  } catch (e) {
    return { success: false, marketplace: id, error: toErrorInfo(e) };
  }
}

export interface OptimizeMultipleArgs {
  input: string | Buffer;
  marketplaces: MarketplaceConfig[];
  options?: Partial<OptimizeOptions>;
  provider?: ImageEnhancementProvider;
  returnBuffer?: boolean;
  /** Called per marketplace to decide where to write (omit to keep results in memory) */
  outputPathFor?: (config: MarketplaceConfig, format: string) => string | undefined;
  onStage?: (stage: Stage) => void;
  signal?: AbortSignal;
}

/** One image → many marketplaces, sharing analysis/detection. Never throws. */
export async function optimizeMultiple(args: OptimizeMultipleArgs): Promise<{ analysis?: ProductAnalysis; results: OptimizeResult[] }> {
  const ctx: RunContext = { onStage: args.onStage, signal: args.signal };
  let options: OptimizeOptions;
  try {
    options = parseOptions(args.options ?? {});
  } catch (e) {
    const error = { code: "INVALID_OPTIONS", message: (e as Error).message };
    return { results: args.marketplaces.map((m) => ({ success: false as const, marketplace: m.id, error })) };
  }
  let prep: PreparedSource;
  try {
    const wantRemoval = args.marketplaces.some((m) => resolveBackground(options, m).kind !== "original");
    prep = await prepareSource(args.input, { options, wantRemoval, provider: args.provider }, ctx);
  } catch (e) {
    const error = toErrorInfo(e);
    return { results: args.marketplaces.map((m) => ({ success: false as const, marketplace: m.id, error })) };
  }
  const results: OptimizeResult[] = [];
  for (const m of args.marketplaces) {
    if (args.signal?.aborted) {
      results.push({ success: false, marketplace: m.id, error: { code: "CANCELLED", message: "Cancelled" } });
      continue;
    }
    const ext = options.format === "auto" ? m.defaultFormat : options.format;
    results.push(
      await renderForMarketplace(prep, m, options, {
        provider: args.provider,
        returnBuffer: args.returnBuffer,
        outputPath: args.outputPathFor?.(m, ext),
        ctx,
      }),
    );
  }
  return { analysis: prep.detection.analysis, results };
}
