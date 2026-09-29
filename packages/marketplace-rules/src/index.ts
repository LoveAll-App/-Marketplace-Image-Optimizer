import type { MarketplaceConfig, ValidationRule } from "@moi/shared";
import { marketplaceConfigSchema } from "@moi/shared";
import { BUILTIN_MARKETPLACES, BUILTIN_RULES } from "../../../marketplace";

export { BUILTIN_MARKETPLACES, BUILTIN_RULES };

export function getBuiltinMarketplace(id: string): MarketplaceConfig | undefined {
  return BUILTIN_MARKETPLACES.find((m) => m.id === id);
}

/** Rules attached to a marketplace module. Custom (JSON) profiles only get the generic rules. */
export function getRules(id: string): ValidationRule[] {
  return BUILTIN_RULES[id] ?? [];
}

/** Resolve an id against built-ins first, then custom profiles. */
export function resolveMarketplace(id: string, custom: MarketplaceConfig[] = []): MarketplaceConfig | undefined {
  return getBuiltinMarketplace(id) ?? custom.find((m) => m.id === id);
}

/** Validates + normalises a user-supplied profile. Throws a ZodError on bad input. */
export function parseMarketplaceConfig(input: unknown): MarketplaceConfig {
  return marketplaceConfigSchema.parse(input) as MarketplaceConfig;
}

/** Parse a comma list ("amazon,flipkart" or "all") into configs. */
export function selectMarketplaces(spec: string, custom: MarketplaceConfig[] = []): MarketplaceConfig[] {
  const all = [...BUILTIN_MARKETPLACES, ...custom];
  const ids = spec.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (ids.length === 0) throw new Error("No marketplace specified");
  if (ids.includes("all")) return all;
  return ids.map((id) => {
    const found = all.find((m) => m.id === id);
    if (!found) throw new Error(`Unknown marketplace "${id}". Available: ${all.map((m) => m.id).join(", ")}`);
    return found;
  });
}
