import sharp from "sharp";
import fs from "node:fs";
const [, , outFile, ...files] = process.argv;
const cell = 400;
const tiles = await Promise.all(files.map((f) => sharp(f).resize(cell, cell, { fit: "contain", background: "#ff00ff" }).png().toBuffer()));
const cols = Math.min(4, tiles.length), rows = Math.ceil(tiles.length / cols);
await sharp({ create: { width: cols * (cell + 8), height: rows * (cell + 8), channels: 3, background: "#444" } })
  .composite(tiles.map((input, i) => ({ input, left: (i % cols) * (cell + 8) + 4, top: Math.floor(i / cols) * (cell + 8) + 4 })))
  .png().toFile(outFile!);
console.log("ok", fs.statSync(outFile!).size);
