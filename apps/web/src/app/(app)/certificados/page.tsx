"use client";

import { useEffect, useMemo, useState } from "react";
import { api, downloadApi, fetchBlob } from "@/lib/api";
import {
  Badge,
  Btn,
  DataTable,
  Empty,
  Err,
  FieldLabel,
  FilterBar,
  PageHeader,
  ResultCount,
  fieldStyle,
  td,
  th,
} from "@/components/ui/nexo-ui";

interface Cert {
  id: string;
  numero: string;
  tipo: string;
  validadeAte?: string | null;
  statusCertificado: string;
  resultado?: string | null;
  temAnexoOriginal?: boolean;
  equipamento: { tag: string; nome: string; setor: { nome: string } };
}

export default function CertificadosPage() {
  const [items, setItems] = useState<Cert[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [qStatus, setQStatus] = useState("Todos");
  const [qTipo, setQTipo] = useState("Todos");
  const [preview, setPreview] = useState<{
    cert: Cert;
    url: string;
    loading: boolean;
  } | null>(null);

  async function load() {
    setItems(await api<Cert[]>("/certificados"));
  }

  useEffect(() => {
    void load().catch((e) => setErro(e.message));
  }, []);

  useEffect(() => {
    return () => {
      if (preview?.url) URL.revokeObjectURL(preview.url);
    };
  }, [preview?.url]);

  const filtered = useMemo(() => {
    return items.filter((c) => {
      if (qStatus !== "Todos" && c.statusCertificado !== qStatus) return false;
      if (qTipo !== "Todos" && c.tipo !== qTipo) return false;
      return true;
    });
  }, [items, qStatus, qTipo]);

  const vencidos = items.filter((c) => c.statusCertificado === "VENCIDO").length;
  const aVencer = items.filter((c) => c.statusCertificado === "A_VENCER").length;

  function fecharPreview() {
    if (preview?.url) URL.revokeObjectURL(preview.url);
    setPreview(null);
  }

  async function visualizar(c: Cert) {
    if (preview?.url) URL.revokeObjectURL(preview.url);
    setPreview({ cert: c, url: "", loading: true });
    setErro(null);
    try {
      const blob = await fetchBlob(`/certificados/${c.id}/documento.pdf`);
      const url = URL.createObjectURL(blob);
      setPreview({ cert: c, url, loading: false });
    } catch (err) {
      setPreview(null);
      setErro(err instanceof Error ? err.message : "Erro ao carregar PDF");
    }
  }

  async function reabrir(id: string) {
    const justificativa = window.prompt("Justificativa de reabertura:");
    if (!justificativa) return;
    await api(`/certificados/${id}/reabrir`, {
      method: "POST",
      body: JSON.stringify({ justificativa }),
    });
    setMsg("Certificado reaberto");
    fecharPreview();
    await load();
  }

  return (
    <div>
      <PageHeader
        title="Certificados"
        subtitle={
          <span>
            Calibração + TSE · A Vencer ≤ 60 dias ·{" "}
            <strong style={{ color: vencidos ? "oklch(0.5 0.17 25)" : undefined }}>{vencidos} vencidos</strong>
            {" · "}
            <strong style={{ color: aVencer ? "oklch(0.55 0.12 75)" : undefined }}>{aVencer} a vencer</strong>
          </span>
        }
      />

      {erro && <Err>{erro}</Err>}
      {msg && (
        <div style={{ marginBottom: 12, fontSize: 13, fontWeight: 600, color: "oklch(0.45 0.13 150)" }}>{msg}</div>
      )}

      <FilterBar>
        <div>
          <FieldLabel>Status</FieldLabel>
          <select value={qStatus} onChange={(e) => setQStatus(e.target.value)} style={fieldStyle}>
            <option>Todos</option>
            <option value="VALIDO">Válido</option>
            <option value="A_VENCER">A vencer</option>
            <option value="VENCIDO">Vencido</option>
          </select>
        </div>
        <div>
          <FieldLabel>Tipo</FieldLabel>
          <select value={qTipo} onChange={(e) => setQTipo(e.target.value)} style={fieldStyle}>
            <option>Todos</option>
            <option value="CALIBRACAO">Calibração</option>
            <option value="TSE">TSE</option>
          </select>
        </div>
      </FilterBar>

      <ResultCount n={filtered.length} />

      <DataTable>
        <thead>
          <tr>
            <th style={th}>Nº</th>
            <th style={th}>Tipo</th>
            <th style={th}>Equipamento</th>
            <th style={th}>Setor</th>
            <th style={th}>Validade</th>
            <th style={th}>Status</th>
            <th style={th}>Ações</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((c) => (
            <tr key={c.id}>
              <td style={td}>
                <strong>{c.numero}</strong>
              </td>
              <td style={td}>{c.tipo}</td>
              <td style={td}>
                {c.equipamento.tag}
                <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)" }}>{c.equipamento.nome}</div>
              </td>
              <td style={td}>{c.equipamento.setor.nome}</td>
              <td style={td}>{c.validadeAte ? new Date(c.validadeAte).toLocaleDateString("pt-BR") : "—"}</td>
              <td style={td}>
                <Badge tone={c.statusCertificado}>{c.statusCertificado.replace("_", " ")}</Badge>
              </td>
              <td style={td}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Btn
                    variant="primary"
                    style={{ padding: "6px 10px", fontSize: 12 }}
                    onClick={() => void visualizar(c)}
                  >
                    Visualizar
                  </Btn>
                  <Btn
                    variant="ghost"
                    style={{ padding: "6px 10px", fontSize: 12 }}
                    onClick={() =>
                      void downloadApi(
                        `/certificados/${c.id}/documento.pdf`,
                        { method: "GET" },
                        c.temAnexoOriginal ? `${c.equipamento.tag}-${c.tipo}.pdf` : "certificado.pdf",
                      ).catch((err) => setErro(err instanceof Error ? err.message : "Erro ao baixar PDF"))
                    }
                  >
                    Baixar
                  </Btn>
                  <Btn variant="secondary" style={{ padding: "6px 10px", fontSize: 12 }} onClick={() => void reabrir(c.id)}>
                    Reabrir
                  </Btn>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
      {filtered.length === 0 && <Empty text="Nenhum certificado neste filtro." />}

      {preview && (
        <div
          role="dialog"
          aria-modal
          aria-label="Pré-visualização do certificado"
          onClick={fecharPreview}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 90,
            background: "rgba(16,24,40,0.55)",
            display: "grid",
            placeItems: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(960px, 100%)",
              height: "min(90vh, 900px)",
              background: "white",
              borderRadius: 12,
              boxShadow: "0 24px 64px rgba(16,24,40,0.28)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "12px 16px",
                borderBottom: "1px solid oklch(0.92 0.006 255)",
                flexShrink: 0,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>
                  {preview.cert.numero} · {preview.cert.tipo}
                </div>
                <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {preview.cert.equipamento.tag} — {preview.cert.equipamento.nome}
                  {preview.cert.temAnexoOriginal ? " · PDF original" : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <Btn
                  variant="secondary"
                  style={{ padding: "6px 12px", fontSize: 12 }}
                  onClick={() =>
                    void downloadApi(
                      `/certificados/${preview.cert.id}/documento.pdf`,
                      { method: "GET" },
                      `${preview.cert.equipamento.tag}-${preview.cert.tipo}.pdf`,
                    ).catch((err) => setErro(err instanceof Error ? err.message : "Erro"))
                  }
                >
                  Baixar
                </Btn>
                <Btn variant="ghost" style={{ padding: "6px 12px", fontSize: 12 }} onClick={fecharPreview}>
                  Fechar
                </Btn>
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0, background: "oklch(0.96 0.005 255)" }}>
              {preview.loading || !preview.url ? (
                <div style={{ height: "100%", display: "grid", placeItems: "center", color: "oklch(0.5 0.02 250)" }}>
                  Carregando PDF…
                </div>
              ) : (
                <iframe
                  title={`Certificado ${preview.cert.numero}`}
                  src={preview.url}
                  style={{ width: "100%", height: "100%", border: "none" }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
