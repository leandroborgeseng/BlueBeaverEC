"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Err, FieldLabel, fieldStyle } from "@/components/ui/aion-ui";
import { api, downloadApi } from "@/lib/api";
import { filesToAnexos, labelAcaoOS, labelStatusOS } from "@/lib/os-ui";
import { AtendimentoExternoPanel } from "@/components/os/AtendimentoExternoPanel";
import { labelResponsavel, useSession } from "@/lib/session";
import { LABEL_DESTINO_FISICO, SLA_HORAS } from "@aion/shared";
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
  origemMaterial?: string | null;
  naturezaCusto?: string | null;
  estornado?: boolean;
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
  slaHoras?: number;
  slaLimite?: string | null;
  slaEstourado?: boolean;
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
  textoConclusaoPublico?: string | null;
  pedidoReaberturaJustificativa?: string | null;
  atribuicaoVersao?: number;
  abertura?: string;
  fechamento?: string | null;
  createdBy?: { nome?: string } | null;
  equipamento?: { tag: string; nome: string; condicaoUso?: string; setor?: { nome: string } } | null;
  setor?: { nome: string } | null;
  responsavel?: { id: string; nome: string } | null;
  itens?: OsItem[];
  timeline?: TimelineItem[];
  anexos?: Array<{ id: string; nomeArquivo: string; visibilidade: string }>;
  solicitacao?: { protocolo?: string | null; solicitanteNome?: string | null } | null;
}

type StatusAcao = "fechar" | "cancelar" | "reabrir" | "aguardar";
type ItemAba =
  | "ocorrencia"
  | "mao"
  | "material"
  | "pendencia"
  | "externo-item"
  | "procedimento"
  | "foto"
  | "assinatura"
  | "anexos"
  | "auditoria"
  | null;

const TIPOS_COM_LAUDO = new Set(["PREVENTIVA", "CALIBRACAO", "TSE", "QUALIFICACAO"]);
const ORANGE = "#f58220";

const ORANGE_BTNS: Array<{ id: Exclude<ItemAba, null>; label: string }> = [
  { id: "ocorrencia", label: "Ocorrência/Serviço" },
  { id: "mao", label: "Mão de Obra" },
  { id: "material", label: "Material" },
  { id: "pendencia", label: "Pendência" },
  { id: "externo-item", label: "Serviço Externo" },
  { id: "procedimento", label: "Procedimento" },
  { id: "foto", label: "Foto" },
  { id: "assinatura", label: "Assinatura" },
  { id: "anexos", label: "Anexos" },
];

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
  const verValores = Boolean(useSession()?.permissoes?.verValoresFinanceiros);
  const [os, setOs] = useState<OsDetail | null>(null);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [dadosAberto, setDadosAberto] = useState(true);
  const [itensAberto, setItensAberto] = useState(true);
  const [itemAba, setItemAba] = useState<ItemAba>(null);
  const [alocacao, setAlocacao] = useState<"INTERNA" | "EXTERNA">("INTERNA");
  const [oficina, setOficina] = useState("");
  const [pendencia, setPendencia] = useState("");
  const [diagnostico, setDiagnostico] = useState("");
  const [servico, setServico] = useState("");
  const [resultado, setResultado] = useState("");
  const [horas, setHoras] = useState("");
  const [condicaoFinal, setCondicaoFinal] = useState("");
  const [textoPublico, setTextoPublico] = useState("");
  const [itemDesc, setItemDesc] = useState("");
  const [pecasEstoque, setPecasEstoque] = useState<Array<{ codigo: string; descricao: string; disponivel: number }>>([]);
  const [pecaCodigo, setPecaCodigo] = useState("");
  const [pecaQtd, setPecaQtd] = useState("1");
  const [servicoExt, setServicoExt] = useState("");
  const [servicoExtValor, setServicoExtValor] = useState("");
  const [destinoFisico, setDestinoFisico] = useState("");
  const [comentario, setComentario] = useState("");
  const [visComentario, setVisComentario] = useState<"PUBLICO" | "INTERNO">("PUBLICO");
  const [responsavelId, setResponsavelId] = useState("");
  const [prioridadeTecnica, setPrioridadeTecnica] = useState("");
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
    setOficina(data.oficina ?? "");
  }, [numero]);

  useEffect(() => {
    void load().catch((e) => setErro(e instanceof Error ? e.message : "Erro"));
    api<Colaborador[]>("/os/responsaveis")
      .then(setColaboradores)
      .catch(() => undefined);
    api<{ items: Array<{ codigo: string; descricao: string; disponivel: number }> }>("/estoque/itens?pageSize=100")
      .then((r) => setPecasEstoque(r.items ?? []))
      .catch(() => undefined);
  }, [load]);

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

  async function salvar(fecharJanela = false) {
    await run(async () => {
      await api(`/os/${numero}/execucao`, {
        method: "PATCH",
        body: JSON.stringify({
          diagnostico,
          servicoRealizado: servico,
          resultadoAtendimento: resultado,
          pendencia: pendencia || null,
          oficina: oficina || null,
        }),
      });
      if (prioridadeTecnica && prioridadeTecnica !== os?.prioridade) {
        await api(`/os/${numero}/triagem`, {
          method: "PATCH",
          body: JSON.stringify({ prioridade: prioridadeTecnica }),
        });
      }
      if (responsavelId && responsavelId !== os?.responsavel?.id) {
        await api(`/os/${numero}/atribuir`, {
          method: "PATCH",
          body: JSON.stringify({
            responsavelId,
            expectedResponsavelId: os?.responsavel?.id ?? null,
            expectedVersao: os?.atribuicaoVersao,
          }),
        });
      }
      setMsg("OS salva");
      if (fecharJanela) onDone();
    });
  }

  async function confirmarStatus(justificativa?: string) {
    if (!statusModal || busy) return;
    const acao = statusModal;
    if (acao === "fechar") {
      if (!servico.trim() || !resultado.trim() || !condicaoFinal) {
        setErro("Para concluir, informe serviço realizado, resultado e a condição final do equipamento.");
        setStatusModal(null);
        setItemAba("ocorrencia");
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
            : {
                acao,
                justificativa,
                destinoFisico: acao === "cancelar" || acao === "reabrir" ? destinoFisico || undefined : undefined,
              },
        ),
      });
      setStatusModal(null);
      setErro(null);
      if (acao === "fechar" || acao === "cancelar") onDone();
      else {
        setMsg(acao === "reabrir" ? "OS reaberta." : `OS ${acao}`);
        await load();
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
      setStatusModal(null);
    } finally {
      setBusy(false);
    }
  }

  const totais = useMemo(() => {
    const itens = os?.itens ?? [];
    const soma = (tipo: string) =>
      itens
        .filter((i) => i.tipo === tipo && !i.estornado)
        .reduce((acc, i) => acc + Number(i.quantidade || 0) * Number(i.valorUnitario || 0), 0);
    const mao = soma("MAO_DE_OBRA");
    const mat = soma("MATERIAL");
    const ext = soma("SERVICO_EXTERNO");
    return { mao, mat, ext, total: mao + mat + ext };
  }, [os]);

  if (erro && !os) return <div style={{ padding: 16 }}><Err>{erro}</Err></div>;
  if (!os) return <div style={{ padding: 16, color: "#777" }}>Carregando OS…</div>;

  const tag = os.equipamento?.tag ?? "";
  const aberturaLog = (os.timeline ?? []).find((t) => t.acao === "ABERTURA");
  const abertaPor = aberturaLog?.autor ?? os.solicitacao?.solicitanteNome ?? "—";
  const slaHoras = os.slaHoras ?? SLA_HORAS[(os.prioridade as keyof typeof SLA_HORAS) ?? "MEDIA"] ?? 24;
  const prioLabel = `${labelPrio(os.prioridade)} (MÁX. ${slaHoras} HS)`;
  const encerrada = os.status === "CONCLUIDA" || os.status === "CANCELADA";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", flex: 1, minHeight: 0, background: "white", color: "#333", position: "relative" }}>
      <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
        {erro && (
          <div style={{ padding: "8px 14px" }}>
            <Err>{erro}</Err>
          </div>
        )}
        {msg && (
          <div style={{ padding: "8px 14px", fontSize: 12, fontWeight: 600, color: "#2f7d4a" }}>{msg}</div>
        )}
        {os.pedidoReaberturaJustificativa && (
          <div style={{ margin: "8px 14px", padding: 8, background: "#fff6e5", fontSize: 12, borderRadius: 4 }}>
            Pedido de reabertura: {os.pedidoReaberturaJustificativa}
          </div>
        )}

        <Section title="Dados da OS" open={dadosAberto} onToggle={() => setDadosAberto((v) => !v)}>
          <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1.3fr 1fr 1.2fr 1.2fr", gap: "8px 12px" }}>
            <FichaField label="Número da OS">
              <input readOnly value={os.codigo || codigo} style={inp} />
            </FichaField>
            <FichaField label="Situação">
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {(os.status === "ABERTA" || os.status === "NAO_ATRIBUIDA") && (
                  <button
                    type="button"
                    title="Iniciar atendimento"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await api(`/os/${numero}/status`, { method: "PATCH", body: JSON.stringify({ acao: "iniciar" }) });
                        setMsg("Em atendimento");
                      })
                    }
                    style={iconBtn}
                  >
                    ▶
                  </button>
                )}
                <input readOnly value={labelStatusOS(os.status).toUpperCase()} style={{ ...inp, flex: 1 }} />
              </div>
            </FichaField>
            <FichaField label="OS Pai">
              <input readOnly value="" placeholder="" style={inp} />
            </FichaField>
            <FichaField label="Alocação">
              <div style={{ display: "flex", gap: 14, alignItems: "center", height: 28, fontSize: 12 }}>
                <label style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <input type="radio" checked={alocacao === "INTERNA"} onChange={() => setAlocacao("INTERNA")} />
                  Interna
                </label>
                <label style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <input type="radio" checked={alocacao === "EXTERNA"} onChange={() => setAlocacao("EXTERNA")} />
                  Externa
                </label>
              </div>
            </FichaField>
            <FichaField label="Aberta por">
              <input readOnly value={abertaPor} style={inp} />
            </FichaField>

            <FichaField label="Abertura">
              <input readOnly value={fmtDt(os.abertura)} style={inp} />
            </FichaField>
            <FichaField label="Encerramento">
              <input readOnly value={fmtDt(os.fechamento)} style={inp} />
            </FichaField>
            <FichaField label="Data Parada">
              <input readOnly value={os.equipamentoParado ? fmtDt(os.abertura, true) : ""} style={inp} />
            </FichaField>
            <FichaField label="Hora Parada">
              <input readOnly value={os.equipamentoParado ? fmtHora(os.abertura) : ""} style={inp} />
            </FichaField>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <FichaField label="Data Funcionamento">
                <input readOnly value={os.fechamento && !os.equipamentoParado ? fmtDt(os.fechamento, true) : ""} style={inp} />
              </FichaField>
              <FichaField label="Hora Funcionamento">
                <input readOnly value={os.fechamento && !os.equipamentoParado ? fmtHora(os.fechamento) : ""} style={inp} />
              </FichaField>
            </div>
          </div>

          <FichaField label="Setor" style={{ marginTop: 8 }}>
            <input readOnly value={os.equipamento?.setor?.nome ?? os.setor?.nome ?? "—"} style={inp} />
          </FichaField>

          <FichaField label="Projeto" style={{ marginTop: 8 }}>
            <select disabled style={inp}>
              <option>Selecione …</option>
            </select>
          </FichaField>

          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.4fr 1.2fr", gap: 12, marginTop: 8 }}>
            <FichaField label="Oficina *" required>
              <input value={oficina} onChange={(e) => setOficina(e.target.value)} placeholder="Oficina" style={inp} />
            </FichaField>
            <FichaField label="Tipo *" required>
              <input readOnly value={os.tipo?.replace(/_/g, " ") ?? "—"} style={inp} />
            </FichaField>
            <FichaField label="Prioridade *" required>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={prioDot(os.prioridade)} />
                <select value={prioridadeTecnica} onChange={(e) => setPrioridadeTecnica(e.target.value)} style={{ ...inp, flex: 1 }}>
                  <option value="BAIXA">BAIXA (MÁX. {SLA_HORAS.BAIXA} HS)</option>
                  <option value="MEDIA">MÉDIA (MÁX. {SLA_HORAS.MEDIA} HS)</option>
                  <option value="ALTA">ALTA (MÁX. {SLA_HORAS.ALTA} HS)</option>
                  <option value="URGENTE">URGENTE (MÁX. {SLA_HORAS.URGENTE} HS)</option>
                </select>
              </div>
            </FichaField>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 0.8fr 1.2fr", gap: 12, marginTop: 8 }}>
            <FichaField label="Responsável *" required>
              <select value={responsavelId} onChange={(e) => setResponsavelId(e.target.value)} style={inp}>
                <option value="">Selecione …</option>
                {colaboradores.map((c) => (
                  <option key={c.id} value={c.id}>
                    {labelResponsavel(c)}
                    {c.sobrecarga ? " (sobrecarga)" : ""}
                  </option>
                ))}
              </select>
            </FichaField>
            <FichaField label="Complexidade">
              <select disabled style={inp}>
                <option>Selecione …</option>
              </select>
            </FichaField>
            <FichaField label="Requisição">
              <input readOnly value={os.solicitacao?.protocolo ?? ""} style={inp} />
            </FichaField>
            <FichaField label="Requisitante">
              <input readOnly value={os.solicitacao?.solicitanteNome ?? ""} style={inp} />
            </FichaField>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 }}>
            <FichaField label="Observações">
              <textarea value={diagnostico} onChange={(e) => setDiagnostico(e.target.value)} rows={4} style={area} />
            </FichaField>
            <FichaField label="Observação da Requisição">
              <textarea readOnly value={os.observacaoRequisicao ?? ""} rows={4} style={{ ...area, background: "#fafafa" }} />
            </FichaField>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginTop: 8 }}>
            <FichaField label="Mão de Obra">
              <input readOnly value={brl(totais.mao, verValores)} style={inp} />
            </FichaField>
            <FichaField label="Materiais">
              <input readOnly value={brl(totais.mat, verValores)} style={inp} />
            </FichaField>
            <FichaField label="Serviço Externo">
              <input readOnly value={brl(totais.ext, verValores)} style={inp} />
            </FichaField>
            <FichaField label="Total">
              <input readOnly value={brl(totais.total, verValores)} style={inp} />
            </FichaField>
          </div>
          <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
            Equipamento: {os.equipamento ? `${os.equipamento.nome} (${os.equipamento.tag})` : "Chamado do setor (sem TAG)"}
            {prioLabel ? ` · SLA ${prioLabel}` : ""}
          </div>
        </Section>

        {alocacao === "EXTERNA" && (
          <div style={{ padding: "8px 14px 0" }}>
            <AtendimentoExternoPanel numero={numero} />
          </div>
        )}

        <Section title="Itens da OS" open={itensAberto} onToggle={() => setItensAberto((v) => !v)}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", marginBottom: 10 }}>
            {ORANGE_BTNS.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setItemAba((cur) => (cur === b.id ? null : b.id))}
                style={orangeBtn(itemAba === b.id)}
              >
                {b.label}
              </button>
            ))}
          </div>

          {itemAba && (
            <div style={{ marginBottom: 12, padding: 10, border: "1px solid #eee", borderRadius: 4, background: "#fcfcfc" }}>
              {itemAba === "ocorrencia" && (
                <Grid2>
                  <FichaField label="Serviço realizado">
                    <textarea value={servico} onChange={(e) => setServico(e.target.value)} rows={3} style={area} />
                  </FichaField>
                  <FichaField label="Resultado / condição final">
                    <textarea value={resultado} onChange={(e) => setResultado(e.target.value)} rows={2} style={area} />
                    <select value={condicaoFinal} onChange={(e) => setCondicaoFinal(e.target.value)} style={{ ...inp, marginTop: 6 }}>
                      <option value="">Condição final…</option>
                      <option value="APTO">Apto para uso</option>
                      <option value="RESTRITO">Uso restrito</option>
                      <option value="PARADO">Parado</option>
                    </select>
                    <textarea
                      value={textoPublico}
                      onChange={(e) => setTextoPublico(e.target.value)}
                      rows={2}
                      style={{ ...area, marginTop: 6 }}
                      placeholder="Texto ao solicitante"
                    />
                  </FichaField>
                </Grid2>
              )}
              {itemAba === "mao" && (
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={horas} onChange={(e) => setHoras(e.target.value)} type="number" min="0.1" step="0.1" placeholder="Horas" style={{ ...inp, width: 120 }} />
                  <button
                    type="button"
                    style={orangeBtn(true)}
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
                        setMsg("Mão de obra lançada");
                      })
                    }
                  >
                    Lançar
                  </button>
                </div>
              )}
              {itemAba === "material" && (
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <select value={pecaCodigo} onChange={(e) => setPecaCodigo(e.target.value)} style={{ ...inp, flex: 2 }}>
                      <option value="">Peça do estoque…</option>
                      {pecasEstoque.map((p) => (
                        <option key={p.codigo} value={p.codigo}>
                          {p.codigo} — {p.descricao} (disp. {p.disponivel})
                        </option>
                      ))}
                    </select>
                    <input value={pecaQtd} onChange={(e) => setPecaQtd(e.target.value)} type="number" min="0.01" step="0.01" style={{ ...inp, width: 80 }} />
                    <button
                      type="button"
                      style={orangeBtn(true)}
                      disabled={busy || !pecaCodigo}
                      onClick={() =>
                        void run(async () => {
                          await api(`/os/${numero}/execucao`, {
                            method: "PATCH",
                            body: JSON.stringify({
                              itens: [
                                {
                                  tipo: "MATERIAL",
                                  descricao: pecaCodigo,
                                  itemCodigo: pecaCodigo,
                                  quantidade: Number(pecaQtd || 1),
                                  origemMaterial: "ESTOQUE",
                                },
                              ],
                            }),
                          });
                          setPecaCodigo("");
                          setMsg("Material baixado");
                        })
                      }
                    >
                      Baixar
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input value={itemDesc} onChange={(e) => setItemDesc(e.target.value)} placeholder="Material comprado direto" style={{ ...inp, flex: 1 }} />
                    <button
                      type="button"
                      style={orangeBtn(true)}
                      disabled={busy || !itemDesc.trim()}
                      onClick={() =>
                        void run(async () => {
                          await api(`/os/${numero}/execucao`, {
                            method: "PATCH",
                            body: JSON.stringify({
                              itens: [{ descricao: itemDesc, tipo: "MATERIAL", origemMaterial: "COMPRA_DIRETA" }],
                            }),
                          });
                          setItemDesc("");
                          setMsg("Material registrado");
                        })
                      }
                    >
                      Incluir
                    </button>
                  </div>
                </div>
              )}
              {itemAba === "pendencia" && (
                <textarea value={pendencia} onChange={(e) => setPendencia(e.target.value)} rows={3} style={area} placeholder="Pendência da OS" />
              )}
              {itemAba === "externo-item" && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input value={servicoExt} onChange={(e) => setServicoExt(e.target.value)} placeholder="Descrição do serviço" style={{ ...inp, flex: 1 }} />
                  {verValores && (
                    <input value={servicoExtValor} onChange={(e) => setServicoExtValor(e.target.value)} type="number" min="0" step="0.01" placeholder="R$" style={{ ...inp, width: 110 }} />
                  )}
                  <button
                    type="button"
                    style={orangeBtn(true)}
                    disabled={busy || !servicoExt.trim()}
                    onClick={() =>
                      void run(async () => {
                        await api(`/os/${numero}/execucao`, {
                          method: "PATCH",
                          body: JSON.stringify({
                            itens: [
                              {
                                tipo: "SERVICO_EXTERNO",
                                descricao: servicoExt,
                                quantidade: 1,
                                valorUnitario: verValores ? Number(servicoExtValor || 0) || undefined : undefined,
                              },
                            ],
                          }),
                        });
                        setServicoExt("");
                        setServicoExtValor("");
                        setMsg("Serviço externo lançado");
                      })
                    }
                  >
                    Lançar
                  </button>
                </div>
              )}
              {itemAba === "procedimento" && (
                <div>
                  {os.tipo && TIPOS_COM_LAUDO.has(os.tipo) ? (
                    <button
                      type="button"
                      style={orangeBtn(true)}
                      onClick={() =>
                        open({
                          kind: "laudo",
                          title: `Laudo · OS ${os.numero}`,
                          payload: { tipo: os.tipo, equipamentoTag: tag, osNumero: os.numero },
                        })
                      }
                    >
                      Registrar laudo / procedimento
                    </button>
                  ) : (
                    <div style={{ fontSize: 12, color: "#777" }}>
                      Este tipo de OS não exige laudo. Você detalha o botão Procedimento no próximo passo.
                    </div>
                  )}
                </div>
              )}
              {(itemAba === "foto" || itemAba === "anexos") && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, cursor: "pointer", color: ORANGE }}>
                    Enviar {itemAba === "foto" ? "foto" : "anexo"}
                    <input
                      type="file"
                      accept={itemAba === "foto" ? "image/*" : "image/*,application/pdf"}
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
                          setMsg("Arquivo enviado");
                        })
                      }
                    />
                  </label>
                  <div style={{ marginTop: 8, display: "grid", gap: 4 }}>
                    {(os.anexos ?? []).map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        style={{ ...ghostBtn, textAlign: "left" }}
                        onClick={() => void downloadApi(`/os/${numero}/anexos/${a.id}`, undefined, a.nomeArquivo)}
                      >
                        {a.nomeArquivo}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {itemAba === "assinatura" && (
                <div style={{ fontSize: 12, color: "#777" }}>
                  Assinatura de campo já existe no mobile. O conteúdo deste botão na ficha você detalha no próximo passo.
                </div>
              )}
            </div>
          )}

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e5e5e5", color: "#666", textAlign: "left" }}>
                <th style={th}> </th>
                <th style={th}>Data</th>
                <th style={th}>Descrição</th>
                <th style={th}>Observação</th>
                <th style={{ ...th, textAlign: "right" }}>Quantidade</th>
                <th style={{ ...th, textAlign: "right" }}>Valor</th>
                <th style={{ ...th, textAlign: "right" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {(os.timeline ?? [])
                .filter((t) => t.acao === "ABERTURA")
                .map((t) => (
                  <tr key={t.id} style={{ background: "#f4f4f4" }}>
                    <td style={td} />
                    <td style={td}>{fmtDt(t.createdAt)}</td>
                    <td style={td}>ABERTURA DE CHAMADO</td>
                    <td style={td}>{t.texto ?? ""}</td>
                    <td style={td} />
                    <td style={td} />
                    <td style={{ ...td, textAlign: "right" }}>{verValores ? "0,00" : "—"}</td>
                  </tr>
                ))}
              {(os.itens ?? []).map((item) => (
                <tr key={item.id}>
                  <td style={td} />
                  <td style={td} />
                  <td style={td}>{item.descricao}</td>
                  <td style={td}>
                    {item.origemMaterial === "ESTOQUE"
                      ? "estoque"
                      : item.origemMaterial === "COMPRA_DIRETA"
                        ? "compra direta"
                        : item.tipo.replace(/_/g, " ")}
                    {item.estornado ? " · estornado" : ""}
                  </td>
                  <td style={{ ...td, textAlign: "right" }}>{item.quantidade}</td>
                  <td style={{ ...td, textAlign: "right" }}>{brl(Number(item.valorUnitario || 0), verValores)}</td>
                  <td style={{ ...td, textAlign: "right" }}>
                    {brl(Number(item.quantidade || 0) * Number(item.valorUnitario || 0), verValores)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderTop: "1px solid #e8e8e8",
          background: "#fafafa",
          flexWrap: "wrap",
        }}
      >
        <button type="button" style={roundNav} title="Anterior" disabled>
          ‹
        </button>
        <button type="button" style={roundNav} title="Próxima" disabled>
          ›
        </button>
        <button type="button" style={ghostBtn} onClick={() => setItemAba("auditoria")}>
          Auditoria
        </button>
        <button
          type="button"
          style={ghostBtn}
          onClick={() => {
            setMsg("Etiqueta: você detalha este botão no próximo passo.");
          }}
        >
          Etiqueta
        </button>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button type="button" style={ghostBtn} onClick={() => window.print()}>
            Imprimir
          </button>
          {!encerrada && (
            <button
              type="button"
              style={ghostBtn}
              disabled={busy}
              onClick={() => {
                if (!servico.trim() || !resultado.trim() || !condicaoFinal) {
                  setErro("Para concluir, informe serviço realizado, resultado e a condição final (botão Ocorrência/Serviço).");
                  setItemAba("ocorrencia");
                  return;
                }
                setStatusModal("fechar");
              }}
            >
              Fechar OS
            </button>
          )}
          {!encerrada && (
            <button type="button" style={ghostBtn} onClick={() => setStatusModal("cancelar")}>
              Cancelar OS
            </button>
          )}
          {encerrada && (
            <button type="button" style={ghostBtn} onClick={() => setStatusModal("reabrir")}>
              Reabrir
            </button>
          )}
          <button type="button" style={ghostBtn} onClick={onDone}>
            Cancelar
          </button>
          <button type="button" style={ghostBtn} disabled={busy} onClick={() => void salvar(true)}>
            Salvar e Fechar
          </button>
          <button type="button" style={solidOrange} disabled={busy} onClick={() => void salvar(false)}>
            {busy ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>

      {itemAba === "auditoria" && (
        <div
          style={{
            position: "absolute",
            inset: 40,
            background: "white",
            zIndex: 2,
            overflow: "auto",
            border: "1px solid #eee",
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            padding: 16,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <strong>Auditoria</strong>
            <button type="button" style={ghostBtn} onClick={() => setItemAba(null)}>
              Fechar
            </button>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {(os.timeline ?? []).map((t) => (
              <div key={t.id} style={{ padding: 8, border: "1px solid #eee", borderRadius: 4, fontSize: 12 }}>
                <strong>{labelAcaoOS(t.acao)}</strong>
                <span style={{ float: "right", color: "#888" }}>{fmtDt(t.createdAt)}</span>
                {t.texto && <div style={{ marginTop: 4 }}>{t.texto}</div>}
                {t.autor && <div style={{ color: "#888", marginTop: 2 }}>{t.autor}</div>}
              </div>
            ))}
            <textarea
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              rows={3}
              style={area}
              placeholder="Mensagem ou nota interna"
            />
            <div style={{ display: "flex", gap: 8 }}>
              <select value={visComentario} onChange={(e) => setVisComentario(e.target.value as "PUBLICO" | "INTERNO")} style={inp}>
                <option value="PUBLICO">Público</option>
                <option value="INTERNO">Interno</option>
              </select>
              <button
                type="button"
                style={orangeBtn(true)}
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
              </button>
            </div>
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
        message={`A OS ${os.codigo} será cancelada. Material baixado NÃO volta sozinho — confirme o destino físico.`}
        confirmLabel="Cancelar OS"
        danger
        requireJustification
        onConfirm={(j) => confirmarStatus(j)}
        onCancel={() => setStatusModal(null)}
      >
        <div style={{ marginBottom: 14 }}>
          <FieldLabel>Destino físico do material</FieldLabel>
          <select value={destinoFisico} onChange={(e) => setDestinoFisico(e.target.value)} style={fieldStyle}>
            <option value="">Selecione se houve baixa</option>
            {(Object.keys(LABEL_DESTINO_FISICO) as Array<keyof typeof LABEL_DESTINO_FISICO>).map((k) => (
              <option key={k} value={k}>
                {LABEL_DESTINO_FISICO[k]}
              </option>
            ))}
          </select>
        </div>
      </ConfirmModal>
      <ConfirmModal
        open={statusModal === "reabrir"}
        title="Efetivar reabertura"
        message="Reabrir não devolve material automaticamente. Confirme o destino físico se houve baixa."
        confirmLabel="Reabrir"
        requireJustification
        onConfirm={(j) => confirmarStatus(j)}
        onCancel={() => setStatusModal(null)}
      >
        <div style={{ marginBottom: 14 }}>
          <FieldLabel>Destino físico do material</FieldLabel>
          <select value={destinoFisico} onChange={(e) => setDestinoFisico(e.target.value)} style={fieldStyle}>
            <option value="">Selecione se houve baixa</option>
            {(Object.keys(LABEL_DESTINO_FISICO) as Array<keyof typeof LABEL_DESTINO_FISICO>).map((k) => (
              <option key={k} value={k}>
                {LABEL_DESTINO_FISICO[k]}
              </option>
            ))}
          </select>
        </div>
      </ConfirmModal>
    </div>
  );
}

function Section({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div style={{ borderBottom: "1px solid #eee" }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 14px",
          background: "#f7f7f7",
          border: 0,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span style={{ color: ORANGE, fontSize: 12 }}>{open ? "▼" : "▶"}</span>
        <strong style={{ fontSize: 13 }}>{title}</strong>
      </button>
      {open && <div style={{ padding: "12px 14px 16px" }}>{children}</div>}
    </div>
  );
}

function FichaField({
  label,
  required,
  children,
  style,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div style={style}>
      <div style={{ fontSize: 11, color: "#666", marginBottom: 3 }}>
        {label}
        {required ? <span style={{ color: "#c0392b" }}> *</span> : null}
      </div>
      {children}
    </div>
  );
}

function Grid2({ children }: { children: ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>{children}</div>;
}

function labelPrio(p?: string) {
  if (p === "URGENTE") return "URGENTE";
  if (p === "ALTA") return "ALTA";
  if (p === "BAIXA") return "BAIXA";
  return "MÉDIA";
}

function prioDot(p?: string): CSSProperties {
  const bg = p === "URGENTE" || p === "ALTA" ? "#e74c3c" : p === "BAIXA" ? "#ccc" : "#f4d03f";
  return { width: 12, height: 12, borderRadius: "50%", background: bg, flexShrink: 0 };
}

function fmtDt(v?: string | null, soData = false) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return soData ? d.toLocaleDateString("pt-BR") : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function fmtHora(v?: string | null) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function brl(n: number, ver: boolean) {
  if (!ver) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const inp: CSSProperties = {
  height: 28,
  width: "100%",
  border: "1px solid #ddd",
  borderRadius: 3,
  padding: "0 8px",
  fontSize: 12,
  background: "white",
  boxSizing: "border-box",
};

const area: CSSProperties = {
  ...inp,
  height: "auto",
  padding: 8,
  resize: "vertical",
  fontFamily: "inherit",
};

const th: CSSProperties = { padding: "6px 8px", fontWeight: 600 };
const td: CSSProperties = { padding: "6px 8px", borderBottom: "1px solid #f0f0f0" };

function orangeBtn(active: boolean): CSSProperties {
  return {
    background: ORANGE,
    color: "white",
    border: `1px solid ${active ? "#d56e12" : ORANGE}`,
    borderRadius: 3,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: active ? "inset 0 0 0 1px #fff6" : undefined,
  };
}

const ghostBtn: CSSProperties = {
  background: "white",
  border: "1px solid #ddd",
  borderRadius: 3,
  padding: "6px 10px",
  fontSize: 12,
  cursor: "pointer",
};

const solidOrange: CSSProperties = {
  ...orangeBtn(true),
  padding: "6px 16px",
};

const roundNav: CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: "50%",
  border: "1px solid #ddd",
  background: "white",
  cursor: "pointer",
};

const iconBtn: CSSProperties = {
  width: 28,
  height: 28,
  border: "1px solid #ddd",
  background: "white",
  cursor: "pointer",
  borderRadius: 3,
  fontSize: 10,
};
