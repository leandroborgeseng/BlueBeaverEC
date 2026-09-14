"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import {
  AVISO_NAO_CONFORMIDADE_REGULATORIA,
  LABEL_STATUS_DOCUMENTO,
  LABEL_STATUS_OCORRENCIA,
  LABEL_TIPO_ALERTA,
  LABEL_TIPO_OCORRENCIA,
  LABEL_TIPO_TREINAMENTO,
} from "@aion/shared";
import { api, downloadApi } from "@/lib/api";
import { PERMISSAO_NIVEL } from "@aion/shared";
import { useCan } from "@/lib/session";
import {
  Badge,
  Btn,
  Empty,
  Err,
  FieldLabel,
  FilterBar,
  KpiCard,
  PageHeader,
  Panel,
  fieldStyle,
} from "@/components/ui/aion-ui";
import { QualidadeTabs, fmtData } from "./tabs";

type Resumo = {
  vigentes: number;
  treinamentos: number;
  ocorrenciasAbertas: number;
  alertasAbertos: number;
};

type Busca = {
  documentos: Array<{
    id: string;
    codigo: string;
    titulo: string;
    categoria: string;
    versoes: Array<{ versao: string; status: string }>;
  }>;
  treinamentos: Array<{
    id: string;
    codigo: string;
    tema: string;
    tipo: string;
    data: string;
    instrutorNome: string;
  }>;
  ocorrencias: Array<{
    id: string;
    codigo: string;
    tipo: string;
    status: string;
    dataOcorrido: string;
    equipamento?: { tag: string } | null;
  }>;
  alertas: Array<{
    id: string;
    codigo: string;
    tipo: string;
    titulo: string;
    status: string;
  }>;
};

type Opt = { id: string; nome: string; tag?: string };

export default function QualidadePage() {
  const canExport = useCan("auditorias", PERMISSAO_NIVEL.EDICAO);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [busca, setBusca] = useState<Busca | null>(null);
  const [setores, setSetores] = useState<Opt[]>([]);
  const [equips, setEquips] = useState<Opt[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState("");
  const [setorId, setSetorId] = useState("");
  const [equipamentoId, setEquipamentoId] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");

  async function loadBase() {
    const [r, s, e] = await Promise.all([
      api<Resumo>("/qualidade/resumo"),
      api<Opt[]>("/setores"),
      api<{ items: Opt[] }>("/equipamentos?pageSize=50"),
    ]);
    setResumo(r);
    setSetores(s);
    setEquips(e.items ?? []);
  }

  async function pesquisar(e?: FormEvent) {
    e?.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (tipo) params.set("tipo", tipo);
    if (setorId) params.set("setorId", setorId);
    if (equipamentoId) params.set("equipamentoId", equipamentoId);
    if (de) params.set("de", de);
    if (ate) params.set("ate", ate);
    setBusca(await api<Busca>(`/qualidade/busca?${params.toString()}`));
  }

  async function exportar() {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (tipo) params.set("tipo", tipo);
    if (setorId) params.set("setorId", setorId);
    if (equipamentoId) params.set("equipamentoId", equipamentoId);
    if (de) params.set("de", de);
    if (ate) params.set("ate", ate);
    await downloadApi(`/qualidade/export?${params.toString()}`, undefined, "qualidade.xlsx");
  }

  useEffect(() => {
    void loadBase()
      .then(() => pesquisar())
      .catch((err: Error) => setErro(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <PageHeader
        title="Documentos, treinamentos e segurança"
        subtitle={AVISO_NAO_CONFORMIDADE_REGULATORIA}
        actions={
          canExport ? (
            <Btn variant="secondary" onClick={() => void exportar()}>
              Exportar (autoria e datas)
            </Btn>
          ) : null
        }
      />
      <QualidadeTabs />
      {erro && <Err>{erro}</Err>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, marginBottom: 16 }}>
        <KpiCard
          label="Documentos vigentes"
          value={resumo?.vigentes ?? "—"}
          hint={<Link href="/qualidade/documentos">Localizar vigente</Link>}
        />
        <KpiCard
          label="Treinamentos"
          value={resumo?.treinamentos ?? "—"}
          hint={<Link href="/qualidade/treinamentos">Comprovar presença</Link>}
        />
        <KpiCard
          label="Ocorrências em curso"
          value={resumo?.ocorrenciasAbertas ?? "—"}
          hint={<Link href="/qualidade/ocorrencias">Acompanhar até concluir</Link>}
          tone={(resumo?.ocorrenciasAbertas ?? 0) > 0 ? "warning" : "neutral"}
        />
        <KpiCard
          label="Alertas em aberto"
          value={resumo?.alertasAbertos ?? "—"}
          hint="Registro manual — sem envio automático"
        />
      </div>

      <Panel title="Busca por equipamento, período, setor ou tipo">
        <form onSubmit={(e) => void pesquisar(e)}>
          <FilterBar>
            <div style={{ flex: 1, minWidth: 180 }}>
              <FieldLabel>Texto</FieldLabel>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Código, título, tema…" style={fieldStyle} />
            </div>
            <div>
              <FieldLabel>Tipo</FieldLabel>
              <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={fieldStyle}>
                <option value="">Todos</option>
                <option value="DOCUMENTO">Documento</option>
                <option value="TREINAMENTO">Treinamento</option>
                <option value="OCORRENCIA">Ocorrência</option>
                <option value="FALHA">Falha</option>
                <option value="INCIDENTE">Incidente</option>
                <option value="SUSPEITA_EVENTO_ADVERSO">Suspeita de evento adverso</option>
                <option value="ALERTA">Alerta de campo</option>
                <option value="ALERTA_FABRICANTE">Alerta do fabricante</option>
                <option value="RECOLHIMENTO">Recolhimento</option>
                <option value="ACAO_DE_CAMPO">Ação de campo</option>
              </select>
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
              <FieldLabel>Equipamento</FieldLabel>
              <select value={equipamentoId} onChange={(e) => setEquipamentoId(e.target.value)} style={fieldStyle}>
                <option value="">Todos</option>
                {equips.map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {eq.tag} · {eq.nome}
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
            <Btn type="submit">Buscar</Btn>
          </FilterBar>
        </form>
      </Panel>

      {!busca ? (
        <Empty text="Carregando busca…" />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
          <Panel title="Documentos">
            {busca.documentos.length === 0 && <Empty text="Nenhum documento neste filtro." />}
            {busca.documentos.map((d) => {
              const vig = d.versoes.find((v) => v.status === "VIGENTE");
              return (
                <div key={d.id} style={{ borderTop: "1px solid oklch(0.93 0.005 255)", padding: "10px 0" }}>
                  <Link href="/qualidade/documentos">{d.codigo}</Link> · {d.titulo}
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    <Badge tone={vig?.status ?? "RASCUNHO"}>
                      {vig
                        ? `Vigente ${vig.versao}`
                        : LABEL_STATUS_DOCUMENTO[(d.versoes[0]?.status as keyof typeof LABEL_STATUS_DOCUMENTO) ?? "RASCUNHO"] ??
                          "Sem vigente"}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </Panel>
          <Panel title="Treinamentos">
            {busca.treinamentos.length === 0 && <Empty text="Nenhum treinamento neste filtro." />}
            {busca.treinamentos.map((t) => (
              <div key={t.id} style={{ borderTop: "1px solid oklch(0.93 0.005 255)", padding: "10px 0" }}>
                <Link href="/qualidade/treinamentos">{t.codigo}</Link> · {t.tema}
                <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)" }}>
                  {LABEL_TIPO_TREINAMENTO[t.tipo as keyof typeof LABEL_TIPO_TREINAMENTO] ?? t.tipo} · {fmtData(t.data)} ·{" "}
                  {t.instrutorNome}
                </div>
              </div>
            ))}
          </Panel>
          <Panel title="Ocorrências">
            {busca.ocorrencias.length === 0 && <Empty text="Nenhuma ocorrência neste filtro." />}
            {busca.ocorrencias.map((o) => (
              <div key={o.id} style={{ borderTop: "1px solid oklch(0.93 0.005 255)", padding: "10px 0" }}>
                <Link href="/qualidade/ocorrencias">{o.codigo}</Link> · {o.equipamento?.tag ?? "sem tag"}
                <div style={{ fontSize: 12, marginTop: 4, display: "flex", gap: 6 }}>
                  <Badge tone={o.tipo}>{LABEL_TIPO_OCORRENCIA[o.tipo as keyof typeof LABEL_TIPO_OCORRENCIA] ?? o.tipo}</Badge>
                  <Badge tone={o.status}>
                    {LABEL_STATUS_OCORRENCIA[o.status as keyof typeof LABEL_STATUS_OCORRENCIA] ?? o.status}
                  </Badge>
                </div>
              </div>
            ))}
          </Panel>
          <Panel title="Alertas de campo">
            {busca.alertas.length === 0 && <Empty text="Nenhum alerta neste filtro." />}
            {busca.alertas.map((a) => (
              <div key={a.id} style={{ borderTop: "1px solid oklch(0.93 0.005 255)", padding: "10px 0" }}>
                <Link href="/qualidade/alertas">{a.codigo}</Link> · {a.titulo}
                <div style={{ fontSize: 12, marginTop: 4 }}>
                  <Badge>{LABEL_TIPO_ALERTA[a.tipo as keyof typeof LABEL_TIPO_ALERTA] ?? a.tipo}</Badge> · {a.status}
                </div>
              </div>
            ))}
          </Panel>
        </div>
      )}
    </div>
  );
}
