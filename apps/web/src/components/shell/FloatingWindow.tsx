"use client";

import { useRef } from "react";
import { useWindowStore, type FloatingWin } from "@/store/windows";

export function FloatingWindowLayer() {
  const { windows, close, minimize, move } = useWindowStore();
  const drag = useRef<{ id: string; ox: number; oy: number } | null>(null);

  return (
    <>
      {windows
        .filter((w) => !w.minimized)
        .map((w) => (
          <WindowFrame
            key={w.id}
            win={w}
            onClose={() => close(w.id)}
            onMinimize={() => minimize(w.id)}
            onPointerDown={(e) => {
              drag.current = { id: w.id, ox: e.clientX - w.x, oy: e.clientY - w.y };
            }}
            onPointerMove={(e) => {
              if (!drag.current || drag.current.id !== w.id) return;
              move(w.id, e.clientX - drag.current.ox, e.clientY - drag.current.oy);
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
          />
        ))}
    </>
  );
}

function WindowFrame({
  win,
  onClose,
  onMinimize,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  win: FloatingWin;
  onClose: () => void;
  onMinimize: () => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        left: win.x,
        top: win.y,
        width: win.width,
        height: win.height,
        background: "var(--nexo-surface)",
        border: "1px solid var(--nexo-border)",
        borderRadius: 12,
        boxShadow: "0 30px 60px -28px rgba(0,0,0,.45)",
        zIndex: 45,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{
          height: 42,
          display: "flex",
          alignItems: "center",
          padding: "0 12px",
          borderBottom: "1px solid var(--nexo-border)",
          cursor: "grab",
          background: "oklch(0.97 0.01 250)",
          userSelect: "none",
        }}
      >
        <strong style={{ fontSize: 13 }}>{win.title}</strong>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button type="button" onClick={onMinimize} style={btn}>
            —
          </button>
          <button type="button" onClick={onClose} style={btn}>
            ✕
          </button>
        </div>
      </div>
      <div style={{ padding: 16, overflow: "auto", flex: 1, fontSize: 13, color: "var(--nexo-muted)" }}>
        {win.payload ? (
          <pre style={{ margin: 0, whiteSpace: "pre-wrap", color: "var(--nexo-text)" }}>
            {JSON.stringify(win.payload, null, 2)}
          </pre>
        ) : (
          <p>Janela `{win.kind}` — conteúdo será ligado às fichas reais nas próximas sprints.</p>
        )}
      </div>
    </div>
  );
}

const btn: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 8,
  border: "1px solid var(--nexo-border)",
  background: "white",
  cursor: "pointer",
};
