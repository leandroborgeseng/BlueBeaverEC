"use client";

import { useEffect, useState } from "react";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Badge, Btn, Err, FieldLabel, fieldStyle } from "@/components/ui/aion-ui";
import { api } from "@/lib/api";
import { useWindowStore } from "@/store/windows";

interface Lookup {
  id: string;
  nome: string;
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
  checklistRecebimentoPendente?: boolean;
  setorId?: string;
  fabricanteId?: string;
  modeloId?: string;
  fornecedorId?: string | null;
  setor?: { id: string; nome: string };
  fabricante?: { id: string; nome: string };
  modelo?: { id: string; nome: string };
  fornecedor?: { id: string; nome: string } | null;
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

type Tab = "geral" | "plano" | "regulatorio" | "historico";

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
  const [tab, setTab] = useState<Tab>("geral");
  const [data, setData] = useState<EquipDetail | null>(null);
  const [setores, setSetores] = useState<Lookup[]>([]);
  const [fabricantes, setFabricantes] = useState<Lookup[]>([]);
  const [modelos, setModelos] = useState<Lookup[]>([]);
  const [fornecedores, setFornecedores] = useState<Lookup[]>([]);

  const [nome, setNome] = useState("");
  const [observacao, setObservacao] = useState("");
  const [patrimonio, setPatrimonio] = useState("");
  const [nSerie, setNSerie] = useState("");
  const [setorId, setSetorId] = useState("");
  const [fabricanteId, setFabricanteId] = useState("");
  const [modeloId, setModeloId] = useState("");
  const [fornecedorId, setFornecedorId] = useState("");
  const [registroAnvisa, setRegistroAnvisa] = useState("");
  const [validadeAnvisa, setValidadeAnvisa] = useState("");
  const [dataEndOfService, setDataEndOfService] = useState("");
  const [dataEndOfLife, setDataEndOfLife] = useState("");

  const [novaTag, setNovaTag] = useState("");
  const [justificativaTag, setJustificativaTag] = useState("");
  const [showArquivar, setShowArquivar] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);

  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function applyForm(eq: EquipDetail) {
    setData(eq);
    setNome(eq.nome ?? "");
    setObservacao(eq.observacao ?? "");
    setPatrimonio(eq.patrimonio ?? "");
    setNSerie(eq.nSerie ?? "");
    setSetorId(eq.setorId ?? eq.setor?.id ?? "");
    setFabricanteId(eq.fabricanteId ?? eq.fabricante?.id ?? "");
    setModeloId(eq.modeloId ?? eq.modelo?.id ?? "");
    setFornecedorId(eq.fornecedorId ?? eq.fornecedor?.id ?? "");
    setRegistroAnvisa(eq.registroAnvisa ?? "");
    setValidadeAnvisa(eq.validadeAnvisa ? String(eq.validadeAnvisa).slice(0, 10) : "");
    setDataEndOfService(eq.dataEndOfService ? String(eq.dataEndOfService).slice(0, 10) : "");
    setDataEndOfLife(eq.dataEndOfLife ? String(eq.dataEndOfLife).slice(0, 10) : "");
  }

  useEffect(() => {
    Promise.all([
      api<EquipDetail>(`/equipamentos/${encodeURIComponent(tag)}`),
      api<Lookup[]>("/setores"),
      api<Lookup[]>("/fabricantes"),
      api<Lookup[]>("/fornecedores"),
    ])
      .then(([eq, st, fb, fn]) => {
        applyForm(eq);
        setSetores(st);
        setFabricantes(fb);
        setFornecedores(fn);
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

  const readonly = data?.situacao === "ARQUIVADO" || data?.situacao === "INATIVO";

  async function salvar() {
    try {
      const updated = await api<EquipDetail>(`/equipamentos/${encodeURIComponent(tag)}`, {
        method: "PATCH",
        body: JSON.stringify({
          nome,
          observacao,
          patrimonio: patrimonio || null,
          nSerie: nSerie || null,
          setorId: setorId || undefined,
          fabricanteId: fabricanteId || undefined,
          modeloId: modeloId || undefined,
          fornecedorId: fornecedorId || null,
          registroAnvisa: registroAnvisa || null,
          validadeAnvisa: validadeAnvisa || null,
          dataEndOfService: dataEndOfService || null,
          dataEndOfLife: dataEndOfLife || null,
        }),
      });
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
        {(["geral", "plano", "regulatorio", "historico"] as Tab[]).map((t) => (
          <button key={t} type="button" style={tabStyle(tab === t)} onClick={() => setTab(t)}>
            {t === "geral"
              ? "Geral"
              : t === "plano"
                ? "Plano / POP"
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
            <strong style={{ fontSize: 15 }}>{data.tag}</strong>
            <Badge tone={data.situacao}>{data.situacao.replace(/_/g, " ")}</Badge>
            {data.descricao && <Badge tone={data.descricao.criticidade}>{data.descricao.criticidade}</Badge>}
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
              <div style={{ fontWeight: 600, fontSize: 13 }}>
                {data.tipoEquipamentoPlano?.nome ?? "Sem plano vinculado"}
              </div>
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
                disabled={!novaTag.trim() || justificativaTag.trim().length < 3}
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
        requireJustification
        onConfirm={() => confirmarNovaTag(justificativaTag.trim())}
        onCancel={() => setShowTagModal(false)}
      />
    </div>
  );
}
