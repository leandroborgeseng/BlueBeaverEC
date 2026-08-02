"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Solicitacao {
  id: string;
  protocolo: string;
  descricao: string;
  setorNome: string;
  urgencia: string;
  status: string;
  solicitanteNome: string;
  justificativaRecusa?: string | null;
  equipamento?: { tag: string; nome: string } | null;
  ordemServico?: { codigo: string; numero: number } | null;
}

export default function TriagemPage() {
  const [items, setItems] = useState<Solicitacao[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState<Record<string, string>>({});

  async function load() {
    setItems(await api<Solicitacao[]>("/solicitacoes"));
  }

  useEffect(() => {
    void load().catch((e) => setMsg(e.message));
  }, []);

  async function vincular(id: string) {
    const tag = tagDraft[id];
    if (!tag?.trim()) return;
    try {
      await api(`/solicitacoes/${id}/equipamento`, {
        method: "PATCH",
        body: JSON.stringify({ equipamentoTag: tag.trim() }),
      });
      setMsg("Equipamento vinculado");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro");
    }
  }

  async function aprovar(id: string) {
    try {
      const res = await api<{ os: { codigo: string }; avisoDuplicidade?: string }>(
        `/solicitacoes/${id}/aprovar`,
        { method: "POST", body: "{}" },
      );
      setMsg(
        `Convertida em ${res.os.codigo}${res.avisoDuplicidade ? ` — ${res.avisoDuplicidade}` : ""}`,
      );
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro");
    }
  }

  async function recusar(id: string) {
    const justificativa = window.prompt("Justificativa da recusa:");
    if (!justificativa?.trim()) return;
    try {
      await api(`/solicitacoes/${id}/recusar`, {
        method: "POST",
        body: JSON.stringify({ justificativa }),
      });
      setMsg("Solicitação recusada");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro");
    }
  }

  return (
    <div>
      <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 800 }}>Triagem de Solicitações</h1>
      <p style={{ margin: "0 0 16px", color: "var(--nexo-muted)", fontSize: 13 }}>
        Aprovar cria OS vinculada · recusar exige justificativa
      </p>
      {msg && <div style={{ marginBottom: 12, color: "var(--nexo-brand)" }}>{msg}</div>}

      <div style={{ display: "grid", gap: 12 }}>
        {items.map((s) => (
          <article
            key={s.id}
            style={{
              background: "var(--nexo-surface)",
              border: "1px solid var(--nexo-border)",
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <strong>{s.protocolo}</strong> · {s.urgencia} · {s.status}
                <div style={{ fontSize: 13, color: "var(--nexo-muted)", marginTop: 4 }}>
                  {s.solicitanteNome} · {s.setorNome}
                </div>
              </div>
              <div style={{ fontSize: 12, color: "var(--nexo-muted)" }}>
                {s.equipamento ? `${s.equipamento.tag} — ${s.equipamento.nome}` : "Sem equipamento"}
                {s.ordemServico ? ` · ${s.ordemServico.codigo}` : ""}
              </div>
            </div>
            <p style={{ margin: "12px 0", fontSize: 14 }}>{s.descricao}</p>
            {s.justificativaRecusa && (
              <p style={{ color: "var(--nexo-danger)", fontSize: 13 }}>Recusa: {s.justificativaRecusa}</p>
            )}
            {s.status === "PENDENTE" && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {!s.equipamento && (
                  <>
                    <input
                      placeholder="TAG equipamento"
                      value={tagDraft[s.id] ?? ""}
                      onChange={(e) => setTagDraft((d) => ({ ...d, [s.id]: e.target.value }))}
                      style={input}
                    />
                    <button type="button" style={btnGhost} onClick={() => void vincular(s.id)}>
                      Vincular
                    </button>
                  </>
                )}
                <button type="button" style={btn} onClick={() => void aprovar(s.id)} disabled={!s.equipamento}>
                  Aprovar → OS
                </button>
                <button type="button" style={btnGhost} onClick={() => void recusar(s.id)}>
                  Recusar
                </button>
              </div>
            )}
          </article>
        ))}
        {items.length === 0 && <div style={{ color: "var(--nexo-muted)" }}>Nenhuma solicitação</div>}
      </div>
    </div>
  );
}

const input: React.CSSProperties = {
  border: "1px solid var(--nexo-border)",
  borderRadius: 10,
  padding: "8px 10px",
};
const btn: React.CSSProperties = {
  border: "none",
  borderRadius: 10,
  padding: "9px 12px",
  background: "var(--nexo-primary)",
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
};
const btnGhost: React.CSSProperties = {
  ...btn,
  background: "white",
  color: "var(--nexo-text)",
  border: "1px solid var(--nexo-border)",
};
