import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

/** A "bag": rounded body, handle ring (hole), strap, and a white label with dark text-ish bars. */
const bagSvg = (w: number, h: number, body = "#c0392b") => `
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${body}"/><stop offset="1" stop-color="#7b241c"/></linearGradient></defs>
  <path d="M ${w * 0.32} ${h * 0.34} C ${w * 0.32} ${h * 0.05}, ${w * 0.68} ${h * 0.05}, ${w * 0.68} ${h * 0.34}" fill="none" stroke="#2c1a17" stroke-width="${w * 0.03}"/>
  <rect x="${w * 0.22}" y="${h * 0.3}" width="${w * 0.56}" height="${h * 0.62}" rx="${w * 0.06}" fill="url(#g)"/>
  <rect x="${w * 0.34}" y="${h * 0.5}" width="${w * 0.32}" height="${h * 0.14}" fill="#ffffff"/>
  <rect x="${w * 0.37}" y="${h * 0.54}" width="${w * 0.26}" height="${h * 0.02}" fill="#222"/>
  <rect x="${w * 0.37}" y="${h * 0.58}" width="${w * 0.18}" height="${h * 0.02}" fill="#222"/>
</svg>`;

const shoeSvg = (w: number, h: number) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <ellipse cx="${w * 0.5}" cy="${h * 0.7}" rx="${w * 0.36}" ry="${h * 0.1}" fill="#1b4f72"/>
  <path d="M ${w * 0.16} ${h * 0.7} C ${w * 0.16} ${h * 0.35}, ${w * 0.42} ${h * 0.3}, ${w * 0.5} ${h * 0.48} L ${w * 0.84} ${h * 0.7} Z" fill="#2e86c1"/>
  <rect x="${w * 0.14}" y="${h * 0.7}" width="${w * 0.72}" height="${h * 0.06}" rx="${h * 0.03}" fill="#f4f6f7"/>
</svg>`;

const svg = (s: string) => Buffer.from(s);

/** Place an SVG product on a background image */
async function onBackground(bg: sharp.Sharp, product: Buffer, left: number, top: number) {
  return bg.composite([{ input: product, left, top }]);
}

const solid = (w: number, h: number, color: string) => sharp({ create: { width: w, height: h, channels: 3, background: color } });

async function complexBackground(w: number, h: number): Promise<Buffer> {
  const stripes = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${Array.from({ length: 24 }, (_, i) => `<rect x="0" y="${(i * h) / 24}" width="${w}" height="${h / 24}" fill="${i % 2 ? "#5d6d7e" : "#85929e"}"/>`).join("")}</svg>`;
  const noise = await sharp({ create: { width: w, height: h, channels: 3, background: "#808080", noise: { type: "gaussian", mean: 128, sigma: 25 } } }).png().toBuffer();
  return sharp(svg(stripes)).composite([{ input: noise, blend: "overlay" }]).jpeg({ quality: 90 }).toBuffer();
}

export const FIXTURE_NAMES = [
  "portrait-white.jpg",
  "landscape-gray.jpg",
  "square-small-product.jpg",
  "transparent.png",
  "large-complex.jpg",
  "small.jpg",
  "exif-rotated.jpg",
  "white-on-white.jpg",
  "corrupt.jpg",
  "not-an-image.jpg",
] as const;

/** Writes every sample image into `dir` and returns their paths by name. */
export async function generateFixtures(dir: string): Promise<Record<(typeof FIXTURE_NAMES)[number], string>> {
  await fs.mkdir(dir, { recursive: true });
  const out = {} as Record<(typeof FIXTURE_NAMES)[number], string>;
  const write = async (name: (typeof FIXTURE_NAMES)[number], data: Buffer) => {
    const p = path.join(dir, name);
    await fs.writeFile(p, data);
    out[name] = p;
  };

  // portrait product on white, 2000×3000, product roughly 1100×1900
  await write("portrait-white.jpg", await (await onBackground(solid(2000, 3000, "#ffffff"), svg(bagSvg(1400, 2200)), 300, 400)).jpeg({ quality: 92 }).toBuffer());
  // landscape on light gray studio background
  await write("landscape-gray.jpg", await (await onBackground(solid(3000, 2000, "#ececec"), svg(shoeSvg(2000, 1200)), 500, 400)).jpeg({ quality: 92 }).toBuffer());
  // square, small product in a big white frame (1500 → product 30%)
  await write("square-small-product.jpg", await (await onBackground(solid(1500, 1500, "#ffffff"), svg(bagSvg(520, 640)), 490, 430)).jpeg({ quality: 92 }).toBuffer());
  // transparent PNG cut-out
  await write(
    "transparent.png",
    await sharp({ create: { width: 1200, height: 1200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: svg(shoeSvg(1000, 700)), left: 100, top: 250 }])
      .png()
      .toBuffer(),
  );
  // large JPEG with a complex (striped + noisy) background
  const bigBg = await complexBackground(6000, 4000);
  await write("large-complex.jpg", await sharp(bigBg).composite([{ input: svg(bagSvg(2400, 3000)), left: 1800, top: 500 }]).jpeg({ quality: 88 }).toBuffer());
  // tiny JPEG
  await write("small.jpg", await (await onBackground(solid(400, 400, "#ffffff"), svg(shoeSvg(300, 200)), 50, 100)).jpeg({ quality: 90 }).toBuffer());
  // EXIF orientation 6 (needs a 90° clockwise turn): stored landscape, displays portrait
  const stored = await (await onBackground(solid(3000, 2000, "#ffffff"), svg(bagSvg(800, 1300).replace(/width="800" height="1300"/, 'width="800" height="1300"')), 1100, 350)).jpeg({ quality: 90 }).withMetadata({ orientation: 6 }).toBuffer();
  await write("exif-rotated.jpg", stored);
  // white-ish product on a white background (must not be eaten)
  const whiteMug = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900"><rect x="150" y="200" width="500" height="560" rx="60" fill="#f6f6f6" stroke="#b5b5b5" stroke-width="10"/><path d="M 650 330 C 800 330 800 620 650 620" fill="none" stroke="#b5b5b5" stroke-width="40"/><rect x="230" y="400" width="340" height="60" fill="#3a6ea5"/></svg>`;
  await write("white-on-white.jpg", await (await onBackground(solid(1200, 1200, "#ffffff"), svg(whiteMug), 150, 150)).jpeg({ quality: 92 }).toBuffer());
  // corrupt: a valid JPEG truncated in the middle
  const good = await solid(800, 800, "#ffffff").jpeg().toBuffer();
  await write("corrupt.jpg", good.subarray(0, Math.floor(good.length / 3)));
  await write("not-an-image.jpg", Buffer.from("this is definitely not an image"));
  return out;
}
