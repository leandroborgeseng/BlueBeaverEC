"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api, downloadApi } from "@/lib/api";
import { useCan } from "@/lib/session";
import { LABEL_SITUACAO_CICLO } from "@aion/shared";
import { useWindowStore } from "@/store/windows";
import { Overlay, WinForm, fld } from "@/components/os/os-win-ui";
import { EquipEtiquetaDialog } from "@/components/equipamentos/EquipEtiquetaDialog";
import {
  FItem,
  FRow,
  ToolBtn,
  WinScreen,
  ZebraTable,
  padCount,
  td,
  winFld,
  zebraRow,
} from "@/components/equipamentos/eq-win-ui";

interface Lookup {
  id: string;
  nome: string;
  codigo?: string;
  fabricanteId?: string;
  fabricante?: { id: string; nome: string };
}

interface EquipamentoRow {
  id: string;
  tag: string;
  nome: string;
  situacao: string;
  condicaoUso?: string;
  patrimonio?: string | null;
  nSerie?: string | null;
  criticidadeEquipamento?: string | null;
  checklistRecebimentoPendente: boolean;
  setor: { nome: string };
  fabricante: { nome: string };
  modelo: { nome: string };
  descricao: { nome: string; criticidade: string };
  tipoEquipamentoPlano?: { id: string; nome: string } | null;
}

interface EquipListResponse {
  items: EquipamentoRow[];
  total: number;
  page: number;
  pageSize: number;
}

interface CentroCusto {
  id: string;
  codigo: string;
  nome: string;
}

function criticidadeDe(eq: EquipamentoRow) {
  return eq.criticidadeEquipamento || eq.descricao.criticidade;
}

export default function EquipamentosPage() {
  const podeCadastrar = useCan("equipamentos", 3);
  const podeAbrirOs = useCan("os", 3);
  const [items, setItems] = useState<EquipamentoRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [patrimonio, setPatrimonio] = useState("");
  const [nSerie, setNSerie] = useState("");
  const [situacao, setSituacao] = useState("");
  const [criticidade, setCriticidade] = useState("");
  const [setorId, setSetorId] = useState("");
  const [fabricanteId, setFabricanteId] = useState("");
  const [modeloId, setModeloId] = useState("");
  const [centroCustoId, setCentroCustoId] = useState("");
  const [inativos, setInativos] = useState(false);
  const [applied, setApplied] = useState({
    q: "",
    tag: "",
    patrimonio: "",
    nSerie: "",
    situacao: "",
    criticidade: "",
    setorId: "",
    fabricanteId: "",
    modeloId: "",
    centroCustoId: "",
    inativos: false,
  });
  const [setores, setSetores] = useState<Lookup[]>([]);
  const [fabricantes, setFabricantes] = useState<Lookup[]>([]);
  const [modelos, setModelos] = useState<Lookup[]>([]);
  const [centros, setCentros] = useState<CentroCusto[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
  const [etiquetaAberta, setEtiquetaAberta] = useState(false);
  const router = useRouter();
  const openWin = useWindowStore((s) => s.open);

  useEffect(() => {
    const inicial = new URLSearchParams(window.location.search).get("q");
    if (inicial?.trim()) {
      setQ(inicial);
      setApplied((a) => ({ ...a, q: inicial }));
    }
  }, []);

  useEffect(() => {
    Promise.all([
      api<Lookup[]>("/setores"),
      api<Lookup[]>("/fabricantes"),
      api<Lookup[]>("/modelos"),
      api<CentroCusto[]>("/centros-custo"),
    ])
      .then(([s, f, m, c]) => {
        setSetores(s);
        setFabricantes(f);
        setModelos(m);
        setCentros(c);
      })
      .catch(() => undefined);
  }, []);

  const modelosFiltrados = useMemo(
    () =>
      fabricanteId
        ? modelos.filter((m) => (m.fabricanteId ?? m.fabricante?.id) === fabricanteId)
        : modelos,
    [modelos, fabricanteId],
  );

  const load = useCallback(
    async (pageOverride?: number) => {
      const currentPage = pageOverride ?? page;
      const params = new URLSearchParams();
      if (applied.q.trim()) params.set("q", applied.q.trim());
      if (applied.tag.trim()) params.set("tag", applied.tag.trim());
      if (applied.patrimonio.trim()) params.set("patrimonio", applied.patrimonio.trim());
      if (applied.nSerie.trim()) params.set("nSerie", applied.nSerie.trim());
      if (applied.situacao) params.set("situacao", applied.situacao);
      if (applied.criticidade) params.set("criticidade", applied.criticidade);
      if (applied.setorId) params.set("setor", applied.setorId);
      if (applied.fabricanteId) params.set("fabricante", applied.fabricanteId);
      if (applied.modeloId) params.set("modelo", applied.modeloId);
      if (applied.centroCustoId) params.set("centroCusto", applied.centroCustoId);
      if (applied.inativos) params.set("inativos", "1");
      else params.set("inativos", "0");
      params.set("page", String(currentPage));
      params.set("pageSize", String(pageSize));

      try {
        const data = await api<EquipListResponse>(`/equipamentos?${params.toString()}`);
        setItems(data.items);
        setTotal(data.total);
        setErro(null);
        setSelectedId((cur) => (data.items.some((i) => i.id === cur) ? cur : data.items[0]?.id ?? null));
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro");
      }
    },
    [applied, page, pageSize],
  );

  useEffect(() => {
    void load();
  }, [load]);

  function aplicarFiltros() {
    setPage(1);
    setApplied({
      q,
      tag,
      patrimonio,
      nSerie,
      situacao,
      criticidade,
      setorId,
      fabricanteId,
      modeloId,
      centroCustoId,
      inativos,
    });
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const selected = items.find((i) => i.id === selectedId) ?? null;

  function abrirFicha(eq: EquipamentoRow) {
    openWin({ kind: "equipamento", title: eq.tag, payload: { tag: eq.tag } });
  }

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
        const okRows = (parsed.resultados ?? []).filter((r) => r.ok && r.row).map((r) => r.row);
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
    <>
      <WinScreen
        title="Equipamentos"
        error={erro}
        toolbar={
          <>
            {podeCadastrar && <ToolBtn onClick={() => router.push("/equipamentos/novo")}>Novo</ToolBtn>}
            <ToolBtn disabled={!selected} onClick={() => selected && abrirFicha(selected)}>
              Alterar
            </ToolBtn>
            <ToolBtn disabled={!selected} onClick={() => selected && abrirFicha(selected)}>
              Consultar
            </ToolBtn>
            <ToolBtn disabled={!selected} onClick={() => selected && setEtiquetaAberta(true)}>
              QR Code
            </ToolBtn>
            <ToolBtn disabled={!selected} onClick={() => selected && setEtiquetaAberta(true)}>
              Etiqueta
            </ToolBtn>
            {podeCadastrar && (
              <>
                <ToolBtn onClick={() => setImportOpen(true)}>Importar</ToolBtn>
                <ToolBtn
                  onClick={() =>
                    void downloadApi("/equipamentos/import/template", { method: "GET" }, "template-equipamentos.xlsx").catch(
                      (e) => setErro(e instanceof Error ? e.message : "Erro"),
                    )
                  }
                >
                  Template
                </ToolBtn>
              </>
            )}
            <ToolBtn disabled={exportBusy} onClick={() => void exportInventario("pdf")}>
              Exportar PDF
            </ToolBtn>
            <ToolBtn disabled={exportBusy} onClick={() => void exportInventario("xlsx")}>
              Exportar XLSX
            </ToolBtn>
            {podeAbrirOs && (
              <ToolBtn onClick={() => router.push("/os/rapida")}>+ OS Rápida</ToolBtn>
            )}
          </>
        }
        filters={
          <>
            <FRow>
              <FItem label="Equipamento:" grow>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && aplicarFiltros()}
                  style={{ ...winFld, flex: 1 }}
                />
              </FItem>
              <FItem label="Criticidade:" labelWidth={80}>
                <select value={criticidade} onChange={(e) => setCriticidade(e.target.value)} style={{ ...winFld, width: 140 }}>
                  <option value="">&lt;Nenhum&gt;</option>
                  <option value="ALTA">Alta</option>
                  <option value="MEDIA">Média</option>
                  <option value="BAIXA">Baixa</option>
                </select>
              </FItem>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, marginLeft: 12 }}>
                <input type="checkbox" checked={inativos} onChange={(e) => setInativos(e.target.checked)} />
                Exibir Equipamentos Inativos
              </label>
            </FRow>
            <FRow>
              <FItem label="Modelo:" grow>
                <select
                  value={modeloId}
                  onChange={(e) => setModeloId(e.target.value)}
                  style={{ ...winFld, flex: 1 }}
                >
                  <option value="" />
                  {modelosFiltrados.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                    </option>
                  ))}
                </select>
              </FItem>
            </FRow>
            <FRow>
              <FItem label="Fabricante:" grow>
                <select
                  value={fabricanteId}
                  onChange={(e) => {
                    setFabricanteId(e.target.value);
                    setModeloId("");
                  }}
                  style={{ ...winFld, flex: 1 }}
                >
                  <option value="" />
                  {fabricantes.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome}
                    </option>
                  ))}
                </select>
              </FItem>
            </FRow>
            <FRow>
              <FItem label="Setor:" grow>
                <select value={setorId} onChange={(e) => setSetorId(e.target.value)} style={{ ...winFld, flex: 1 }}>
                  <option value="" />
                  {setores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nome}
                    </option>
                  ))}
                </select>
              </FItem>
              <FItem label="Situação:" labelWidth={70}>
                <select value={situacao} onChange={(e) => setSituacao(e.target.value)} style={{ ...winFld, width: 180 }}>
                  <option value="">Todos</option>
                  <option value="ATIVO">Em operação</option>
                  <option value="EM_GARANTIA">Em garantia</option>
                  <option value="EM_GARANTIA_ESTENDIDA">Em garantia estendida</option>
                  <option value="INATIVO">Desativado</option>
                  <option value="ARQUIVADO">Arquivado</option>
                </select>
              </FItem>
            </FRow>
            <FRow>
              <FItem label="Centro Custo:" grow>
                <select value={centroCustoId} onChange={(e) => setCentroCustoId(e.target.value)} style={{ ...winFld, flex: 1 }}>
                  <option value="" />
                  {centros.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.codigo} — {c.nome}
                    </option>
                  ))}
                </select>
              </FItem>
            </FRow>
            <FRow>
              <FItem label="TAG:">
                <input
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && aplicarFiltros()}
                  style={{ ...winFld, width: 160 }}
                />
              </FItem>
              <FItem label="Patrimônio:" labelWidth={80}>
                <input
                  value={patrimonio}
                  onChange={(e) => setPatrimonio(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && aplicarFiltros()}
                  style={{ ...winFld, width: 160 }}
                />
              </FItem>
              <FItem label="Nº Série:" labelWidth={70}>
                <input
                  value={nSerie}
                  onChange={(e) => setNSerie(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && aplicarFiltros()}
                  style={{ ...winFld, width: 160 }}
                />
              </FItem>
              <FItem label="Visualizar:" labelWidth={70}>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  style={{ ...winFld, width: 90 }}
                >
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </FItem>
              <button type="button" onClick={aplicarFiltros} style={procurarBtn}>
                Procurar
              </button>
            </FRow>
          </>
        }
        footer={
          <>
            <button type="button" style={navBtn} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              ◀ Anterior
            </button>
            <button
              type="button"
              style={navBtn}
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Próximo ▶
            </button>
            <span style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 12 }}>
              <span style={{ width: 10, height: 10, background: "#7cb87c", display: "inline-block" }} />
              Em Garantia
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, background: "#4a9e4a", display: "inline-block" }} />
              Em Garantia Estendida
            </span>
            <span style={{ marginLeft: "auto" }}>Exibindo {padCount(items.length)} de {padCount(total)} registros</span>
          </>
        }
      >
        <ZebraTable
          columns={[
            { key: "tag", label: "TAG", width: 110 },
            { key: "nome", label: "Equipamento" },
            { key: "setor", label: "Setor" },
            { key: "fab", label: "Fabricante" },
            { key: "mod", label: "Modelo" },
            { key: "pat", label: "Patrimônio", width: 110 },
            { key: "serie", label: "Nº Série", width: 120 },
            { key: "crit", label: "Criticidade", width: 90 },
            { key: "sit", label: "Situação", width: 160 },
          ]}
        >
          {items.map((eq, i) => {
            const garantia =
              eq.situacao === "EM_GARANTIA" ? "#7cb87c" : eq.situacao === "EM_GARANTIA_ESTENDIDA" ? "#4a9e4a" : null;
            return (
              <tr
                key={eq.id}
                style={zebraRow(i, eq.id === selectedId)}
                onClick={() => setSelectedId(eq.id)}
                onDoubleClick={() => abrirFicha(eq)}
              >
                <td style={td}>
                  {garantia && (
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        background: garantia,
                        display: "inline-block",
                        marginRight: 6,
                      }}
                    />
                  )}
                  <strong>{eq.tag}</strong>
                </td>
                <td style={td}>{eq.nome}</td>
                <td style={td}>{eq.setor.nome}</td>
                <td style={td}>{eq.fabricante.nome}</td>
                <td style={td}>{eq.modelo.nome}</td>
                <td style={td}>{eq.patrimonio ?? ""}</td>
                <td style={td}>{eq.nSerie ?? ""}</td>
                <td style={td}>{criticidadeDe(eq)}</td>
                <td style={td}>
                  {LABEL_SITUACAO_CICLO[eq.situacao as keyof typeof LABEL_SITUACAO_CICLO] ?? eq.situacao.replace(/_/g, " ")}
                </td>
              </tr>
            );
          })}
          {items.length === 0 && (
            <tr>
              <td colSpan={9} style={{ ...td, textAlign: "center", color: "#777", padding: 24 }}>
                Nenhum equipamento encontrado
              </td>
            </tr>
          )}
        </ZebraTable>
      </WinScreen>

      <EquipEtiquetaDialog open={etiquetaAberta} tag={selected?.tag} onClose={() => setEtiquetaAberta(false)} />

      {importOpen && (
        <Overlay onClose={() => setImportOpen(false)} fixed>
          <WinForm
            title="Importar equipamentos"
            width="min(640px, 96vw)"
            onCancel={() => setImportOpen(false)}
            showContinuar={false}
            hideSubmit
            extraRight={
              <>
                <button type="button" style={procurarBtn} onClick={() => void gerarPrevia()}>
                  Prévia
                </button>
                <button type="button" style={procurarBtn} onClick={() => void executarImport()}>
                  Importar válidos
                </button>
              </>
            }
          >
            <p style={{ margin: "0 0 12px", fontSize: 12, color: "#444" }}>
              Baixe o modelo, gere a prévia e confira erros por linha. TAG existente não é sobrescrita. TAG vazia gera
              HEF-NNNN.
            </p>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
              style={{ marginBottom: 10, fontSize: 12 }}
            />
            <textarea
              value={importCsv}
              onChange={(e) => setImportCsv(e.target.value)}
              rows={8}
              placeholder={"tag;nome;planoDescricao;fabricante;modelo;setor;patrimonio;nSerie"}
              style={{ ...fld, width: "100%", height: 140, fontFamily: "monospace", fontSize: 12 }}
            />
            {importMsg && <div style={{ marginTop: 10, fontSize: 13, fontWeight: 600 }}>{importMsg}</div>}
            {importPreview && importPreview.erros.length > 0 && (
              <div style={{ marginTop: 10, fontSize: 12, color: "#a00" }}>
                {importPreview.erros.map((e, i) => (
                  <div key={`${e.tag}-${i}`}>
                    Linha {e.linha ?? "—"} · {e.tag}: {e.erro}
                  </div>
                ))}
              </div>
            )}
          </WinForm>
        </Overlay>
      )}
    </>
  );
}

const procurarBtn = {
  background: "#e8e8e8",
  border: "1px solid #888",
  padding: "4px 14px",
  fontSize: 12,
  cursor: "pointer" as const,
  height: 24,
};

const navBtn = {
  ...procurarBtn,
  height: 26,
};
