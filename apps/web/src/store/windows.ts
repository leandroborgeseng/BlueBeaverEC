"use client";

import { create } from "zustand";

export type WindowKind =
  | "equipamento"
  | "os"
  | "laudo"
  | "contrato"
  | "fabricante"
  | "modelo"
  | "fornecedor"
  | "colaborador"
  | "procedimento";

export interface FloatingWin {
  id: string;
  kind: WindowKind;
  title: string;
  minimized: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  payload?: Record<string, unknown>;
}

const SIZE_BY_KIND: Record<WindowKind, { width: number; height: number }> = {
  equipamento: { width: 920, height: 640 },
  os: { width: 960, height: 680 },
  laudo: { width: 900, height: 660 },
  contrato: { width: 880, height: 620 },
  fabricante: { width: 520, height: 420 },
  modelo: { width: 520, height: 420 },
  fornecedor: { width: 560, height: 440 },
  colaborador: { width: 640, height: 520 },
  procedimento: { width: 860, height: 640 },
};

interface WindowState {
  windows: FloatingWin[];
  open: (input: { kind: WindowKind; title: string; payload?: Record<string, unknown> }) => void;
  close: (id: string) => void;
  minimize: (id: string) => void;
  restore: (id: string) => void;
  move: (id: string, x: number, y: number) => void;
}

let seq = 0;

export const useWindowStore = create<WindowState>((set) => ({
  windows: [],
  open: ({ kind, title, payload }) =>
    set((state) => {
      const size = SIZE_BY_KIND[kind];
      const id = `${kind}-${++seq}`;
      const offset = (state.windows.length % 6) * 24;
      return {
        windows: [
          ...state.windows,
          {
            id,
            kind,
            title,
            minimized: false,
            x: 120 + offset,
            y: 80 + offset,
            width: size.width,
            height: size.height,
            payload,
          },
        ],
      };
    }),
  close: (id) => set((s) => ({ windows: s.windows.filter((w) => w.id !== id) })),
  minimize: (id) =>
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id ? { ...w, minimized: true } : w)),
    })),
  restore: (id) =>
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id ? { ...w, minimized: false } : w)),
    })),
  move: (id, x, y) =>
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id ? { ...w, x, y } : w)),
    })),
}));
