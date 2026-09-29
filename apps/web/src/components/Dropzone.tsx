import { useCallback, useRef, useState } from "react";
import { Icon } from "./Icon";
import { filesFromDrop, looksLikeImage } from "../utils/files";
import { cx } from "../utils/format";

export function Dropzone({ onFiles, busy }: { onFiles: (files: File[]) => void; busy?: boolean }) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const accept = useCallback(
    (files: File[]) => {
      const images = files.filter(looksLikeImage);
      const skipped = files.length - images.length;
      if (images.length) onFiles(images);
      if (skipped) console.warn(`Skipped ${skipped} non-image file(s)`);
    },
    [onFiles],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Upload product images. Drop files here or press Enter to browse."
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), inputRef.current?.click())}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={async (e) => {
        e.preventDefault();
        setDragOver(false);
        accept(await filesFromDrop(e.dataTransfer));
      }}
      className={cx(
        "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors",
        dragOver ? "border-(--color-accent) bg-(--color-accent-soft)" : "border-(--color-line) bg-(--color-surface-2) hover:border-(--color-accent)/60",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        onChange={(e) => { if (e.target.files) accept(Array.from(e.target.files)); e.target.value = ""; }}
      />
      <div className="grid h-14 w-14 place-items-center rounded-full bg-(--color-accent-soft) text-(--color-accent)">
        <Icon name={busy ? "image" : "upload"} className={cx("h-7 w-7", busy && "animate-pulse")} />
      </div>
      <div>
        <p className="font-medium">{busy ? "Uploading…" : "Drop Images Here"}</p>
        <p className="text-sm text-(--color-muted)">or click to browse — JPEG, PNG, WebP, TIFF, GIF. Any number of files.</p>
      </div>
      <span className="rounded-lg bg-(--color-accent) px-4 py-2 text-sm font-medium text-(--color-accent-fg)">Browse Files</span>
    </div>
  );
}
