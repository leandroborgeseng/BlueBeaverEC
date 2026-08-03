"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  Badge,
  Btn,
  DataTable,
  Empty,
  Err,
  FieldLabel,
  FilterBar,
  PageHeader,
  fieldStyle,
  td,
  th,
} from "@/components/ui/aion-ui";

interface EquipamentoRow {
  id: string;
  tag: string;
  nome: string;
  situacao: string;
  setor: { nome: string };
  fabricante: { nome: string };
  modelo: { nome: string };
}

interface EquipListResponse {
  items: EquipamentoRow[];
  total: number;
}

export default function FichaVidaHubPage() {
  const [items, setItems] = useState<EquipamentoRow[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    params.set("page", "1");
    try {
      const data = await api<EquipListResponse>(`/equipamentos?${params.toString()}`);
      setItems(data.items);
      setTotal(data.total);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    }
  }, [q]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <PageHeader
        title="Ficha Vida"
        subtitle="Selecione um equipamento para ver histórico unificado, confiabilidade e custos"
      />

      {erro && <Err>{erro}</Err>}

      <FilterBar>
        <div style={{ gridColumn: "span 2" }}>
          <FieldLabel>Buscar equipamento</FieldLabel>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void load()}
            placeholder="TAG, nome ou patrimônio…"
            style={fieldStyle}
          />
        </div>
        <div>
          <FieldLabel>&nbsp;</FieldLabel>
          <Btn onClick={() => void load()} style={{ width: "100%" }}>
            Buscar
          </Btn>
        </div>
      </FilterBar>

      <div style={{ fontSize: 13, fontWeight: 600, color: "oklch(0.5 0.02 250)", margin: "0 0 10px" }}>
        {total} equipamento(s)
      </div>

      <DataTable>
        <thead>
          <tr>
            <th style={th}>TAG</th>
            <th style={th}>Equipamento</th>
            <th style={th}>Setor</th>
            <th style={th}>Fabricante / Modelo</th>
            <th style={th}>Situação</th>
            <th style={th}>Ação</th>
          </tr>
        </thead>
        <tbody>
          {items.map((eq) => (
            <tr key={eq.id}>
              <td style={td}>
                <strong>{eq.tag}</strong>
              </td>
              <td style={td}>{eq.nome}</td>
              <td style={td}>{eq.setor.nome}</td>
              <td style={td}>
                {eq.fabricante.nome} / {eq.modelo.nome}
              </td>
              <td style={td}>
                <Badge tone={eq.situacao}>{eq.situacao.replace(/_/g, " ")}</Badge>
              </td>
              <td style={td}>
                <Link
                  href={`/equipamentos/${encodeURIComponent(eq.tag)}/ficha-vida`}
                  style={{ fontSize: 13, fontWeight: 600, color: "oklch(0.55 0.16 255)" }}
                >
                  Abrir ficha →
                </Link>
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={6}>
                <Empty text="Nenhum equipamento encontrado" />
              </td>
            </tr>
          )}
        </tbody>
      </DataTable>
    </div>
  );
}
