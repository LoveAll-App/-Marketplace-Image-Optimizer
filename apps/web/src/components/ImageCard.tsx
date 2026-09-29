import { useState } from "react";
import type { QueuedItem } from "../stores/workspaceStore";
import { api } from "../services/api";
import { Icon } from "./Icon";
import { formatBytes } from "../utils/format";
import { ConfirmDialog } from "./ConfirmDialog";

export function ImageCard({ item, onRemove, onEdit, hasOverride }: { item: QueuedItem; onRemove: () => void; onEdit?: () => void; hasOverride?: boolean }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="grid-item group relative overflow-hidden rounded-xl border border-(--color-line) bg-(--color-surface)">
      <div className="checker aspect-square">
        <img src={api.previewUrl(item.id, 400)} alt={item.name} loading="lazy" className="h-full w-full object-contain" />
      </div>
      <div className="flex items-center gap-1 p-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium" title={item.name}>{item.name}</p>
          <p className="text-[11px] text-(--color-muted)">{item.width}×{item.height} · {formatBytes(item.size)}</p>
        </div>
        {hasOverride && <span className="shrink-0 rounded bg-(--color-accent-soft) px-1.5 py-0.5 text-[10px] font-medium text-(--color-accent)">custom</span>}
      </div>
      <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        {onEdit && (
          <button onClick={onEdit} aria-label={`Edit settings for ${item.name}`} className="rounded-lg bg-black/60 p-1.5 text-white hover:bg-black/80">
            <Icon name="settings" className="h-3.5 w-3.5" />
          </button>
        )}
        <button onClick={() => setConfirm(true)} aria-label={`Remove ${item.name}`} className="rounded-lg bg-black/60 p-1.5 text-white hover:bg-black/80">
          <Icon name="trash" className="h-3.5 w-3.5" />
        </button>
      </div>
      <ConfirmDialog open={confirm} title="Remove image" message={`Remove “${item.name}” from this batch? The upload will be deleted.`} confirmLabel="Remove" danger onConfirm={() => { setConfirm(false); onRemove(); }} onCancel={() => setConfirm(false)} />
    </div>
  );
}
