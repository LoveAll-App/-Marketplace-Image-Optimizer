import type { ValidationResult } from "@moi/shared";
import { Icon } from "./Icon";
import { cx } from "../utils/format";

export function ValidationList({ validation, compact }: { validation: ValidationResult; compact?: boolean }) {
  return (
    <div className="space-y-2">
      <div className={cx("space-y-1", compact && "space-y-0.5")}>
        {validation.checks.map((c) => (
          <div key={c.id} className="flex items-start gap-2 text-sm">
            <span
              className={cx(
                "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full text-[10px] font-bold",
                c.status === "pass" && "bg-(--color-ok-soft) text-(--color-ok)",
                c.status === "warn" && "bg-(--color-warn-soft) text-(--color-warn)",
                c.status === "fail" && "bg-(--color-bad-soft) text-(--color-bad)",
              )}
            >
              {c.status === "pass" ? "✓" : c.status === "warn" ? "!" : "✕"}
            </span>
            <span className={cx(c.status === "fail" ? "text-(--color-bad)" : c.status === "warn" ? "text-(--color-warn)" : "text-(--color-fg)")}>
              {c.label}
              {c.message && <span className="text-(--color-muted)"> — {c.message}</span>}
            </span>
          </div>
        ))}
      </div>
      <div
        className={cx(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
          validation.ready ? "bg-(--color-ok-soft) text-(--color-ok)" : validation.valid ? "bg-(--color-warn-soft) text-(--color-warn)" : "bg-(--color-bad-soft) text-(--color-bad)",
        )}
      >
        <Icon name={validation.ready ? "check" : validation.valid ? "warn" : "x"} className="h-3.5 w-3.5" />
        {validation.ready ? "READY" : validation.valid ? "READY WITH WARNINGS" : "NOT VALID"}
      </div>
      <p className="text-xs text-(--color-muted)">{validation.disclaimer}</p>
    </div>
  );
}
