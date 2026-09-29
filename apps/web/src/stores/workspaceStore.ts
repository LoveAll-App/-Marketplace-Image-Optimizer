import { create } from "zustand";
import { DEFAULT_OPTIONS, parseOptions, type BatchStatus, type BatchTask, type MarketplaceConfig, type OptimizeOptions, type UploadedItem } from "@moi/shared";
import { api } from "../services/api";
import { historyAdd } from "../services/db";
import { useToastStore } from "./toastStore";
import { useSettingsStore } from "./settingsStore";

export type QueuedItem = UploadedItem & { addedAt: number };

interface WorkspaceState {
  items: QueuedItem[];
  selectedMarketplaces: string[];
  options: OptimizeOptions;
  batch: BatchStatus | null;
  polling: boolean;
  uploading: boolean;
  editingItem: string | null;
  perItemOverrides: Record<string, Partial<OptimizeOptions>>;

  toggleMarketplace: (id: string) => void;
  setMarketplaces: (ids: string[]) => void;
  setOptions: (patch: Partial<OptimizeOptions>) => void;
  setItemOverride: (itemId: string, patch: Partial<OptimizeOptions> | null) => void;
  setEditingItem: (id: string | null) => void;

  addFiles: (files: File[]) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
  clearItems: () => void;

  optimize: (marketplaceConfigs: MarketplaceConfig[]) => Promise<void>;
  reprocessItem: (itemId: string, marketplaceConfigs: MarketplaceConfig[]) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  cancel: () => Promise<void>;
  retryFailed: () => Promise<void>;
  retryOne: (itemId: string) => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;
}

let pollHandle: ReturnType<typeof setInterval> | null = null;
let recordedDone = new Set<string>();

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  items: [],
  selectedMarketplaces: ["amazon", "flipkart", "meesho"],
  options: DEFAULT_OPTIONS,
  batch: null,
  polling: false,
  uploading: false,
  editingItem: null,
  perItemOverrides: {},

  toggleMarketplace: (id) =>
    set((s) => ({ selectedMarketplaces: s.selectedMarketplaces.includes(id) ? s.selectedMarketplaces.filter((m) => m !== id) : [...s.selectedMarketplaces, id] })),
  setMarketplaces: (ids) => set({ selectedMarketplaces: ids }),
  setOptions: (patch) => set((s) => ({ options: parseOptions({ ...s.options, ...patch, enhancement: { ...s.options.enhancement, ...patch.enhancement } }) })),
  setItemOverride: (itemId, patch) =>
    set((s) => {
      const next = { ...s.perItemOverrides };
      if (patch === null) delete next[itemId];
      else next[itemId] = { ...next[itemId], ...patch };
      return { perItemOverrides: next };
    }),
  setEditingItem: (id) => set({ editingItem: id }),

  addFiles: async (files) => {
    if (files.length === 0) return;
    set({ uploading: true });
    try {
      const res = await api.upload(files);
      const now = Date.now();
      set((s) => ({ items: [...s.items, ...res.items.map((i) => ({ ...i, addedAt: now }))] }));
      for (const r of res.rejected) useToastStore.getState().push("error", `${r.name}: ${r.reason}`);
      if (res.items.length) useToastStore.getState().push("success", `Added ${res.items.length} image${res.items.length > 1 ? "s" : ""}`);
    } catch (e) {
      useToastStore.getState().push("error", (e as Error).message);
    } finally {
      set({ uploading: false });
    }
  },

  removeItem: async (id) => {
    set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
    await api.removeItem(id).catch(() => {});
  },
  clearItems: () => set({ items: [], batch: null }),

  optimize: async (marketplaceConfigs) => {
    const { items, options, perItemOverrides } = get();
    if (items.length === 0 || marketplaceConfigs.length === 0) return;
    const settings = useSettingsStore.getState().settings;
    try {
      recordedDone = new Set();
      const batch = await api.process({
        items: items.map((i) => ({ id: i.id })),
        marketplaces: marketplaceConfigs,
        options,
        namingTemplate: settings.namingTemplate,
        provider: settings.processingMode === "local" ? { kind: "local" } : { kind: "removebg", apiKey: settings.removeBgApiKey, baseUrl: settings.httpProviderUrl },
      });
      set({ batch });
      // apply any per-item overrides as a follow-up patch (kept simple: a second request per overridden item)
      const overridden = Object.keys(perItemOverrides).filter((id) => items.some((i) => i.id === id));
      if (overridden.length) {
        for (const id of overridden) {
          await api.addTasks(batch.id, {
            items: [{ id }],
            marketplaces: marketplaceConfigs,
            options: parseOptions({ ...options, ...perItemOverrides[id] }),
            namingTemplate: settings.namingTemplate,
          });
        }
      }
      get().startPolling();
    } catch (e) {
      useToastStore.getState().push("error", (e as Error).message);
    }
  },

  reprocessItem: async (itemId, marketplaceConfigs) => {
    const { batch, options, perItemOverrides } = get();
    if (!batch) return;
    const settings = useSettingsStore.getState().settings;
    try {
      const updated = await api.addTasks(batch.id, {
        items: [{ id: itemId }],
        marketplaces: marketplaceConfigs,
        options: parseOptions({ ...options, ...perItemOverrides[itemId] }),
        namingTemplate: settings.namingTemplate,
      });
      set({ batch: updated });
      get().startPolling();
      useToastStore.getState().push("info", "Reprocessing with the new settings…");
    } catch (e) {
      useToastStore.getState().push("error", (e as Error).message);
    }
  },

  pause: async () => set({ batch: await api.pause(get().batch!.id) }),
  resume: async () => {
    set({ batch: await api.resume(get().batch!.id) });
    get().startPolling();
  },
  cancel: async () => set({ batch: await api.cancel(get().batch!.id) }),
  retryFailed: async () => {
    set({ batch: await api.retry(get().batch!.id) });
    get().startPolling();
  },
  retryOne: async (itemId) => {
    set({ batch: await api.retry(get().batch!.id, itemId) });
    get().startPolling();
  },

  startPolling: () => {
    if (pollHandle) return;
    set({ polling: true });
    const tick = async () => {
      const b = get().batch;
      if (!b) return stop();
      try {
        const fresh = await api.batch(b.id);
        set({ batch: fresh });
        const newlyDone = fresh.tasks.filter((t: BatchTask) => (t.state === "done" || t.state === "failed") && !recordedDone.has(t.itemId));
        if (newlyDone.length) {
          recordedDone = new Set([...recordedDone, ...newlyDone.map((t) => t.itemId)]);
          await historyAdd(
            newlyDone.map((t) => ({
              id: `${fresh.id}-${t.itemId}-${t.attempts}`,
              at: Date.now(),
              name: t.name,
              marketplaces: t.marketplaces,
              state: t.state as "done" | "failed",
              durationMs: t.durationMs,
              error: t.error?.message,
              outputs: t.outputs.map((o) => ({ marketplace: o.marketplace, width: o.metadata.width, height: o.metadata.height, size: o.metadata.fileSize, format: o.metadata.format, ready: o.validation.ready, warnings: o.validation.warnings.length })),
              failures: t.failures.map((f) => ({ marketplace: f.marketplace, message: f.message })),
            })),
          );
        }
        if (fresh.finished) stop();
      } catch {
        /* transient network hiccup — keep polling */
      }
    };
    const stop = () => {
      if (pollHandle) clearInterval(pollHandle);
      pollHandle = null;
      set({ polling: false });
    };
    pollHandle = setInterval(tick, 700);
    void tick();
  },
  stopPolling: () => {
    if (pollHandle) clearInterval(pollHandle);
    pollHandle = null;
    set({ polling: false });
  },
}));
