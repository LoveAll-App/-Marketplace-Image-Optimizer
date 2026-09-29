import { ASPECT_RATIO_CHOICES, ENHANCEMENT_PRESETS, PRODUCT_FILL_STEPS, type OptimizeOptions } from "@moi/shared";
import { Field, Segmented, Slider, Switch } from "./Field";

const BG_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "white", label: "White" },
  { value: "transparent", label: "Transparent" },
  { value: "original", label: "Original" },
  { value: "custom", label: "Custom" },
] as const;

const POSITION_OPTIONS = [
  { value: "center", label: "Center" },
  { value: "top", label: "Top" },
  { value: "bottom", label: "Bottom" },
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
] as const;

export function OptionsPanel({ options, onChange, compact }: { options: OptimizeOptions; onChange: (patch: Partial<OptimizeOptions>) => void; compact?: boolean }) {
  return (
    <div className={compact ? "space-y-4" : "space-y-5"}>
      <Field label="Background">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented name="Background" value={options.background} onChange={(v) => onChange({ background: v })} options={BG_OPTIONS as unknown as { value: typeof options.background; label: string }[]} />
          {options.background === "custom" && (
            <input
              type="color"
              value={options.customBackground}
              onChange={(e) => onChange({ customBackground: e.target.value })}
              className="h-8 w-10 cursor-pointer rounded border border-(--color-line) bg-transparent"
              aria-label="Custom background color"
            />
          )}
        </div>
      </Field>

      <Field label="Product fill" hint="How much of the frame the product occupies. Never touches the edge.">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => onChange({ productFill: "auto" })}
            className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${options.productFill === "auto" ? "border-(--color-accent) bg-(--color-accent-soft) text-(--color-accent)" : "border-(--color-line) text-(--color-muted)"}`}
          >
            Auto
          </button>
          {PRODUCT_FILL_STEPS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onChange({ productFill: v })}
              className={`rounded-lg border px-2.5 py-1 text-xs font-medium tabular-nums ${options.productFill === v ? "border-(--color-accent) bg-(--color-accent-soft) text-(--color-accent)" : "border-(--color-line) text-(--color-muted)"}`}
            >
              {v}%
            </button>
          ))}
        </div>
      </Field>

      <Field label="Position">
        <Segmented name="Position" value={options.position === "custom" ? "center" : options.position} onChange={(v) => onChange({ position: v })} options={POSITION_OPTIONS as unknown as { value: typeof options.position; label: string }[]} />
      </Field>

      <Field label="Aspect ratio">
        <Segmented
          name="Aspect ratio"
          value={options.aspectRatio}
          onChange={(v) => onChange({ aspectRatio: v })}
          options={ASPECT_RATIO_CHOICES.map((v) => ({ value: v, label: v === "auto" ? "Auto" : v === "custom" ? "Custom" : v }))}
        />
        {options.aspectRatio === "custom" && (
          <input
            value={options.customAspect}
            onChange={(e) => onChange({ customAspect: e.target.value })}
            placeholder="e.g. 5:7"
            className="mt-2 w-24 rounded-lg border border-(--color-line) bg-(--color-surface) px-2 py-1 text-sm"
          />
        )}
      </Field>

      <Field label="Quality" hint="Higher quality means a larger file.">
        <div className="flex items-center gap-2">
          <Switch checked={options.quality !== "auto"} onChange={(v) => onChange({ quality: v ? 90 : "auto" })} label="Override" />
          {options.quality !== "auto" && <Slider value={options.quality} min={50} max={100} onChange={(v) => onChange({ quality: v })} format={(v) => `${v}`} />}
        </div>
      </Field>

      <Field label="Enhancement">
        <Segmented
          name="Enhancement"
          value={options.enhancement.level}
          onChange={(level) => onChange({ enhancement: { ...ENHANCEMENT_PRESETS[level] } })}
          options={[
            { value: "off", label: "Off" },
            { value: "standard", label: "Standard" },
            { value: "high", label: "High Quality" },
          ]}
        />
      </Field>

      {!compact && (
        <details className="rounded-xl border border-(--color-line) p-3">
          <summary className="cursor-pointer text-sm font-medium text-(--color-muted)">Fine-tune enhancement</summary>
          <div className="mt-3 space-y-3">
            {(["sharpness", "brightness", "contrast", "saturation", "exposure", "noiseReduction", "detail"] as const).map((k) => (
              <Field key={k} label={k.replace(/([A-Z])/g, " $1")}>
                <Slider
                  value={options.enhancement[k]}
                  min={k === "brightness" || k === "contrast" || k === "saturation" ? -50 : k === "exposure" ? -100 : 0}
                  max={k === "brightness" || k === "contrast" || k === "saturation" ? 50 : k === "exposure" ? 100 : 100}
                  onChange={(v) => onChange({ enhancement: { ...options.enhancement, level: options.enhancement.level === "off" ? "standard" : options.enhancement.level, [k]: v } })}
                />
              </Field>
            ))}
            <Switch checked={options.enhancement.upscale} onChange={(v) => onChange({ enhancement: { ...options.enhancement, upscale: v } })} label="AI upscale when enlarging" />
          </div>
        </details>
      )}

      <Field label="Processing" hint={options.processingMode !== "local" ? "This can send images to an external AI provider." : "Fully local — nothing leaves this machine."}>
        <Segmented name="Processing" value={options.processingMode} onChange={(v) => onChange({ processingMode: v })} options={[{ value: "local", label: "Local" }, { value: "ai", label: "AI" }, { value: "hybrid", label: "Hybrid" }]} />
        {options.processingMode !== "local" && (
          <div className="mt-2 flex items-center gap-2 rounded-lg bg-(--color-warn-soft) px-2.5 py-1.5 text-xs text-(--color-warn)">
            <span>⚠ This operation sends the image to an external AI provider.</span>
          </div>
        )}
        {options.processingMode !== "local" && <div className="mt-2"><Switch checked={options.allowExternal} onChange={(v) => onChange({ allowExternal: v })} label="Allow external processing" /></div>}
      </Field>
    </div>
  );
}
