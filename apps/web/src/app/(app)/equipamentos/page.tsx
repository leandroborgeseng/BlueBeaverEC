"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useWindowStore } from "@/store/windows";
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

interface EquipamentoRow {
  id: string;
  tag: string;
  nome: string;
  situacao: string;
  checklistRecebimentoPendente: boolean;
  setor: { nome: string };
  fabricante: { nome: string };
  modelo: { nome: string };
  descricao: { nome: string; criticidade: string };
}

export default function EquipamentosPage() {
  const [items, setItems] = useState<EquipamentoRow[]>([]);
  const [q, setQ] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const open = useWindowStore((s) => s.open);

  async function load(search = q) {
    try {
      const data = await api<{ items: EquipamentoRow[] }>(
        `/equipamentos?q=${encodeURIComponent(search)}`,
      );
      setItems(data.items);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    }
  }

  useEffect(() => {
    void load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <PageHeader
        title="Equipamentos"
        subtitle="Inventário patrimonial com alerta de checklist de recebimento pendente"
        actions={
          <>
            <Btn href="/os/nova" variant="secondary">
              Abrir OS
            </Btn>
            <Btn href="/os/rapida" variant="primary">
              + OS Rápida
            </Btn>
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
            onKeyDown={(e) => e.key === "Enter" && void load()}
            placeholder="Ex: Monitor, EQ-0198, patrimônio…"
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

      <ResultCount n={items.length} />

      <DataTable>
        <thead>
          <tr>
            <th style={th}>TAG</th>
            <th style={th}>Equipamento</th>
            <th style={th}>Setor</th>
            <th style={th}>Fabricante / Modelo</th>
            <th style={th}>Criticidade</th>
            <th style={th}>Situação</th>
          </tr>
        </thead>
        <tbody>
          {items.map((eq) => (
            <tr
              key={eq.id}
              onClick={() =>
                open({
                  kind: "equipamento",
                  title: `${eq.tag} — ${eq.nome}`,
                  payload: eq as unknown as Record<string, unknown>,
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
                <Badge tone={eq.descricao.criticidade}>{eq.descricao.criticidade}</Badge>
              </td>
              <td style={td}>
                <Badge tone={eq.situacao}>{eq.situacao.replace(/_/g, " ")}</Badge>
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
