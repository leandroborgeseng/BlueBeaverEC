"use client";

import { useEffect, useMemo, useState } from "react";
import { api, downloadApi } from "@/lib/api";
import {
  Badge,
  Btn,
  DataTable,
  Empty,
  Err,
  FieldLabel,
  FilterBar,
  PageHeader,
  Panel,
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
  const [doc, setDoc] = useState<unknown>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [qStatus, setQStatus] = useState("Todos");
  const [qTipo, setQTipo] = useState("Todos");

  async function load() {
    setItems(await api<Cert[]>("/certificados"));
  }

  useEffect(() => {
    void load().catch((e) => setErro(e.message));
  }, []);

  const filtered = useMemo(() => {
    return items.filter((c) => {
      if (qStatus !== "Todos" && c.statusCertificado !== qStatus) return false;
      if (qTipo !== "Todos" && c.tipo !== qTipo) return false;
      return true;
    });
  }, [items, qStatus, qTipo]);

  const vencidos = items.filter((c) => c.statusCertificado === "VENCIDO").length;
  const aVencer = items.filter((c) => c.statusCertificado === "A_VENCER").length;

  async function consultar(id: string) {
    setDoc(await api(`/certificados/${id}/documento`));
  }

  async function reabrir(id: string) {
    const justificativa = window.prompt("Justificativa de reabertura:");
    if (!justificativa) return;
    await api(`/certificados/${id}/reabrir`, {
      method: "POST",
      body: JSON.stringify({ justificativa }),
    });
    setMsg("Certificado reaberto");
    setDoc(null);
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
                <div style={{ display: "flex", gap: 6 }}>
                  <Btn variant="ghost" style={{ padding: "6px 10px", fontSize: 12 }} onClick={() => void consultar(c.id)}>
                    Documento
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
                    {c.temAnexoOriginal ? "PDF original" : "PDF"}
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

      {doc != null && (
        <Panel title="Documento do certificado" action={<Btn variant="ghost" onClick={() => setDoc(null)}>Fechar</Btn>}>
          <pre
            style={{
              margin: 0,
              fontSize: 11,
              overflow: "auto",
              maxHeight: 360,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {JSON.stringify(doc, null, 2)}
          </pre>
        </Panel>
      )}
    </div>
  );
}
