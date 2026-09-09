"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  Badge,
  DataTable,
  Empty,
  Err,
  PageHeader,
  td,
  th,
} from "@/components/ui/aion-ui";

interface OsAberta {
  id: string;
  numero: number;
  codigo: string;
  tipo: string;
  status: string;
  prioridade: string;
  abertura: string;
  equipamento: { tag: string; nome: string; setor: string };
}

export default function PortalOsAbertasPage() {
  const [items, setItems] = useState<OsAberta[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api<OsAberta[]>("/portal/os-abertas")
      .then(setItems)
      .catch((e) => setErro(e instanceof Error ? e.message : "Erro"));
  }, []);

  return (
    <div>
      <PageHeader
        title="OS abertas"
        subtitle="Ordens em andamento nos equipamentos do seu setor"
      />

      {erro && <Err>{erro}</Err>}

      <div style={{ fontSize: 13, fontWeight: 600, color: "oklch(0.5 0.02 250)", margin: "0 0 10px" }}>
        {items.length} ordem(ns)
      </div>

      <DataTable>
        <thead>
          <tr>
            <th style={th}>OS</th>
            <th style={th}>TAG</th>
            <th style={th}>Equipamento</th>
            <th style={th}>Setor</th>
            <th style={th}>Tipo</th>
            <th style={th}>Prioridade</th>
            <th style={th}>Status</th>
            <th style={th}>Abertura</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id}>
              <td style={td}>
                <strong>{row.codigo}</strong>
              </td>
              <td style={td}>{row.equipamento.tag}</td>
              <td style={td}>{row.equipamento.nome}</td>
              <td style={td}>{row.equipamento.setor}</td>
              <td style={td}>{row.tipo.replace(/_/g, " ")}</td>
              <td style={td}>
                <Badge tone={row.prioridade}>{row.prioridade.replace(/_/g, " ")}</Badge>
              </td>
              <td style={td}>
                <Badge tone={row.status}>{row.status.replace(/_/g, " ")}</Badge>
              </td>
              <td style={td}>{new Date(row.abertura).toLocaleDateString("pt-BR")}</td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={8}>
                <Empty text="Nenhuma OS aberta no seu setor." />
              </td>
            </tr>
          )}
        </tbody>
      </DataTable>
    </div>
  );
}
