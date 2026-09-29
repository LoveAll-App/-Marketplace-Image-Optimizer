import {
  VALIDATION_DISCLAIMER,
  parseRatio,
  ratiosMatch,
  type CheckStatus,
  type MarketplaceConfig,
  type ValidationCheck,
  type ValidationInput,
  type ValidationResult,
  type ValidationRule,
} from "@moi/shared";

const FORMAT_ALIASES: Record<string, string> = { jpg: "jpeg", jpe: "jpeg", tif: "tiff" };
export const normalizeFormat = (f: string): string => {
  const s = f.toLowerCase().replace(/^\./, "");
  return FORMAT_ALIASES[s] ?? s;
};

/** Product's longest relative dimension in the frame, % */
export function measureFill(input: ValidationInput): number {
  if (!input.productBox || !input.width || !input.height) return 0;
  return Math.max(input.productBox.width / input.width, input.productBox.height / input.height) * 100;
}

/**
 * Pure validation engine: facts in, verdict out. Marketplace behaviour comes from the
 * MarketplaceConfig plus optional extra rules — nothing marketplace-specific lives here.
 */
export function validate(input: ValidationInput, config: MarketplaceConfig, extraRules: ValidationRule[] = []): ValidationResult {
  const checks: ValidationCheck[] = [];
  const add = (id: string, label: string, status: CheckStatus, message?: string) => checks.push({ id, label, status, message });
  const aspectRatio = input.height ? input.width / input.height : 0;
  const productFill = measureFill(input);

  if (!input.readable) {
    add("readable", "Readable image", "fail", "Image could not be decoded (possibly corrupted)");
  } else {
    add("readable", "Readable image", "pass");

    // Resolution
    const problems: string[] = [];
    let status: CheckStatus = "pass";
    if (config.minWidth && input.width < config.minWidth) problems.push(`Width ${input.width}px is below ${config.minWidth}px`);
    if (config.minHeight && input.height < config.minHeight) problems.push(`Height ${input.height}px is below ${config.minHeight}px`);
    if (config.maxWidth && input.width > config.maxWidth) problems.push(`Width ${input.width}px exceeds ${config.maxWidth}px`);
    if (config.maxHeight && input.height > config.maxHeight) problems.push(`Height ${input.height}px exceeds ${config.maxHeight}px`);
    if (problems.length) status = "fail";
    add("resolution", "Resolution", status, problems.join("; ") || undefined);

    // Format
    const fmt = normalizeFormat(input.format);
    const supported = config.supportedFormats.map(normalizeFormat);
    add("format", "Format", supported.includes(fmt) ? "pass" : "fail", supported.includes(fmt) ? undefined : `${fmt.toUpperCase()} is not in the configured formats (${supported.join(", ")})`);

    // File size
    if (config.maxFileSizeMB) {
      const limit = config.maxFileSizeMB * 1024 * 1024;
      add("fileSize", "File size", input.fileSize <= limit ? "pass" : "warn", input.fileSize <= limit ? undefined : `File size exceeds configured limit of ${config.maxFileSizeMB} MB`);
    } else {
      add("fileSize", "File size", "pass");
    }

    // Aspect ratio
    if (config.aspectRatios?.length) {
      const ok = config.aspectRatios.some((r) => {
        const v = parseRatio(r);
        return v !== null && ratiosMatch(aspectRatio, v);
      });
      add("aspectRatio", "Aspect ratio", ok ? "pass" : "warn", ok ? undefined : `Aspect ratio ${aspectRatio.toFixed(2)} is not one of ${config.aspectRatios.join(", ")}`);
    } else {
      add("aspectRatio", "Aspect ratio", "pass");
    }

    // Product checks (only when we know where the product is)
    if (input.productBox) {
      const b = input.productBox;
      const eps = 0.5;
      const inside = b.x >= -eps && b.y >= -eps && b.x + b.width <= input.width + eps && b.y + b.height <= input.height + eps;
      add("productVisible", "Product completely visible", inside ? "pass" : "fail", inside ? undefined : "Product extends beyond the image");

      const minEdge = Math.min(b.x, b.y, input.width - (b.x + b.width), input.height - (b.y + b.height));
      const marginPct = (minEdge / Math.min(input.width, input.height)) * 100;
      const wantMargin = Math.max(config.safeMarginPercent * 0.5, 0.5);
      add("safeMargins", "Safe margins", marginPct >= wantMargin ? "pass" : "warn", marginPct >= wantMargin ? undefined : `Product is too close to the edge (${marginPct.toFixed(1)}% margin)`);

      let fillStatus: CheckStatus = "pass";
      let fillMsg: string | undefined;
      const minFill = config.minProductFillPercent ?? (config.recommendedProductFillPercent ? config.recommendedProductFillPercent - 15 : undefined);
      if (minFill !== undefined && productFill < minFill) {
        fillStatus = "warn";
        fillMsg = `Product fill ${productFill.toFixed(0)}% is below recommended range (${minFill}%+)`;
      }
      if (config.maxProductFillPercent !== undefined && productFill > config.maxProductFillPercent) {
        fillStatus = "warn";
        fillMsg = `Product fill ${productFill.toFixed(0)}% is above configured maximum (${config.maxProductFillPercent}%)`;
      }
      add("productFill", "Product fill", fillStatus, fillMsg);
      const excessive = productFill < 40;
      add("productPositioning", "Product positioning", excessive ? "warn" : "pass", excessive ? "Excessive empty space around the product" : undefined);
    }

    // Alpha channel where relevant
    if (config.backgroundMode !== "transparent" && input.hasAlpha && normalizeFormat(input.format) !== "png") {
      add("alpha", "Alpha channel", "warn", "Image contains an alpha channel");
    }

    // Marketplace-specific rules
    for (const rule of extraRules) {
      const r = rule.check(input, config);
      if (r) add(rule.id, rule.label, r.status, r.message);
    }
  }

  const errors = checks.filter((c) => c.status === "fail").map((c) => c.message ?? c.label);
  const warnings = checks.filter((c) => c.status === "warn").map((c) => c.message ?? c.label);
  const valid = errors.length === 0;
  return {
    valid,
    ready: valid && warnings.length === 0,
    errors,
    warnings,
    checks,
    metadata: { width: input.width, height: input.height, format: normalizeFormat(input.format), fileSize: input.fileSize, aspectRatio, productFill },
    disclaimer: VALIDATION_DISCLAIMER,
  };
}
