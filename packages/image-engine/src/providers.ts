import sharp from "sharp";
import { ENHANCEMENT_PRESETS, type ProviderSettings } from "@moi/shared";
import { fullCutoutPng } from "./cutout";
import { detectProduct } from "./detect";
import { enhanceRgb } from "./enhance";
import { OptimizerError } from "./errors";

/**
 * Isolation boundary for AI / external processing. The pipeline only ever talks to this
 * interface, so providers can be swapped or added without touching the engine.
 */
export interface ImageEnhancementProvider {
  readonly id: string;
  /** true when images leave this machine */
  readonly external: boolean;
  readonly capabilities: { removeBackground: boolean; upscale: boolean; enhance: boolean };
  removeBackground(image: File): Promise<Blob>;
  upscale(image: File): Promise<Blob>;
  enhance(image: File): Promise<Blob>;
}

const toBuffer = async (f: Blob) => Buffer.from(await f.arrayBuffer());
const pngBlob = (b: Buffer) => new Blob([new Uint8Array(b)], { type: "image/png" });

/** Fully local provider: built-in detection + Lanczos upscale + gentle enhancement. */
export class LocalProvider implements ImageEnhancementProvider {
  readonly id = "local";
  readonly external = false;
  readonly capabilities = { removeBackground: true, upscale: true, enhance: true };

  async removeBackground(image: File): Promise<Blob> {
    const buf = await toBuffer(image);
    const det = await detectProduct(buf);
    return pngBlob(await fullCutoutPng(buf, det));
  }

  async upscale(image: File): Promise<Blob> {
    const buf = await toBuffer(image);
    const out = await sharp(buf).rotate().resize({ width: (await sharp(buf).metadata()).width! * 2, kernel: "lanczos3" }).sharpen({ sigma: 0.8, m1: 0.5, m2: 1 }).png().toBuffer();
    return pngBlob(out);
  }

  async enhance(image: File): Promise<Blob> {
    const buf = await toBuffer(image);
    const { data, info } = await sharp(buf).rotate().removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const out = await enhanceRgb({ data, width: info.width, height: info.height }, ENHANCEMENT_PRESETS.standard);
    const png = await sharp(out.data, { raw: { width: out.width, height: out.height, channels: 3 } }).png().toBuffer();
    return pngBlob(png);
  }
}

/** remove.bg REST API. Sends the image to remove.bg — external. */
export class RemoveBgProvider implements ImageEnhancementProvider {
  readonly id = "removebg";
  readonly external = true;
  readonly capabilities = { removeBackground: true, upscale: false, enhance: false };

  constructor(private apiKey: string, private endpoint = "https://api.remove.bg/v1.0/removebg") {
    if (!apiKey) throw new OptimizerError("PROVIDER_ERROR", "remove.bg API key is missing");
  }

  async removeBackground(image: File): Promise<Blob> {
    const form = new FormData();
    form.append("image_file", image, "image.png");
    form.append("size", "auto");
    form.append("format", "png");
    const res = await fetch(this.endpoint, { method: "POST", headers: { "X-Api-Key": this.apiKey }, body: form });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new OptimizerError("PROVIDER_ERROR", `remove.bg responded ${res.status}: ${text.slice(0, 200)}`);
    }
    return new Blob([new Uint8Array(await res.arrayBuffer())], { type: "image/png" });
  }

  upscale(): Promise<Blob> {
    return Promise.reject(new OptimizerError("PROVIDER_ERROR", "remove.bg does not support upscaling"));
  }

  enhance(): Promise<Blob> {
    return Promise.reject(new OptimizerError("PROVIDER_ERROR", "remove.bg does not support enhancement"));
  }
}

export interface HttpProviderConfig {
  baseUrl: string;
  removeBackgroundPath?: string;
  upscalePath?: string;
  enhancePath?: string;
  fieldName?: string;
  headers?: Record<string, string>;
}

/**
 * Generic HTTP provider: POST multipart image → image bytes. Works with self-hosted services
 * such as `rembg s` (default path /api/remove). Treated as local when the host is localhost.
 */
export class HttpProvider implements ImageEnhancementProvider {
  readonly id = "http";
  readonly external: boolean;
  readonly capabilities: ImageEnhancementProvider["capabilities"];

  constructor(private cfg: HttpProviderConfig) {
    const host = new URL(cfg.baseUrl).hostname;
    this.external = !["localhost", "127.0.0.1", "::1", "[::1]"].includes(host);
    this.capabilities = {
      removeBackground: (cfg.removeBackgroundPath ?? "/api/remove") !== "",
      upscale: !!cfg.upscalePath,
      enhance: !!cfg.enhancePath,
    };
  }

  private async post(path: string | undefined, image: File, what: string): Promise<Blob> {
    if (!path) throw new OptimizerError("PROVIDER_ERROR", `HTTP provider has no endpoint configured for ${what}`);
    const form = new FormData();
    form.append(this.cfg.fieldName ?? "file", image, "image.png");
    const res = await fetch(new URL(path, this.cfg.baseUrl), { method: "POST", headers: this.cfg.headers, body: form });
    if (!res.ok) throw new OptimizerError("PROVIDER_ERROR", `Provider ${what} failed with HTTP ${res.status}`);
    return new Blob([new Uint8Array(await res.arrayBuffer())], { type: res.headers.get("content-type") ?? "image/png" });
  }

  removeBackground(image: File) {
    return this.post(this.cfg.removeBackgroundPath ?? "/api/remove", image, "removeBackground");
  }
  upscale(image: File) {
    return this.post(this.cfg.upscalePath, image, "upscale");
  }
  enhance(image: File) {
    return this.post(this.cfg.enhancePath, image, "enhance");
  }
}

export const localProvider = new LocalProvider();

/** Build a provider from user settings. API keys never touch disk. */
export function createProvider(settings?: ProviderSettings, env: NodeJS.ProcessEnv = process.env): ImageEnhancementProvider {
  if (!settings || settings.kind === "local") return localProvider;
  if (settings.kind === "removebg") return new RemoveBgProvider(settings.apiKey || env.REMOVE_BG_API_KEY || "");
  const baseUrl = settings.baseUrl || env.MOI_HTTP_PROVIDER_URL;
  if (!baseUrl) throw new OptimizerError("PROVIDER_ERROR", "HTTP provider needs a base URL");
  return new HttpProvider({
    baseUrl,
    upscalePath: env.MOI_HTTP_UPSCALE_PATH,
    enhancePath: env.MOI_HTTP_ENHANCE_PATH,
    headers: settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : undefined,
  });
}
