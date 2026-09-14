"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { labelStatusOS } from "@/lib/os-ui";
import {
  Badge,
  DataTable,
  Empty,
  Err,
  FieldLabel,
  PageHeader,
  fieldStyle,
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
  protocolo?: string;
  responsavelNome?: string | null;
  textoConclusaoPublico?: string | null;
  equipamento: { tag: string; nome: string; setor: string };
}

export default function PortalOsAbertasPage() {
  const [items, setItems] = useState<OsAberta[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    api<OsAberta[]>("/portal/minhas-os")
      .then(setItems)
      .catch((e) => setErro(e instanceof Error ? e.message : "Erro"))
      .finally(() => setLoading(false));
  }, []);

  const termo = busca.trim().toLowerCase();
  const filtrados = termo
    ? items.filter((row) =>
        [row.codigo, row.protocolo, row.responsavelNome, row.equipamento?.nome, row.equipamento?.tag]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(termo)),
      )
    : items;

  return (
    <div>
      <PageHeader
        title="Minhas solicitações"
        subtitle="Acompanhe o responsável, o andamento e o resultado dos seus pedidos"
      />

      {erro && <Err>{erro}</Err>}

      <div style={{ maxWidth: 360, marginBottom: 14 }}>
        <FieldLabel>Buscar acompanhamento</FieldLabel>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Protocolo, OS, aparelho ou responsável"
          style={fieldStyle}
        />
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, color: "oklch(0.5 0.02 250)", margin: "0 0 10px" }}>
        {loading ? "Carregando…" : `${filtrados.length} pedido(s)`}
      </div>

      <DataTable>
        <thead>
          <tr>
            <th style={th}>Protocolo / OS</th>
            <th style={th}>Equipamento</th>
            <th style={th}>Setor</th>
            <th style={th}>Responsável</th>
            <th style={th}>Andamento</th>
            <th style={th}>Abertura</th>
          </tr>
        </thead>
        <tbody>
          {filtrados.map((row) => (
            <tr key={row.id}>
              <td style={td}>
                <Link href={`/portal/os/${row.numero}`} style={{ fontWeight: 700 }}>
                  {row.codigo}
                </Link>
                {row.protocolo && (
                  <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)" }}>{row.protocolo}</div>
                )}
              </td>
              <td style={td}>
                <div style={{ fontWeight: 600 }}>{row.equipamento.nome}</div>
                <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)" }}>{row.equipamento.tag}</div>
              </td>
              <td style={td}>{row.equipamento.setor}</td>
              <td style={td}>{row.responsavelNome ?? "Aguardando atribuição"}</td>
              <td style={td}>
                <Badge tone={row.status}>{labelStatusOS(row.status)}</Badge>
                {row.textoConclusaoPublico && (
                  <div style={{ fontSize: 12, marginTop: 4, color: "oklch(0.4 0.02 250)" }}>
                    {row.textoConclusaoPublico.slice(0, 80)}
                  </div>
                )}
              </td>
              <td style={td}>{new Date(row.abertura).toLocaleDateString("pt-BR")}</td>
            </tr>
          ))}
          {!loading && filtrados.length === 0 && (
            <tr>
              <td colSpan={6}>
                <Empty text="Você ainda não abriu nenhum chamado." />
              </td>
            </tr>
          )}
        </tbody>
      </DataTable>
    </div>
  );
}
