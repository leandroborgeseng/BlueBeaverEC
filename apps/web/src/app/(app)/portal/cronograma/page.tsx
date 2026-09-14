"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
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
  dataPrevista?: string | null;
  validadeAte: string | null;
  equipamento: { tag: string; nome: string; setor: string };
  status: string;
}

export default function CronogramaPage() {
  const me = useSession();
  const [items, setItems] = useState<CronogramaRow[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const setorLabel = me?.setores?.map((s) => s.nome).join(" · ");

  useEffect(() => {
    api<CronogramaRow[]>("/portal/cronograma-manutencao")
      .then(setItems)
      .catch((e) => setErro(e instanceof Error ? e.message : "Erro"));
  }, []);

  return (
    <div>
      <PageHeader
        title="Cronograma de Manutenção"
        subtitle={
          setorLabel
            ? `Preventiva, TSE, calibração e qualificação · ${setorLabel}`
            : "Preventiva, TSE, calibração e qualificação do parque"
        }
      />

      {erro && <Err>{erro}</Err>}

      <DataTable>
        <thead>
          <tr>
            <th style={th}>TAG</th>
            <th style={th}>Equipamento</th>
            <th style={th}>Setor</th>
            <th style={th}>Tipo</th>
            <th style={th}>Data prevista</th>
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
                {row.dataPrevista || row.validadeAte
                  ? new Date(row.dataPrevista ?? row.validadeAte!).toLocaleDateString("pt-BR")
                  : "—"}
              </td>
              <td style={td}>
                <Badge tone={row.status}>{row.status.replace(/_/g, " ")}</Badge>
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={6}>
                <Empty text="Nenhuma preventiva, calibração, TSE ou qualificação no seu setor." />
              </td>
            </tr>
          )}
        </tbody>
      </DataTable>
    </div>
  );
}
