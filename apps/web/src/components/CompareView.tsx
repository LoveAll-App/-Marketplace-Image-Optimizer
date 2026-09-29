import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { cx, formatBytes } from "../utils/format";
import type { ImageMetadata } from "@moi/shared";

export interface CompareSide {
  src: string;
  width: number;
  height: number;
  size?: number;
  format?: string;
  quality?: number;
  label: string;
}

/** Before/after viewer: side-by-side or slider, with zoom, pan and fullscreen. */
export function CompareView({ before, after }: { before: CompareSide; after: CompareSide }) {
  const [mode, setMode] = useState<"slider" | "side">("slider");
  const [split, setSplit] = useState(50);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [fullscreen, setFullscreen] = useState(false);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFullscreen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  const onWheel: React.WheelEventHandler = (e) => {
    e.preventDefault();
    setZoom((z) => Math.min(6, Math.max(1, z - e.deltaY * 0.0015 * z)));
  };

  const startPan = (e: React.PointerEvent) => {
    if (zoom <= 1) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, ox: pan.x, oy: pan.y };
  };
  const movePan = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const d = dragRef.current;
    setPan({ x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) });
  };
  const endPan = () => { dragRef.current = null; };

  const imgStyle: React.CSSProperties = { transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transition: dragRef.current ? "none" : "transform .15s ease-out", cursor: zoom > 1 ? "grab" : "default" };

  const meta = (s: CompareSide) => (
    <div className="text-xs text-(--color-muted)">
      <p className="font-medium text-(--color-fg)">{s.label}</p>
      <p>{s.width} × {s.height}</p>
      {s.size !== undefined && <p>{formatBytes(s.size)}</p>}
      {s.format && <p>{s.format.toUpperCase()}{s.quality ? `  ·  Quality: ${s.quality}` : ""}</p>}
    </div>
  );

  const body = (
    <div className={cx("flex flex-col gap-3", fullscreen && "h-full")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-(--color-line) bg-(--color-surface-2) p-0.5 text-sm">
          <button onClick={() => setMode("slider")} className={cx("rounded-md px-2.5 py-1 font-medium", mode === "slider" ? "bg-(--color-surface) shadow-sm" : "text-(--color-muted)")}>Slider</button>
          <button onClick={() => setMode("side")} className={cx("rounded-md px-2.5 py-1 font-medium", mode === "side" ? "bg-(--color-surface) shadow-sm" : "text-(--color-muted)")}>Side-by-side</button>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setZoom((z) => Math.min(6, z * 1.4))} aria-label="Zoom in" className="rounded-lg p-1.5 hover:bg-(--color-surface-2)"><Icon name="zoom" /></button>
          <button onClick={resetView} className="rounded-lg px-2 py-1 text-xs text-(--color-muted) hover:bg-(--color-surface-2)">Reset</button>
          <button onClick={() => setFullscreen((v) => !v)} aria-label="Toggle fullscreen" className="rounded-lg p-1.5 hover:bg-(--color-surface-2)">
            <Icon name={fullscreen ? "x" : "eye"} />
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        onWheel={onWheel}
        onPointerDown={startPan}
        onPointerMove={movePan}
        onPointerUp={endPan}
        onPointerLeave={endPan}
        className={cx("checker relative overflow-hidden rounded-xl border border-(--color-line)", fullscreen ? "flex-1" : "aspect-square")}
      >
        {mode === "slider" ? (
          <>
            <img src={before.src} alt={before.label} draggable={false} className="absolute inset-0 h-full w-full select-none object-contain" style={imgStyle} />
            <div className="absolute inset-0 overflow-hidden select-none" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}>
              <img src={after.src} alt={after.label} draggable={false} className="absolute inset-0 h-full w-full object-contain" style={imgStyle} />
            </div>
            <div className="absolute inset-y-0 z-10 w-0.5 bg-white shadow" style={{ left: `${split}%` }} />
            <input
              type="range"
              min={0}
              max={100}
              value={split}
              onChange={(e) => setSplit(Number(e.target.value))}
              aria-label="Comparison slider"
              className="absolute inset-x-0 bottom-2 z-10 w-[calc(100%-1rem)] mx-2"
            />
            <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">Original</span>
            <span className="absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">Optimized</span>
          </>
        ) : (
          <div className="grid h-full grid-cols-2 divide-x divide-(--color-line)">
            <div className="relative overflow-hidden"><img src={before.src} alt={before.label} draggable={false} className="absolute inset-0 h-full w-full select-none object-contain" style={imgStyle} /></div>
            <div className="relative overflow-hidden"><img src={after.src} alt={after.label} draggable={false} className="absolute inset-0 h-full w-full select-none object-contain" style={imgStyle} /></div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {meta(before)}
        {meta(after)}
      </div>
    </div>
  );

  if (!fullscreen) return body;
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90 p-4" role="dialog" aria-modal="true">
      {body}
    </div>
  );
}

export const metaFromValidation = (m: ImageMetadata) => ({ format: m.format, quality: m.quality });
