"use client";

import { useCallback, useEffect, useState } from "react";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Badge, Btn, Err, FieldLabel, fieldStyle } from "@/components/ui/aion-ui";
import { api } from "@/lib/api";

interface Colaborador {
  id: string;
  nome: string;
  sobrecarga?: boolean;
}

interface OsItem {
  id: string;
  tipo: string;
  descricao: string;
  quantidade: number;
  valorUnitario?: number | null;
}

interface OsLog {
  id: string;
  acao: string;
  justificativa?: string | null;
  createdAt: string;
  usuario?: { nome: string } | null;
}

interface OsDetail {
  numero: number;
  codigo: string;
  status: string;
  prioridade: string;
  atrasada: boolean;
  tipo?: string;
  oficina?: string | null;
  observacaoRequisicao?: string | null;
  pendencia?: string | null;
  equipamento: {
    tag: string;
    nome: string;
    setor?: { nome: string };
  };
  responsavel?: { id: string; nome: string } | null;
  itens?: OsItem[];
  logs?: OsLog[];
}

type Tab = "geral" | "itens" | "log" | "acoes";
type StatusAcao = "fechar" | "cancelar" | "reabrir";

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: "8px 14px",
  border: "none",
  borderBottom: active ? "2px solid oklch(0.64 0.19 38)" : "2px solid transparent",
  background: "transparent",
  fontWeight: active ? 700 : 500,
  fontSize: 13,
  color: active ? "oklch(0.64 0.19 38)" : "oklch(0.5 0.02 250)",
  cursor: "pointer",
});

export function OsEditor({
  numero,
  codigo,
  onDone,
}: {
  numero: number;
  codigo: string;
  onDone: () => void;
}) {
  const [tab, setTab] = useState<Tab>("geral");
  const [os, setOs] = useState<OsDetail | null>(null);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [pendencia, setPendencia] = useState("");
  const [responsavelId, setResponsavelId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [statusModal, setStatusModal] = useState<StatusAcao | null>(null);

  const load = useCallback(async () => {
    const data = await api<OsDetail>(`/os/${numero}`);
    setOs(data);
    setPendencia(data.pendencia ?? "");
    setResponsavelId(data.responsavel?.id ?? "");
  }, [numero]);

  useEffect(() => {
    void load().catch((e) => setErro(e instanceof Error ? e.message : "Erro"));
    api<Colaborador[]>("/pessoas/colaboradores")
      .then(setColaboradores)
      .catch(() => undefined);
  }, [load]);

  async function salvarPendencia() {
    try {
      await api(`/os/${numero}/pendencia`, {
        method: "PATCH",
        body: JSON.stringify({ pendencia: pendencia || null }),
      });
      setMsg("Pendência salva");
      setErro(null);
      await load();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    }
  }

  async function atribuir() {
    if (!responsavelId) return;
    try {
      await api(`/os/${numero}/atribuir`, {
        method: "PATCH",
        body: JSON.stringify({ responsavelId }),
      });
      setMsg("Responsável atribuído");
      setErro(null);
      await load();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    }
  }

  async function confirmarStatus(justificativa?: string) {
    if (!statusModal) return;
    await api(`/os/${numero}/status`, {
      method: "PATCH",
      body: JSON.stringify({ acao: statusModal, justificativa }),
    });
    setStatusModal(null);
    if (statusModal === "fechar" || statusModal === "cancelar") {
      onDone();
    } else {
      setMsg(`OS ${statusModal === "reabrir" ? "reaberta" : statusModal}`);
      await load();
    }
  }

  if (erro && !os) return <Err>{erro}</Err>;
  if (!os) return <div style={{ color: "oklch(0.5 0.02 250)" }}>Carregando OS…</div>;

  const equipTag = os.equipamento.tag;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid oklch(0.91 0.006 255)", marginBottom: 4 }}>
        {(["geral", "itens", "log", "acoes"] as Tab[]).map((t) => (
          <button key={t} type="button" style={tabStyle(tab === t)} onClick={() => setTab(t)}>
            {t === "geral" ? "Geral" : t === "itens" ? "Itens" : t === "log" ? "Log" : "Ações"}
          </button>
        ))}
      </div>

      {erro && <Err>{erro}</Err>}
      {msg && <div style={{ fontSize: 13, fontWeight: 600, color: "oklch(0.4 0.14 150)" }}>{msg}</div>}

      {tab === "geral" && (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <strong style={{ fontSize: 16 }}>{os.codigo || codigo}</strong>
            <Badge tone={os.atrasada ? "ATRASADA" : os.status}>{os.atrasada ? "Atrasada" : os.status.replace(/_/g, " ")}</Badge>
            <Badge tone={os.prioridade}>{os.prioridade}</Badge>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 13 }}>
            <InfoField label="Equipamento" value={`${os.equipamento.nome} (${os.equipamento.tag})`} />
            <InfoField label="Setor" value={os.equipamento.setor?.nome ?? "—"} />
            <InfoField label="Tipo" value={os.tipo?.replace(/_/g, " ") ?? "—"} />
            <InfoField label="Oficina" value={os.oficina ?? "—"} />
            <InfoField label="Responsável" value={os.responsavel?.nome ?? "Não atribuído"} />
          </div>

          {os.observacaoRequisicao && (
            <div>
              <FieldLabel>Observação</FieldLabel>
              <div style={{ fontSize: 13, lineHeight: 1.45 }}>{os.observacaoRequisicao}</div>
            </div>
          )}

          <div>
            <FieldLabel>Pendência</FieldLabel>
            <textarea
              value={pendencia}
              onChange={(e) => setPendencia(e.target.value)}
              rows={3}
              style={fieldStyle}
              placeholder="Descreva pendências…"
            />
            <div style={{ marginTop: 8 }}>
              <Btn size="sm" onClick={() => void salvarPendencia()}>
                Salvar pendência
              </Btn>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn variant="ghost" size="sm" href={`/mobile/os/${numero}`}>
              Abrir no campo
            </Btn>
            <Btn variant="ghost" size="sm" href={`/equipamentos/${encodeURIComponent(equipTag)}/ficha-vida`}>
              Ficha de vida
            </Btn>
          </div>
        </div>
      )}

      {tab === "itens" && (
        <div>
          {(os.itens ?? []).length === 0 ? (
            <div style={{ color: "oklch(0.5 0.02 250)", fontSize: 13 }}>Nenhum item registrado.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={thMini}>Tipo</th>
                  <th style={thMini}>Descrição</th>
                  <th style={thMini}>Qtd</th>
                  <th style={thMini}>Valor</th>
                </tr>
              </thead>
              <tbody>
                {(os.itens ?? []).map((item) => (
                  <tr key={item.id}>
                    <td style={tdMini}>
                      <Badge>{item.tipo === "MAO_DE_OBRA" ? "Mão de obra" : "Material"}</Badge>
                    </td>
                    <td style={tdMini}>{item.descricao}</td>
                    <td style={tdMini}>{item.quantidade}</td>
                    <td style={tdMini}>
                      {item.valorUnitario != null ? `R$ ${item.valorUnitario.toFixed(2)}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "log" && (
        <div style={{ display: "grid", gap: 8 }}>
          {(os.logs ?? []).length === 0 ? (
            <div style={{ color: "oklch(0.5 0.02 250)", fontSize: 13 }}>Nenhum registro no log.</div>
          ) : (
            (os.logs ?? []).map((log) => (
              <div
                key={log.id}
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid oklch(0.91 0.006 255)",
                  fontSize: 13,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <strong>{log.acao.replace(/_/g, " ")}</strong>
                  <span style={{ color: "oklch(0.5 0.02 250)", fontSize: 12 }}>
                    {new Date(log.createdAt).toLocaleString("pt-BR")}
                  </span>
                </div>
                {log.justificativa && <div style={{ marginTop: 4, color: "oklch(0.45 0.02 250)" }}>{log.justificativa}</div>}
                {log.usuario && (
                  <div style={{ marginTop: 4, fontSize: 12, color: "oklch(0.5 0.02 250)" }}>{log.usuario.nome}</div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === "acoes" && (
        <div style={{ display: "grid", gap: 14 }}>
          <div>
            <FieldLabel>Atribuir responsável</FieldLabel>
            <div style={{ display: "flex", gap: 8 }}>
              <select
                value={responsavelId}
                onChange={(e) => setResponsavelId(e.target.value)}
                style={{ ...fieldStyle, flex: 1 }}
              >
                <option value="">Selecione…</option>
                {colaboradores.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                    {c.sobrecarga ? " (sobrecarga)" : ""}
                  </option>
                ))}
              </select>
              <Btn onClick={() => void atribuir()} disabled={!responsavelId}>
                Atribuir
              </Btn>
            </div>
          </div>

          <div>
            <FieldLabel>Alterar status</FieldLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <Btn onClick={() => setStatusModal("fechar")}>Fechar OS</Btn>
              <Btn variant="danger" onClick={() => setStatusModal("cancelar")}>
                Cancelar OS
              </Btn>
              <Btn variant="ghost" onClick={() => setStatusModal("reabrir")}>
                Reabrir OS
              </Btn>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={statusModal === "fechar"}
        title="Fechar ordem de serviço"
        message={`Confirma o fechamento da OS ${os.codigo}?`}
        confirmLabel="Fechar"
        onConfirm={() => confirmarStatus()}
        onCancel={() => setStatusModal(null)}
      />
      <ConfirmModal
        open={statusModal === "cancelar"}
        title="Cancelar ordem de serviço"
        message={`A OS ${os.codigo} será cancelada. Esta ação exige justificativa.`}
        confirmLabel="Cancelar OS"
        danger
        requireJustification
        onConfirm={(j) => confirmarStatus(j)}
        onCancel={() => setStatusModal(null)}
      />
      <ConfirmModal
        open={statusModal === "reabrir"}
        title="Reabrir ordem de serviço"
        message={`A OS ${os.codigo} será reaberta. Informe a justificativa.`}
        confirmLabel="Reabrir"
        requireJustification
        onConfirm={(j) => confirmarStatus(j)}
        onCancel={() => setStatusModal(null)}
      />
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div style={{ fontWeight: 600 }}>{value}</div>
    </div>
  );
}

const thMini: React.CSSProperties = {
  padding: "8px 10px",
  textAlign: "left",
  fontSize: 11,
  fontWeight: 600,
  color: "oklch(0.5 0.02 250)",
  borderBottom: "1px solid oklch(0.91 0.006 255)",
};

const tdMini: React.CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid oklch(0.945 0.004 255)",
};
