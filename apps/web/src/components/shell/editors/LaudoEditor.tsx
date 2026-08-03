"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Badge, Btn, Err, FieldLabel, fieldStyle } from "@/components/ui/aion-ui";
import { api } from "@/lib/api";
import { useWindowStore } from "@/store/windows";

interface Proc {
  id: string;
  nome: string;
  tipo: string;
  itens: Array<{
    id?: string;
    pergunta?: string;
    secao?: string;
    tipo?: string;
    valorPadrao?: number;
    limite?: number;
    unidade?: string;
    repeticoes?: number;
    tolerancia?: {
      valor?: number | null;
      modo?: string | null;
      unidade?: string | null;
      texto?: string | null;
      parametro?: string;
    };
    campos?: string[];
  }>;
}

interface Colaborador {
  id: string;
  nome: string;
  registroProfissional?: string | null;
}

interface Inst {
  id: string;
  nome: string;
  nSerie: string;
  selecionavel: boolean;
}

interface RespostaItem {
  id?: string;
  pergunta?: string;
  secao?: string;
  tipo?: string;
  status?: string;
  valorMedido?: number;
  valorConfigurado?: number;
  leituras?: Array<number | undefined>;
  media?: number;
  mediaCorrigida?: number;
  erroAbs?: number;
  erroPct?: number;
  limite?: number;
  unidade?: string;
  toleranciaTexto?: string;
  observacao?: string;
  correcaoPadrao?: number;
  incertezaExpandida?: number;
  fatorK?: number;
  pontoCertificadoRef?: string;
}

type PontoCert = {
  id?: string;
  valorNominal?: number | null;
  valorConvencional?: number | null;
  correcao?: number | null;
  incertezaExpandida?: number | null;
  fatorK?: number | null;
  unidade?: string | null;
};

function pontoMaisProximo(padrao: number, pontos: PontoCert[]): PontoCert | null {
  if (!pontos.length) return null;
  let best: PontoCert | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const p of pontos) {
    const ref = p.valorNominal ?? p.valorConvencional;
    if (ref == null || Number.isNaN(Number(ref))) continue;
    const d = Math.abs(Number(ref) - padrao);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
}

interface LaudoDetail {
  id: string;
  numero: string;
  tipo: string;
  resultado: string;
  dataExecucao?: string;
  respostas?: RespostaItem[];
  metadados?: Record<string, unknown>;
  justificativaRessalva?: string | null;
  equipamento: { tag: string; nome: string };
  procedimento?: { id: string; nome: string } | null;
  instrumento?: { nome: string; nSerie: string } | null;
  responsavelTecnico?: { nome: string; registroProfissional?: string | null } | null;
  tecnicoNome?: string | null;
}

type Tab = "geral" | "checklist" | "resultado";

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

export function LaudoEditor({
  laudoId,
  tipo: tipoInicial,
  equipamentoTag: tagInicial,
  windowId,
  onDone,
}: {
  laudoId?: string;
  tipo?: string;
  equipamentoTag?: string;
  windowId?: string;
  onDone?: () => void;
}) {
  const updateWindow = useWindowStore((s) => s.update);
  const viewMode = Boolean(laudoId);

  const [tab, setTab] = useState<Tab>("geral");
  const [laudo, setLaudo] = useState<LaudoDetail | null>(null);
  const [tipo, setTipo] = useState(tipoInicial ?? "PREVENTIVA");
  const [equipamentoTag, setEquipamentoTag] = useState(tagInicial ?? "");
  const [procs, setProcs] = useState<Proc[]>([]);
  const [cols, setCols] = useState<Colaborador[]>([]);
  const [insts, setInsts] = useState<Inst[]>([]);
  const [procId, setProcId] = useState("");
  const [respostas, setRespostas] = useState<RespostaItem[]>([]);
  const [responsavelTecnicoId, setResponsavelTecnicoId] = useState("");
  const [instrumentoId, setInstrumentoId] = useState("");
  const [pontosCertificado, setPontosCertificado] = useState<PontoCert[]>([]);
  const [tecnicoNome, setTecnicoNome] = useState("");
  const [criterioAceitacao, setCriterioAceitacao] = useState(2);
  const [norma, setNorma] = useState("EC");
  const [proximaPreventiva, setProximaPreventiva] = useState("");
  const [justificativaRessalva, setJustificativaRessalva] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmOs, setConfirmOs] = useState(false);

  const proc = useMemo(() => procs.find((p) => p.id === procId), [procs, procId]);

  const loadLaudo = useCallback(async () => {
    if (!laudoId) return;
    const data = await api<LaudoDetail>(`/laudos/${laudoId}`);
    setLaudo(data);
    setTipo(data.tipo);
    setEquipamentoTag(data.equipamento.tag);
    setRespostas((data.respostas as RespostaItem[]) ?? []);
    setJustificativaRessalva(data.justificativaRessalva ?? "");
    if (windowId) {
      updateWindow(windowId, { title: `Laudo ${data.numero}` });
    }
  }, [laudoId, windowId, updateWindow]);

  useEffect(() => {
    if (viewMode) {
      void loadLaudo().catch((e) => setErro(e instanceof Error ? e.message : "Erro"));
    }
  }, [viewMode, loadLaudo]);

  useEffect(() => {
    if (viewMode) return;
    void Promise.all([
      api<Proc[]>(`/procedimentos-laudo?tipo=${tipo}`),
      api<Colaborador[]>("/colaboradores"),
      api<Inst[]>("/instrumentos-padroes"),
    ])
      .then(([p, c, i]) => {
        setProcs(p);
        setCols(c);
        setInsts(i.filter((x) => x.selecionavel));
        setProcId(p[0]?.id ?? "");
      })
      .catch((e) => setErro(e instanceof Error ? e.message : "Erro"));
  }, [tipo, viewMode]);

  useEffect(() => {
    if (viewMode || !instrumentoId || tipo !== "CALIBRACAO") {
      setPontosCertificado([]);
      return;
    }
    void api<{
      certificados?: Array<{ vigente?: boolean; pontos?: PontoCert[] }>;
    }>(`/instrumentos-padroes/${instrumentoId}`)
      .then((d) => {
        const vigente = d.certificados?.find((c) => c.vigente) ?? d.certificados?.[0];
        setPontosCertificado(vigente?.pontos ?? []);
      })
      .catch(() => setPontosCertificado([]));
  }, [instrumentoId, tipo, viewMode]);

  useEffect(() => {
    if (viewMode || !proc) {
      if (!viewMode && !proc) setRespostas([]);
      return;
    }
    setRespostas(
      (proc.itens ?? []).map((item) => {
        const isCheck = item.tipo === "check";
        const isCalPt = item.tipo === "calibracao" || (tipo === "CALIBRACAO" && item.valorPadrao != null && !isCheck);
        return {
          id: item.id,
          pergunta: item.pergunta,
          secao: item.secao,
          tipo: item.tipo ?? (isCalPt ? "calibracao" : undefined),
          status:
            isCheck || (tipo !== "CALIBRACAO" && tipo !== "TSE")
              ? "SIM"
              : tipo === "CALIBRACAO" || tipo === "TSE"
                ? "APROVADO"
                : "SIM",
          valorMedido: item.tipo === "medicao" ? undefined : undefined,
          valorConfigurado: isCalPt ? item.valorPadrao : undefined,
          leituras: isCalPt ? [undefined, undefined, undefined] : undefined,
          limite: item.limite ?? item.tolerancia?.valor ?? undefined,
          unidade: item.unidade,
          toleranciaTexto: item.tolerancia?.texto ?? undefined,
          erroPct: 0,
        };
      }),
    );
  }, [proc, tipo, viewMode]);

  const computedRespostas = useMemo(() => {
    return respostas.map((r) => {
      if (tipo === "CALIBRACAO" && r.tipo === "check") {
        return r;
      }

      if (tipo === "CALIBRACAO" && r.tipo === "medicao") {
        return r;
      }

      if (tipo === "CALIBRACAO" && (r.tipo === "calibracao" || r.valorConfigurado != null || (r.leituras && r.leituras.length))) {
        const item = proc?.itens.find((i) => i.id === r.id);
        const padrao = item?.valorPadrao ?? r.valorConfigurado ?? 0;
        const leituras = (r.leituras ?? [])
          .map((v) => (v == null || Number.isNaN(v) ? undefined : Number(v)))
          .filter((v): v is number => v != null);
        const media =
          leituras.length > 0
            ? Number((leituras.reduce((a, b) => a + b, 0) / leituras.length).toFixed(4))
            : r.valorMedido;
        if (media == null) return { ...r, valorConfigurado: padrao };

        const ponto = pontoMaisProximo(padrao, pontosCertificado);
        const correcao = ponto?.correcao != null ? Number(ponto.correcao) : 0;
        const u = ponto?.incertezaExpandida != null ? Number(ponto.incertezaExpandida) : undefined;
        const mediaCorrigida = Number((media + correcao).toFixed(4));
        const erroAbs = Number((mediaCorrigida - padrao).toFixed(4));
        const erroPct =
          padrao === 0 ? 0 : Number((((mediaCorrigida - padrao) / padrao) * 100).toFixed(2));
        const tol = item?.tolerancia;
        const tolValor = tol?.valor ?? r.limite;
        const modo = tol?.modo;
        let aprovado: boolean;
        if (tolValor != null && modo === "absoluto") {
          aprovado = Math.abs(erroAbs) <= tolValor;
        } else if (tolValor != null && modo === "percentual") {
          aprovado = Math.abs(erroPct) <= tolValor;
        } else if (tolValor != null && !modo) {
          aprovado = Math.abs(erroPct) <= tolValor;
        } else {
          aprovado = Math.abs(erroPct) <= criterioAceitacao;
        }

        return {
          ...r,
          valorConfigurado: padrao,
          valorMedido: media,
          media,
          mediaCorrigida,
          correcaoPadrao: correcao || undefined,
          incertezaExpandida: u,
          fatorK: ponto?.fatorK != null ? Number(ponto.fatorK) : undefined,
          pontoCertificadoRef:
            ponto?.valorNominal != null
              ? `nominal=${ponto.valorNominal}`
              : ponto?.valorConvencional != null
                ? `conv=${ponto.valorConvencional}`
                : undefined,
          erroAbs,
          erroPct,
          limite: tolValor ?? criterioAceitacao,
          toleranciaTexto: tol?.texto ?? r.toleranciaTexto,
          status: aprovado ? "APROVADO" : "REPROVADO",
        };
      }

      if (tipo === "TSE" && r.tipo !== "check" && r.valorMedido != null && r.limite != null) {
        return {
          ...r,
          status: r.valorMedido <= r.limite ? "APROVADO" : "REPROVADO",
        };
      }
      return r;
    });
  }, [respostas, tipo, proc, criterioAceitacao, pontosCertificado]);

  const resultadoPreview = useMemo(() => {
    if (tipo === "CALIBRACAO" || tipo === "TSE") {
      const reprovados = computedRespostas.filter(
        (r) => r.status === "REPROVADO" || (r.tipo === "check" && r.status === "NAO"),
      ).length;
      if (reprovados > 0) return "REPROVADO";
      return "APROVADO";
    }
    const nao = computedRespostas.filter((r) => r.status === "NAO").length;
    if (nao > 0) return "REPROVADO";
    return "APROVADO";
  }, [computedRespostas, tipo]);

  async function salvar(e?: FormEvent) {
    e?.preventDefault();
    setMsg(null);
    setErro(null);
    try {
      const laudoCriado = await api<{ id: string; numero: string; resultado: string }>("/laudos", {
        method: "POST",
        body: JSON.stringify({
          tipo,
          equipamentoTag,
          procedimentoId: procId || undefined,
          instrumentoId: instrumentoId || undefined,
          responsavelTecnicoId: responsavelTecnicoId || undefined,
          tecnicoNome: tecnicoNome || undefined,
          respostas: computedRespostas,
          metadados: {
            criterioAceitacao,
            norma,
            proximaPreventiva: proximaPreventiva || undefined,
            metrologia: {
              instrumentoId: instrumentoId || undefined,
              pontosCertificadoUsados: pontosCertificado.length,
            },
          },
          justificativaRessalva: justificativaRessalva || undefined,
        }),
      });
      setMsg(`${laudoCriado.numero} salvo · resultado ${laudoCriado.resultado}`);
      setRespostas(computedRespostas);
      if (windowId) {
        updateWindow(windowId, {
          title: `Laudo ${laudoCriado.numero}`,
          payload: { id: laudoCriado.id },
        });
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro");
    }
  }

  async function gerarOs() {
    const id = laudo?.id ?? laudoId;
    if (!id) return;
    const res = await api<{ os: { codigo: string }; problemas: number }>(
      `/laudos/${id}/gerar-os-corretiva`,
      { method: "POST" },
    );
    setMsg(`OS ${res.os.codigo} criada com ${res.problemas} NC agregadas`);
    setConfirmOs(false);
  }

  if (viewMode && erro && !laudo) return <Err>{erro}</Err>;
  if (viewMode && !laudo) return <div style={{ color: "oklch(0.5 0.02 250)" }}>Carregando laudo…</div>;

  const displayRespostas = viewMode ? (laudo?.respostas as RespostaItem[]) ?? [] : computedRespostas;
  const displayTipo = viewMode ? laudo!.tipo : tipo;
  const displayResultado = viewMode ? laudo!.resultado : resultadoPreview;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid oklch(0.91 0.006 255)", marginBottom: 4 }}>
        {(["geral", "checklist", "resultado"] as Tab[]).map((t) => (
          <button key={t} type="button" style={tabStyle(tab === t)} onClick={() => setTab(t)}>
            {t === "geral" ? "Geral" : t === "checklist" ? "Checklist" : "Resultado"}
          </button>
        ))}
      </div>

      {erro && <Err>{erro}</Err>}
      {msg && <div style={{ fontSize: 13, fontWeight: 600, color: "oklch(0.4 0.14 150)" }}>{msg}</div>}

      {tab === "geral" && (
        <div style={{ display: "grid", gap: 12 }}>
          {viewMode && laudo && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <strong style={{ fontSize: 16 }}>{laudo.numero}</strong>
              <Badge tone={laudo.tipo}>{laudo.tipo}</Badge>
              <Badge tone={laudo.resultado}>{laudo.resultado}</Badge>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <FieldLabel>Tipo</FieldLabel>
              {viewMode ? (
                <div style={{ fontSize: 13 }}>{displayTipo}</div>
              ) : (
                <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={fieldStyle}>
                  <option value="RECEBIMENTO">Recebimento</option>
                  <option value="PREVENTIVA">Preventiva</option>
                  <option value="CALIBRACAO">Calibração</option>
                  <option value="TSE">TSE</option>
                  <option value="QUALIFICACAO">Qualificação</option>
                </select>
              )}
            </div>
            <div>
              <FieldLabel>TAG equipamento</FieldLabel>
              {viewMode ? (
                <div style={{ fontSize: 13 }}>{laudo!.equipamento.tag} — {laudo!.equipamento.nome}</div>
              ) : (
                <input
                  value={equipamentoTag}
                  onChange={(e) => setEquipamentoTag(e.target.value)}
                  placeholder="TAG equipamento"
                  required
                  style={fieldStyle}
                />
              )}
            </div>
          </div>

          {!viewMode && (
            <div>
              <FieldLabel>Procedimento</FieldLabel>
              <select value={procId} onChange={(e) => setProcId(e.target.value)} style={fieldStyle}>
                <option value="">Procedimento</option>
                {procs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>
          )}

          {viewMode && laudo?.procedimento && (
            <div>
              <FieldLabel>Procedimento</FieldLabel>
              <div style={{ fontSize: 13 }}>{laudo.procedimento.nome}</div>
            </div>
          )}

          {(displayTipo === "CALIBRACAO" || displayTipo === "TSE") && (
            <>
              <div>
                <FieldLabel>Responsável técnico (CREA)</FieldLabel>
                {viewMode ? (
                  <div style={{ fontSize: 13 }}>
                    {laudo?.responsavelTecnico?.nome ?? "—"}
                    {laudo?.responsavelTecnico?.registroProfissional
                      ? ` · ${laudo.responsavelTecnico.registroProfissional}`
                      : ""}
                  </div>
                ) : (
                  <select
                    value={responsavelTecnicoId}
                    onChange={(e) => setResponsavelTecnicoId(e.target.value)}
                    required
                    style={fieldStyle}
                  >
                    <option value="">Selecione…</option>
                    {cols.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                        {c.registroProfissional ? ` · ${c.registroProfissional}` : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <FieldLabel>Instrumento padrão</FieldLabel>
                {viewMode ? (
                  <div style={{ fontSize: 13 }}>
                    {laudo?.instrumento ? `${laudo.instrumento.nome} · ${laudo.instrumento.nSerie}` : "—"}
                  </div>
                ) : (
                  <select value={instrumentoId} onChange={(e) => setInstrumentoId(e.target.value)} style={fieldStyle}>
                    <option value="">Instrumento padrão</option>
                    {insts.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.nome} · {i.nSerie}
                      </option>
                    ))}
                  </select>
                )}
                {!viewMode && instrumentoId && pontosCertificado.length === 0 && displayTipo === "CALIBRACAO" && (
                  <div style={{ fontSize: 12, color: "oklch(0.55 0.14 85)", marginTop: 4 }}>
                    Certificado vigente sem pontos U — cadastre os pontos do padrão antes de calibrar.
                  </div>
                )}
                {!viewMode && pontosCertificado.length > 0 && (
                  <div style={{ fontSize: 12, color: "oklch(0.45 0.03 250)", marginTop: 4 }}>
                    {pontosCertificado.length} ponto(s) do certificado aplicados (correção + U).
                  </div>
                )}
              </div>
            </>
          )}

          {(displayTipo === "RECEBIMENTO" || displayTipo === "PREVENTIVA") && (
            <div>
              <FieldLabel>Nome do técnico</FieldLabel>
              {viewMode ? (
                <div style={{ fontSize: 13 }}>{laudo?.tecnicoNome ?? "—"}</div>
              ) : (
                <input
                  value={tecnicoNome}
                  onChange={(e) => setTecnicoNome(e.target.value)}
                  placeholder="Nome do técnico"
                  style={fieldStyle}
                />
              )}
            </div>
          )}

          {!viewMode && displayTipo === "CALIBRACAO" && (
            <div>
              <FieldLabel>Critério padrão (%) — fallback sem tolerância no item</FieldLabel>
              <input
                type="number"
                step="0.1"
                value={criterioAceitacao}
                onChange={(e) => setCriterioAceitacao(Number(e.target.value))}
                style={fieldStyle}
              />
            </div>
          )}

          {!viewMode && displayTipo === "TSE" && (
            <div>
              <FieldLabel>Norma</FieldLabel>
              <select value={norma} onChange={(e) => setNorma(e.target.value)} style={fieldStyle}>
                <option value="FABRICA">Ensaio de Fábrica</option>
                <option value="EC">NBR IEC 60601-1 / EC</option>
              </select>
            </div>
          )}

          {!viewMode && displayTipo === "PREVENTIVA" && (
            <div>
              <FieldLabel>Próxima preventiva</FieldLabel>
              <input
                type="date"
                value={proximaPreventiva}
                onChange={(e) => setProximaPreventiva(e.target.value)}
                style={fieldStyle}
              />
            </div>
          )}

          <div>
            <FieldLabel>Justificativa ressalva</FieldLabel>
            {viewMode ? (
              <div style={{ fontSize: 13 }}>{laudo?.justificativaRessalva ?? "—"}</div>
            ) : (
              <input
                value={justificativaRessalva}
                onChange={(e) => setJustificativaRessalva(e.target.value)}
                placeholder="Justificativa ressalva (se aplicável)"
                style={fieldStyle}
              />
            )}
          </div>

          {!viewMode && (
            <Btn type="button" onClick={() => void salvar()}>
              Salvar laudo
            </Btn>
          )}

          {viewMode && laudo && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Btn variant="secondary" size="sm" onClick={() => setConfirmOs(true)}>
                Gerar OS Corretiva
              </Btn>
              <Btn
                variant="ghost"
                size="sm"
                href={`/equipamentos/${encodeURIComponent(laudo.equipamento.tag)}/ficha-vida`}
              >
                Ficha de vida
              </Btn>
            </div>
          )}
        </div>
      )}

      {tab === "checklist" && (
        <div style={{ display: "grid", gap: 8 }}>
          {displayRespostas.length === 0 ? (
            <div style={{ color: "oklch(0.5 0.02 250)", fontSize: 13 }}>Nenhum item no checklist.</div>
          ) : (
            displayRespostas.map((r, idx) => {
              const prevSecao = idx > 0 ? displayRespostas[idx - 1]?.secao : undefined;
              const showSecao = Boolean(r.secao && r.secao !== prevSecao);
              const isCalibracaoPt =
                r.tipo === "calibracao" ||
                (displayTipo === "CALIBRACAO" &&
                  r.tipo !== "check" &&
                  r.tipo !== "medicao" &&
                  (r.valorConfigurado != null || (r.leituras?.length ?? 0) > 0));
              const isMedicao =
                r.tipo === "medicao" ||
                ((displayTipo === "TSE" || displayTipo === "CALIBRACAO") &&
                  r.tipo !== "check" &&
                  !isCalibracaoPt);
              const isPreventivaCheck =
                displayTipo === "PREVENTIVA" ||
                displayTipo === "RECEBIMENTO" ||
                displayTipo === "QUALIFICACAO" ||
                ((displayTipo === "TSE" || displayTipo === "CALIBRACAO") && r.tipo === "check");

              return (
                <div key={r.id ?? idx} style={{ display: "grid", gap: 6 }}>
                  {showSecao && (
                    <div
                      style={{
                        marginTop: idx === 0 ? 0 : 10,
                        fontSize: 12,
                        fontWeight: 700,
                        letterSpacing: "0.02em",
                        color: "oklch(0.4 0.04 250)",
                        borderBottom: "1px solid oklch(0.92 0.01 250)",
                        paddingBottom: 4,
                      }}
                    >
                      {r.secao}
                    </div>
                  )}
                  {isCalibracaoPt ? (
                    <div style={{ display: "grid", gap: 6 }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "baseline" }}>
                        <span style={{ fontSize: 13, fontWeight: 600, minWidth: 140 }}>
                          {r.pergunta}
                          {r.toleranciaTexto ? (
                            <span style={{ fontWeight: 500, color: "oklch(0.45 0.03 250)", marginLeft: 8 }}>
                              tol {r.toleranciaTexto}
                            </span>
                          ) : null}
                        </span>
                        {viewMode ? (
                          <span style={{ fontSize: 13 }}>
                            L: {(r.leituras ?? []).filter((v) => v != null).join(" / ") || "—"}
                            {" · "}média {r.media ?? r.valorMedido ?? "—"}
                            {r.erroPct != null ? ` · erro ${r.erroPct}%` : ""}
                            {r.erroAbs != null ? ` (Δ ${r.erroAbs})` : ""}
                            {r.incertezaExpandida != null ? ` · U=${r.incertezaExpandida}` : ""}
                            {r.correcaoPadrao != null ? ` · corr=${r.correcaoPadrao}` : ""}
                            {" · "}
                            {r.status}
                          </span>
                        ) : (
                          <>
                            {[0, 1, 2].map((li) => (
                              <input
                                key={li}
                                type="number"
                                step="any"
                                placeholder={`M${li + 1}`}
                                value={r.leituras?.[li] ?? ""}
                                onChange={(e) => {
                                  const v = e.target.value === "" ? undefined : Number(e.target.value);
                                  setRespostas((prev) =>
                                    prev.map((x, i) => {
                                      if (i !== idx) return x;
                                      const leituras = [...(x.leituras ?? [undefined, undefined, undefined])];
                                      while (leituras.length < 3) leituras.push(undefined);
                                      leituras[li] = v;
                                      return { ...x, leituras };
                                    }),
                                  );
                                }}
                                style={{ ...fieldStyle, width: 96 }}
                              />
                            ))}
                            <span style={{ fontSize: 12, color: "oklch(0.45 0.03 250)" }}>
                              méd {r.media ?? "—"}
                              {r.correcaoPadrao != null ? ` · corr ${r.correcaoPadrao}` : ""}
                              {r.mediaCorrigida != null && r.correcaoPadrao
                                ? ` → ${r.mediaCorrigida}`
                                : ""}
                              {r.erroPct != null ? ` · ${r.erroPct}%` : ""}
                              {r.incertezaExpandida != null ? ` · U=${r.incertezaExpandida}` : ""}
                              {r.media != null ? (r.status === "REPROVADO" ? " · NC" : " · OK") : ""}
                            </span>
                          </>
                        )}
                      </div>
                      {!viewMode && (
                        <input
                          placeholder="Obs."
                          value={r.observacao ?? ""}
                          onChange={(e) =>
                            setRespostas((prev) =>
                              prev.map((x, i) => (i === idx ? { ...x, observacao: e.target.value } : x)),
                            )
                          }
                          style={fieldStyle}
                        />
                      )}
                    </div>
                  ) : (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "2fr 1fr 1fr",
                        gap: 8,
                        alignItems: "center",
                      }}
                    >
                      <span style={{ fontSize: 13 }}>{r.pergunta}</span>
                      {viewMode ? (
                        <span style={{ fontSize: 13 }}>
                          {r.tipo === "medicao" || isMedicao
                            ? `${r.valorMedido ?? "—"}`
                            : r.status === "SIM"
                              ? "C"
                              : r.status === "NAO"
                                ? "N.C"
                                : r.status === "NA"
                                  ? "N.A"
                                  : r.status}
                        </span>
                      ) : r.tipo === "medicao" || (isMedicao && r.tipo !== "check") ? (
                        <input
                          type="number"
                          step="any"
                          placeholder="Medido"
                          value={r.valorMedido ?? ""}
                          onChange={(e) => {
                            const v = e.target.value === "" ? undefined : Number(e.target.value);
                            setRespostas((prev) =>
                              prev.map((x, i) => (i === idx ? { ...x, valorMedido: v } : x)),
                            );
                          }}
                          style={fieldStyle}
                        />
                      ) : (
                        <select
                          value={r.status}
                          onChange={(e) =>
                            setRespostas((prev) =>
                              prev.map((x, i) => (i === idx ? { ...x, status: e.target.value } : x)),
                            )
                          }
                          style={fieldStyle}
                        >
                          {isPreventivaCheck ? (
                            <>
                              <option value="SIM">C — Conforme</option>
                              <option value="NAO">N.C — Não conforme</option>
                              <option value="NA">N.A — Não aplicável</option>
                            </>
                          ) : (
                            <>
                              <option value="SIM">Sim</option>
                              <option value="NAO">Não</option>
                              <option value="NA">N/A</option>
                            </>
                          )}
                        </select>
                      )}
                      {viewMode ? (
                        <span style={{ fontSize: 12, color: "oklch(0.5 0.02 250)" }}>{r.observacao ?? "—"}</span>
                      ) : (
                        <input
                          placeholder="Obs."
                          value={r.observacao ?? ""}
                          onChange={(e) =>
                            setRespostas((prev) =>
                              prev.map((x, i) => (i === idx ? { ...x, observacao: e.target.value } : x)),
                            )
                          }
                          style={fieldStyle}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {tab === "resultado" && (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <FieldLabel>Resultado</FieldLabel>
            <Badge tone={displayResultado}>{displayResultado}</Badge>
          </div>
          {viewMode && laudo?.dataExecucao && (
            <div style={{ fontSize: 13, color: "oklch(0.5 0.02 250)" }}>
              Executado em {new Date(laudo.dataExecucao).toLocaleDateString("pt-BR")}
            </div>
          )}
          <div style={{ fontSize: 13 }}>
            <strong>{displayRespostas.filter((r) => r.status === "NAO" || r.status === "REPROVADO").length}</strong>{" "}
            não-conformidade(s) detectada(s)
          </div>
          {!viewMode && (
            <Btn type="button" onClick={() => void salvar()}>
              Salvar laudo
            </Btn>
          )}
        </div>
      )}

      <ConfirmModal
        open={confirmOs}
        title="Gerar OS Corretiva"
        message="Será criada uma OS corretiva agregando todas as não-conformidades deste laudo."
        confirmLabel="Gerar OS"
        onConfirm={() => gerarOs()}
        onCancel={() => setConfirmOs(false)}
      />
    </div>
  );
}
