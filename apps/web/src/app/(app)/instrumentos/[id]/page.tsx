"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { api, downloadApi } from "@/lib/api";
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
}

interface Cert {
  id: string;
  numero: string;
  dataEmissao: string;
  dataValidade: string;
  laboratorioEmissor?: string | null;
  laboratorioAcreditacao?: string | null;
  fatorAbrangencia: number;
  vigente: boolean;
  temAnexo: boolean;
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
};

const emptyPonto = (): PontoDraft => ({
  grandeza: "",
  unidade: "°C",
  valorNominal: "",
  valorConvencional: "",
  indicacao: "",
  incertezaExpandida: "",
  fatorK: "2",
});

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
        fatorK: numOrUndef(p.fatorK) ?? 2,
      }))
      .filter((p) => p.unidade && p.incertezaExpandida != null);

    if (pontosPayload.length === 0) {
      setErro("Informe ao menos um ponto com unidade e incerteza expandida (U)");
      return;
    }

    try {
      const created = await api<Cert>(`/instrumentos-padroes/${padrao.id}/certificados`, {
        method: "POST",
        body: JSON.stringify({
          numero: String(fd.get("numero")),
          dataEmissao: String(fd.get("dataEmissao")),
          dataValidade: String(fd.get("dataValidade")),
          laboratorioEmissor: String(fd.get("laboratorioEmissor") || "") || undefined,
          laboratorioAcreditacao: String(fd.get("laboratorioAcreditacao") || "") || undefined,
          fatorAbrangencia: numOrUndef(String(fd.get("fatorAbrangencia") || "2")) ?? 2,
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
      setMsg(`Certificado ${created.numero} cadastrado com ${pontosPayload.length} ponto(s)`);
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
                <FieldLabel>Grandezas</FieldLabel>
                <input
                  name="grandezas"
                  defaultValue={padrao.grandezas.join(", ")}
                  placeholder="temperatura, umidade"
                  style={fieldStyle}
                />
              </div>
              <div>
                <FieldLabel>Faixa</FieldLabel>
                <input name="faixaMedicao" defaultValue={padrao.faixaMedicao ?? ""} style={fieldStyle} />
              </div>
              <div>
                <FieldLabel>Resolução</FieldLabel>
                <input name="resolucao" defaultValue={padrao.resolucao ?? ""} style={fieldStyle} />
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
                            ? "1px solid oklch(0.64 0.19 38)"
                            : "1px solid oklch(0.9 0.01 250)",
                        background: c.id === certId ? "oklch(0.97 0.02 70)" : "white",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{c.numero}</div>
                      <div style={{ fontSize: 11, color: "oklch(0.5 0.02 250)" }}>
                        válido até {new Date(c.dataValidade).toLocaleDateString("pt-BR")}
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
                        Emissão {new Date(certSelecionado.dataEmissao).toLocaleDateString("pt-BR")} ·
                        Validade {new Date(certSelecionado.dataValidade).toLocaleDateString("pt-BR")}
                        {certSelecionado.laboratorioEmissor
                          ? ` · ${certSelecionado.laboratorioEmissor}`
                          : ""}
                        {certSelecionado.laboratorioAcreditacao
                          ? ` (${certSelecionado.laboratorioAcreditacao})`
                          : ""}
                      </div>
                      <div style={{ fontSize: 12 }}>k = {certSelecionado.fatorAbrangencia}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
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
                        certSelecionado.pontos.map((p) => (
                          <tr key={p.id}>
                            <td style={td}>{p.ordem}</td>
                            <td style={td}>{p.grandeza ?? "—"}</td>
                            <td style={td}>{p.valorNominal ?? "—"}</td>
                            <td style={td}>{p.valorConvencional ?? "—"}</td>
                            <td style={td}>{p.indicacao ?? "—"}</td>
                            <td style={td}>{p.correcao ?? "—"}</td>
                            <td style={td}>
                              <strong>{p.incertezaExpandida}</strong>
                              {p.fatorK != null ? ` (k=${p.fatorK})` : ""}
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
            <div style={{ fontWeight: 700, marginBottom: 12 }}>Novo certificado de calibração do padrão</div>
            <form onSubmit={(e) => void onAddCert(e)} style={{ display: "grid", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                <div>
                  <FieldLabel>Nº certificado</FieldLabel>
                  <input name="numero" required style={fieldStyle} />
                </div>
                <div>
                  <FieldLabel>Emissão</FieldLabel>
                  <input name="dataEmissao" type="date" required style={fieldStyle} />
                </div>
                <div>
                  <FieldLabel>Validade</FieldLabel>
                  <input name="dataValidade" type="date" required style={fieldStyle} />
                </div>
                <div>
                  <FieldLabel>Laboratório</FieldLabel>
                  <input name="laboratorioEmissor" placeholder="Lab emissor" style={fieldStyle} />
                </div>
                <div>
                  <FieldLabel>Acreditação (RBC)</FieldLabel>
                  <input name="laboratorioAcreditacao" placeholder="CRL-XXXX" style={fieldStyle} />
                </div>
                <div>
                  <FieldLabel>k (abrangência)</FieldLabel>
                  <input name="fatorAbrangencia" type="number" step="0.1" defaultValue={2} style={fieldStyle} />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <FieldLabel>Observações</FieldLabel>
                  <input name="observacoes" style={fieldStyle} />
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
                        gridTemplateColumns: "1.2fr 0.7fr repeat(4, 1fr) 0.6fr auto",
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
                          onChange={(e) =>
                            setPontos((prev) =>
                              prev.map((x, i) => (i === idx ? { ...x, fatorK: e.target.value } : x)),
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

              <Btn type="submit">Salvar certificado vigente</Btn>
            </form>
          </Surface>
        </>
      )}
    </div>
  );
}
