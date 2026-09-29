import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { detectProduct, optimizeBatch, optimizeImage, optimizeMultiple, validateImageFile } from "@moi/image-engine";
import { amazon, flipkart, meesho, universal } from "../marketplace";
import { BUILTIN_MARKETPLACES } from "@moi/marketplace-rules";
import { contentBox, fixtures, tmpDir } from "./helpers";

let F: Awaited<ReturnType<typeof fixtures>>["files"];
beforeAll(async () => { F = (await fixtures()).files; });

const ok = async (input: string, mp: Parameters<typeof optimizeImage>[0]["marketplace"], options = {}) => {
  const r = await optimizeImage({ input, marketplace: mp, options });
  if (!r.success) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r;
};

describe("product detection", () => {
  it("finds the product box, orientation and fill", async () => {
    const d = await detectProduct(F["portrait-white.jpg"]);
    expect(d.analysis.orientation).toBe("portrait");
    expect(d.analysis.backgroundKind).toBe("solid");
    expect(d.analysis.bbox.x).toBeGreaterThan(500);
    expect(d.analysis.bbox.x).toBeLessThan(700);
    expect(d.analysis.bbox.height).toBeGreaterThan(1650);
    expect(d.analysis.fillPercent).toBeCloseTo((d.analysis.bbox.height / 3000) * 100, 0);
    expect(d.analysis.center.x).toBeCloseTo(1000, -2);
  });
  it("detects landscape on a grey studio background", async () => {
    const d = await detectProduct(F["landscape-gray.jpg"]);
    expect(d.analysis.orientation).toBe("landscape");
    expect(d.analysis.backgroundColor.r).toBeGreaterThan(225);
  });
  it("uses alpha for transparent PNGs", async () => {
    const d = await detectProduct(F["transparent.png"]);
    expect(d.analysis.backgroundKind).toBe("transparent");
    expect(d.hadAlpha).toBe(true);
  });
  it("treats busy backgrounds as complex and still isolates the product", async () => {
    const d = await detectProduct(F["large-complex.jpg"]);
    expect(d.analysis.backgroundKind).toBe("complex");
    expect(d.analysis.bbox.width).toBeGreaterThan(1000);
    expect(d.analysis.bbox.width).toBeLessThan(1700);
  });
  it("honours EXIF orientation", async () => {
    const d = await detectProduct(F["exif-rotated.jpg"]);
    expect(d.fullWidth).toBe(2000);
    expect(d.fullHeight).toBe(3000);
    // the bag was stored upright inside a landscape frame, so after rotating it lies on its side
    expect(d.analysis.orientation).toBe("landscape");
  });
  it("does not eat a white product on a white background", async () => {
    const d = await detectProduct(F["white-on-white.jpg"]);
    expect(d.analysis.bbox.width).toBeGreaterThan(450);
    expect(d.analysis.areaPercent).toBeGreaterThan(20);
  });
});

describe("resizing, aspect ratio and positioning", () => {
  it("produces exact marketplace dimensions without distortion (portrait source → square)", async () => {
    const r = await ok(F["portrait-white.jpg"], amazon);
    expect(r.metadata.width).toBe(2000);
    expect(r.metadata.height).toBe(2000);
    const box = await contentBox(r.buffer!);
    // source product is ~788×1778 → ratio must survive
    expect(box.width / box.height).toBeCloseTo(788 / 1778, 1);
  });
  it.each([
    ["1:1", 1], ["4:5", 0.8], ["3:4", 0.75], ["16:9", 16 / 9],
  ])("supports aspect ratio %s", async (ratio, expected) => {
    const r = await ok(F["landscape-gray.jpg"], universal, { aspectRatio: ratio });
    expect(r.metadata.width / r.metadata.height).toBeCloseTo(expected, 1);
  });
  it("supports a custom ratio", async () => {
    const r = await ok(F["square-small-product.jpg"], universal, { aspectRatio: "custom", customAspect: "5:7" });
    expect(r.metadata.width / r.metadata.height).toBeCloseTo(5 / 7, 1);
  });
  it("auto ratio picks 4:5 for a tall product on a profile that allows it", async () => {
    const r = await ok(F["portrait-white.jpg"], flipkart);
    expect(r.metadata.width / r.metadata.height).toBeCloseTo(0.8, 2);
  });
  it("centers the product and keeps a safe margin", async () => {
    const r = await ok(F["square-small-product.jpg"], amazon);
    const b = await contentBox(r.buffer!);
    expect(b.x0).toBeGreaterThan(20);
    expect(b.y0).toBeGreaterThan(20);
    expect(b.imgW - 1 - b.x1).toBeGreaterThan(20);
    expect(b.imgH - 1 - b.y1).toBeGreaterThan(20);
    expect(Math.abs(b.x0 - (b.imgW - 1 - b.x1))).toBeLessThan(12);
    expect(Math.abs(b.y0 - (b.imgH - 1 - b.y1))).toBeLessThan(12);
  });
  it("honours product fill and position", async () => {
    const r60 = await ok(F["square-small-product.jpg"], universal, { productFill: 60 });
    const b60 = await contentBox(r60.buffer!);
    expect(Math.max(b60.width / b60.imgW, b60.height / b60.imgH)).toBeCloseTo(0.6, 1);
    const top = await ok(F["square-small-product.jpg"], universal, { productFill: 60, position: "top" });
    const bt = await contentBox(top.buffer!);
    expect(bt.y0).toBeLessThan(b60.y0);
  });
  it("upscales small sources to meet the profile minimum", async () => {
    const r = await ok(F["small.jpg"], amazon);
    expect(r.metadata.width).toBe(2000);
    expect(r.validation.errors).toEqual([]);
  });
  it("downsizes large sources", async () => {
    const r = await ok(F["large-complex.jpg"], meesho);
    expect(Math.max(r.metadata.width, r.metadata.height)).toBe(1200);
  });
});

describe("background handling", () => {
  it("white background is pure white at the edges", async () => {
    const r = await ok(F["large-complex.jpg"], amazon);
    const { data, info } = await sharp(r.buffer!).raw().toBuffer({ resolveWithObject: true });
    for (const [x, y] of [[0, 0], [info.width - 1, 0], [0, info.height - 1], [info.width - 1, info.height - 1], [info.width / 2, 2]]) {
      const i = (Math.floor(y!) * info.width + Math.floor(x!)) * info.channels;
      expect([data[i], data[i + 1], data[i + 2]]).toEqual([255, 255, 255]);
    }
    expect(r.validation.checks.find((c) => c.id === "amazon-white-background")?.status).toBe("pass");
  });
  it("removes a complex background around the product", async () => {
    const r = await ok(F["large-complex.jpg"], amazon);
    const b = await contentBox(r.buffer!, 255, 10);
    // bag is 2400×3000-ish svg; body 1344 wide → 0.45 of height; a leaked backdrop would make the box span the frame
    expect(b.width / b.imgW).toBeLessThan(0.7);
  });
  it("keeps a white product and its details", async () => {
    const r = await ok(F["white-on-white.jpg"], amazon);
    const { data, info } = await sharp(r.buffer!).raw().toBuffer({ resolveWithObject: true });
    // the blue label bar is near the vertical centre; body is ~#f6f6f6, not pure white → outline visible
    const cx = Math.floor(info.width / 2), cy = Math.floor(info.height / 2);
    const px = (x: number, y: number) => { const i = (y * info.width + x) * info.channels; return [data[i]!, data[i + 1]!, data[i + 2]!]; };
    const blues = [-60, -30, 0, 30, 60].map((dy) => px(cx - 20, cy + dy - 40)).filter(([r0, , b0]) => b0 > r0 + 40);
    expect(blues.length).toBeGreaterThan(0);
  });
  it("transparent background yields a PNG with real transparency", async () => {
    const r = await ok(F["portrait-white.jpg"], universal, { background: "transparent" });
    expect(r.metadata.format).toBe("png");
    expect(r.metadata.hasAlpha).toBe(true);
    expect(r.warnings.join()).toMatch(/JPEG cannot store transparency/);
    const { data } = await sharp(r.buffer!).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(data[3]).toBe(0);
  });
  it("custom background colour", async () => {
    const r = await ok(F["portrait-white.jpg"], universal, { background: "custom", customBackground: "#112233" });
    const { data } = await sharp(r.buffer!).raw().toBuffer({ resolveWithObject: true });
    expect(Math.abs(data[0]! - 0x11)).toBeLessThan(4);
    expect(Math.abs(data[2]! - 0x33)).toBeLessThan(4);
  });
  it("original background keeps the source backdrop", async () => {
    const r = await ok(F["landscape-gray.jpg"], universal, { background: "original" });
    const { data } = await sharp(r.buffer!).raw().toBuffer({ resolveWithObject: true });
    expect(data[0]).toBeGreaterThan(225);
    expect(data[0]).toBeLessThan(250); // #ececec, not pure white
  });
  it("transparent PNG source flattens onto white for JPEG output", async () => {
    const r = await ok(F["transparent.png"], amazon);
    const { data } = await sharp(r.buffer!).raw().toBuffer({ resolveWithObject: true });
    expect([data[0], data[1], data[2]]).toEqual([255, 255, 255]);
  });
});

describe("compression and formats", () => {
  it("meets a tight file-size limit and reports how", async () => {
    const tiny = { ...amazon, id: "tiny", maxFileSizeMB: 0.02 };
    const r = await ok(F["large-complex.jpg"], tiny, { enhancement: { level: "off" } });
    expect(r.metadata.fileSize).toBeLessThanOrEqual(0.02 * 1024 * 1024);
    expect(r.warnings.join()).toMatch(/file-size limit/);
  });
  it("quality changes file size", async () => {
    const hi = await ok(F["large-complex.jpg"], universal, { quality: 95 });
    const lo = await ok(F["large-complex.jpg"], universal, { quality: 55 });
    expect(lo.metadata.fileSize).toBeLessThan(hi.metadata.fileSize);
    expect(hi.metadata.quality).toBe(95);
  });
  it.each(["jpeg", "png", "webp"] as const)("encodes %s", async (format) => {
    const r = await ok(F["small.jpg"], universal, { format });
    expect(r.metadata.format).toBe(format);
    expect((await sharp(r.buffer!).metadata()).format).toBe(format);
  });
  it("enhancement off leaves the product colours untouched", async () => {
    const off = await ok(F["portrait-white.jpg"], universal, { enhancement: { level: "off" } });
    const std = await ok(F["portrait-white.jpg"], universal);
    const a = await sharp(off.buffer!).stats();
    const b = await sharp(std.buffer!).stats();
    for (let c = 0; c < 3; c++) expect(Math.abs(a.channels[c]!.mean - b.channels[c]!.mean)).toBeLessThan(3);
  });
  it("high enhancement never shifts channel means by more than a few levels", async () => {
    const off = await ok(F["portrait-white.jpg"], universal, { enhancement: { level: "off" } });
    const hi = await ok(F["portrait-white.jpg"], universal, { enhancement: { level: "high", sharpness: 45, brightness: 0, contrast: 4, saturation: 0, exposure: 0, noiseReduction: 15, detail: 25, upscale: true } });
    const a = await sharp(off.buffer!).stats();
    const b = await sharp(hi.buffer!).stats();
    for (let c = 0; c < 3; c++) expect(Math.abs(a.channels[c]!.mean - b.channels[c]!.mean)).toBeLessThan(6);
  });
});

describe("validation of produced images", () => {
  it("is READY for every built-in marketplace on a clean product photo", async () => {
    const { results } = await optimizeMultiple({ input: F["portrait-white.jpg"], marketplaces: BUILTIN_MARKETPLACES });
    for (const r of results) {
      expect(r.success).toBe(true);
      if (r.success) expect(r.validation.ready, `${r.marketplace}: ${r.validation.warnings.join()}${r.validation.errors.join()}`).toBe(true);
    }
  });
  it("reports failures honestly when an override contradicts the profile", async () => {
    const r = await ok(F["portrait-white.jpg"], amazon, { aspectRatio: "16:9", productFill: 50 });
    expect(r.validation.ready).toBe(false);
    expect(r.validation.warnings.join()).toMatch(/Aspect ratio/);
    expect(r.validation.warnings.join()).toMatch(/below recommended range/);
  });
  it("validates existing files against a profile", async () => {
    const dir = await tmpDir();
    const out = path.join(dir, "o.jpg");
    await ok(F["portrait-white.jpg"], amazon).then((r) => fs.writeFile(out, r.buffer!));
    expect((await validateImageFile(out, amazon)).valid).toBe(true);
    expect((await validateImageFile(out, { ...amazon, minWidth: 5000 })).valid).toBe(false);
  });
});

describe("errors never crash the pipeline", () => {
  it("reports corrupt and unsupported files as failures", async () => {
    const a = await optimizeImage({ input: F["corrupt.jpg"], marketplace: amazon });
    expect(a).toMatchObject({ success: false, error: { code: "CORRUPT_IMAGE" } });
    const b = await optimizeImage({ input: F["not-an-image.jpg"], marketplace: amazon });
    expect(b).toMatchObject({ success: false, error: { code: "UNSUPPORTED_FORMAT" } });
    const c = await optimizeImage({ input: "/definitely/not/here.jpg", marketplace: amazon });
    expect(c.success).toBe(false);
  });
  it("fails with 'Product could not be detected' on an empty frame", async () => {
    const blank = await sharp({ create: { width: 800, height: 800, channels: 3, background: "#ffffff" } }).jpeg().toBuffer();
    const r = await optimizeImage({ input: blank, marketplace: amazon });
    expect(r).toMatchObject({ success: false, error: { code: "PRODUCT_NOT_DETECTED", message: "Product could not be detected" } });
  });
  it("rejects invalid options and unknown marketplaces as failures", async () => {
    expect((await optimizeImage({ input: F["small.jpg"], marketplace: "nope" })).success).toBe(false);
    expect((await optimizeImage({ input: F["small.jpg"], marketplace: amazon, options: { quality: 5 } })).success).toBe(false);
  });
  it("external AI is refused unless explicitly allowed", async () => {
    const provider = { id: "fake", external: true, capabilities: { removeBackground: true, upscale: false, enhance: false }, removeBackground: async () => { throw new Error("must not be called"); }, upscale: async () => { throw new Error("x"); }, enhance: async () => { throw new Error("x"); } };
    const denied = await optimizeImage({ input: F["small.jpg"], marketplace: amazon, provider, options: { processingMode: "ai", allowExternal: false } });
    expect(denied).toMatchObject({ success: false, error: { code: "EXTERNAL_NOT_ALLOWED" } });
    const hybrid = await optimizeImage({ input: F["small.jpg"], marketplace: amazon, provider, options: { processingMode: "hybrid", allowExternal: false } });
    expect(hybrid.success).toBe(true);
    if (hybrid.success) expect(hybrid.warnings.join()).toMatch(/External AI processing is disabled/);
  });
  it("uses an external provider's cut-out only when allowed (and falls back on failure in hybrid)", async () => {
    let calls = 0;
    const provider = { id: "fake", external: true, capabilities: { removeBackground: true, upscale: false, enhance: false }, removeBackground: async () => { calls++; throw new Error("network down"); }, upscale: async () => { throw new Error("x"); }, enhance: async () => { throw new Error("x"); } };
    const r = await optimizeImage({ input: F["small.jpg"], marketplace: amazon, provider, options: { processingMode: "hybrid", allowExternal: true } });
    expect(calls).toBe(1);
    expect(r.success).toBe(true);
    if (r.success) expect(r.warnings.join()).toMatch(/AI provider failed/);
  });
});

describe("batch processing", () => {
  it("processes a mixed batch, isolates failures and writes the expected layout", async () => {
    const out = await tmpDir();
    const progress: number[] = [];
    const res = await optimizeBatch({
      inputs: [F["portrait-white.jpg"], F["corrupt.jpg"], F["landscape-gray.jpg"], F["not-an-image.jpg"], F["transparent.png"]],
      marketplaces: [amazon, flipkart, meesho],
      outputDir: out,
      concurrency: 2,
      onProgress: (p) => progress.push(p.done),
    });
    expect(res).toMatchObject({ total: 5, succeeded: 3, failed: 2 });
    expect(Math.max(...progress)).toBe(5);
    expect((await fs.readdir(out)).sort()).toEqual(["product-001", "product-003", "product-005"]);
    expect((await fs.readdir(path.join(out, "product-001"))).sort()).toEqual(["amazon", "flipkart", "meesho", "original.jpg"]);
    expect(await fs.readdir(path.join(out, "product-001", "flipkart"))).toEqual(["product-001-flipkart.jpg"]);
    expect(res.items[1]!.results[0]).toMatchObject({ success: false, error: { code: "CORRUPT_IMAGE" } });
    expect(res.items[3]!.results[0]).toMatchObject({ success: false, error: { code: "UNSUPPORTED_FORMAT" } });
    await expect(fs.readdir(path.join(out, "product-002"))).rejects.toThrow(); // no half-written output for failures
  });
  it("supports custom naming templates and SKUs", async () => {
    const out = await tmpDir();
    await optimizeBatch({ inputs: [{ path: F["small.jpg"], sku: "SKU-9" }], marketplaces: [amazon], outputDir: out, namingTemplate: "{sku}-{marketplace}.jpg" });
    expect(await fs.readdir(path.join(out, "product-001", "amazon"))).toEqual(["SKU-9-amazon.jpg"]);
  });
  it("cancels via AbortSignal without throwing", async () => {
    const out = await tmpDir();
    const ac = new AbortController();
    ac.abort();
    const res = await optimizeBatch({ inputs: [F["small.jpg"], F["small.jpg"]], marketplaces: [amazon], outputDir: out, signal: ac.signal });
    expect(res.failed).toBe(2);
    expect(res.items[0]!.results[0]).toMatchObject({ success: false, error: { code: "CANCELLED" } });
  });
  it("handles a large batch with bounded concurrency", async () => {
    const out = await tmpDir();
    const inputs = Array.from({ length: 60 }, () => F["small.jpg"]);
    const res = await optimizeBatch({ inputs, marketplaces: [universal], outputDir: out, concurrency: 4, copyOriginals: false });
    expect(res.succeeded).toBe(60);
  });
});
