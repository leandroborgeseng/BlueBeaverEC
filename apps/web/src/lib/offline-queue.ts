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
  enqueue: (item: Omit<QueueItem, "clientId"> & { clientId?: string }) => void;
  setOnline: (v: boolean) => void;
  flush: () => Promise<void>;
  pending: number;
}

function loadQueue(): QueueItem[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(sessionStorage.getItem("nexo_offline_queue") ?? "[]") as QueueItem[];
  } catch {
    return [];
  }
}

function saveQueue(queue: QueueItem[]) {
  sessionStorage.setItem("nexo_offline_queue", JSON.stringify(queue));
}

export const useOfflineQueue = create<OfflineState>((set, get) => ({
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  queue: typeof window === "undefined" ? [] : loadQueue(),
  pending: typeof window === "undefined" ? 0 : loadQueue().length,
  setOnline: (online) => set({ online }),
  enqueue: (item) => {
    const entry: QueueItem = {
      clientId: item.clientId ?? `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: item.type,
      payload: item.payload,
    };
    const queue = [...get().queue, entry];
    saveQueue(queue);
    set({ queue, pending: queue.length });
  },
  flush: async () => {
    const items = get().queue;
    if (items.length === 0) return;
    const res = await api<{ processed: number }>("/mobile/sync/queue", {
      method: "POST",
      body: JSON.stringify({ items }),
    });
    if (res.processed >= 0) {
      saveQueue([]);
      set({ queue: [], pending: 0 });
    }
  },
}));

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    useOfflineQueue.getState().setOnline(true);
    void useOfflineQueue.getState().flush();
  });
  window.addEventListener("offline", () => useOfflineQueue.getState().setOnline(false));
}
