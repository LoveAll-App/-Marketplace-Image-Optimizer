import type { ImageMetadata, MarketplaceConfig, OptimizeOptions, ProductAnalysis, ValidationResult } from "./types";

/** Contracts shared by the local API server and the web app. */

export interface UploadedItem {
  id: string;
  name: string;
  width: number;
  height: number;
  size: number;
  format: string;
  hasAlpha: boolean;
}

export type TaskState = "queued" | "processing" | "done" | "failed" | "cancelled";

export interface MarketplaceOutput {
  marketplace: string;
  marketplaceName: string;
  filename: string;
  metadata: ImageMetadata;
  validation: ValidationResult;
  warnings: string[];
}

export interface MarketplaceFailure {
  marketplace: string;
  marketplaceName: string;
  code: string;
  message: string;
}

export interface BatchTask {
  itemId: string;
  name: string;
  index: number;
  sku?: string;
  state: TaskState;
  marketplaces: string[];
  stage?: string;
  attempts: number;
  outputs: MarketplaceOutput[];
  failures: MarketplaceFailure[];
  analysis?: ProductAnalysis;
  error?: { code: string; message: string };
  durationMs?: number;
}

export interface BatchStatus {
  id: string;
  createdAt: number;
  paused: boolean;
  cancelled: boolean;
  total: number;
  queued: number;
  processing: number;
  done: number;
  failed: number;
  cancelledCount: number;
  finished: boolean;
  marketplaces: string[];
  tasks: BatchTask[];
}

export interface ProcessRequest {
  items: { id: string; sku?: string }[];
  marketplaces: MarketplaceConfig[];
  options: OptimizeOptions;
  namingTemplate?: string;
  productNameMode?: "sequential" | "original";
  /** Provider settings, kept in server memory only */
  provider?: ProviderSettings;
  /** Numbering starts here (so re-processing keeps stable names) */
  startIndex?: number;
}

export interface ProviderSettings {
  kind: "local" | "removebg" | "http";
  apiKey?: string;
  baseUrl?: string;
}

export interface HealthInfo {
  ok: true;
  version: string;
  concurrency: number;
  providers: { removebg: boolean; http: boolean };
}

export interface StorageInfo {
  bytes: number;
  files: number;
}
