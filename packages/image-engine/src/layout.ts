import { parseRatio, type AspectRatioChoice, type MarketplaceConfig, type PositionMode } from "@moi/shared";

export interface Size {
  width: number;
  height: number;
}

export interface Placement {
  scale: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Fill actually applied (max relative dimension, %) */
  appliedFillPercent: number;
  marginPx: number;
}

/** Pick the aspect ratio (w/h) for a given choice. "auto" snaps to the closest allowed ratio. */
export function resolveAspectRatio(
  choice: AspectRatioChoice,
  customAspect: string,
  productAspect: number,
  config: Pick<MarketplaceConfig, "aspectRatios">,
): number {
  if (choice === "custom") return parseRatio(customAspect) ?? 1;
  if (choice !== "auto") return parseRatio(choice) ?? 1;
  const candidates = (config.aspectRatios ?? ["1:1"]).map(parseRatio).filter((r): r is number => r !== null);
  if (candidates.length === 0) return 1;
  let best = candidates[0]!;
  for (const c of candidates) {
    if (Math.abs(Math.log(c / productAspect)) < Math.abs(Math.log(best / productAspect))) best = c;
  }
  return best;
}

/** Canvas size for a ratio: longest side = targetSize, then clamp into the marketplace's min/max. */
export function computeCanvas(
  ratio: number,
  targetSize: number,
  limits: Pick<MarketplaceConfig, "minWidth" | "minHeight" | "maxWidth" | "maxHeight">,
): Size {
  let w = ratio >= 1 ? targetSize : targetSize * ratio;
  let h = ratio >= 1 ? targetSize / ratio : targetSize;
  const up = Math.max(limits.minWidth ? limits.minWidth / w : 1, limits.minHeight ? limits.minHeight / h : 1, 1);
  w *= up;
  h *= up;
  const down = Math.min(limits.maxWidth ? limits.maxWidth / w : 1, limits.maxHeight ? limits.maxHeight / h : 1, 1);
  w *= down;
  h *= down;
  return { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) };
}

/**
 * Place a product of the given size on a canvas. The product keeps its aspect ratio
 * (uniform scale only) and never gets closer than the safe margin to any edge.
 * Fill = the product's longest relative dimension, as % of the matching canvas dimension.
 */
export function computePlacement(args: {
  canvas: Size;
  product: Size;
  fillPercent: number;
  safeMarginPercent: number;
  position: PositionMode;
  customPosition?: { x: number; y: number };
}): Placement {
  const { canvas, product } = args;
  const marginPx = Math.max(2, Math.round((Math.min(canvas.width, canvas.height) * args.safeMarginPercent) / 100));
  const availW = Math.max(1, canvas.width - 2 * marginPx);
  const availH = Math.max(1, canvas.height - 2 * marginPx);
  const wanted = Math.min(Math.max(args.fillPercent, 1), 100) / 100;

  // scale so the product's larger relative dimension equals `wanted`, capped by the safe area
  const scaleWanted = wanted * Math.min(canvas.width / product.width, canvas.height / product.height);
  const scaleMax = Math.min(availW / product.width, availH / product.height);
  const scale = Math.min(scaleWanted, scaleMax);

  const width = Math.max(1, Math.min(availW, Math.round(product.width * scale)));
  const height = Math.max(1, Math.min(availH, Math.round(product.height * scale)));

  const slackX = canvas.width - 2 * marginPx - width;
  const slackY = canvas.height - 2 * marginPx - height;
  let fx = 0.5;
  let fy = 0.5;
  switch (args.position) {
    case "top": fy = 0; break;
    case "bottom": fy = 1; break;
    case "left": fx = 0; break;
    case "right": fx = 1; break;
    case "custom":
      fx = clamp01(args.customPosition?.x ?? 0.5);
      fy = clamp01(args.customPosition?.y ?? 0.5);
      break;
    default: break;
  }
  const x = Math.round(marginPx + slackX * fx);
  const y = Math.round(marginPx + slackY * fy);
  const appliedFillPercent = Math.max(width / canvas.width, height / canvas.height) * 100;
  return { scale: width / product.width, x, y, width, height, appliedFillPercent, marginPx };
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function orientation(w: number, h: number): "portrait" | "landscape" | "square" {
  const r = w / h;
  if (r > 1.05) return "landscape";
  if (r < 0.95) return "portrait";
  return "square";
}
