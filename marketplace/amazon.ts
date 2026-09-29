import type { MarketplaceConfig, ValidationRule } from "@moi/shared";

/**
 * Amazon India — editable defaults. Marketplace requirements change; verify against
 * the current Seller Central image guidelines and adjust here (or in the Profiles page).
 */
export const amazon: MarketplaceConfig = {
  id: "amazon",
  name: "Amazon India",
  supportedFormats: ["jpeg", "png", "tiff", "gif"],
  minWidth: 1000,
  minHeight: 1000,
  maxWidth: 10000,
  maxHeight: 10000,
  maxFileSizeMB: 10,
  aspectRatios: ["1:1"],
  backgroundMode: "white",
  jpegQuality: 90,
  recommendedProductFillPercent: 85,
  minProductFillPercent: 75,
  defaultFormat: "jpeg",
  targetSize: 2000,
  safeMarginPercent: 3,
  notes: "Main image: pure-white background, product fills most of the frame.",
  builtin: true,
};

export const amazonRules: ValidationRule[] = [
  {
    id: "amazon-white-background",
    label: "White background",
    check(input) {
      if (input.requestedBackground !== "white" || !input.edgeColor) return null;
      const { r, g, b } = input.edgeColor;
      return r >= 253 && g >= 253 && b >= 253
        ? { status: "pass" }
        : { status: "warn", message: `Frame is not pure white (rgb ${r},${g},${b}) — a white main image is usually expected` };
    },
  },
  {
    id: "amazon-no-alpha",
    label: "No transparency",
    check(input) {
      return input.hasAlpha ? { status: "warn", message: "Image has an alpha channel; a flat image is usually expected for main images" } : { status: "pass" };
    },
  },
];
