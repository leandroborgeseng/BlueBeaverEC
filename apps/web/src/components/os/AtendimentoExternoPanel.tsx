"use client";

import { useCallback, useEffect, useState } from "react";
import { api, downloadApi } from "@/lib/api";
import { filesToAnexos } from "@/lib/os-ui";
import {
  LABEL_DECISAO_ORCAMENTO,
  LABEL_STATUS_ATENDIMENTO,
  type StatusAtendimentoExterno,
} from "@aion/shared";
import { Badge, Btn, Empty, Err, FieldLabel, fieldStyle } from "@/components/ui/aion-ui";

interface Lookup {
  id: string;
  nome: string;
}

interface Atend {
  id: string;
  status: StatusAtendimentoExterno;
  transporte?: string | null;
  acessorios?: string | null;
  identificacaoEquipamento?: string | null;
  enviadoEm?: string | null;
  previsaoRetorno?: string | null;
  retornadoEm?: string | null;
  foraDoHospital: boolean;
  pendenciaRetorno: boolean;
  conferenciaOk?: boolean | null;
  conferenciaObs?: string | null;
  condicaoFinal?: string | null;
  observacoes?: string | null;
  fornecedor: { id: string; nome: string };
  contrato?: { numero: string; tipo: string; cobrePecas: boolean; cobreServicos: boolean } | null;
  custos: { informado: number | null; aprovado: number | null; realizado: number | null };
  cobertura: {
    garantiaAquisicao: { vigente: boolean; fim: string | null };
    contratoManutencao: { numero: string; vigente: boolean } | null;
  };
  orcamentos: Array<{
    id: string;
    versao: number;
    valor: string | number;
    descricao?: string | null;
    decisao: string;
    modoDecisao?: string | null;
    nomeArquivo?: string | null;
    decisaoPor?: { nome: string } | null;
    responsavelExterno?: string | null;
    decisaoEm?: string | null;
  }>;
  documentos: Array<{ id: string; tipo: string; nomeArquivo: string }>;
  eventos: Array<{ id: string; acao: string; detalhe?: string | null; createdAt: string; usuario?: { nome: string } | null }>;
}

function money(v: number | null | undefined) {
  if (v == null) return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function AtendimentoExternoPanel({ numero }: { numero: number }) {
  const [items, setItems] = useState<Atend[]>([]);
  const [fornecedores, setFornecedores] = useState<Lookup[]>([]);
  const [contratos, setContratos] = useState<Array<Lookup & { numero?: string; fornecedorId?: string }>>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fornecedorId, setFornecedorId] = useState("");
  const [contratoId, setContratoId] = useState("");
  const [valorOrc, setValorOrc] = useState("");
  const [descOrc, setDescOrc] = useState("");
  const [modo, setModo] = useState<"APROVACAO_INTERNA" | "AUTORIZACAO_EXTERNA">("APROVACAO_INTERNA");
  const [respExt, setRespExt] = useState("");
  const [dataExt, setDataExt] = useState("");
  const [transporte, setTransporte] = useState("");
  const [acessorios, setAcessorios] = useState("");
  const [previsao, setPrevisao] = useState("");
  const [custoReal, setCustoReal] = useState("");
  const [obsConf, setObsConf] = useState("");
  const [condicao, setCondicao] = useState("APTO");

  const load = useCallback(async () => {
    const [a, f, c] = await Promise.all([
      api<Atend[]>(`/os/${numero}/atendimento-externo`),
      api<Lookup[]>("/fornecedores"),
      api<Array<Lookup & { numero: string; fornecedor?: { id: string } }>>("/contratos"),
    ]);
    setItems(a);
    setFornecedores(f);
    setContratos(
      c.map((x) => ({
        id: x.id,
        nome: `${x.numero} · ${x.nome ?? ""}`.trim(),
        numero: x.numero,
        fornecedorId: (x as { fornecedor?: { id: string } }).fornecedor?.id,
      })),
    );
  }, [numero]);

  useEffect(() => {
    void load().catch((e) => setErro(e instanceof Error ? e.message : "Erro"));
  }, [load]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setErro(null);
    setMsg(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  const ativo = items.find((i) => !["CANCELADO", "LIBERADO"].includes(i.status)) ?? null;
  const contratosDoForn = contratos.filter((c) => !fornecedorId || c.fornecedorId === fornecedorId);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {erro && <Err>{erro}</Err>}
      {msg && <div style={{ fontSize: 13, fontWeight: 600, color: "oklch(0.4 0.14 150)" }}>{msg}</div>}
      <p style={{ margin: 0, fontSize: 12, color: "oklch(0.45 0.02 250)", lineHeight: 1.45 }}>
        Encaminhamento usa esta OS — não abre outra. A decisão fica registrada aqui; o sistema não envia
        autorização ao fornecedor. Garantia de aquisição não é contrato de manutenção.
      </p>

      {!ativo && (
        <div style={{ display: "grid", gap: 8 }}>
          <FieldLabel>Abrir encaminhamento</FieldLabel>
          <select value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)} style={fieldStyle}>
            <option value="">Fornecedor…</option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
          <select value={contratoId} onChange={(e) => setContratoId(e.target.value)} style={fieldStyle}>
            <option value="">Contrato de manutenção (opcional)</option>
            {contratosDoForn.map((c) => (
              <option key={c.id} value={c.id}>
                {c.numero ?? c.nome}
              </option>
            ))}
          </select>
          <Btn
            disabled={busy || !fornecedorId}
            onClick={() =>
              void run(async () => {
                await api(`/os/${numero}/atendimento-externo`, {
                  method: "POST",
                  body: JSON.stringify({ fornecedorId, contratoId: contratoId || undefined }),
                });
                setMsg("Encaminhamento aberto nesta OS");
              })
            }
          >
            Vincular fornecedor
          </Btn>
        </div>
      )}

      {items.length === 0 && <Empty text="Nenhum encaminhamento nesta OS." />}

      {items.map((a) => (
        <div
          key={a.id}
          style={{
            border: "1px solid oklch(0.91 0.006 255)",
            borderRadius: 10,
            padding: 12,
            display: "grid",
            gap: 8,
            fontSize: 13,
          }}
        >
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <strong>{a.fornecedor.nome}</strong>
            <Badge tone={a.status}>{LABEL_STATUS_ATENDIMENTO[a.status] ?? a.status}</Badge>
            {a.foraDoHospital && <Badge tone="PARADO">Fora do hospital</Badge>}
            {a.pendenciaRetorno && <Badge tone="warning">Pendência de retorno</Badge>}
          </div>
          <div>
            Garantia de aquisição: {a.cobertura.garantiaAquisicao.vigente ? "vigente" : "não vigente"}
            {a.contrato
              ? ` · Contrato manutenção ${a.contrato.numero} (peças ${a.contrato.cobrePecas ? "sim" : "não"} / serviços ${a.contrato.cobreServicos ? "sim" : "não"})`
              : " · sem contrato de manutenção neste encaminhamento"}
          </div>
          <div>
            Custo informado {money(a.custos.informado)} · aprovado {money(a.custos.aprovado)} · realizado{" "}
            {money(a.custos.realizado)}
          </div>
          {a.identificacaoEquipamento && <div>ID: {a.identificacaoEquipamento}</div>}
          {a.previsaoRetorno && (
            <div>Previsão de retorno: {new Date(a.previsaoRetorno).toLocaleDateString("pt-BR")}</div>
          )}

          {a.orcamentos.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {a.orcamentos.map((o) => (
                <li key={o.id}>
                  v{o.versao} · {money(Number(o.valor))} · {LABEL_DECISAO_ORCAMENTO[o.decisao as keyof typeof LABEL_DECISAO_ORCAMENTO] ?? o.decisao}
                  {o.decisaoPor?.nome ? ` · ${o.decisaoPor.nome}` : ""}
                  {o.responsavelExterno ? ` · ext. ${o.responsavelExterno}` : ""}
                  {o.nomeArquivo ? (
                    <>
                      {" "}
                      <button
                        type="button"
                        style={{ background: "none", border: "none", color: "oklch(0.45 0.12 250)", cursor: "pointer" }}
                        onClick={() =>
                          void downloadApi(
                            `/atendimentos-externos/${a.id}/orcamentos/${o.id}`,
                            undefined,
                            o.nomeArquivo ?? "orcamento",
                          )
                        }
                      >
                        documento
                      </button>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {ativo?.id === a.id && (
            <div style={{ display: "grid", gap: 10, marginTop: 6 }}>
              {(a.status === "ORCAMENTO" || a.status === "ORCAMENTO_RECEBIDO" || a.status === "DECISAO") && (
                <div style={{ display: "grid", gap: 6 }}>
                  <FieldLabel>Nova versão de orçamento</FieldLabel>
                  <input
                    value={valorOrc}
                    onChange={(e) => setValorOrc(e.target.value)}
                    type="number"
                    min={0}
                    placeholder="Valor"
                    style={fieldStyle}
                  />
                  <input
                    value={descOrc}
                    onChange={(e) => setDescOrc(e.target.value)}
                    placeholder="Descrição"
                    style={fieldStyle}
                  />
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => {
                      const input = e.currentTarget;
                      void run(async () => {
                        const anexos = await filesToAnexos(input.files);
                        await api(`/os/${numero}/atendimento-externo/orcamentos`, {
                          method: "POST",
                          body: JSON.stringify({
                            valor: Number(valorOrc),
                            descricao: descOrc || undefined,
                            dataUrl: anexos[0]?.dataUrl,
                            nomeArquivo: anexos[0]?.nomeArquivo,
                          }),
                        });
                        setValorOrc("");
                        setDescOrc("");
                        setMsg("Orçamento registrado (não enviado ao fornecedor)");
                      });
                    }}
                  />
                  <Btn
                    size="sm"
                    disabled={busy || !valorOrc}
                    onClick={() =>
                      void run(async () => {
                        await api(`/os/${numero}/atendimento-externo/orcamentos`, {
                          method: "POST",
                          body: JSON.stringify({ valor: Number(valorOrc), descricao: descOrc || undefined }),
                        });
                        setValorOrc("");
                        setDescOrc("");
                        setMsg("Orçamento registrado (não enviado ao fornecedor)");
                      })
                    }
                  >
                    Registrar orçamento
                  </Btn>
                </div>
              )}

              {(a.status === "ORCAMENTO_RECEBIDO" || a.status === "DECISAO") && (
                <div style={{ display: "grid", gap: 6 }}>
                  <FieldLabel>Decisão (reutiliza aprovação da OS; sem alçada inventada)</FieldLabel>
                  <select
                    value={modo}
                    onChange={(e) => setModo(e.target.value as typeof modo)}
                    style={fieldStyle}
                  >
                    <option value="APROVACAO_INTERNA">Aprovação interna</option>
                    <option value="AUTORIZACAO_EXTERNA">Autorizada fora do sistema</option>
                  </select>
                  {modo === "AUTORIZACAO_EXTERNA" && (
                    <>
                      <input
                        value={respExt}
                        onChange={(e) => setRespExt(e.target.value)}
                        placeholder="Responsável externo"
                        style={fieldStyle}
                      />
                      <input
                        type="date"
                        value={dataExt}
                        onChange={(e) => setDataExt(e.target.value)}
                        style={fieldStyle}
                      />
                    </>
                  )}
                  <div style={{ display: "flex", gap: 8 }}>
                    <Btn
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await api(`/os/${numero}/atendimento-externo/decisao`, {
                            method: "POST",
                            body: JSON.stringify({
                              decisao: "APROVADO",
                              modo,
                              responsavelExterno: respExt || undefined,
                              dataAutorizacaoExterna: dataExt || undefined,
                            }),
                          });
                          setMsg("Decisão registrada internamente");
                        })
                      }
                    >
                      Aprovar
                    </Btn>
                    <Btn
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await api(`/os/${numero}/atendimento-externo/decisao`, {
                            method: "POST",
                            body: JSON.stringify({
                              decisao: "REPROVADO",
                              modo,
                              responsavelExterno: respExt || undefined,
                              dataAutorizacaoExterna: dataExt || undefined,
                            }),
                          });
                          setMsg("Reprovado — nada foi enviado ao fornecedor");
                        })
                      }
                    >
                      Reprovar
                    </Btn>
                  </div>
                </div>
              )}

              {a.status === "DECISAO" && (
                <div style={{ display: "grid", gap: 6 }}>
                  <FieldLabel>Envio (manual — o sistema não despacha)</FieldLabel>
                  <input
                    value={transporte}
                    onChange={(e) => setTransporte(e.target.value)}
                    placeholder="Transporte"
                    style={fieldStyle}
                  />
                  <input
                    value={acessorios}
                    onChange={(e) => setAcessorios(e.target.value)}
                    placeholder="Acessórios"
                    style={fieldStyle}
                  />
                  <input type="date" value={previsao} onChange={(e) => setPrevisao(e.target.value)} style={fieldStyle} />
                  <Btn
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await api(`/os/${numero}/atendimento-externo/envio`, {
                          method: "POST",
                          body: JSON.stringify({
                            transporte: transporte || undefined,
                            acessorios: acessorios || undefined,
                            previsaoRetorno: previsao || undefined,
                          }),
                        });
                        setMsg("Envio registrado; equipamento fora do hospital");
                      })
                    }
                  >
                    Registrar envio
                  </Btn>
                </div>
              )}

              {(a.status === "ENVIADO" || a.status === "AGUARDANDO_RETORNO") && (
                <div style={{ display: "grid", gap: 6 }}>
                  <FieldLabel>Previsão / retorno</FieldLabel>
                  <input type="date" value={previsao} onChange={(e) => setPrevisao(e.target.value)} style={fieldStyle} />
                  <Btn
                    size="sm"
                    variant="secondary"
                    disabled={busy || !previsao}
                    onClick={() =>
                      void run(async () => {
                        await api(`/os/${numero}/atendimento-externo/previsao`, {
                          method: "POST",
                          body: JSON.stringify({ previsaoRetorno: previsao }),
                        });
                      })
                    }
                  >
                    Atualizar previsão
                  </Btn>
                  <input
                    value={custoReal}
                    onChange={(e) => setCustoReal(e.target.value)}
                    type="number"
                    placeholder="Custo realizado (opcional)"
                    style={fieldStyle}
                  />
                  <Btn
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await api(`/os/${numero}/atendimento-externo/retorno`, {
                          method: "POST",
                          body: JSON.stringify({
                            custoRealizado: custoReal ? Number(custoReal) : undefined,
                          }),
                        });
                        setMsg("Retorno físico registrado — conferência obrigatória antes do uso");
                      })
                    }
                  >
                    Registrar retorno
                  </Btn>
                </div>
              )}

              {(a.status === "RETORNADO" || a.status === "CONFERENCIA") && (
                <div style={{ display: "grid", gap: 6 }}>
                  <FieldLabel>Conferência técnica (obrigatória para liberar)</FieldLabel>
                  <textarea
                    value={obsConf}
                    onChange={(e) => setObsConf(e.target.value)}
                    rows={2}
                    placeholder="Observação da conferência"
                    style={fieldStyle}
                  />
                  <select value={condicao} onChange={(e) => setCondicao(e.target.value)} style={fieldStyle}>
                    <option value="APTO">Apto para uso</option>
                    <option value="RESTRITO">Uso restrito</option>
                    <option value="PARADO">Parado</option>
                  </select>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Btn
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await api(`/os/${numero}/atendimento-externo/conferencia`, {
                            method: "POST",
                            body: JSON.stringify({
                              ok: true,
                              condicaoFinal: condicao,
                              observacao: obsConf || undefined,
                              custoRealizado: custoReal ? Number(custoReal) : undefined,
                            }),
                          });
                          setMsg("Conferência aprovada · condição aplicada");
                        })
                      }
                    >
                      Aprovar conferência
                    </Btn>
                    <Btn
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await api(`/os/${numero}/atendimento-externo/conferencia`, {
                            method: "POST",
                            body: JSON.stringify({
                              ok: false,
                              condicaoFinal: condicao === "APTO" ? "PARADO" : condicao,
                              observacao: obsConf || undefined,
                            }),
                          });
                          setMsg("Não liberado para uso");
                        })
                      }
                    >
                      Reprovar conferência
                    </Btn>
                  </div>
                </div>
              )}
            </div>
          )}

          {a.eventos.length > 0 && (
            <div style={{ color: "oklch(0.45 0.02 250)", fontSize: 12 }}>
              {a.eventos.slice(0, 5).map((ev) => (
                <div key={ev.id}>
                  {ev.acao} · {ev.detalhe ?? ""} · {ev.usuario?.nome ?? ""}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
