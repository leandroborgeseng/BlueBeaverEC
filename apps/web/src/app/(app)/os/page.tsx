"use client";

import { useEffect, useMemo, useState } from "react";
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
  PriorityBar,
  ResultCount,
  fieldStyle,
  td,
  th,
} from "@/components/ui/nexo-ui";

interface OsRow {
  id: string;
  numero: number;
  codigo: string;
  status: string;
  prioridade: string;
  atrasada: boolean;
  tipo?: string;
  equipamento: { tag: string; nome: string };
  responsavel?: { nome: string } | null;
}

export default function OsPage() {
  const [items, setItems] = useState<OsRow[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [qNumero, setQNumero] = useState("");
  const [qEquip, setQEquip] = useState("");
  const [qStatus, setQStatus] = useState("Todas");
  const [qPrio, setQPrio] = useState("Todas");
  const open = useWindowStore((s) => s.open);

  useEffect(() => {
    api<{ items: OsRow[] }>("/os")
      .then((d) => setItems(d.items))
      .catch((e) => setErro(e.message));
  }, []);

  const filtered = useMemo(() => {
    return items.filter((os) => {
      if (qNumero && !String(os.numero).includes(qNumero) && !os.codigo.includes(qNumero)) return false;
      if (
        qEquip &&
        !os.equipamento.tag.toLowerCase().includes(qEquip.toLowerCase()) &&
        !os.equipamento.nome.toLowerCase().includes(qEquip.toLowerCase())
      )
        return false;
      if (qStatus !== "Todas" && os.status !== qStatus && !(qStatus === "ATRASADA" && os.atrasada))
        return false;
      if (qPrio !== "Todas" && os.prioridade !== qPrio) return false;
      return true;
    });
  }, [items, qNumero, qEquip, qStatus, qPrio]);

  const abertas = items.filter((o) => o.status !== "CONCLUIDA" && o.status !== "CANCELADA").length;
  const atrasadas = items.filter((o) => o.atrasada).length;

  return (
    <div>
      <PageHeader
        title="Ordens de Serviço"
        subtitle={
          <span>
            <strong>{abertas}</strong> abertas ·{" "}
            <span style={{ color: atrasadas ? "oklch(0.5 0.17 25)" : undefined, fontWeight: 700 }}>
              {atrasadas} atrasadas
            </span>
          </span>
        }
        actions={
          <>
            <Btn href="/os/rapida" variant="secondary">
              + OS Rápida
            </Btn>
            <Btn href="/os/nova" variant="primary">
              + Abrir Ordem de Serviço
            </Btn>
          </>
        }
      />

      {erro && <Err>{erro}</Err>}

      <FilterBar>
        <div>
          <FieldLabel>Nº OS</FieldLabel>
          <input
            value={qNumero}
            onChange={(e) => setQNumero(e.target.value)}
            placeholder="Ex: 20260272"
            style={fieldStyle}
          />
        </div>
        <div style={{ gridColumn: "span 2" }}>
          <FieldLabel>Equipamento</FieldLabel>
          <input
            value={qEquip}
            onChange={(e) => setQEquip(e.target.value)}
            placeholder="Buscar equipamento…"
            style={fieldStyle}
          />
        </div>
        <div>
          <FieldLabel>Prioridade</FieldLabel>
          <select value={qPrio} onChange={(e) => setQPrio(e.target.value)} style={fieldStyle}>
            <option>Todas</option>
            <option value="URGENTE">URGENTE</option>
            <option value="ALTA">ALTA</option>
            <option value="MEDIA">MEDIA</option>
            <option value="BAIXA">BAIXA</option>
          </select>
        </div>
        <div>
          <FieldLabel>Situação</FieldLabel>
          <select value={qStatus} onChange={(e) => setQStatus(e.target.value)} style={fieldStyle}>
            <option>Todas</option>
            <option value="ABERTA">ABERTA</option>
            <option value="EM_ANDAMENTO">EM ANDAMENTO</option>
            <option value="AGUARDANDO_PECA">AGUARDANDO PEÇA</option>
            <option value="ATRASADA">ATRASADA</option>
            <option value="CONCLUIDA">CONCLUÍDA</option>
          </select>
        </div>
      </FilterBar>

      <ResultCount n={filtered.length} />

      <DataTable>
        <thead>
          <tr>
            <th style={th}>OS</th>
            <th style={th}>Equipamento</th>
            <th style={th}>Prioridade</th>
            <th style={th}>Situação</th>
            <th style={th}>Responsável</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((os) => (
            <tr
              key={os.id}
              onClick={() =>
                open({
                  kind: "os",
                  title: `${os.codigo} — ${os.equipamento.nome} · ${os.equipamento.tag}`,
                  payload: os as unknown as Record<string, unknown>,
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
                <PriorityBar prioridade={os.prioridade} />
                <strong>{os.codigo}</strong>
              </td>
              <td style={td}>
                <div style={{ fontWeight: 600 }}>{os.equipamento.nome}</div>
                <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)" }}>{os.equipamento.tag}</div>
              </td>
              <td style={td}>
                <Badge tone={os.prioridade}>{os.prioridade}</Badge>
              </td>
              <td style={td}>
                <Badge tone={os.atrasada ? "ATRASADA" : os.status}>
                  {os.atrasada ? "Atrasada" : os.status.replace(/_/g, " ")}
                </Badge>
              </td>
              <td style={td}>{os.responsavel?.nome ?? "—"}</td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={5}>
                <Empty />
              </td>
            </tr>
          )}
        </tbody>
      </DataTable>

      <div
        style={{
          display: "flex",
          gap: 18,
          marginTop: 12,
          fontSize: 12,
          color: "oklch(0.5 0.02 250)",
        }}
      >
        <span>
          <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "oklch(0.55 0.18 25)", marginRight: 6 }} />
          Alta — atendimento imediato
        </span>
        <span>
          <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "oklch(0.75 0.14 85)", marginRight: 6 }} />
          Média — atendimento padrão
        </span>
        <span>
          <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "oklch(0.75 0.01 250)", marginRight: 6 }} />
          Baixa — sem urgência
        </span>
      </div>
    </div>
  );
}
