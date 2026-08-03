"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  Badge,
  Btn,
  Empty,
  Err,
  FieldLabel,
  PageHeader,
  Surface,
  fieldStyle,
} from "@/components/ui/nexo-ui";

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
  const [erro, setErro] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState<Record<string, string>>({});

  async function load() {
    setItems(await api<Solicitacao[]>("/solicitacoes"));
  }

  useEffect(() => {
    void load().catch((e) => setErro(e.message));
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
      setErro(null);
      await load();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    }
  }

  async function aprovar(id: string) {
    try {
      const res = await api<{ os: { codigo: string }; avisoDuplicidade?: string }>(
        `/solicitacoes/${id}/aprovar`,
        { method: "POST", body: "{}" },
      );
      setMsg(`Convertida em ${res.os.codigo}${res.avisoDuplicidade ? ` — ${res.avisoDuplicidade}` : ""}`);
      setErro(null);
      await load();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
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
      setErro(null);
      await load();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    }
  }

  const pendentes = items.filter((s) => s.status === "PENDENTE").length;

  return (
    <div>
      <PageHeader
        title="Triagem de Solicitações"
        subtitle={
          <span>
            Aprovar cria OS vinculada · recusar exige justificativa · <strong>{pendentes}</strong> pendente(s)
          </span>
        }
      />

      {erro && <Err>{erro}</Err>}
      {msg && (
        <div style={{ marginBottom: 12, fontSize: 13, fontWeight: 600, color: "oklch(0.4 0.14 255)" }}>{msg}</div>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        {items.map((s) => (
          <Surface key={s.id}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <strong style={{ fontSize: 15 }}>{s.protocolo}</strong>
                  <Badge tone={s.urgencia}>{s.urgencia}</Badge>
                  <Badge tone={s.status}>{s.status}</Badge>
                </div>
                <div style={{ fontSize: 13, color: "oklch(0.5 0.02 250)", marginTop: 6 }}>
                  {s.solicitanteNome} · {s.setorNome}
                </div>
              </div>
              <div style={{ fontSize: 12.5, color: "oklch(0.5 0.02 250)", textAlign: "right" }}>
                {s.equipamento ? (
                  <>
                    <strong>{s.equipamento.tag}</strong> — {s.equipamento.nome}
                  </>
                ) : (
                  "Sem equipamento"
                )}
                {s.ordemServico ? (
                  <div>
                    OS: <strong>{s.ordemServico.codigo}</strong>
                  </div>
                ) : null}
              </div>
            </div>

            <p style={{ margin: "14px 0 0", fontSize: 14, lineHeight: 1.45 }}>{s.descricao}</p>

            {s.justificativaRecusa && (
              <p style={{ margin: "10px 0 0", color: "oklch(0.45 0.15 25)", fontSize: 13, fontWeight: 600 }}>
                Recusa: {s.justificativaRecusa}
              </p>
            )}

            {s.status === "PENDENTE" && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end", marginTop: 14 }}>
                {!s.equipamento && (
                  <div style={{ minWidth: 160, flex: 1 }}>
                    <FieldLabel>TAG equipamento</FieldLabel>
                    <input
                      placeholder="Ex: EQ-0001"
                      value={tagDraft[s.id] ?? ""}
                      onChange={(e) => setTagDraft((d) => ({ ...d, [s.id]: e.target.value }))}
                      style={fieldStyle}
                    />
                  </div>
                )}
                {!s.equipamento && (
                  <Btn variant="ghost" onClick={() => void vincular(s.id)}>
                    Vincular
                  </Btn>
                )}
                <Btn variant="primary" onClick={() => void aprovar(s.id)} disabled={!s.equipamento}>
                  Aprovar → OS
                </Btn>
                <Btn variant="danger" onClick={() => void recusar(s.id)}>
                  Recusar
                </Btn>
              </div>
            )}
          </Surface>
        ))}
        {items.length === 0 && <Empty text="Nenhuma solicitação na fila." />}
      </div>
    </div>
  );
}
