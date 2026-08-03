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

interface PopItem {
  id: string;
  codigo: string;
  titulo: string;
  versao: string;
  status: string;
  categoria?: "PREVENTIVA" | "CALIBRACAO" | "TSE" | "QUALIFICACAO" | null;
  equipamentoTitulo?: string | null;
  nomeArquivo?: string | null;
  tamanhoBytes?: number | null;
  temDocumento?: boolean;
  familia?: string | null;
}

const CAT_LABEL: Record<string, string> = {
  PREVENTIVA: "Preventiva",
  CALIBRACAO: "Calibração",
  TSE: "TSE / Seg. Elétrica",
  QUALIFICACAO: "Qualificação / Validação",
};

function formatBytes(n?: number | null) {
  if (!n) return "—";
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function BibliotecaPopsPage() {
  const [items, setItems] = useState<PopItem[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [qCat, setQCat] = useState("Todos");
  const [q, setQ] = useState("");
  const [preview, setPreview] = useState<{
    pop: PopItem;
    url: string;
    loading: boolean;
  } | null>(null);

  async function load() {
    setItems(await api<PopItem[]>("/estrategico/pops"));
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
    const term = q.trim().toLowerCase();
    return items.filter((p) => {
      if (qCat !== "Todos" && p.categoria !== qCat) return false;
      if (!term) return true;
      return (
        p.codigo.toLowerCase().includes(term) ||
        p.titulo.toLowerCase().includes(term) ||
        (p.equipamentoTitulo ?? "").toLowerCase().includes(term)
      );
    });
  }, [items, qCat, q]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of items) {
      const k = p.categoria ?? "OUTROS";
      c[k] = (c[k] ?? 0) + 1;
    }
    return c;
  }, [items]);

  function fecharPreview() {
    if (preview?.url) URL.revokeObjectURL(preview.url);
    setPreview(null);
  }

  async function visualizar(p: PopItem) {
    if (!p.temDocumento) return;
    if (preview?.url) URL.revokeObjectURL(preview.url);
    setPreview({ pop: p, url: "", loading: true });
    setErro(null);
    try {
      const blob = await fetchBlob(`/estrategico/pops/${p.id}/documento.pdf`);
      const url = URL.createObjectURL(blob);
      setPreview({ pop: p, url, loading: false });
    } catch (err) {
      setPreview(null);
      setErro(err instanceof Error ? err.message : "Erro ao carregar PDF");
    }
  }

  return (
    <div>
      <PageHeader
        title="Biblioteca de POPs"
        subtitle="Procedimentos operacionais de preventiva, calibração, TSE e qualificação — referência bibliográfica dos testes"
      />
      {erro && <Err>{erro}</Err>}

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          marginBottom: 14,
          fontSize: 13,
          color: "oklch(0.45 0.02 250)",
        }}
      >
        <span>
          <strong>{items.length}</strong> procedimentos
        </span>
        {Object.entries(CAT_LABEL).map(([k, label]) => (
          <span key={k}>
            · {label}: <strong>{counts[k] ?? 0}</strong>
          </span>
        ))}
      </div>

      <FilterBar>
        <div>
          <FieldLabel>Categoria</FieldLabel>
          <select value={qCat} onChange={(e) => setQCat(e.target.value)} style={fieldStyle}>
            <option>Todos</option>
            <option value="PREVENTIVA">Preventiva (MP)</option>
            <option value="CALIBRACAO">Calibração (CAL)</option>
            <option value="TSE">TSE / Seg. Elétrica (SEG)</option>
            <option value="QUALIFICACAO">Qualificação (QLF)</option>
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <FieldLabel>Busca</FieldLabel>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Código, equipamento…"
            style={fieldStyle}
          />
        </div>
        <ResultCount n={filtered.length} />
      </FilterBar>

      {filtered.length === 0 ? (
        <Empty text="Nenhum POP encontrado. Aguarde o import no boot da API." />
      ) : (
        <DataTable>
          <thead>
            <tr>
              <th style={th}>Código</th>
              <th style={th}>Categoria</th>
              <th style={th}>Equipamento / título</th>
              <th style={th}>Tamanho</th>
              <th style={th} />
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id}>
                <td style={td}>
                  <strong>{p.codigo}</strong>
                  {p.familia && (
                    <div style={{ fontSize: 11, color: "oklch(0.5 0.02 250)" }}>POP.EC.{p.familia}</div>
                  )}
                </td>
                <td style={td}>
                  <Badge tone={p.categoria ?? "PENDENTE"}>
                    {p.categoria ? CAT_LABEL[p.categoria] : "—"}
                  </Badge>
                </td>
                <td style={td}>
                  <div>{p.equipamentoTitulo ?? p.titulo}</div>
                  <div style={{ fontSize: 11, color: "oklch(0.5 0.02 250)" }}>{p.titulo}</div>
                </td>
                <td style={td}>{formatBytes(p.tamanhoBytes)}</td>
                <td style={{ ...td, whiteSpace: "nowrap" }}>
                  {p.temDocumento ? (
                    <>
                      <Btn variant="secondary" onClick={() => void visualizar(p)}>
                        Ver PDF
                      </Btn>{" "}
                      <Btn
                        variant="ghost"
                        onClick={() =>
                          void downloadApi(
                            `/estrategico/pops/${p.id}/documento.pdf`,
                            { method: "GET" },
                            p.nomeArquivo ?? `${p.codigo}.pdf`,
                          )
                        }
                      >
                        Baixar
                      </Btn>
                    </>
                  ) : (
                    <span style={{ fontSize: 12, color: "oklch(0.55 0.02 250)" }}>Sem arquivo</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}

      {preview && (
        <div
          role="dialog"
          aria-modal
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.55)",
            zIndex: 80,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
          onClick={fecharPreview}
        >
          <div
            style={{
              width: "min(960px, 100%)",
              height: "min(90vh, 900px)",
              background: "#fff",
              borderRadius: 12,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              boxShadow: "0 24px 80px rgba(0,0,0,.35)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 16px",
                borderBottom: "1px solid oklch(0.92 0.01 250)",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{preview.pop.codigo}</div>
                <div style={{ fontSize: 12, color: "oklch(0.45 0.02 250)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {preview.pop.titulo}
                </div>
              </div>
              <Btn
                variant="secondary"
                onClick={() =>
                  void downloadApi(
                    `/estrategico/pops/${preview.pop.id}/documento.pdf`,
                    { method: "GET" },
                    preview.pop.nomeArquivo ?? `${preview.pop.codigo}.pdf`,
                  )
                }
              >
                Baixar
              </Btn>
              <Btn variant="ghost" onClick={fecharPreview}>
                Fechar
              </Btn>
            </div>
            <div style={{ flex: 1, background: "oklch(0.96 0.01 250)" }}>
              {preview.loading || !preview.url ? (
                <div style={{ padding: 40, textAlign: "center", fontSize: 14 }}>Carregando PDF…</div>
              ) : (
                <iframe title={preview.pop.codigo} src={preview.url} style={{ width: "100%", height: "100%", border: 0 }} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
