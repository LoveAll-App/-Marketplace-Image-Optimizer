import { useState } from "react";
import { useSettingsStore } from "../stores/settingsStore";
import { useMarketplaceStore } from "../stores/marketplaceStore";
import { useWorkspaceStore } from "../stores/workspaceStore";
import { useToastStore } from "../stores/toastStore";
import { historyClear } from "../services/db";
import { api } from "../services/api";
import { Field, Segmented, Slider, Switch } from "../components/Field";
import { ConfirmDialog } from "../components/ConfirmDialog";

export function Settings() {
  const { settings, update } = useSettingsStore();
  const marketplaces = useMarketplaceStore((s) => s.all);
  const push = useToastStore((s) => s.push);
  const [confirmClearImages, setConfirmClearImages] = useState(false);
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-(--color-muted)">Unlimited personal use — no credits, no daily limits, no per-image billing.</p>
      </div>

      <section className="space-y-4 rounded-2xl border border-(--color-line) bg-(--color-surface) p-4">
        <h2 className="text-sm font-semibold">Appearance</h2>
        <Field label="Theme">
          <Segmented name="Theme" value={settings.theme} onChange={(v) => update({ theme: v })} options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }, { value: "system", label: "System" }]} />
        </Field>
      </section>

      <section className="space-y-4 rounded-2xl border border-(--color-line) bg-(--color-surface) p-4">
        <h2 className="text-sm font-semibold">Defaults</h2>
        <Field label="Default marketplace">
          <select value={settings.defaultMarketplace} onChange={(e) => update({ defaultMarketplace: e.target.value })} className="w-full rounded-lg border border-(--color-line) bg-(--color-surface) px-3 py-2 text-sm">
            {marketplaces.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Field>
        <Field label="Default format">
          <Segmented name="Default format" value={settings.defaultFormat} onChange={(v) => update({ defaultFormat: v })} options={[{ value: "jpeg", label: "JPEG" }, { value: "png", label: "PNG" }, { value: "webp", label: "WebP" }]} />
        </Field>
        <Field label="JPEG quality">
          <Slider value={settings.defaultQuality} min={50} max={100} onChange={(v) => update({ defaultQuality: v })} />
        </Field>
        <Field label="Default background">
          <Segmented name="Default background" value={settings.defaultBackground} onChange={(v) => update({ defaultBackground: v })} options={[{ value: "auto", label: "Auto" }, { value: "white", label: "White" }, { value: "transparent", label: "Transparent" }, { value: "original", label: "Original" }]} />
        </Field>
        <Field label="File name template">
          <input value={settings.namingTemplate} onChange={(e) => update({ namingTemplate: e.target.value })} className="w-full rounded-lg border border-(--color-line) bg-(--color-surface) px-3 py-2 text-sm" />
        </Field>
      </section>

      <section className="space-y-4 rounded-2xl border border-(--color-line) bg-(--color-surface) p-4">
        <h2 className="text-sm font-semibold">Processing</h2>
        <Field label="Mode" hint="Local never leaves this machine. AI/Hybrid can call an external provider when you explicitly allow it per job.">
          <Segmented name="Processing mode" value={settings.processingMode} onChange={(v) => update({ processingMode: v })} options={[{ value: "local", label: "Local" }, { value: "ai", label: "AI" }, { value: "hybrid", label: "Hybrid" }]} />
        </Field>
        <Switch checked={settings.allowExternal} onChange={(v) => update({ allowExternal: v })} label="Allow sending images to an external AI provider" />
        <Field label="Concurrent images" hint="How many images process at once in a batch.">
          <Slider value={settings.concurrency} min={1} max={8} onChange={(v) => update({ concurrency: v })} />
        </Field>
        {settings.processingMode !== "local" && (
          <>
            <Field label="remove.bg API key"><input type="password" value={settings.removeBgApiKey} onChange={(e) => update({ removeBgApiKey: e.target.value })} className="w-full rounded-lg border border-(--color-line) bg-(--color-surface) px-3 py-2 text-sm" placeholder="Optional" /></Field>
            <Field label="Self-hosted HTTP provider URL"><input value={settings.httpProviderUrl} onChange={(e) => update({ httpProviderUrl: e.target.value })} className="w-full rounded-lg border border-(--color-line) bg-(--color-surface) px-3 py-2 text-sm" placeholder="http://localhost:7000" /></Field>
          </>
        )}
      </section>

      <section className="space-y-3 rounded-2xl border border-(--color-line) bg-(--color-surface) p-4">
        <h2 className="text-sm font-semibold">Data</h2>
        <p className="text-xs text-(--color-muted)">Originals aren't kept permanently. Use these to remove everything now.</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setConfirmClearImages(true)} className="rounded-lg border border-(--color-line) px-3 py-1.5 text-sm font-medium text-(--color-bad) hover:bg-(--color-bad-soft)">Delete All Processed Images</button>
          <button onClick={() => setConfirmClearHistory(true)} className="rounded-lg border border-(--color-line) px-3 py-1.5 text-sm font-medium text-(--color-bad) hover:bg-(--color-bad-soft)">Clear History</button>
        </div>
      </section>

      <ConfirmDialog
        open={confirmClearImages}
        title="Delete all processed images"
        message="This deletes every uploaded image and generated output currently stored by the local engine. This can't be undone."
        confirmLabel="Delete everything"
        danger
        onConfirm={async () => { await api.clearAll(); useWorkspaceStore.getState().clearItems(); setConfirmClearImages(false); push("success", "All processed images deleted"); }}
        onCancel={() => setConfirmClearImages(false)}
      />
      <ConfirmDialog
        open={confirmClearHistory}
        title="Clear history"
        message="This removes the local processing history from this browser."
        confirmLabel="Clear history"
        danger
        onConfirm={async () => { await historyClear(); setConfirmClearHistory(false); push("success", "History cleared"); }}
        onCancel={() => setConfirmClearHistory(false)}
      />
    </div>
  );
}
