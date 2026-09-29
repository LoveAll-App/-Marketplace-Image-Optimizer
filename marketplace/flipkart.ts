import type { MarketplaceConfig, ValidationRule } from "@moi/shared";

/** Flipkart — editable defaults. Verify against the current Flipkart seller image guidelines. */
export const flipkart: MarketplaceConfig = {
  id: "flipkart",
  name: "Flipkart",
  supportedFormats: ["jpeg", "png"],
  minWidth: 500,
  minHeight: 500,
  maxWidth: 4000,
  maxHeight: 4000,
  maxFileSizeMB: 5,
  aspectRatios: ["1:1", "4:5"],
  backgroundMode: "white",
  jpegQuality: 90,
  recommendedProductFillPercent: 80,
  minProductFillPercent: 65,
  defaultFormat: "jpeg",
  targetSize: 1600,
  safeMarginPercent: 4,
  notes: "Clean white background, product clearly visible and centred.",
  builtin: true,
};

export const flipkartRules: ValidationRule[] = [
  {
    id: "flipkart-min-side",
    label: "Minimum side length",
    check(input, config) {
      const min = config.minWidth ?? 500;
      return Math.min(input.width, input.height) >= min
        ? { status: "pass" }
        : { status: "fail", message: `Shortest side is below ${min}px` };
    },
  },
];
