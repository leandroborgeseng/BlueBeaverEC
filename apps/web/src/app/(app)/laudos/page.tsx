"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
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
  fieldStyle,
  td,
  th,
} from "@/components/ui/aion-ui";

interface LaudoRow {
  id: string;
  tipo: string;
  resultado: string;
  dataExecucao: string;
  validade?: string | null;
  equipamento: { tag: string; nome: string };
  procedimento?: { nome: string; codigo?: string | null } | null;
  responsavelTecnico?: { nome: string } | null;
}

const TIPOS = ["", "RECEBIMENTO", "PREVENTIVA", "CALIBRACAO", "TSE", "QUALIFICACAO"] as const;
const RESULTADOS = [
  "",
  "PENDENTE_ASSINATURA",
  "APROVADO",
  "APROVADO_COM_RESSALVAS",
  "REPROVADO",
] as const;

export default function LaudosPage() {
  const open = useWindowStore((s) => s.open);
  const [items, setItems] = useState<LaudoRow[]>([]);
  const [tipo, setTipo] = useState("");
  const [resultado, setResultado] = useState("");
  const [tag, setTag] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [promoting, setPromoting] = useState<string | null>(null);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const t = sp.get("tag");
    const r = sp.get("resultado");
    if (t) setTag(t);
    if (r) setResultado(r);
  }, []);

  const load = useCallback(async () => {
    setBusy(true);
    setErro(null);
    try {
      const params = new URLSearchParams();
      if (tipo) params.set("tipo", tipo);
      if (resultado) params.set("resultado", resultado);
      if (tag.trim()) params.set("equipamentoTag", tag.trim());
      const data = await api<LaudoRow[]>(`/laudos?${params.toString()}`);
      setItems(data);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar laudos");
    } finally {
      setBusy(false);
    }
  }, [tipo, tag, resultado]);

  useEffect(() => {
    void load();
  }, [load]);

  async function promover(id: string) {
    setPromoting(id);
    setErro(null);
    try {
      await api(`/laudos/${id}/promover-assinatura`, {
        method: "POST",
        body: JSON.stringify({ resultado: "APROVADO" }),
      });
      await load();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao promover assinatura");
    } finally {
      setPromoting(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Laudos"
        subtitle="Histórico de recebimento, preventiva, calibração, TSE e qualificação"
        actions={
          <>
            <Btn href="/laudos/novo" variant="secondary">
              Formulário rápido
            </Btn>
            <Btn
              onClick={() =>
                open({ kind: "laudo", title: "Novo Laudo", payload: { tipo: tipo || "PREVENTIVA" } })
              }
            >
              + Novo laudo
            </Btn>
          </>
        }
      />

      {erro && <Err>{erro}</Err>}

      <FilterBar>
        <div>
          <FieldLabel>Tipo</FieldLabel>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={fieldStyle}>
            <option value="">Todos</option>
            {TIPOS.filter(Boolean).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel>Resultado</FieldLabel>
          <select value={resultado} onChange={(e) => setResultado(e.target.value)} style={fieldStyle}>
            <option value="">Todos</option>
            {RESULTADOS.filter(Boolean).map((r) => (
              <option key={r} value={r}>
                {r.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel>TAG</FieldLabel>
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="Filtrar por TAG"
            style={fieldStyle}
          />
        </div>
        <Btn type="button" variant="secondary" disabled={busy} onClick={() => void load()}>
          Atualizar
        </Btn>
      </FilterBar>

      <DataTable>
        <thead>
          <tr>
            <th style={th}>Data</th>
            <th style={th}>Tipo</th>
            <th style={th}>TAG</th>
            <th style={th}>Equipamento</th>
            <th style={th}>Procedimento</th>
            <th style={th}>Resultado</th>
            <th style={th}>RT</th>
            <th style={th} />
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={8} style={td}>
                <Empty text={busy ? "Carregando…" : "Nenhum laudo encontrado."} />
              </td>
            </tr>
          ) : (
            items.map((l) => (
              <tr key={l.id}>
                <td style={td}>{l.dataExecucao?.slice(0, 10) ?? "—"}</td>
                <td style={td}>
                  <Badge tone="info">{l.tipo}</Badge>
                </td>
                <td style={td}>
                  <Link href={`/equipamentos?q=${encodeURIComponent(l.equipamento.tag)}`}>
                    {l.equipamento.tag}
                  </Link>
                </td>
                <td style={td}>{l.equipamento.nome}</td>
                <td style={td}>{l.procedimento?.nome ?? "—"}</td>
                <td style={td}>
                  <Badge tone={l.resultado === "APROVADO" ? "success" : "warning"}>{l.resultado}</Badge>
                </td>
                <td style={td}>{l.responsavelTecnico?.nome ?? "—"}</td>
                <td style={td}>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <Btn
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        open({
                          kind: "laudo",
                          title: `Laudo · ${l.equipamento.tag}`,
                          payload: { id: l.id, tipo: l.tipo, equipamentoTag: l.equipamento.tag },
                        })
                      }
                    >
                      Abrir
                    </Btn>
                    {l.resultado === "PENDENTE_ASSINATURA" && (
                      <Btn
                        size="sm"
                        disabled={promoting === l.id}
                        onClick={() => void promover(l.id)}
                      >
                        {promoting === l.id ? "…" : "Promover assinatura"}
                      </Btn>
                    )}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </DataTable>
    </div>
  );
}
