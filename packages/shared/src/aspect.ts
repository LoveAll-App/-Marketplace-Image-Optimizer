/** Parse "4:5", "4x5", "1.25" → width/height ratio. Returns null if invalid. */
export function parseRatio(input: string): number | null {
  const s = String(input).trim();
  const m = s.match(/^(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)$/);
  if (m) {
    const w = parseFloat(m[1]!);
    const h = parseFloat(m[2]!);
    return w > 0 && h > 0 ? w / h : null;
  }
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 && /^\d+(\.\d+)?$/.test(s) ? n : null;
}

export function ratiosMatch(a: number, b: number, tolerance = 0.015): boolean {
  return Math.abs(a / b - 1) <= tolerance;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
