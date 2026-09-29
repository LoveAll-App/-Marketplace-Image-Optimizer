import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { historyAll, type HistoryEntry } from "../services/db";
import { api } from "../services/api";
import { formatBytes, isSameDay, timeAgo } from "../utils/format";
import { Icon } from "../components/Icon";
import { EmptyState } from "../components/EmptyState";

function StatCard({ label, value, icon, tone }: { label: string; value: string | number; icon: Parameters<typeof Icon>[0]["name"]; tone?: "ok" | "bad" }) {
  return (
    <div className="rounded-2xl border border-(--color-line) bg-(--color-surface) p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-(--color-muted)">{label}</p>
        <Icon name={icon} className={`h-4 w-4 ${tone === "ok" ? "text-(--color-ok)" : tone === "bad" ? "text-(--color-bad)" : "text-(--color-muted)"}`} />
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function Dashboard() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [storage, setStorage] = useState<{ bytes: number; files: number } | null>(null);

  useEffect(() => {
    historyAll().then(setHistory);
    api.storage().then(setStorage).catch(() => setStorage(null));
  }, []);

  const today = history.filter((h) => isSameDay(h.at, Date.now()));
  const successful = history.reduce((n, h) => n + h.outputs.length, 0);
  const failed = history.reduce((n, h) => n + h.failures.length, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-(--color-muted)">One Product Photo → Marketplace Ready Everywhere.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Images Processed" value={history.length} icon="image" />
        <StatCard label="Today's Jobs" value={today.length} icon="dashboard" />
        <StatCard label="Successful Outputs" value={successful} icon="check" tone="ok" />
        <StatCard label="Failed Outputs" value={failed} icon="warn" tone={failed ? "bad" : undefined} />
      </div>

      <div className="rounded-2xl border border-(--color-line) bg-(--color-surface) p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Storage used (temporary files)</p>
          <span className="text-sm text-(--color-muted)">{storage ? `${formatBytes(storage.bytes)} · ${storage.files} files` : "–"}</span>
        </div>
        <p className="mt-1 text-xs text-(--color-muted)">Originals are not kept permanently. Clear it anytime from Settings.</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link to="/optimizer" className="rounded-xl bg-(--color-accent) px-4 py-2.5 text-sm font-medium text-(--color-accent-fg) hover:opacity-90">Optimize images</Link>
        <Link to="/batch" className="rounded-xl border border-(--color-line) px-4 py-2.5 text-sm font-medium hover:bg-(--color-surface-2)">Go to batch processing</Link>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold">Recent activity</h2>
        {history.length === 0 ? (
          <EmptyState icon="history" title="No processing history yet" hint="Once you optimize some images, they'll show up here." />
        ) : (
          <div className="divide-y divide-(--color-line) rounded-2xl border border-(--color-line) bg-(--color-surface)">
            {history.slice(0, 8).map((h) => (
              <div key={h.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{h.name}</p>
                  <p className="text-xs text-(--color-muted)">{h.marketplaces.join(", ")} · {timeAgo(h.at)}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${h.state === "done" ? "bg-(--color-ok-soft) text-(--color-ok)" : "bg-(--color-bad-soft) text-(--color-bad)"}`}>
                  {h.state === "done" ? "Done" : "Failed"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
