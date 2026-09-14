"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { api, downloadApi } from "@/lib/api";
import { useWindowStore } from "@/store/windows";
import {
  Badge,
  Btn,
  DataTable,
  Empty,
  Err,
  FieldLabel,
  FilterBar,
  KpiCard,
  PageHeader,
  Panel,
  fieldStyle,
  td,
  th,
} from "@/components/ui/aion-ui";

type Metrica = {
  valor: number | null;
  n: number;
  status: "medido" | "dados_insuficientes";
  motivo?: string;
  formula: string;
  origem: string;
};

type Razao = {
  numerador: number;
  denominador: number;
  percentual: number | null;
  status: "medido" | "dados_insuficientes";
  motivo?: string;
  formula: string;
};

type Drill = {
  tipo: "os" | "ocorrencia" | "equipamento";
  id: string;
  codigo: string;
  numero?: number;
  tag?: string | null;
  setor?: string | null;
  status: string;
  detalhe?: string | null;
};

type Grupo = { itens: Array<{ chave: string; label: string; total: number }>; soma: number };

type Painel = {
  atualizadoEm: string;
  estabelecimento: { nome: string };
  filtros: { de: string; ate: string };
  limitacoes: string[];
  formulas: Array<{ chave: string; nome: string; formula: string; nota: string }>;
  operacional: {
    totais: Record<string, number>;
    porStatus: Grupo;
    porPrioridade: Grupo;
    porSetor: Grupo;
    porResponsavel: Grupo;
    tempoAbertoHoras: Metrica;
    semResponsavel: { total: number; itens: Drill[] };
    antigas: { total: number; itens: Drill[] };
    entradasPeriodo: { total: number; itens: Drill[] };
    conclusoesPeriodo: { total: number; itens: Drill[] };
    indisponiveis: Drill[];
    aguardandoFornecedor: { total: number; itens: Drill[] };
    encaminhamentoExterno: {
      criterio: string;
      assistenciaSemRetorno: Drill[];
      planosExecutorExterno: Drill[];
    };
    origem: string;
  };
  programadas: {
    cumprimento: Razao;
    devidas: number;
    contagens: Record<string, number>;
    excluidas: { canceladas: number; suspensas: number };
    explicacao: string;
    registros: Record<string, { total: number; itens: Drill[] }>;
    origem: string;
  };
  tempos: {
    atePrimeiroAtendimento: Metrica;
    duracaoTotalOs: Metrica;
    tempoTrabalhado: Metrica;
    slaPrimeiroAtendimento: Razao;
    slaConclusao: Razao;
    notas: string[];
  };
  confiabilidade: {
    mttr: Metrica;
    mtbf: Metrica;
    disponibilidade: Metrica;
    parqueEmOperacao: Razao;
    horasParadaRegistradas: number;
    equipamentosComParadaRegistrada: number;
    nota: string;
  };
  custos:
    | { oculto: true; motivo: string }
    | {
        realizado: number;
        estimadoCapex: number;
        aprovadoCapex: number;
        porEquipamento: Array<{ chave: string; valor: number }>;
        porSetor: Array<{ chave: string; valor: number }>;
        porTipo: Array<{ chave: string; valor: number }>;
        recorrenciaFalhas: Array<{ tag: string; nome: string; n: number }>;
        origem: string;
      };
  carga: {
    tecnicos: Array<{
      id: string;
      nome: string;
      abertas: number;
      emAndamento: number;
      aguardando: number;
      concluidasPeriodo: number;
      tempoTrabalhadoHoras: number | null;
      tempoAbertoHorasMedia: number | null;
      nota: string;
    }>;
    nota: string;
  };
};

type IndCard = {
  id: string;
  nome: string;
  categoria: string;
  valorAtual: number | null;
  insuficiente?: boolean;
  detalhe?: string;
  meta: string | null;
  tendencia: string;
  sistema: boolean;
};

function isoDay(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtNum(v: number | null | undefined, suf = "") {
  if (v == null || Number.isNaN(v)) return "dados insuficientes";
  return `${v}${suf}`;
}

function fmtRazao(r?: Razao) {
  if (!r) return "—";
  if (r.status !== "medido" || r.percentual == null) {
    return `dados insuficientes (${r.numerador}/${r.denominador})`;
  }
  return `${r.percentual}% (${r.numerador}/${r.denominador})`;
}

function fmtMoney(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const PROG_LABEL: Record<string, string> = {
  prevista: "Prevista",
  pendente_no_prazo: "Pendente no prazo",
  pendente_atrasada: "Pendente com atraso",
  executada_no_prazo: "No prazo",
  executada_atrasada: "Executada com atraso",
  cancelada: "Cancelada",
  plano_suspenso: "Plano suspenso/desativado",
};

export default function IndicadoresPage() {
  const open = useWindowStore((s) => s.open);
  const [painel, setPainel] = useState<Painel | null>(null);
  const [inds, setInds] = useState<IndCard[]>([]);
  const [hist, setHist] = useState<Array<{ periodo: string; valor: number }> | null>(null);
  const [sel, setSel] = useState<IndCard | null>(null);
  const [setores, setSetores] = useState<Array<{ id: string; nome: string }>>([]);
  const [de, setDe] = useState(() => isoDay(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [ate, setAte] = useState(() => isoDay());
  const [setorId, setSetorId] = useState("");
  const [tipo, setTipo] = useState("");
  const [prioridade, setPrioridade] = useState("");
  const [drill, setDrill] = useState<{ titulo: string; origem: string; itens: Drill[] } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (de) p.set("de", de);
    if (ate) p.set("ate", ate);
    if (setorId) p.set("setorId", setorId);
    if (tipo) p.set("tipo", tipo);
    if (prioridade) p.set("prioridade", prioridade);
    return p.toString();
  }, [de, ate, setorId, tipo, prioridade]);

  const load = useCallback(async () => {
    setBusy(true);
    setErro(null);
    try {
      const [p, cards, st] = await Promise.all([
        api<Painel>(`/indicadores/painel?${qs}`),
        api<IndCard[]>("/indicadores"),
        api<Array<{ id: string; nome: string }>>("/setores").catch(() => [] as Array<{ id: string; nome: string }>),
      ]);
      setPainel(p);
      setInds(cards);
      setSetores(st);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar indicadores");
    } finally {
      setBusy(false);
    }
  }, [qs]);

  useEffect(() => {
    void load();
  }, [load]);

  function abrirDrill(titulo: string, origem: string, itens: Drill[], total?: number) {
    setDrill({
      titulo: total != null ? `${titulo} (${total})` : titulo,
      origem,
      itens,
    });
  }

  function abrirRegistro(d: Drill) {
    if (d.tipo === "os" && d.numero != null) {
      open({ kind: "os", title: d.codigo, payload: { numero: d.numero, codigo: d.codigo } });
      return;
    }
    if (d.tipo === "equipamento" && d.tag) {
      open({ kind: "equipamento", title: d.tag, payload: { tag: d.tag } });
    }
  }

  async function exportar(formato: "csv" | "json") {
    try {
      await downloadApi(`/indicadores/painel/export?${qs}&formato=${formato}`, undefined, `indicadores-gestor.${formato}`);
      setMsg(`Exportação ${formato.toUpperCase()} iniciada`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha no export");
    }
  }

  async function openHist(ind: IndCard) {
    setSel(ind);
    setHist(await api(`/indicadores/${ind.id}/historico?meses=6`));
  }

  async function criar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await api("/indicadores/construtor", {
      method: "POST",
      body: JSON.stringify({
        nome: String(fd.get("nome")),
        formula: String(fd.get("formula")),
        campos: String(fd.get("campos") || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        metaTexto: String(fd.get("meta") || "") || undefined,
      }),
    });
    e.currentTarget.reset();
    setMsg("Indicador customizado criado");
    await load();
  }

  const op = painel?.operacional;
  const atualizado = painel
    ? new Date(painel.atualizadoEm).toLocaleString("pt-BR")
    : busy
      ? "atualizando…"
      : "—";

  return (
    <div>
      <PageHeader
        title="Indicadores do gestor"
        subtitle={`${painel?.estabelecimento.nome ?? ""} · atualizado em ${atualizado}`}
        actions={
          <>
            <Btn variant="secondary" size="sm" onClick={() => void exportar("csv")} disabled={!painel}>
              Exportar CSV
            </Btn>
            <Btn variant="ghost" size="sm" onClick={() => void exportar("json")} disabled={!painel}>
              JSON
            </Btn>
          </>
        }
      />
      {erro && <Err>{erro}</Err>}
      {msg && <div style={{ marginBottom: 10, fontSize: 13, fontWeight: 600 }}>{msg}</div>}

      <FilterBar>
        <div>
          <FieldLabel>De</FieldLabel>
          <input type="date" value={de} onChange={(e) => setDe(e.target.value)} style={fieldStyle} />
        </div>
        <div>
          <FieldLabel>Até</FieldLabel>
          <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} style={fieldStyle} />
        </div>
        <div>
          <FieldLabel>Setor</FieldLabel>
          <select value={setorId} onChange={(e) => setSetorId(e.target.value)} style={fieldStyle}>
            <option value="">Todos</option>
            {setores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel>Tipo de OS</FieldLabel>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={fieldStyle}>
            <option value="">Todos</option>
            <option value="CORRETIVA">Corretiva</option>
            <option value="PREVENTIVA">Preventiva</option>
            <option value="CALIBRACAO">Calibração</option>
            <option value="TSE">TSE</option>
            <option value="QUALIFICACAO">Qualificação</option>
          </select>
        </div>
        <div>
          <FieldLabel>Prioridade</FieldLabel>
          <select value={prioridade} onChange={(e) => setPrioridade(e.target.value)} style={fieldStyle}>
            <option value="">Todas</option>
            <option value="URGENTE">Urgente</option>
            <option value="ALTA">Alta</option>
            <option value="MEDIA">Média</option>
            <option value="BAIXA">Baixa</option>
          </select>
        </div>
      </FilterBar>

      {painel && (
        <Panel title="Limitações do histórico HEF">
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.5, color: "oklch(0.4 0.02 250)" }}>
            {painel.limitacoes.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </Panel>
      )}

      {op && (
        <>
          <h2 style={h2}>Painel operacional</h2>
          <div style={grid4}>
            <KpiCard
              label="OS no recorte"
              value={op.totais.osNoRecorte}
              hint={`origem: ${op.origem}`}
              tone="info"
            />
            <KpiCard
              label="Em aberto"
              value={op.totais.abertas}
              hint={`${op.totais.slaEstourado} com SLA estourado`}
              tone={op.totais.slaEstourado > 0 ? "danger" : "neutral"}
            />
            <KpiCard
              label="Sem responsável"
              value={op.totais.semResponsavel}
              hint="clique para ver a lista"
              tone={op.totais.semResponsavel > 0 ? "warning" : "neutral"}
            />
            <KpiCard
              label="Parados agora"
              value={op.totais.parados}
              hint="condição de uso PARADO (snapshot)"
              tone={op.totais.parados > 0 ? "danger" : "neutral"}
            />
          </div>
          <div style={{ ...grid4, marginTop: 12 }}>
            <KpiCard label="Entradas no período" value={op.totais.entradasPeriodo} />
            <KpiCard label="Conclusões no período" value={op.totais.conclusoesPeriodo} tone="success" />
            <KpiCard
              label="Antigas (7+ dias)"
              value={op.totais.antigas}
              hint={fmtNum(op.tempoAbertoHoras.valor, " h média em aberto")}
            />
            <KpiCard
              label="Aguardando fornecedor"
              value={op.totais.aguardandoFornecedor}
              hint={`${op.totais.assistenciaSemRetorno} em assistência sem retorno`}
              tone={op.totais.aguardandoFornecedor > 0 ? "warning" : "neutral"}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
            <Barras titulo="OS por status" grupo={op.porStatus} />
            <Barras titulo="OS por prioridade" grupo={op.porPrioridade} />
            <Barras titulo="OS por setor" grupo={op.porSetor} />
            <Barras titulo="OS por responsável" grupo={op.porResponsavel} />
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            <Btn size="sm" variant="secondary" onClick={() => abrirDrill("Sem responsável", op.origem, op.semResponsavel.itens, op.semResponsavel.total)}>
              Sem responsável
            </Btn>
            <Btn size="sm" variant="secondary" onClick={() => abrirDrill("OS antigas", op.origem, op.antigas.itens, op.antigas.total)}>
              Antigas
            </Btn>
            <Btn size="sm" variant="secondary" onClick={() => abrirDrill("Entradas", op.origem, op.entradasPeriodo.itens, op.entradasPeriodo.total)}>
              Entradas
            </Btn>
            <Btn size="sm" variant="secondary" onClick={() => abrirDrill("Conclusões", op.origem, op.conclusoesPeriodo.itens, op.conclusoesPeriodo.total)}>
              Conclusões
            </Btn>
            <Btn size="sm" variant="secondary" onClick={() => abrirDrill("Indisponíveis (PARADO)", "equipamento.condicaoUso", op.indisponiveis, op.indisponiveis.length)}>
              Indisponíveis
            </Btn>
            <Btn size="sm" variant="secondary" onClick={() => abrirDrill("Aguardando fornecedor", op.encaminhamentoExterno.criterio, op.aguardandoFornecedor.itens, op.aguardandoFornecedor.total)}>
              Aguardando fornecedor
            </Btn>
          </div>
          <p style={nota}>{op.encaminhamentoExterno.criterio}</p>
        </>
      )}

      {painel && (
        <>
          <h2 style={h2}>Programadas</h2>
          <div style={grid4}>
            <KpiCard
              label="Cumprimento"
              value={fmtRazao(painel.programadas.cumprimento)}
              hint={painel.programadas.cumprimento.formula}
              tone={painel.programadas.cumprimento.status === "medido" ? "info" : "neutral"}
            />
            <KpiCard label="Devidas no período" value={painel.programadas.devidas} />
            <KpiCard label="Canceladas (fora do %)" value={painel.programadas.excluidas.canceladas} />
            <KpiCard label="Suspensas (fora do %)" value={painel.programadas.excluidas.suspensas} />
          </div>
          <p style={nota}>{painel.programadas.explicacao}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            {Object.entries(painel.programadas.registros).map(([k, v]) => (
              <Btn
                key={k}
                size="sm"
                variant="ghost"
                onClick={() => abrirDrill(PROG_LABEL[k] ?? k, painel.programadas.origem, v.itens, v.total)}
              >
                {PROG_LABEL[k] ?? k}: {v.total}
              </Btn>
            ))}
          </div>
        </>
      )}

      {painel && (
        <>
          <h2 style={h2}>Tempos (grandezas distintas)</h2>
          <div style={grid4}>
            <MetricaCard label="Até o 1º atendimento" m={painel.tempos.atePrimeiroAtendimento} suf=" h" />
            <MetricaCard label="Duração total da OS" m={painel.tempos.duracaoTotalOs} suf=" h" />
            <MetricaCard label="Tempo trabalhado" m={painel.tempos.tempoTrabalhado} suf=" h" />
            <KpiCard
              label="SLA 1º atendimento"
              value={fmtRazao(painel.tempos.slaPrimeiroAtendimento)}
              hint={painel.tempos.slaPrimeiroAtendimento.motivo ?? painel.tempos.slaPrimeiroAtendimento.formula}
            />
          </div>
          <KpiCard
            label="SLA de conclusão"
            value={fmtRazao(painel.tempos.slaConclusao)}
            hint="Prazo do tipo ou, se o tipo não tiver, da prioridade. Relógio corrido — pausas não descontam."
          />
          {painel.tempos.notas.map((n) => (
            <p key={n} style={nota}>
              {n}
            </p>
          ))}
        </>
      )}

      {painel && (
        <>
          <h2 style={h2}>MTTR / MTBF / disponibilidade</h2>
          <div style={grid4}>
            <MetricaCard label="MTTR" m={painel.confiabilidade.mttr} suf=" h" />
            <MetricaCard label="MTBF" m={painel.confiabilidade.mtbf} suf=" h" />
            <MetricaCard label="Disponibilidade" m={painel.confiabilidade.disponibilidade} suf="%" />
            <KpiCard
              label="Parque em operação"
              value={fmtRazao(painel.confiabilidade.parqueEmOperacao)}
              hint="Snapshot de situação — não é uptime"
            />
          </div>
          <p style={nota}>
            {painel.confiabilidade.nota} Horas de parada fundidas no período: {painel.confiabilidade.horasParadaRegistradas} h
            em {painel.confiabilidade.equipamentosComParadaRegistrada} equipamento(s) com sinal de parada.
          </p>
        </>
      )}

      {painel && (
        <>
          <h2 style={h2}>Custos e recorrência</h2>
          {"oculto" in painel.custos ? (
            <Panel title="Custos">{painel.custos.motivo}</Panel>
          ) : (
            <>
              <div style={grid4}>
                <KpiCard label="Realizado (itens de OS)" value={fmtMoney(painel.custos.realizado)} hint={painel.custos.origem} tone="info" />
                <KpiCard label="CAPEX estimado" value={fmtMoney(painel.custos.estimadoCapex)} hint="separado do realizado" />
                <KpiCard label="CAPEX aprovado" value={fmtMoney(painel.custos.aprovadoCapex)} hint="separado do realizado" />
                <KpiCard label="Equipamentos com ≥2 corretivas" value={painel.custos.recorrenciaFalhas.length} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginTop: 12 }}>
                <ListaValores titulo="Por equipamento" itens={painel.custos.porEquipamento} />
                <ListaValores titulo="Por setor" itens={painel.custos.porSetor} />
                <ListaValores titulo="Por tipo de item" itens={painel.custos.porTipo} />
              </div>
              {painel.custos.recorrenciaFalhas.length > 0 && (
                <Panel title="Recorrência de falhas (corretivas no recorte)">
                  {painel.custos.recorrenciaFalhas.map((f) => (
                    <div key={f.tag} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13 }}>
                      <span>
                        {f.tag} · {f.nome}
                      </span>
                      <strong>{f.n} OS</strong>
                    </div>
                  ))}
                </Panel>
              )}
            </>
          )}
        </>
      )}

      {painel && (
        <>
          <h2 style={h2}>Carga de trabalho</h2>
          <p style={nota}>{painel.carga.nota}</p>
          {painel.carga.tecnicos.length === 0 ? (
            <Empty text="Nenhum responsável com OS no recorte." />
          ) : (
            <DataTable>
              <thead>
                <tr>
                  <th style={th}>Técnico</th>
                  <th style={th}>Fila</th>
                  <th style={th}>Em atendimento</th>
                  <th style={th}>Aguardando</th>
                  <th style={th}>Concluídas no período</th>
                  <th style={th}>Trabalhado</th>
                  <th style={th}>Média em aberto</th>
                </tr>
              </thead>
              <tbody>
                {painel.carga.tecnicos.map((t) => (
                  <tr key={t.id}>
                    <td style={td}>{t.nome}</td>
                    <td style={td}>{t.abertas}</td>
                    <td style={td}>{t.emAndamento}</td>
                    <td style={td}>{t.aguardando}</td>
                    <td style={td}>{t.concluidasPeriodo}</td>
                    <td style={td}>{t.tempoTrabalhadoHoras != null ? `${t.tempoTrabalhadoHoras} h` : "sem log"}</td>
                    <td style={td}>{t.tempoAbertoHorasMedia != null ? `${t.tempoAbertoHorasMedia} h` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </>
      )}

      {drill && (
        <Panel
          title={drill.titulo}
          action={
            <Btn size="sm" variant="ghost" onClick={() => setDrill(null)}>
              Fechar
            </Btn>
          }
        >
          <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)", marginBottom: 8 }}>{drill.origem}</div>
          {drill.itens.length === 0 ? (
            <Empty />
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {drill.itens.map((d) => (
                <li
                  key={`${d.tipo}-${d.id}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "8px 0",
                    borderBottom: "1px solid oklch(0.94 0.005 255)",
                    fontSize: 13,
                    cursor: d.tipo === "ocorrencia" ? "default" : "pointer",
                  }}
                  onClick={() => abrirRegistro(d)}
                >
                  <span>
                    <strong>{d.codigo}</strong>
                    {d.tag ? ` · ${d.tag}` : ""} {d.setor ? `· ${d.setor}` : ""}
                    {d.detalhe ? <div style={{ color: "oklch(0.5 0.02 250)", fontSize: 12 }}>{d.detalhe}</div> : null}
                  </span>
                  <Badge tone={d.status}>{d.status.replace(/_/g, " ")}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {painel && (
        <Panel title="Fórmulas">
          {painel.formulas.map((f) => (
            <div key={f.chave} style={{ padding: "8px 0", borderBottom: "1px solid oklch(0.94 0.005 255)", fontSize: 13 }}>
              <strong>{f.nome}</strong>
              <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, marginTop: 2 }}>{f.formula}</div>
              <div style={{ color: "oklch(0.5 0.02 250)", fontSize: 12 }}>{f.nota}</div>
            </div>
          ))}
        </Panel>
      )}

      <h2 style={h2}>Cards de sistema e construtor</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10, marginBottom: 18 }}>
        {inds.map((i) => (
          <button
            key={i.id}
            type="button"
            onClick={() => void openHist(i)}
            style={{ textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer" }}
          >
            <KpiCard
              label={`${i.categoria}${i.sistema ? " · sistema" : ""}`}
              value={i.insuficiente || i.valorAtual == null ? "dados insuficientes" : i.valorAtual}
              hint={`Meta: ${i.meta ?? "—"} · ${i.tendencia}${i.detalhe ? ` · ${i.detalhe}` : ""}`}
            />
            <div style={{ fontWeight: 700, fontSize: 14, marginTop: -8, paddingLeft: 16, paddingBottom: 8 }}>{i.nome}</div>
          </button>
        ))}
      </div>

      {sel && hist && (
        <Panel title={`${sel.nome} — histórico 6 meses`}>
          {hist.length === 0 ? (
            <Empty text="Sem snapshot no período (valor nulo não é gravado como 100%)." />
          ) : (
            <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 160, marginBottom: 8 }}>
              {hist.map((h) => {
                const max = Math.max(...hist.map((x) => x.valor), 1);
                const hgt = Math.max(12, (h.valor / max) * 120);
                return (
                  <div key={h.periodo} style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>{h.valor}</div>
                    <div style={{ height: 120, alignItems: "flex-end", display: "flex" }}>
                      <div
                        style={{
                          width: "100%",
                          height: hgt,
                          background: "linear-gradient(180deg, oklch(0.62 0.16 255), oklch(0.48 0.14 255))",
                          borderRadius: "6px 6px 0 0",
                        }}
                        title={`${h.periodo}: ${h.valor}`}
                      />
                    </div>
                    <div style={{ fontSize: 10, color: "oklch(0.5 0.02 250)", marginTop: 4 }}>{h.periodo.slice(5)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      )}

      <Panel title="Construtor">
        <form onSubmit={(e) => void criar(e)} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 2fr 1fr auto", gap: 10, alignItems: "end" }}>
          <div>
            <FieldLabel>Nome</FieldLabel>
            <input name="nome" placeholder="Nome" required style={fieldStyle} />
          </div>
          <div>
            <FieldLabel>Fórmula</FieldLabel>
            <select name="formula" style={fieldStyle}>
              <option value="PERCENTUAL">Percentual</option>
              <option value="CONTAGEM">Contagem</option>
              <option value="MEDIA">Média</option>
              <option value="SOMA">Soma</option>
            </select>
          </div>
          <div>
            <FieldLabel>Campos</FieldLabel>
            <input name="campos" placeholder="Campos (OS,Equipamentos…)" style={fieldStyle} />
          </div>
          <div>
            <FieldLabel>Meta</FieldLabel>
            <input name="meta" placeholder="Meta" style={fieldStyle} />
          </div>
          <Btn type="submit">Criar</Btn>
        </form>
      </Panel>
    </div>
  );
}

function MetricaCard({ label, m, suf = "" }: { label: string; m: Metrica; suf?: string }) {
  const vazio = m.status !== "medido" || m.valor == null;
  return (
    <KpiCard
      label={label}
      value={vazio ? "dados insuficientes" : `${m.valor}${suf}`}
      hint={vazio ? m.motivo ?? m.formula : `${m.n} amostra(s) · ${m.origem}`}
      tone={vazio ? "neutral" : "info"}
    />
  );
}

function Barras({ titulo, grupo }: { titulo: string; grupo: Grupo }) {
  const max = Math.max(1, ...grupo.itens.map((i) => i.total));
  return (
    <Panel title={`${titulo} · total ${grupo.soma}`}>
      {grupo.itens.length === 0 ? (
        <Empty />
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {grupo.itens.map((row) => (
            <div key={row.chave} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 120, fontSize: 12, fontWeight: 600, flexShrink: 0 }}>{row.label}</div>
              <div style={{ flex: 1, height: 18, background: "oklch(0.94 0.003 255)", borderRadius: 4, overflow: "hidden" }}>
                <div
                  style={{
                    width: `${(row.total / max) * 100}%`,
                    height: "100%",
                    background: "oklch(0.55 0.14 255)",
                    minWidth: row.total > 0 ? 4 : 0,
                  }}
                />
              </div>
              <div style={{ width: 36, textAlign: "right", fontSize: 13, fontWeight: 700 }}>{row.total}</div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function ListaValores({ titulo, itens }: { titulo: string; itens: Array<{ chave: string; valor: number }> }) {
  return (
    <Panel title={titulo}>
      {itens.length === 0 ? (
        <Empty />
      ) : (
        itens.map((i) => (
          <div key={i.chave} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13 }}>
            <span>{i.chave}</span>
            <strong>{fmtMoney(i.valor)}</strong>
          </div>
        ))
      )}
    </Panel>
  );
}

const grid4 = { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, marginBottom: 8 } as const;
const h2 = { fontSize: 16, fontWeight: 800, margin: "22px 0 12px", letterSpacing: "-0.02em" } as const;
const nota = { fontSize: 12.5, color: "oklch(0.45 0.02 250)", lineHeight: 1.45, margin: "8px 0 12px" } as const;
