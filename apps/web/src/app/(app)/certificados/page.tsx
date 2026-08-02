"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Cert {
  id: string;
  numero: string;
  tipo: string;
  validadeAte?: string | null;
  statusCertificado: string;
  resultado?: string | null;
  equipamento: { tag: string; nome: string; setor: { nome: string } };
}

export default function CertificadosPage() {
  const [items, setItems] = useState<Cert[]>([]);
  const [doc, setDoc] = useState<unknown>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    setItems(await api<Cert[]>("/certificados"));
  }

  useEffect(() => {
    void load().catch((e) => setErro(e.message));
  }, []);

  async function consultar(id: string) {
    setDoc(await api(`/certificados/${id}/documento`));
  }

  async function reabrir(id: string) {
    const justificativa = window.prompt("Justificativa de reabertura:");
    if (!justificativa) return;
    await api(`/certificados/${id}/reabrir`, {
      method: "POST",
      body: JSON.stringify({ justificativa }),
    });
    setMsg("Certificado reaberto");
    setDoc(null);
    await load();
  }

  return (
    <div>
      <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 800 }}>Certificados</h1>
      <p style={{ margin: "0 0 16px", color: "var(--nexo-muted)", fontSize: 13 }}>
        Calibração + TSE · A Vencer ≤ 60 dias · consultar / reabrir
      </p>
      {erro && <div style={{ color: "var(--nexo-danger)" }}>{erro}</div>}
      {msg && <div style={{ marginBottom: 10 }}>{msg}</div>}
      <div style={{ background: "var(--nexo-surface)", border: "1px solid var(--nexo-border)", borderRadius: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", background: "oklch(0.97 0.01 250)" }}>
              <th style={th}>Nº</th>
              <th style={th}>Tipo</th>
              <th style={th}>Equipamento</th>
              <th style={th}>Setor</th>
              <th style={th}>Validade</th>
              <th style={th}>Status</th>
              <th style={th}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id} style={{ borderTop: "1px solid var(--nexo-border)" }}>
                <td style={td}>{c.numero}</td>
                <td style={td}>{c.tipo}</td>
                <td style={td}>{c.equipamento.tag} — {c.equipamento.nome}</td>
                <td style={td}>{c.equipamento.setor.nome}</td>
                <td style={td}>{c.validadeAte ? new Date(c.validadeAte).toLocaleDateString("pt-BR") : "—"}</td>
                <td style={{ ...td, fontWeight: 700, color: statusColor(c.statusCertificado) }}>
                  {c.statusCertificado}
                </td>
                <td style={td}>
                  <button type="button" onClick={() => void consultar(c.id)} style={btn}>Documento</button>{" "}
                  <button type="button" onClick={() => void reabrir(c.id)} style={btn}>Reabrir</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={7} style={{ ...td, color: "var(--nexo-muted)" }}>Nenhum certificado</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {doc != null && (
        <pre
          style={{
            marginTop: 14,
            padding: 14,
            borderRadius: 12,
            border: "1px solid var(--nexo-border)",
            background: "var(--nexo-surface)",
            fontSize: 11,
            overflow: "auto",
            maxHeight: 360,
          }}
        >
          {JSON.stringify(doc, null, 2)}
        </pre>
      )}
    </div>
  );
}

function statusColor(s: string) {
  if (s === "VENCIDO") return "var(--nexo-danger)";
  if (s === "A_VENCER") return "var(--nexo-warning)";
  return "var(--nexo-success)";
}

const th: React.CSSProperties = { padding: "12px 14px", fontSize: 12, color: "var(--nexo-muted)" };
const td: React.CSSProperties = { padding: "12px 14px" };
const btn: React.CSSProperties = {
  border: "1px solid var(--nexo-border)",
  background: "white",
  borderRadius: 6,
  padding: "4px 8px",
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
};
