"use client";

import { useEffect, useMemo, useState } from "react";
import { api, downloadApi } from "@/lib/api";
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
  Surface,
  fieldStyle,
  td,
  th,
} from "@/components/ui/aion-ui";

type AgendaItem = {
  id: string;
  planoId: string;
  tipo: string;
  tipoLabel: string;
  status: string;
  dataPrevista: string;
  dataPrevistaOriginal: string;
  atrasoDias: number;
  reprogramada: boolean;
  motivoReprogramacao: string | null;
  cumpriuPlano: boolean;
  resultado: string | null;
  executorTipo: string;
  executorNome: string | null;
  fornecedor: string | null;
  responsavel: string | null;
  grupo: string | null;
  os: { codigo: string; status: string } | null;
  osGeracaoStatus: string;
  osGeracaoErro: string | null;
  tag: string;
  equipamento: string;
  setor: string;
  procedimentoCodigo: string | null;
  periodicidadeMeses: number | null;
  modoAgendamento: string;
};

type Agenda = {
  de: string;
  ate: string;
  total: number;
  contagem: Record<string, number>;
  itens: AgendaItem[];
};

type Lookup = { id: string; nome: string; matricula?: string };
type EquipLookup = { id: string; tag: string; nome: string };

type Vista = "calendario" | "lista";

const TIPOS = ["TODOS", "PREVENTIVA", "CALIBRACAO", "TSE", "QUALIFICACAO", "OUTRO"] as const;
const STATUS = ["TODOS", "PREVISTA", "A_VENCER", "VENCIDA", "OS_GERADA", "EXECUTADA"] as const;

function ym(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function CronogramaManutencaoPage() {
  const year = new Date().getFullYear();
  const [de, setDe] = useState(`${year}-01-01`);
  const [ate, setAte] = useState(`${year}-12-31`);
  const [tipo, setTipo] = useState<string>("TODOS");
  const [status, setStatus] = useState<string>("TODOS");
  const [q, setQ] = useState("");
  const [executorTipo, setExecutorTipo] = useState("");
  const [vista, setVista] = useState<Vista>("lista");
  const [mesCal, setMesCal] = useState(ym(new Date()));
  const [agenda, setAgenda] = useState<Agenda | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [colabs, setColabs] = useState<Lookup[]>([]);
  const [fornecedores, setFornecedores] = useState<Lookup[]>([]);
  const [equips, setEquips] = useState<EquipLookup[]>([]);
  const [showPlano, setShowPlano] = useState(false);
  const [reprog, setReprog] = useState<AgendaItem | null>(null);
  const [dist, setDist] = useState(false);
  const [distA, setDistA] = useState("");
  const [distB, setDistB] = useState("");

  async function loadAgenda() {
    const params = new URLSearchParams({ de, ate, tipo, status });
    if (q.trim()) params.set("q", q.trim());
    if (executorTipo) params.set("executorTipo", executorTipo);
    const data = await api<Agenda>(`/planos/agenda?${params.toString()}`);
    setAgenda(data);
  }

  useEffect(() => {
    void loadAgenda().catch((e) => setErro(e instanceof Error ? e.message : "Erro"));
    api<Lookup[]>("/pessoas/colaboradores")
      .then((rows) => setColabs(rows))
      .catch(() => setColabs([]));
    api<Lookup[]>("/fornecedores")
      .then((rows) => setFornecedores(rows))
      .catch(() => setFornecedores([]));
    api<{ items: EquipLookup[] }>("/equipamentos?pageSize=200")
      .then((r) => setEquips(r.items ?? []))
      .catch(() => setEquips([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const porDia = useMemo(() => {
    const map: Record<string, number> = {};
    for (const it of agenda?.itens ?? []) {
      map[it.dataPrevista] = (map[it.dataPrevista] ?? 0) + 1;
    }
    return map;
  }, [agenda]);

  const diasMes = useMemo(() => {
    const [y, m] = mesCal.split("-").map(Number);
    const first = new Date(y, m - 1, 1);
    const startPad = first.getDay();
    const lastDate = new Date(y, m, 0).getDate();
    const cells: Array<{ iso: string | null; n: number }> = [];
    for (let i = 0; i < startPad; i += 1) cells.push({ iso: null, n: 0 });
    for (let d = 1; d <= lastDate; d += 1) {
      const iso = `${mesCal}-${String(d).padStart(2, "0")}`;
      cells.push({ iso, n: porDia[iso] ?? 0 });
    }
    return cells;
  }, [mesCal, porDia]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setErro(null);
    setMsg(null);
    try {
      await fn();
      await loadAgenda();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  async function exportRelatorio(formato: "xlsx" | "pdf") {
    await run(async () => {
      const name = await downloadApi(
        "/relatorios/gerar",
        {
          method: "POST",
          body: JSON.stringify({ template: "calendario_manutencao", formato, de, ate }),
        },
        `calendario_manutencao.${formato}`,
      );
      setMsg(`Download: ${name}`);
    });
  }

  return (
    <div>
      <PageHeader
        title="Cronograma de Manutenção"
        subtitle="O que precisa ser feito, quando, em qual equipamento, por quem — com evidência. Periodicidade só entra se estiver cadastrada."
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn type="button" variant="secondary" disabled={busy} onClick={() => void run(loadAgenda)}>
              Atualizar
            </Btn>
            <Btn
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const r = await api<{ criadas: number; atualizadas: number; ocorrencias: number }>(
                    "/planos/sincronizar",
                    { method: "POST", body: "{}" },
                  );
                  setMsg(
                    `Planos sincronizados do catálogo: ${r.criadas} novos · ${r.atualizadas} atualizados. Sem inventar periodicidade.`,
                  );
                })
              }
            >
              Sincronizar catálogo
            </Btn>
            <Btn
              type="button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const r = await api<{ criadas: number; vinculadas: number; falhas: number }>(
                    "/planos/gerar-os",
                    { method: "POST", body: JSON.stringify({ soFalhas: false }) },
                  );
                  setMsg(`OS: ${r.criadas} criadas · ${r.vinculadas} vinculadas · ${r.falhas} falhas`);
                })
              }
            >
              Gerar OS pendentes
            </Btn>
            <Btn type="button" variant="secondary" disabled={busy} onClick={() => setShowPlano(true)}>
              Novo plano
            </Btn>
            <Btn type="button" variant="secondary" disabled={busy} onClick={() => setDist(true)}>
              Distribuir 2 profissionais
            </Btn>
            <Btn type="button" variant="secondary" disabled={busy} onClick={() => void exportRelatorio("pdf")}>
              PDF
            </Btn>
            <Btn type="button" variant="secondary" disabled={busy} onClick={() => void exportRelatorio("xlsx")}>
              XLSX
            </Btn>
          </div>
        }
      />

      {erro && <Err>{erro}</Err>}
      {msg && (
        <div style={{ fontSize: 13, fontWeight: 600, color: "oklch(0.4 0.14 150)", marginBottom: 12 }}>{msg}</div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 16 }}>
        <KpiCard label="Previstas" value={String(agenda?.contagem.PREVISTA ?? 0)} />
        <KpiCard label="A vencer" value={String(agenda?.contagem.A_VENCER ?? 0)} tone="warning" />
        <KpiCard label="Vencidas" value={String(agenda?.contagem.VENCIDA ?? 0)} tone="danger" />
        <KpiCard label="OS gerada" value={String(agenda?.contagem.OS_GERADA ?? 0)} />
        <KpiCard label="Executadas" value={String(agenda?.contagem.EXECUTADA ?? 0)} tone="success" />
      </div>

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
          <FieldLabel>Tipo</FieldLabel>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={fieldStyle}>
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {t === "TODOS" ? "Todos" : t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel>Situação</FieldLabel>
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={fieldStyle}>
            {STATUS.map((s) => (
              <option key={s} value={s}>
                {s === "TODOS" ? "Todas" : s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel>Executor</FieldLabel>
          <select value={executorTipo} onChange={(e) => setExecutorTipo(e.target.value)} style={fieldStyle}>
            <option value="">Todos</option>
            <option value="INTERNO">Interno</option>
            <option value="EXTERNO">Externo</option>
          </select>
        </div>
        <div>
          <FieldLabel>Busca</FieldLabel>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="TAG ou nome" style={fieldStyle} />
        </div>
        <Btn type="button" variant="secondary" disabled={busy} onClick={() => void run(loadAgenda)}>
          Filtrar
        </Btn>
      </FilterBar>

      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {(["lista", "calendario"] as Vista[]).map((v) => (
          <Btn key={v} type="button" size="sm" variant={vista === v ? undefined : "ghost"} onClick={() => setVista(v)}>
            {v === "lista" ? "Lista" : "Calendário"}
          </Btn>
        ))}
        <Btn
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const r = await api<{ falhas: number; criadas: number }>("/planos/gerar-os", {
                method: "POST",
                body: JSON.stringify({ soFalhas: true }),
              });
              setMsg(`Reprocessadas falhas: ${r.criadas} OS · ${r.falhas} ainda em falha`);
            })
          }
        >
          Reprocessar falhas
        </Btn>
      </div>

      {vista === "calendario" && (
        <Surface style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <strong>Calendário</strong>
            <input type="month" value={mesCal} onChange={(e) => setMesCal(e.target.value)} style={{ ...fieldStyle, width: 180 }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, fontSize: 12 }}>
            {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
              <div key={`${d}-${i}`} style={{ fontWeight: 700, textAlign: "center", color: "oklch(0.5 0.02 250)" }}>
                {d}
              </div>
            ))}
            {diasMes.map((c, i) => (
              <div
                key={i}
                style={{
                  minHeight: 54,
                  border: "1px solid oklch(0.92 0.01 250)",
                  borderRadius: 6,
                  padding: 6,
                  background: c.n > 0 ? "oklch(0.97 0.02 85)" : "white",
                }}
              >
                {c.iso && (
                  <>
                    <div>{Number(c.iso.slice(-2))}</div>
                    {c.n > 0 && <strong>{c.n}</strong>}
                  </>
                )}
              </div>
            ))}
          </div>
        </Surface>
      )}

      <DataTable>
        <thead>
          <tr>
            <th style={th}>Prevista</th>
            <th style={th}>Original / atraso</th>
            <th style={th}>Tipo</th>
            <th style={th}>TAG</th>
            <th style={th}>Equipamento</th>
            <th style={th}>Setor</th>
            <th style={th}>Responsável</th>
            <th style={th}>Situação</th>
            <th style={th}>OS / evidência</th>
            <th style={th}></th>
          </tr>
        </thead>
        <tbody>
          {(agenda?.itens ?? []).length === 0 ? (
            <tr>
              <td colSpan={10} style={td}>
                <Empty text="Nada no cronograma neste filtro. Sincronize o catálogo ou cadastre a próxima data — o sistema não inventa periodicidade." />
              </td>
            </tr>
          ) : (
            (agenda?.itens ?? []).slice(0, 300).map((e) => (
              <tr key={e.id}>
                <td style={td}>{e.dataPrevista}</td>
                <td style={td}>
                  {e.dataPrevistaOriginal}
                  {e.atrasoDias > 0 && (
                    <div>
                      <Badge tone="VENCIDA">{e.atrasoDias}d atraso</Badge>
                    </div>
                  )}
                </td>
                <td style={td}>
                  <Badge tone="info">{e.tipoLabel}</Badge>
                  {e.executorTipo === "EXTERNO" && (
                    <div style={{ fontSize: 11 }}>{e.fornecedor ?? "Externo"}</div>
                  )}
                </td>
                <td style={td}>{e.tag}</td>
                <td style={td}>{e.equipamento}</td>
                <td style={td}>{e.setor}</td>
                <td style={td}>{e.responsavel ?? e.executorNome ?? "—"}</td>
                <td style={td}>
                  <Badge tone={e.status}>{e.status.replace(/_/g, " ")}</Badge>
                  {e.resultado && !e.cumpriuPlano && (
                    <div style={{ fontSize: 11 }}>executado ≠ aprovado</div>
                  )}
                </td>
                <td style={td}>
                  {e.os ? e.os.codigo : e.osGeracaoStatus === "FALHA" ? e.osGeracaoErro : "—"}
                </td>
                <td style={td}>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {!e.os && e.status !== "EXECUTADA" && (
                      <Btn
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            const r = await api<{ codigo?: string; motivo?: string; falha?: string }>(
                              `/planos/ocorrencias/${e.id}/gerar-os`,
                              { method: "POST", body: "{}" },
                            );
                            setMsg(r.falha ?? r.codigo ?? r.motivo ?? "OS processada");
                          })
                        }
                      >
                        Gerar OS
                      </Btn>
                    )}
                    {e.status !== "EXECUTADA" && (
                      <Btn type="button" size="sm" variant="ghost" onClick={() => setReprog(e)}>
                        Reprogramar
                      </Btn>
                    )}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </DataTable>

      {showPlano && (
        <PlanoForm
          colabs={colabs}
          fornecedores={fornecedores}
          equips={equips}
          busy={busy}
          onClose={() => setShowPlano(false)}
          onSave={(body) =>
            void run(async () => {
              const r = await api<{ count: number }>("/planos/instancias", {
                method: "POST",
                body: JSON.stringify(body),
              });
              setShowPlano(false);
              setMsg(`${r.count} plano(s) gravado(s). Histórico do plano não altera serviços já feitos.`);
            })
          }
        />
      )}

      {reprog && (
        <ReprogramarForm
          item={reprog}
          busy={busy}
          onClose={() => setReprog(null)}
          onSave={(novaData, motivo) =>
            void run(async () => {
              await api(`/planos/ocorrencias/${reprog.id}/reprogramar`, {
                method: "POST",
                body: JSON.stringify({ novaData, motivo }),
              });
              setReprog(null);
              setMsg("Reprogramado. A data original e o atraso foram preservados.");
            })
          }
        />
      )}

      {dist && (
        <Surface style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Distribuir agenda entre 2 profissionais</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 10, alignItems: "end" }}>
            <select value={distA} onChange={(e) => setDistA(e.target.value)} style={fieldStyle}>
              <option value="">Profissional A</option>
              {colabs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
            <select value={distB} onChange={(e) => setDistB(e.target.value)} style={fieldStyle}>
              <option value="">Profissional B</option>
              {colabs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const r = await api<{ distribuidas: number }>("/planos/distribuir", {
                      method: "POST",
                      body: JSON.stringify({ colaboradorIds: [distA, distB], de, ate }),
                    });
                    setDist(false);
                    setMsg(`${r.distribuidas} ocorrências distribuídas em rodízio.`);
                  })
                }
              >
                Distribuir
              </Btn>
              <Btn type="button" variant="ghost" onClick={() => setDist(false)}>
                Cancelar
              </Btn>
            </div>
          </div>
        </Surface>
      )}
    </div>
  );
}

function PlanoForm({
  colabs,
  fornecedores,
  equips,
  busy,
  onClose,
  onSave,
}: {
  colabs: Lookup[];
  fornecedores: Lookup[];
  equips: EquipLookup[];
  busy: boolean;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const [tipo, setTipo] = useState("PREVENTIVA");
  const [tipoCustomNome, setTipoCustomNome] = useState("");
  const [escopo, setEscopo] = useState<"equipamento" | "modelo">("equipamento");
  const [equipamentoId, setEquipamentoId] = useState("");
  const [modeloId, setModeloId] = useState("");
  const [modelos, setModelos] = useState<Lookup[]>([]);
  const [periodicidadeMeses, setPeriodicidadeMeses] = useState("");
  const [fonte, setFonte] = useState("PROCEDIMENTO");
  const [fonteObs, setFonteObs] = useState("");
  const [modo, setModo] = useState("INTERVALO_EXECUCAO");
  const [diaFixo, setDiaFixo] = useState("10");
  const [proximaData, setProximaData] = useState("");
  const [antecedencia, setAntecedencia] = useState("15");
  const [responsavelId, setResponsavelId] = useState("");
  const [executorTipo, setExecutorTipo] = useState("INTERNO");
  const [fornecedorId, setFornecedorId] = useState("");
  const [grupoNome, setGrupoNome] = useState("");

  useEffect(() => {
    api<(Lookup & { fabricante?: { nome: string } })[]>("/modelos")
      .then((rows) =>
        setModelos(
          rows.map((m) => ({
            id: m.id,
            nome: m.fabricante?.nome ? `${m.fabricante.nome} · ${m.nome}` : m.nome,
          })),
        ),
      )
      .catch(() => setModelos([]));
  }, []);

  return (
    <Surface style={{ marginTop: 16 }}>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>Novo plano</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <div>
          <FieldLabel>Aplicar em</FieldLabel>
          <select
            value={escopo}
            onChange={(e) => setEscopo(e.target.value as "equipamento" | "modelo")}
            style={fieldStyle}
          >
            <option value="equipamento">Um equipamento</option>
            <option value="modelo">Todos do modelo</option>
          </select>
        </div>
        {escopo === "equipamento" ? (
          <div>
            <FieldLabel>Equipamento</FieldLabel>
            <select value={equipamentoId} onChange={(e) => setEquipamentoId(e.target.value)} style={fieldStyle}>
              <option value="">Selecione</option>
              {equips.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.tag} · {e.nome}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <FieldLabel>Modelo</FieldLabel>
            <select value={modeloId} onChange={(e) => setModeloId(e.target.value)} style={fieldStyle}>
              <option value="">Selecione</option>
              {modelos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <FieldLabel>Tipo</FieldLabel>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={fieldStyle}>
            <option value="PREVENTIVA">Preventiva</option>
            <option value="CALIBRACAO">Calibração</option>
            <option value="TSE">TSE</option>
            <option value="QUALIFICACAO">Qualificação</option>
            <option value="OUTRO">Outro (configurável)</option>
          </select>
        </div>
        {tipo === "OUTRO" && (
          <div>
            <FieldLabel>Nome do tipo</FieldLabel>
            <input value={tipoCustomNome} onChange={(e) => setTipoCustomNome(e.target.value)} style={fieldStyle} />
          </div>
        )}
        <div>
          <FieldLabel>Periodicidade (meses, opcional)</FieldLabel>
          <input
            type="number"
            min={1}
            value={periodicidadeMeses}
            onChange={(e) => setPeriodicidadeMeses(e.target.value)}
            placeholder="Não inventar — deixe vazio se não houver"
            style={fieldStyle}
          />
        </div>
        <div>
          <FieldLabel>Fonte da periodicidade</FieldLabel>
          <select value={fonte} onChange={(e) => setFonte(e.target.value)} style={fieldStyle}>
            <option value="PROCEDIMENTO">Procedimento</option>
            <option value="FABRICANTE">Fabricante</option>
            <option value="OUTRA">Outra</option>
          </select>
        </div>
        <div>
          <FieldLabel>Detalhe da fonte</FieldLabel>
          <input value={fonteObs} onChange={(e) => setFonteObs(e.target.value)} style={fieldStyle} />
        </div>
        <div>
          <FieldLabel>Modo</FieldLabel>
          <select value={modo} onChange={(e) => setModo(e.target.value)} style={fieldStyle}>
            <option value="INTERVALO_EXECUCAO">Intervalo desde a execução</option>
            <option value="CALENDARIO_FIXO">Calendário fixo</option>
          </select>
        </div>
        {modo === "CALENDARIO_FIXO" && (
          <div>
            <FieldLabel>Dia fixo</FieldLabel>
            <input type="number" min={1} max={31} value={diaFixo} onChange={(e) => setDiaFixo(e.target.value)} style={fieldStyle} />
          </div>
        )}
        <div>
          <FieldLabel>Próxima data</FieldLabel>
          <input type="date" value={proximaData} onChange={(e) => setProximaData(e.target.value)} style={fieldStyle} />
        </div>
        <div>
          <FieldLabel>Antecedência (dias)</FieldLabel>
          <input type="number" min={0} value={antecedencia} onChange={(e) => setAntecedencia(e.target.value)} style={fieldStyle} />
        </div>
        <div>
          <FieldLabel>Responsável</FieldLabel>
          <select value={responsavelId} onChange={(e) => setResponsavelId(e.target.value)} style={fieldStyle}>
            <option value="">—</option>
            {colabs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel>Executor</FieldLabel>
          <select value={executorTipo} onChange={(e) => setExecutorTipo(e.target.value)} style={fieldStyle}>
            <option value="INTERNO">Interno</option>
            <option value="EXTERNO">Externo</option>
          </select>
        </div>
        {executorTipo === "EXTERNO" && (
          <div>
            <FieldLabel>Fornecedor</FieldLabel>
            <select value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)} style={fieldStyle}>
              <option value="">—</option>
              {fornecedores.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <FieldLabel>Grupo (várias atividades só cumprem no fim)</FieldLabel>
          <input value={grupoNome} onChange={(e) => setGrupoNome(e.target.value)} style={fieldStyle} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <Btn
          type="button"
          disabled={busy || (escopo === "equipamento" ? !equipamentoId : !modeloId)}
          onClick={() =>
            onSave({
              equipamentoId: escopo === "equipamento" ? equipamentoId : undefined,
              modeloId: escopo === "modelo" ? modeloId : undefined,
              tipo,
              tipoCustomNome: tipo === "OUTRO" ? tipoCustomNome : undefined,
              periodicidadeMeses: periodicidadeMeses ? Number(periodicidadeMeses) : undefined,
              fontePeriodicidade: fonte,
              fontePeriodicidadeObs: fonteObs || undefined,
              modoAgendamento: modo,
              diaFixo: modo === "CALENDARIO_FIXO" ? Number(diaFixo) : undefined,
              proximaData: proximaData || undefined,
              antecedenciaDias: Number(antecedencia),
              responsavelId: responsavelId || undefined,
              executorTipo,
              fornecedorId: fornecedorId || undefined,
              grupoNome: grupoNome || undefined,
            })
          }
        >
          Salvar plano
        </Btn>
        <Btn type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Btn>
      </div>
    </Surface>
  );
}

function ReprogramarForm({
  item,
  busy,
  onClose,
  onSave,
}: {
  item: AgendaItem;
  busy: boolean;
  onClose: () => void;
  onSave: (novaData: string, motivo: string) => void;
}) {
  const [novaData, setNovaData] = useState(item.dataPrevista);
  const [motivo, setMotivo] = useState("");
  return (
    <Surface style={{ marginTop: 16 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>
        Reprogramar {item.tag} · original {item.dataPrevistaOriginal} (atraso {item.atrasoDias}d permanece)
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "180px 1fr auto", gap: 10, alignItems: "end" }}>
        <div>
          <FieldLabel>Nova data</FieldLabel>
          <input type="date" value={novaData} onChange={(e) => setNovaData(e.target.value)} style={fieldStyle} />
        </div>
        <div>
          <FieldLabel>Motivo</FieldLabel>
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} style={fieldStyle} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn type="button" disabled={busy || motivo.trim().length < 3} onClick={() => onSave(novaData, motivo)}>
            Confirmar
          </Btn>
          <Btn type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Btn>
        </div>
      </div>
    </Surface>
  );
}
