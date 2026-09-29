import type { MarketplaceConfig, ValidationRule } from "@moi/shared";

/** Meesho — editable defaults. Verify against the current Meesho supplier image guidelines. */
export const meesho: MarketplaceConfig = {
  id: "meesho",
  name: "Meesho",
  supportedFormats: ["jpeg", "png"],
  minWidth: 500,
  minHeight: 500,
  maxWidth: 4000,
  maxHeight: 4000,
  maxFileSizeMB: 5,
  aspectRatios: ["1:1", "4:5"],
  backgroundMode: "white",
  jpegQuality: 88,
  recommendedProductFillPercent: 78,
  minProductFillPercent: 60,
  defaultFormat: "jpeg",
  targetSize: 1200,
  safeMarginPercent: 4,
  notes: "Lightweight images (mobile-first shoppers); clean background, product centred.",
  builtin: true,
};

export const meeshoRules: ValidationRule[] = [
  {
    id: "meesho-lightweight",
    label: "Mobile-friendly size",
    check(input) {
      const mb = input.fileSize / 1024 / 1024;
      return mb <= 1.5 ? { status: "pass" } : { status: "warn", message: `File is ${mb.toFixed(1)} MB; smaller files load faster on mobile` };
    },
  },
];
