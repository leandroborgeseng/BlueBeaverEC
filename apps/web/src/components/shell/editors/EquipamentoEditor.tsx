"use client";

import { useEffect, useState } from "react";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Badge, Btn, Err, FieldLabel, fieldStyle } from "@/components/ui/aion-ui";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useWindowStore } from "@/store/windows";
import { LABEL_PROPRIEDADE, type PropriedadeEquipamento } from "@aion/shared";

interface Lookup {
  id: string;
  nome: string;
  codigo?: string;
  fabricanteId?: string;
}

interface HistoricoTag {
  id: string;
  tagAnterior: string;
  tagNova: string;
  justificativa: string;
  createdAt: string;
}

interface EquipDetail {
  tag: string;
  nome: string;
  situacao: string;
  patrimonio?: string | null;
  nSerie?: string | null;
  observacao?: string | null;
  registroAnvisa?: string | null;
  validadeAnvisa?: string | null;
  dataEndOfService?: string | null;
  dataEndOfLife?: string | null;
  dataAquisicao?: string | null;
  dataInstalacao?: string | null;
  garantiaInicio?: string | null;
  garantiaFim?: string | null;
  valorAquisicao?: number | string | null;
  valorSubstituicao?: number | string | null;
  localizacaoFisica?: string | null;
  propriedade?: PropriedadeEquipamento;
  propriedadeOutra?: string | null;
  criticidadeEquipamento?: string | null;
  checklistRecebimentoPendente?: boolean;
  setorId?: string;
  fabricanteId?: string;
  modeloId?: string;
  fornecedorId?: string | null;
  centroCustoId?: string | null;
  setor?: { id: string; nome: string };
  fabricante?: { id: string; nome: string };
  modelo?: { id: string; nome: string };
  fornecedor?: { id: string; nome: string } | null;
  centroCusto?: { id: string; nome: string; codigo?: string } | null;
  descricao?: { nome: string; criticidade: string };
  planoMatchTipo?: string | null;
  planoMatchObs?: string | null;
  tipoEquipamentoPlano?: {
    id: string;
    nome: string;
    testes?: Array<{
      tipoTeste: string;
      procedimentoCodigo: string;
      periodicidadeMeses: number;
      ativo: boolean;
    }>;
  } | null;
  historicoTags?: HistoricoTag[];
}

type Tab = "geral" | "plano" | "recebimento" | "regulatorio" | "historico";

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

export function EquipamentoEditor({
  tag,
  windowId,
  onDone,
}: {
  tag: string;
  windowId?: string;
  onDone: () => void;
}) {
  const updateWindow = useWindowStore((s) => s.update);
  const open = useWindowStore((s) => s.open);
  const verValores = Boolean(useSession()?.permissoes?.verValoresFinanceiros);
  const [tab, setTab] = useState<Tab>("geral");
  const [data, setData] = useState<EquipDetail | null>(null);
  const [setores, setSetores] = useState<Lookup[]>([]);
  const [fabricantes, setFabricantes] = useState<Lookup[]>([]);
  const [modelos, setModelos] = useState<Lookup[]>([]);
  const [fornecedores, setFornecedores] = useState<Lookup[]>([]);
  const [centros, setCentros] = useState<Lookup[]>([]);

  const [nome, setNome] = useState("");
  const [tagEdit, setTagEdit] = useState("");
  const [observacao, setObservacao] = useState("");
  const [patrimonio, setPatrimonio] = useState("");
  const [nSerie, setNSerie] = useState("");
  const [setorId, setSetorId] = useState("");
  const [setorInicial, setSetorInicial] = useState("");
  const [fabricanteId, setFabricanteId] = useState("");
  const [modeloId, setModeloId] = useState("");
  const [fornecedorId, setFornecedorId] = useState("");
  const [centroCustoId, setCentroCustoId] = useState("");
  const [localizacao, setLocalizacao] = useState("");
  const [propriedade, setPropriedade] = useState<PropriedadeEquipamento>("PROPRIO");
  const [propriedadeOutra, setPropriedadeOutra] = useState("");
  const [criticidade, setCriticidade] = useState("");
  const [valorAq, setValorAq] = useState("");
  const [valorSubst, setValorSubst] = useState("");
  const [dataAquisicao, setDataAquisicao] = useState("");
  const [dataInstalacao, setDataInstalacao] = useState("");
  const [garantiaInicio, setGarantiaInicio] = useState("");
  const [garantiaFim, setGarantiaFim] = useState("");
  const [registroAnvisa, setRegistroAnvisa] = useState("");
  const [validadeAnvisa, setValidadeAnvisa] = useState("");
  const [dataEndOfService, setDataEndOfService] = useState("");
  const [dataEndOfLife, setDataEndOfLife] = useState("");
  const [tipoPlanoId, setTipoPlanoId] = useState("");
  const [tiposPlano, setTiposPlano] = useState<Lookup[]>([]);

  const [novaTag, setNovaTag] = useState("");
  const [justificativaTag, setJustificativaTag] = useState("");
  const [showArquivar, setShowArquivar] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);

  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function iso(v?: string | null) {
    return v ? String(v).slice(0, 10) : "";
  }

  function moneyOut(v: string) {
    const t = v.replace(/\./g, "").replace(",", ".").trim();
    if (!t) return undefined;
    const n = Number(t);
    return Number.isFinite(n) ? n : undefined;
  }

  function applyForm(eq: EquipDetail) {
    setData(eq);
    setNome(eq.nome ?? "");
    setTagEdit(eq.tag ?? "");
    setObservacao(eq.observacao ?? "");
    setPatrimonio(eq.patrimonio ?? "");
    setNSerie(eq.nSerie ?? "");
    const setor = eq.setorId ?? eq.setor?.id ?? "";
    setSetorId(setor);
    setSetorInicial(setor);
    setFabricanteId(eq.fabricanteId ?? eq.fabricante?.id ?? "");
    setModeloId(eq.modeloId ?? eq.modelo?.id ?? "");
    setFornecedorId(eq.fornecedorId ?? eq.fornecedor?.id ?? "");
    setCentroCustoId(eq.centroCustoId ?? eq.centroCusto?.id ?? "");
    setLocalizacao(eq.localizacaoFisica ?? "");
    setPropriedade(eq.propriedade ?? "PROPRIO");
    setPropriedadeOutra(eq.propriedadeOutra ?? "");
    setCriticidade(eq.criticidadeEquipamento ?? "");
    setValorAq(eq.valorAquisicao != null ? String(eq.valorAquisicao) : "");
    setValorSubst(eq.valorSubstituicao != null ? String(eq.valorSubstituicao) : "");
    setDataAquisicao(iso(eq.dataAquisicao));
    setDataInstalacao(iso(eq.dataInstalacao));
    setGarantiaInicio(iso(eq.garantiaInicio));
    setGarantiaFim(iso(eq.garantiaFim));
    setRegistroAnvisa(eq.registroAnvisa ?? "");
    setValidadeAnvisa(iso(eq.validadeAnvisa));
    setDataEndOfService(iso(eq.dataEndOfService));
    setDataEndOfLife(iso(eq.dataEndOfLife));
    setTipoPlanoId(eq.tipoEquipamentoPlano?.id ?? "");
  }

  useEffect(() => {
    Promise.all([
      api<EquipDetail>(`/equipamentos/${encodeURIComponent(tag)}`),
      api<Lookup[]>("/setores"),
      api<Lookup[]>("/fabricantes"),
      api<Lookup[]>("/fornecedores"),
      api<Lookup[]>("/centros-custo"),
      api<Lookup[]>("/planos/tipos-equipamento"),
    ])
      .then(([eq, st, fb, fn, cc, tipos]) => {
        applyForm(eq);
        setSetores(st);
        setFabricantes(fb);
        setFornecedores(fn);
        setCentros(cc);
        setTiposPlano(tipos);
        const fabId = eq.fabricanteId ?? eq.fabricante?.id;
        if (fabId) {
          return api<Lookup[]>(`/modelos?fabricanteId=${encodeURIComponent(fabId)}`).then((mods) => {
            setModelos(mods);
          });
        }
      })
      .catch((e) => setErro(e instanceof Error ? e.message : "Erro"));
  }, [tag]);

  useEffect(() => {
    if (!fabricanteId) {
      setModelos([]);
      return;
    }
    api<Lookup[]>(`/modelos?fabricanteId=${encodeURIComponent(fabricanteId)}`)
      .then(setModelos)
      .catch(() => setModelos([]));
  }, [fabricanteId]);

  const readonly = data?.situacao === "ARQUIVADO";

  async function salvar() {
    try {
      const tagInformada = tagEdit.trim();
      if (!tagInformada) {
        setErro("TAG obrigatória");
        return;
      }
      const updated = await api<EquipDetail>(`/equipamentos/${encodeURIComponent(tag)}`, {
        method: "PATCH",
        body: JSON.stringify({
          tag: tagInformada,
          nome,
          observacao,
          patrimonio: patrimonio || null,
          nSerie: nSerie || null,
          setorId: setorId || undefined,
          fabricanteId: fabricanteId || undefined,
          modeloId: modeloId || undefined,
          fornecedorId: fornecedorId || null,
          centroCustoId: centroCustoId || null,
          localizacaoFisica: localizacao,
          propriedade,
          propriedadeOutra: propriedade === "OUTRO" ? propriedadeOutra : null,
          criticidadeEquipamento: criticidade || null,
          dataAquisicao: dataAquisicao || null,
          dataInstalacao: dataInstalacao || null,
          garantiaInicio: garantiaInicio || null,
          garantiaFim: garantiaFim || null,
          ...(verValores ? { valorAquisicao: moneyOut(valorAq), valorSubstituicao: moneyOut(valorSubst) } : {}),
          registroAnvisa: registroAnvisa || null,
          validadeAnvisa: validadeAnvisa || null,
          dataEndOfService: dataEndOfService || null,
          dataEndOfLife: dataEndOfLife || null,
          tipoEquipamentoPlanoId: tipoPlanoId || null,
        }),
      });
      if (windowId && updated.tag !== tag) {
        updateWindow(windowId, {
          title: `${updated.tag} — ${updated.nome}`,
          payload: { tag: updated.tag },
        });
        setMsg("Salvo");
        setErro(null);
        return;
      }
      applyForm(updated);
      setMsg("Salvo");
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    }
  }

  async function confirmarArquivar() {
    await api(`/equipamentos/${encodeURIComponent(tag)}/arquivar`, { method: "POST" });
    setShowArquivar(false);
    onDone();
  }

  async function confirmarNovaTag(justificativa?: string) {
    if (!novaTag.trim()) throw new Error("Informe a nova TAG");
    const updated = await api<EquipDetail>(`/equipamentos/${encodeURIComponent(tag)}/tag`, {
      method: "PATCH",
      body: JSON.stringify({ novaTag: novaTag.trim(), justificativa }),
    });
    setShowTagModal(false);
    setNovaTag("");
    setJustificativaTag("");
    if (windowId) {
      updateWindow(windowId, {
        title: `${updated.tag} — ${updated.nome}`,
        payload: { tag: updated.tag },
      });
    }
    applyForm(updated);
    setMsg(`TAG alterada para ${updated.tag}`);
  }

  if (erro && !data) return <Err>{erro}</Err>;
  if (!data) return <div style={{ color: "oklch(0.5 0.02 250)" }}>Carregando ficha…</div>;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid oklch(0.91 0.006 255)", marginBottom: 4 }}>
        {(["geral", "plano", "recebimento", "regulatorio", "historico"] as Tab[]).map((t) => (
          <button key={t} type="button" style={tabStyle(tab === t)} onClick={() => setTab(t)}>
            {t === "geral"
              ? "Geral"
              : t === "plano"
                ? "Plano / POP"
                : t === "recebimento"
                  ? "Recebimento"
                  : t === "regulatorio"
                    ? "Regulatório"
                    : "Histórico TAG"}
          </button>
        ))}
      </div>

      {erro && <Err>{erro}</Err>}
      {msg && <div style={{ fontSize: 13, fontWeight: 600, color: "oklch(0.4 0.14 150)" }}>{msg}</div>}

      {Boolean(data.checklistRecebimentoPendente) && (
        <div
          style={{
            color: "oklch(0.45 0.12 75)",
            fontWeight: 600,
            fontSize: 13,
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            alignItems: "center",
            padding: "10px 12px",
            background: "oklch(0.97 0.03 85)",
            borderRadius: 8,
          }}
        >
          <span>Checklist de recebimento pendente</span>
          <Btn
            size="sm"
            onClick={() =>
              open({
                kind: "laudo",
                title: `Recebimento · ${tag}`,
                payload: { tipo: "RECEBIMENTO", equipamentoTag: tag },
              })
            }
          >
            Abrir laudo de recebimento
          </Btn>
        </div>
      )}

      {tab === "geral" && (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <Badge tone={data.situacao}>{data.situacao.replace(/_/g, " ")}</Badge>
            {data.descricao && <Badge tone={data.descricao.criticidade}>{data.descricao.criticidade}</Badge>}
            <Btn size="sm" variant="ghost" href={`/equipamentos/${encodeURIComponent(tag)}`}>
              Página completa
            </Btn>
          </div>

          <div>
            <FieldLabel>TAG</FieldLabel>
            <input
              value={tagEdit}
              disabled={readonly}
              onChange={(e) => setTagEdit(e.target.value)}
              placeholder="Ex.: HEF-CME-001"
              style={{ ...fieldStyle, fontWeight: 700, letterSpacing: "0.04em" }}
            />
            <div style={{ marginTop: 6, fontSize: 12, color: "oklch(0.5 0.02 250)" }}>
              Livre para vocês definirem. Só não pode repetir outra TAG desta instituição.
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <FieldLabel>Tipo</FieldLabel>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{data.descricao?.nome ?? "—"}</div>
            </div>
          </div>

          <div>
            <FieldLabel>Nome</FieldLabel>
            <input value={nome} disabled={readonly} onChange={(e) => setNome(e.target.value)} style={fieldStyle} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <FieldLabel>Patrimônio</FieldLabel>
              <input value={patrimonio} disabled={readonly} onChange={(e) => setPatrimonio(e.target.value)} style={fieldStyle} />
            </div>
            <div>
              <FieldLabel>Nº série</FieldLabel>
              <input value={nSerie} disabled={readonly} onChange={(e) => setNSerie(e.target.value)} style={fieldStyle} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <FieldLabel>Setor</FieldLabel>
              <select
                value={setorId}
                disabled={readonly}
                onChange={(e) => setSetorId(e.target.value)}
                style={fieldStyle}
              >
                <option value="">Selecione…</option>
                {setores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
              {setorId && setorInicial && setorId !== setorInicial && (
                <div style={{ marginTop: 6, fontSize: 12, color: "oklch(0.45 0.12 75)" }}>
                  Salvar registra uma transferência de setor no transporte.
                </div>
              )}
            </div>
            <div>
              <FieldLabel>Localização</FieldLabel>
              <input
                value={localizacao}
                disabled={readonly}
                onChange={(e) => setLocalizacao(e.target.value)}
                placeholder="Sala, leito…"
                style={fieldStyle}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <FieldLabel>Centro de custo</FieldLabel>
              <select
                value={centroCustoId}
                disabled={readonly}
                onChange={(e) => setCentroCustoId(e.target.value)}
                style={fieldStyle}
              >
                <option value="">Nenhum</option>
                {centros.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.codigo ? `${c.codigo} — ${c.nome}` : c.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>Fornecedor</FieldLabel>
              <select
                value={fornecedorId}
                disabled={readonly}
                onChange={(e) => setFornecedorId(e.target.value)}
                style={fieldStyle}
              >
                <option value="">Nenhum</option>
                {fornecedores.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <FieldLabel>Fabricante</FieldLabel>
              <select
                value={fabricanteId}
                disabled={readonly}
                onChange={(e) => {
                  setFabricanteId(e.target.value);
                  setModeloId("");
                }}
                style={fieldStyle}
              >
                <option value="">Selecione…</option>
                {fabricantes.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>Modelo</FieldLabel>
              <select
                value={modeloId}
                disabled={readonly || !fabricanteId}
                onChange={(e) => setModeloId(e.target.value)}
                style={fieldStyle}
              >
                <option value="">Selecione…</option>
                {modelos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <FieldLabel>Situação (propriedade)</FieldLabel>
              <select
                value={propriedade}
                disabled={readonly}
                onChange={(e) => setPropriedade(e.target.value as PropriedadeEquipamento)}
                style={fieldStyle}
              >
                {(Object.keys(LABEL_PROPRIEDADE) as PropriedadeEquipamento[]).map((k) => (
                  <option key={k} value={k}>
                    {LABEL_PROPRIEDADE[k]}
                  </option>
                ))}
              </select>
              {propriedade === "OUTRO" && (
                <input
                  value={propriedadeOutra}
                  disabled={readonly}
                  onChange={(e) => setPropriedadeOutra(e.target.value)}
                  placeholder="Qual?"
                  style={{ ...fieldStyle, marginTop: 8 }}
                />
              )}
            </div>
            <div>
              <FieldLabel>Criticidade</FieldLabel>
              <select
                value={criticidade}
                disabled={readonly}
                onChange={(e) => setCriticidade(e.target.value)}
                style={fieldStyle}
              >
                <option value="">Herdar do tipo</option>
                <option value="BAIXA">Baixa</option>
                <option value="MEDIA">Média</option>
                <option value="ALTA">Alta</option>
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div>
              <FieldLabel>Aquisição</FieldLabel>
              <input type="date" value={dataAquisicao} disabled={readonly} onChange={(e) => setDataAquisicao(e.target.value)} style={fieldStyle} />
            </div>
            <div>
              <FieldLabel>Instalação</FieldLabel>
              <input type="date" value={dataInstalacao} disabled={readonly} onChange={(e) => setDataInstalacao(e.target.value)} style={fieldStyle} />
            </div>
            <div>
              <FieldLabel>ANVISA</FieldLabel>
              <input value={registroAnvisa} disabled={readonly} onChange={(e) => setRegistroAnvisa(e.target.value)} style={fieldStyle} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <FieldLabel>Garantia início</FieldLabel>
              <input type="date" value={garantiaInicio} disabled={readonly} onChange={(e) => setGarantiaInicio(e.target.value)} style={fieldStyle} />
            </div>
            <div>
              <FieldLabel>Garantia fim</FieldLabel>
              <input type="date" value={garantiaFim} disabled={readonly} onChange={(e) => setGarantiaFim(e.target.value)} style={fieldStyle} />
            </div>
          </div>

          {verValores && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <FieldLabel>Valor de aquisição</FieldLabel>
                <input value={valorAq} disabled={readonly} onChange={(e) => setValorAq(e.target.value)} style={fieldStyle} />
              </div>
              <div>
                <FieldLabel>Valor de substituição</FieldLabel>
                <input value={valorSubst} disabled={readonly} onChange={(e) => setValorSubst(e.target.value)} style={fieldStyle} />
              </div>
            </div>
          )}

          <div>
            <FieldLabel>Observação</FieldLabel>
            <textarea
              value={observacao}
              disabled={readonly}
              onChange={(e) => setObservacao(e.target.value)}
              rows={3}
              style={fieldStyle}
            />
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn disabled={readonly} onClick={() => void salvar()}>
              Salvar
            </Btn>
            <Btn variant="ghost" href={`/equipamentos/${encodeURIComponent(tag)}/ficha-vida`}>
              Ficha de vida
            </Btn>
            <Btn variant="ghost" href={`/equipamentos/${encodeURIComponent(tag)}/etiqueta`}>
              Etiqueta / QR
            </Btn>
            <Btn variant="secondary" href={`/os/nova?tag=${encodeURIComponent(tag)}`}>
              Abrir OS
            </Btn>
            <Btn variant="danger" disabled={readonly} onClick={() => setShowArquivar(true)}>
              Arquivar
            </Btn>
          </div>
        </div>
      )}

      {tab === "plano" && (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <FieldLabel>Tipo de equipamento (plano)</FieldLabel>
              {readonly ? (
                <div style={{ fontWeight: 600, fontSize: 13 }}>
                  {data.tipoEquipamentoPlano?.nome ?? "Sem plano vinculado"}
                </div>
              ) : (
                <select
                  value={tipoPlanoId}
                  onChange={(e) => setTipoPlanoId(e.target.value)}
                  style={fieldStyle}
                >
                  <option value="">Sem vínculo</option>
                  {tiposPlano.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <FieldLabel>Match do mapping</FieldLabel>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {data.planoMatchTipo ? (
                  <Badge
                    tone={
                      data.planoMatchTipo === "exato"
                        ? "success"
                        : data.planoMatchTipo === "aproximado"
                          ? "warning"
                          : "danger"
                    }
                  >
                    {data.planoMatchTipo}
                  </Badge>
                ) : (
                  <span style={{ color: "oklch(0.5 0.02 250)" }}>—</span>
                )}
              </div>
              {data.planoMatchObs && (
                <div style={{ fontSize: 12, color: "oklch(0.45 0.02 250)", marginTop: 6 }}>
                  {data.planoMatchObs}
                </div>
              )}
            </div>
          </div>

          {!readonly && (
            <div>
              <Btn size="sm" onClick={() => void salvar()}>
                Salvar vínculo do plano
              </Btn>
            </div>
          )}

          {(data.tipoEquipamentoPlano?.testes?.length ?? 0) === 0 ? (
            <div style={{ fontSize: 13, color: "oklch(0.5 0.02 250)" }}>
              Nenhum teste de plano ativo (preventiva / TSE / calibração / qualificação).
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "6px 4px", borderBottom: "1px solid oklch(0.9 0.01 250)" }}>
                    Tipo
                  </th>
                  <th style={{ textAlign: "left", padding: "6px 4px", borderBottom: "1px solid oklch(0.9 0.01 250)" }}>
                    POP / procedimento
                  </th>
                  <th style={{ textAlign: "left", padding: "6px 4px", borderBottom: "1px solid oklch(0.9 0.01 250)" }}>
                    Periodicidade
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.tipoEquipamentoPlano!.testes!.map((t) => (
                  <tr key={`${t.tipoTeste}-${t.procedimentoCodigo}`}>
                    <td style={{ padding: "6px 4px" }}>
                      <Badge tone="info">{t.tipoTeste}</Badge>
                    </td>
                    <td style={{ padding: "6px 4px", fontFamily: "ui-monospace, monospace" }}>
                      {t.procedimentoCodigo}
                    </td>
                    <td style={{ padding: "6px 4px" }}>{t.periodicidadeMeses} meses</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "recebimento" && (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ fontSize: 13 }}>
            Status:{" "}
            {data.checklistRecebimentoPendente ? (
              <Badge tone="warning">Pendente</Badge>
            ) : (
              <Badge tone="success">Concluído</Badge>
            )}
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "oklch(0.45 0.02 250)", lineHeight: 1.45 }}>
            O checklist de recebimento é um laudo do tipo RECEBIMENTO. Ao salvar o laudo aprovado, a
            pendência deste equipamento é encerrada automaticamente.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn
              onClick={() =>
                open({
                  kind: "laudo",
                  title: `Recebimento · ${tag}`,
                  payload: { tipo: "RECEBIMENTO", equipamentoTag: tag },
                })
              }
            >
              {data.checklistRecebimentoPendente ? "Preencher checklist" : "Abrir novo recebimento"}
            </Btn>
            <Btn href={`/laudos?tag=${encodeURIComponent(tag)}`} variant="secondary">
              Ver laudos do equipamento
            </Btn>
          </div>
        </div>
      )}

      {tab === "regulatorio" && (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <FieldLabel>Registro Anvisa</FieldLabel>
              <input
                value={registroAnvisa}
                disabled={readonly}
                onChange={(e) => setRegistroAnvisa(e.target.value)}
                style={fieldStyle}
              />
            </div>
            <div>
              <FieldLabel>Validade Anvisa</FieldLabel>
              <input
                type="date"
                value={validadeAnvisa}
                disabled={readonly}
                onChange={(e) => setValidadeAnvisa(e.target.value)}
                style={fieldStyle}
              />
            </div>
            <div>
              <FieldLabel>End of Service</FieldLabel>
              <input
                type="date"
                value={dataEndOfService}
                disabled={readonly}
                onChange={(e) => setDataEndOfService(e.target.value)}
                style={fieldStyle}
              />
            </div>
            <div>
              <FieldLabel>End of Life</FieldLabel>
              <input
                type="date"
                value={dataEndOfLife}
                disabled={readonly}
                onChange={(e) => setDataEndOfLife(e.target.value)}
                style={fieldStyle}
              />
            </div>
          </div>
          <Btn disabled={readonly} onClick={() => void salvar()}>
            Salvar regulatório
          </Btn>
        </div>
      )}

      {tab === "historico" && (
        <div style={{ display: "grid", gap: 12 }}>
          {(data.historicoTags ?? []).length === 0 ? (
            <div style={{ color: "oklch(0.5 0.02 250)", fontSize: 13 }}>Nenhuma alteração de TAG registrada.</div>
          ) : (
            (data.historicoTags ?? []).map((h) => (
              <div
                key={h.id}
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid oklch(0.91 0.006 255)",
                  fontSize: 13,
                }}
              >
                <div>
                  <strong>{h.tagAnterior}</strong> → <strong>{h.tagNova}</strong>
                </div>
                <div style={{ marginTop: 4, color: "oklch(0.45 0.02 250)" }}>{h.justificativa}</div>
                <div style={{ marginTop: 4, fontSize: 12, color: "oklch(0.5 0.02 250)" }}>
                  {new Date(h.createdAt).toLocaleString("pt-BR")}
                </div>
              </div>
            ))
          )}

          {!readonly && (
            <div style={{ borderTop: "1px solid oklch(0.91 0.006 255)", paddingTop: 12 }}>
              <FieldLabel>Nova TAG</FieldLabel>
              <input
                value={novaTag}
                onChange={(e) => setNovaTag(e.target.value)}
                placeholder="Ex: EQ-0123"
                style={{ ...fieldStyle, marginBottom: 8 }}
              />
              <FieldLabel>Justificativa</FieldLabel>
              <textarea
                value={justificativaTag}
                onChange={(e) => setJustificativaTag(e.target.value)}
                rows={2}
                style={{ ...fieldStyle, marginBottom: 8 }}
              />
              <Btn
                variant="secondary"
                disabled={!novaTag.trim()}
                onClick={() => setShowTagModal(true)}
              >
                Alterar TAG
              </Btn>
            </div>
          )}
        </div>
      )}

      <ConfirmModal
        open={showArquivar}
        title="Arquivar equipamento"
        message={`Confirma o arquivamento do equipamento ${data.tag}?`}
        confirmLabel="Arquivar"
        danger
        onConfirm={() => confirmarArquivar()}
        onCancel={() => setShowArquivar(false)}
      />

      <ConfirmModal
        open={showTagModal}
        title="Alterar TAG do equipamento"
        message={`A TAG ${data.tag} será alterada para ${novaTag.trim()}.`}
        confirmLabel="Confirmar alteração"
        onConfirm={() => confirmarNovaTag(justificativaTag.trim() || "Alteração no cadastro")}
        onCancel={() => setShowTagModal(false)}
      />
    </div>
  );
}
