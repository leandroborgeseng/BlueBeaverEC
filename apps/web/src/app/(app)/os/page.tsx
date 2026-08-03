"use client";

import { useCallback, useEffect, useState } from "react";
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

interface OsListResponse {
  items: OsRow[];
  total: number;
  page: number;
  pageSize: number;
}

export default function OsPage() {
  const [items, setItems] = useState<OsRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [erro, setErro] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [qStatus, setQStatus] = useState("Todas");
  const [qPrio, setQPrio] = useState("Todas");
  const [apenasAtrasadas, setApenasAtrasadas] = useState(false);
  const open = useWindowStore((s) => s.open);

  const load = useCallback(async (pageOverride?: number) => {
    const currentPage = pageOverride ?? page;
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (qPrio !== "Todas") params.set("prioridade", qPrio);
    if (qStatus === "ATRASADA" || apenasAtrasadas) params.set("atrasada", "1");
    else if (qStatus !== "Todas") params.set("situacao", qStatus);
    params.set("page", String(currentPage));
    params.set("pageSize", String(pageSize));

    try {
      const data = await api<OsListResponse>(`/os?${params.toString()}`);
      setItems(data.items);
      setTotal(data.total);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    }
  }, [q, qStatus, qPrio, apenasAtrasadas, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  function aplicarFiltros() {
    setPage(1);
    void load(1);
  }

  const abertas = items.filter((o) => o.status !== "CONCLUIDA" && o.status !== "CANCELADA").length;
  const atrasadas = items.filter((o) => o.atrasada).length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <PageHeader
        title="Ordens de Serviço"
        subtitle={
          <span>
            <strong>{total}</strong> registro(s) · <strong>{abertas}</strong> abertas nesta página ·{" "}
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
        <div style={{ gridColumn: "span 2" }}>
          <FieldLabel>Busca (nº OS ou equipamento)</FieldLabel>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && aplicarFiltros()}
            placeholder="Ex: 20260272, EQ-0198, Monitor…"
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
        <div>
          <FieldLabel>&nbsp;</FieldLabel>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, height: 36 }}>
            <input
              type="checkbox"
              checked={apenasAtrasadas}
              onChange={(e) => setApenasAtrasadas(e.target.checked)}
            />
            Só atrasadas
          </label>
        </div>
        <div>
          <FieldLabel>&nbsp;</FieldLabel>
          <Btn onClick={aplicarFiltros} style={{ width: "100%" }}>
            Filtrar
          </Btn>
        </div>
      </FilterBar>

      <div style={{ fontSize: 13, fontWeight: 600, color: "oklch(0.5 0.02 250)", margin: "0 0 10px" }}>
        {total} resultado(s) · página {page} de {totalPages}
      </div>

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
          {items.map((os) => (
            <tr
              key={os.id}
              onClick={() =>
                open({
                  kind: "os",
                  title: `${os.codigo} — ${os.equipamento.nome} · ${os.equipamento.tag}`,
                  payload: { numero: os.numero, codigo: os.codigo },
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
          {items.length === 0 && (
            <tr>
              <td colSpan={5}>
                <Empty />
              </td>
            </tr>
          )}
        </tbody>
      </DataTable>

      {totalPages > 1 && (
        <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
          <Btn variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Anterior
          </Btn>
          <span style={{ fontSize: 13, color: "oklch(0.5 0.02 250)" }}>
            Página {page} / {totalPages}
          </span>
          <Btn variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Próxima
          </Btn>
        </div>
      )}

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
