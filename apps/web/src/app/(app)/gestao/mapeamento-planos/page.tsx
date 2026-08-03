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
  fieldStyle,
  td,
  th,
} from "@/components/ui/aion-ui";

interface EquipRow {
  id: string;
  tag: string;
  nome: string;
  planoMatchTipo?: string | null;
  planoMatchObs?: string | null;
  tipoEquipamentoPlano?: { id: string; nome: string } | null;
  setor: { nome: string };
}

interface EquipListResponse {
  items: EquipRow[];
  total: number;
}

interface TipoPlano {
  id: string;
  nome: string;
}

export default function MapeamentoPlanosPage() {
  const open = useWindowStore((s) => s.open);
  const [items, setItems] = useState<EquipRow[]>([]);
  const [total, setTotal] = useState(0);
  const [tipos, setTipos] = useState<TipoPlano[]>([]);
  const [match, setMatch] = useState("sem_correspondencia");
  const [erro, setErro] = useState<string | null>(null);
  const [busyTag, setBusyTag] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const all: EquipRow[] = [];
      let page = 1;
      let totalServer = 0;
      for (;;) {
        const data = await api<EquipListResponse>(`/equipamentos?page=${page}&pageSize=100`);
        totalServer = data.total;
        all.push(...data.items);
        if (all.length >= totalServer || data.items.length === 0) break;
        page += 1;
        if (page > 20) break;
      }
      const filtered = match
        ? all.filter((e) => (e.planoMatchTipo ?? "sem_correspondencia") === match)
        : all;
      setItems(filtered);
      setTotal(filtered.length);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    }
  }, [match]);

  useEffect(() => {
    void load();
    api<TipoPlano[]>("/planos/tipos-equipamento")
      .then(setTipos)
      .catch(() => setTipos([]));
  }, [load]);

  async function vincular(eq: EquipRow, tipoId: string) {
    setBusyTag(eq.tag);
    setErro(null);
    try {
      await api(`/equipamentos/${encodeURIComponent(eq.tag)}`, {
        method: "PATCH",
        body: JSON.stringify({ tipoEquipamentoPlanoId: tipoId || null }),
      });
      await load();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao vincular");
    } finally {
      setBusyTag(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Mapeamento de Planos"
        subtitle="Vincule o tipo de plano aos equipamentos sem correspondência — necessário para o ramp-up"
      />
      {erro && <Err>{erro}</Err>}
      <FilterBar>
        <div>
          <FieldLabel>Match</FieldLabel>
          <select value={match} onChange={(e) => setMatch(e.target.value)} style={fieldStyle}>
            <option value="sem_correspondencia">Sem correspondência</option>
            <option value="aproximado">Aproximado</option>
            <option value="exato">Exato</option>
            <option value="">Todos</option>
          </select>
        </div>
        <Btn type="button" variant="secondary" onClick={() => void load()}>
          Atualizar
        </Btn>
      </FilterBar>
      <div style={{ fontSize: 13, marginBottom: 10 }}>{total} equipamento(s)</div>
      <DataTable>
        <thead>
          <tr>
            <th style={th}>TAG</th>
            <th style={th}>Nome</th>
            <th style={th}>Setor</th>
            <th style={th}>Match</th>
            <th style={th}>Vincular plano</th>
            <th style={th}>Obs</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={6} style={td}>
                <Empty text="Nenhum equipamento neste filtro." />
              </td>
            </tr>
          ) : (
            items.map((eq) => (
              <tr key={eq.id}>
                <td style={td}>
                  <Btn
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      open({
                        kind: "equipamento",
                        title: `${eq.tag} — ${eq.nome}`,
                        payload: { tag: eq.tag },
                      })
                    }
                  >
                    <strong>{eq.tag}</strong>
                  </Btn>
                </td>
                <td style={td}>{eq.nome}</td>
                <td style={td}>{eq.setor.nome}</td>
                <td style={td}>
                  <Badge tone={eq.planoMatchTipo ?? "warning"}>{eq.planoMatchTipo ?? "—"}</Badge>
                </td>
                <td style={td} onClick={(e) => e.stopPropagation()}>
                  <select
                    value={eq.tipoEquipamentoPlano?.id ?? ""}
                    disabled={busyTag === eq.tag}
                    onChange={(e) => void vincular(eq, e.target.value)}
                    style={{ ...fieldStyle, fontSize: 12, minWidth: 180 }}
                  >
                    <option value="">Sem vínculo</option>
                    {tipos.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nome}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={td}>{eq.planoMatchObs ?? "—"}</td>
              </tr>
            ))
          )}
        </tbody>
      </DataTable>
    </div>
  );
}
