"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { labelResponsavel } from "@/lib/session";
import { labelStatusOS } from "@/lib/os-ui";
import { useWindowStore } from "@/store/windows";
import { OsFilasNav } from "@/components/os/OsFilasNav";
import { SlaChip } from "@/components/os/SlaChip";
import {
  Badge,
  Btn,
  Empty,
  Err,
  FieldLabel,
  FilterBar,
  PageHeader,
  PriorityBar,
  Surface,
  fieldStyle,
} from "@/components/ui/aion-ui";

type Fila = "nao-atribuidas" | "minhas" | "do-outro" | "em-atendimento" | "aguardando";

interface OsRow {
  id: string;
  numero: number;
  codigo: string;
  status: string;
  prioridade: string;
  atrasada: boolean;
  slaLimite?: string | null;
  slaEstourado?: boolean;
  slaMinutosRestantes?: number;
  destaqueParado?: boolean;
  identificacaoPendente?: boolean;
  pedidoReabertura?: boolean;
  atribuicaoVersao?: number;
  equipamento?: { tag: string; nome: string } | null;
  responsavel?: { id: string; nome: string } | null;
  setor?: { nome: string } | null;
  solicitacao?: { protocolo?: string } | null;
}

interface Colab {
  id: string;
  nome: string;
  funcao?: string | null;
  cargo?: string | null;
}

const FILAS: Array<{ id: Fila; label: string }> = [
  { id: "nao-atribuidas", label: "Não atribuídas" },
  { id: "minhas", label: "Minhas" },
  { id: "do-outro", label: "Do outro" },
  { id: "em-atendimento", label: "Em atendimento" },
  { id: "aguardando", label: "Aguardando" },
];

export default function OsAreaPage() {
  const open = useWindowStore((s) => s.open);
  const [fila, setFila] = useState<Fila>("nao-atribuidas");
  const [items, setItems] = useState<OsRow[]>([]);
  const [total, setTotal] = useState(0);
  const [contagens, setContagens] = useState<Record<string, number>>({});
  const [colabs, setColabs] = useState<Colab[]>([]);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [atrasada, setAtrasada] = useState(false);
  const [prioridade, setPrioridade] = useState("");
  const [setor, setSetor] = useState("");
  const [equipamento, setEquipamento] = useState("");
  const [responsavelId, setResponsavelId] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [sel, setSel] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("fila", fila);
    params.set("pageSize", "50");
    if (q.trim()) params.set("q", q.trim());
    if (atrasada) params.set("atrasada", "1");
    if (prioridade) params.set("prioridade", prioridade);
    if (setor.trim()) params.set("setor", setor.trim());
    if (equipamento.trim()) params.set("equipamento", equipamento.trim());
    if (responsavelId) params.set("responsavelId", responsavelId);
    if (de) params.set("de", de);
    if (ate) params.set("ate", ate);
    const [list, area, responsaveis] = await Promise.all([
      api<{ items: OsRow[]; total: number }>(`/os?${params.toString()}`),
      api<Record<string, number>>("/os/area"),
      api<Colab[]>("/os/responsaveis"),
    ]);
    setItems(list.items);
    setTotal(list.total);
    setContagens(area);
    setColabs(responsaveis);
  }, [fila, q, atrasada, prioridade, setor, equipamento, responsavelId, de, ate]);

  useEffect(() => {
    const t = setTimeout(() => setQ(qInput), 350);
    return () => clearTimeout(t);
  }, [qInput]);

  useEffect(() => {
    setLoading(true);
    void load()
      .catch((e) => setErro(e instanceof Error ? e.message : "Erro"))
      .finally(() => setLoading(false));
  }, [load]);

  async function run(key: string, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(key);
    setErro(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(null);
    }
  }

  function expected(os: OsRow) {
    return {
      expectedResponsavelId: os.responsavel?.id ?? null,
      expectedVersao: os.atribuicaoVersao,
    };
  }

  return (
    <div>
      <PageHeader
        title="Área de trabalho"
        subtitle="Fila do dia — um responsável por OS, sem sobrescrever atribuição de outro"
      />
      <OsFilasNav />

      {erro && <Err>{erro}</Err>}
      {msg && (
        <div style={{ marginBottom: 12, fontSize: 13, fontWeight: 600, color: "oklch(0.45 0.13 150)" }}>{msg}</div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        {FILAS.map((f) => {
          const count =
            f.id === "nao-atribuidas"
              ? contagens.naoAtribuidas
              : f.id === "minhas"
                ? contagens.minhas
                : f.id === "do-outro"
                  ? contagens.doOutro
                  : f.id === "em-atendimento"
                    ? contagens.emAtendimento
                    : contagens.aguardando;
          const active = fila === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFila(f.id)}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: active ? "1px solid oklch(0.7 0.12 255)" : "1px solid oklch(0.9 0.01 250)",
                background: active ? "oklch(0.96 0.03 255)" : "white",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {f.label}
              {count != null ? ` · ${count}` : ""}
            </button>
          );
        })}
      </div>

      <FilterBar>
        <div style={{ gridColumn: "span 2" }}>
          <FieldLabel>Busca (protocolo, patrimônio, equipamento)</FieldLabel>
          <input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="OS-00012, HEF-0044, n° série…"
            style={fieldStyle}
          />
        </div>
        <div>
          <FieldLabel>Destaque</FieldLabel>
          <label style={{ display: "flex", alignItems: "center", gap: 8, height: 38, fontSize: 13 }}>
            <input type="checkbox" checked={atrasada} onChange={(e) => setAtrasada(e.target.checked)} />
            Só atrasadas
          </label>
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
        <div>
          <FieldLabel>Setor</FieldLabel>
          <input value={setor} onChange={(e) => setSetor(e.target.value)} style={fieldStyle} />
        </div>
        <div>
          <FieldLabel>Equipamento</FieldLabel>
          <input value={equipamento} onChange={(e) => setEquipamento(e.target.value)} style={fieldStyle} />
        </div>
        <div>
          <FieldLabel>Responsável</FieldLabel>
          <select value={responsavelId} onChange={(e) => setResponsavelId(e.target.value)} style={fieldStyle}>
            <option value="">Todos</option>
            {colabs.map((c) => (
              <option key={c.id} value={c.id}>
                {labelResponsavel(c)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel>De</FieldLabel>
          <input type="date" value={de} onChange={(e) => setDe(e.target.value)} style={fieldStyle} />
        </div>
        <div>
          <FieldLabel>Até</FieldLabel>
          <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} style={fieldStyle} />
        </div>
      </FilterBar>

      <div style={{ fontSize: 13, color: "oklch(0.5 0.02 250)", marginBottom: 10 }}>
        {loading ? "Carregando…" : `${total} ordem(ns)`}
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {items.map((os) => (
          <Surface
            key={os.id}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr minmax(180px, 240px) auto",
              gap: 12,
              alignItems: "center",
              outline: os.atrasada || os.destaqueParado || os.prioridade === "ALTA" || os.prioridade === "URGENTE"
                ? "1px solid oklch(0.85 0.08 25)"
                : undefined,
            }}
          >
            <button
              type="button"
              onClick={() =>
                open({
                  kind: "os",
                  title: `${os.codigo} — ${os.equipamento?.nome ?? "Chamado"}`,
                  payload: { numero: os.numero, codigo: os.codigo },
                })
              }
              style={{ textAlign: "left", background: "none", border: 0, cursor: "pointer", padding: 0 }}
            >
              <div style={{ display: "flex", alignItems: "center" }}>
                <PriorityBar prioridade={os.prioridade} />
                <div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <strong>{os.codigo}</strong>
                    {os.solicitacao?.protocolo && (
                      <span style={{ fontSize: 12, color: "oklch(0.5 0.02 250)" }}>{os.solicitacao.protocolo}</span>
                    )}
                    <Badge tone={os.status}>{labelStatusOS(os.status)}</Badge>
                    <Badge tone={os.prioridade}>{os.prioridade}</Badge>
                    <SlaChip slaLimite={os.slaLimite} slaEstourado={os.slaEstourado} status={os.status} />
                    {os.atrasada && <Badge tone="ATRASADA">Atrasada</Badge>}
                    {os.destaqueParado && <Badge tone="PARADO">Parado</Badge>}
                    {os.identificacaoPendente && <Badge>Identificar equipamento</Badge>}
                    {os.pedidoReabertura && <Badge tone="URGENTE">Pedido de reabertura</Badge>}
                  </div>
                  <div style={{ fontSize: 13, color: "oklch(0.5 0.02 250)", marginTop: 4 }}>
                    {os.equipamento?.tag ?? "—"} — {os.equipamento?.nome ?? "Chamado do setor"}
                    {os.setor?.nome ? ` · ${os.setor.nome}` : ""}
                    {os.responsavel?.nome ? ` · ${os.responsavel.nome}` : ""}
                  </div>
                </div>
              </div>
            </button>
            <div>
              <FieldLabel>Atribuir / transferir</FieldLabel>
              <select
                value={sel[os.id] ?? ""}
                onChange={(e) => setSel((s) => ({ ...s, [os.id]: e.target.value }))}
                style={fieldStyle}
              >
                <option value="">Selecionar…</option>
                {colabs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {labelResponsavel(c)}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Btn
                size="sm"
                disabled={Boolean(busy)}
                onClick={() =>
                  void run(`a-${os.numero}`, async () => {
                    await api(`/os/${os.numero}/assumir`, {
                      method: "PATCH",
                      body: JSON.stringify(expected(os)),
                    });
                    setMsg(`${os.codigo} assumida`);
                  })
                }
              >
                Assumir
              </Btn>
              <Btn
                size="sm"
                variant="secondary"
                disabled={Boolean(busy) || !sel[os.id]}
                onClick={() =>
                  void run(`t-${os.numero}`, async () => {
                    await api(`/os/${os.numero}/atribuir`, {
                      method: "PATCH",
                      body: JSON.stringify({
                        responsavelId: sel[os.id],
                        ...expected(os),
                      }),
                    });
                    setMsg(`${os.codigo} atribuída`);
                  })
                }
              >
                Atribuir
              </Btn>
            </div>
          </Surface>
        ))}
        {!loading && items.length === 0 && <Empty text="Nenhuma OS nesta fila." />}
      </div>
    </div>
  );
}
