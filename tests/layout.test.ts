import { describe, expect, it } from "vitest";
import { computeCanvas, computePlacement, resolveAspectRatio } from "@moi/image-engine";

describe("aspect ratio resolution", () => {
  it("resolves explicit ratios", () => {
    expect(resolveAspectRatio("1:1", "", 0.5, {})).toBe(1);
    expect(resolveAspectRatio("4:5", "", 2, {})).toBeCloseTo(0.8);
    expect(resolveAspectRatio("16:9", "", 1, {})).toBeCloseTo(16 / 9);
    expect(resolveAspectRatio("3:4", "", 1, {})).toBeCloseTo(0.75);
  });
  it("supports custom ratios", () => {
    expect(resolveAspectRatio("custom", "5:7", 1, {})).toBeCloseTo(5 / 7);
    expect(resolveAspectRatio("custom", "garbage", 1, {})).toBe(1);
  });
  it("auto snaps to the closest ratio the marketplace allows", () => {
    const cfg = { aspectRatios: ["1:1", "4:5"] };
    expect(resolveAspectRatio("auto", "", 0.78, cfg)).toBeCloseTo(0.8);
    expect(resolveAspectRatio("auto", "", 1.4, cfg)).toBe(1);
    expect(resolveAspectRatio("auto", "", 0.5, { aspectRatios: ["1:1"] })).toBe(1);
  });
});

describe("canvas sizing", () => {
  const none = {};
  it("uses the target size for the longest side", () => {
    expect(computeCanvas(1, 2000, none)).toEqual({ width: 2000, height: 2000 });
    expect(computeCanvas(0.8, 1600, none)).toEqual({ width: 1280, height: 1600 });
    expect(computeCanvas(16 / 9, 1600, none)).toEqual({ width: 1600, height: 900 });
  });
  it("raises the canvas to meet minimum dimensions, keeping the ratio", () => {
    const c = computeCanvas(0.8, 800, { minWidth: 1000, minHeight: 1000 });
    expect(c.width).toBeGreaterThanOrEqual(1000);
    expect(c.height).toBeGreaterThanOrEqual(1000);
    expect(c.width / c.height).toBeCloseTo(0.8, 2);
  });
  it("caps at maximum dimensions", () => {
    const c = computeCanvas(1, 5000, { maxWidth: 3000, maxHeight: 3000 });
    expect(c).toEqual({ width: 3000, height: 3000 });
  });
});

describe("product placement", () => {
  const canvas = { width: 1000, height: 1000 };
  const base = { canvas, safeMarginPercent: 4, position: "center" as const };

  it("centers by default and preserves the product aspect ratio", () => {
    const p = computePlacement({ ...base, product: { width: 500, height: 1000 }, fillPercent: 80 });
    expect(p.height / p.width).toBeCloseTo(2, 1);
    expect(p.x + p.width / 2).toBeCloseTo(500, 0);
    expect(p.y + p.height / 2).toBeCloseTo(500, 0);
  });

  it("hits the requested fill on the product's longest relative dimension", () => {
    const p = computePlacement({ ...base, product: { width: 400, height: 800 }, fillPercent: 70 });
    expect(p.height).toBeCloseTo(700, -1);
  });

  it.each([50, 55, 60, 65, 70, 75, 80, 85, 90])("never touches the boundary at fill %i%%", (fill) => {
    for (const product of [{ width: 100, height: 100 }, { width: 900, height: 100 }, { width: 100, height: 900 }]) {
      for (const position of ["center", "top", "bottom", "left", "right", "custom"] as const) {
        const p = computePlacement({ ...base, product, fillPercent: fill, position, customPosition: { x: 0, y: 1 } });
        expect(p.x).toBeGreaterThanOrEqual(p.marginPx);
        expect(p.y).toBeGreaterThanOrEqual(p.marginPx);
        expect(p.x + p.width).toBeLessThanOrEqual(canvas.width - p.marginPx);
        expect(p.y + p.height).toBeLessThanOrEqual(canvas.height - p.marginPx);
      }
    }
  });

  it("caps an excessive fill to keep the safe margin", () => {
    const p = computePlacement({ ...base, product: { width: 100, height: 100 }, fillPercent: 100 });
    expect(p.appliedFillPercent).toBeLessThan(100);
    expect(p.x).toBeGreaterThanOrEqual(p.marginPx);
  });

  it("positions top / bottom / left / right against the safe margin", () => {
    const prod = { width: 300, height: 300 };
    const top = computePlacement({ ...base, product: prod, fillPercent: 50, position: "top" });
    const bottom = computePlacement({ ...base, product: prod, fillPercent: 50, position: "bottom" });
    const left = computePlacement({ ...base, product: prod, fillPercent: 50, position: "left" });
    const right = computePlacement({ ...base, product: prod, fillPercent: 50, position: "right" });
    expect(top.y).toBe(top.marginPx);
    expect(bottom.y + bottom.height).toBe(1000 - bottom.marginPx);
    expect(left.x).toBe(left.marginPx);
    expect(right.x + right.width).toBe(1000 - right.marginPx);
    expect(top.x + top.width / 2).toBeCloseTo(500, 0);
  });

  it("supports a custom position", () => {
    const p = computePlacement({ ...base, product: { width: 300, height: 300 }, fillPercent: 50, position: "custom", customPosition: { x: 0.25, y: 0.75 } });
    expect(p.x).toBeLessThan(p.y);
  });
});
