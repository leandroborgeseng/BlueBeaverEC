"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useWindowStore } from "@/store/windows";

interface OsRow {
  id: string;
  numero: number;
  codigo: string;
  status: string;
  prioridade: string;
  atrasada: boolean;
  equipamento: { tag: string; nome: string };
  responsavel?: { nome: string } | null;
}

export default function OsPage() {
  const [items, setItems] = useState<OsRow[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const open = useWindowStore((s) => s.open);

  useEffect(() => {
    api<{ items: OsRow[] }>("/os")
      .then((d) => setItems(d.items))
      .catch((e) => setErro(e.message));
  }, []);

  return (
    <div>
      <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 800 }}>Ordens de Serviço</h1>
      <p style={{ margin: "0 0 16px", color: "var(--nexo-muted)", fontSize: 13 }}>
        Lista colorida por prioridade · SLA visual (Atrasada)
      </p>
      {erro && <div style={{ color: "var(--nexo-danger)" }}>{erro}</div>}

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
              <th style={th}>OS</th>
              <th style={th}>Equipamento</th>
              <th style={th}>Prioridade</th>
              <th style={th}>Status</th>
              <th style={th}>Responsável</th>
            </tr>
          </thead>
          <tbody>
            {items.map((os) => (
              <tr
                key={os.id}
                onClick={() =>
                  open({
                    kind: "os",
                    title: os.codigo,
                    payload: os as unknown as Record<string, unknown>,
                  })
                }
                style={{
                  cursor: "pointer",
                  borderTop: "1px solid var(--nexo-border)",
                  borderLeft: `4px solid ${prioColor(os.prioridade)}`,
                }}
              >
                <td style={td}>
                  <strong>{os.codigo}</strong>
                  {os.atrasada && (
                    <span style={{ marginLeft: 8, color: "var(--nexo-danger)", fontWeight: 700, fontSize: 11 }}>
                      ATRASADA
                    </span>
                  )}
                </td>
                <td style={td}>
                  {os.equipamento.tag} — {os.equipamento.nome}
                </td>
                <td style={td}>{os.prioridade}</td>
                <td style={td}>{os.status}</td>
                <td style={td}>{os.responsavel?.nome ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function prioColor(p: string) {
  switch (p) {
    case "URGENTE":
      return "var(--nexo-danger)";
    case "ALTA":
      return "var(--nexo-primary)";
    case "MEDIA":
      return "var(--nexo-warning)";
    default:
      return "var(--nexo-border)";
  }
}

const th: React.CSSProperties = { padding: "12px 14px", fontSize: 12, color: "var(--nexo-muted)" };
const td: React.CSSProperties = { padding: "12px 14px" };
