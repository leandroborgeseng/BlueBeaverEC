"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, downloadApi } from "@/lib/api";
import { useCan, useSession } from "@/lib/session";
import {
  LABEL_CONDICAO_USO,
  LABEL_MOVIMENTACAO,
  LABEL_PROPRIEDADE,
  LABEL_SITUACAO_CICLO,
  LABEL_STATUS_OS,
  type CondicaoUsoEquipamento,
  type PropriedadeEquipamento,
  type SituacaoEquipamento,
  type TipoMovimentacaoEquipamento,
} from "@aion/shared";
import { labelCondicaoUso, labelStatusOS } from "@/lib/os-ui";
import {
  Badge,
  Btn,
  Empty,
  Err,
  FieldLabel,
  KpiCard,
  PageHeader,
  Panel,
  Surface,
  fieldStyle,
} from "@/components/ui/aion-ui";

interface Lookup {
  id: string;
  nome: string;
}

interface DocMeta {
  id: string;
  tipo: string;
  nomeArquivo: string;
  mimeType: string;
  descricao?: string | null;
  createdAt: string;
}

interface Pagina {
  tag: string;
  nome: string;
  situacao: SituacaoEquipamento;
  condicaoUso: CondicaoUsoEquipamento;
  patrimonio?: string | null;
  nSerie?: string | null;
  idInterna?: string | null;
  unidade?: string | null;
  localizacaoFisica?: string | null;
  propriedade: PropriedadeEquipamento;
  propriedadeOutra?: string | null;
  observacao?: string | null;
  valorAquisicao?: number | string | null;
  valorSubstituicao?: number | string | null;
  dataAquisicao?: string | null;
  dataInstalacao?: string | null;
  garantiaInicio?: string | null;
  garantiaFim?: string | null;
  garantiaVigente?: boolean;
  criticidade?: string;
  criticidadeJustificativa?: string | null;
  registroAnvisa?: string | null;
  validadeAnvisa?: string | null;
  centroCustoId?: string | null;
  centroCusto?: { id: string; nome: string; codigo?: string } | null;
  dataRecebimento?: string | null;
  dataEntradaOperacao?: string | null;
  dataDesativacao?: string | null;
  motivoDesativacao?: string | null;
  checklistRecebimentoPendente?: boolean;
  setor?: { id: string; nome: string };
  fabricante?: { id: string; nome: string };
  modelo?: { id: string; nome: string };
  descricao?: { nome: string; criticidade: string };
  fornecedor?: { nome: string } | null;
  criticidadeResponsavel?: { id: string; nome: string } | null;
  osAbertas: Array<{ numero: number; codigo?: string | null; tipo: string; status: string; prioridade: string; abertura: string }>;
  osHistorico: Array<{
    numero: number;
    codigo?: string | null;
    tipo: string;
    status: string;
    abertura: string;
    servicoRealizado?: string | null;
  }>;
  movimentacoes: Array<{
    id: string;
    tipo: TipoMovimentacaoEquipamento;
    data: string;
    motivo: string;
    responsavelNome: string;
    origemSetor?: { nome: string } | null;
    destinoSetor?: { nome: string } | null;
    origemLocalizacao?: string | null;
    destinoLocalizacao?: string | null;
  }>;
  documentos: DocMeta[];
  eventosCiclo: Array<{
    id: string;
    tipo: string;
    data: string;
    observacao?: string | null;
    documento?: { id: string; nomeArquivo: string } | null;
  }>;
  custos: { totalOS: number; nOS: number; externoInformado?: number; externoAprovado?: number; externoRealizado?: number };
  cobertura?: {
    garantiaAquisicao: { vigente: boolean; inicio?: string | null; fim?: string | null };
    contratosManutencao: Array<{
      numero: string;
      fornecedor: string;
      vigente: boolean;
      cobrePecas: boolean;
      cobreServicos: boolean;
      escopo?: string | null;
      exclusoes?: string | null;
      vigenciaFim: string;
    }>;
  };
  atendimentosExternos?: Array<{
    id: string;
    status: string;
    fornecedor: string;
    osNumero: number;
    foraDoHospital: boolean;
    pendenciaRetorno: boolean;
    custoInformado?: string | number | null;
    custoAprovado?: string | number | null;
    custoRealizado?: string | number | null;
  }>;
  localizacaoAssistencia?: { foraDoHospital: boolean; pendenciaRetorno: boolean; status: string; fornecedor: string } | null;
}

type Tab = "resumo" | "cadastro" | "os" | "docs" | "mov" | "ciclo";

function iso(v?: string | null) {
  return v ? String(v).slice(0, 10) : "";
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export default function EquipamentoPagina() {
  const params = useParams<{ tag: string }>();
  const router = useRouter();
  const tag = decodeURIComponent(params.tag);
  const podeEditar = useCan("equipamentos", 3);
  const podeOs = useCan("os", 3);
  const verValores = Boolean(useSession()?.permissoes?.verValoresFinanceiros);
  const [tab, setTab] = useState<Tab>("resumo");
  const [data, setData] = useState<Pagina | null>(null);
  const [setores, setSetores] = useState<Lookup[]>([]);
  const [cols, setCols] = useState<Lookup[]>([]);
  const [centros, setCentros] = useState<Array<Lookup & { codigo?: string }>>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const eq = await api<Pagina>(`/equipamentos/${encodeURIComponent(tag)}/pagina`);
    setData(eq);
  }, [tag]);

  useEffect(() => {
    void load().catch((e) => setErro(e instanceof Error ? e.message : "Erro"));
    void Promise.all([api<Lookup[]>("/setores"), api<Lookup[]>("/colaboradores"), api<(Lookup & { codigo?: string })[]>("/centros-custo")])
      .then(([s, c, cc]) => {
        setSetores(s);
        setCols(c);
        setCentros(cc);
      })
      .catch(() => undefined);
  }, [load]);

  async function salvarCadastro(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!data) return;
    const fd = new FormData(e.currentTarget);
    try {
      const novaTag = String(fd.get("tag") ?? tag).trim();
      if (!novaTag) {
        setErro("TAG obrigatória");
        return;
      }
      await api(`/equipamentos/${encodeURIComponent(tag)}`, {
        method: "PATCH",
        body: JSON.stringify({
          tag: novaTag,
          nome: String(fd.get("nome")),
          patrimonio: String(fd.get("patrimonio") ?? ""),
          nSerie: String(fd.get("nSerie") ?? ""),
          idInterna: String(fd.get("idInterna") ?? ""),
          unidade: String(fd.get("unidade") ?? ""),
          localizacaoFisica: String(fd.get("localizacaoFisica") ?? ""),
          propriedade: String(fd.get("propriedade")),
          propriedadeOutra: String(fd.get("propriedadeOutra") ?? ""),
          setorId: String(fd.get("setorId")),
          observacao: String(fd.get("observacao") ?? ""),
          condicaoUso: String(fd.get("condicaoUso")),
          situacao: String(fd.get("situacao")),
          dataAquisicao: String(fd.get("dataAquisicao") || "") || null,
          dataInstalacao: String(fd.get("dataInstalacao") || "") || null,
          valorAquisicao: verValores && fd.get("valorAquisicao") ? Number(fd.get("valorAquisicao")) : undefined,
          valorSubstituicao: verValores && fd.get("valorSubstituicao") ? Number(fd.get("valorSubstituicao")) : undefined,
          garantiaInicio: String(fd.get("garantiaInicio") || "") || null,
          garantiaFim: String(fd.get("garantiaFim") || "") || null,
          registroAnvisa: String(fd.get("registroAnvisa") ?? ""),
          validadeAnvisa: String(fd.get("validadeAnvisa") || "") || null,
          centroCustoId: String(fd.get("centroCustoId") || "") || null,
          criticidadeEquipamento: String(fd.get("criticidadeEquipamento") || "") || null,
          criticidadeJustificativa: String(fd.get("criticidadeJustificativa") ?? ""),
          criticidadeResponsavelId: String(fd.get("criticidadeResponsavelId") || "") || null,
        }),
      });
      setMsg("Cadastro atualizado");
      if (novaTag !== tag) {
        router.replace(`/equipamentos/${encodeURIComponent(novaTag)}`);
        return;
      }
      await load();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro");
    }
  }

  async function enviarMov(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await api(`/equipamentos/${encodeURIComponent(tag)}/movimentacoes`, {
        method: "POST",
        body: JSON.stringify({
          tipo: String(fd.get("tipo")),
          destinoSetorId: String(fd.get("destinoSetorId") || "") || undefined,
          destinoLocalizacao: String(fd.get("destinoLocalizacao") || "") || undefined,
          data: String(fd.get("data") || "") || undefined,
          responsavelId: String(fd.get("responsavelId") || "") || undefined,
          responsavelNome: String(fd.get("responsavelNome") || "") || undefined,
          motivo: String(fd.get("motivo")),
        }),
      });
      setMsg("Movimentação registrada");
      (e.target as HTMLFormElement).reset();
      await load();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro");
    }
  }

  async function enviarDoc(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const file = fd.get("arquivo") as File | null;
    if (!file?.size) {
      setErro("Selecione um arquivo");
      return;
    }
    try {
      await api(`/equipamentos/${encodeURIComponent(tag)}/documentos`, {
        method: "POST",
        body: JSON.stringify({
          tipo: String(fd.get("tipo")),
          dataUrl: await fileToDataUrl(file),
          nomeArquivo: file.name,
          descricao: String(fd.get("descricao") || ""),
        }),
      });
      setMsg("Documento anexado");
      (e.target as HTMLFormElement).reset();
      await load();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro");
    }
  }

  async function enviarCiclo(tipo: "RECEBIMENTO" | "ENTRADA_OPERACAO" | "DESATIVACAO", form: HTMLFormElement) {
    const fd = new FormData(form);
    const file = fd.get("arquivo") as File | null;
    try {
      await api(`/equipamentos/${encodeURIComponent(tag)}/ciclo`, {
        method: "POST",
        body: JSON.stringify({
          tipo,
          data: String(fd.get("data") || "") || undefined,
          observacao: String(fd.get("observacao") || ""),
          motivoDesativacao: String(fd.get("motivoDesativacao") || "") || undefined,
          documento: file?.size
            ? { dataUrl: await fileToDataUrl(file), nomeArquivo: file.name }
            : undefined,
        }),
      });
      setMsg("Evento de ciclo registrado");
      form.reset();
      await load();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro");
    }
  }

  if (erro && !data) return <Err>{erro}</Err>;
  if (!data) return <div style={{ color: "oklch(0.5 0.02 250)" }}>Carregando ficha…</div>;

  const readonly = data.situacao === "ARQUIVADO";
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "resumo", label: "Resumo" },
    { id: "cadastro", label: "Cadastro" },
    { id: "os", label: "OS" },
    { id: "docs", label: "Documentos" },
    { id: "mov", label: "Movimentações" },
    { id: "ciclo", label: "Ciclo de vida" },
  ];

  return (
    <div>
      <PageHeader
        title={`${data.tag} · ${data.nome}`}
        subtitle={`${data.setor?.nome ?? "—"} · ${data.fabricante?.nome ?? ""} ${data.modelo?.nome ?? ""}`}
        actions={
          <>
            {podeOs && (
              <Btn href={`/os/nova?tag=${encodeURIComponent(data.tag)}`} variant="primary">
                Abrir OS
              </Btn>
            )}
            <Btn href={`/equipamentos/${encodeURIComponent(data.tag)}/etiqueta`} variant="secondary">
              Etiqueta / QR
            </Btn>
            <Btn href={`/equipamentos/${encodeURIComponent(data.tag)}/ficha-vida`} variant="ghost">
              Ficha de vida
            </Btn>
          </>
        }
      />

      {erro && <Err>{erro}</Err>}
      {msg && <div style={{ marginBottom: 10, fontSize: 13, fontWeight: 600, color: "oklch(0.4 0.14 150)" }}>{msg}</div>}

      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid oklch(0.91 0.006 255)", marginBottom: 16 }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            style={{
              padding: "8px 14px",
              border: "none",
              borderBottom: tab === t.id ? "2px solid oklch(0.64 0.19 38)" : "2px solid transparent",
              background: "transparent",
              fontWeight: tab === t.id ? 700 : 500,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "resumo" && (
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            <KpiCard label="Condição operacional" value={labelCondicaoUso(data.condicaoUso)} tone="info" />
            <KpiCard
              label="Ciclo de vida"
              value={LABEL_SITUACAO_CICLO[data.situacao] ?? data.situacao}
              tone="neutral"
            />
            <KpiCard
              label="Garantia"
              value={data.garantiaVigente ? "Vigente" : data.garantiaFim ? "Encerrada" : "—"}
              tone={data.garantiaVigente ? "success" : "warning"}
            />
            <KpiCard
              label="Custos em OS"
              value={data.custos.totalOS.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              hint={`${data.custos.nOS} ordens`}
              tone="success"
            />
          </div>
          {data.localizacaoAssistencia && (
            <Panel title="Localização / assistência">
              <div style={{ fontSize: 13 }}>
                {data.localizacaoAssistencia.foraDoHospital ? "Fora do hospital" : "No hospital"} ·{" "}
                {data.localizacaoAssistencia.fornecedor} · {data.localizacaoAssistencia.status}
                {data.localizacaoAssistencia.pendenciaRetorno ? " · pendência de retorno" : ""}
              </div>
            </Panel>
          )}
          <Panel title="Cobertura — garantia de aquisição ≠ contrato de manutenção">
            <div style={{ fontSize: 13, display: "grid", gap: 8 }}>
              <div>
                <strong>Garantia de aquisição:</strong>{" "}
                {data.cobertura?.garantiaAquisicao.vigente ? "Vigente" : "Não vigente"}
                {data.garantiaFim ? ` até ${new Date(data.garantiaFim).toLocaleDateString("pt-BR")}` : ""}
              </div>
              {(data.cobertura?.contratosManutencao.length ?? 0) === 0 ? (
                <div>Sem contrato de manutenção vinculado.</div>
              ) : (
                data.cobertura!.contratosManutencao.map((c) => (
                  <div key={c.numero}>
                    <strong>Contrato {c.numero}</strong> · {c.fornecedor} · {c.vigente ? "vigente" : "encerrado"} ·
                    peças {c.cobrePecas ? "sim" : "não"} / serviços {c.cobreServicos ? "sim" : "não"}
                    {c.escopo ? ` · escopo: ${c.escopo}` : ""}
                    {c.exclusoes ? ` · exclusões: ${c.exclusoes}` : ""}
                  </div>
                ))
              )}
              <div>
                Externo informado{" "}
                {(data.custos.externoInformado ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}{" "}
                · aprovado{" "}
                {(data.custos.externoAprovado ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}{" "}
                · realizado{" "}
                {(data.custos.externoRealizado ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </div>
              {(data.atendimentosExternos ?? []).map((a) => (
                <div key={a.id}>
                  OS {a.osNumero} · {a.fornecedor} · {a.status}
                  {a.foraDoHospital ? " · fora" : ""}
                  {a.pendenciaRetorno ? " · retorno pendente" : ""}
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Identificação">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, fontSize: 13 }}>
              <div>
                <strong>Patrimônio</strong>
                <div>{data.patrimonio || "—"}</div>
              </div>
              <div>
                <strong>Série</strong>
                <div>{data.nSerie || "—"}</div>
              </div>
              <div>
                <strong>ID interna</strong>
                <div>{data.idInterna || "—"}</div>
              </div>
              <div>
                <strong>Unidade</strong>
                <div>{data.unidade || "—"}</div>
              </div>
              <div>
                <strong>Localização física</strong>
                <div>{data.localizacaoFisica || "—"}</div>
              </div>
              <div>
                <strong>Setor responsável</strong>
                <div>{data.setor?.nome || "—"}</div>
              </div>
              <div>
                <strong>Propriedade</strong>
                <div>
                  {LABEL_PROPRIEDADE[data.propriedade] ?? data.propriedade}
                  {data.propriedadeOutra ? ` · ${data.propriedadeOutra}` : ""}
                </div>
              </div>
              <div>
                <strong>Criticidade</strong>
                <div>{data.criticidade ?? data.descricao?.criticidade ?? "—"}</div>
              </div>
              <div>
                <strong>Fornecedor</strong>
                <div>{data.fornecedor?.nome || "—"}</div>
              </div>
              <div>
                <strong>Centro de custo</strong>
                <div>
                  {data.centroCusto
                    ? data.centroCusto.codigo
                      ? `${data.centroCusto.codigo} — ${data.centroCusto.nome}`
                      : data.centroCusto.nome
                    : "—"}
                </div>
              </div>
              <div>
                <strong>ANVISA</strong>
                <div>
                  {data.registroAnvisa || "—"}
                  {data.validadeAnvisa ? ` · val. ${new Date(data.validadeAnvisa).toLocaleDateString("pt-BR")}` : ""}
                </div>
              </div>
              <div>
                <strong>Instalação</strong>
                <div>{data.dataInstalacao ? new Date(data.dataInstalacao).toLocaleDateString("pt-BR") : "—"}</div>
              </div>
              {verValores && (
                <div>
                  <strong>Substituição</strong>
                  <div>
                    {data.valorSubstituicao != null
                      ? Number(data.valorSubstituicao).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                      : "—"}
                  </div>
                </div>
              )}
            </div>
          </Panel>
          <Panel title={`OS abertas (${data.osAbertas.length})`}>
            {data.osAbertas.length === 0 ? (
              <Empty text="Nenhuma OS aberta" />
            ) : (
              data.osAbertas.map((o) => (
                <div key={o.numero} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontSize: 13 }}>
                  <a href={`/os`} style={{ fontWeight: 700 }}>
                    {o.codigo ?? `OS-${o.numero}`} · {o.tipo}
                  </a>
                  <Badge tone={o.status}>{labelStatusOS(o.status)}</Badge>
                </div>
              ))
            )}
          </Panel>
        </div>
      )}

      {tab === "cadastro" && (
        <Surface>
          <form onSubmit={(e) => void salvarCadastro(e)} style={{ display: "grid", gap: 12 }}>
            <p style={{ margin: 0, fontSize: 13, color: "oklch(0.5 0.02 250)" }}>
              Condição operacional e situação de ciclo são campos separados. Fechar OS não muda a condição sozinha.
            </p>
            <div>
              <FieldLabel>TAG</FieldLabel>
              <input
                name="tag"
                defaultValue={data.tag}
                disabled={readonly}
                required
                placeholder="Ex.: HEF-CME-001"
                style={{ ...fieldStyle, fontWeight: 700, letterSpacing: "0.04em" }}
              />
              <div style={{ marginTop: 6, fontSize: 12, color: "oklch(0.5 0.02 250)" }}>
                Livre para vocês definirem. Só não pode repetir outra TAG desta instituição.
              </div>
            </div>
            <div>
              <FieldLabel>Nome</FieldLabel>
              <input name="nome" defaultValue={data.nome} disabled={readonly} style={fieldStyle} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <div>
                <FieldLabel>Patrimônio</FieldLabel>
                <input name="patrimonio" defaultValue={data.patrimonio ?? ""} disabled={readonly} style={fieldStyle} />
              </div>
              <div>
                <FieldLabel>Nº série</FieldLabel>
                <input name="nSerie" defaultValue={data.nSerie ?? ""} disabled={readonly} style={fieldStyle} />
              </div>
              <div>
                <FieldLabel>ID interna</FieldLabel>
                <input name="idInterna" defaultValue={data.idInterna ?? ""} disabled={readonly} style={fieldStyle} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <div>
                <FieldLabel>Unidade</FieldLabel>
                <input name="unidade" defaultValue={data.unidade ?? ""} disabled={readonly} style={fieldStyle} />
              </div>
              <div>
                <FieldLabel>Localização física</FieldLabel>
                <input
                  name="localizacaoFisica"
                  defaultValue={data.localizacaoFisica ?? ""}
                  disabled={readonly}
                  style={fieldStyle}
                />
              </div>
              <div>
                <FieldLabel>Setor responsável</FieldLabel>
                <select name="setorId" defaultValue={data.setor?.id} disabled={readonly} style={fieldStyle}>
                  {setores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nome}
                    </option>
                  ))}
                </select>
                <div style={{ marginTop: 6, fontSize: 12, color: "oklch(0.5 0.02 250)" }}>
                  Trocar o setor grava uma transferência no transporte.
                </div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <div>
                <FieldLabel>Propriedade</FieldLabel>
                <select name="propriedade" defaultValue={data.propriedade} disabled={readonly} style={fieldStyle}>
                  {(Object.keys(LABEL_PROPRIEDADE) as PropriedadeEquipamento[]).map((k) => (
                    <option key={k} value={k}>
                      {LABEL_PROPRIEDADE[k]}
                    </option>
                  ))}
                </select>
                <input
                  name="propriedadeOutra"
                  defaultValue={data.propriedadeOutra ?? ""}
                  placeholder="Outra classificação"
                  disabled={readonly}
                  style={{ ...fieldStyle, marginTop: 8 }}
                />
              </div>
              <div>
                <FieldLabel>Condição operacional</FieldLabel>
                <select name="condicaoUso" defaultValue={data.condicaoUso} disabled={readonly} style={fieldStyle}>
                  {(Object.keys(LABEL_CONDICAO_USO) as CondicaoUsoEquipamento[]).map((k) => (
                    <option key={k} value={k}>
                      {LABEL_CONDICAO_USO[k]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <FieldLabel>Situação (ciclo)</FieldLabel>
                <select name="situacao" defaultValue={data.situacao} disabled={readonly} style={fieldStyle}>
                  {(Object.keys(LABEL_SITUACAO_CICLO) as SituacaoEquipamento[]).map((k) => (
                    <option key={k} value={k}>
                      {LABEL_SITUACAO_CICLO[k]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <div>
                <FieldLabel>Aquisição</FieldLabel>
                <input name="dataAquisicao" type="date" defaultValue={iso(data.dataAquisicao)} disabled={readonly} style={fieldStyle} />
              </div>
              <div>
                <FieldLabel>Instalação</FieldLabel>
                <input name="dataInstalacao" type="date" defaultValue={iso(data.dataInstalacao)} disabled={readonly} style={fieldStyle} />
              </div>
              <div>
                <FieldLabel>Criticidade</FieldLabel>
                <select name="criticidadeEquipamento" defaultValue={data.criticidade ?? ""} disabled={readonly} style={fieldStyle}>
                  <option value="">Herdar do tipo</option>
                  <option value="BAIXA">Baixa</option>
                  <option value="MEDIA">Média</option>
                  <option value="ALTA">Alta</option>
                </select>
              </div>
            </div>
            {verValores && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <FieldLabel>Valor de aquisição</FieldLabel>
                  <input
                    name="valorAquisicao"
                    type="number"
                    step="0.01"
                    defaultValue={data.valorAquisicao != null ? String(data.valorAquisicao) : ""}
                    disabled={readonly}
                    style={fieldStyle}
                  />
                </div>
                <div>
                  <FieldLabel>Valor de substituição</FieldLabel>
                  <input
                    name="valorSubstituicao"
                    type="number"
                    step="0.01"
                    defaultValue={data.valorSubstituicao != null ? String(data.valorSubstituicao) : ""}
                    disabled={readonly}
                    style={fieldStyle}
                  />
                </div>
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <div>
                <FieldLabel>Centro de custo</FieldLabel>
                <select name="centroCustoId" defaultValue={data.centroCustoId ?? data.centroCusto?.id ?? ""} disabled={readonly} style={fieldStyle}>
                  <option value="">Nenhum</option>
                  {centros.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.codigo ? `${c.codigo} — ${c.nome}` : c.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <FieldLabel>Reg. ANVISA</FieldLabel>
                <input name="registroAnvisa" defaultValue={data.registroAnvisa ?? ""} disabled={readonly} style={fieldStyle} />
              </div>
              <div>
                <FieldLabel>Validade ANVISA</FieldLabel>
                <input name="validadeAnvisa" type="date" defaultValue={iso(data.validadeAnvisa)} disabled={readonly} style={fieldStyle} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <FieldLabel>Garantia início</FieldLabel>
                <input name="garantiaInicio" type="date" defaultValue={iso(data.garantiaInicio)} disabled={readonly} style={fieldStyle} />
              </div>
              <div>
                <FieldLabel>Garantia fim</FieldLabel>
                <input name="garantiaFim" type="date" defaultValue={iso(data.garantiaFim)} disabled={readonly} style={fieldStyle} />
              </div>
            </div>
            <div>
              <FieldLabel>Justificativa da criticidade</FieldLabel>
              <textarea
                name="criticidadeJustificativa"
                defaultValue={data.criticidadeJustificativa ?? ""}
                disabled={readonly}
                rows={2}
                style={fieldStyle}
              />
            </div>
            <div>
              <FieldLabel>Responsável pela criticidade</FieldLabel>
              <select name="criticidadeResponsavelId" defaultValue={data.criticidadeResponsavel?.id ?? ""} disabled={readonly} style={fieldStyle}>
                <option value="">—</option>
                {cols.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>Observação</FieldLabel>
              <textarea name="observacao" defaultValue={data.observacao ?? ""} disabled={readonly} rows={3} style={fieldStyle} />
            </div>
            {podeEditar && !readonly && <Btn type="submit">Salvar cadastro</Btn>}
          </form>
        </Surface>
      )}

      {tab === "os" && (
        <Panel title="Histórico de OS">
          {data.osHistorico.length === 0 ? (
            <Empty text="Nenhuma OS neste equipamento" />
          ) : (
            data.osHistorico.map((o) => (
              <div key={o.numero} style={{ padding: "10px 0", borderBottom: "1px solid oklch(0.94 0.005 255)", fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <strong>
                    {o.codigo ?? `OS-${o.numero}`} · {o.tipo}
                  </strong>
                  <Badge tone={o.status}>{LABEL_STATUS_OS[o.status as keyof typeof LABEL_STATUS_OS] ?? o.status}</Badge>
                </div>
                <div style={{ color: "oklch(0.5 0.02 250)", marginTop: 4 }}>
                  {new Date(o.abertura).toLocaleString("pt-BR")}
                  {o.servicoRealizado ? ` · ${o.servicoRealizado}` : ""}
                </div>
              </div>
            ))
          )}
        </Panel>
      )}

      {tab === "docs" && (
        <div style={{ display: "grid", gap: 14 }}>
          {podeEditar && !readonly && (
            <Surface>
              <form onSubmit={(e) => void enviarDoc(e)} style={{ display: "grid", gap: 10 }}>
                <strong>Anexar foto ou manual</strong>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
                  <select name="tipo" style={fieldStyle}>
                    <option value="FOTO">Foto</option>
                    <option value="MANUAL">Manual</option>
                    <option value="GARANTIA">Garantia</option>
                    <option value="NOTA_FISCAL">Nota fiscal</option>
                    <option value="OUTRO">Outro</option>
                  </select>
                  <input name="descricao" placeholder="Descrição" style={fieldStyle} />
                </div>
                <input name="arquivo" type="file" accept="image/*,.pdf" />
                <Btn type="submit">Enviar</Btn>
              </form>
            </Surface>
          )}
          <Panel title="Documentos">
            {data.documentos.length === 0 ? (
              <Empty text="Nenhum documento" />
            ) : (
              data.documentos.map((d) => (
                <div key={d.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontSize: 13 }}>
                  <span>
                    <Badge>{d.tipo}</Badge> {d.nomeArquivo}
                  </span>
                  <Btn
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void downloadApi(
                        `/equipamentos/${encodeURIComponent(tag)}/documentos/${d.id}`,
                        undefined,
                        d.nomeArquivo,
                      )
                    }
                  >
                    Baixar
                  </Btn>
                </div>
              ))
            )}
          </Panel>
        </div>
      )}

      {tab === "mov" && (
        <div style={{ display: "grid", gap: 14 }}>
          {podeEditar && !readonly && (
            <Surface>
              <form onSubmit={(e) => void enviarMov(e)} style={{ display: "grid", gap: 10 }}>
                <strong>Nova movimentação</strong>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <select name="tipo" style={fieldStyle}>
                    {(Object.keys(LABEL_MOVIMENTACAO) as TipoMovimentacaoEquipamento[]).map((k) => (
                      <option key={k} value={k}>
                        {LABEL_MOVIMENTACAO[k]}
                      </option>
                    ))}
                  </select>
                  <input name="data" type="date" style={fieldStyle} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <select name="destinoSetorId" style={fieldStyle}>
                    <option value="">Setor destino</option>
                    {setores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nome}
                      </option>
                    ))}
                  </select>
                  <input name="destinoLocalizacao" placeholder="Localização física destino" style={fieldStyle} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <select name="responsavelId" style={fieldStyle}>
                    <option value="">Responsável (lista)</option>
                    {cols.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                  <input name="responsavelNome" placeholder="Ou nome livre" style={fieldStyle} />
                </div>
                <input name="motivo" required minLength={3} placeholder="Motivo" style={fieldStyle} />
                <Btn type="submit">Registrar</Btn>
              </form>
            </Surface>
          )}
          <Panel title="Histórico">
            {data.movimentacoes.length === 0 ? (
              <Empty text="Nenhuma movimentação" />
            ) : (
              data.movimentacoes.map((m) => (
                <div key={m.id} style={{ padding: "10px 0", borderBottom: "1px solid oklch(0.94 0.005 255)", fontSize: 13 }}>
                  <strong>{LABEL_MOVIMENTACAO[m.tipo]}</strong> · {new Date(m.data).toLocaleDateString("pt-BR")}
                  <div style={{ color: "oklch(0.45 0.02 250)", marginTop: 4 }}>
                    {m.origemSetor?.nome ?? "—"} → {m.destinoSetor?.nome ?? m.destinoLocalizacao ?? "—"} · {m.responsavelNome}
                  </div>
                  <div>{m.motivo}</div>
                </div>
              ))
            )}
          </Panel>
        </div>
      )}

      {tab === "ciclo" && (
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, fontSize: 13 }}>
            <Surface>
              <strong>Recebimento</strong>
              <div>{data.dataRecebimento ? new Date(data.dataRecebimento).toLocaleDateString("pt-BR") : "Pendente"}</div>
            </Surface>
            <Surface>
              <strong>Entrada em operação</strong>
              <div>
                {data.dataEntradaOperacao ? new Date(data.dataEntradaOperacao).toLocaleDateString("pt-BR") : "—"}
              </div>
            </Surface>
            <Surface>
              <strong>Desativação</strong>
              <div>{data.dataDesativacao ? new Date(data.dataDesativacao).toLocaleDateString("pt-BR") : "—"}</div>
              {data.motivoDesativacao && <div style={{ color: "oklch(0.45 0.02 250)" }}>{data.motivoDesativacao}</div>}
            </Surface>
          </div>
          {podeEditar && !readonly && (
            <Surface>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const tipo = String(new FormData(e.currentTarget).get("tipo")) as
                    | "RECEBIMENTO"
                    | "ENTRADA_OPERACAO"
                    | "DESATIVACAO";
                  void enviarCiclo(tipo, e.currentTarget);
                }}
                style={{ display: "grid", gap: 10 }}
              >
                <strong>Registrar evento com evidência</strong>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <select name="tipo" style={fieldStyle}>
                    <option value="RECEBIMENTO">Recebimento</option>
                    <option value="ENTRADA_OPERACAO">Entrada em operação</option>
                    <option value="DESATIVACAO">Desativação</option>
                  </select>
                  <input name="data" type="date" style={fieldStyle} />
                </div>
                <input name="motivoDesativacao" placeholder="Motivo (obrigatório na desativação)" style={fieldStyle} />
                <textarea name="observacao" rows={2} placeholder="Observação / evidência textual" style={fieldStyle} />
                <input name="arquivo" type="file" accept="image/*,.pdf" />
                <Btn type="submit">Registrar</Btn>
              </form>
            </Surface>
          )}
          <Panel title="Eventos">
            {data.eventosCiclo.length === 0 ? (
              <Empty text="Nenhum evento de ciclo" />
            ) : (
              data.eventosCiclo.map((ev) => (
                <div key={ev.id} style={{ padding: "8px 0", fontSize: 13 }}>
                  <strong>{ev.tipo}</strong> · {new Date(ev.data).toLocaleDateString("pt-BR")}
                  {ev.observacao ? ` · ${ev.observacao}` : ""}
                  {ev.documento ? ` · ${ev.documento.nomeArquivo}` : ""}
                </div>
              ))
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
