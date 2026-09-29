import { useToastStore } from "../stores/toastStore";
import { cx } from "../utils/format";

const ICON = { success: "✓", error: "✕", info: "ℹ" };

export function Toasts() {
  const { toasts, dismiss } = useToastStore();
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm" role="region" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === "error" ? "alert" : "status"}
          className={cx(
            "toast-in flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm shadow-lg backdrop-blur",
            "bg-(--color-surface)/95 border-(--color-line) text-(--color-fg)",
          )}
        >
          <span
            className={cx(
              "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs font-bold",
              t.kind === "success" && "bg-(--color-ok-soft) text-(--color-ok)",
              t.kind === "error" && "bg-(--color-bad-soft) text-(--color-bad)",
              t.kind === "info" && "bg-(--color-accent-soft) text-(--color-accent)",
            )}
          >
            {ICON[t.kind]}
          </span>
          <p className="flex-1 leading-snug">{t.message}</p>
          <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="text-(--color-muted) hover:text-(--color-fg)">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
