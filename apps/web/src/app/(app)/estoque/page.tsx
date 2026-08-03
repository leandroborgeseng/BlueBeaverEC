"use client";

import { FormEvent, useEffect, useState } from "react";
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
} from "@/components/ui/nexo-ui";

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
      <PageHeader title="Estoque" subtitle="Baixa imediata · saldo negativo permitido · componentes recuperados em lista separada" />
      {msg && <Err>{msg}</Err>}

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

      <div style={{ marginTop: 18 }}>
      <Panel title="Componentes Recuperados">
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
    </div>
  );
}
