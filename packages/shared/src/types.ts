export type OutputFormat = "jpeg" | "png" | "webp";
export type BackgroundMode = "white" | "transparent" | "original";
export type BackgroundChoice = "auto" | "white" | "transparent" | "original" | "custom";
export type PositionMode = "center" | "top" | "bottom" | "left" | "right" | "custom";
export type AspectRatioChoice = "auto" | "1:1" | "4:5" | "3:4" | "16:9" | "custom";
export type EnhancementLevel = "off" | "standard" | "high";
export type ProcessingMode = "local" | "ai" | "hybrid";

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RGB {
  r: number;
  g: number;
  b: number;
}

/**
 * Everything a marketplace needs to describe itself. Pure data (JSON-serialisable) so
 * custom profiles can be created and stored from the UI. Values are editable defaults —
 * verify them against the marketplace's current seller guidelines.
 */
export interface MarketplaceConfig {
  id: string;
  name: string;
  supportedFormats: string[];
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  maxFileSizeMB?: number;
  aspectRatios?: string[];
  backgroundMode: BackgroundMode;
  jpegQuality: number;
  recommendedProductFillPercent?: number;
  /** Extra fields (all optional in stored JSON, filled by defaults) */
  defaultFormat: OutputFormat;
  /** Longest side of the generated canvas in px */
  targetSize: number;
  /** Minimum gap between product and canvas edge, % of the shorter canvas side */
  safeMarginPercent: number;
  minProductFillPercent?: number;
  maxProductFillPercent?: number;
  notes?: string;
  builtin?: boolean;
}

export interface EnhancementSettings {
  level: EnhancementLevel;
  /** 0..100 */
  sharpness: number;
  /** -50..50 */
  brightness: number;
  /** -50..50 */
  contrast: number;
  /** -50..50 */
  saturation: number;
  /** -100..100 (±0.5 EV) */
  exposure: number;
  /** 0..100 */
  noiseReduction: number;
  /** 0..100 local-contrast detail */
  detail: number;
  upscale: boolean;
}

export interface OptimizeOptions {
  background: BackgroundChoice;
  customBackground: string;
  aspectRatio: AspectRatioChoice;
  customAspect: string;
  /** 50..90, or "auto" to use the marketplace's recommended fill */
  productFill: number | "auto";
  position: PositionMode;
  customPosition: { x: number; y: number };
  format: "auto" | OutputFormat;
  /** 50..100 or "auto" (marketplace quality) */
  quality: number | "auto";
  enhancement: EnhancementSettings;
  processingMode: ProcessingMode;
  /** Explicit permission to send the image to an external AI provider */
  allowExternal: boolean;
  /** Override the marketplace target size (longest side, px) */
  targetSize?: number;
}

export type Stage =
  | "upload"
  | "analysis"
  | "detection"
  | "background-detection"
  | "background-removal"
  | "isolation"
  | "cropping"
  | "centering"
  | "padding"
  | "background-generation"
  | "enhancement"
  | "resize"
  | "compression"
  | "validation"
  | "preview"
  | "download";

// ---------- validation ----------

export type CheckStatus = "pass" | "warn" | "fail";

export interface ValidationCheck {
  id: string;
  label: string;
  status: CheckStatus;
  message?: string;
}

export interface ValidationMetadata {
  width: number;
  height: number;
  format: string;
  fileSize: number;
  aspectRatio: number;
  productFill: number;
}

export interface ValidationResult {
  valid: boolean;
  /** valid and no warnings */
  ready: boolean;
  warnings: string[];
  errors: string[];
  checks: ValidationCheck[];
  metadata: ValidationMetadata;
  /** Always the honest wording — never a compliance claim */
  disclaimer: string;
}

/** Facts measured from a produced image; input to the pure validation engine. */
export interface ValidationInput {
  readable: boolean;
  width: number;
  height: number;
  format: string;
  fileSize: number;
  hasAlpha: boolean;
  /** Product box inside the output canvas, if known */
  productBox?: Box;
  /** Sampled average colour of the outer frame */
  edgeColor?: RGB;
  requestedBackground?: BackgroundMode | "custom";
}

export interface ValidationRule {
  id: string;
  label: string;
  /** Return null when the rule does not apply. */
  check(input: ValidationInput, config: MarketplaceConfig): { status: CheckStatus; message?: string } | null;
}

export const VALIDATION_DISCLAIMER = "Validated against your configured marketplace profile.";

// ---------- metadata ----------

export interface ImageMetadata {
  width: number;
  height: number;
  format: string;
  fileSize: number;
  quality?: number;
  hasAlpha?: boolean;
}

export interface ProductAnalysis {
  bbox: Box;
  width: number;
  height: number;
  center: { x: number; y: number };
  orientation: "portrait" | "landscape" | "square";
  /** Longest relative dimension of the product in the source frame, % */
  fillPercent: number;
  /** Product bounding-box area / frame area, % */
  areaPercent: number;
  backgroundKind: "transparent" | "solid" | "complex";
  backgroundColor: RGB;
  backgroundAreaPercent: number;
  fullFrame: boolean;
}

export interface OptimizeSuccess {
  success: true;
  marketplace: string;
  outputPath?: string;
  metadata: ImageMetadata;
  validation: ValidationResult;
  analysis: ProductAnalysis;
  warnings: string[];
  /** Encoded image bytes (present unless the caller asked for file output only) */
  buffer?: Buffer;
}

export interface OptimizeFailure {
  success: false;
  marketplace: string;
  error: { code: string; message: string };
}

export type OptimizeResult = OptimizeSuccess | OptimizeFailure;
