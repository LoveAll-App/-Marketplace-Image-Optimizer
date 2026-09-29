import { describe, expect, it } from "vitest";
import { BUILTIN_MARKETPLACES, getRules, parseMarketplaceConfig, selectMarketplaces } from "@moi/marketplace-rules";
import { marketplaceConfigSchema, type MarketplaceConfig } from "@moi/shared";
import { optimizeImage } from "@moi/image-engine";
import { fixtures } from "./helpers";

describe("marketplace configuration", () => {
  it("ships amazon, flipkart, meesho and universal", () => {
    expect(BUILTIN_MARKETPLACES.map((m) => m.id)).toEqual(["amazon", "flipkart", "meesho", "universal"]);
  });
  it("every built-in profile satisfies the schema", () => {
    for (const m of BUILTIN_MARKETPLACES) expect(() => marketplaceConfigSchema.parse(m), m.id).not.toThrow();
  });
  it("selects by list or 'all'", () => {
    expect(selectMarketplaces("amazon, meesho").map((m) => m.id)).toEqual(["amazon", "meesho"]);
    expect(selectMarketplaces("all")).toHaveLength(4);
    expect(() => selectMarketplaces("nope")).toThrow(/Unknown marketplace/);
  });
  it("rejects invalid profiles", () => {
    expect(() => parseMarketplaceConfig({ id: "Bad Id" })).toThrow();
    expect(() => parseMarketplaceConfig({ ...BUILTIN_MARKETPLACES[0], minWidth: 5000, maxWidth: 100 })).toThrow();
  });
  it("attaches marketplace-specific rules", () => {
    expect(getRules("amazon").length).toBeGreaterThan(0);
    expect(getRules("unknown")).toEqual([]);
  });

  it("a new marketplace needs only a config — no engine changes", async () => {
    const { files } = await fixtures();
    const myntra: MarketplaceConfig = {
      id: "myntra", name: "Myntra", supportedFormats: ["jpeg"], minWidth: 1080, minHeight: 1440, aspectRatios: ["3:4"],
      backgroundMode: "white", jpegQuality: 88, defaultFormat: "jpeg", targetSize: 1440, safeMarginPercent: 5, recommendedProductFillPercent: 80,
    };
    const r = await optimizeImage({ input: files["portrait-white.jpg"], marketplace: myntra });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.metadata.width).toBe(1080);
      expect(r.metadata.height).toBe(1440);
      expect(r.validation.ready).toBe(true);
    }
  });
});
