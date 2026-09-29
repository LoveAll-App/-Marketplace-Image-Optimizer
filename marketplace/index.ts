import type { MarketplaceConfig, ValidationRule } from "@moi/shared";
import { amazon, amazonRules } from "./amazon";
import { flipkart, flipkartRules } from "./flipkart";
import { meesho, meeshoRules } from "./meesho";
import { universal, universalRules } from "./universal";

/**
 * To add a marketplace (Myntra, Etsy, …): create marketplace/<id>.ts exporting a config
 * (and optional rules), then add one line here. The image engine needs no changes.
 */
export const BUILTIN_MARKETPLACES: MarketplaceConfig[] = [amazon, flipkart, meesho, universal];

export const BUILTIN_RULES: Record<string, ValidationRule[]> = {
  amazon: amazonRules,
  flipkart: flipkartRules,
  meesho: meeshoRules,
  universal: universalRules,
};

export { amazon, flipkart, meesho, universal };
