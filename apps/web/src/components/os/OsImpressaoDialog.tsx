"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import { fetchBlob } from "@/lib/api";
import { Overlay, WinForm, ORANGE } from "./os-win-ui";

export function OsImpressaoDialog({
  open,
  numero,
  codigo,
  podeMonetario,
  onClose,
}: {
  open: boolean;
  numero: number;
  codigo: string;
  podeMonetario?: boolean;
  onClose: () => void;
}) {
  const [observacao, setObservacao] = useState(true);
  const [itens, setItens] = useState(true);
  const [monetario, setMonetario] = useState(false);
  const [analiseExterna, setAnaliseExterna] = useState(false);
  const [preenchido, setPreenchido] = useState(false);
  const [papel, setPapel] = useState<"A4" | "letter">("A4");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  if (!open) return null;

  const osNum = codigo.replace(/^OS-/i, "") || String(numero);

  async function gerar(e?: FormEvent) {
    e?.preventDefault();
    if (busy) return;
    setBusy(true);
    setErro(null);
    try {
      const qs = new URLSearchParams({
        observacao: observacao ? "1" : "0",
        itens: itens ? "1" : "0",
        monetario: podeMonetario && monetario ? "1" : "0",
        analiseExterna: analiseExterna ? "1" : "0",
        preenchido: preenchido ? "1" : "0",
        papel,
      });
      const blob = await fetchBlob(`/os/${numero}/impressao.pdf?${qs.toString()}`);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
      onClose();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível gerar o PDF");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <WinForm
        title="Impressão Ordem de Serviço Individual"
        width="min(720px, 96vw)"
        onSubmit={gerar}
        onCancel={onClose}
        busy={busy}
        erro={erro}
        showContinuar={false}
        hideCancel
        hideSubmit
        extraRight={
          <button type="submit" disabled={busy} style={gerarBtn}>
            {busy ? "Gerando…" : "Gerar"}
          </button>
        }
      >
        <details open>
          <summary style={sum}>Impressão</summary>
          <div style={{ padding: "10px 8px 4px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, fontSize: 12 }}>
              <span style={{ width: 52, textAlign: "right" }}>Nº OS</span>
              <span style={chip}>{osNum}</span>
            </div>
            <Check checked={observacao} onChange={setObservacao} label="Imprimir campos para observação" />
            <Check checked={itens} onChange={setItens} label="Imprimir itens da Ordem de Serviço" />
            {podeMonetario && (
              <Check checked={monetario} onChange={setMonetario} label="Imprimir informações monetárias das atividades" />
            )}
            <Check checked={analiseExterna} onChange={setAnaliseExterna} label="Imprimir Campos para Análise Externa" />
            <div style={{ display: "flex", gap: 18, margin: "8px 0 10px 22px", fontSize: 12 }}>
              <label style={radioLab}>
                <input type="radio" checked={!preenchido} onChange={() => setPreenchido(false)} /> Em Branco
              </label>
              <label style={radioLab}>
                <input type="radio" checked={preenchido} onChange={() => setPreenchido(true)} /> Preenchido
              </label>
            </div>
            <div style={{ fontSize: 12, marginTop: 8 }}>Tamanho do Papel</div>
            <div style={{ display: "flex", gap: 18, margin: "6px 0 4px 22px", fontSize: 12 }}>
              <label style={radioLab}>
                <input type="radio" checked={papel === "A4"} onChange={() => setPapel("A4")} /> A4
              </label>
              <label style={radioLab}>
                <input type="radio" checked={papel === "letter"} onChange={() => setPapel("letter")} /> Carta
              </label>
            </div>
          </div>
        </details>
      </WinForm>
    </Overlay>
  );
}

function Check({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, margin: "5px 0" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

const sum: CSSProperties = { fontSize: 13, fontWeight: 700, cursor: "pointer", color: "#333" };
const chip: CSSProperties = {
  border: "1px solid #ccc",
  background: "white",
  padding: "3px 10px",
  borderRadius: 2,
  minWidth: 120,
};
const radioLab: CSSProperties = { display: "flex", gap: 6, alignItems: "center" };
const gerarBtn: CSSProperties = {
  background: ORANGE,
  color: "white",
  border: "none",
  padding: "6px 18px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  borderRadius: 2,
};
