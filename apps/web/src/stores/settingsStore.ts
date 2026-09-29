import { create } from "zustand";
import { DEFAULT_OPTIONS, type BackgroundChoice, type OutputFormat, type ProcessingMode } from "@moi/shared";
import { kvGet, kvSet } from "../services/db";

export type ThemeMode = "light" | "dark" | "system";

export interface AppSettings {
  theme: ThemeMode;
  defaultMarketplace: string;
  defaultFormat: OutputFormat;
  defaultQuality: number;
  defaultBackground: BackgroundChoice;
  processingMode: ProcessingMode;
  allowExternal: boolean;
  removeBgApiKey: string;
  httpProviderUrl: string;
  namingTemplate: string;
  concurrency: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "system",
  defaultMarketplace: "universal",
  defaultFormat: DEFAULT_OPTIONS.format === "auto" ? "jpeg" : DEFAULT_OPTIONS.format,
  defaultQuality: 90,
  defaultBackground: "auto",
  processingMode: "local",
  allowExternal: false,
  removeBgApiKey: "",
  httpProviderUrl: "",
  namingTemplate: "{product}-{marketplace}",
  concurrency: 3,
};

interface SettingsState {
  settings: AppSettings;
  loaded: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<AppSettings>) => void;
}

function applyTheme(theme: ThemeMode) {
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  load: async () => {
    const stored = await kvGet<Partial<AppSettings>>("settings");
    const settings = { ...DEFAULT_SETTINGS, ...stored };
    set({ settings, loaded: true });
    applyTheme(settings.theme);
  },
  update: (patch) => {
    const settings = { ...get().settings, ...patch };
    set({ settings });
    void kvSet("settings", settings);
    if (patch.theme) applyTheme(patch.theme);
  },
}));

if (typeof matchMedia !== "undefined") {
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    const { theme } = useSettingsStore.getState().settings;
    if (theme === "system") applyTheme("system");
  });
}
