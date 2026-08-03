"use client";

import { useRef } from "react";
import { EquipamentoEditor } from "@/components/shell/editors/EquipamentoEditor";
import { LaudoEditor } from "@/components/shell/editors/LaudoEditor";
import { OsEditor } from "@/components/shell/editors/OsEditor";
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
  const equipTag = win.kind === "equipamento" ? String(win.payload?.tag ?? "") : "";

  return (
    <div
      style={{
        position: "fixed",
        left: win.x,
        top: win.y,
        width: win.width,
        height: win.height,
        background: "white",
        border: "1px solid oklch(0.88 0.01 250)",
        borderRadius: 10,
        boxShadow: "0 24px 48px -20px rgba(16,24,40,0.45)",
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
          height: 40,
          display: "flex",
          alignItems: "center",
          padding: "0 12px",
          borderBottom: "1px solid oklch(0.91 0.006 255)",
          cursor: "grab",
          background: "white",
          userSelect: "none",
        }}
      >
        <strong style={{ fontSize: 13.5, fontWeight: 700, color: "oklch(0.25 0.02 250)" }}>
          {win.title}
        </strong>
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          <button type="button" onClick={onMinimize} style={btn} title="Minimizar">
            —
          </button>
          <button type="button" onClick={onClose} style={btn} title="Fechar">
            ×
          </button>
        </div>
      </div>
      <div style={{ padding: 16, overflow: "auto", flex: 1, fontSize: 13 }}>
        {win.kind === "equipamento" && equipTag ? (
          <EquipamentoEditor key={equipTag} tag={equipTag} windowId={win.id} onDone={onClose} />
        ) : win.kind === "os" && win.payload?.numero != null ? (
          <OsEditor
            numero={Number(win.payload.numero)}
            codigo={String(win.payload.codigo ?? win.title)}
            onDone={onClose}
          />
        ) : win.kind === "laudo" ? (
          <LaudoEditor
            key={String(win.payload?.id ?? win.payload?.tipo ?? "novo")}
            laudoId={win.payload?.id != null ? String(win.payload.id) : undefined}
            tipo={win.payload?.tipo != null ? String(win.payload.tipo) : undefined}
            equipamentoTag={
              win.payload?.equipamentoTag != null ? String(win.payload.equipamentoTag) : undefined
            }
            windowId={win.id}
            onDone={onClose}
          />
        ) : win.payload ? (
          <pre style={{ margin: 0, whiteSpace: "pre-wrap", color: "var(--nexo-text)" }}>
            {JSON.stringify(win.payload, null, 2)}
          </pre>
        ) : (
          <p style={{ color: "var(--nexo-muted)" }}>
            Janela `{win.kind}` — conteúdo será ligado às fichas reais nas próximas sprints.
          </p>
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
