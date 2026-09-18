"use client";

import { FormEvent, useEffect, useMemo, useState, type CSSProperties } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { LABEL_PROPRIEDADE, type PropriedadeEquipamento } from "@aion/shared";
import { Overlay, WinForm, Linha, fld, YELLOW, disabledFld } from "@/components/os/os-win-ui";

interface Lookup {
  id: string;
  nome: string;
}

interface Centro extends Lookup {
  codigo?: string;
}

interface Modelo extends Lookup {
  fabricanteId: string;
  fabricante: { id: string; nome: string };
}

type CriticidadeEq = "BAIXA" | "MEDIA" | "ALTA";

const CRIT: Array<{ id: CriticidadeEq | ""; nome: string }> = [
  { id: "", nome: "<Nenhum>" },
  { id: "BAIXA", nome: "Baixa" },
  { id: "MEDIA", nome: "Média" },
  { id: "ALTA", nome: "Alta" },
];

function money(v: string) {
  const t = v.replace(/\./g, "").replace(",", ".").trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

function proximaGrade(inicio: string, n: number) {
  const m = /^(.*?)(\d+)$/.exec(inicio.trim());
  if (!m) {
    return Array.from({ length: n }, (_, i) => (i === 0 ? inicio : `${inicio}-${i + 1}`));
  }
  const prefix = m[1];
  const digits = m[2];
  const base = Number(digits);
  return Array.from({ length: n }, (_, i) => `${prefix}${String(base + i).padStart(digits.length, "0")}`);
}

function filtra(lista: Lookup[], q: string) {
  const t = q.trim().toLowerCase();
  if (!t) return lista;
  return lista.filter((x) => x.nome.toLowerCase().includes(t));
}

export function EquipamentoNovoDialog({
  multiplos,
  onClose,
  onCreated,
}: {
  multiplos?: boolean;
  onClose: () => void;
  onCreated: (tag: string, continuar: boolean) => void;
}) {
  const verValores = Boolean(useSession()?.permissoes?.verValoresFinanceiros);
  const [tab, setTab] = useState<"geral" | "obs">("geral");
  const [setores, setSetores] = useState<Lookup[]>([]);
  const [planos, setPlanos] = useState<Lookup[]>([]);
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [fornecedores, setFornecedores] = useState<Lookup[]>([]);
  const [centros, setCentros] = useState<Centro[]>([]);
  const [proxima, setProxima] = useState("");

  const [propriedade, setPropriedade] = useState<PropriedadeEquipamento>("PROPRIO");
  const [propriedadeOutra, setPropriedadeOutra] = useState("");
  const [descricaoId, setDescricaoId] = useState("");
  const [modeloId, setModeloId] = useState("");
  const [setorId, setSetorId] = useState("");
  const [fornecedorId, setFornecedorId] = useState("");
  const [centroCustoId, setCentroCustoId] = useState("");
  const [nome, setNome] = useState("");
  const [nomeManual, setNomeManual] = useState(false);
  const [tag, setTag] = useState("");
  const [nSerie, setNSerie] = useState("");
  const [patrimonio, setPatrimonio] = useState("");
  const [localizacao, setLocalizacao] = useState("");
  const [registroAnvisa, setRegistroAnvisa] = useState("");
  const [validadeAnvisa, setValidadeAnvisa] = useState("");
  const [criticidade, setCriticidade] = useState<CriticidadeEq | "">("");
  const [valorSubst, setValorSubst] = useState("");
  const [valorAq, setValorAq] = useState("");
  const [dataAquisicao, setDataAquisicao] = useState("");
  const [dataInstalacao, setDataInstalacao] = useState("");
  const [garantiaInicio, setGarantiaInicio] = useState("");
  const [garantiaFim, setGarantiaFim] = useState("");
  const [observacao, setObservacao] = useState("");
  const [continuar, setContinuar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [qtd, setQtd] = useState(2);
  const [grade, setGrade] = useState<Array<{ tag: string; nSerie: string; patrimonio: string }>>([]);
  const [filtroDesc, setFiltroDesc] = useState("");
  const [filtroModelo, setFiltroModelo] = useState("");
  const [filtroSetor, setFiltroSetor] = useState("");

  const modelo = modelos.find((m) => m.id === modeloId);
  const fabricanteNome = modelo?.fabricante.nome ?? "";
  const planosVis = useMemo(() => filtra(planos, filtroDesc), [planos, filtroDesc]);
  const modelosVis = useMemo(() => {
    const t = filtroModelo.trim().toLowerCase();
    if (!t) return modelos;
    return modelos.filter(
      (m) => m.nome.toLowerCase().includes(t) || m.fabricante.nome.toLowerCase().includes(t),
    );
  }, [modelos, filtroModelo]);
  const setoresVis = useMemo(() => filtra(setores, filtroSetor), [setores, filtroSetor]);

  useEffect(() => {
    void Promise.all([
      api<Lookup[]>("/setores"),
      api<Lookup[]>("/planos-descricao"),
      api<Modelo[]>("/modelos"),
      api<Lookup[]>("/fornecedores"),
      api<Centro[]>("/centros-custo"),
      api<{ tag: string }>("/equipamentos/proxima-tag"),
    ])
      .then(([s, p, m, fo, c, t]) => {
        setSetores(s);
        setPlanos(p);
        setModelos(m);
        setFornecedores(fo);
        setCentros(c);
        setProxima(t.tag);
        setTag((atual) => atual || t.tag);
      })
      .catch((e) => setErro(e instanceof Error ? e.message : "Não foi possível carregar os cadastros"));
  }, []);

  function aplicarDescricao(id: string) {
    setDescricaoId(id);
    const plano = planos.find((p) => p.id === id);
    if (plano && !nomeManual) setNome(plano.nome);
  }

  function aplicarModelo(id: string) {
    setModeloId(id);
    const mod = modelos.find((m) => m.id === id);
    if (mod && !nomeManual && !descricaoId) setNome(mod.nome);
  }

  function payloadComum() {
    return {
      nome: nome.trim(),
      tag: tag.trim() || undefined,
      descricaoId: descricaoId || undefined,
      fabricanteId: modelo?.fabricanteId || undefined,
      modeloId: modeloId || undefined,
      setorId,
      fornecedorId: fornecedorId || undefined,
      centroCustoId: centroCustoId || undefined,
      patrimonio: patrimonio.trim() || undefined,
      nSerie: nSerie.trim() || undefined,
      localizacaoFisica: localizacao.trim() || undefined,
      propriedade,
      propriedadeOutra: propriedade === "OUTRO" ? propriedadeOutra.trim() || undefined : undefined,
      dataAquisicao: dataAquisicao || undefined,
      dataInstalacao: dataInstalacao || undefined,
      valorAquisicao: verValores ? money(valorAq) : undefined,
      valorSubstituicao: verValores ? money(valorSubst) : undefined,
      garantiaInicio: garantiaInicio || undefined,
      garantiaFim: garantiaFim || undefined,
      registroAnvisa: registroAnvisa.trim() || undefined,
      validadeAnvisa: validadeAnvisa || undefined,
      observacao: observacao.trim() || undefined,
      criticidadeEquipamento: criticidade || undefined,
    };
  }

  function validar() {
    if (!nome.trim()) return "Informe o nome / descrição";
    if (!descricaoId) return "Informe a descrição";
    if (!modeloId) return "Informe o modelo";
    if (!setorId) return "Informe o setor";
    if (propriedade === "OUTRO" && !propriedadeOutra.trim()) return "Informe a situação (outra)";
    if (!multiplos && !tag.trim()) return "Informe a TAG";
    return null;
  }

  async function salvar(fechar: boolean, e?: FormEvent) {
    e?.preventDefault();
    const v = validar();
    if (v) {
      setErro(v);
      return;
    }
    setBusy(true);
    setErro(null);
    try {
      if (multiplos) {
        const itens = (grade.length ? grade : [{ tag: tag.trim(), nSerie, patrimonio }]).filter((r) => r.tag.trim());
        if (!itens.length) {
          setErro("Gere a grade ou informe ao menos uma TAG");
          setBusy(false);
          return;
        }
        const res = await api<{ ok: number; tags: string[]; erros: Array<{ tag: string; erro: string }> }>(
          "/equipamentos/lote",
          { method: "POST", body: JSON.stringify({ ...payloadComum(), tag: undefined, itens }) },
        );
        if (res.erros?.length) {
          setErro(
            `${res.ok} criado(s). Falhas: ${res.erros.map((x) => `${x.tag}: ${x.erro}`).join(" · ")}`.replace(
              /^0 criado\(s\)\. Falhas: /,
              "",
            ),
          );
          if (res.ok) setGrade((g) => g.filter((r) => !res.tags.includes(r.tag)));
          return;
        }
        onCreated(res.tags[0] ?? "", continuar && !fechar);
        if (continuar && !fechar) resetParcial();
      } else {
        const created = await api<{ tag: string }>("/equipamentos", {
          method: "POST",
          body: JSON.stringify(payloadComum()),
        });
        onCreated(created.tag, continuar && !fechar);
        if (continuar && !fechar) resetParcial();
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao cadastrar");
    } finally {
      setBusy(false);
    }
  }

  function resetParcial() {
    setNSerie("");
    setPatrimonio("");
    setObservacao("");
    setGrade([]);
    void api<{ tag: string }>("/equipamentos/proxima-tag").then((t) => {
      setProxima(t.tag);
      setTag(t.tag);
    });
  }

  function gerarGrade() {
    const n = Math.min(40, Math.max(1, Number(qtd) || 1));
    const tags = proximaGrade(tag || proxima, n);
    setGrade(tags.map((t) => ({ tag: t, nSerie: "", patrimonio: "" })));
  }

  return (
    <WinForm
      title={multiplos ? "Cadastro de Múltiplos Equipamentos" : "Novo Equipamento"}
      width="min(980px, 96vw)"
      onSubmit={(e) => void salvar(false, e)}
      onSubmitAndClose={() => void salvar(true)}
      onCancel={onClose}
      busy={busy}
      continuar={continuar}
      setContinuar={setContinuar}
      showContinuar={!multiplos}
      erro={erro}
      submitLabel="Salvar"
      submitAndCloseLabel="Salvar e Fechar"
    >
      <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
        <button type="button" onClick={() => setTab("geral")} style={tabBtn(tab === "geral")}>
          Geral
        </button>
        <button type="button" onClick={() => setTab("obs")} style={tabBtn(tab === "obs")}>
          Observação
        </button>
      </div>

      {tab === "geral" && (
        <>
          {multiplos && <div style={sec}>Informações Gerais</div>}
          <Linha label="Situação:">
            <select
              value={propriedade}
              onChange={(e) => setPropriedade(e.target.value as PropriedadeEquipamento)}
              style={{ ...fld, width: 200 }}
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
                onChange={(e) => setPropriedadeOutra(e.target.value)}
                placeholder="Qual?"
                style={{ ...fld, width: 180, marginLeft: 8, background: YELLOW }}
              />
            )}
          </Linha>
          <Linha label="Descrição:">
            <input
              value={filtroDesc}
              onChange={(e) => setFiltroDesc(e.target.value)}
              placeholder="Filtrar…"
              style={{ ...fld, width: 110 }}
            />
            <select
              value={descricaoId}
              onChange={(e) => aplicarDescricao(e.target.value)}
              style={{ ...fld, flex: 1, background: YELLOW }}
            >
              <option value="">Selecione…</option>
              {planosVis.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
              {descricaoId && !planosVis.some((p) => p.id === descricaoId) && (
                <option value={descricaoId}>{planos.find((p) => p.id === descricaoId)?.nome}</option>
              )}
            </select>
          </Linha>
          <Linha label="Nome:">
            <input
              value={nome}
              onChange={(e) => {
                setNomeManual(true);
                setNome(e.target.value);
              }}
              style={{ ...fld, flex: 1, background: YELLOW }}
            />
          </Linha>
          <Linha label="Modelo:">
            <input
              value={filtroModelo}
              onChange={(e) => setFiltroModelo(e.target.value)}
              placeholder="Filtrar…"
              style={{ ...fld, width: 110 }}
            />
            <select
              value={modeloId}
              onChange={(e) => aplicarModelo(e.target.value)}
              style={{ ...fld, flex: 1, background: YELLOW }}
            >
              <option value="">Selecione…</option>
              {modelosVis.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome} — {m.fabricante.nome}
                </option>
              ))}
              {modeloId && !modelosVis.some((m) => m.id === modeloId) && modelo && (
                <option value={modeloId}>
                  {modelo.nome} — {modelo.fabricante.nome}
                </option>
              )}
            </select>
            <span style={{ fontSize: 12, marginLeft: 8 }}>Fabricante:</span>
            <input value={fabricanteNome} readOnly style={{ ...disabledFld, width: 200 }} />
          </Linha>
          <Linha label={verValores ? "Valor de Substituição:" : "Reg. ANVISA:"}>
            {verValores && (
              <input value={valorSubst} onChange={(e) => setValorSubst(e.target.value)} style={{ ...fld, width: 120 }} />
            )}
            {verValores && <span style={{ fontSize: 12, marginLeft: 12 }}>Reg. ANVISA:</span>}
            <input value={registroAnvisa} onChange={(e) => setRegistroAnvisa(e.target.value)} style={{ ...fld, width: 140 }} />
            <span style={{ fontSize: 12, marginLeft: 12 }}>Validade:</span>
            <input type="date" value={validadeAnvisa} onChange={(e) => setValidadeAnvisa(e.target.value)} style={{ ...fld, width: 140 }} />
          </Linha>
          <Linha label="Criticidade:">
            <select value={criticidade} onChange={(e) => setCriticidade(e.target.value as CriticidadeEq | "")} style={{ ...fld, width: 160 }}>
              {CRIT.map((c) => (
                <option key={c.id || "n"} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </Linha>
          <Linha label="Setor:">
            <input
              value={filtroSetor}
              onChange={(e) => setFiltroSetor(e.target.value)}
              placeholder="Filtrar…"
              style={{ ...fld, width: 110 }}
            />
            <select value={setorId} onChange={(e) => setSetorId(e.target.value)} style={{ ...fld, flex: 1, background: YELLOW }}>
              <option value="">Selecione…</option>
              {setoresVis.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
              {setorId && !setoresVis.some((s) => s.id === setorId) && (
                <option value={setorId}>{setores.find((s) => s.id === setorId)?.nome}</option>
              )}
            </select>
          </Linha>
          <Linha label="Localização:">
            <input value={localizacao} onChange={(e) => setLocalizacao(e.target.value)} placeholder="Sala, leito…" style={{ ...fld, flex: 1 }} />
          </Linha>
          {!multiplos && (
            <Linha label="TAG:">
              <input value={tag} onChange={(e) => setTag(e.target.value)} style={{ ...fld, width: 180, fontWeight: 700 }} />
              <span style={{ fontSize: 12, marginLeft: 12 }}>Nº Série:</span>
              <input value={nSerie} onChange={(e) => setNSerie(e.target.value)} style={{ ...fld, width: 160 }} />
              <span style={{ fontSize: 12, marginLeft: 12 }}>Patrimônio:</span>
              <input value={patrimonio} onChange={(e) => setPatrimonio(e.target.value)} style={{ ...fld, width: 140 }} />
            </Linha>
          )}
          <Linha label="Centro de Custo:">
            <select value={centroCustoId} onChange={(e) => setCentroCustoId(e.target.value)} style={{ ...fld, width: 280 }}>
              <option value="">&lt;Nenhum&gt;</option>
              {centros.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo ? `${c.codigo} — ${c.nome}` : c.nome}
                </option>
              ))}
            </select>
          </Linha>
          <Linha label="Fornecedor:">
            <select value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)} style={{ ...fld, flex: 1 }}>
              <option value="">&lt;Nenhum&gt;</option>
              {fornecedores.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
          </Linha>
          <Linha label={verValores ? "Valor de Aquisição:" : "Datas:"}>
            {verValores && (
              <input value={valorAq} onChange={(e) => setValorAq(e.target.value)} style={{ ...fld, width: 120 }} />
            )}
            <span style={{ fontSize: 12, marginLeft: verValores ? 12 : 0 }}>Aquisição:</span>
            <input type="date" value={dataAquisicao} onChange={(e) => setDataAquisicao(e.target.value)} style={{ ...fld, width: 140 }} />
            <span style={{ fontSize: 12, marginLeft: 12 }}>Instalação:</span>
            <input type="date" value={dataInstalacao} onChange={(e) => setDataInstalacao(e.target.value)} style={{ ...fld, width: 140 }} />
          </Linha>
          <Linha label="Garantia:">
            <input type="date" value={garantiaInicio} onChange={(e) => setGarantiaInicio(e.target.value)} style={{ ...fld, width: 140 }} />
            <span style={{ fontSize: 12 }}>até</span>
            <input type="date" value={garantiaFim} onChange={(e) => setGarantiaFim(e.target.value)} style={{ ...fld, width: 140 }} />
          </Linha>

          {multiplos && (
            <>
              <div style={sec}>Informações Específicas</div>
              <Linha label="Quantidade:">
                <input
                  type="number"
                  min={1}
                  max={40}
                  value={qtd}
                  onChange={(e) => setQtd(Number(e.target.value))}
                  style={{ ...fld, width: 70, background: YELLOW }}
                />
                <button type="button" onClick={gerarGrade} style={gradeBtn}>
                  Gerar grade
                </button>
                <span style={{ fontSize: 12, marginLeft: 8 }}>TAG inicial:</span>
                <input value={tag} onChange={(e) => setTag(e.target.value)} style={{ ...fld, width: 160 }} />
              </Linha>
              {grade.length > 0 && (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, background: "white" }}>
                  <thead>
                    <tr>
                      <th style={th}>TAG</th>
                      <th style={th}>Nº Série</th>
                      <th style={th}>Patrimônio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grade.map((r, i) => (
                      <tr key={i}>
                        <td style={td}>
                          <input
                            value={r.tag}
                            onChange={(e) =>
                              setGrade((g) => g.map((x, j) => (j === i ? { ...x, tag: e.target.value } : x)))
                            }
                            style={{ ...fld, width: "100%" }}
                          />
                        </td>
                        <td style={td}>
                          <input
                            value={r.nSerie}
                            onChange={(e) =>
                              setGrade((g) => g.map((x, j) => (j === i ? { ...x, nSerie: e.target.value } : x)))
                            }
                            style={{ ...fld, width: "100%" }}
                          />
                        </td>
                        <td style={td}>
                          <input
                            value={r.patrimonio}
                            onChange={(e) =>
                              setGrade((g) => g.map((x, j) => (j === i ? { ...x, patrimonio: e.target.value } : x)))
                            }
                            style={{ ...fld, width: "100%" }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </>
      )}

      {tab === "obs" && (
        <Linha label="Observação:" align="start">
          <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={8} style={{ ...fld, height: "auto", flex: 1, padding: 8 }} />
        </Linha>
      )}
    </WinForm>
  );
}

export function EquipamentoNovoOverlay({
  multiplos,
  onClose,
  onCreated,
}: {
  multiplos?: boolean;
  onClose: () => void;
  onCreated: (tag: string, continuar: boolean) => void;
}) {
  return (
    <Overlay onClose={onClose} fixed>
      <EquipamentoNovoDialog multiplos={multiplos} onClose={onClose} onCreated={onCreated} />
    </Overlay>
  );
}

function tabBtn(active: boolean): CSSProperties {
  return {
    border: "1px solid #bbb",
    background: active ? "white" : "#ddd",
    padding: "4px 12px",
    fontSize: 12,
    fontWeight: active ? 700 : 500,
    cursor: "pointer",
  };
}

const sec: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#555",
  margin: "4px 0 8px",
  paddingBottom: 4,
  borderBottom: "1px solid #ccc",
};

const gradeBtn: CSSProperties = {
  marginLeft: 8,
  height: 24,
  padding: "0 10px",
  fontSize: 12,
  border: "1px solid #888",
  background: "#f3f3f3",
  cursor: "pointer",
};

const th: CSSProperties = {
  background: "#7a7a7a",
  color: "white",
  textAlign: "left",
  padding: "4px 6px",
};
const td: CSSProperties = { padding: 4, borderBottom: "1px solid #eee" };
