import type { OptimizeOptions } from "@moi/shared";
import { DEFAULT_OPTIONS } from "@moi/shared";

export interface Preset {
  id: string;
  name: string;
  builtin?: boolean;
  marketplaces: string[];
  options: Partial<OptimizeOptions>;
}

export const BUILTIN_PRESETS: Preset[] = [
  { id: "amazon-main", name: "Amazon Main Image", builtin: true, marketplaces: ["amazon"], options: { background: "white", aspectRatio: "1:1", productFill: 85, position: "center" } },
  { id: "amazon-secondary", name: "Amazon Secondary Image", builtin: true, marketplaces: ["amazon"], options: { background: "original", aspectRatio: "1:1", productFill: 75, position: "center" } },
  { id: "flipkart-product", name: "Flipkart Product Image", builtin: true, marketplaces: ["flipkart"], options: { background: "white", aspectRatio: "auto", productFill: 80, position: "center" } },
  { id: "meesho-product", name: "Meesho Product Image", builtin: true, marketplaces: ["meesho"], options: { background: "white", aspectRatio: "auto", productFill: 78, position: "center" } },
  { id: "universal", name: "Universal E-commerce", builtin: true, marketplaces: ["universal"], options: { ...DEFAULT_OPTIONS, background: "white", aspectRatio: "1:1", productFill: 80, position: "center" } },
];
