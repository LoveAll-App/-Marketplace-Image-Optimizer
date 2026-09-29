import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { useSettingsStore } from "../stores/settingsStore";
import { api } from "../services/api";

export function Header({ onMenu }: { onMenu: () => void }) {
  const { settings, update } = useSettingsStore();
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    const check = () => api.health().then(() => alive && setOnline(true)).catch(() => alive && setOnline(false));
    check();
    const t = setInterval(check, 8000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const nextTheme = settings.theme === "dark" ? "light" : "dark";

  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-(--color-line) bg-(--color-surface)/90 px-4 py-3 backdrop-blur">
      <button onClick={onMenu} aria-label="Toggle menu" className="rounded-lg p-2 hover:bg-(--color-surface-2) lg:hidden">
        <Icon name="batch" />
      </button>
      <div className="flex-1" />
      <span
        className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${online === false ? "bg-(--color-bad-soft) text-(--color-bad)" : "bg-(--color-ok-soft) text-(--color-ok)"}`}
        title={online === false ? "Start the local engine with npm run dev" : "Local engine connected"}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${online === false ? "bg-(--color-bad)" : "bg-(--color-ok)"}`} />
        {online === false ? "Engine offline" : online === null ? "Connecting…" : "Local engine"}
      </span>
      <button
        onClick={() => update({ theme: nextTheme })}
        aria-label={`Switch to ${nextTheme} mode`}
        title={`Switch to ${nextTheme} mode`}
        className="rounded-lg p-2 text-(--color-muted) hover:bg-(--color-surface-2) hover:text-(--color-fg)"
      >
        <Icon name={settings.theme === "dark" ? "moon" : "sun"} />
      </button>
    </header>
  );
}
