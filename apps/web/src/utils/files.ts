const IMAGE_EXT = /\.(jpe?g|png|webp|tiff?|gif|avif)$/i;

export const looksLikeImage = (f: File) => f.type.startsWith("image/") ? f.type !== "image/svg+xml" : IMAGE_EXT.test(f.name);

/** Collect files from a drop event, descending into dropped folders. */
export async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const entries: FileSystemEntry[] = [];
  for (const item of Array.from(dt.items ?? [])) {
    const entry = item.kind === "file" ? item.webkitGetAsEntry?.() : null;
    if (entry) entries.push(entry);
  }
  if (entries.length === 0) return Array.from(dt.files);
  const out: File[] = [];
  const walk = async (entry: FileSystemEntry, depth: number): Promise<void> => {
    if (entry.isFile) {
      out.push(await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej)));
    } else if (entry.isDirectory && depth < 6) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
        if (!batch.length) break;
        for (const e of batch) await walk(e, depth + 1);
      }
    }
  };
  for (const e of entries) await walk(e, 0);
  return out;
}
