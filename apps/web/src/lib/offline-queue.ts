"use client";

import { create } from "zustand";
import { api } from "@/lib/api";

export interface QueueItem {
  clientId: string;
  type: string;
  payload: Record<string, unknown>;
}

interface OfflineState {
  online: boolean;
  queue: QueueItem[];
  pending: number;
  lastSyncMsg: string | null;
  enqueue: (item: Omit<QueueItem, "clientId"> & { clientId?: string }) => Promise<void>;
  setOnline: (v: boolean) => void;
  flush: () => Promise<number>;
  clearSyncMsg: () => void;
  hydrate: () => Promise<void>;
}

const DB_NAME = "aion_offline";
const DB_NAME_LEGACY = "nexo_offline";
const STORE = "queue";
const SESSION_KEY = "aion_offline_queue";
const SESSION_KEY_LEGACY = "nexo_offline_queue";

function openDb(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "clientId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGetAllFrom(name: string): Promise<QueueItem[]> {
  try {
    const db = await openDb(name);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result as QueueItem[]) ?? []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

async function idbGetAll(): Promise<QueueItem[]> {
  if (typeof indexedDB === "undefined") return sessionFallbackLoad();
  try {
    let items = await idbGetAllFrom(DB_NAME);
    if (items.length === 0) {
      const legacy = await idbGetAllFrom(DB_NAME_LEGACY);
      if (legacy.length > 0) {
        for (const item of legacy) await idbPut(item);
        items = legacy;
      }
    }
    return items;
  } catch {
    return sessionFallbackLoad();
  }
}

async function idbPut(item: QueueItem) {
  if (typeof indexedDB === "undefined") {
    const q = sessionFallbackLoad();
    q.push(item);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(q));
    return;
  }
  const db = await openDb(DB_NAME);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbClear() {
  if (typeof indexedDB === "undefined") {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY_LEGACY);
    return;
  }
  const db = await openDb(DB_NAME);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function sessionFallbackLoad(): QueueItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw =
      sessionStorage.getItem(SESSION_KEY) ?? sessionStorage.getItem(SESSION_KEY_LEGACY) ?? "[]";
    return JSON.parse(raw) as QueueItem[];
  } catch {
    return [];
  }
}

export const useOfflineQueue = create<OfflineState>((set, get) => ({
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  queue: [],
  pending: 0,
  lastSyncMsg: null,
  clearSyncMsg: () => set({ lastSyncMsg: null }),
  setOnline: (online) => set({ online }),
  hydrate: async () => {
    const queue = await idbGetAll();
    set({ queue, pending: queue.length });
  },
  enqueue: async (item) => {
    const entry: QueueItem = {
      clientId: item.clientId ?? `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: item.type,
      payload: item.payload,
    };
    await idbPut(entry);
    const queue = [...get().queue, entry];
    set({ queue, pending: queue.length });
  },
  flush: async () => {
    const items = get().queue;
    if (items.length === 0) return 0;
    const res = await api<{
      processed: number;
      failed?: number;
      results: Array<{ clientId: string; ok: boolean }>;
    }>("/mobile/sync/queue", {
      method: "POST",
      body: JSON.stringify({ items }),
    });
    const succeeded = new Set((res.results ?? []).filter((r) => r.ok).map((r) => r.clientId));
    const remaining = items.filter((i) => !succeeded.has(i.clientId));
    await idbClear();
    for (const r of remaining) await idbPut(r);
    const n = succeeded.size;
    set({
      queue: remaining,
      pending: remaining.length,
      lastSyncMsg:
        remaining.length === 0
          ? `Sincronizado — ${n} ações enviadas`
          : `Sincronizado — ${n} ações · ${remaining.length} pendentes`,
    });
    return n;
  },
}));

if (typeof window !== "undefined") {
  void useOfflineQueue.getState().hydrate();
  window.addEventListener("online", () => {
    useOfflineQueue.getState().setOnline(true);
    void useOfflineQueue.getState().flush();
  });
  window.addEventListener("offline", () => useOfflineQueue.getState().setOnline(false));
}
