import { describe, expect, it } from "vitest";
import { buildFilename, parseRatio, sanitizeFilename } from "@moi/shared";

describe("filename generation", () => {
  const ctx = { original: "IMG_20260928_123456.jpg", index: 1, marketplace: "amazon", extension: "jpeg" };
  it("generates clean names from camera filenames", () => {
    expect(buildFilename(undefined, ctx)).toBe("product-001-amazon.jpg");
    expect(buildFilename(undefined, { ...ctx, marketplace: "flipkart", index: 12 })).toBe("product-012-flipkart.jpg");
  });
  it("supports custom templates with {sku}", () => {
    expect(buildFilename("{sku}-{marketplace}.jpg", { ...ctx, sku: "SHOE 42/blue" })).toBe("SHOE-42-blue-amazon.jpg");
    expect(buildFilename("{product}_{index}", ctx)).toBe("product-001_001.jpg");
  });
  it("derives the extension from the output format, not the template", () => {
    expect(buildFilename("{product}.png", { ...ctx, extension: "webp" })).toBe("product-001.webp");
  });
  it("can keep the original name", () => {
    expect(buildFilename("{product}", { ...ctx, original: "My Shoe (1).PNG", productNameMode: "original" })).toBe("My-Shoe-1.jpg");
  });
  it("neutralises path traversal and hostile names", () => {
    for (const evil of ["../../etc/passwd", "..\\..\\windows\\system32", "/abs/path", "a/../../b", "....//x", "con", "\u0000bad"]) {
      const s = sanitizeFilename(evil);
      expect(s).not.toMatch(/[\\/]/);
      expect(s).not.toMatch(/\.\./);
      expect(s.startsWith(".")).toBe(false);
      expect(s.length).toBeGreaterThan(0);
    }
    expect(buildFilename("{sku}", { ...ctx, sku: "../../secret" })).not.toContain("/");
  });
  it("falls back for empty names and limits length", () => {
    expect(sanitizeFilename("")).toBe("file");
    expect(sanitizeFilename("x".repeat(500)).length).toBeLessThanOrEqual(100);
  });
});

describe("ratio parsing", () => {
  it("parses", () => {
    expect(parseRatio("4:5")).toBeCloseTo(0.8);
    expect(parseRatio("16x9")).toBeCloseTo(16 / 9);
    expect(parseRatio("1.5")).toBe(1.5);
    expect(parseRatio("0:5")).toBeNull();
    expect(parseRatio("abc")).toBeNull();
  });
});
