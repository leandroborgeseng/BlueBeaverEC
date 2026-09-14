"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, downloadApi } from "@/lib/api";
import { useCan } from "@/lib/session";
import { LABEL_CONDICAO_USO, LABEL_SITUACAO_CICLO } from "@aion/shared";
import {
  Badge,
  Btn,
  DataTable,
  Empty,
  Err,
  FieldLabel,
  FilterBar,
  PageHeader,
  Surface,
  fieldStyle,
  td,
  th,
} from "@/components/ui/aion-ui";

interface Lookup {
  id: string;
  nome: string;
}

interface EquipamentoRow {
  id: string;
  tag: string;
  nome: string;
  situacao: string;
  condicaoUso?: string;
  patrimonio?: string | null;
  nSerie?: string | null;
  checklistRecebimentoPendente: boolean;
  setor: { nome: string };
  fabricante: { nome: string };
  modelo: { nome: string };
  descricao: { nome: string; criticidade: string };
  tipoEquipamentoPlano?: { id: string; nome: string } | null;
  planoMatchTipo?: string | null;
}

interface EquipListResponse {
  items: EquipamentoRow[];
  total: number;
  page: number;
  pageSize: number;
}

export default function EquipamentosPage() {
  const podeCadastrar = useCan("equipamentos", 3);
  const podeAbrirOs = useCan("os", 3);
  const [items, setItems] = useState<EquipamentoRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [q, setQ] = useState("");
  const [situacao, setSituacao] = useState("");
  const [setorId, setSetorId] = useState("");
  const [fabricanteId, setFabricanteId] = useState("");
  const [setores, setSetores] = useState<Lookup[]>([]);
  const [fabricantes, setFabricantes] = useState<Lookup[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importCsv, setImportCsv] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<{
    total: number;
    ok: number;
    erros: Array<{ linha?: number; tag: string; erro?: string }>;
    resultados?: Array<{ ok: boolean; linha: number; tag: string; erro?: string }>;
  } | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const router = useRouter();

  useEffect(() => {
    Promise.all([api<Lookup[]>("/setores"), api<Lookup[]>("/fabricantes")])
      .then(([s, f]) => {
        setSetores(s);
        setFabricantes(f);
      })
      .catch(() => undefined);
  }, []);

  const load = useCallback(async (pageOverride?: number) => {
    const currentPage = pageOverride ?? page;
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (situacao) params.set("situacao", situacao);
    if (setorId) params.set("setor", setorId);
    if (fabricanteId) params.set("fabricante", fabricanteId);
    params.set("page", String(currentPage));

    try {
      const data = await api<EquipListResponse>(`/equipamentos?${params.toString()}`);
      setItems(data.items);
      setTotal(data.total);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    }
  }, [q, situacao, setorId, fabricanteId, page]);

  useEffect(() => {
    void load();
  }, [load]);

  function aplicarFiltros() {
    setPage(1);
    void load(1);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function parseCsv(text: string) {
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    if (!lines.length) return [];
    const first = lines[0];
    const sep = first.includes(";") ? ";" : ",";
    const headers = first.split(sep).map((h) => h.trim());
    const looksHeader = /tag|nome|setor|nSerie|patrimonio/i.test(first);
    const dataLines = looksHeader ? lines.slice(1) : lines;
    const headerKeys = looksHeader
      ? headers
      : ["tag", "nome", "planoDescricao", "fabricante", "modelo", "setor", "patrimonio", "nSerie"];
    return dataLines.map((line) => {
      const cols = line.split(sep).map((c) => c.trim());
      const row: Record<string, string> = {};
      headerKeys.forEach((h, i) => {
        row[h] = cols[i] ?? "";
      });
      if (!looksHeader) {
        return {
          tag: cols[0] ?? "",
          nome: cols[1] ?? "",
          planoDescricao: cols[2] ?? "",
          fabricante: cols[3] ?? "",
          modelo: cols[4] ?? "",
          setor: cols[5] ?? "",
          patrimonio: cols[6] || undefined,
          nSerie: cols[7] || undefined,
        };
      }
      return row;
    });
  }

  async function fileToBase64(file: File) {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    bytes.forEach((b) => {
      binary += String.fromCharCode(b);
    });
    return btoa(binary);
  }

  async function gerarPrevia() {
    setImportMsg(null);
    setImportPreview(null);
    try {
      let body: Record<string, unknown>;
      if (importFile) {
        body = { filename: importFile.name, contentBase64: await fileToBase64(importFile) };
      } else {
        const rows = parseCsv(importCsv);
        if (!rows.length) {
          setImportMsg("Cole CSV ou escolha um arquivo XLSX/CSV");
          return;
        }
        body = { rows };
      }
      const res = await api<{
        total: number;
        ok: number;
        erros: Array<{ linha?: number; tag: string; erro?: string }>;
        resultados: Array<{ ok: boolean; linha: number; tag: string; erro?: string }>;
      }>("/equipamentos/import/preview", { method: "POST", body: JSON.stringify(body) });
      setImportPreview(res);
      setImportMsg(`Prévia: ${res.ok} linha(s) pronta(s), ${res.erros.length} com erro. Nada foi gravado.`);
    } catch (e) {
      setImportMsg(e instanceof Error ? e.message : "Erro na prévia");
    }
  }

  async function executarImport() {
    setImportMsg(null);
    const rows = parseCsv(importCsv);
    if (!importFile && rows.length === 0) {
      setImportMsg("Gere a prévia antes. Importação não sobrescreve TAG existente.");
      return;
    }
    try {
      let payload: Record<string, unknown>;
      if (importFile && !importCsv.trim()) {
        const parsed = await api<{
          resultados: Array<{ ok: boolean; row?: Record<string, unknown> }>;
        }>("/equipamentos/import/preview", {
          method: "POST",
          body: JSON.stringify({ filename: importFile.name, contentBase64: await fileToBase64(importFile) }),
        });
        const okRows = (parsed.resultados ?? [])
          .filter((r) => r.ok && r.row)
          .map((r) => r.row);
        payload = { rows: okRows };
      } else {
        payload = { rows };
      }
      const res = await api<{
        total: number;
        ok: number;
        erros: Array<{ tag: string; erro?: string }>;
      }>("/equipamentos/import", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setImportMsg(`${res.ok} de ${res.total} criado(s). Linhas existentes não foram alteradas.`);
      setImportPreview({ total: res.total, ok: res.ok, erros: res.erros ?? [] });
      if (res.ok > 0) await load();
    } catch (e) {
      setImportMsg(e instanceof Error ? e.message : "Erro na importação");
    }
  }

  async function exportInventario(formato: "pdf" | "xlsx") {
    setExportBusy(true);
    setErro(null);
    try {
      await downloadApi(
        "/relatorios/gerar",
        {
          method: "POST",
          body: JSON.stringify({ template: "inventario_equipamentos", formato }),
        },
        `inventario_equipamentos.${formato}`,
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro no export");
    } finally {
      setExportBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Equipamentos"
        subtitle="Inventário HEF · condição operacional separada do ciclo de vida · TAG HEF-NNNN"
        actions={
          <>
            {podeCadastrar && (
              <Btn href="/equipamentos/novo" variant="primary">
                Novo equipamento
              </Btn>
            )}
            <Btn
              variant="secondary"
              disabled={exportBusy}
              onClick={() => void exportInventario("pdf")}
            >
              Exportar PDF
            </Btn>
            <Btn
              variant="ghost"
              disabled={exportBusy}
              onClick={() => void exportInventario("xlsx")}
            >
              Exportar XLSX
            </Btn>
            {podeCadastrar && (
              <>
                <Btn
                  variant="ghost"
                  onClick={() =>
                    void downloadApi("/equipamentos/import/template", { method: "GET" }, "template-equipamentos.xlsx").catch(
                      (e) => setErro(e instanceof Error ? e.message : "Erro"),
                    )
                  }
                >
                  Template XLSX
                </Btn>
                <Btn variant="secondary" onClick={() => setImportOpen(true)}>
                  Importar CSV/XLSX
                </Btn>
              </>
            )}
            {podeAbrirOs && (
              <>
                <Btn href="/os/nova" variant="secondary">
                  Abrir OS
                </Btn>
                <Btn href="/os/rapida" variant="primary">
                  + OS Rápida
                </Btn>
              </>
            )}
          </>
        }
      />

      {erro && <Err>{erro}</Err>}

      <FilterBar>
        <div style={{ gridColumn: "span 2" }}>
          <FieldLabel>Buscar</FieldLabel>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && aplicarFiltros()}
            placeholder="Patrimônio, série, nome, fabricante, modelo ou setor"
            style={fieldStyle}
          />
        </div>
        <div>
          <FieldLabel>Situação</FieldLabel>
          <select value={situacao} onChange={(e) => setSituacao(e.target.value)} style={fieldStyle}>
            <option value="">Todas</option>
            <option value="ATIVO">ATIVO</option>
            <option value="EM_GARANTIA">EM GARANTIA</option>
            <option value="INATIVO">INATIVO</option>
            <option value="ARQUIVADO">ARQUIVADO</option>
          </select>
        </div>
        <div>
          <FieldLabel>Setor</FieldLabel>
          <select value={setorId} onChange={(e) => setSetorId(e.target.value)} style={fieldStyle}>
            <option value="">Todos</option>
            {setores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel>Fabricante</FieldLabel>
          <select value={fabricanteId} onChange={(e) => setFabricanteId(e.target.value)} style={fieldStyle}>
            <option value="">Todos</option>
            {fabricantes.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel>&nbsp;</FieldLabel>
          <Btn onClick={aplicarFiltros} style={{ width: "100%" }}>
            Filtrar
          </Btn>
        </div>
      </FilterBar>

      <div style={{ fontSize: 13, fontWeight: 600, color: "oklch(0.5 0.02 250)", margin: "0 0 10px" }}>
        {total} resultado(s) · página {page} de {totalPages}
      </div>

      <DataTable>
        <thead>
          <tr>
            <th style={th}>TAG</th>
            <th style={th}>Equipamento</th>
            <th style={th}>Setor</th>
            <th style={th}>Fabricante / Modelo</th>
            <th style={th}>Plano</th>
            <th style={th}>Criticidade</th>
            <th style={th}>Condição</th>
            <th style={th}>Ciclo</th>
          </tr>
        </thead>
        <tbody>
          {items.map((eq) => (
            <tr
              key={eq.id}
              onClick={() => router.push(`/equipamentos/${encodeURIComponent(eq.tag)}`)}
              style={{ cursor: "pointer" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "oklch(0.975 0.01 250)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <td style={td}>
                <strong>{eq.tag}</strong>
                {eq.checklistRecebimentoPendente && (
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 10,
                      fontWeight: 800,
                      color: "oklch(0.55 0.14 85)",
                    }}
                  >
                    CHECKLIST
                  </span>
                )}
              </td>
              <td style={td}>
                <div style={{ fontWeight: 600 }}>{eq.nome}</div>
                <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)" }}>{eq.descricao.nome}</div>
              </td>
              <td style={td}>{eq.setor.nome}</td>
              <td style={td}>
                {eq.fabricante.nome} / {eq.modelo.nome}
              </td>
              <td style={td}>
                {eq.tipoEquipamentoPlano?.nome ? (
                  <span title={eq.planoMatchTipo ?? undefined}>{eq.tipoEquipamentoPlano.nome}</span>
                ) : (
                  <span style={{ color: "oklch(0.55 0.02 250)" }}>—</span>
                )}
              </td>
              <td style={td}>
                <Badge tone={eq.descricao.criticidade}>{eq.descricao.criticidade}</Badge>
              </td>
              <td style={td}>
                <Badge tone={eq.condicaoUso}>{eq.condicaoUso ? LABEL_CONDICAO_USO[eq.condicaoUso as keyof typeof LABEL_CONDICAO_USO] ?? eq.condicaoUso : "—"}</Badge>
              </td>
              <td style={td}>
                <Badge tone={eq.situacao}>
                  {LABEL_SITUACAO_CICLO[eq.situacao as keyof typeof LABEL_SITUACAO_CICLO] ?? eq.situacao.replace(/_/g, " ")}
                </Badge>
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={8}>
                <Empty text="Nenhum equipamento encontrado" />
              </td>
            </tr>
          )}
        </tbody>
      </DataTable>

      {totalPages > 1 && (
        <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
          <Btn variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Anterior
          </Btn>
          <span style={{ fontSize: 13, color: "oklch(0.5 0.02 250)" }}>
            Página {page} / {totalPages}
          </span>
          <Btn variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Próxima
          </Btn>
        </div>
      )}

      {importOpen && (
        <div
          role="dialog"
          aria-modal
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 80,
            background: "rgba(16,24,40,0.45)",
            display: "grid",
            placeItems: "center",
            padding: 20,
          }}
          onClick={() => setImportOpen(false)}
        >
          <div onClick={(e) => e.stopPropagation()}>
          <Surface style={{ width: "min(640px, 100%)", maxHeight: "80vh", overflow: "auto" }}>
            <strong style={{ display: "block", marginBottom: 8 }}>Importar equipamentos</strong>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "oklch(0.5 0.02 250)" }}>
              Baixe o modelo, gere a prévia e confira erros por linha. TAG existente não é sobrescrita.
              Série vazia não conta como duplicata. TAG vazia gera HEF-NNNN.
            </p>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
              style={{ marginBottom: 10 }}
            />
            <textarea
              value={importCsv}
              onChange={(e) => setImportCsv(e.target.value)}
              rows={8}
              placeholder={"tag;nome;planoDescricao;fabricante;modelo;setor;patrimonio;nSerie"}
              style={{ ...fieldStyle, fontFamily: "monospace", fontSize: 12 }}
            />
            {importMsg && (
              <div style={{ marginTop: 10, fontSize: 13, fontWeight: 600 }}>{importMsg}</div>
            )}
            {importPreview && importPreview.erros.length > 0 && (
              <div style={{ marginTop: 10, fontSize: 12, color: "oklch(0.45 0.15 25)" }}>
                {importPreview.erros.map((e, i) => (
                  <div key={`${e.tag}-${i}`}>
                    Linha {e.linha ?? "—"} · {e.tag}: {e.erro}
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" }}>
              <Btn variant="ghost" onClick={() => setImportOpen(false)}>
                Fechar
              </Btn>
              <Btn variant="secondary" onClick={() => void gerarPrevia()}>
                Prévia
              </Btn>
              <Btn onClick={() => void executarImport()}>Importar válidos</Btn>
            </div>
          </Surface>
          </div>
        </div>
      )}
    </div>
  );
}
