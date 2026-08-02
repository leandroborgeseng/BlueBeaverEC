"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface LogRow {
  id: string;
  acao: string;
  justificativa?: string | null;
  createdAt: string;
  usuario?: { nome: string } | null;
  ordemServico: { numero: number; codigo: string | null };
}

export default function OsAuditoriaPage() {
  const [items, setItems] = useState<LogRow[]>([]);
  const [acao, setAcao] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  async function load(filtro = acao) {
    const q = filtro ? `?acao=${encodeURIComponent(filtro)}` : "";
    setItems(await api<LogRow[]>(`/os/auditoria${q}`));
  }

  useEffect(() => {
    void load().catch((e) => setErro(e.message));
  }, []);

  return (
    <div>
      <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 800 }}>Auditoria de OS</h1>
      <p style={{ margin: "0 0 16px", color: "var(--nexo-muted)", fontSize: 13 }}>
        Trilha imutável · somente leitura
      </p>
      {erro && <div style={{ color: "var(--nexo-danger)" }}>{erro}</div>}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <select
          value={acao}
          onChange={(e) => {
            setAcao(e.target.value);
            void load(e.target.value).catch((err) => setErro(err.message));
          }}
          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--nexo-border)" }}
        >
          <option value="">Todas as ações</option>
          {["ABERTURA", "ATRIBUICAO", "FECHAMENTO", "FECHAMENTO_MOBILE", "CANCELAMENTO", "REABERTURA", "SERVICO_EXECUTADO"].map(
            (a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ),
          )}
        </select>
      </div>
      <div style={{ background: "var(--nexo-surface)", border: "1px solid var(--nexo-border)", borderRadius: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", background: "oklch(0.97 0.01 250)" }}>
              <th style={th}>Quando</th>
              <th style={th}>OS</th>
              <th style={th}>Ação</th>
              <th style={th}>Usuário</th>
              <th style={th}>Detalhe</th>
            </tr>
          </thead>
          <tbody>
            {items.map((l) => (
              <tr key={l.id} style={{ borderTop: "1px solid var(--nexo-border)" }}>
                <td style={td}>{new Date(l.createdAt).toLocaleString("pt-BR")}</td>
                <td style={td}>{l.ordemServico.codigo ?? `OS-${l.ordemServico.numero}`}</td>
                <td style={td}>
                  <strong>{l.acao}</strong>
                </td>
                <td style={td}>{l.usuario?.nome ?? "—"}</td>
                <td style={td}>{l.justificativa ?? "—"}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} style={{ ...td, color: "var(--nexo-muted)" }}>
                  Sem registros
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th: React.CSSProperties = { padding: "12px 14px", fontSize: 12, color: "var(--nexo-muted)" };
const td: React.CSSProperties = { padding: "12px 14px" };
