import sharp from "sharp";
import type { Box, ProductAnalysis, RGB } from "@moi/shared";
import { OptimizerError } from "./errors";
import { orientation } from "./layout";

export const WORK_SIZE = 1024;

export interface Detection {
  /** Oriented full-resolution size */
  fullWidth: number;
  fullHeight: number;
  /** Working-resolution mask (1 = product) */
  mask: Uint8Array;
  workWidth: number;
  workHeight: number;
  /** Product bbox in working coordinates [x0,x1) [y0,y1) */
  workBox: Box;
  analysis: ProductAnalysis;
  /** Input carried real transparency */
  hadAlpha: boolean;
}

export const SHARP_OPTS = { failOn: "error" as const, limitInputPixels: 400_000_000 };

/** Full size of the image after EXIF auto-orientation. */
export async function orientedSize(input: string | Buffer): Promise<{ width: number; height: number; hasAlpha: boolean; format?: string }> {
  const m = await sharp(input, SHARP_OPTS).metadata();
  const swap = (m.orientation ?? 1) >= 5;
  const width = (swap ? m.height : m.width) ?? 0;
  const height = (swap ? m.width : m.height) ?? 0;
  if (!width || !height) throw new OptimizerError("CORRUPT_IMAGE", "Image has no dimensions");
  return { width, height, hasAlpha: !!m.hasAlpha, format: m.format };
}

interface Raw {
  data: Buffer;
  w: number;
  h: number;
}

async function loadWorking(input: string | Buffer): Promise<Raw> {
  const { data, info } = await sharp(input, SHARP_OPTS)
    .rotate()
    .resize({ width: WORK_SIZE, height: WORK_SIZE, fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

const dist = (r: number, g: number, b: number, c: RGB) => Math.hypot(r - c.r, g - c.g, b - c.b);

interface Palette {
  colors: RGB[];
  weights: number[];
  sigma: number;
}

/** Dominant colours along the outer frame (quantised histogram, merged by proximity). */
function borderPalette(raw: Raw): Palette {
  const { data, w, h } = raw;
  const t = Math.max(2, Math.round(Math.min(w, h) * 0.012));
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>();
  let total = 0;
  const take = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    if (data[i + 3]! < 200) return;
    const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const e = bins.get(key);
    if (e) { e.n++; e.r += r; e.g += g; e.b += b; } else bins.set(key, { n: 1, r, g, b });
    total++;
  };
  for (let y = 0; y < h; y++) {
    const edgeRow = y < t || y >= h - t;
    if (edgeRow) for (let x = 0; x < w; x++) take(x, y);
    else {
      for (let x = 0; x < t; x++) take(x, y);
      for (let x = w - t; x < w; x++) take(x, y);
    }
  }
  const sorted = [...bins.values()].sort((a, b) => b.n - a.n);
  const clusters: { n: number; r: number; g: number; b: number }[] = [];
  for (const bin of sorted) {
    const c = { r: bin.r / bin.n, g: bin.g / bin.n, b: bin.b / bin.n };
    const host = clusters.find((k) => Math.hypot(k.r / k.n - c.r, k.g / k.n - c.g, k.b / k.n - c.b) < 40);
    if (host) { host.n += bin.n; host.r += bin.r; host.g += bin.g; host.b += bin.b; }
    else clusters.push({ ...bin });
  }
  clusters.sort((a, b) => b.n - a.n);
  const keep = clusters.filter((c, i) => i === 0 || c.n / Math.max(total, 1) >= 0.04).slice(0, 6);
  const colors = keep.map((c) => ({ r: Math.round(c.r / c.n), g: Math.round(c.g / c.n), b: Math.round(c.b / c.n) }));
  const weights = keep.map((c) => c.n / Math.max(total, 1));

  // spread of the dominant colour (for adaptive tolerance)
  let sumSq = 0, cnt = 0;
  const dom = colors[0] ?? { r: 255, g: 255, b: 255 };
  for (let x = 0; x < w; x += 3) {
    for (const y of [0, h - 1]) {
      const i = (y * w + x) * 4;
      const d = dist(data[i]!, data[i + 1]!, data[i + 2]!, dom);
      if (d < 60) { sumSq += d * d; cnt++; }
    }
  }
  const sigma = cnt ? Math.sqrt(sumSq / cnt) : 6;
  return { colors, weights, sigma };
}


/**
 * Open loops (bag handles, ring holes) are enclosed background: mark them as background too —
 * but only when they are small next to the product AND bounded by a thin wall. That keeps large
 * white product bodies and white labels on dark products intact.
 */
function punchHoles(isBg: Uint8Array, bg: Uint8Array, w: number, h: number): void {
  const n = w * h;
  const cand = new Uint8Array(n);
  let bgCount = 0;
  for (let p = 0; p < n; p++) {
    if (bg[p]) bgCount++;
    else if (isBg[p]) cand[p] = 1;
  }
  const productArea = n - bgCount;
  if (productArea === 0) return;
  // 4-connected components of enclosed background-coloured pixels
  const label = new Int32Array(n);
  const stack = new Int32Array(n);
  const comps: { pixels: number[] }[] = [];
  for (let s0 = 0; s0 < n; s0++) {
    if (!cand[s0] || label[s0]) continue;
    const pixels: number[] = [];
    let sp = 0;
    stack[sp++] = s0;
    label[s0] = comps.length + 1;
    while (sp) {
      const p = stack[--sp]!;
      pixels.push(p);
      const x = p % w;
      const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p >= w ? p - w : -1, p < n - w ? p + w : -1];
      for (const q of nb) if (q >= 0 && cand[q] && !label[q]) { label[q] = comps.length + 1; stack[sp++] = q; }
    }
    comps.push({ pixels });
  }
  if (!comps.length) return;

  // distance (through non-background pixels) from the outside background, capped
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let p = 0; p < n; p++) {
    if (bg[p]) continue;
    const x = p % w, y = (p - x) / w;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const maxWall = Math.max(3, Math.round(0.035 * Math.max(x1 - x0, y1 - y0)));
  const dist = new Int16Array(n).fill(-1);
  let frontier: number[] = [];
  for (let p = 0; p < n; p++) if (bg[p]) { dist[p] = 0; frontier.push(p); }
  for (let d = 1; d <= maxWall && frontier.length; d++) {
    const nextF: number[] = [];
    for (const p of frontier) {
      const x = p % w;
      const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p >= w ? p - w : -1, p < n - w ? p + w : -1];
      for (const q of nb) if (q >= 0 && dist[q] < 0) { dist[q] = d; nextF.push(q); }
    }
    frontier = nextF;
  }
  const minArea = Math.max(60, Math.round(n * 0.0015));
  for (const c of comps) {
    if (c.pixels.length < minArea || c.pixels.length > productArea * 0.12) continue;
    let thin = false;
    for (const p of c.pixels) if (dist[p] >= 0) { thin = true; break; }
    if (!thin) continue;
    for (const p of c.pixels) bg[p] = 1;
  }
}

interface Components {
  labels: Int32Array;
  areas: number[];
  boxes: { x0: number; y0: number; x1: number; y1: number }[];
}

/** 8-connected component labelling over a binary mask. Label 0 = background. */
function components(mask: Uint8Array, w: number, h: number): Components {
  const labels = new Int32Array(w * h);
  const areas: number[] = [0];
  const boxes = [{ x0: 0, y0: 0, x1: 0, y1: 0 }];
  const stack = new Int32Array(w * h);
  let next = 1;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start]) continue;
    let sp = 0;
    stack[sp++] = start;
    labels[start] = next;
    let area = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
    while (sp) {
      const p = stack[--sp]!;
      const px = p % w, py = (p - px) / w;
      area++;
      if (px < x0) x0 = px; if (px >= x1) x1 = px + 1;
      if (py < y0) y0 = py; if (py >= y1) y1 = py + 1;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = py + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx;
          if (nx < 0 || nx >= w) continue;
          const q = ny * w + nx;
          if (mask[q] && !labels[q]) { labels[q] = next; stack[sp++] = q; }
        }
      }
    }
    areas.push(area);
    boxes.push({ x0, y0, x1, y1 });
    next++;
  }
  return { labels, areas, boxes };
}

/** Keep the main product plus plausible accessories (straps, cables, sibling parts). */
function keepProductComponents(mask: Uint8Array, w: number, h: number): { mask: Uint8Array; box: Box; area: number } | null {
  const { labels, areas, boxes } = components(mask, w, h);
  if (areas.length <= 1) return null;
  let main = 1;
  for (let i = 2; i < areas.length; i++) if (areas[i]! > areas[main]!) main = i;
  const mb = boxes[main]!;
  const padX = (mb.x1 - mb.x0) * 0.15, padY = (mb.y1 - mb.y0) * 0.15;
  const keep = new Uint8Array(areas.length);
  const speck = w * h * 0.00008;
  for (let i = 1; i < areas.length; i++) {
    const b = boxes[i]!;
    const near = b.x1 >= mb.x0 - padX && b.x0 <= mb.x1 + padX && b.y1 >= mb.y0 - padY && b.y0 <= mb.y1 + padY;
    if (i === main || areas[i]! >= areas[main]! * 0.03 || (near && areas[i]! >= speck)) keep[i] = 1;
  }
  const out = new Uint8Array(mask.length);
  let x0 = w, y0 = h, x1 = 0, y1 = 0, area = 0;
  for (let i = 1; i < areas.length; i++) {
    if (!keep[i]) continue;
    const b = boxes[i]!;
    x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1);
    area += areas[i]!;
  }
  for (let p = 0; p < labels.length; p++) if (labels[p] && keep[labels[p]!]) out[p] = 1;
  return { mask: out, box: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }, area };
}

/**
 * Detect the main product: figure out what the background is, flood-fill it from the frame
 * inward, and treat everything that is not background as product. Enclosed regions that match
 * the background colour stay part of the product on purpose — that protects white products on
 * white backgrounds, logos, and small details.
 */
export async function detectProduct(input: string | Buffer): Promise<Detection> {
  const full = await orientedSize(input);
  const raw = await loadWorking(input);
  const { data, w, h } = raw;
  const n = w * h;

  let alphaPixels = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i]! < 250) alphaPixels++;
  const hadAlpha = alphaPixels / n > 0.01;

  let mask: Uint8Array = new Uint8Array(n);
  let backgroundKind: ProductAnalysis["backgroundKind"];
  let backgroundColor: RGB = { r: 255, g: 255, b: 255 };

  if (hadAlpha) {
    backgroundKind = "transparent";
    for (let p = 0; p < n; p++) mask[p] = data[p * 4 + 3]! >= 24 ? 1 : 0;
  } else {
    const pal = borderPalette(raw);
    backgroundColor = pal.colors[0] ?? backgroundColor;
    backgroundKind = pal.weights[0]! >= 0.8 && pal.sigma < 14 ? "solid" : "complex";
    const tol = backgroundKind === "solid" ? Math.min(46, Math.max(22, pal.sigma * 3 + 14)) : 36;
    const isBg = new Uint8Array(n);
    for (let p = 0; p < n; p++) {
      const i = p * 4;
      const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
      for (const c of pal.colors) {
        if (dist(r, g, b, c) <= tol) { isBg[p] = 1; break; }
      }
    }
    // flood fill from every border pixel that looks like background
    const bg = new Uint8Array(n);
    const stack = new Int32Array(n);
    let sp = 0;
    const seed = (p: number) => { if (isBg[p] && !bg[p]) { bg[p] = 1; stack[sp++] = p; } };
    for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
    while (sp) {
      const p = stack[--sp]!;
      const x = p % w;
      if (x > 0) seed(p - 1);
      if (x < w - 1) seed(p + 1);
      if (p >= w) seed(p - w);
      if (p < n - w) seed(p + w);
    }
    punchHoles(isBg, bg, w, h);
    // peel one fringe layer: edge pixels that are only slightly off the background colour
    const peel = new Uint8Array(bg);
    const loose = tol * 1.5;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const p = y * w + x;
        if (bg[p]) continue;
        if (bg[p - 1] || bg[p + 1] || bg[p - w] || bg[p + w]) {
          const i = p * 4;
          const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
          for (const c of pal.colors) if (dist(r, g, b, c) <= loose) { peel[p] = 1; break; }
        }
      }
    }
    for (let p = 0; p < n; p++) mask[p] = peel[p] ? 0 : 1;
  }

  const kept = keepProductComponents(mask, w, h);
  const areaFrac = kept ? kept.area / n : 0;
  if (!kept || areaFrac < 0.003) {
    throw new OptimizerError("PRODUCT_NOT_DETECTED", "Product could not be detected");
  }
  mask = kept.mask;
  const workBox = kept.box;
  const fullFrame = workBox.width >= w * 0.985 && workBox.height >= h * 0.985 && areaFrac > 0.9;

  const sx = full.width / w, sy = full.height / h;
  const bbox: Box = {
    x: Math.round(workBox.x * sx),
    y: Math.round(workBox.y * sy),
    width: Math.max(1, Math.round(workBox.width * sx)),
    height: Math.max(1, Math.round(workBox.height * sy)),
  };
  bbox.width = Math.min(bbox.width, full.width - bbox.x);
  bbox.height = Math.min(bbox.height, full.height - bbox.y);

  const analysis: ProductAnalysis = {
    bbox,
    width: bbox.width,
    height: bbox.height,
    center: { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 },
    orientation: orientation(bbox.width, bbox.height),
    fillPercent: Math.max(bbox.width / full.width, bbox.height / full.height) * 100,
    areaPercent: ((bbox.width * bbox.height) / (full.width * full.height)) * 100,
    backgroundKind,
    backgroundColor,
    backgroundAreaPercent: (1 - areaFrac) * 100,
    fullFrame,
  };
  return { fullWidth: full.width, fullHeight: full.height, mask, workWidth: w, workHeight: h, workBox, analysis, hadAlpha };
}
