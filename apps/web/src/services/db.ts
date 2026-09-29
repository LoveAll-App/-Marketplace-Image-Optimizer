/** Tiny IndexedDB wrapper: a key/value store (settings) and a history store. Falls back to memory if IndexedDB is unavailable. */

export interface HistoryEntry {
  id: string;
  at: number;
  name: string;
  marketplaces: string[];
  state: "done" | "failed";
  durationMs?: number;
  error?: string;
  outputs: { marketplace: string; width: number; height: number; size: number; format: string; ready: boolean; warnings: number }[];
  failures: { marketplace: string; message: string }[];
}

const DB_NAME = "marketplace-image-optimizer";
let dbPromise: Promise<IDBDatabase | null> | null = null;
const memKv = new Map<string, unknown>();
let memHistory: HistoryEntry[] = [];

function open(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
        if (!db.objectStoreNames.contains("history")) db.createObjectStore("history", { keyPath: "id" }).createIndex("at", "at");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return open().then(
    (db) =>
      new Promise<T | undefined>((resolve) => {
        if (!db) return resolve(undefined);
        try {
          const req = fn(db.transaction(store, mode).objectStore(store));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(undefined);
        } catch {
          resolve(undefined);
        }
      }),
  );
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const db = await open();
  if (!db) return memKv.get(key) as T | undefined;
  return tx<T>("kv", "readonly", (s) => s.get(key) as IDBRequest<T>);
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  memKv.set(key, value);
  await tx("kv", "readwrite", (s) => s.put(value, key));
}

export async function historyAdd(entries: HistoryEntry[]): Promise<void> {
  memHistory = [...entries, ...memHistory].slice(0, 5000);
  const db = await open();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const t = db.transaction("history", "readwrite");
      const s = t.objectStore("history");
      for (const e of entries) s.put(e);
      t.oncomplete = () => resolve();
      t.onerror = () => resolve();
      t.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function historyAll(): Promise<HistoryEntry[]> {
  const db = await open();
  if (!db) return memHistory;
  const rows = (await tx<HistoryEntry[]>("history", "readonly", (s) => s.getAll())) ?? [];
  return rows.sort((a, b) => b.at - a.at);
}

export async function historyClear(): Promise<void> {
  memHistory = [];
  await tx("history", "readwrite", (s) => s.clear());
}
