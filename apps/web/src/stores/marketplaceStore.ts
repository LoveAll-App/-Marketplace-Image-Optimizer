import { create } from "zustand";
import { BUILTIN_MARKETPLACES } from "@moi/marketplace-rules";
import { marketplaceConfigSchema, type MarketplaceConfig } from "@moi/shared";
import { kvGet, kvSet } from "../services/db";

interface MarketplaceState {
  custom: MarketplaceConfig[];
  /** BUILTIN_MARKETPLACES + custom, recomputed only when `custom` changes so it stays
   *  referentially stable across renders — required for `all` to be used as a selector. */
  all: MarketplaceConfig[];
  loaded: boolean;
  load: () => Promise<void>;
  save: (config: MarketplaceConfig) => { ok: true } | { ok: false; error: string };
  remove: (id: string) => void;
  get: (id: string) => MarketplaceConfig | undefined;
}

export const useMarketplaceStore = create<MarketplaceState>((set, get) => ({
  custom: [],
  all: [...BUILTIN_MARKETPLACES],
  loaded: false,
  load: async () => {
    const stored = (await kvGet<MarketplaceConfig[]>("custom-marketplaces")) ?? [];
    set({ custom: stored, all: [...BUILTIN_MARKETPLACES, ...stored], loaded: true });
  },
  save: (config) => {
    const parsed = marketplaceConfigSchema.safeParse(config);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid profile" };
    if (BUILTIN_MARKETPLACES.some((m) => m.id === config.id)) return { ok: false, error: "That id is reserved by a built-in marketplace" };
    const custom = [...get().custom.filter((m) => m.id !== config.id), parsed.data as MarketplaceConfig];
    set({ custom, all: [...BUILTIN_MARKETPLACES, ...custom] });
    void kvSet("custom-marketplaces", custom);
    return { ok: true };
  },
  remove: (id) => {
    const custom = get().custom.filter((m) => m.id !== id);
    set({ custom, all: [...BUILTIN_MARKETPLACES, ...custom] });
    void kvSet("custom-marketplaces", custom);
  },
  get: (id) => get().all.find((m) => m.id === id),
}));
