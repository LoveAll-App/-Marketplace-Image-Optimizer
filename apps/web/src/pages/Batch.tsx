import { useMemo } from "react";
import { Dropzone } from "../components/Dropzone";
import { MarketplacePicker } from "../components/MarketplacePicker";
import { TaskCard } from "../components/TaskCard";
import { EmptyState } from "../components/EmptyState";
import { Icon } from "../components/Icon";
import { ProgressBar } from "../components/Progress";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useMarketplaceStore } from "../stores/marketplaceStore";
import { useSettingsStore } from "../stores/settingsStore";
import { api } from "../services/api";

export function Batch() {
  const { items, selectedMarketplaces, batch, uploading, addFiles, toggleMarketplace, optimize, pause, resume, cancel, retryFailed, retryOne, reprocessItem } = useWorkspaceStore();
  const marketplaces = useMarketplaceStore((s) => s.all);
  const { settings, update } = useSettingsStore();
  const selectedConfigs = useMemo(() => marketplaces.filter((m) => selectedMarketplaces.includes(m.id)), [marketplaces, selectedMarketplaces]);
  const canRun = items.length > 0 && selectedConfigs.length > 0 && (!batch || batch.finished);
  const pct = batch ? ((batch.done + batch.failed) / Math.max(1, batch.total)) * 100 : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Batch Processing</h1>
        <p className="text-sm text-(--color-muted)">Upload 1 to 500+ images. They run through a bounded job queue, so nothing overloads memory.</p>
      </div>

      <Dropzone onFiles={addFiles} busy={uploading} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-(--color-line) bg-(--color-surface) p-4">
          <h2 className="mb-2 text-sm font-semibold">Marketplace</h2>
          <MarketplacePicker marketplaces={marketplaces} selected={selectedMarketplaces} onToggle={toggleMarketplace} />
        </div>
        <div className="rounded-2xl border border-(--color-line) bg-(--color-surface) p-4">
          <h2 className="mb-2 text-sm font-semibold">Naming template</h2>
          <input
            value={settings.namingTemplate}
            onChange={(e) => update({ namingTemplate: e.target.value })}
            className="w-full rounded-lg border border-(--color-line) bg-(--color-surface) px-3 py-2 text-sm"
            placeholder="{product}-{marketplace}"
          />
          <p className="mt-1.5 text-xs text-(--color-muted)">Tokens: {"{product} {sku} {marketplace} {index}"}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button disabled={!canRun} onClick={() => optimize(selectedConfigs)} className="rounded-xl bg-(--color-accent) px-5 py-2.5 text-sm font-semibold text-(--color-accent-fg) disabled:cursor-not-allowed disabled:opacity-40">
          Start Batch ({items.length} image{items.length === 1 ? "" : "s"})
        </button>
        {batch && !batch.finished && (
          <>
            <button onClick={() => (batch.paused ? resume() : pause())} className="flex items-center gap-1.5 rounded-xl border border-(--color-line) px-4 py-2.5 text-sm font-medium hover:bg-(--color-surface-2)">
              <Icon name={batch.paused ? "play" : "pause"} className="h-4 w-4" /> {batch.paused ? "Resume" : "Pause"}
            </button>
            <button onClick={cancel} className="flex items-center gap-1.5 rounded-xl border border-(--color-line) px-4 py-2.5 text-sm font-medium text-(--color-bad) hover:bg-(--color-bad-soft)">
              <Icon name="x" className="h-4 w-4" /> Cancel
            </button>
          </>
        )}
        {batch && batch.failed > 0 && (
          <button onClick={retryFailed} className="flex items-center gap-1.5 rounded-xl border border-(--color-line) px-4 py-2.5 text-sm font-medium hover:bg-(--color-surface-2)">
            <Icon name="retry" className="h-4 w-4" /> Retry all failed
          </button>
        )}
        {batch && batch.done > 0 && (
          <a href={api.zipUrl(batch.id)} className="ml-auto flex items-center gap-1.5 rounded-xl bg-(--color-accent) px-4 py-2.5 text-sm font-semibold text-(--color-accent-fg) hover:opacity-90">
            <Icon name="zip" className="h-4 w-4" /> Download All (ZIP)
          </a>
        )}
      </div>

      {batch && (
        <div className="rounded-2xl border border-(--color-line) bg-(--color-surface) p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span>Processed: {batch.done + batch.failed} / {batch.total} {batch.paused && "· Paused"}</span>
            <span className="tabular-nums text-(--color-muted)">{Math.round(pct)}%</span>
          </div>
          <ProgressBar value={pct} />
          <div className="mt-3 flex gap-4 text-xs text-(--color-muted)">
            <span>Queued: {batch.queued}</span>
            <span>Processing: {batch.processing}</span>
            <span className="text-(--color-ok)">Done: {batch.done}</span>
            <span className="text-(--color-bad)">Failed: {batch.failed}</span>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {!batch ? (
          <EmptyState icon="batch" title="No batch running" hint="Upload images and press Start Batch to see live progress here." />
        ) : (
          batch.tasks.map((t) => <TaskCard key={t.itemId} task={t} batchId={batch.id} onRetry={() => retryOne(t.itemId)} onReprocess={() => reprocessItem(t.itemId, selectedConfigs)} />)
        )}
      </div>
    </div>
  );
}
