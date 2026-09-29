import fs from "node:fs/promises";
import sharp from "sharp";
import { validate } from "@moi/validation";
import type { Box, MarketplaceConfig, RGB, ValidationInput, ValidationResult, ValidationRule } from "@moi/shared";
import { detectProduct } from "./detect";
import { SHARP_OPTS } from "./detect";

export interface InspectResult {
  readable: boolean;
  width: number;
  height: number;
  format: string;
  fileSize: number;
  hasAlpha: boolean;
  edgeColor?: RGB;
  hasTransparency: boolean;
}

/** Decode the produced bytes (proves they're readable) and sample the outer frame. */
export async function inspectEncoded(buffer: Buffer): Promise<InspectResult> {
  try {
    const meta = await sharp(buffer, SHARP_OPTS).metadata();
    const { data, info } = await sharp(buffer, SHARP_OPTS).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width: w, height: h } = info;
    const step = Math.max(1, Math.floor(Math.max(w, h) / 200));
    let r = 0, g = 0, b = 0, n = 0, transparent = 0;
    const sample = (x: number, y: number) => {
      const i = (y * w + x) * 4;
      if (data[i + 3]! < 250) { transparent++; return; }
      r += data[i]!; g += data[i + 1]!; b += data[i + 2]!; n++;
    };
    for (let x = 0; x < w; x += step) { sample(x, 0); sample(x, h - 1); }
    for (let y = 0; y < h; y += step) { sample(0, y); sample(w - 1, y); }
    return {
      readable: true,
      width: w,
      height: h,
      format: meta.format ?? "unknown",
      fileSize: buffer.length,
      hasAlpha: !!meta.hasAlpha,
      hasTransparency: transparent > 0,
      edgeColor: n ? { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) } : undefined,
    };
  } catch {
    return { readable: false, width: 0, height: 0, format: "unknown", fileSize: buffer.length, hasAlpha: false, hasTransparency: false };
  }
}

export function toValidationInput(ins: InspectResult, productBox: Box | undefined, requestedBackground?: ValidationInput["requestedBackground"]): ValidationInput {
  return {
    readable: ins.readable,
    width: ins.width,
    height: ins.height,
    format: ins.format,
    fileSize: ins.fileSize,
    hasAlpha: ins.hasAlpha,
    productBox,
    edgeColor: ins.edgeColor,
    requestedBackground,
  };
}

/**
 * Validate any image file against a marketplace profile — no pipeline involved.
 * The product box is measured from the pixels (works best on plain backgrounds).
 */
export async function validateImageFile(path: string, config: MarketplaceConfig, rules: ValidationRule[] = []): Promise<ValidationResult> {
  const buffer = await fs.readFile(path);
  const ins = await inspectEncoded(buffer);
  let box: Box | undefined;
  if (ins.readable) {
    try {
      box = (await detectProduct(buffer)).analysis.bbox;
    } catch {
      box = undefined;
    }
  }
  return validate(toValidationInput(ins, box, config.backgroundMode), config, rules);
}
