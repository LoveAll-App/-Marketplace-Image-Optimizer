import type { BatchStatus, HealthInfo, MarketplaceConfig, OptimizeOptions, ProcessRequest, ProviderSettings, StorageInfo, UploadedItem } from "@moi/shared";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError("The local optimizer engine is not reachable. Start it with “npm run dev”.", 0);
  }
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      msg = body.error ? `${body.error}${body.details ? `: ${body.details.join("; ")}` : ""}` : msg;
    } catch { /* not JSON */ }
    throw new ApiError(msg, res.status);
  }
  return res.json() as Promise<T>;
}

const json = (body: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export interface UploadResult {
  items: UploadedItem[];
  rejected: { name: string; reason: string }[];
}

export const api = {
  health: () => request<HealthInfo>("/api/health"),
  storage: () => request<StorageInfo>("/api/storage"),

  async upload(files: File[]): Promise<UploadResult> {
    const form = new FormData();
    for (const f of files) form.append("files", f, f.name);
    return request<UploadResult>("/api/upload", { method: "POST", body: form });
  },

  process: (req: ProcessRequest) => request<BatchStatus>("/api/process", json(req)),
  addTasks: (batchId: string, req: ProcessRequest) => request<BatchStatus>(`/api/batches/${batchId}/tasks`, json(req)),
  batch: (batchId: string) => request<BatchStatus>(`/api/batches/${batchId}`),
  pause: (batchId: string) => request<BatchStatus>(`/api/batches/${batchId}/pause`, json({})),
  resume: (batchId: string) => request<BatchStatus>(`/api/batches/${batchId}/resume`, json({})),
  cancel: (batchId: string) => request<BatchStatus>(`/api/batches/${batchId}/cancel`, json({})),
  retry: (batchId: string, itemId?: string) => request<BatchStatus>(`/api/batches/${batchId}/retry`, json({ itemId })),
  deleteBatch: (batchId: string) => request<{ ok: true }>(`/api/batches/${batchId}`, { method: "DELETE" }),
  removeItem: (id: string) => request<{ ok: true }>(`/api/items/${id}`, { method: "DELETE" }),
  clearAll: () => request<{ ok: true }>("/api/data", { method: "DELETE" }),

  previewUrl: (itemId: string, w = 400) => `/api/items/${itemId}/preview?w=${w}`,
  fileUrl: (batchId: string, itemId: string, marketplace: string, opts: { inline?: boolean; v?: number } = {}) =>
    `/api/batches/${batchId}/items/${itemId}/${marketplace}/file?${opts.inline ? "inline=1&" : ""}v=${opts.v ?? 0}`,
  zipUrl: (batchId: string, itemIds?: string[]) => `/api/batches/${batchId}/zip${itemIds?.length ? `?items=${itemIds.join(",")}` : ""}`,
};

export type { MarketplaceConfig, OptimizeOptions, ProviderSettings };
