import { NavLink } from "react-router-dom";
import { Icon } from "./Icon";
import { cx } from "../utils/format";

const NAV = [
  { to: "/", label: "Dashboard", icon: "dashboard" as const, end: true },
  { to: "/optimizer", label: "Optimizer", icon: "optimizer" as const },
  { to: "/batch", label: "Batch Processing", icon: "batch" as const },
  { to: "/profiles", label: "Marketplace Profiles", icon: "profiles" as const },
  { to: "/history", label: "History", icon: "history" as const },
  { to: "/settings", label: "Settings", icon: "settings" as const },
];

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={onClose} />}
      <aside
        className={cx(
          "fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-(--color-line) bg-(--color-surface) transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-(--color-accent) text-(--color-accent-fg) font-bold">M</div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">Marketplace Image Optimizer</p>
            <p className="truncate text-xs text-(--color-muted)">One photo → everywhere</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3" aria-label="Main">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              onClick={onClose}
              className={({ isActive }) =>
                cx(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive ? "bg-(--color-accent-soft) text-(--color-accent)" : "text-(--color-muted) hover:bg-(--color-surface-2) hover:text-(--color-fg)",
                )
              }
            >
              <Icon name={n.icon} />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-5 py-4 text-xs text-(--color-muted)">Unlimited local processing. No credits, no limits.</div>
      </aside>
    </>
  );
}
