"use client";

import { create } from "zustand";
import { api } from "@/lib/api";
import type { FichaCampo, OsCampo } from "@/lib/mobile-ficha";

const DB_NAME = "aion_campo";
const DB_VERSION = 1;
const STORE_OS = "os";
const STORE_EQ = "equipamentos";
const STORE_META = "meta";
const PREFS_KEY = "aion_campo_prefs";

export type CampoPrefs = {
  offlineMode: boolean;
  autoSync: boolean;
};

type Snapshot = {
  baixadoEm: string;
  os: OsCampo[];
  equipamentos: FichaCampo[];
};

function defaultPrefs(): CampoPrefs {
  return { offlineMode: false, autoSync: true };
}

function loadPrefs(): CampoPrefs {
  if (typeof window === "undefined") return defaultPrefs();
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return defaultPrefs();
    const p = JSON.parse(raw) as Partial<CampoPrefs>;
    return {
      offlineMode: Boolean(p.offlineMode),
      autoSync: p.autoSync !== false,
    };
  } catch {
    return defaultPrefs();
  }
}

function savePrefs(p: CampoPrefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(p));
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_OS)) db.createObjectStore(STORE_OS, { keyPath: "numero" });
      if (!db.objectStoreNames.contains(STORE_EQ)) db.createObjectStore(STORE_EQ, { keyPath: "tag" });
      if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META, { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPutAll<T>(store: string, rows: T[]) {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).clear();
    for (const row of rows) tx.objectStore(store).put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGetAll<T>(store: string): Promise<T[]> {
  if (typeof indexedDB === "undefined") return [];
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readonly");
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve((req.result as T[]) ?? []);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

async function idbMeta(key: string, value: unknown) {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_META, "readwrite");
    tx.objectStore(STORE_META).put({ key, value });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbMetaGet<T>(key: string): Promise<T | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_META, "readonly");
      const req = tx.objectStore(STORE_META).get(key);
      req.onsuccess = () => resolve((req.result?.value as T) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

interface CampoState {
  offlineMode: boolean;
  autoSync: boolean;
  lastPullAt: string | null;
  os: OsCampo[];
  equipamentos: FichaCampo[];
  pulling: boolean;
  lastPullMsg: string | null;
  hydrate: () => Promise<void>;
  setOfflineMode: (v: boolean) => void;
  setAutoSync: (v: boolean) => void;
  pull: (tecnico: boolean) => Promise<number>;
  getEquipamento: (tag: string) => FichaCampo | undefined;
  clearPullMsg: () => void;
}

export const useCampoCache = create<CampoState>((set, get) => ({
  ...loadPrefs(),
  lastPullAt: null,
  os: [],
  equipamentos: [],
  pulling: false,
  lastPullMsg: null,
  clearPullMsg: () => set({ lastPullMsg: null }),
  hydrate: async () => {
    const prefs = loadPrefs();
    const [os, equipamentos, lastPullAt] = await Promise.all([
      idbGetAll<OsCampo>(STORE_OS),
      idbGetAll<FichaCampo>(STORE_EQ),
      idbMetaGet<string>("lastPullAt"),
    ]);
    set({ ...prefs, os, equipamentos, lastPullAt });
  },
  setOfflineMode: (offlineMode) => {
    const next = { offlineMode, autoSync: get().autoSync };
    savePrefs(next);
    set(next);
  },
  setAutoSync: (autoSync) => {
    const next = { offlineMode: get().offlineMode, autoSync };
    savePrefs(next);
    set(next);
  },
  getEquipamento: (tag) =>
    get().equipamentos.find((e) => e.tag.toLowerCase() === tag.trim().toLowerCase()),
  pull: async (tecnico) => {
    set({ pulling: true, lastPullMsg: null });
    try {
      const data = await api<Snapshot>(tecnico ? "/mobile/snapshot" : "/portal/snapshot-campo");
      const os = (data.os ?? []).map((o) => ({
        ...o,
        numero: Number(o.numero),
        equipamento: o.equipamento ?? { tag: "—", nome: "—" },
      }));
      const equipamentos = data.equipamentos ?? [];
      await idbPutAll(STORE_OS, os);
      await idbPutAll(STORE_EQ, equipamentos);
      const baixadoEm = data.baixadoEm ?? new Date().toISOString();
      await idbMeta("lastPullAt", baixadoEm);
      set({
        os,
        equipamentos,
        lastPullAt: baixadoEm,
        lastPullMsg: `Baixado — ${os.length} OS · ${equipamentos.length} equipamento(s)`,
        pulling: false,
      });
      return os.length + equipamentos.length;
    } catch (e) {
      set({
        pulling: false,
        lastPullMsg: e instanceof Error ? e.message : "Falha ao baixar",
      });
      throw e;
    }
  },
}));

if (typeof window !== "undefined") {
  void useCampoCache.getState().hydrate();
}
