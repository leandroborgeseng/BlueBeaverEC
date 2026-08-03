"use client";

import { useWindowStore } from "@/store/windows";
import { ICONS, Icon } from "./icons";

export function Dock() {
  const { windows, restore, close, minimize } = useWindowStore();
  if (windows.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: 88,
        bottom: 10,
        display: "flex",
        gap: 6,
        zIndex: 50,
        maxWidth: "calc(100vw - 120px)",
        overflowX: "auto",
      }}
    >
      {windows.map((w) => (
        <div
          key={w.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            border: "1px solid oklch(0.88 0.01 250)",
            background: w.minimized ? "white" : "oklch(0.96 0.02 250)",
            borderRadius: 8,
            padding: "6px 8px 6px 10px",
            fontSize: 12,
            fontWeight: 600,
            boxShadow: "0 8px 20px -14px rgba(0,0,0,.4)",
            color: "oklch(0.3 0.02 250)",
            whiteSpace: "nowrap",
          }}
        >
          <button
            type="button"
            onClick={() => (w.minimized ? restore(w.id) : minimize(w.id))}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: 0,
              color: "inherit",
              font: "inherit",
            }}
            title={w.minimized ? "Restaurar" : "Minimizar"}
          >
            <Icon d={w.kind === "os" ? ICONS.os : ICONS.equip} size={14} />
            <span style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>
              {w.title}
            </span>
          </button>
          <button
            type="button"
            onClick={() => close(w.id)}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: "oklch(0.55 0.02 250)",
              fontSize: 14,
              lineHeight: 1,
              padding: "0 2px",
            }}
            aria-label="Fechar"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
