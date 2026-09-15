"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { api } from "@/lib/api";
import { Overlay, WinForm, ORANGE, fld } from "@/components/os/os-win-ui";

type Etiqueta = {
  tag: string;
  nome: string;
  setor: string;
  patrimonio?: string | null;
  svg: string;
};

export function EquipEtiquetaDialog({
  open,
  tag,
  onClose,
}: {
  open: boolean;
  tag?: string | null;
  onClose: () => void;
}) {
  const [data, setData] = useState<Etiqueta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copias, setCopias] = useState(1);

  useEffect(() => {
    if (!open) return;
    setErro(null);
    setData(null);
    if (!tag) {
      setErro("Selecione um equipamento.");
      return;
    }
    setBusy(true);
    api<Etiqueta>(`/equipamentos/${encodeURIComponent(tag)}/etiqueta`)
      .then(setData)
      .catch((e) => setErro(e instanceof Error ? e.message : "Não foi possível gerar a etiqueta"))
      .finally(() => setBusy(false));
  }, [open, tag]);

  if (!open) return null;

  function imprimir() {
    if (!data || busy) return;
    const n = Math.min(20, Math.max(1, Math.floor(Number(copias)) || 1));
    const w = window.open("", "_blank", "noopener,width=480,height=640");
    if (!w) {
      setErro("O navegador bloqueou a janela de impressão. Permita pop-ups e tente de novo.");
      return;
    }
    w.document.open();
    w.document.write(montarHtml(data, n));
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 200);
  }

  return (
    <Overlay onClose={onClose} fixed>
      <WinForm
        title="Etiqueta / QR do Equipamento"
        width="min(480px, 96vw)"
        onCancel={onClose}
        busy={busy}
        erro={erro}
        showContinuar={false}
        hideSubmit
        extraRight={
          <button type="button" disabled={busy || !data} style={gerarBtn} onClick={imprimir}>
            {busy ? "Abrindo…" : "Imprimir"}
          </button>
        }
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, fontSize: 12 }}>
          <span style={{ width: 72, textAlign: "right" }}>Cópias</span>
          <input
            type="number"
            min={1}
            max={20}
            value={copias}
            onChange={(e) => setCopias(Number(e.target.value))}
            style={{ ...fld, width: 72 }}
          />
        </div>
        {data && (
          <div style={preview}>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "0.04em" }}>{data.tag}</div>
            <div style={{ fontSize: 13, margin: "6px 0 10px", fontWeight: 600 }}>{data.nome}</div>
            <div style={{ display: "flex", justifyContent: "center" }} dangerouslySetInnerHTML={{ __html: data.svg }} />
            <div style={{ fontSize: 12, marginTop: 10, color: "#444" }}>
              {data.setor}
              {data.patrimonio ? ` · Pat. ${data.patrimonio}` : ""}
            </div>
            <div style={{ fontSize: 11, marginTop: 6, color: "#666" }}>QR autenticado (exige login)</div>
          </div>
        )}
      </WinForm>
    </Overlay>
  );
}

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function montarHtml(data: Etiqueta, copias: number) {
  const bloco = `
    <div class="label">
      <div class="tag">${esc(data.tag)}</div>
      <div class="nome">${esc(data.nome)}</div>
      <div class="qr">${data.svg}</div>
      <div class="meta">${esc(data.setor)}${data.patrimonio ? ` · Pat. ${esc(data.patrimonio)}` : ""}</div>
    </div>`;
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <title>Etiqueta ${esc(data.tag)}</title>
  <style>
    @page { margin: 6mm; size: auto; }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111; }
    .label {
      width: 70mm;
      border: 1px solid #111;
      padding: 4mm 3mm;
      text-align: center;
      page-break-after: always;
      box-sizing: border-box;
    }
    .label:last-child { page-break-after: auto; }
    .tag { font-size: 16pt; font-weight: 800; letter-spacing: 0.04em; }
    .nome { font-size: 10pt; font-weight: 600; margin: 2mm 0 3mm; }
    .qr svg { width: 28mm; height: 28mm; }
    .meta { font-size: 8pt; margin-top: 2mm; }
  </style>
</head>
<body>
${Array.from({ length: copias }, () => bloco).join("\n")}
</body>
</html>`;
}

const preview: CSSProperties = {
  background: "white",
  border: "1px solid #bbb",
  padding: 16,
  textAlign: "center",
};
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
