import path from "node:path";
import { optimizeBatch } from "@moi/image-engine";
import { BUILTIN_MARKETPLACES } from "@moi/marketplace-rules";

const dir = "tests/fixtures/samples";
const names = ["portrait-white.jpg", "landscape-gray.jpg", "square-small-product.jpg", "transparent.png", "large-complex.jpg", "small.jpg", "exif-rotated.jpg", "white-on-white.jpg", "corrupt.jpg", "not-an-image.jpg"];
const t = Date.now();
const r = await optimizeBatch({ inputs: names.map((n) => path.join(dir, n)), marketplaces: BUILTIN_MARKETPLACES, outputDir: ".tmp/out", concurrency: 2, options: process.env.BG ? { background: process.env.BG as never } : {} });
console.log(`${r.succeeded}/${r.total} ok in ${Date.now() - t}ms`);
for (const it of r.items) {
  for (const x of it.results) {
    if (x.success) console.log(it.productFolder, x.marketplace, `${x.metadata.width}x${x.metadata.height} ${x.metadata.format} ${(x.metadata.fileSize / 1024).toFixed(0)}KB fill=${x.validation.metadata.productFill.toFixed(0)} ready=${x.validation.ready}`, x.validation.warnings.concat(x.validation.errors, x.warnings).join(" | "));
    else console.log(it.productFolder, path.basename(it.input), x.marketplace, "FAIL", x.error.code, x.error.message);
  }
}
