import sharp from "sharp";
import type { EnhancementSettings } from "@moi/shared";
import type { RawImage } from "./cutout";

/** True when any adjustment would actually change pixels. */
export function hasAdjustments(s: EnhancementSettings): boolean {
  return s.level !== "off" && (s.sharpness > 0 || s.brightness !== 0 || s.contrast !== 0 || s.saturation !== 0 || s.exposure !== 0 || s.noiseReduction > 0 || s.detail > 0);
}

async function pass(img: RawImage, channels: 3 | 4, fn: (s: sharp.Sharp) => sharp.Sharp): Promise<RawImage> {
  const out = await fn(sharp(img.data, { raw: { width: img.width, height: img.height, channels } })).raw().toBuffer({ resolveWithObject: true });
  return { data: out.data, width: out.info.width, height: out.info.height };
}

/**
 * Conservative, colour-faithful adjustments on an RGB buffer. Every step is bounded so the
 * product can't be over-processed; passes run separately so their order is guaranteed.
 */
export async function enhanceRgb(img: RawImage, s: EnhancementSettings): Promise<RawImage> {
  if (!hasAdjustments(s)) return img;
  let cur = img;

  if (s.noiseReduction > 0) {
    const sigma = 0.3 + (s.noiseReduction / 100) * 0.7;
    cur = await pass(cur, 3, (p) => p.blur(sigma));
  }

  if (s.exposure !== 0 || s.contrast !== 0) {
    const gain = 2 ** (s.exposure / 200);
    const k = 1 + s.contrast / 100;
    cur = await pass(cur, 3, (p) => p.linear(gain * k, 128 * (1 - k)));
  }

  if (s.brightness !== 0 || s.saturation !== 0) {
    cur = await pass(cur, 3, (p) => p.modulate({ brightness: 1 + s.brightness / 100, saturation: 1 + s.saturation / 100 }));
  }

  if (s.sharpness > 0) {
    const t = s.sharpness / 100;
    cur = await pass(cur, 3, (p) => p.sharpen({ sigma: 0.7 + t * 0.9, m1: 0.5, m2: 1 + t * 2, x1: 2, y2: 10, y3: 20 }));
  }

  if (s.detail > 0) {
    const t = s.detail / 100;
    cur = await pass(cur, 3, (p) => p.sharpen({ sigma: 2.5, m1: 0.1 + t * 0.7, m2: 0.1 + t * 0.7, x1: 3, y2: 10, y3: 20 }));
  }
  return cur;
}
