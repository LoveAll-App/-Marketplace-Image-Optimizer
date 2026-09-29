import { z } from "zod";
import { DEFAULT_OPTIONS } from "./defaults";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Expected #RRGGBB");
const ratioString = z.string().regex(/^\d+(\.\d+)?\s*[:x/]\s*\d+(\.\d+)?$|^\d+(\.\d+)?$/, "Expected W:H");

export const enhancementSchema = z.object({
  level: z.enum(["off", "standard", "high"]),
  sharpness: z.number().min(0).max(100),
  brightness: z.number().min(-50).max(50),
  contrast: z.number().min(-50).max(50),
  saturation: z.number().min(-50).max(50),
  exposure: z.number().min(-100).max(100),
  noiseReduction: z.number().min(0).max(100),
  detail: z.number().min(0).max(100),
  upscale: z.boolean(),
});

export const optionsSchema = z.object({
  background: z.enum(["auto", "white", "transparent", "original", "custom"]),
  customBackground: hexColor,
  aspectRatio: z.enum(["auto", "1:1", "4:5", "3:4", "16:9", "custom"]),
  customAspect: ratioString,
  productFill: z.union([z.literal("auto"), z.number().min(30).max(98)]),
  position: z.enum(["center", "top", "bottom", "left", "right", "custom"]),
  customPosition: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }),
  format: z.enum(["auto", "jpeg", "png", "webp"]),
  quality: z.union([z.literal("auto"), z.number().min(30).max(100)]),
  enhancement: enhancementSchema,
  processingMode: z.enum(["local", "ai", "hybrid"]),
  allowExternal: z.boolean(),
  targetSize: z.number().int().min(200).max(10000).optional(),
});

/** Parses partial input, filling gaps from DEFAULT_OPTIONS. */
export function parseOptions(input: unknown): z.infer<typeof optionsSchema> {
  const partial = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const merged = {
    ...DEFAULT_OPTIONS,
    ...partial,
    enhancement: { ...DEFAULT_OPTIONS.enhancement, ...((partial.enhancement as object) ?? {}) },
    customPosition: { ...DEFAULT_OPTIONS.customPosition, ...((partial.customPosition as object) ?? {}) },
  };
  return optionsSchema.parse(merged);
}

export const marketplaceConfigSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-_]{0,39}$/, "Use lowercase letters, digits, - or _"),
    name: z.string().min(1).max(60),
    supportedFormats: z.array(z.string().min(1)).min(1),
    minWidth: z.number().int().positive().optional(),
    maxWidth: z.number().int().positive().optional(),
    minHeight: z.number().int().positive().optional(),
    maxHeight: z.number().int().positive().optional(),
    maxFileSizeMB: z.number().positive().optional(),
    aspectRatios: z.array(ratioString).optional(),
    backgroundMode: z.enum(["white", "transparent", "original"]),
    jpegQuality: z.number().min(30).max(100),
    recommendedProductFillPercent: z.number().min(30).max(98).optional(),
    defaultFormat: z.enum(["jpeg", "png", "webp"]),
    targetSize: z.number().int().min(200).max(10000),
    safeMarginPercent: z.number().min(0).max(25),
    minProductFillPercent: z.number().min(0).max(100).optional(),
    maxProductFillPercent: z.number().min(0).max(100).optional(),
    notes: z.string().max(500).optional(),
    builtin: z.boolean().optional(),
  })
  .refine((c) => !c.minWidth || !c.maxWidth || c.minWidth <= c.maxWidth, { message: "minWidth > maxWidth" })
  .refine((c) => !c.minHeight || !c.maxHeight || c.minHeight <= c.maxHeight, { message: "minHeight > maxHeight" });
