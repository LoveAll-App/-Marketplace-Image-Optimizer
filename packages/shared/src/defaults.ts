import type { EnhancementSettings, OptimizeOptions } from "./types";

export const ENHANCEMENT_PRESETS: Record<"off" | "standard" | "high", EnhancementSettings> = {
  off: { level: "off", sharpness: 0, brightness: 0, contrast: 0, saturation: 0, exposure: 0, noiseReduction: 0, detail: 0, upscale: false },
  standard: { level: "standard", sharpness: 30, brightness: 0, contrast: 0, saturation: 0, exposure: 0, noiseReduction: 10, detail: 0, upscale: false },
  high: { level: "high", sharpness: 45, brightness: 0, contrast: 4, saturation: 0, exposure: 0, noiseReduction: 15, detail: 25, upscale: true },
};

export const DEFAULT_OPTIONS: OptimizeOptions = {
  background: "auto",
  customBackground: "#FFFFFF",
  aspectRatio: "auto",
  customAspect: "1:1",
  productFill: "auto",
  position: "center",
  customPosition: { x: 0.5, y: 0.5 },
  format: "auto",
  quality: "auto",
  enhancement: { ...ENHANCEMENT_PRESETS.standard },
  processingMode: "local",
  allowExternal: false,
};

export const PRODUCT_FILL_STEPS = [50, 55, 60, 65, 70, 75, 80, 85, 90] as const;
export const ASPECT_RATIO_CHOICES = ["auto", "1:1", "4:5", "3:4", "16:9", "custom"] as const;
