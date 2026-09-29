import sharp from "sharp";
import type { Detection } from "./detect";

export interface RawImage {
  data: Buffer;
  width: number;
  height: number;
}

/**
 * Resample the working-resolution product mask into an alpha plane for a region of the source.
 * `region` is in working coordinates; output is `outWidth × outHeight` single-channel.
 */
export async function maskToAlpha(det: Detection, region: { x: number; y: number; width: number; height: number }, outWidth: number, outHeight: number): Promise<Buffer> {
  const scaled = Buffer.alloc(det.mask.length);
  for (let i = 0; i < det.mask.length; i++) scaled[i] = det.mask[i] ? 255 : 0;
  // pad by 1 working px so the edge ramp isn't clipped at the region border
  const pad = 2;
  const left = Math.max(0, region.x - pad);
  const top = Math.max(0, region.y - pad);
  const right = Math.min(det.workWidth, region.x + region.width + pad);
  const bottom = Math.min(det.workHeight, region.y + region.height + pad);
  const sx = outWidth / region.width;
  const sy = outHeight / region.height;
  const padded = await sharp(scaled, { raw: { width: det.workWidth, height: det.workHeight, channels: 1 } })
    .extract({ left, top, width: right - left, height: bottom - top })
    .resize(Math.max(1, Math.round((right - left) * sx)), Math.max(1, Math.round((bottom - top) * sy)), { kernel: "cubic", fit: "fill" })
    .blur(0.6)
    .toColourspace("b-w")
    .raw()
    .toBuffer({ resolveWithObject: true });
  const offX = Math.round((region.x - left) * sx);
  const offY = Math.round((region.y - top) * sy);
  const fitW = Math.min(outWidth, padded.info.width - offX);
  const fitH = Math.min(outHeight, padded.info.height - offY);
  return sharp(padded.data, { raw: { width: padded.info.width, height: padded.info.height, channels: padded.info.channels as 1 } })
    .extract({ left: Math.max(0, offX), top: Math.max(0, offY), width: Math.max(1, fitW), height: Math.max(1, fitH) })
    .resize(outWidth, outHeight, { fit: "fill" })
    .toColourspace("b-w")
    .raw()
    .toBuffer();
}

/** RGB (3ch) + alpha (1ch) → RGBA raw buffer */
export async function joinAlpha(rgb: RawImage, alpha: Buffer): Promise<Buffer> {
  if (alpha.length !== rgb.width * rgb.height) throw new Error(`alpha plane size mismatch (${alpha.length} vs ${rgb.width * rgb.height})`);
  return sharp(rgb.data, { raw: { width: rgb.width, height: rgb.height, channels: 3 } })
    .joinChannel(alpha, { raw: { width: rgb.width, height: rgb.height, channels: 1 } })
    .raw()
    .toBuffer();
}

/** Full-resolution PNG cut-out of the whole image (used by the local provider). */
export async function fullCutoutPng(input: string | Buffer, det: Detection): Promise<Buffer> {
  const rgb = await sharp(input).rotate().removeAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
  const alpha = await maskToAlpha(det, { x: 0, y: 0, width: det.workWidth, height: det.workHeight }, rgb.info.width, rgb.info.height);
  const rgba = await joinAlpha({ data: rgb.data, width: rgb.info.width, height: rgb.info.height }, alpha);
  return sharp(rgba, { raw: { width: rgb.info.width, height: rgb.info.height, channels: 4 } }).png().toBuffer();
}
