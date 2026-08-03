"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  Badge,
  Btn,
  DataTable,
  Empty,
  Err,
  FieldLabel,
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
  qtdAtual: number;
  qtdMinima: number;
  qtdReservada: number;
  disponivel: number;
  status: string;
}

interface Movimento {
  id: string;
  tipo: string;
  quantidade: number | string;
  motivo?: string | null;
  osNumero?: number | null;
  createdAt: string;
  estoqueItem: { codigo: string; descricao: string };
}

interface Comp {
  id: string;
  itemDescricao: string;
  situacao: string;
  equipamentoOrigem: { tag: string };
  equipamentoDestino?: { tag: string } | null;
}

type Tab = "itens" | "movimentos" | "acoes";

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
  const [tab, setTab] = useState<Tab>("itens");
  const [items, setItems] = useState<Item[]>([]);
  const [movimentos, setMovimentos] = useState<Movimento[]>([]);
  const [comps, setComps] = useState<Comp[]>([]);
  const [filtroMov, setFiltroMov] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const loadItens = useCallback(async () => {
    setItems(await api<Item[]>("/estoque/itens"));
  }, []);

  const loadMovimentos = useCallback(async () => {
    const params = filtroMov.trim() ? `?itemCodigo=${encodeURIComponent(filtroMov.trim())}` : "";
    setMovimentos(await api<Movimento[]>(`/estoque/movimentos${params}`));
  }, [filtroMov]);

  const loadComps = useCallback(async () => {
    setComps(await api<Comp[]>("/estoque/componentes-recuperados"));
  }, []);

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
  }, [tab, loadMovimentos]);

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
        subtitle="Itens · movimentos · entradas, baixas e reposições"
      />

      {erro && <Err>{erro}</Err>}
      {msg && (
        <div style={{ marginBottom: 12, fontSize: 13, fontWeight: 600, color: "oklch(0.45 0.13 150)" }}>
          {msg}
        </div>
      )}

      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid oklch(0.91 0.006 255)", marginBottom: 16 }}>
        {(["itens", "movimentos", "acoes"] as Tab[]).map((t) => (
          <button key={t} type="button" style={tabStyle(tab === t)} onClick={() => setTab(t)}>
            {t === "itens" ? "Itens" : t === "movimentos" ? "Movimentos" : "Ações"}
          </button>
        ))}
      </div>

      {tab === "itens" && (
        <>
          <Surface style={{ marginBottom: 16 }}>
            <form
              onSubmit={(e) => void onCreate(e)}
              style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr 1fr 1fr auto", gap: 10, alignItems: "end" }}
            >
              <div>
                <FieldLabel>Código</FieldLabel>
                <input name="codigo" placeholder="Código" required style={fieldStyle} />
              </div>
              <div>
                <FieldLabel>Descrição</FieldLabel>
                <input name="descricao" placeholder="Descrição" required style={fieldStyle} />
              </div>
              <div>
                <FieldLabel>Qtd</FieldLabel>
                <input name="qtdAtual" type="number" placeholder="Qtd" style={fieldStyle} />
              </div>
              <div>
                <FieldLabel>Mín.</FieldLabel>
                <input name="qtdMinima" type="number" placeholder="Mín." style={fieldStyle} />
              </div>
              <div>
                <FieldLabel>R$</FieldLabel>
                <input name="valorUnitario" type="number" step="0.01" placeholder="R$" style={fieldStyle} />
              </div>
              <Btn type="submit">+ Item</Btn>
            </form>
          </Surface>

          <DataTable>
            <thead>
              <tr>
                <th style={th}>Código</th>
                <th style={th}>Descrição</th>
                <th style={th}>Atual</th>
                <th style={th}>Reservada</th>
                <th style={th}>Disponível</th>
                <th style={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} style={td}>
                    <Empty />
                  </td>
                </tr>
              ) : (
                items.map((i) => (
                  <tr key={i.id}>
                    <td style={td}>{i.codigo}</td>
                    <td style={td}>{i.descricao}</td>
                    <td style={td}>{i.qtdAtual}</td>
                    <td style={td}>{i.qtdReservada}</td>
                    <td style={td}>{i.disponivel}</td>
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
        </>
      )}

      {tab === "movimentos" && (
        <>
          <Surface style={{ marginBottom: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "end" }}>
              <div>
                <FieldLabel>Filtrar por código do item</FieldLabel>
                <input
                  value={filtroMov}
                  onChange={(e) => setFiltroMov(e.target.value)}
                  placeholder="Ex: PEC-001"
                  style={fieldStyle}
                />
              </div>
              <Btn onClick={() => void loadMovimentos()}>Filtrar</Btn>
            </div>
          </Surface>

          <DataTable>
            <thead>
              <tr>
                <th style={th}>Data</th>
                <th style={th}>Item</th>
                <th style={th}>Tipo</th>
                <th style={th}>Qtd</th>
                <th style={th}>OS</th>
                <th style={th}>Motivo</th>
              </tr>
            </thead>
            <tbody>
              {movimentos.length === 0 ? (
                <tr>
                  <td colSpan={6} style={td}>
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
                    <td style={td}>{m.motivo ?? "—"}</td>
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
                <input name="motivo" placeholder="Compra, devolução…" style={fieldStyle} />
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
