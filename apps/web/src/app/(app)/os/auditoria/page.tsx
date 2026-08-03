"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  Badge,
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
} from "@/components/ui/aion-ui";

interface LogRow {
  id: string;
  acao: string;
  justificativa?: string | null;
  createdAt: string;
  usuario?: { nome: string } | null;
  ordemServico: { numero: number; codigo: string | null };
}

const ACOES = [
  "ABERTURA",
  "ATRIBUICAO",
  "FECHAMENTO",
  "FECHAMENTO_MOBILE",
  "CANCELAMENTO",
  "REABERTURA",
  "SERVICO_EXECUTADO",
];

export default function OsAuditoriaPage() {
  const [items, setItems] = useState<LogRow[]>([]);
  const [acao, setAcao] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  async function load(filtro = acao) {
    const q = filtro ? `?acao=${encodeURIComponent(filtro)}` : "";
    setItems(await api<LogRow[]>(`/os/auditoria${q}`));
  }

  useEffect(() => {
    void load().catch((e) => setErro(e.message));
  }, []);

  return (
    <div>
      <PageHeader title="Auditoria de OS" subtitle="Trilha imutável · somente leitura" />
      {erro && <Err>{erro}</Err>}

      <FilterBar>
        <div>
          <FieldLabel>Ação</FieldLabel>
          <select
            value={acao}
            onChange={(e) => {
              setAcao(e.target.value);
              void load(e.target.value).catch((err) => setErro(err.message));
            }}
            style={fieldStyle}
          >
            <option value="">Todas as ações</option>
            {ACOES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      </FilterBar>

      <ResultCount n={items.length} />

      <DataTable>
        <thead>
          <tr>
            <th style={th}>Quando</th>
            <th style={th}>OS</th>
            <th style={th}>Ação</th>
            <th style={th}>Usuário</th>
            <th style={th}>Detalhe</th>
          </tr>
        </thead>
        <tbody>
          {items.map((l) => (
            <tr key={l.id}>
              <td style={td}>{new Date(l.createdAt).toLocaleString("pt-BR")}</td>
              <td style={td}>
                <strong>{l.ordemServico.codigo ?? `OS-${l.ordemServico.numero}`}</strong>
              </td>
              <td style={td}>
                <Badge>{l.acao}</Badge>
              </td>
              <td style={td}>{l.usuario?.nome ?? "—"}</td>
              <td style={{ ...td, color: "oklch(0.45 0.02 250)", maxWidth: 360 }}>{l.justificativa ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </DataTable>
      {items.length === 0 && <Empty text="Sem registros de auditoria." />}
    </div>
  );
}
