import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { generateFixtures } from "./fixtures/generate";

export async function tmpDir(prefix = "moi-test-"): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function fixtures() {
  const dir = await tmpDir("moi-fixtures-");
  return { dir, files: await generateFixtures(dir) };
}

/** Bounding box of pixels that differ from `bg` by more than `tol` */
export async function contentBox(buf: Buffer, bg = 255, tol = 12) {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let x0 = info.width, y0 = info.height, x1 = -1, y1 = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 3;
      if (Math.abs(data[i]! - bg) > tol || Math.abs(data[i + 1]! - bg) > tol || Math.abs(data[i + 2]! - bg) > tol) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  return { x0, y0, x1, y1, width: x1 - x0 + 1, height: y1 - y0 + 1, imgW: info.width, imgH: info.height };
}
