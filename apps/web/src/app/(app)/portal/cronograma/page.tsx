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

interface CronogramaRow {
  id: string;
  tipo: string;
  validadeAte: string | null;
  equipamento: { tag: string; nome: string; setor: string };
  status: string;
}

export default function CronogramaPage() {
  const [items, setItems] = useState<CronogramaRow[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api<CronogramaRow[]>("/portal/cronograma-calibracao")
      .then(setItems)
      .catch((e) => setErro(e instanceof Error ? e.message : "Erro"));
  }, []);

  return (
    <div>
      <PageHeader
        title="Cronograma de Calibração"
        subtitle="Certificados de calibração e segurança elétrica por equipamento do seu setor"
      />

      {erro && <Err>{erro}</Err>}

      <DataTable>
        <thead>
          <tr>
            <th style={th}>TAG</th>
            <th style={th}>Equipamento</th>
            <th style={th}>Setor</th>
            <th style={th}>Tipo</th>
            <th style={th}>Validade</th>
            <th style={th}>Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id}>
              <td style={td}>
                <strong>{row.equipamento.tag}</strong>
              </td>
              <td style={td}>{row.equipamento.nome}</td>
              <td style={td}>{row.equipamento.setor}</td>
              <td style={td}>{row.tipo.replace(/_/g, " ")}</td>
              <td style={td}>
                {row.validadeAte ? new Date(row.validadeAte).toLocaleDateString("pt-BR") : "—"}
              </td>
              <td style={td}>
                <Badge tone={row.status}>{row.status.replace(/_/g, " ")}</Badge>
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={6}>
                <Empty text="Nenhum certificado encontrado." />
              </td>
            </tr>
          )}
        </tbody>
      </DataTable>
    </div>
  );
}
