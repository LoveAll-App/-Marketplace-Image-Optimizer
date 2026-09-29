import type { ReactNode } from "react";
import { Icon } from "./Icon";

export function EmptyState({ icon = "image", title, hint, action }: { icon?: Parameters<typeof Icon>[0]["name"]; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-(--color-line) px-6 py-16 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-(--color-surface-2) text-(--color-muted)">
        <Icon name={icon} className="h-6 w-6" />
      </div>
      <p className="font-medium text-(--color-fg)">{title}</p>
      {hint && <p className="max-w-sm text-sm text-(--color-muted)">{hint}</p>}
      {action}
    </div>
  );
}
