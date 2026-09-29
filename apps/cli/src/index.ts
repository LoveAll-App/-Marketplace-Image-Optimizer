import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { BUILTIN_MARKETPLACES, parseMarketplaceConfig, selectMarketplaces } from "@moi/marketplace-rules";
import { collectInputs, createProvider, optimizeBatch, validateImageFile } from "@moi/image-engine";
import { ENHANCEMENT_PRESETS, formatBytes, parseOptions, type MarketplaceConfig, type OptimizeOptions } from "@moi/shared";
import { getRules } from "@moi/marketplace-rules";

const HELP = `Marketplace Image Optimizer — One Product Photo → Marketplace Ready Everywhere

Usage
  marketplace-optimizer <file|folder>... [options]
  marketplace-optimizer --validate <image> --marketplace amazon

Options
  -m, --marketplace <ids>   Comma list or "all"            (default: universal)
  -o, --output <dir>        Output folder                  (default: ./optimized)
  -b, --background <mode>   auto | white | transparent | original | #RRGGBB   (default: auto)
  -q, --quality <50-100>    JPEG/WebP quality              (default: marketplace profile)
  -f, --format <fmt>        auto | jpeg | png | webp       (default: auto)
  -a, --aspect <ratio>      auto | 1:1 | 4:5 | 3:4 | 16:9 | W:H
      --fill <50-90>        Product fill %                 (default: profile recommendation)
      --position <pos>      center | top | bottom | left | right
      --enhance <level>     off | standard | high          (default: standard)
      --size <px>           Override the longest output side
      --template <tpl>      File name template, tokens {product} {sku} {marketplace} {index}
      --sku <sku>           SKU for a single input (used by {sku})
      --name-mode <mode>    sequential | original          (default: sequential → product-001)
  -c, --concurrency <n>     Parallel images                (default: 2)
  -r, --recursive           Also read sub-folders of input folders
      --no-originals        Do not copy originals into the output folders
      --processing <mode>   local | ai | hybrid            (default: local)
      --provider <name>     removebg | http  (needs REMOVE_BG_API_KEY / MOI_HTTP_PROVIDER_URL)
      --allow-external      Permit sending images to an external AI provider
      --profiles <file>     JSON file with extra marketplace profiles
      --validate <image>    Only validate an existing image against --marketplace
      --json                Machine-readable summary
      --list                List marketplace profiles
  -h, --help                Show this help

Examples
  marketplace-optimizer input.jpg --marketplace amazon
  marketplace-optimizer ./products --marketplace amazon,flipkart,meesho --background white --quality 90
  marketplace-optimizer ./products --marketplace all --output ./optimized
`;

export async function main(argv: string[]): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        marketplace: { type: "string", short: "m", default: "universal" },
        output: { type: "string", short: "o", default: "./optimized" },
        background: { type: "string", short: "b" },
        quality: { type: "string", short: "q" },
        format: { type: "string", short: "f" },
        aspect: { type: "string", short: "a" },
        fill: { type: "string" },
        position: { type: "string" },
        enhance: { type: "string" },
        size: { type: "string" },
        template: { type: "string" },
        sku: { type: "string" },
        "name-mode": { type: "string" },
        concurrency: { type: "string", short: "c" },
        recursive: { type: "boolean", short: "r" },
        "no-originals": { type: "boolean" },
        processing: { type: "string" },
        provider: { type: "string" },
        "allow-external": { type: "boolean" },
        profiles: { type: "string" },
        validate: { type: "string" },
        json: { type: "boolean" },
        list: { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
    });
  } catch (e) {
    console.error(`Error: ${(e as Error).message}\n\n${HELP}`);
    return 2;
  }
  const v = parsed.values;
  if (v.help || (argv.length === 0)) { console.log(HELP); return 0; }

  try {
    let custom: MarketplaceConfig[] = [];
    if (v.profiles) {
      const raw = JSON.parse(await fs.readFile(v.profiles, "utf8"));
      custom = (Array.isArray(raw) ? raw : [raw]).map((r) => parseMarketplaceConfig(r));
    }
    if (v.list) {
      for (const m of [...BUILTIN_MARKETPLACES, ...custom]) console.log(`${m.id.padEnd(12)} ${m.name.padEnd(16)} ${m.targetSize}px  ${m.defaultFormat}  ${m.aspectRatios?.join(",") ?? "any"}  ≤${m.maxFileSizeMB ?? "∞"}MB`);
      return 0;
    }
    const marketplaces = selectMarketplaces(v.marketplace ?? "universal", custom);

    if (v.validate) {
      let code = 0;
      for (const m of marketplaces) {
        const r = await validateImageFile(v.validate, m, getRules(m.id));
        console.log(`\n${m.name}: ${r.ready ? "READY" : r.valid ? "READY WITH WARNINGS" : "NOT VALID"}`);
        for (const c of r.checks) console.log(`  ${c.status === "pass" ? "✓" : c.status === "warn" ? "⚠" : "✗"} ${c.label}${c.message ? ` — ${c.message}` : ""}`);
        console.log(`  ${r.metadata.width}×${r.metadata.height} ${r.metadata.format} ${formatBytes(r.metadata.fileSize)}`);
        console.log(`  ${r.disclaimer}`);
        if (!r.valid) code = 1;
      }
      return code;
    }

    if (parsed.positionals.length === 0) { console.error("Error: no input files or folders given\n"); console.error(HELP); return 2; }
    const inputs = await collectInputs(parsed.positionals, v.recursive);
    if (inputs.length === 0) { console.error("No supported images found in the given inputs."); return 2; }

    const enhance = (v.enhance ?? "standard") as keyof typeof ENHANCEMENT_PRESETS;
    if (!(enhance in ENHANCEMENT_PRESETS)) throw new Error(`--enhance must be off, standard or high`);
    const partial: Partial<OptimizeOptions> = { enhancement: { ...ENHANCEMENT_PRESETS[enhance] } };
    if (v.background) {
      if (/^#[0-9a-f]{6}$/i.test(v.background)) { partial.background = "custom"; partial.customBackground = v.background; }
      else partial.background = v.background as OptimizeOptions["background"];
    }
    if (v.quality) partial.quality = Number(v.quality);
    if (v.format) partial.format = (v.format === "jpg" ? "jpeg" : v.format) as OptimizeOptions["format"];
    if (v.aspect) {
      if (["auto", "1:1", "4:5", "3:4", "16:9"].includes(v.aspect)) partial.aspectRatio = v.aspect as OptimizeOptions["aspectRatio"];
      else { partial.aspectRatio = "custom"; partial.customAspect = v.aspect; }
    }
    if (v.fill) partial.productFill = Number(v.fill);
    if (v.position) partial.position = v.position as OptimizeOptions["position"];
    if (v.size) partial.targetSize = Number(v.size);
    if (v.processing) partial.processingMode = v.processing as OptimizeOptions["processingMode"];
    if (v["allow-external"]) partial.allowExternal = true;
    const options = parseOptions(partial); // validates everything up-front

    const provider = v.provider ? createProvider({ kind: v.provider as "removebg" | "http" }) : undefined;
    if (provider?.external && options.processingMode !== "local") {
      if (!options.allowExternal) console.error("⚠ This operation sends the image to an external AI provider. Pass --allow-external to permit it; falling back to local processing.");
      else console.error(`⚠ This operation sends images to an external AI provider (${provider.id}).`);
    }

    const outputDir = path.resolve(v.output ?? "./optimized");
    const total = inputs.length;
    const started = Date.now();
    const result = await optimizeBatch({
      inputs: inputs.map((p) => ({ path: p, sku: total === 1 ? v.sku : undefined })),
      marketplaces,
      options,
      outputDir,
      namingTemplate: v.template,
      productNameMode: (v["name-mode"] as "sequential" | "original" | undefined) ?? "sequential",
      concurrency: v.concurrency ? Math.max(1, Number(v.concurrency)) : 2,
      copyOriginals: !v["no-originals"],
      provider,
      onProgress: (p) => {
        if (!v.json) process.stderr.write(`\rProcessed: ${p.done} / ${p.total}  (${Math.round((p.done / p.total) * 100)}%)   `);
      },
    });
    if (!v.json) process.stderr.write("\n");

    if (v.json) {
      console.log(JSON.stringify({ outputDir, ...result, items: result.items.map((i) => ({ ...i, results: i.results.map((r) => (r.success ? { ...r, buffer: undefined } : r)) })) }, null, 2));
    } else {
      for (const it of result.items) {
        for (const r of it.results) {
          if (r.success) {
            const val = r.validation;
            const flag = val.ready ? "READY" : val.valid ? `⚠ ${val.warnings.join("; ")}` : `✗ ${val.errors.join("; ")}`;
            console.log(`✓ ${path.basename(it.input)} → ${path.relative(process.cwd(), r.outputPath ?? "")}  ${r.metadata.width}×${r.metadata.height} ${formatBytes(r.metadata.fileSize)}  ${flag}`);
          } else console.log(`✗ ${path.basename(it.input)} [${r.marketplace}] ${r.error.message}`);
        }
      }
      console.log(`\n${result.succeeded} successful, ${result.failed} failed  (${((Date.now() - started) / 1000).toFixed(1)}s)  →  ${outputDir}`);
      console.log("Validated against your configured marketplace profile.");
    }
    return result.failed > 0 ? 1 : 0;
  } catch (e) {
    console.error(`Error: ${(e as Error).message}`);
    return 2;
  }
}
