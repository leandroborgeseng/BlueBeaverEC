"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useWindowStore } from "@/store/windows";

interface EquipamentoRow {
  id: string;
  tag: string;
  nome: string;
  situacao: string;
  checklistRecebimentoPendente: boolean;
  setor: { nome: string };
  fabricante: { nome: string };
  modelo: { nome: string };
  descricao: { nome: string; criticidade: string };
}

export default function EquipamentosPage() {
  const [items, setItems] = useState<EquipamentoRow[]>([]);
  const [q, setQ] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const open = useWindowStore((s) => s.open);

  async function load(search = q) {
    try {
      const data = await api<{ items: EquipamentoRow[] }>(
        `/equipamentos?q=${encodeURIComponent(search)}`,
      );
      setItems(data.items);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    }
  }

  useEffect(() => {
    void load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "end", gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 800 }}>Equipamentos</h1>
          <p style={{ margin: 0, color: "var(--nexo-muted)", fontSize: 13 }}>
            Inventário com alerta de checklist de recebimento pendente
          </p>
        </div>
        <a href="/os/nova" style={{ ...primaryBtn, display: "inline-block", textDecoration: "none" }}>
          Abrir OS
        </a>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="TAG, nome, patrimônio…"
          style={input}
        />
        <button type="button" onClick={() => load()} style={primaryBtn}>
          Buscar
        </button>
      </div>

      {erro && <div style={{ color: "var(--nexo-danger)", marginBottom: 12 }}>{erro}</div>}

      <div
        style={{
          background: "var(--nexo-surface)",
          border: "1px solid var(--nexo-border)",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "oklch(0.97 0.01 250)", textAlign: "left" }}>
              <th style={th}>TAG</th>
              <th style={th}>Nome</th>
              <th style={th}>Tipo</th>
              <th style={th}>Setor</th>
              <th style={th}>Fabricante / Modelo</th>
              <th style={th}>Situação</th>
            </tr>
          </thead>
          <tbody>
            {items.map((eq) => (
              <tr
                key={eq.id}
                onClick={() =>
                  open({
                    kind: "equipamento",
                    title: `${eq.tag} — ${eq.nome}`,
                    payload: eq as unknown as Record<string, unknown>,
                  })
                }
                style={{ cursor: "pointer", borderTop: "1px solid var(--nexo-border)" }}
              >
                <td style={td}>
                  <strong>{eq.tag}</strong>
                  {eq.checklistRecebimentoPendente && (
                    <span
                      title="Checklist de recebimento pendente"
                      style={{
                        marginLeft: 8,
                        fontSize: 11,
                        fontWeight: 700,
                        color: "var(--nexo-warning)",
                      }}
                    >
                      ALERTA
                    </span>
                  )}
                </td>
                <td style={td}>{eq.nome}</td>
                <td style={td}>{eq.descricao.nome}</td>
                <td style={td}>{eq.setor.nome}</td>
                <td style={td}>
                  {eq.fabricante.nome} / {eq.modelo.nome}
                </td>
                <td style={td}>{eq.situacao}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} style={{ ...td, color: "var(--nexo-muted)" }}>
                  Nenhum equipamento encontrado
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
const input: React.CSSProperties = {
  border: "1px solid var(--nexo-border)",
  borderRadius: 10,
  padding: "10px 12px",
  minWidth: 240,
};
const primaryBtn: React.CSSProperties = {
  border: "none",
  borderRadius: 10,
  padding: "10px 14px",
  background: "var(--nexo-primary)",
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
};
