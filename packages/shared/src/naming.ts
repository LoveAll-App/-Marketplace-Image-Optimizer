export interface NamingContext {
  /** Original file name (with or without extension) */
  original: string;
  /** 1-based position in the batch */
  index: number;
  marketplace: string;
  sku?: string;
  extension: string;
  productNameMode?: "sequential" | "original";
}

export const DEFAULT_NAME_TEMPLATE = "{product}-{marketplace}";

export function pad(n: number, width = 3): string {
  return String(Math.max(0, Math.floor(n))).padStart(width, "0");
}

/** Strip anything that could escape a directory or confuse a file system. */
export function sanitizeFilename(name: string, maxLength = 100): string {
  let s = String(name)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\\/]+/g, "-")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s)) s = `_${s}`;
  s = s.slice(0, maxLength).replace(/[-.]+$/g, "");
  return s || "file";
}

export function stripExtension(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  return base.replace(/\.[a-zA-Z0-9]{1,5}$/, "");
}

export function productName(ctx: Pick<NamingContext, "original" | "index" | "productNameMode">): string {
  if (ctx.productNameMode === "original") return sanitizeFilename(stripExtension(ctx.original));
  return `product-${pad(ctx.index)}`;
}

/** Fills {product} {sku} {marketplace} {index}; unknown tokens are dropped. */
export function buildFilename(template: string | undefined, ctx: NamingContext): string {
  const product = productName(ctx);
  const values: Record<string, string> = {
    product,
    sku: ctx.sku ? sanitizeFilename(ctx.sku) : product,
    marketplace: sanitizeFilename(ctx.marketplace),
    index: pad(ctx.index),
    original: sanitizeFilename(stripExtension(ctx.original)),
  };
  const raw = (template && template.trim() ? template : DEFAULT_NAME_TEMPLATE)
    .replace(/\.[a-zA-Z0-9]{1,5}$/, "") // extension is always derived from the output format
    .replace(/\{(\w+)\}/g, (_m, key: string) => values[key] ?? "");
  const ext = ctx.extension.replace(/^\./, "").toLowerCase();
  return `${sanitizeFilename(raw)}.${ext === "jpeg" ? "jpg" : ext}`;
}
