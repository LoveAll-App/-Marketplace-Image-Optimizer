import { useMemo, useState } from "react";
import { Dropzone } from "../components/Dropzone";
import { MarketplacePicker } from "../components/MarketplacePicker";
import { OptionsPanel } from "../components/OptionsPanel";
import { ImageCard } from "../components/ImageCard";
import { EmptyState } from "../components/EmptyState";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Icon } from "../components/Icon";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useMarketplaceStore } from "../stores/marketplaceStore";
import { usePresetStore } from "../stores/presetStore";
import { TaskCard } from "../components/TaskCard";
import { api } from "../services/api";

export function Optimizer() {
  const { items, selectedMarketplaces, options, batch, uploading, addFiles, removeItem, toggleMarketplace, setOptions, optimize, pause, resume, cancel, retryFailed, retryOne, reprocessItem, clearItems } = useWorkspaceStore();
  const marketplaces = useMarketplaceStore((s) => s.all);
  const presets = usePresetStore((s) => s.all);
  const [confirmClear, setConfirmClear] = useState(false);

  const selectedConfigs = useMemo(() => marketplaces.filter((m) => selectedMarketplaces.includes(m.id)), [marketplaces, selectedMarketplaces]);
  const canOptimize = items.length > 0 && selectedConfigs.length > 0 && (!batch || batch.finished);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Marketplace Image Optimizer</h1>
          <p className="text-sm text-(--color-muted)">Upload your product images and prepare them for every marketplace at once.</p>
        </div>
        {items.length > 0 && (
          <button onClick={() => setConfirmClear(true)} className="flex items-center gap-1.5 rounded-lg border border-(--color-line) px-3 py-1.5 text-sm font-medium hover:bg-(--color-surface-2)">
            <Icon name="trash" className="h-4 w-4" /> Clear all
          </button>
        )}
      </div>

      <Dropzone onFiles={addFiles} busy={uploading} />

      {items.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {items.map((it) => (
            <ImageCard key={it.id} item={it} onRemove={() => removeItem(it.id)} />
          ))}
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-5 rounded-2xl border border-(--color-line) bg-(--color-surface) p-4">
          <div>
            <h2 className="mb-2 text-sm font-semibold">Marketplace</h2>
            <MarketplacePicker marketplaces={marketplaces} selected={selectedMarketplaces} onToggle={toggleMarketplace} />
          </div>

          {presets.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold">Presets</h2>
              <div className="flex flex-wrap gap-2">
                {presets.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { useWorkspaceStore.getState().setMarketplaces(p.marketplaces); setOptions(p.options); }}
                    className="rounded-lg border border-(--color-line) px-3 py-1.5 text-xs font-medium hover:bg-(--color-surface-2)"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            disabled={!canOptimize}
            onClick={() => optimize(selectedConfigs)}
            className="w-full rounded-xl bg-(--color-accent) py-3 text-sm font-semibold text-(--color-accent-fg) transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            Optimize Images
          </button>
          {batch && !batch.finished && (
            <div className="flex gap-2">
              <button onClick={() => (batch.paused ? resume() : pause())} className="flex-1 rounded-lg border border-(--color-line) py-2 text-sm font-medium hover:bg-(--color-surface-2)">
                {batch.paused ? "Resume" : "Pause"}
              </button>
              <button onClick={cancel} className="flex-1 rounded-lg border border-(--color-line) py-2 text-sm font-medium text-(--color-bad) hover:bg-(--color-bad-soft)">
                Cancel
              </button>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-(--color-line) bg-(--color-surface) p-4">
          <h2 className="mb-3 text-sm font-semibold">Image Editor</h2>
          <OptionsPanel options={options} onChange={setOptions} />
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Results</h2>
          {batch && batch.done > 0 && (
            <a href={api.zipUrl(batch.id)} className="flex items-center gap-1.5 rounded-lg bg-(--color-accent) px-3 py-1.5 text-xs font-semibold text-(--color-accent-fg) hover:opacity-90">
              <Icon name="zip" className="h-3.5 w-3.5" /> Download All (ZIP)
            </a>
          )}
          {batch && batch.failed > 0 && (
            <button onClick={retryFailed} className="flex items-center gap-1.5 rounded-lg border border-(--color-line) px-3 py-1.5 text-xs font-medium hover:bg-(--color-surface-2)">
              <Icon name="retry" className="h-3.5 w-3.5" /> Retry all failed
            </button>
          )}
        </div>
        {!batch ? (
          <EmptyState icon="optimizer" title="Nothing processed yet" hint="Upload images, pick your marketplaces and press Optimize Images." />
        ) : (
          <>
            <div className="mb-3 flex items-center gap-3 text-sm text-(--color-muted)">
              <span>
                Processed: {batch.done + batch.failed} / {batch.total}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-(--color-surface-2)">
                <div className="h-full rounded-full bg-(--color-accent) transition-[width]" style={{ width: `${((batch.done + batch.failed) / Math.max(1, batch.total)) * 100}%` }} />
              </div>
            </div>
            <div className="space-y-3">
              {batch.tasks.map((t) => (
                <TaskCard key={t.itemId} task={t} batchId={batch.id} onRetry={() => retryOne(t.itemId)} onReprocess={() => reprocessItem(t.itemId, selectedConfigs)} />
              ))}
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="Clear all images"
        message="This removes every uploaded image and result from this session. Downloaded files are not affected."
        confirmLabel="Clear all"
        danger
        onConfirm={() => { setConfirmClear(false); clearItems(); }}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}
