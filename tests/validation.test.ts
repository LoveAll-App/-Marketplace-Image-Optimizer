import { describe, expect, it } from "vitest";
import { validate } from "@moi/validation";
import { amazon } from "../marketplace/amazon";
import { amazonRules } from "../marketplace/amazon";
import { VALIDATION_DISCLAIMER, type ValidationInput } from "@moi/shared";

const good: ValidationInput = {
  readable: true, width: 2000, height: 2000, format: "jpeg", fileSize: 300_000, hasAlpha: false,
  productBox: { x: 150, y: 150, width: 1700, height: 1700 }, edgeColor: { r: 255, g: 255, b: 255 }, requestedBackground: "white",
};

describe("validation engine", () => {
  it("passes a good image and never claims compliance", () => {
    const r = validate(good, amazon, amazonRules);
    expect(r.valid).toBe(true);
    expect(r.ready).toBe(true);
    expect(r.metadata.productFill).toBeCloseTo(85);
    expect(r.disclaimer).toBe(VALIDATION_DISCLAIMER);
    expect(JSON.stringify(r)).not.toMatch(/compliant/i);
    for (const id of ["resolution", "format", "fileSize", "aspectRatio", "productPositioning", "safeMargins"]) {
      expect(r.checks.find((c) => c.id === id)?.status, id).toBe("pass");
    }
  });
  it("fails on resolution and format", () => {
    const r = validate({ ...good, width: 800, height: 800, format: "webp" }, amazon);
    expect(r.valid).toBe(false);
    expect(r.errors.join(" ")).toMatch(/below 1000/);
    expect(r.errors.join(" ")).toMatch(/WEBP/);
  });
  it("warns when file size exceeds the configured limit", () => {
    const r = validate({ ...good, fileSize: 11 * 1024 * 1024 }, amazon);
    expect(r.valid).toBe(true);
    expect(r.ready).toBe(false);
    expect(r.warnings).toContain("File size exceeds configured limit of 10 MB");
  });
  it("warns about aspect ratio, low fill, close-to-edge and empty space", () => {
    expect(validate({ ...good, width: 2000, height: 1500 }, amazon).warnings.join()).toMatch(/Aspect ratio/);
    expect(validate({ ...good, productBox: { x: 800, y: 800, width: 400, height: 400 } }, amazon).warnings.join()).toMatch(/below recommended range/);
    expect(validate({ ...good, productBox: { x: 800, y: 800, width: 400, height: 400 } }, amazon).warnings.join()).toMatch(/empty space/);
    expect(validate({ ...good, productBox: { x: 2, y: 100, width: 1700, height: 1700 } }, amazon).warnings.join()).toMatch(/too close to the edge/);
  });
  it("fails when the product is cropped", () => {
    const r = validate({ ...good, productBox: { x: -50, y: 100, width: 1700, height: 1700 } }, amazon);
    expect(r.valid).toBe(false);
    expect(r.errors.join()).toMatch(/beyond the image/);
  });
  it("reports unreadable / corrupted images", () => {
    const r = validate({ ...good, readable: false }, amazon);
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toMatch(/corrupted/);
  });
  it("runs marketplace-specific rules (amazon white background)", () => {
    const r = validate({ ...good, edgeColor: { r: 240, g: 240, b: 240 } }, amazon, amazonRules);
    expect(r.warnings.join()).toMatch(/not pure white/);
  });
  it("flags alpha channels on flat profiles", () => {
    expect(validate({ ...good, hasAlpha: true }, amazon, amazonRules).ready).toBe(false);
  });
});
