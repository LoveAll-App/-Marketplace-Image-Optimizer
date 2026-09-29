# Marketplace Image Optimizer

**One Product Photo → Marketplace Ready Everywhere.**

A local-first tool that turns raw product photos into marketplace-ready images for **Amazon
India, Flipkart, and Meesho** (plus a general-purpose **Universal** profile) — background
removal, smart cropping/centering, padding, enhancement, resizing, compression, and validation,
all in one pass. Unlimited personal use: no credits, no daily caps, no per-image billing.

Everything runs on your machine with [Sharp](https://sharp.pixelplumbing.com)/libvips. No image
ever leaves your computer unless you explicitly turn on an external AI provider.

---

## Contents

- [Installation](#installation)
- [Development](#development)
- [Production build](#production-build)
- [Architecture](#architecture)
- [The image-processing pipeline](#the-image-processing-pipeline)
- [Marketplace profiles](#marketplace-profiles)
- [Adding a new marketplace](#adding-a-new-marketplace)
- [CLI usage](#cli-usage)
- [AI provider configuration](#ai-provider-configuration)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

## Installation

Requirements: **Node.js 20+** and npm. (Developed against Node 26 / npm 11.)

```bash
npm install
```

This installs the whole workspace (web app, local API server, CLI, and shared packages) in one
step — it's a single npm workspaces monorepo, not separate projects.

## Development

```bash
npm run dev
```

This starts two processes:

- **API / image engine** — an Express server on `http://127.0.0.1:4780`, bound to localhost only.
  All image processing (Sharp) happens here.
- **Web app** — Vite dev server on `http://127.0.0.1:5173`, proxying `/api` to the server above.

Open **http://127.0.0.1:5173**. Uploads, processing, and downloads all go through the local API;
nothing is sent anywhere else unless you turn on AI/Hybrid processing in Settings and explicitly
allow external processing for a job.

Useful scripts:

```bash
npm run test        # vitest — unit + integration tests (generates its own fixture images)
npm run typecheck    # tsc --noEmit across the whole workspace
npm run lint         # eslint
npm run check        # typecheck + lint + test
npm run fixtures     # (re)generate the sample images under tests/fixtures/samples
npm run cli -- ...   # run the CLI from source, see below
```

## Production build

```bash
npm run build   # builds the web app to apps/web/dist
npm run start   # starts the API server, which also serves apps/web/dist
```

Then open `http://127.0.0.1:4780`. Set `PORT` to change the port. The server only ever binds to
`127.0.0.1` and rejects requests with a non-local `Host`/`Origin` header, so it's not reachable
from other machines on your network.

### Desktop packaging

The engineering brief prefers Tauri for a lightweight desktop build. This environment has no Rust
toolchain, so the app ships as the React + Node setup above, built so packaging is a thin wrapper
later: `apps/server` is a plain Express app that can be spawned by an Electron/Tauri main process
and pointed at the bundled `apps/web/dist`, or wrapped as a Tauri "sidecar" binary. No changes to
`packages/*` would be needed either way.

## Architecture

```
marketplace-image-optimizer/
├── marketplace/                 Marketplace configs + their validation rules
│   ├── amazon.ts  flipkart.ts  meesho.ts  universal.ts  index.ts
├── packages/
│   ├── shared/                  Types, Zod schemas, defaults, filename/aspect-ratio utils
│   ├── marketplace-rules/       Marketplace registry: resolve/select/validate profiles
│   ├── validation/              Pure validation engine (facts in, ValidationResult out)
│   ├── processing-queue/        Generic bounded-concurrency job queue (pause/cancel/retry)
│   └── image-engine/            The pipeline: detection, layout, enhancement, encoding,
│                                 batch processing, provider interface
├── apps/
│   ├── server/                  Express API (uploads, processing, ZIP export, housekeeping)
│   ├── web/                     React + TypeScript + Vite + Tailwind UI
│   ├── cli/                     `marketplace-optimizer` CLI (thin wrapper over image-engine)
│   └── desktop/                 (reserved for the Electron/Tauri shell)
├── tests/                       Vitest suite + programmatically generated fixture images
└── scripts/                     Fixture generation, ad-hoc dev scripts
```

Data flow for a job: the web app uploads files to the server (`/api/upload`), which stores them
under a temp directory; `/api/process` creates a `Batch` backed by a `JobQueue` from
`@moi/processing-queue`; each job calls `optimizeMultiple` from `@moi/image-engine` once per image
(sharing product detection across every selected marketplace), and results are polled by the web
app and written to disk for download / ZIP export. The CLI and the server both call into the same
`@moi/image-engine` functions — there is exactly one implementation of the pipeline.

## The image-processing pipeline

Implemented in [`packages/image-engine/src`](packages/image-engine/src):

```
upload → analysis → product detection → background detection → background removal →
product isolation → smart cropping → smart centering → padding → background generation →
enhancement → marketplace resize → compression → validation → preview → download
```

- **Product detection** ([`detect.ts`](packages/image-engine/src/detect.ts)) samples the border
  colour(s), flood-fills the background from the frame inward, and keeps everything else as the
  product — including enclosed regions that match the background colour, so white products on
  white backgrounds and small logos survive. Open loops (bag handles, mug handles) are detected
  and treated as background only when they're small and thin-walled, so a large white product
  body is never eaten by mistake.
- **Smart cropping/centering/padding** ([`layout.ts`](packages/image-engine/src/layout.ts)) is
  pure geometry: it computes the canvas for the chosen aspect ratio, then places the product at
  the requested fill % and position without ever letting it touch the edge or exceed the profile's
  safe margin. The product is always scaled uniformly — never stretched.
- **Enhancement** ([`enhance.ts`](packages/image-engine/src/enhance.ts)) applies bounded,
  order-guaranteed adjustments (noise reduction → exposure/contrast → brightness/saturation →
  sharpen → detail) that keep colours, logos, and shapes faithful — this is an e-commerce prep
  tool, not a generative one.
- **Compression** ([`encode.ts`](packages/image-engine/src/encode.ts)) encodes at the requested
  quality, and if a marketplace file-size limit is set, binary-searches for the highest quality
  that fits before (only as a last resort) shrinking dimensions — never below the profile's
  minimum.
- **Validation** ([`packages/validation`](packages/validation/src/index.ts)) is a pure function:
  facts about the produced image in, a `ValidationResult` out. It never claims an image is
  "Amazon/Flipkart/Meesho compliant" — every result carries the disclaimer *"Validated against
  your configured marketplace profile."*, because marketplace rules change and only your current
  configuration is actually checked.

Errors never crash a run: every stage that can fail (unsupported format, corrupt image, no
product detected, provider failure) is caught and turned into a typed `{ success: false, error }`
result, both for a single image and for a whole batch.

## Marketplace profiles

Profiles are plain, editable, JSON-serialisable config — see
[`packages/shared/src/types.ts`](packages/shared/src/types.ts) `MarketplaceConfig` and
[`marketplace/amazon.ts`](marketplace/amazon.ts) / [`flipkart.ts`](marketplace/flipkart.ts) /
[`meesho.ts`](marketplace/meesho.ts) / [`universal.ts`](marketplace/universal.ts) for the
defaults. **These defaults are a starting point, not a guarantee** — marketplace image
requirements change over time; verify them against each marketplace's current seller guidelines
and adjust in the app's **Marketplace Profiles** page (or the JSON files) as needed.

Each profile can also carry marketplace-specific validation rules (e.g. Amazon's "main image
should be pure white") registered in [`marketplace/index.ts`](marketplace/index.ts).

## Adding a new marketplace

No changes to the image engine are needed — only a config:

1. In the app: **Marketplace Profiles → New profile**, fill in the fields (or paste JSON), save.
2. Or as code: add `marketplace/<id>.ts` exporting a `MarketplaceConfig` (and optionally an array
   of `ValidationRule`s), then add one line to `marketplace/index.ts`.

This is how Myntra, Snapdeal, Etsy, eBay, Shopify, or Walmart profiles would be added.

## CLI usage

```bash
node apps/cli/bin/marketplace-optimizer.mjs <file|folder>... [options]
# or, from the repo root:
npm run cli -- <file|folder>... [options]
```

Examples:

```bash
marketplace-optimizer input.jpg --marketplace amazon
marketplace-optimizer ./products --marketplace amazon,flipkart,meesho --background white --quality 90
marketplace-optimizer ./products --marketplace all --output ./optimized
marketplace-optimizer --validate ./optimized/product-001/amazon/product-001-amazon.jpg -m amazon
marketplace-optimizer --list
```

Run `marketplace-optimizer --help` for the full option list (aspect ratio, product fill, position,
enhancement level, naming template, concurrency, custom profiles via `--profiles`, etc).

## AI provider configuration

Background removal, upscaling, and enhancement are implemented locally by default (fully
`sharp`/libvips based — see `LocalProvider` in
[`providers.ts`](packages/image-engine/src/providers.ts)). Optional external providers plug into
the same `ImageEnhancementProvider` interface:

```ts
interface ImageEnhancementProvider {
  removeBackground(image: File): Promise<Blob>;
  upscale(image: File): Promise<Blob>;
  enhance(image: File): Promise<Blob>;
}
```

- **remove.bg** — set a key in Settings, or `REMOVE_BG_API_KEY` for the CLI/server.
- **Generic HTTP** — point at any self-hosted service (e.g. `rembg s`) via `MOI_HTTP_PROVIDER_URL`.

External processing is opt-in per job: the UI shows *"⚠ This operation sends the image to an
external AI provider"* and requires you to allow it; if it's not allowed, Hybrid mode silently
falls back to local processing (and says so in the result's warnings), while AI-only mode refuses
with a clear error instead of doing something unexpected.

## Testing

```bash
npm run test
```

90 tests across product detection, aspect ratio/canvas/placement geometry, filename generation
(including path-traversal sanitisation), the validation engine, marketplace configuration, the
job queue (concurrency, pause/resume/cancel, retry, scale to hundreds of jobs), and the full
pipeline (backgrounds, compression, formats, batch processing, error isolation). Fixtures
(portrait/landscape/square, transparent PNG, a large complex-background JPEG, a tiny JPEG, an
EXIF-rotated JPEG, a white-on-white product, a corrupted JPEG, and a non-image) are generated
programmatically by [`tests/fixtures/generate.ts`](tests/fixtures/generate.ts) — nothing binary is
committed.

## Troubleshooting

- **"Engine offline" in the header** — the API server isn't running; run `npm run dev` (or
  `npm run start` after `npm run build`).
- **"Product could not be detected"** — the image has no distinguishable background (a full-bleed
  photo, or a background too close in colour to the product across the whole frame). Try a photo
  with a clearer background, or use "Original background" mode.
- **A marketplace check shows a warning, not an error** — warnings (aspect ratio drift, low
  product fill, file size over a soft limit) don't block the output; failures (`errors`) do. See
  the validation checklist in the compare view for exactly which check triggered.
- **Uploads rejected** — only readable images in a supported format are accepted; the reason is
  shown per file. Corrupt or non-image files never take down the rest of a batch.
