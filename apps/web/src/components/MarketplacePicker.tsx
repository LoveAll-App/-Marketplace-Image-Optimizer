import type { MarketplaceConfig } from "@moi/shared";
import { Icon } from "./Icon";
import { cx } from "../utils/format";

export function MarketplacePicker({ marketplaces, selected, onToggle }: { marketplaces: MarketplaceConfig[]; selected: string[]; onToggle: (id: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {marketplaces.map((m) => {
        const on = selected.includes(m.id);
        return (
          <button
            key={m.id}
            type="button"
            role="checkbox"
            aria-checked={on}
            onClick={() => onToggle(m.id)}
            className={cx(
              "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-colors",
              on ? "border-(--color-accent) bg-(--color-accent-soft) text-(--color-accent)" : "border-(--color-line) bg-(--color-surface) text-(--color-fg) hover:border-(--color-accent)/50",
            )}
          >
            <span className={cx("grid h-4.5 w-4.5 shrink-0 place-items-center rounded border", on ? "border-(--color-accent) bg-(--color-accent) text-white" : "border-(--color-line)")}>
              {on && <Icon name="check" className="h-3 w-3" />}
            </span>
            <span className="truncate">{m.name}</span>
            {m.builtin === false && <span className="ml-auto shrink-0 rounded bg-(--color-surface-2) px-1.5 py-0.5 text-[10px] text-(--color-muted)">custom</span>}
          </button>
        );
      })}
    </div>
  );
}
