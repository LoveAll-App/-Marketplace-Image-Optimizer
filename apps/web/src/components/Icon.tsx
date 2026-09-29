import type { SVGProps } from "react";

/** Minimal inline icon set (no external icon font — keeps the app fully offline). */
const PATHS: Record<string, string> = {
  dashboard: "M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z",
  optimizer: "M12 3l2.4 4.9L20 9l-4 3.9.9 5.5-4.9-2.6L7 17.4l.9-5.5L4 9l5.6-1.1z",
  batch: "M4 6h16M4 12h16M4 18h10",
  profiles: "M4 5h16v4H4zM4 15h10v4H4zM16 15h4v4h-4z",
  history: "M12 3a9 9 0 1 0 8.9 10.5M3 3v6h6M12 7v5l4 2",
  settings: "M10.3 3h3.4l.6 2.3a7 7 0 0 1 1.7 1l2.3-.7 1.7 3-1.7 1.7a7 7 0 0 1 0 2l1.7 1.7-1.7 3-2.3-.7a7 7 0 0 1-1.7 1l-.6 2.3h-3.4l-.6-2.3a7 7 0 0 1-1.7-1l-2.3.7-1.7-3 1.7-1.7a7 7 0 0 1 0-2L4 7.6l1.7-3 2.3.7a7 7 0 0 1 1.7-1z M12 9.3a2.7 2.7 0 1 1 0 5.4 2.7 2.7 0 0 1 0-5.4",
  upload: "M12 4v11m0-11 4 4m-4-4-4 4M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2",
  download: "M12 4v11m0 0-4-4m4 4 4-4M5 19h14",
  trash: "M6 7h12M9 7V5h6v2m-8 0 1 13h8l1-13",
  play: "M6 4.5v15l13-7.5z",
  pause: "M7 4.5h4v15H7zM13 4.5h4v15h-4z",
  x: "M6 6l12 12M18 6 6 18",
  check: "M5 12l5 5L20 7",
  warn: "M12 4 2 20h20zM12 10v5m0 3h.01",
  retry: "M4 4v6h6M20 20v-6h-6M4.6 15A8 8 0 0 0 20 12M19.4 9A8 8 0 0 0 4 12",
  zip: "M9 3v18M6 3h12v18H6zM9 6h3M9 9h3M9 12h3",
  zoom: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3",
  sun: "M12 4V2m0 20v-2m8-8h2M2 12h2m14.1-6.1 1.4-1.4M4.9 19.1l1.4-1.4M19.1 19.1l-1.4-1.4M4.9 4.9l1.4 1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  moon: "M20 14.5A8.5 8.5 0 1 1 9.5 4 7 7 0 0 0 20 14.5z",
  plus: "M12 5v14M5 12h14",
  chevron: "M9 6l6 6-6 6",
  image: "M4 5h16v14H4zM4 15l4-4 3 3 5-5 4 4M9 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
  folder: "M4 6h5l2 2h9v11H4z",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  copy: "M9 9h11v11H9zM5 15V4h11v2",
};

export function Icon({ name, className = "h-4 w-4", ...rest }: { name: keyof typeof PATHS } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" {...rest}>
      <path d={PATHS[name] ?? PATHS.image} />
    </svg>
  );
}
