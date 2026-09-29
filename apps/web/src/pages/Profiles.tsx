import { useMemo, useState } from "react";
import type { MarketplaceConfig } from "@moi/shared";
import { useMarketplaceStore } from "../stores/marketplaceStore";
import { useToastStore } from "../stores/toastStore";
import { Field } from "../components/Field";
import { Icon } from "../components/Icon";
import { ConfirmDialog } from "../components/ConfirmDialog";

const BLANK = (): MarketplaceConfig => ({
  id: "", name: "", supportedFormats: ["jpeg", "png"], backgroundMode: "white", jpegQuality: 90, defaultFormat: "jpeg", targetSize: 1600, safeMarginPercent: 4,
});

export function Profiles() {
  const { custom, save, remove } = useMarketplaceStore();
  const all = useMarketplaceStore((s) => s.all);
  const builtins = useMemo(() => all.filter((m) => m.builtin), [all]);
  const [editing, setEditing] = useState<MarketplaceConfig | null>(null);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const push = useToastStore((s) => s.push);

  const [raw, setRaw] = useState("");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Marketplace Profiles</h1>
          <p className="text-sm text-(--color-muted)">
            Rules can change. Adjust these anytime — nothing here is claimed as “compliant” without validating against it.
          </p>
        </div>
        <button
          onClick={() => { setEditing(BLANK()); setRaw(JSON.stringify(BLANK(), null, 2)); }}
          className="flex items-center gap-1.5 rounded-xl bg-(--color-accent) px-4 py-2.5 text-sm font-semibold text-(--color-accent-fg)"
        >
          <Icon name="plus" className="h-4 w-4" /> New profile
        </button>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Built-in</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {builtins.map((m) => <ProfileCard key={m.id} m={m} />)}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Custom (e.g. Myntra, Snapdeal, Etsy, eBay, Shopify, Walmart…)</h2>
        {custom.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-(--color-line) p-6 text-center text-sm text-(--color-muted)">
            No custom profiles yet. A new marketplace only needs a config — the image engine doesn't change.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {custom.map((m) => (
              <ProfileCard key={m.id} m={m} onEdit={() => { setEditing(m); setRaw(JSON.stringify(m, null, 2)); }} onDelete={() => setToDelete(m.id)} />
            ))}
          </div>
        )}
      </section>

      {editing && (
        <div className="rounded-2xl border border-(--color-line) bg-(--color-surface) p-4">
          <h2 className="mb-3 text-sm font-semibold">{editing.id ? `Edit “${editing.id}”` : "New profile"}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <Field label="Id" hint="lowercase, letters/digits/-/_ only"><input value={editing.id} onChange={(e) => setEditing({ ...editing, id: e.target.value })} className="w-full rounded-lg border border-(--color-line) bg-(--color-surface) px-3 py-2 text-sm" /></Field>
              <Field label="Name"><input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="w-full rounded-lg border border-(--color-line) bg-(--color-surface) px-3 py-2 text-sm" /></Field>
              <Field label="Target size (px, longest side)"><input type="number" value={editing.targetSize} onChange={(e) => setEditing({ ...editing, targetSize: Number(e.target.value) })} className="w-full rounded-lg border border-(--color-line) bg-(--color-surface) px-3 py-2 text-sm" /></Field>
              <Field label="Default format">
                <select value={editing.defaultFormat} onChange={(e) => setEditing({ ...editing, defaultFormat: e.target.value as never })} className="w-full rounded-lg border border-(--color-line) bg-(--color-surface) px-3 py-2 text-sm">
                  <option value="jpeg">JPEG</option><option value="png">PNG</option><option value="webp">WebP</option>
                </select>
              </Field>
              <Field label="JPEG quality"><input type="number" min={30} max={100} value={editing.jpegQuality} onChange={(e) => setEditing({ ...editing, jpegQuality: Number(e.target.value) })} className="w-full rounded-lg border border-(--color-line) bg-(--color-surface) px-3 py-2 text-sm" /></Field>
              <Field label="Max file size (MB)"><input type="number" value={editing.maxFileSizeMB ?? ""} onChange={(e) => setEditing({ ...editing, maxFileSizeMB: e.target.value ? Number(e.target.value) : undefined })} className="w-full rounded-lg border border-(--color-line) bg-(--color-surface) px-3 py-2 text-sm" /></Field>
              <Field label="Aspect ratios (comma list)"><input value={editing.aspectRatios?.join(",") ?? ""} onChange={(e) => setEditing({ ...editing, aspectRatios: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} className="w-full rounded-lg border border-(--color-line) bg-(--color-surface) px-3 py-2 text-sm" /></Field>
              <Field label="Recommended product fill %"><input type="number" value={editing.recommendedProductFillPercent ?? ""} onChange={(e) => setEditing({ ...editing, recommendedProductFillPercent: e.target.value ? Number(e.target.value) : undefined })} className="w-full rounded-lg border border-(--color-line) bg-(--color-surface) px-3 py-2 text-sm" /></Field>
            </div>
            <div>
              <Field label="Raw JSON" hint="Edit any field directly, including limits not listed on the left.">
                <textarea
                  value={raw}
                  onChange={(e) => setRaw(e.target.value)}
                  onBlur={() => { try { setEditing(JSON.parse(raw)); } catch { push("error", "Invalid JSON"); } }}
                  className="h-72 w-full rounded-lg border border-(--color-line) bg-(--color-surface-2) p-3 font-mono text-xs"
                  spellCheck={false}
                />
              </Field>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setEditing(null)} className="rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-(--color-surface-2)">Cancel</button>
            <button
              onClick={() => {
                let cfg = editing;
                try { cfg = JSON.parse(raw); } catch { push("error", "Invalid JSON — fix it before saving"); return; }
                const res = save(cfg);
                if (res.ok) { push("success", "Profile saved"); setEditing(null); } else push("error", res.error);
              }}
              className="rounded-lg bg-(--color-accent) px-4 py-1.5 text-sm font-semibold text-(--color-accent-fg)"
            >
              Save profile
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="Delete profile"
        message={`Delete the “${toDelete}” marketplace profile? This can't be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={() => { if (toDelete) remove(toDelete); setToDelete(null); }}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}

function ProfileCard({ m, onEdit, onDelete }: { m: MarketplaceConfig; onEdit?: () => void; onDelete?: () => void }) {
  return (
    <div className="rounded-2xl border border-(--color-line) bg-(--color-surface) p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-medium">{m.name}</p>
          <p className="text-xs text-(--color-muted)">{m.id}</p>
        </div>
        {(onEdit || onDelete) && (
          <div className="flex gap-1">
            {onEdit && <button onClick={onEdit} className="rounded-lg p-1.5 hover:bg-(--color-surface-2)" aria-label={`Edit ${m.name}`}><Icon name="settings" className="h-4 w-4" /></button>}
            {onDelete && <button onClick={onDelete} className="rounded-lg p-1.5 text-(--color-bad) hover:bg-(--color-bad-soft)" aria-label={`Delete ${m.name}`}><Icon name="trash" className="h-4 w-4" /></button>}
          </div>
        )}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-(--color-muted)">
        <div><dt className="font-medium text-(--color-fg)">Target size</dt><dd>{m.targetSize}px</dd></div>
        <div><dt className="font-medium text-(--color-fg)">Format</dt><dd>{m.defaultFormat.toUpperCase()}</dd></div>
        <div><dt className="font-medium text-(--color-fg)">Aspect</dt><dd>{m.aspectRatios?.join(", ") ?? "any"}</dd></div>
        <div><dt className="font-medium text-(--color-fg)">Max size</dt><dd>{m.maxFileSizeMB ? `${m.maxFileSizeMB} MB` : "–"}</dd></div>
        <div><dt className="font-medium text-(--color-fg)">Background</dt><dd className="capitalize">{m.backgroundMode}</dd></div>
        <div><dt className="font-medium text-(--color-fg)">Fill target</dt><dd>{m.recommendedProductFillPercent ? `${m.recommendedProductFillPercent}%` : "–"}</dd></div>
      </dl>
      {m.notes && <p className="mt-2 text-xs text-(--color-muted)">{m.notes}</p>}
    </div>
  );
}
