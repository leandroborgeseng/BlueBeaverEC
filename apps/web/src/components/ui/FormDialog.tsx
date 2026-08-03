"use client";

import { useEffect, useId, type ReactNode } from "react";
import { Btn } from "@/components/ui/aion-ui";

/** Modal genérico para formulários (substitui window.prompt em edições multi-campo). */
export function FormDialog({
  open,
  title,
  children,
  confirmLabel = "Salvar",
  cancelLabel = "Cancelar",
  busy,
  erro,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  erro?: string | null;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const id = useId();

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal
      aria-labelledby={id}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(16,24,40,0.45)",
        display: "grid",
        placeItems: "center",
        padding: 20,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(480px, 100%)",
          background: "white",
          borderRadius: 10,
          border: "1px solid oklch(0.9 0.01 250)",
          padding: 20,
          maxHeight: "85vh",
          overflow: "auto",
        }}
      >
        <h2 id={id} style={{ margin: "0 0 14px", fontSize: 17, fontWeight: 700 }}>
          {title}
        </h2>
        <div style={{ display: "grid", gap: 10 }}>{children}</div>
        {erro && (
          <div style={{ marginTop: 12, fontSize: 13, fontWeight: 600, color: "oklch(0.45 0.15 25)" }}>{erro}</div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <Btn variant="ghost" type="button" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </Btn>
          <Btn type="button" disabled={busy} onClick={() => void onConfirm()}>
            {busy ? "Salvando…" : confirmLabel}
          </Btn>
        </div>
      </div>
    </div>
  );
}
