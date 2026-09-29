import type { MarketplaceConfig, ValidationRule } from "@moi/shared";

/** Universal — a high-quality general-purpose e-commerce image. */
export const universal: MarketplaceConfig = {
  id: "universal",
  name: "Universal",
  supportedFormats: ["jpeg", "png", "webp"],
  minWidth: 800,
  minHeight: 800,
  maxWidth: 8000,
  maxHeight: 8000,
  maxFileSizeMB: 10,
  aspectRatios: ["1:1"],
  backgroundMode: "white",
  jpegQuality: 92,
  recommendedProductFillPercent: 80,
  minProductFillPercent: 60,
  defaultFormat: "jpeg",
  targetSize: 1600,
  safeMarginPercent: 4,
  notes: "Square, white background, centred product with safe padding.",
  builtin: true,
};

export const universalRules: ValidationRule[] = [];
