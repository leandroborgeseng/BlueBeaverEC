"use client";

import { useWindowStore } from "@/store/windows";

export function Dock() {
  const { windows, restore } = useWindowStore();
  const minimized = windows.filter((w) => w.minimized);
  if (minimized.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: 88,
        right: 16,
        bottom: 12,
        display: "flex",
        gap: 8,
        zIndex: 50,
      }}
    >
      {minimized.map((w) => (
        <button
          key={w.id}
          type="button"
          onClick={() => restore(w.id)}
          style={{
            border: "1px solid var(--nexo-border)",
            background: "var(--nexo-surface)",
            borderRadius: 10,
            padding: "8px 12px",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: "0 8px 20px -14px rgba(0,0,0,.4)",
          }}
        >
          {w.title}
        </button>
      ))}
    </div>
  );
}
