import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateFixtures } from "../tests/fixtures/generate";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../tests/fixtures/samples");
const files = await generateFixtures(dir);
console.log(`Wrote ${Object.keys(files).length} sample images to ${dir}`);
