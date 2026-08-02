"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";

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

interface Comp {
  id: string;
  itemDescricao: string;
  situacao: string;
  equipamentoOrigem: { tag: string };
  equipamentoDestino?: { tag: string } | null;
}

export default function EstoquePage() {
  const [items, setItems] = useState<Item[]>([]);
  const [comps, setComps] = useState<Comp[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const [i, c] = await Promise.all([
      api<Item[]>("/estoque/itens"),
      api<Comp[]>("/estoque/componentes-recuperados"),
    ]);
    setItems(i);
    setComps(c);
  }

  useEffect(() => {
    void load().catch((e) => setMsg(e.message));
  }, []);

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
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erro");
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
      setMsg("Componente recuperado em rastreamento (fora do estoque comum)");
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erro");
    }
  }

  return (
    <div>
      <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 800 }}>Estoque</h1>
      <p style={{ margin: "0 0 16px", color: "var(--nexo-muted)", fontSize: 13 }}>
        Baixa imediata · saldo negativo permitido · componentes recuperados em lista separada
      </p>
      {msg && <div style={{ marginBottom: 12 }}>{msg}</div>}

      <form
        onSubmit={(e) => void onCreate(e)}
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 2fr 1fr 1fr 1fr auto",
          gap: 8,
          marginBottom: 16,
          background: "var(--nexo-surface)",
          border: "1px solid var(--nexo-border)",
          borderRadius: 12,
          padding: 12,
        }}
      >
        <input name="codigo" placeholder="Código" required style={input} />
        <input name="descricao" placeholder="Descrição" required style={input} />
        <input name="qtdAtual" type="number" placeholder="Qtd" style={input} />
        <input name="qtdMinima" type="number" placeholder="Mín." style={input} />
        <input name="valorUnitario" type="number" step="0.01" placeholder="R$" style={input} />
        <button type="submit" style={btn}>+ Item</button>
      </form>

      <div style={{ background: "var(--nexo-surface)", border: "1px solid var(--nexo-border)", borderRadius: 12, marginBottom: 18 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", background: "oklch(0.97 0.01 250)" }}>
              <th style={th}>Código</th>
              <th style={th}>Descrição</th>
              <th style={th}>Atual</th>
              <th style={th}>Reservada</th>
              <th style={th}>Disponível</th>
              <th style={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} style={{ borderTop: "1px solid var(--nexo-border)" }}>
                <td style={td}>{i.codigo}</td>
                <td style={td}>{i.descricao}</td>
                <td style={td}>{i.qtdAtual}</td>
                <td style={td}>{i.qtdReservada}</td>
                <td style={td}>{i.disponivel}</td>
                <td style={{ ...td, color: i.status === "ABAIXO_DO_MINIMO" ? "var(--nexo-warning)" : undefined, fontWeight: 700 }}>
                  {i.status === "ABAIXO_DO_MINIMO" ? "Abaixo do mínimo" : "Normal"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 style={{ fontSize: 16 }}>Componentes Recuperados</h2>
      <form onSubmit={(e) => void onComp(e)} style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: 8, marginBottom: 12 }}>
        <input name="itemDescricao" placeholder="Descrição da peça" required style={input} />
        <input name="equipamentoOrigemTag" placeholder="TAG origem" required style={input} />
        <button type="submit" style={btn}>Rastrear</button>
      </form>
      <div style={{ display: "grid", gap: 8 }}>
        {comps.map((c) => (
          <div key={c.id} style={{ background: "var(--nexo-surface)", border: "1px solid var(--nexo-border)", borderRadius: 10, padding: 12, fontSize: 13 }}>
            <strong>{c.itemDescricao}</strong> · origem {c.equipamentoOrigem.tag} · {c.situacao}
            {c.equipamentoDestino ? ` · destino ${c.equipamentoDestino.tag}` : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

const input: React.CSSProperties = { border: "1px solid var(--nexo-border)", borderRadius: 10, padding: "10px 12px" };
const btn: React.CSSProperties = { border: "none", borderRadius: 10, padding: "10px 14px", background: "var(--nexo-primary)", color: "white", fontWeight: 700 };
const th: React.CSSProperties = { padding: "12px 14px", fontSize: 12, color: "var(--nexo-muted)" };
const td: React.CSSProperties = { padding: "12px 14px" };
