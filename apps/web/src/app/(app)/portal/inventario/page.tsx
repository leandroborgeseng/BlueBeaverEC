"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useWindowStore } from "@/store/windows";
import {
  Badge,
  DataTable,
  Empty,
  Err,
  PageHeader,
  td,
  th,
} from "@/components/ui/aion-ui";

interface InventarioRow {
  tag: string;
  nome: string;
  situacao: string;
  setor: string;
  fabricante: string;
  modelo: string;
  tipo: string;
  criticidade: string;
}

export default function InventarioPage() {
  const [items, setItems] = useState<InventarioRow[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const open = useWindowStore((s) => s.open);

  useEffect(() => {
    api<InventarioRow[]>("/portal/inventario-setor")
      .then(setItems)
      .catch((e) => setErro(e instanceof Error ? e.message : "Erro"));
  }, []);

  return (
    <div>
      <PageHeader
        title="Inventário do Setor"
        subtitle="Equipamentos vinculados ao(s) seu(s) setor(es)"
      />

      {erro && <Err>{erro}</Err>}

      <div style={{ fontSize: 13, fontWeight: 600, color: "oklch(0.5 0.02 250)", margin: "0 0 10px" }}>
        {items.length} equipamento(s)
      </div>

      <DataTable>
        <thead>
          <tr>
            <th style={th}>TAG</th>
            <th style={th}>Equipamento</th>
            <th style={th}>Setor</th>
            <th style={th}>Fabricante / Modelo</th>
            <th style={th}>Tipo</th>
            <th style={th}>Criticidade</th>
            <th style={th}>Situação</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr
              key={row.tag}
              onClick={() =>
                open({
                  kind: "equipamento",
                  title: `${row.tag} — ${row.nome}`,
                  payload: { tag: row.tag },
                })
              }
              style={{ cursor: "pointer" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "oklch(0.975 0.01 250)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <td style={td}>
                <strong>{row.tag}</strong>
              </td>
              <td style={td}>{row.nome}</td>
              <td style={td}>{row.setor}</td>
              <td style={td}>
                {row.fabricante} / {row.modelo}
              </td>
              <td style={td}>{row.tipo}</td>
              <td style={td}>
                <Badge tone={row.criticidade}>{row.criticidade}</Badge>
              </td>
              <td style={td}>
                <Badge tone={row.situacao}>{row.situacao.replace(/_/g, " ")}</Badge>
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={7}>
                <Empty text="Nenhum equipamento no inventário." />
              </td>
            </tr>
          )}
        </tbody>
      </DataTable>
    </div>
  );
}
