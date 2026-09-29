import { create } from "zustand";
import { BUILTIN_PRESETS, type Preset } from "../utils/presets";
import { kvGet, kvSet } from "../services/db";

interface PresetState {
  custom: Preset[];
  /** BUILTIN_PRESETS + custom, kept referentially stable so it can be used as a selector. */
  all: Preset[];
  loaded: boolean;
  load: () => Promise<void>;
  save: (preset: Omit<Preset, "builtin">) => void;
  remove: (id: string) => void;
}

export const usePresetStore = create<PresetState>((set, get) => ({
  custom: [],
  all: [...BUILTIN_PRESETS],
  loaded: false,
  load: async () => {
    const custom = (await kvGet<Preset[]>("custom-presets")) ?? [];
    set({ custom, all: [...BUILTIN_PRESETS, ...custom], loaded: true });
  },
  save: (preset) => {
    const custom = [...get().custom.filter((p) => p.id !== preset.id), preset];
    set({ custom, all: [...BUILTIN_PRESETS, ...custom] });
    void kvSet("custom-presets", custom);
  },
  remove: (id) => {
    const custom = get().custom.filter((p) => p.id !== id);
    set({ custom, all: [...BUILTIN_PRESETS, ...custom] });
    void kvSet("custom-presets", custom);
  },
}));
