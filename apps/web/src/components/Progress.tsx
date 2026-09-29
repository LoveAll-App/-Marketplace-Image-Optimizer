import { cx } from "../utils/format";

export function ProgressBar({ value, className, tone = "accent" }: { value: number; className?: string; tone?: "accent" | "ok" | "bad" }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={cx("h-2 w-full overflow-hidden rounded-full bg-(--color-surface-2)", className)} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div
        className={cx("h-full rounded-full transition-[width] duration-300", tone === "accent" && "bg-(--color-accent)", tone === "ok" && "bg-(--color-ok)", tone === "bad" && "bg-(--color-bad)")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
