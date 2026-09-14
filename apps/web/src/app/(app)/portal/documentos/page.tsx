"use client";

import { useEffect, useState } from "react";
import { api, downloadApi } from "@/lib/api";
import { Badge, Btn, DataTable, Empty, Err, PageHeader, td, th } from "@/components/ui/aion-ui";

interface Doc {
  id: string;
  numero: string;
  tipo: string;
  dataExecucao: string;
  resultado?: string | null;
  equipamento: { tag: string; nome: string; setor: string };
}

export default function PortalDocumentosPage() {
  const [items, setItems] = useState<Doc[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api<Doc[]>("/portal/relatorios-servico")
      .then(setItems)
      .catch((e) => setErro(e instanceof Error ? e.message : "Erro"));
  }, []);

  return (
    <div>
      <PageHeader
        title="Relatórios de serviço"
        subtitle="Só documentos finais autorizados para o seu setor. Não são certificados de calibração."
      />
      {erro && <Err>{erro}</Err>}
      <DataTable>
        <thead>
          <tr>
            <th style={th}>Nº</th>
            <th style={th}>Tipo</th>
            <th style={th}>TAG</th>
            <th style={th}>Equipamento</th>
            <th style={th}>Data</th>
            <th style={th} />
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={6} style={td}>
                <Empty text="Nenhum relatório autorizado." />
              </td>
            </tr>
          ) : (
            items.map((d) => (
              <tr key={d.id}>
                <td style={td}>{d.numero}</td>
                <td style={td}>
                  <Badge tone="info">{d.tipo}</Badge>
                </td>
                <td style={td}>{d.equipamento.tag}</td>
                <td style={td}>{d.equipamento.nome}</td>
                <td style={td}>{d.dataExecucao?.slice(0, 10)}</td>
                <td style={td}>
                  <Btn
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void downloadApi(
                        `/portal/relatorios-servico/${d.id}/pdf`,
                        undefined,
                        `relatorio-servico-${d.numero}.pdf`,
                      )
                    }
                  >
                    PDF
                  </Btn>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </DataTable>
    </div>
  );
}
