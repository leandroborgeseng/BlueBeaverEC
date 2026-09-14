"use client";

import { useCallback, useEffect, useState } from "react";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Badge, Btn, Err, FieldLabel, fieldStyle } from "@/components/ui/aion-ui";
import { api, downloadApi } from "@/lib/api";
import { SlaChip } from "@/components/os/SlaChip";
import { filesToAnexos, labelAcaoOS, labelCondicaoUso, labelStatusOS } from "@/lib/os-ui";
import { labelResponsavel } from "@/lib/session";
import { useWindowStore } from "@/store/windows";

interface Colaborador {
  id: string;
  nome: string;
  funcao?: string | null;
  cargo?: string | null;
  sobrecarga?: boolean;
}

interface OsItem {
  id: string;
  tipo: string;
  descricao: string;
  quantidade: number;
  valorUnitario?: number | null;
}

interface TimelineItem {
  id: string;
  tipo: string;
  acao: string;
  texto?: string | null;
  visibilidade?: string;
  createdAt: string;
  autor?: string | null;
}

interface OsDetail {
  numero: number;
  codigo: string;
  status: string;
  prioridade: string;
  atrasada: boolean;
  slaLimite?: string | null;
  slaEstourado?: boolean;
  slaMinutosRestantes?: number;
  tipo?: string;
  oficina?: string | null;
  observacaoRequisicao?: string | null;
  pendencia?: string | null;
  diagnostico?: string | null;
  servicoRealizado?: string | null;
  resultadoAtendimento?: string | null;
  condicaoFinal?: string | null;
  motivoAguardo?: string | null;
  identificacaoPendente?: boolean;
  equipamentoParado?: boolean;
  impactoInformado?: string | null;
  urgenciaPercebida?: string | null;
  textoConclusaoPublico?: string | null;
  conclusaoSnapshot?: string | null;
  pedidoReaberturaJustificativa?: string | null;
  atribuicaoVersao?: number;
  equipamento?: {
    tag: string;
    nome: string;
    condicaoUso?: string;
    setor?: { nome: string };
  } | null;
  setor?: { nome: string } | null;
  responsavel?: { id: string; nome: string } | null;
  itens?: OsItem[];
  timeline?: TimelineItem[];
  anexos?: Array<{ id: string; nomeArquivo: string; visibilidade: string }>;
}

type Tab = "geral" | "execucao" | "comunicacao" | "acoes";
type StatusAcao = "fechar" | "cancelar" | "reabrir" | "aguardar";

const TIPOS_COM_LAUDO = new Set(["PREVENTIVA", "CALIBRACAO", "TSE", "QUALIFICACAO"]);

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
  const open = useWindowStore((s) => s.open);
  const [tab, setTab] = useState<Tab>("geral");
  const [os, setOs] = useState<OsDetail | null>(null);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [pendencia, setPendencia] = useState("");
  const [diagnostico, setDiagnostico] = useState("");
  const [servico, setServico] = useState("");
  const [resultado, setResultado] = useState("");
  const [horas, setHoras] = useState("");
  const [condicaoFinal, setCondicaoFinal] = useState("");
  const [textoPublico, setTextoPublico] = useState("");
  const [itemDesc, setItemDesc] = useState("");
  const [comentario, setComentario] = useState("");
  const [visComentario, setVisComentario] = useState<"PUBLICO" | "INTERNO">("PUBLICO");
  const [equipTag, setEquipTag] = useState("");
  const [buscaEquip, setBuscaEquip] = useState("");
  const [hints, setHints] = useState<Array<{ tag: string; nome: string; patrimonio?: string | null; nSerie?: string | null }>>([]);
  const [setores, setSetores] = useState<Array<{ id: string; nome: string }>>([]);
  const [setorId, setSetorId] = useState("");
  const [prioridadeTecnica, setPrioridadeTecnica] = useState("");
  const [responsavelId, setResponsavelId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [statusModal, setStatusModal] = useState<StatusAcao | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const data = await api<OsDetail>(`/os/${numero}`);
    setOs(data);
    setPendencia(data.pendencia ?? "");
    setDiagnostico(data.diagnostico ?? "");
    setServico(data.servicoRealizado ?? "");
    setResultado(data.resultadoAtendimento ?? "");
    setCondicaoFinal(data.condicaoFinal ?? "");
    setTextoPublico(data.textoConclusaoPublico ?? "");
    setResponsavelId(data.responsavel?.id ?? "");
    setPrioridadeTecnica(data.prioridade ?? "");
  }, [numero]);

  useEffect(() => {
    void load().catch((e) => setErro(e instanceof Error ? e.message : "Erro"));
    api<Colaborador[]>("/os/responsaveis")
      .then(setColaboradores)
      .catch(() => undefined);
    api<Array<{ id: string; nome: string }>>("/setores")
      .then(setSetores)
      .catch(() => undefined);
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (buscaEquip.trim().length < 2) {
        setHints([]);
        return;
      }
      void api<{ items: Array<{ tag: string; nome: string; patrimonio?: string | null; nSerie?: string | null }> }>(
        `/equipamentos?q=${encodeURIComponent(buscaEquip.trim())}&pageSize=12`,
      )
        .then((r) => setHints(r.items ?? []))
        .catch(() => setHints([]));
    }, 300);
    return () => clearTimeout(t);
  }, [buscaEquip]);

  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setErro(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  async function confirmarStatus(justificativa?: string) {
    if (!statusModal || busy) return;
    const acao = statusModal;
    if (acao === "fechar") {
      if (!servico.trim() || !resultado.trim() || !condicaoFinal) {
        setErro("Para concluir, informe serviço realizado, resultado e a condição final do equipamento.");
        setStatusModal(null);
        return;
      }
    }
    setBusy(true);
    try {
      await api(`/os/${numero}/status`, {
        method: "PATCH",
        body: JSON.stringify(
          acao === "fechar"
            ? {
                acao,
                servicoRealizado: servico,
                resultadoAtendimento: resultado,
                condicaoFinal,
                textoConclusaoPublico: textoPublico || undefined,
                diagnostico,
                justificativa,
              }
            : { acao, justificativa },
        ),
      });
      setStatusModal(null);
      setErro(null);
      if (acao === "fechar" || acao === "cancelar") onDone();
      else {
        setMsg(acao === "reabrir" ? "OS reaberta. A conclusão anterior foi preservada." : `OS ${acao}`);
        await load();
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
      setStatusModal(null);
    } finally {
      setBusy(false);
    }
  }

  if (erro && !os) return <Err>{erro}</Err>;
  if (!os) return <div style={{ color: "oklch(0.5 0.02 250)" }}>Carregando OS…</div>;

  const tag = os.equipamento?.tag ?? "";

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid oklch(0.91 0.006 255)", marginBottom: 4 }}>
        {(["geral", "execucao", "comunicacao", "acoes"] as Tab[]).map((t) => (
          <button key={t} type="button" style={tabStyle(tab === t)} onClick={() => setTab(t)}>
            {t === "geral" ? "Geral" : t === "execucao" ? "Execução" : t === "comunicacao" ? "Comunicação" : "Ações"}
          </button>
        ))}
      </div>

      {erro && <Err>{erro}</Err>}
      {msg && <div style={{ fontSize: 13, fontWeight: 600, color: "oklch(0.4 0.14 150)" }}>{msg}</div>}
      {os.pedidoReaberturaJustificativa && (
        <div style={{ padding: 10, borderRadius: 8, background: "oklch(0.96 0.04 85)", fontSize: 13 }}>
          Pedido de reabertura do usuário: {os.pedidoReaberturaJustificativa}
        </div>
      )}

      {tab === "geral" && (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <strong style={{ fontSize: 16 }}>{os.codigo || codigo}</strong>
            <Badge tone={os.atrasada ? "ATRASADA" : os.status}>
              {os.atrasada ? "Atrasada" : labelStatusOS(os.status)}
            </Badge>
            <Badge tone={os.prioridade}>{os.prioridade}</Badge>
            <SlaChip slaLimite={os.slaLimite} slaEstourado={os.slaEstourado} status={os.status} />
            {os.equipamentoParado && <Badge tone="PARADO">Parado</Badge>}
            {os.identificacaoPendente && <Badge>Identificação pendente</Badge>}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 13 }}>
            <InfoField
              label="Equipamento"
              value={
                os.equipamento
                  ? `${os.equipamento.nome} (${os.equipamento.tag})`
                  : "Chamado do setor (sem TAG)"
              }
            />
            <InfoField label="Setor" value={os.equipamento?.setor?.nome ?? os.setor?.nome ?? "—"} />
            <InfoField label="Tipo" value={os.tipo?.replace(/_/g, " ") ?? "—"} />
            <InfoField label="Responsável" value={os.responsavel?.nome ?? "Não atribuído"} />
            <InfoField
              label="Condição de uso atual"
              value={labelCondicaoUso(os.equipamento?.condicaoUso)}
            />
            {os.impactoInformado && <InfoField label="Impacto informado" value={os.impactoInformado} />}
            {os.urgenciaPercebida && (
              <InfoField
                label="Urgência percebida pelo setor"
                value={`${os.urgenciaPercebida.replace(/_/g, " ")} · a prioridade técnica é da engenharia`}
              />
            )}
          </div>

          {os.identificacaoPendente && (
            <div
              style={{
                padding: 10,
                borderRadius: 8,
                background: "oklch(0.96 0.03 85)",
                fontSize: 13,
              }}
            >
              Equipamento pendente. Na aba Ações, identifique o setor, o aparelho e a prioridade técnica.
            </div>
          )}

          {(os.timeline ?? []).some((t) => t.acao === "TRANSFERENCIA") && (
            <div style={{ fontSize: 13, padding: 10, borderRadius: 8, background: "oklch(0.96 0.02 250)" }}>
              <strong>Transferência:</strong>{" "}
              {(os.timeline ?? []).find((t) => t.acao === "TRANSFERENCIA")?.texto ??
                `Responsável atual: ${os.responsavel?.nome ?? "—"}`}
            </div>
          )}

          {os.motivoAguardo && (
            <div>
              <FieldLabel>Motivo do aguardo</FieldLabel>
              <div style={{ fontSize: 13 }}>{os.motivoAguardo}</div>
            </div>
          )}

          {os.textoConclusaoPublico && (
            <div>
              <FieldLabel>Texto ao solicitante</FieldLabel>
              <div style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{os.textoConclusaoPublico}</div>
            </div>
          )}

          {os.observacaoRequisicao && (
            <div>
              <FieldLabel>Pedido</FieldLabel>
              <div style={{ fontSize: 13, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{os.observacaoRequisicao}</div>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {os.tipo && TIPOS_COM_LAUDO.has(os.tipo) && (
              <Btn
                size="sm"
                onClick={() =>
                  open({
                    kind: "laudo",
                    title: `Laudo · OS ${os.numero}`,
                    payload: { tipo: os.tipo, equipamentoTag: tag, osNumero: os.numero },
                  })
                }
              >
                Registrar laudo
              </Btn>
            )}
            <Btn variant="ghost" size="sm" href={`/mobile/os/${numero}`}>
              Abrir no campo
            </Btn>
            {tag && tag !== "—" && (
              <Btn variant="ghost" size="sm" href={`/equipamentos/${encodeURIComponent(tag)}/ficha-vida`}>
                Histórico do equipamento
              </Btn>
            )}
          </div>
        </div>
      )}

      {tab === "execucao" && (
        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <FieldLabel>Diagnóstico (interno)</FieldLabel>
            <textarea value={diagnostico} onChange={(e) => setDiagnostico(e.target.value)} rows={3} style={fieldStyle} />
          </div>
          <div>
            <FieldLabel>Serviço realizado</FieldLabel>
            <textarea value={servico} onChange={(e) => setServico(e.target.value)} rows={3} style={fieldStyle} />
          </div>
          <div>
            <FieldLabel>Resultado</FieldLabel>
            <textarea value={resultado} onChange={(e) => setResultado(e.target.value)} rows={2} style={fieldStyle} />
          </div>
          <div>
            <FieldLabel>Pendências</FieldLabel>
            <textarea value={pendencia} onChange={(e) => setPendencia(e.target.value)} rows={2} style={fieldStyle} />
          </div>
          <div>
            <FieldLabel>Peça ou material (sem estoque)</FieldLabel>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={itemDesc}
                onChange={(e) => setItemDesc(e.target.value)}
                placeholder="Ex.: fusível 5A"
                style={{ ...fieldStyle, flex: 1 }}
              />
              <Btn
                size="sm"
                disabled={busy || !itemDesc.trim()}
                onClick={() =>
                  void run(async () => {
                    await api(`/os/${numero}/execucao`, {
                      method: "PATCH",
                      body: JSON.stringify({ itens: [{ descricao: itemDesc, tipo: "MATERIAL" }] }),
                    });
                    setItemDesc("");
                    setMsg("Item registrado");
                  })
                }
              >
                Incluir
              </Btn>
            </div>
          </div>
          <div>
            <FieldLabel>Tempo de execução (horas)</FieldLabel>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={horas}
                onChange={(e) => setHoras(e.target.value)}
                type="number"
                min="0.1"
                step="0.1"
                placeholder="Ex.: 1,5"
                style={{ ...fieldStyle, flex: 1 }}
              />
              <Btn
                size="sm"
                disabled={busy || !horas || Number(horas) <= 0}
                onClick={() =>
                  void run(async () => {
                    await api(`/os/${numero}/execucao`, {
                      method: "PATCH",
                      body: JSON.stringify({
                        itens: [{ tipo: "MAO_DE_OBRA", descricao: "Tempo de execução", quantidade: Number(horas) }],
                      }),
                    });
                    setHoras("");
                    setMsg("Tempo registrado");
                  })
                }
              >
                Registrar
              </Btn>
            </div>
          </div>
          {(os.itens ?? []).length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
              {(os.itens ?? []).map((item) => (
                <li key={item.id}>
                  {item.descricao} · {item.quantidade}
                </li>
              ))}
            </ul>
          )}
          <Btn
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await api(`/os/${numero}/execucao`, {
                  method: "PATCH",
                  body: JSON.stringify({
                    diagnostico,
                    servicoRealizado: servico,
                    resultadoAtendimento: resultado,
                    pendencia: pendencia || null,
                  }),
                });
                setMsg("Execução salva");
              })
            }
          >
            Salvar execução
          </Btn>
        </div>
      )}

      {tab === "comunicacao" && (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gap: 8, maxHeight: 280, overflow: "auto" }}>
            {(os.timeline ?? []).map((t) => (
              <div key={t.id} style={{ padding: "8px 10px", border: "1px solid oklch(0.91 0.006 255)", borderRadius: 8, fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <strong>{labelAcaoOS(t.acao)}</strong>
                  <span style={{ color: "oklch(0.5 0.02 250)", fontSize: 12 }}>
                    {t.visibilidade === "INTERNO" ? "Interno · " : ""}
                    {new Date(t.createdAt).toLocaleString("pt-BR")}
                  </span>
                </div>
                {t.texto && <div style={{ marginTop: 4 }}>{t.texto}</div>}
                {t.autor && <div style={{ marginTop: 4, fontSize: 12, color: "oklch(0.5 0.02 250)" }}>{t.autor}</div>}
              </div>
            ))}
          </div>
          <textarea
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            rows={3}
            style={fieldStyle}
            placeholder="Mensagem para o solicitante ou nota interna"
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select
              value={visComentario}
              onChange={(e) => setVisComentario(e.target.value as "PUBLICO" | "INTERNO")}
              style={fieldStyle}
            >
              <option value="PUBLICO">Público (usuário vê)</option>
              <option value="INTERNO">Interno (só a equipe)</option>
            </select>
            <Btn
              disabled={busy || !comentario.trim()}
              onClick={() =>
                void run(async () => {
                  await api(`/os/${numero}/comentarios`, {
                    method: "POST",
                    body: JSON.stringify({ texto: comentario, visibilidade: visComentario }),
                  });
                  setComentario("");
                  setMsg("Mensagem registrada");
                })
              }
            >
              Enviar
            </Btn>
            <label style={{ fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Anexar
              <input
                type="file"
                accept="image/*,application/pdf"
                hidden
                onChange={(e) =>
                  void run(async () => {
                    const files = await filesToAnexos(e.target.files);
                    for (const f of files) {
                      await api(`/os/${numero}/anexos`, {
                        method: "POST",
                        body: JSON.stringify({ ...f, visibilidade: visComentario }),
                      });
                    }
                    setMsg("Anexo enviado");
                  })
                }
              />
            </label>
          </div>
          {(os.anexos ?? []).map((a) => (
            <Btn
              key={a.id}
              size="sm"
              variant="ghost"
              onClick={() => void downloadApi(`/os/${numero}/anexos/${a.id}`, undefined, a.nomeArquivo)}
            >
              {a.nomeArquivo} {a.visibilidade === "INTERNO" ? "(interno)" : ""}
            </Btn>
          ))}
        </div>
      )}

      {tab === "acoes" && (
        <div style={{ display: "grid", gap: 14 }}>
          <div
            style={{
              display: "grid",
              gap: 10,
              padding: 12,
              borderRadius: 10,
              border: "1px solid oklch(0.91 0.006 255)",
              background: os.identificacaoPendente ? "oklch(0.98 0.02 85)" : "oklch(0.99 0.002 255)",
            }}
          >
            <div>
              <strong>Triagem técnica</strong>
              <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)", marginTop: 4 }}>
                Confirme setor, equipamento e prioridade. A urgência do pedido não substitui esta decisão.
              </div>
            </div>
            <div>
              <FieldLabel>Equipamento (TAG, nome, patrimônio ou série)</FieldLabel>
              <input
                value={buscaEquip}
                onChange={(e) => setBuscaEquip(e.target.value)}
                placeholder="Busque o aparelho…"
                style={fieldStyle}
              />
              {equipTag && (
                <div style={{ marginTop: 6, fontSize: 13 }}>
                  Selecionado: <strong>{equipTag}</strong>
                </div>
              )}
              {hints.length > 0 && (
                <div style={{ marginTop: 6, border: "1px solid oklch(0.91 0.006 255)", borderRadius: 8 }}>
                  {hints.map((h) => (
                    <button
                      key={h.tag}
                      type="button"
                      onClick={() => {
                        setEquipTag(h.tag);
                        setBuscaEquip(`${h.nome} (${h.tag})`);
                        setHints([]);
                      }}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: "8px 10px",
                        background: "white",
                        border: 0,
                        borderBottom: "1px solid oklch(0.95 0.004 255)",
                        cursor: "pointer",
                      }}
                    >
                      <strong>{h.nome}</strong> · {h.tag}
                      {h.patrimonio ? ` · pat. ${h.patrimonio}` : ""}
                      {h.nSerie ? ` · s/n ${h.nSerie}` : ""}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <FieldLabel>Setor (se o aparelho ainda não estiver claro)</FieldLabel>
              <select value={setorId} onChange={(e) => setSetorId(e.target.value)} style={fieldStyle}>
                <option value="">Manter setor atual</option>
                {setores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>Prioridade técnica</FieldLabel>
              <select
                value={prioridadeTecnica}
                onChange={(e) => setPrioridadeTecnica(e.target.value)}
                style={fieldStyle}
              >
                <option value="BAIXA">Baixa</option>
                <option value="MEDIA">Média</option>
                <option value="ALTA">Alta</option>
                <option value="URGENTE">Urgente</option>
              </select>
            </div>
            <Btn
              disabled={
                busy ||
                (!equipTag.trim() && !setorId && (!prioridadeTecnica || prioridadeTecnica === os.prioridade))
              }
              onClick={() =>
                void run(async () => {
                  await api(`/os/${numero}/triagem`, {
                    method: "PATCH",
                    body: JSON.stringify({
                      equipamentoTag: equipTag.trim() || undefined,
                      setorId: setorId || undefined,
                      prioridade:
                        prioridadeTecnica && prioridadeTecnica !== os.prioridade
                          ? prioridadeTecnica
                          : undefined,
                    }),
                  });
                  setMsg("Triagem registrada");
                  setBuscaEquip("");
                })
              }
            >
              {busy ? "Gravando triagem…" : "Salvar triagem"}
            </Btn>
          </div>

          <div>
            <FieldLabel>Responsável principal</FieldLabel>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <select
                value={responsavelId}
                onChange={(e) => setResponsavelId(e.target.value)}
                style={{ ...fieldStyle, flex: 1 }}
              >
                <option value="">Selecione…</option>
                {colaboradores.map((c) => (
                  <option key={c.id} value={c.id}>
                    {labelResponsavel(c)}
                    {c.sobrecarga ? " (sobrecarga)" : ""}
                  </option>
                ))}
              </select>
              <Btn
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await api(`/os/${numero}/assumir`, {
                      method: "PATCH",
                      body: JSON.stringify({
                        expectedResponsavelId: os.responsavel?.id ?? null,
                        expectedVersao: os.atribuicaoVersao,
                      }),
                    });
                    setMsg("OS assumida");
                  })
                }
              >
                Assumir
              </Btn>
              <Btn
                disabled={busy || !responsavelId}
                onClick={() =>
                  void run(async () => {
                    await api(`/os/${numero}/atribuir`, {
                      method: "PATCH",
                      body: JSON.stringify({
                        responsavelId,
                        expectedResponsavelId: os.responsavel?.id ?? null,
                        expectedVersao: os.atribuicaoVersao,
                      }),
                    });
                    setMsg(
                      os.responsavel && os.responsavel.id !== responsavelId
                        ? `OS transferida para o segundo profissional`
                        : "Responsável atualizado",
                    );
                  })
                }
              >
                Atribuir / transferir
              </Btn>
            </div>
          </div>

          <div>
            <FieldLabel>Andamento</FieldLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {(os.status === "ABERTA" || os.status === "NAO_ATRIBUIDA") && (
                <Btn
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await api(`/os/${numero}/status`, { method: "PATCH", body: JSON.stringify({ acao: "iniciar" }) });
                      setMsg("Em atendimento");
                    })
                  }
                >
                  Iniciar atendimento
                </Btn>
              )}
              {os.status === "EM_ANDAMENTO" && (
                <Btn
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await api(`/os/${numero}/status`, { method: "PATCH", body: JSON.stringify({ acao: "pausar" }) });
                      setMsg("OS pausada");
                    })
                  }
                >
                  Pausar
                </Btn>
              )}
              {(os.status === "EM_ANDAMENTO" || os.status === "ABERTA") && (
                <Btn variant="secondary" onClick={() => setStatusModal("aguardar")}>
                  Aguardar
                </Btn>
              )}
              {os.status === "AGUARDANDO" && (
                <Btn
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await api(`/os/${numero}/status`, { method: "PATCH", body: JSON.stringify({ acao: "retomar" }) });
                      setMsg("Atendimento retomado");
                    })
                  }
                >
                  Retomar
                </Btn>
              )}
            </div>
          </div>

          <div>
            <FieldLabel>Condição final do equipamento (não muda só porque a OS fecha)</FieldLabel>
            <select value={condicaoFinal} onChange={(e) => setCondicaoFinal(e.target.value)} style={fieldStyle}>
              <option value="">Selecione a condição…</option>
              <option value="APTO">Apto para uso</option>
              <option value="RESTRITO">Uso restrito</option>
              <option value="PARADO">Parado</option>
            </select>
          </div>
          <div>
            <FieldLabel>Texto claro ao solicitante</FieldLabel>
            <textarea
              value={textoPublico}
              onChange={(e) => setTextoPublico(e.target.value)}
              rows={2}
              style={fieldStyle}
              placeholder="O que o setor precisa saber ao receber a conclusão"
            />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {os.status !== "CONCLUIDA" && os.status !== "CANCELADA" && (
              <Btn
                disabled={busy}
                onClick={() => {
                  if (busy) return;
                  if (!servico.trim() || !resultado.trim() || !condicaoFinal) {
                    setErro("Para concluir, informe serviço realizado, resultado e a condição final do equipamento.");
                    setTab("execucao");
                    return;
                  }
                  setStatusModal("fechar");
                }}
              >
                {busy ? "Aguarde — gravando…" : "Concluir OS"}
              </Btn>
            )}
            {(os.status === "NAO_ATRIBUIDA" ||
              os.status === "ABERTA" ||
              os.status === "EM_ANDAMENTO" ||
              os.status === "AGUARDANDO") && (
              <Btn variant="danger" onClick={() => setStatusModal("cancelar")}>
                Cancelar OS
              </Btn>
            )}
            {(os.status === "CONCLUIDA" || os.status === "CANCELADA") && (
              <Btn variant="ghost" onClick={() => setStatusModal("reabrir")}>
                Efetivar reabertura
              </Btn>
            )}
          </div>
        </div>
      )}

      <ConfirmModal
        open={statusModal === "fechar"}
        title="Concluir ordem de serviço"
        message="Confirma a conclusão? A condição do equipamento será a que você escolheu — a OS concluída não torna o equipamento apto sozinha."
        confirmLabel="Concluir"
        onConfirm={(j) => confirmarStatus(j)}
        onCancel={() => setStatusModal(null)}
      />
      <ConfirmModal
        open={statusModal === "aguardar"}
        title="Colocar em aguardo"
        message="O motivo fica no histórico e o solicitante vê que o atendimento está pausado."
        confirmLabel="Aguardar"
        requireJustification
        onConfirm={(j) => confirmarStatus(j)}
        onCancel={() => setStatusModal(null)}
      />
      <ConfirmModal
        open={statusModal === "cancelar"}
        title="Cancelar ordem de serviço"
        message={`A OS ${os.codigo} será cancelada. Informe a justificativa.`}
        confirmLabel="Cancelar OS"
        danger
        requireJustification
        onConfirm={(j) => confirmarStatus(j)}
        onCancel={() => setStatusModal(null)}
      />
      <ConfirmModal
        open={statusModal === "reabrir"}
        title="Efetivar reabertura"
        message="O pedido do usuário não reabre sozinho. A conclusão anterior fica no histórico."
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
