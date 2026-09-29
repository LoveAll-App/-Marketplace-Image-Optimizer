import sharp from "sharp";
import type { OutputFormat } from "@moi/shared";

export interface EncodeArgs {
  data: Buffer;
  width: number;
  height: number;
  channels: 3 | 4;
  format: OutputFormat;
  quality: number;
  maxBytes?: number;
  /** Never shrink below these when trying to fit a size limit */
  minWidth?: number;
  minHeight?: number;
  minQuality?: number;
}

export interface EncodeResult {
  buffer: Buffer;
  quality: number;
  width: number;
  height: number;
  fitsLimit: boolean;
  notes: string[];
}

function encodeOnce(src: sharp.Sharp, format: OutputFormat, quality: number, palette = false): Promise<Buffer> {
  switch (format) {
    case "jpeg":
      return src.jpeg({ quality, mozjpeg: true, chromaSubsampling: quality >= 95 ? "4:4:4" : "4:2:0" }).toBuffer();
    case "webp":
      return src.webp({ quality, effort: 4 }).toBuffer();
    case "png":
      return src.png({ compressionLevel: 9, adaptiveFiltering: true, palette, quality: palette ? 90 : undefined }).toBuffer();
  }
}

const rawSource = (a: Pick<EncodeArgs, "data" | "width" | "height" | "channels">) => sharp(a.data, { raw: { width: a.width, height: a.height, channels: a.channels } });

/**
 * Encode at the requested quality; if a file-size limit is set, search for the highest quality
 * that fits, then (only if needed) shrink dimensions in small steps — never below the profile minimum.
 */
export async function encodeImage(args: EncodeArgs): Promise<EncodeResult> {
  const notes: string[] = [];
  const { format, maxBytes } = args;
  const minQ = args.minQuality ?? 50;
  let quality = Math.round(args.quality);
  let buffer = await encodeOnce(rawSource(args), format, quality);
  if (!maxBytes || buffer.length <= maxBytes) return { buffer, quality, width: args.width, height: args.height, fitsLimit: true, notes };

  if (format !== "png") {
    let lo = minQ, hi = quality - 1, best: { q: number; buf: Buffer } | null = null;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const b = await encodeOnce(rawSource(args), format, mid);
      if (b.length <= maxBytes) { best = { q: mid, buf: b }; lo = mid + 1; } else hi = mid - 1;
    }
    if (best) {
      notes.push(`Quality lowered from ${quality} to ${best.q} to meet the file-size limit`);
      return { buffer: best.buf, quality: best.q, width: args.width, height: args.height, fitsLimit: true, notes };
    }
    quality = minQ;
    buffer = await encodeOnce(rawSource(args), format, quality);
  } else {
    const p = await encodeOnce(rawSource(args), format, quality, true);
    if (p.length <= maxBytes) {
      notes.push("PNG palette quantisation used to meet the file-size limit");
      return { buffer: p, quality, width: args.width, height: args.height, fitsLimit: true, notes };
    }
  }

  // shrink in 8% steps, staying at or above the profile minimum dimensions
  let w = args.width, h = args.height;
  for (let i = 0; i < 12; i++) {
    const nw = Math.round(w * 0.92), nh = Math.round(h * 0.92);
    if ((args.minWidth && nw < args.minWidth) || (args.minHeight && nh < args.minHeight)) break;
    w = nw; h = nh;
    const src = rawSource(args).resize(w, h, { kernel: "lanczos3", fit: "fill" });
    buffer = await encodeOnce(src, format, quality, format === "png");
    if (buffer.length <= maxBytes) {
      notes.push(`Dimensions reduced to ${w}×${h} to meet the file-size limit`);
      return { buffer, quality, width: w, height: h, fitsLimit: true, notes };
    }
  }
  return { buffer, quality, width: w, height: h, fitsLimit: false, notes };
}
