import { useState } from "react";
import type { BatchTask } from "@moi/shared";
import { api } from "../services/api";
import { Icon } from "./Icon";
import { formatBytes, formatDuration, cx } from "../utils/format";
import { CompareView } from "./CompareView";
import { ValidationList } from "./ValidationList";

const STAGE_LABEL: Record<string, string> = {
  analysis: "Analyzing", detection: "Detecting product", "background-detection": "Detecting background", "background-removal": "Removing background",
  isolation: "Isolating product", cropping: "Cropping", centering: "Centering", padding: "Padding", "background-generation": "Generating background",
  enhancement: "Enhancing", resize: "Resizing", compression: "Compressing", validation: "Validating", preview: "Finalizing",
};

export function TaskCard({ task, batchId, onRetry, onReprocess }: { task: BatchTask; batchId: string; onRetry: () => void; onReprocess?: () => void }) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="rounded-xl border border-(--color-line) bg-(--color-surface) p-3">
      <div className="flex flex-wrap items-center gap-3">
        <img src={api.previewUrl(task.itemId, 80)} alt="" className="h-12 w-12 shrink-0 rounded-lg border border-(--color-line) object-contain" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{task.name}</p>
          <p className="text-xs text-(--color-muted)">
            {task.state === "processing" && (STAGE_LABEL[task.stage ?? ""] ?? "Processing") + "…"}
            {task.state === "queued" && "Queued"}
            {task.state === "done" && `Done in ${formatDuration(task.durationMs)}`}
            {task.state === "failed" && "Failed"}
            {task.state === "cancelled" && "Cancelled"}
          </p>
        </div>
        <StateBadge state={task.state} />
        {(task.state === "failed" || task.state === "cancelled") && (
          <button onClick={onRetry} className="flex items-center gap-1 rounded-lg border border-(--color-line) px-2.5 py-1 text-xs font-medium hover:bg-(--color-surface-2)">
            <Icon name="retry" className="h-3.5 w-3.5" /> Retry
          </button>
        )}
        {task.state === "done" && onReprocess && (
          <button onClick={onReprocess} className="flex items-center gap-1 rounded-lg border border-(--color-line) px-2.5 py-1 text-xs font-medium hover:bg-(--color-surface-2)">
            <Icon name="retry" className="h-3.5 w-3.5" /> Reprocess
          </button>
        )}
      </div>

      {task.error && <p className="mt-2 rounded-lg bg-(--color-bad-soft) px-2.5 py-1.5 text-xs text-(--color-bad)">{task.error.message}</p>}

      {task.outputs.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {task.outputs.map((o) => (
            <div key={o.marketplace} className="overflow-hidden rounded-lg border border-(--color-line)">
              <button className="checker block aspect-square w-full" onClick={() => setOpen(open === o.marketplace ? null : o.marketplace)}>
                <img src={api.fileUrl(batchId, task.itemId, o.marketplace, { inline: true })} alt={`${o.marketplaceName} result`} className="h-full w-full object-contain" />
              </button>
              <div className="flex items-center justify-between gap-1 px-2 py-1.5">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">{o.marketplaceName}</p>
                  <p className="text-[11px] text-(--color-muted)">{o.metadata.width}×{o.metadata.height} · {formatBytes(o.metadata.fileSize)}</p>
                </div>
                <span className={cx("h-2 w-2 shrink-0 rounded-full", o.validation.ready ? "bg-(--color-ok)" : o.validation.valid ? "bg-(--color-warn)" : "bg-(--color-bad)")} title={o.validation.ready ? "Ready" : o.validation.valid ? "Warnings" : "Not valid"} />
                <a href={api.fileUrl(batchId, task.itemId, o.marketplace)} download className="rounded p-1 text-(--color-muted) hover:bg-(--color-surface-2) hover:text-(--color-fg)" aria-label={`Download ${o.marketplaceName} image`}>
                  <Icon name="download" className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {task.failures.length > 0 && (
        <ul className="mt-2 space-y-1">
          {task.failures.map((f) => (
            <li key={f.marketplace} className="rounded-lg bg-(--color-bad-soft) px-2.5 py-1.5 text-xs text-(--color-bad)">
              <span className="font-medium">{f.marketplaceName}:</span> {f.message}
            </li>
          ))}
        </ul>
      )}

      {open && (() => {
        const o = task.outputs.find((x) => x.marketplace === open);
        if (!o) return null;
        return (
          <div className="mt-3 rounded-xl bg-(--color-surface-2) p-3">
            <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
              <CompareView
                before={{ src: api.previewUrl(task.itemId, 900), width: task.analysis?.bbox ? task.analysis.bbox.width + 200 : o.metadata.width, height: o.metadata.height, label: "Original" }}
                after={{ src: api.fileUrl(batchId, task.itemId, o.marketplace, { inline: true }), width: o.metadata.width, height: o.metadata.height, size: o.metadata.fileSize, format: o.metadata.format, quality: o.metadata.quality, label: `Optimized · ${o.marketplaceName}` }}
              />
              <ValidationList validation={o.validation} />
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function StateBadge({ state }: { state: BatchTask["state"] }) {
  const map = {
    queued: ["bg-(--color-surface-2) text-(--color-muted)", "Queued"],
    processing: ["bg-(--color-accent-soft) text-(--color-accent) animate-pulse", "Processing"],
    done: ["bg-(--color-ok-soft) text-(--color-ok)", "Done"],
    failed: ["bg-(--color-bad-soft) text-(--color-bad)", "Failed"],
    cancelled: ["bg-(--color-warn-soft) text-(--color-warn)", "Cancelled"],
  } as const;
  const [cls, label] = map[state];
  return <span className={cx("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", cls)}>{label}</span>;
}
