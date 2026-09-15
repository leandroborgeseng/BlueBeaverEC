"use client";

import { useEffect, useId, useState } from "react";
import { Btn, FieldLabel, fieldStyle } from "@/components/ui/aion-ui";

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  danger,
  requireJustification,
  justificationMin = 3,
  justificationOptions,
  justificationLabel = "Justificativa",
  children,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  requireJustification?: boolean;
  justificationMin?: number;
  justificationOptions?: string[];
  justificationLabel?: string;
  children?: React.ReactNode;
  onConfirm: (justificativa?: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [justificativa, setJustificativa] = useState("");
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const id = useId();
  const temOpcoes = Boolean(justificationOptions?.length);

  useEffect(() => {
    if (open) {
      setJustificativa("");
      setMotivo("");
      setErro(null);
      setBusy(false);
    }
  }, [open]);

  if (!open) return null;

  async function submit() {
    let texto: string | undefined;
    if (requireJustification && temOpcoes) {
      if (!motivo.trim()) {
        setErro("Selecione o motivo");
        return;
      }
      texto = justificativa.trim() ? `${motivo.trim()} — ${justificativa.trim()}` : motivo.trim();
    } else if (requireJustification) {
      if (justificativa.trim().length < justificationMin) {
        setErro(`Justificativa obrigatória (mín. ${justificationMin} caracteres)`);
        return;
      }
      texto = justificativa.trim();
    }
    setBusy(true);
    setErro(null);
    try {
      await onConfirm(texto);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
      setBusy(false);
    }
  }

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
          width: "min(440px, 100%)",
          background: "white",
          borderRadius: 10,
          border: "1px solid oklch(0.91 0.006 255)",
          boxShadow: "0 24px 48px -20px rgba(16,24,40,0.45)",
          padding: 20,
        }}
      >
        <h2 id={id} style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700, color: "oklch(0.18 0.015 255)" }}>
          {title}
        </h2>
        {message && (
          <p style={{ margin: "0 0 14px", fontSize: 13.5, color: "oklch(0.45 0.02 250)", lineHeight: 1.45 }}>
            {message}
          </p>
        )}
        {requireJustification && (
          <div style={{ marginBottom: 14 }}>
            <FieldLabel>{justificationLabel}</FieldLabel>
            {temOpcoes ? (
              <>
                <select
                  autoFocus
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  style={{ ...fieldStyle, marginBottom: 8 }}
                >
                  <option value="">Selecione…</option>
                  {justificationOptions!.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
                <textarea
                  value={justificativa}
                  onChange={(e) => setJustificativa(e.target.value)}
                  rows={2}
                  style={fieldStyle}
                  placeholder="Complemento (opcional)"
                />
              </>
            ) : (
              <textarea
                autoFocus
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
                rows={3}
                style={fieldStyle}
                placeholder="Descreva o motivo…"
              />
            )}
          </div>
        )}
        {children}
        {erro && (
          <div style={{ marginBottom: 12, fontSize: 13, fontWeight: 600, color: "oklch(0.45 0.15 25)" }}>{erro}</div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Btn variant="ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Btn>
          <Btn variant={danger ? "danger" : "primary"} onClick={() => void submit()} disabled={busy}>
            {busy ? "Aguarde…" : confirmLabel}
          </Btn>
        </div>
      </div>
    </div>
  );
}
