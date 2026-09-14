"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, downloadApi } from "@/lib/api";
import { useSession } from "@/lib/session";
import {
  Badge,
  Btn,
  DataTable,
  Empty,
  Err,
  FieldLabel,
  FilterBar,
  Loading,
  PageHeader,
  Panel,
  Surface,
  fieldStyle,
  td,
  th,
} from "@/components/ui/aion-ui";

interface Item {
  id: string;
  codigo: string;
  descricao: string;
  unidade?: string;
  almoxarifado?: string;
  qtdAtual: number;
  qtdMinima: number;
  qtdReservada: number;
  disponivel: number;
  status: string;
  ativo?: boolean;
  valorUnitario?: number | null;
}

interface Movimento {
  id: string;
  tipo: string;
  quantidade: number | string;
  motivo?: string | null;
  osNumero?: number | null;
  createdAt: string;
  documento?: string | null;
  origem?: string | null;
  destino?: string | null;
  autorNome?: string | null;
  custoUnitario?: number | null;
  estoqueItem: { codigo: string; descricao: string };
}

interface Comp {
  id: string;
  itemDescricao: string;
  situacao: string;
  equipamentoOrigem: { tag: string };
  equipamentoDestino?: { tag: string } | null;
}

type Tab = "itens" | "movimentos" | "custos" | "acoes";

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

export default function EstoquePage() {
  const verValores = Boolean(useSession()?.permissoes?.verValoresFinanceiros);
  const [tab, setTab] = useState<Tab>("itens");
  const [items, setItems] = useState<Item[]>([]);
  const [totalItens, setTotalItens] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(30);
  const [qItens, setQItens] = useState("");
  const [somenteMinimo, setSomenteMinimo] = useState(false);
  const [almox, setAlmox] = useState("");
  const [incluirInativos, setIncluirInativos] = useState(false);
  const [loadingItens, setLoadingItens] = useState(true);
  const [movimentos, setMovimentos] = useState<Movimento[]>([]);
  const [comps, setComps] = useState<Comp[]>([]);
  const [filtroMov, setFiltroMov] = useState("");
  const [custos, setCustos] = useState<{
    descricaoMetodo: string;
    verValores: boolean;
    totais: { realizado: number | null; estimado: number | null; aprovado: number | null; porTipo: Record<string, number> | null };
    linhas: Array<{
      osNumero: number;
      equipamentoTag: string | null;
      tipo: string;
      descricao: string;
      quantidade: number;
      total: number | null;
      naturezaCusto: string;
      origemMaterial: string | null;
      estornado: boolean;
    }>;
  } | null>(null);
  const [filtroCustoOs, setFiltroCustoOs] = useState("");
  const [filtroCustoTag, setFiltroCustoTag] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const loadItens = useCallback(async (p = 1) => {
    setLoadingItens(true);
    try {
      const params = new URLSearchParams({
        page: String(p),
        pageSize: String(pageSize),
      });
      if (qItens.trim()) params.set("q", qItens.trim());
      if (almox.trim()) params.set("almoxarifado", almox.trim());
      if (somenteMinimo) params.set("abaixoMinimo", "1");
      if (incluirInativos) params.set("incluirInativos", "1");
      const data = await api<{ items: Item[]; total: number; page: number }>(`/estoque/itens?${params}`);
      setItems(data.items);
      setTotalItens(data.total);
      setPage(data.page);
    } finally {
      setLoadingItens(false);
    }
  }, [pageSize, qItens, somenteMinimo, almox, incluirInativos]);

  const loadMovimentos = useCallback(async () => {
    const params = filtroMov.trim() ? `?itemCodigo=${encodeURIComponent(filtroMov.trim())}` : "";
    setMovimentos(await api<Movimento[]>(`/estoque/movimentos${params}`));
  }, [filtroMov]);

  const loadComps = useCallback(async () => {
    setComps(await api<Comp[]>("/estoque/componentes-recuperados"));
  }, []);

  const loadCustos = useCallback(async () => {
    const params = new URLSearchParams();
    if (filtroCustoOs.trim()) params.set("osNumero", filtroCustoOs.trim());
    if (filtroCustoTag.trim()) params.set("equipamentoTag", filtroCustoTag.trim());
    const qs = params.toString();
    setCustos(await api<NonNullable<typeof custos>>(`/estoque/custos${qs ? `?${qs}` : ""}`));
  }, [filtroCustoOs, filtroCustoTag]);

  const load = useCallback(async () => {
    await Promise.all([loadItens(), loadMovimentos(), loadComps()]);
  }, [loadItens, loadMovimentos, loadComps]);

  useEffect(() => {
    void load().catch((e) => setErro(e instanceof Error ? e.message : "Erro"));
  }, [load]);

  useEffect(() => {
    if (tab === "movimentos") {
      void loadMovimentos().catch((e) => setErro(e instanceof Error ? e.message : "Erro"));
    }
    if (tab === "custos") {
      void loadCustos().catch((e) => setErro(e instanceof Error ? e.message : "Erro"));
    }
  }, [tab, loadMovimentos, loadCustos]);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await api("/estoque/itens", {
        method: "POST",
        body: JSON.stringify({
          codigo: String(fd.get("codigo")),
          descricao: String(fd.get("descricao")),
          qtdAtual: Number(fd.get("qtdAtual") || 0),
          qtdMinima: Number(fd.get("qtdMinima") || 0),
          valorUnitario: Number(fd.get("valorUnitario") || 0),
          unidade: String(fd.get("unidade") || "UN"),
          almoxarifado: String(fd.get("almoxarifado") || "") || undefined,
        }),
      });
      e.currentTarget.reset();
      setMsg("Item criado");
      setErro(null);
      await load();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro");
    }
  }

  async function onEntrada(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await api("/estoque/entradas", {
        method: "POST",
        body: JSON.stringify({
          itemCodigo: String(fd.get("itemCodigo")),
          qtd: Number(fd.get("qtd")),
          custoUnitario: Number(fd.get("custoUnitario") || "") || undefined,
          documento: String(fd.get("documento") || "") || undefined,
          motivo: String(fd.get("motivo") || "") || undefined,
        }),
      });
      e.currentTarget.reset();
      setMsg("Entrada registrada");
      setErro(null);
      await load();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro");
    }
  }

  async function onBaixa(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await api("/estoque/baixas", {
        method: "POST",
        body: JSON.stringify({
          itemCodigo: String(fd.get("itemCodigo")),
          qtd: Number(fd.get("qtd")),
          osNumero: Number(fd.get("osNumero")),
        }),
      });
      e.currentTarget.reset();
      setMsg("Baixa registrada");
      setErro(null);
      await load();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro");
    }
  }

  async function onReposicao(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await api("/estoque/reposicoes", {
        method: "POST",
        body: JSON.stringify({
          itemCodigo: String(fd.get("itemCodigo")),
          qtd: Number(fd.get("qtd")),
          observacao: String(fd.get("observacao") || "") || undefined,
        }),
      });
      e.currentTarget.reset();
      setMsg("Reposição solicitada");
      setErro(null);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro");
    }
  }

  async function onAjuste(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await api("/estoque/ajustes", {
        method: "POST",
        body: JSON.stringify({
          itemCodigo: String(fd.get("itemCodigo")),
          qtd: Number(fd.get("qtd")),
          motivo: String(fd.get("motivo")),
          documento: String(fd.get("documento") || "") || undefined,
        }),
      });
      e.currentTarget.reset();
      setMsg("Ajuste justificado registrado");
      setErro(null);
      await load();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro");
    }
  }

  async function onEstorno(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await api("/estoque/estornos", {
        method: "POST",
        body: JSON.stringify({
          movimentoId: String(fd.get("movimentoId")),
          motivo: String(fd.get("motivo") || "") || undefined,
        }),
      });
      e.currentTarget.reset();
      setMsg("Estorno lançado — saldo corrigido com histórico");
      setErro(null);
      await load();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro");
    }
  }

  async function onDevolucao(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await api("/estoque/devolucoes", {
        method: "POST",
        body: JSON.stringify({
          movimentoId: String(fd.get("movimentoId")),
          qtd: Number(fd.get("qtd") || "") || undefined,
          motivo: String(fd.get("motivo") || "") || undefined,
        }),
      });
      e.currentTarget.reset();
      setMsg("Devolução ao estoque registrada");
      setErro(null);
      await load();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro");
    }
  }

  async function onComp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await api("/estoque/componentes-recuperados", {
        method: "POST",
        body: JSON.stringify({
          itemDescricao: String(fd.get("itemDescricao")),
          equipamentoOrigemTag: String(fd.get("equipamentoOrigemTag")),
        }),
      });
      e.currentTarget.reset();
      setMsg("Componente recuperado em rastreamento");
      setErro(null);
      await loadComps();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro");
    }
  }

  return (
    <div>
      <PageHeader
        title="Estoque"
        subtitle="Saldo, histórico e custos — custo médio ponderado. Saldo só muda por movimento."
      />

      {erro && <Err>{erro}</Err>}
      {msg && (
        <div style={{ marginBottom: 12, fontSize: 13, fontWeight: 600, color: "oklch(0.45 0.13 150)" }}>
          {msg}
        </div>
      )}

      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid oklch(0.91 0.006 255)", marginBottom: 16 }}>
        {(["itens", "movimentos", "custos", "acoes"] as Tab[]).map((t) => (
          <button key={t} type="button" style={tabStyle(tab === t)} onClick={() => setTab(t)}>
            {t === "itens" ? "Itens" : t === "movimentos" ? "Movimentos" : t === "custos" ? "Custos" : "Ações"}
          </button>
        ))}
      </div>

      {tab === "itens" && (
        <>
          <FilterBar>
            <div>
              <FieldLabel htmlFor="est-q">Busca</FieldLabel>
              <input
                id="est-q"
                value={qItens}
                onChange={(e) => setQItens(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setPage(1);
                    void loadItens(1);
                  }
                }}
                placeholder="Código ou descrição"
                style={fieldStyle}
              />
            </div>
            <div>
              <FieldLabel htmlFor="est-loc">Localização</FieldLabel>
              <input
                id="est-loc"
                value={almox}
                onChange={(e) => setAlmox(e.target.value)}
                placeholder="Almoxarifado"
                style={fieldStyle}
              />
            </div>
            <div>
              <FieldLabel htmlFor="est-min">Status</FieldLabel>
              <label htmlFor="est-min" style={{ display: "flex", alignItems: "center", gap: 8, height: 40, fontSize: 13 }}>
                <input
                  id="est-min"
                  type="checkbox"
                  checked={somenteMinimo}
                  onChange={(e) => setSomenteMinimo(e.target.checked)}
                />
                Abaixo do mínimo
              </label>
            </div>
            <div>
              <FieldLabel htmlFor="est-in">Inativos</FieldLabel>
              <label htmlFor="est-in" style={{ display: "flex", alignItems: "center", gap: 8, height: 40, fontSize: 13 }}>
                <input
                  id="est-in"
                  type="checkbox"
                  checked={incluirInativos}
                  onChange={(e) => setIncluirInativos(e.target.checked)}
                />
                Incluir
              </label>
            </div>
            <Btn
              type="button"
              onClick={() => {
                setPage(1);
                void loadItens(1).catch((e) => setErro(e instanceof Error ? e.message : "Erro"));
              }}
            >
              Filtrar
            </Btn>
            <Btn
              type="button"
              variant="ghost"
              onClick={() =>
                void downloadApi("/estoque/export", { method: "GET" }, "estoque.csv").catch((err) =>
                  setErro(err instanceof Error ? err.message : "Erro"),
                )
              }
            >
              Exportar
            </Btn>
          </FilterBar>

          <Surface style={{ marginBottom: 16 }}>
            <form
              onSubmit={(e) => void onCreate(e)}
              style={{ display: "grid", gridTemplateColumns: "1fr 2fr 0.7fr 1fr 0.8fr 0.8fr 1fr auto", gap: 10, alignItems: "end" }}
            >
              <div>
                <FieldLabel htmlFor="est-cod">Código</FieldLabel>
                <input id="est-cod" name="codigo" placeholder="Código" required style={fieldStyle} />
              </div>
              <div>
                <FieldLabel htmlFor="est-desc">Descrição</FieldLabel>
                <input id="est-desc" name="descricao" placeholder="Descrição" required style={fieldStyle} />
              </div>
              <div>
                <FieldLabel htmlFor="est-un">Un.</FieldLabel>
                <input id="est-un" name="unidade" placeholder="UN" defaultValue="UN" style={fieldStyle} />
              </div>
              <div>
                <FieldLabel htmlFor="est-al">Local</FieldLabel>
                <input id="est-al" name="almoxarifado" placeholder="Principal" style={fieldStyle} />
              </div>
              <div>
                <FieldLabel htmlFor="est-qtd">Qtd</FieldLabel>
                <input id="est-qtd" name="qtdAtual" type="number" placeholder="Qtd" style={fieldStyle} />
              </div>
              <div>
                <FieldLabel htmlFor="est-qmin">Mín.</FieldLabel>
                <input id="est-qmin" name="qtdMinima" type="number" placeholder="Mín." style={fieldStyle} />
              </div>
              <div>
                <FieldLabel htmlFor="est-vu">Custo un.</FieldLabel>
                <input id="est-vu" name="valorUnitario" type="number" step="0.01" placeholder="R$" style={fieldStyle} />
              </div>
              <Btn type="submit">+ Item</Btn>
            </form>
          </Surface>

          {loadingItens ? (
            <Loading />
          ) : (
            <>
              <DataTable>
                <thead>
                  <tr>
                    <th style={th}>Código</th>
                    <th style={th}>Descrição</th>
                    <th style={th}>Un.</th>
                    <th style={th}>Local</th>
                    <th style={th}>Atual</th>
                    <th style={th}>Reservada</th>
                    <th style={th}>Disponível</th>
                    <th style={th}>Mín.</th>
                    {verValores && <th style={th}>Médio</th>}
                    <th style={th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={verValores ? 10 : 9} style={td}>
                        <Empty />
                      </td>
                    </tr>
                  ) : (
                    items.map((i) => (
                      <tr key={i.id}>
                        <td style={td}>{i.codigo}</td>
                        <td style={td}>{i.descricao}</td>
                        <td style={td}>{i.unidade ?? "UN"}</td>
                        <td style={td}>{i.almoxarifado ?? "—"}</td>
                        <td style={td}>{i.qtdAtual}</td>
                        <td style={td}>{i.qtdReservada}</td>
                        <td style={td}>{i.disponivel}</td>
                        <td style={td}>{i.qtdMinima}</td>
                        {verValores && <td style={td}>{i.valorUnitario ?? "—"}</td>}
                        <td style={td}>
                          <Badge tone={i.status === "ABAIXO_DO_MINIMO" ? "MEDIA" : "ATIVO"}>
                            {i.status === "ABAIXO_DO_MINIMO" ? "Abaixo do mínimo" : "Normal"}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </DataTable>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
                <Btn
                  variant="ghost"
                  disabled={page <= 1}
                  onClick={() => {
                    const p = page - 1;
                    setPage(p);
                    void loadItens(p);
                  }}
                >
                  Anterior
                </Btn>
                <span style={{ fontSize: 13, color: "oklch(0.5 0.02 250)" }}>
                  Página {page} · {totalItens} item(ns)
                </span>
                <Btn
                  variant="ghost"
                  disabled={page * pageSize >= totalItens}
                  onClick={() => {
                    const p = page + 1;
                    setPage(p);
                    void loadItens(p);
                  }}
                >
                  Próxima
                </Btn>
              </div>
            </>
          )}
        </>
      )}

      {tab === "movimentos" && (
        <>
          <FilterBar>
            <div>
              <FieldLabel htmlFor="mov-cod">Código do item</FieldLabel>
              <input
                id="mov-cod"
                value={filtroMov}
                onChange={(e) => setFiltroMov(e.target.value)}
                placeholder="Ex: PEC-001"
                style={fieldStyle}
              />
            </div>
            <Btn onClick={() => void loadMovimentos()}>Filtrar</Btn>
          </FilterBar>

          <DataTable>
            <thead>
              <tr>
                    <th style={th}>Data</th>
                    <th style={th}>Item</th>
                    <th style={th}>Tipo</th>
                    <th style={th}>Qtd</th>
                    <th style={th}>OS</th>
                    <th style={th}>Autor</th>
                    <th style={th}>Documento</th>
                    {verValores && <th style={th}>Custo un.</th>}
                    <th style={th}>Motivo</th>
              </tr>
            </thead>
            <tbody>
              {movimentos.length === 0 ? (
                <tr>
                      <td colSpan={verValores ? 9 : 8} style={td}>
                    <Empty text="Nenhum movimento registrado." />
                  </td>
                </tr>
              ) : (
                movimentos.map((m) => (
                  <tr key={m.id}>
                    <td style={td}>{new Date(m.createdAt).toLocaleString("pt-BR")}</td>
                    <td style={td}>
                      {m.estoqueItem.codigo}
                      <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)" }}>{m.estoqueItem.descricao}</div>
                    </td>
                    <td style={td}>
                      <Badge tone="ATIVO">{m.tipo.replace(/_/g, " ")}</Badge>
                    </td>
                    <td style={td}>{Number(m.quantidade)}</td>
                    <td style={td}>{m.osNumero ?? "—"}</td>
                    <td style={td}>{m.autorNome ?? "—"}</td>
                    <td style={td}>{m.documento ?? "—"}</td>
                    {verValores && <td style={td}>{m.custoUnitario ?? "—"}</td>}
                    <td style={td}>{m.motivo ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </DataTable>
        </>
      )}

      {tab === "custos" && (
        <>
          <p style={{ fontSize: 13, color: "oklch(0.45 0.02 250)", marginTop: 0 }}>
            {custos?.descricaoMetodo ?? "Custo médio ponderado."} Estimado/aprovado não entra no realizado.
          </p>
          <FilterBar>
            <div>
              <FieldLabel>Nº OS</FieldLabel>
              <input value={filtroCustoOs} onChange={(e) => setFiltroCustoOs(e.target.value)} style={fieldStyle} />
            </div>
            <div>
              <FieldLabel>TAG equipamento</FieldLabel>
              <input value={filtroCustoTag} onChange={(e) => setFiltroCustoTag(e.target.value)} style={fieldStyle} />
            </div>
            <Btn onClick={() => void loadCustos()}>Filtrar</Btn>
          </FilterBar>
          {custos?.verValores && custos.totais.realizado != null && (
            <div style={{ display: "flex", gap: 16, marginBottom: 12, fontSize: 13 }}>
              <strong>Realizado R$ {custos.totais.realizado}</strong>
              <span>Estimado R$ {custos.totais.estimado}</span>
              <span>Aprovado R$ {custos.totais.aprovado}</span>
            </div>
          )}
          {!custos?.verValores && (
            <p style={{ fontSize: 13, color: "oklch(0.5 0.02 250)" }}>Valores ocultos — permissão financeira necessária.</p>
          )}
          <DataTable>
            <thead>
              <tr>
                <th style={th}>OS</th>
                <th style={th}>Equip.</th>
                <th style={th}>Tipo</th>
                <th style={th}>Descrição</th>
                <th style={th}>Qtd</th>
                <th style={th}>Natureza</th>
                {verValores && <th style={th}>Total</th>}
              </tr>
            </thead>
            <tbody>
              {(custos?.linhas ?? []).length === 0 ? (
                <tr>
                  <td colSpan={verValores ? 7 : 6} style={td}>
                    <Empty text="Nenhum custo lançado." />
                  </td>
                </tr>
              ) : (
                (custos?.linhas ?? []).map((l, idx) => (
                  <tr key={`${l.osNumero}-${idx}`}>
                    <td style={td}>{l.osNumero}</td>
                    <td style={td}>{l.equipamentoTag ?? "—"}</td>
                    <td style={td}>{l.tipo.replace(/_/g, " ")}</td>
                    <td style={td}>{l.descricao}{l.estornado ? " (estornado)" : ""}</td>
                    <td style={td}>{l.quantidade}</td>
                    <td style={td}>{l.naturezaCusto}</td>
                    {verValores && <td style={td}>{l.total ?? "—"}</td>}
                  </tr>
                ))
              )}
            </tbody>
          </DataTable>
        </>
      )}

      {tab === "acoes" && (
        <div style={{ display: "grid", gap: 16 }}>
          <Panel title="Entrada de estoque">
            <form
              onSubmit={(e) => void onEntrada(e)}
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr auto", gap: 10, alignItems: "end" }}
            >
              <div>
                <FieldLabel>Código item</FieldLabel>
                <input name="itemCodigo" required placeholder="PEC-001" style={fieldStyle} />
              </div>
              <div>
                <FieldLabel>Quantidade</FieldLabel>
                <input name="qtd" type="number" step="0.01" min="0.01" required style={fieldStyle} />
              </div>
              <div>
                <FieldLabel>Motivo (opcional)</FieldLabel>
                <input name="motivo" placeholder="Compra, NF…" style={fieldStyle} />
              </div>
              {verValores && (
                <div>
                  <FieldLabel>Custo un. desta entrada</FieldLabel>
                  <input name="custoUnitario" type="number" step="0.01" min="0" placeholder="Atualiza o médio" style={fieldStyle} />
                </div>
              )}
              <div>
                <FieldLabel>Documento</FieldLabel>
                <input name="documento" placeholder="NF, empenho…" style={fieldStyle} />
              </div>
              <Btn type="submit">Registrar entrada</Btn>
            </form>
          </Panel>

          <Panel title="Baixa de estoque">
            <form
              onSubmit={(e) => void onBaixa(e)}
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 10, alignItems: "end" }}
            >
              <div>
                <FieldLabel>Código item</FieldLabel>
                <input name="itemCodigo" required placeholder="PEC-001" style={fieldStyle} />
              </div>
              <div>
                <FieldLabel>Quantidade</FieldLabel>
                <input name="qtd" type="number" step="0.01" min="0.01" required style={fieldStyle} />
              </div>
              <div>
                <FieldLabel>Nº OS</FieldLabel>
                <input name="osNumero" type="number" required placeholder="1234" style={fieldStyle} />
              </div>
              <Btn type="submit">Registrar baixa</Btn>
            </form>
          </Panel>

          <Panel title="Ajuste justificado (saldo não é editável direto)">
            <form
              onSubmit={(e) => void onAjuste(e)}
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr 1fr auto", gap: 10, alignItems: "end" }}
            >
              <div>
                <FieldLabel>Código item</FieldLabel>
                <input name="itemCodigo" required placeholder="PEC-001" style={fieldStyle} />
              </div>
              <div>
                <FieldLabel>Qtd (+ ou −)</FieldLabel>
                <input name="qtd" type="number" step="0.01" required style={fieldStyle} />
              </div>
              <div>
                <FieldLabel>Justificativa</FieldLabel>
                <input name="motivo" required minLength={3} placeholder="Inventário, avaria…" style={fieldStyle} />
              </div>
              <div>
                <FieldLabel>Documento</FieldLabel>
                <input name="documento" placeholder="Opcional" style={fieldStyle} />
              </div>
              <Btn type="submit">Ajustar</Btn>
            </form>
          </Panel>

          <Panel title="Devolução ao estoque">
            <form
              onSubmit={(e) => void onDevolucao(e)}
              style={{ display: "grid", gridTemplateColumns: "2fr 1fr 2fr auto", gap: 10, alignItems: "end" }}
            >
              <div>
                <FieldLabel>ID do movimento de baixa</FieldLabel>
                <input name="movimentoId" required placeholder="id da baixa" style={fieldStyle} />
              </div>
              <div>
                <FieldLabel>Qtd (opcional)</FieldLabel>
                <input name="qtd" type="number" step="0.01" min="0.01" style={fieldStyle} />
              </div>
              <div>
                <FieldLabel>Motivo</FieldLabel>
                <input name="motivo" placeholder="Destino físico conferido" style={fieldStyle} />
              </div>
              <Btn type="submit">Devolver</Btn>
            </form>
          </Panel>

          <Panel title="Estorno com histórico">
            <form
              onSubmit={(e) => void onEstorno(e)}
              style={{ display: "grid", gridTemplateColumns: "2fr 2fr auto", gap: 10, alignItems: "end" }}
            >
              <div>
                <FieldLabel>ID do movimento</FieldLabel>
                <input name="movimentoId" required placeholder="id do movimento" style={fieldStyle} />
              </div>
              <div>
                <FieldLabel>Motivo</FieldLabel>
                <input name="motivo" placeholder="Correção" style={fieldStyle} />
              </div>
              <Btn type="submit">Estornar</Btn>
            </form>
          </Panel>

          <Panel title="Solicitar reposição">
            <form
              onSubmit={(e) => void onReposicao(e)}
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr auto", gap: 10, alignItems: "end" }}
            >
              <div>
                <FieldLabel>Código item</FieldLabel>
                <input name="itemCodigo" required placeholder="PEC-001" style={fieldStyle} />
              </div>
              <div>
                <FieldLabel>Quantidade</FieldLabel>
                <input name="qtd" type="number" step="0.01" min="0.01" required style={fieldStyle} />
              </div>
              <div>
                <FieldLabel>Observação</FieldLabel>
                <input name="observacao" placeholder="Urgência, fornecedor…" style={fieldStyle} />
              </div>
              <Btn type="submit">Solicitar</Btn>
            </form>
          </Panel>

          <Panel title="Componentes recuperados">
            <form
              onSubmit={(e) => void onComp(e)}
              style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: 10, alignItems: "end", marginBottom: 14 }}
            >
              <div>
                <FieldLabel>Descrição da peça</FieldLabel>
                <input name="itemDescricao" placeholder="Descrição da peça" required style={fieldStyle} />
              </div>
              <div>
                <FieldLabel>TAG origem</FieldLabel>
                <input name="equipamentoOrigemTag" placeholder="TAG origem" required style={fieldStyle} />
              </div>
              <Btn type="submit">Rastrear</Btn>
            </form>
            {comps.length === 0 ? (
              <Empty text="Nenhum componente recuperado." />
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {comps.map((c) => (
                  <Surface key={c.id} style={{ padding: 12, fontSize: 13 }}>
                    <strong>{c.itemDescricao}</strong> · origem {c.equipamentoOrigem.tag} · {c.situacao}
                    {c.equipamentoDestino ? ` · destino ${c.equipamentoDestino.tag}` : ""}
                  </Surface>
                ))}
              </div>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
