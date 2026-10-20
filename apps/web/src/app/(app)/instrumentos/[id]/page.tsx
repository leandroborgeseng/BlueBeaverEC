"use client";

import { formatarDataCivil } from "@aion/shared";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { api, downloadApi } from "@/lib/api";
import { camposObrigatoriosFaltando } from "@/lib/padrao-cadastro";
import {
  Badge,
  Btn,
  DataTable,
  Empty,
  Err,
  FieldLabel,
  PageHeader,
  Surface,
  fieldStyle,
  td,
  th,
} from "@/components/ui/aion-ui";

interface Ponto {
  id: string;
  ordem: number;
  grandeza?: string | null;
  unidade: string;
  valorNominal?: number | null;
  valorConvencional?: number | null;
  indicacao?: number | null;
  correcao?: number | null;
  incertezaExpandida: number;
  fatorK?: number | null;
  probabilidadeAbrangencia?: number | null;
}

interface Cert {
  id: string;
  numero: string;
  dataEmissao: string;
  dataValidade: string;
  laboratorioEmissor?: string | null;
  laboratorioAcreditacao?: string | null;
  fatorAbrangencia?: number | null;
  probabilidadeAbrangencia?: number | null;
  vigente: boolean;
  temAnexo: boolean;
  /** usado em laudo final: dados metrológicos e PDF só mudam por revisão */
  usadoEmLaudoFinal?: boolean;
  revisao?: number | null;
  revisaoDeId?: string | null;
  substituido?: boolean;
  statusCertificado: string;
  pontos: Ponto[];
  observacoes?: string | null;
}

interface Padrao {
  id: string;
  nome: string;
  nSerie: string;
  fabricante?: string | null;
  modelo?: string | null;
  codigoPatrimonio?: string | null;
  grandezas: string[];
  faixaMedicao?: string | null;
  resolucao?: string | null;
  observacoes?: string | null;
  tipoAnalisador?: string | null;
  cadastroIncompleto?: boolean;
  camposFaltando?: string[];
  statusCertificado: string;
  certificados: Cert[];
}

type PontoDraft = {
  grandeza: string;
  unidade: string;
  valorNominal: string;
  valorConvencional: string;
  indicacao: string;
  incertezaExpandida: string;
  fatorK: string;
  probabilidadeAbrangencia: string;
};

const emptyPonto = (): PontoDraft => ({
  grandeza: "",
  unidade: "°C",
  valorNominal: "",
  valorConvencional: "",
  indicacao: "",
  incertezaExpandida: "",
  fatorK: "",
  probabilidadeAbrangencia: "",
});

function textoProb(p: number | null | undefined): string {
  return p == null ? "não informada" : `${p.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}%`;
}

function numOrUndef(s: string): number | undefined {
  if (s.trim() === "") return undefined;
  const n = Number(s.replace(",", "."));
  return Number.isNaN(n) ? undefined : n;
}

export default function InstrumentoDetailPage() {
  const params = useParams();
  const id = String(params.id ?? "");

  const [padrao, setPadrao] = useState<Padrao | null>(null);
  const [certId, setCertId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pontos, setPontos] = useState<PontoDraft[]>([emptyPonto()]);
  const [anexoDataUrl, setAnexoDataUrl] = useState<string | undefined>();
  const [anexoNome, setAnexoNome] = useState<string | undefined>();
  const [modo, setModo] = useState<{ tipo: "novo" | "editar" | "revisao"; cert?: Cert }>({ tipo: "novo" });
  const [formKey, setFormKey] = useState(0);
  const [obsAberta, setObsAberta] = useState(false);
  const [obsTexto, setObsTexto] = useState("");
  const [obsErro, setObsErro] = useState<string | null>(null);
  const [obsSalvando, setObsSalvando] = useState(false);

  async function salvarObservacao(c: Cert) {
    if (!padrao) return;
    setObsErro(null);
    setObsSalvando(true);
    try {
      // PATCH com os dados atuais + observação nova: a API só aceita mudar a observação em certificado usado
      await api(`/instrumentos-padroes/${padrao.id}/certificados/${c.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          numero: c.numero,
          dataEmissao: c.dataEmissao,
          dataValidade: c.dataValidade,
          laboratorioEmissor: c.laboratorioEmissor ?? undefined,
          laboratorioAcreditacao: c.laboratorioAcreditacao ?? undefined,
          fatorAbrangencia: c.fatorAbrangencia ?? undefined,
          probabilidadeAbrangencia: c.probabilidadeAbrangencia ?? undefined,
          observacoes: obsTexto,
          pontos: c.pontos.map((p) => ({
            ordem: p.ordem,
            grandeza: p.grandeza ?? undefined,
            unidade: p.unidade,
            valorNominal: p.valorNominal ?? undefined,
            valorConvencional: p.valorConvencional ?? undefined,
            indicacao: p.indicacao ?? undefined,
            correcao: p.correcao ?? undefined,
            incertezaExpandida: p.incertezaExpandida,
            fatorK: p.fatorK ?? undefined,
            probabilidadeAbrangencia: p.probabilidadeAbrangencia ?? undefined,
          })),
        }),
      });
      setObsAberta(false);
      setMsg("Observação atualizada. A alteração ficou registrada na auditoria.");
      await load();
    } catch (err) {
      // mantém o texto digitado; erro ao lado do campo
      setObsErro(err instanceof Error ? err.message : "Não foi possível salvar a observação");
    } finally {
      setObsSalvando(false);
    }
  }

  function abrirFormulario(tipo: "novo" | "editar" | "revisao", cert?: Cert) {
    setModo({ tipo, cert });
    setFormKey((k) => k + 1);
    setAnexoDataUrl(undefined);
    setAnexoNome(undefined);
    setPontos(
      cert?.pontos.length
        ? cert.pontos.map((p) => ({
            grandeza: p.grandeza ?? "",
            unidade: p.unidade,
            valorNominal: p.valorNominal != null ? String(p.valorNominal) : "",
            valorConvencional: p.valorConvencional != null ? String(p.valorConvencional) : "",
            indicacao: p.indicacao != null ? String(p.indicacao) : "",
            incertezaExpandida: String(p.incertezaExpandida),
            fatorK: p.fatorK != null ? String(p.fatorK) : "",
            probabilidadeAbrangencia: p.probabilidadeAbrangencia != null ? String(p.probabilidadeAbrangencia) : "",
          }))
        : [emptyPonto()],
    );
  }

  const load = useCallback(async () => {
    const data = await api<Padrao>(`/instrumentos-padroes/${id}`);
    setPadrao(data);
    const vigente = data.certificados.find((c) => c.vigente) ?? data.certificados[0];
    setCertId((prev) => prev ?? vigente?.id ?? null);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    void load().catch((e) => setErro(e instanceof Error ? e.message : "Erro"));
  }, [id, load]);

  const certSelecionado = useMemo(
    () => padrao?.certificados.find((c) => c.id === certId) ?? null,
    [padrao, certId],
  );

  async function onSaveInfo(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!padrao) return;
    setErro(null);
    const fd = new FormData(e.currentTarget);
    const grandezas = String(fd.get("grandezas") || "")
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const falta = camposObrigatoriosFaltando({
      tipoAnalisador: String(fd.get("tipoAnalisador") || ""),
      grandezas,
      faixaMedicao: String(fd.get("faixaMedicao") || ""),
      resolucao: String(fd.get("resolucao") || ""),
    });
    if (falta.length) {
      setErro(`Preencha os campos obrigatórios: ${falta.join(", ")}`);
      return;
    }
    try {
      const updated = await api<Padrao>(`/instrumentos-padroes/${padrao.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          nome: String(fd.get("nome")),
          nSerie: String(fd.get("nSerie")),
          fabricante: String(fd.get("fabricante") || "") || null,
          modelo: String(fd.get("modelo") || "") || null,
          codigoPatrimonio: String(fd.get("codigoPatrimonio") || "") || null,
          grandezas,
          tipoAnalisador: String(fd.get("tipoAnalisador") || "") || null,
          faixaMedicao: String(fd.get("faixaMedicao") || "") || null,
          resolucao: String(fd.get("resolucao") || "") || null,
          observacoes: String(fd.get("observacoes") || "") || null,
        }),
      });
      setPadrao(updated);
      setMsg("Dados do padrão salvos");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro");
    }
  }

  async function onAddCert(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!padrao) return;
    setErro(null);
    setMsg(null);
    const fd = new FormData(e.currentTarget);

    const pontosPayload = pontos
      .map((p, idx) => ({
        ordem: idx + 1,
        grandeza: p.grandeza.trim() || undefined,
        unidade: p.unidade.trim(),
        valorNominal: numOrUndef(p.valorNominal),
        valorConvencional: numOrUndef(p.valorConvencional),
        indicacao: numOrUndef(p.indicacao),
        incertezaExpandida: numOrUndef(p.incertezaExpandida),
        // vazio = herda do certificado (não injeta 2)
        fatorK: numOrUndef(p.fatorK),
        probabilidadeAbrangencia: numOrUndef(p.probabilidadeAbrangencia),
      }))
      .filter((p) => p.unidade && p.incertezaExpandida != null);

    if (pontosPayload.length === 0) {
      setErro("Informe ao menos um ponto com unidade e incerteza expandida (U)");
      return;
    }
    const kCert = numOrUndef(String(fd.get("fatorAbrangencia") || ""));
    const probCert = numOrUndef(String(fd.get("probabilidadeAbrangencia") || ""));
    const semK = pontosPayload.findIndex((p) => p.fatorK == null && kCert == null);
    if (semK >= 0) {
      setErro(`Ponto ${semK + 1}: informe k no ponto ou no certificado`);
      return;
    }

    try {
      const base = `/instrumentos-padroes/${padrao.id}/certificados`;
      const url =
        modo.tipo === "editar" && modo.cert
          ? `${base}/${modo.cert.id}`
          : modo.tipo === "revisao" && modo.cert
            ? `${base}/${modo.cert.id}/revisoes`
            : base;
      const created = await api<Cert>(url, {
        method: modo.tipo === "editar" ? "PATCH" : "POST",
        body: JSON.stringify({
          numero: String(fd.get("numero")),
          dataEmissao: String(fd.get("dataEmissao")),
          dataValidade: String(fd.get("dataValidade")),
          laboratorioEmissor: String(fd.get("laboratorioEmissor") || "") || undefined,
          laboratorioAcreditacao: String(fd.get("laboratorioAcreditacao") || "") || undefined,
          fatorAbrangencia: kCert,
          probabilidadeAbrangencia: probCert,
          observacoes: String(fd.get("observacoes") || "") || undefined,
          vigente: true,
          pontos: pontosPayload,
          anexoDataUrl,
          anexoNome,
        }),
      });
      e.currentTarget.reset();
      setPontos([emptyPonto()]);
      setAnexoDataUrl(undefined);
      setAnexoNome(undefined);
      setMsg(
        modo.tipo === "editar"
          ? `Certificado ${created.numero} atualizado`
          : modo.tipo === "revisao"
            ? `Revisão ${created.revisao ?? ""} do certificado ${created.numero} cadastrada; a anterior deixou de ser vigente`
            : `Certificado ${created.numero} cadastrado com ${pontosPayload.length} ponto(s)`,
      );
      setModo({ tipo: "novo" });
      setFormKey((k) => k + 1);
      await load();
      setCertId(created.id);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro");
    }
  }

  function onFile(file: File | null) {
    if (!file) {
      setAnexoDataUrl(undefined);
      setAnexoNome(undefined);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAnexoDataUrl(String(reader.result));
      setAnexoNome(file.name);
    };
    reader.readAsDataURL(file);
  }

  if (!padrao && !erro) {
    return <div style={{ color: "oklch(0.5 0.02 250)" }}>Carregando padrão…</div>;
  }

  return (
    <div>
      <PageHeader
        title={padrao?.nome ?? "Padrão"}
        subtitle={
          <>
            <Link href="/instrumentos" style={{ color: "oklch(0.45 0.05 250)" }}>
              ← Instrumentos e Padrões
            </Link>
            {padrao ? ` · S/N ${padrao.nSerie}` : null}
          </>
        }
        actions={
          padrao ? (
            <Badge
              tone={
                padrao.statusCertificado === "VALIDO"
                  ? "VALIDO"
                  : padrao.statusCertificado === "A_VENCER"
                    ? "A_VENCER"
                    : "VENCIDO"
              }
            >
              {padrao.statusCertificado.replace("_", " ")}
            </Badge>
          ) : null
        }
      />

      {erro && <Err>{erro}</Err>}
      {padrao?.cadastroIncompleto && (
        <div
          data-testid="aviso-cadastro-incompleto"
          role="status"
          style={{ fontSize: 13, marginBottom: 12, padding: "8px 12px", borderRadius: 6, background: "#fff4d6", color: "#7a5200", border: "1px solid #e8c766" }}
        >
          <Badge tone="A_VENCER">Cadastro incompleto</Badge> Falta: {(padrao.camposFaltando ?? []).join(", ")}. Complete para salvar
          alterações e usar como preferencial.
        </div>
      )}
      {msg && (
        <div style={{ fontSize: 13, fontWeight: 600, color: "oklch(0.4 0.14 150)", marginBottom: 12 }}>
          {msg}
        </div>
      )}

      {padrao && (
        <>
          <Surface style={{ marginBottom: 16 }}>
            <form
              onSubmit={(e) => void onSaveInfo(e)}
              style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}
            >
              <div>
                <FieldLabel>Nome</FieldLabel>
                <input name="nome" defaultValue={padrao.nome} required style={fieldStyle} />
              </div>
              <div>
                <FieldLabel>Nº série</FieldLabel>
                <input name="nSerie" defaultValue={padrao.nSerie} required style={fieldStyle} />
              </div>
              <div>
                <FieldLabel>Patrimônio</FieldLabel>
                <input
                  name="codigoPatrimonio"
                  defaultValue={padrao.codigoPatrimonio ?? ""}
                  style={fieldStyle}
                />
              </div>
              <div>
                <FieldLabel>Fabricante</FieldLabel>
                <input name="fabricante" defaultValue={padrao.fabricante ?? ""} style={fieldStyle} />
              </div>
              <div>
                <FieldLabel>Modelo</FieldLabel>
                <input name="modelo" defaultValue={padrao.modelo ?? ""} style={fieldStyle} />
              </div>
              <div>
                <FieldLabel>Tipo de analisador *</FieldLabel>
                <input
                  name="tipoAnalisador"
                  required
                  defaultValue={padrao.tipoAnalisador ?? ""}
                  placeholder="segurança elétrica, desfibrilador"
                  style={fieldStyle}
                />
              </div>
              <div>
                <FieldLabel>Grandezas *</FieldLabel>
                <input
                  name="grandezas"
                  required
                  defaultValue={padrao.grandezas.join(", ")}
                  placeholder="temperatura, umidade"
                  style={fieldStyle}
                />
              </div>
              <div>
                <FieldLabel>Faixa *</FieldLabel>
                <input name="faixaMedicao" required defaultValue={padrao.faixaMedicao ?? ""} style={fieldStyle} />
              </div>
              <div>
                <FieldLabel>Resolução *</FieldLabel>
                <input name="resolucao" required defaultValue={padrao.resolucao ?? ""} style={fieldStyle} />
              </div>
              <div>
                <FieldLabel>Observações</FieldLabel>
                <input name="observacoes" defaultValue={padrao.observacoes ?? ""} style={fieldStyle} />
              </div>
              <div style={{ display: "flex", alignItems: "end" }}>
                <Btn type="submit">Salvar dados</Btn>
              </div>
            </form>
          </Surface>

          <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 16, marginBottom: 16 }}>
            <Surface>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Certificados</div>
              {padrao.certificados.length === 0 ? (
                <Empty text="Nenhum certificado." />
              ) : (
                <div style={{ display: "grid", gap: 6 }}>
                  {padrao.certificados.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCertId(c.id)}
                      style={{
                        textAlign: "left",
                        padding: "8px 10px",
                        borderRadius: 8,
                        border:
                          c.id === certId
                            ? "1px solid var(--aion-primary)"
                            : "1px solid oklch(0.9 0.01 250)",
                        background: c.id === certId ? "oklch(0.97 0.02 70)" : "white",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{c.numero}</div>
                      <div style={{ fontSize: 11, color: "oklch(0.5 0.02 250)" }}>
                        válido até {formatarDataCivil(c.dataValidade)}
                        {c.vigente ? " · vigente" : ""}
                      </div>
                      <div style={{ fontSize: 11 }}>{c.pontos.length} ponto(s)</div>
                    </button>
                  ))}
                </div>
              )}
            </Surface>

            <Surface>
              {!certSelecionado ? (
                <Empty text="Selecione ou cadastre um certificado." />
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <div>
                      <strong>{certSelecionado.numero}</strong>
                      <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)" }}>
                        Emissão {formatarDataCivil(certSelecionado.dataEmissao)} ·
                        Validade {formatarDataCivil(certSelecionado.dataValidade)}
                        {certSelecionado.laboratorioEmissor
                          ? ` · ${certSelecionado.laboratorioEmissor}`
                          : ""}
                        {certSelecionado.laboratorioAcreditacao
                          ? ` (${certSelecionado.laboratorioAcreditacao})`
                          : ""}
                      </div>
                      {certSelecionado.usadoEmLaudoFinal && !certSelecionado.substituido && (
                        <div role="note" style={{ fontSize: 12, marginTop: 4 }}>
                          <div style={{ fontWeight: 600 }}>Certificado usado em laudos emitidos; cadastre uma revisão</div>
                          <div>Pontos, k, U, probabilidade, validade e PDF só mudam por revisão.</div>
                          {!obsAberta ? (
                            <button
                              type="button"
                             
                              onClick={() => {
                                setObsTexto(certSelecionado.observacoes ?? "");
                                setObsErro(null);
                                setObsAberta(true);
                              }}
                              style={{ background: "none", border: 0, padding: "10px 0", minHeight: 44, color: "inherit", textDecoration: "underline", cursor: "pointer", font: "inherit" }}
                            >
                              Editar observação
                            </button>
                          ) : (
                            <div style={{ display: "grid", gap: 6, marginTop: 6, maxWidth: 520 }}>
                              <label htmlFor="obs-cert" style={{ fontWeight: 600 }}>Observação do certificado</label>
                              <textarea
                                id="obs-cert"
                                value={obsTexto}
                                onChange={(e) => setObsTexto(e.target.value)}
                                aria-invalid={Boolean(obsErro)}
                                aria-describedby={obsErro ? "obs-cert-erro" : undefined}
                                rows={3}
                                style={{ ...fieldStyle, minHeight: 66 }}
                              />
                              {obsErro && (
                                <div id="obs-cert-erro" role="alert" style={{ color: "oklch(0.45 0.18 25)", fontWeight: 600 }}>
                                  {obsErro}
                                </div>
                              )}
                              <div style={{ display: "flex", gap: 8 }}>
                                <Btn type="button" size="sm" disabled={obsSalvando} onClick={() => void salvarObservacao(certSelecionado)} style={{ minHeight: 44 }}>
                                  {obsSalvando ? "Salvando…" : "Salvar observação"}
                                </Btn>
                                <Btn type="button" variant="ghost" size="sm" onClick={() => setObsAberta(false)} style={{ minHeight: 44 }}>
                                  Cancelar
                                </Btn>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      <div style={{ fontSize: 12 }}>
                        k = {certSelecionado.fatorAbrangencia ?? "não informado"} · probabilidade de abrangência:{" "}
                        {textoProb(certSelecionado.probabilidadeAbrangencia)}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {certSelecionado.revisao != null && <Badge tone="INFO">Revisão {certSelecionado.revisao}</Badge>}
                      {certSelecionado.substituido && <Badge tone="INFO">Substituído por revisão</Badge>}
                      {!certSelecionado.substituido &&
                        (certSelecionado.usadoEmLaudoFinal ? (
                          <Btn variant="secondary" size="sm" type="button" onClick={() => abrirFormulario("revisao", certSelecionado)}>
                            Cadastrar revisão
                          </Btn>
                        ) : (
                          <Btn variant="secondary" size="sm" type="button" onClick={() => abrirFormulario("editar", certSelecionado)}>
                            Editar certificado
                          </Btn>
                        ))}
                      <Badge tone={certSelecionado.statusCertificado}>{certSelecionado.statusCertificado}</Badge>
                      {certSelecionado.temAnexo && (
                        <Btn
                          variant="secondary"
                          size="sm"
                          type="button"
                          onClick={() =>
                            void downloadApi(
                              `/instrumentos-padroes/${padrao.id}/certificados/${certSelecionado.id}/pdf`,
                              undefined,
                              `${certSelecionado.numero}.pdf`,
                            )
                          }
                        >
                          PDF
                        </Btn>
                      )}
                    </div>
                  </div>

                  <DataTable>
                    <thead>
                      <tr>
                        <th style={th}>#</th>
                        <th style={th}>Grandeza</th>
                        <th style={th}>Nominal</th>
                        <th style={th}>Convencional</th>
                        <th style={th}>Indicação</th>
                        <th style={th}>Correção</th>
                        <th style={th}>U</th>
                        <th style={th}>Unidade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {certSelecionado.pontos.length === 0 ? (
                        <tr>
                          <td colSpan={8} style={td}>
                            <Empty text="Certificado sem pontos metrológicos." />
                          </td>
                        </tr>
                      ) : (
                        certSelecionado.pontos.map((p, idx) => (
                          <tr key={p.id}>
                            <td style={td}>{idx + 1}</td>
                            <td style={td}>{p.grandeza ?? "—"}</td>
                            <td style={td}>{p.valorNominal ?? "—"}</td>
                            <td style={td}>{p.valorConvencional ?? "—"}</td>
                            <td style={td}>{p.indicacao ?? "—"}</td>
                            <td style={td}>{p.correcao ?? "—"}</td>
                            <td style={td}>
                              <strong>{p.incertezaExpandida}</strong>
                              {` (k=${p.fatorK ?? certSelecionado.fatorAbrangencia ?? "não informado"}`}
                              {p.fatorK == null && certSelecionado.fatorAbrangencia != null ? ", herdado" : ""}
                              {` · p=${textoProb(p.probabilidadeAbrangencia ?? certSelecionado.probabilidadeAbrangencia)})`}
                            </td>
                            <td style={td}>{p.unidade}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </DataTable>
                </div>
              )}
            </Surface>
          </div>

          <Surface>
            <div style={{ fontWeight: 700, marginBottom: 12 }}>
              {modo.tipo === "editar"
                ? `Editar certificado ${modo.cert?.numero ?? ""}`
                : modo.tipo === "revisao"
                  ? `Revisão do certificado ${modo.cert?.numero ?? ""}`
                  : "Novo certificado de calibração do padrão"}
            </div>
            {modo.tipo !== "novo" && (
              <div role="status" style={{ fontSize: 13, marginBottom: 10 }}>
                {modo.tipo === "revisao"
                  ? "Certificado usado em laudos emitidos; cadastre uma revisão. Os laudos emitidos continuam com o certificado e o PDF originais."
                  : "Certificado ainda não usado em laudo final: a edição é gravada no próprio cadastro e auditada."}{" "}
                <Btn variant="ghost" size="sm" type="button" onClick={() => abrirFormulario("novo")}>
                  Cancelar
                </Btn>
              </div>
            )}
            <form key={formKey} onSubmit={(e) => void onAddCert(e)} style={{ display: "grid", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                <div>
                  <FieldLabel>Nº certificado</FieldLabel>
                  <input name="numero" required defaultValue={modo.cert?.numero ?? ""} style={fieldStyle} />
                </div>
                <div>
                  <FieldLabel>Emissão</FieldLabel>
                  <input name="dataEmissao" type="date" required defaultValue={modo.cert?.dataEmissao?.slice(0, 10) ?? ""} style={fieldStyle} />
                </div>
                <div>
                  <FieldLabel>Validade</FieldLabel>
                  <input name="dataValidade" type="date" required defaultValue={modo.cert?.dataValidade?.slice(0, 10) ?? ""} style={fieldStyle} />
                </div>
                <div>
                  <FieldLabel>Laboratório</FieldLabel>
                  <input name="laboratorioEmissor" placeholder="Lab emissor" defaultValue={modo.cert?.laboratorioEmissor ?? ""} style={fieldStyle} />
                </div>
                <div>
                  <FieldLabel>Acreditação (RBC)</FieldLabel>
                  <input name="laboratorioAcreditacao" placeholder="CRL-XXXX" defaultValue={modo.cert?.laboratorioAcreditacao ?? ""} style={fieldStyle} />
                </div>
                <div>
                  <FieldLabel>k (abrangência)</FieldLabel>
                  <input name="fatorAbrangencia" type="number" step="any" min="0" placeholder="ex.: 2" defaultValue={modo.cert?.fatorAbrangencia ?? ""} style={fieldStyle} />
                </div>
                <div>
                  <FieldLabel>Probabilidade de abrangência (%)</FieldLabel>
                  <input
                    name="probabilidadeAbrangencia"
                    type="number"
                    step="any"
                    min="0"
                    max="100"
                    placeholder="não informada (ex.: 95,45)"
                    defaultValue={modo.cert?.probabilidadeAbrangencia ?? ""}
                    style={fieldStyle}
                  />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <FieldLabel>Observações</FieldLabel>
                  <input name="observacoes" defaultValue={modo.cert?.observacoes ?? ""} style={fieldStyle} />
                </div>
                <div>
                  <FieldLabel>PDF do certificado</FieldLabel>
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={(e) => onFile(e.target.files?.[0] ?? null)}
                    style={fieldStyle}
                  />
                </div>
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <FieldLabel>Pontos metrológicos (U obrigatória)</FieldLabel>
                  <Btn
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setPontos((p) => [...p, emptyPonto()])}
                  >
                    + ponto
                  </Btn>
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {pontos.map((p, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1.2fr 0.7fr repeat(4, 1fr) 0.6fr 0.8fr auto",
                        gap: 6,
                        alignItems: "end",
                      }}
                    >
                      <div>
                        {idx === 0 && <FieldLabel>Grandeza</FieldLabel>}
                        <input
                          placeholder="Temperatura"
                          value={p.grandeza}
                          onChange={(e) =>
                            setPontos((prev) =>
                              prev.map((x, i) => (i === idx ? { ...x, grandeza: e.target.value } : x)),
                            )
                          }
                          style={fieldStyle}
                        />
                      </div>
                      <div>
                        {idx === 0 && <FieldLabel>Unidade</FieldLabel>}
                        <input
                          required
                          value={p.unidade}
                          onChange={(e) =>
                            setPontos((prev) =>
                              prev.map((x, i) => (i === idx ? { ...x, unidade: e.target.value } : x)),
                            )
                          }
                          style={fieldStyle}
                        />
                      </div>
                      <div>
                        {idx === 0 && <FieldLabel>Nominal</FieldLabel>}
                        <input
                          type="number"
                          step="any"
                          value={p.valorNominal}
                          onChange={(e) =>
                            setPontos((prev) =>
                              prev.map((x, i) => (i === idx ? { ...x, valorNominal: e.target.value } : x)),
                            )
                          }
                          style={fieldStyle}
                        />
                      </div>
                      <div>
                        {idx === 0 && <FieldLabel>Convencional</FieldLabel>}
                        <input
                          type="number"
                          step="any"
                          value={p.valorConvencional}
                          onChange={(e) =>
                            setPontos((prev) =>
                              prev.map((x, i) =>
                                i === idx ? { ...x, valorConvencional: e.target.value } : x,
                              ),
                            )
                          }
                          style={fieldStyle}
                        />
                      </div>
                      <div>
                        {idx === 0 && <FieldLabel>Indicação</FieldLabel>}
                        <input
                          type="number"
                          step="any"
                          value={p.indicacao}
                          onChange={(e) =>
                            setPontos((prev) =>
                              prev.map((x, i) => (i === idx ? { ...x, indicacao: e.target.value } : x)),
                            )
                          }
                          style={fieldStyle}
                        />
                      </div>
                      <div>
                        {idx === 0 && <FieldLabel>U</FieldLabel>}
                        <input
                          type="number"
                          step="any"
                          required
                          value={p.incertezaExpandida}
                          onChange={(e) =>
                            setPontos((prev) =>
                              prev.map((x, i) =>
                                i === idx ? { ...x, incertezaExpandida: e.target.value } : x,
                              ),
                            )
                          }
                          style={fieldStyle}
                        />
                      </div>
                      <div>
                        {idx === 0 && <FieldLabel>k</FieldLabel>}
                        <input
                          type="number"
                          step="any"
                          value={p.fatorK}
                          placeholder="herda do certificado"
                          title="Vazio = herda do certificado"
                          aria-label={`Ponto ${idx + 1}: k (vazio herda do certificado)`}
                          onChange={(e) =>
                            setPontos((prev) =>
                              prev.map((x, i) => (i === idx ? { ...x, fatorK: e.target.value } : x)),
                            )
                          }
                          style={fieldStyle}
                        />
                      </div>
                      <div>
                        {idx === 0 && <FieldLabel>Prob. (%)</FieldLabel>}
                        <input
                          type="number"
                          step="any"
                          min="0"
                          max="100"
                          value={p.probabilidadeAbrangencia}
                          placeholder="herda do certificado"
                          title="Vazio = herda do certificado"
                          aria-label={`Ponto ${idx + 1}: probabilidade de abrangência em % (vazio herda do certificado)`}
                          onChange={(e) =>
                            setPontos((prev) =>
                              prev.map((x, i) =>
                                i === idx ? { ...x, probabilidadeAbrangencia: e.target.value } : x,
                              ),
                            )
                          }
                          style={fieldStyle}
                        />
                      </div>
                      <Btn
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setPontos((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)))}
                      >
                        ✕
                      </Btn>
                    </div>
                  ))}
                </div>
              </div>

              <Btn type="submit">
                {modo.tipo === "editar" ? "Salvar alterações" : modo.tipo === "revisao" ? "Cadastrar revisão" : "Salvar certificado vigente"}
              </Btn>
            </form>
          </Surface>
        </>
      )}
    </div>
  );
}
