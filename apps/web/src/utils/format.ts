export { formatBytes } from "@moi/shared";

export function formatDuration(ms?: number): string {
  if (ms === undefined) return "–";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(ts).toLocaleDateString();
}

export const isSameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");
