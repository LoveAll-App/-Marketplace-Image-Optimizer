import { useEffect, useMemo, useState } from "react";
import { historyAll, historyClear, type HistoryEntry } from "../services/db";
import { EmptyState } from "../components/EmptyState";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Icon } from "../components/Icon";
import { formatBytes, timeAgo } from "../utils/format";
import { useToastStore } from "../stores/toastStore";

export function History() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [filter, setFilter] = useState<"all" | "done" | "failed">("all");
  const push = useToastStore((s) => s.push);

  useEffect(() => { historyAll().then(setEntries); }, []);

  const filtered = useMemo(() => (filter === "all" ? entries : entries.filter((e) => e.state === filter)), [entries, filter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">History</h1>
          <p className="text-sm text-(--color-muted)">Recent processing jobs, kept locally in your browser.</p>
        </div>
        {entries.length > 0 && (
          <button onClick={() => setConfirm(true)} className="flex items-center gap-1.5 rounded-lg border border-(--color-line) px-3 py-1.5 text-sm font-medium text-(--color-bad) hover:bg-(--color-bad-soft)">
            <Icon name="trash" className="h-4 w-4" /> Clear history
          </button>
        )}
      </div>

      <div className="inline-flex rounded-lg border border-(--color-line) bg-(--color-surface-2) p-0.5 text-sm">
        {(["all", "done", "failed"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`rounded-md px-3 py-1 font-medium capitalize ${filter === f ? "bg-(--color-surface) shadow-sm" : "text-(--color-muted)"}`}>{f}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon="history" title="No history yet" hint="Processed images will appear here, most recent first." />
      ) : (
        <div className="divide-y divide-(--color-line) rounded-2xl border border-(--color-line) bg-(--color-surface)">
          {filtered.map((h) => (
            <div key={h.id} className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{h.name}</p>
                  <p className="text-xs text-(--color-muted)">{h.marketplaces.join(", ")} · {timeAgo(h.at)}{h.durationMs ? ` · ${(h.durationMs / 1000).toFixed(1)}s` : ""}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${h.state === "done" ? "bg-(--color-ok-soft) text-(--color-ok)" : "bg-(--color-bad-soft) text-(--color-bad)"}`}>{h.state === "done" ? "Done" : "Failed"}</span>
              </div>
              {h.outputs.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-(--color-muted)">
                  {h.outputs.map((o) => (
                    <span key={o.marketplace} className="rounded-lg bg-(--color-surface-2) px-2 py-1">
                      {o.marketplace}: {o.width}×{o.height} · {formatBytes(o.size)} {o.ready ? "· ready" : o.warnings ? `· ${o.warnings} warning${o.warnings > 1 ? "s" : ""}` : ""}
                    </span>
                  ))}
                </div>
              )}
              {h.failures.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {h.failures.map((f) => <li key={f.marketplace} className="text-xs text-(--color-bad)">{f.marketplace}: {f.message}</li>)}
                </ul>
              )}
              {h.error && <p className="mt-2 text-xs text-(--color-bad)">{h.error}</p>}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirm}
        title="Clear history"
        message="This removes the local processing history from this browser. It does not delete any downloaded files."
        confirmLabel="Clear history"
        danger
        onConfirm={async () => { await historyClear(); setEntries([]); setConfirm(false); push("success", "History cleared"); }}
        onCancel={() => setConfirm(false)}
      />
    </div>
  );
}
