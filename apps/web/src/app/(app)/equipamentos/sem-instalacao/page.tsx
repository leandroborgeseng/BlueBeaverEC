"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useWindowStore } from "@/store/windows";
import {
  FItem,
  FRow,
  ToolBtn,
  WinScreen,
  ZebraTable,
  padCount,
  td,
  winFld,
  zebraRow,
} from "@/components/equipamentos/eq-win-ui";

interface Lookup {
  id: string;
  nome: string;
}

interface EquipRow {
  id: string;
  tag: string;
  nome: string;
  dataInstalacao?: string | null;
  patrimonio?: string | null;
  nSerie?: string | null;
  setor: { nome: string };
  modelo: { nome: string };
}

interface ListRes {
  items: EquipRow[];
  total: number;
}

export default function SemInstalacaoPage() {
  const [items, setItems] = useState<EquipRow[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [setorId, setSetorId] = useState("");
  const [applied, setApplied] = useState({ q: "", setorId: "" });
  const [setores, setSetores] = useState<Lookup[]>([]);
  const [datas, setDatas] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const openWin = useWindowStore((s) => s.open);

  useEffect(() => {
    api<Lookup[]>("/setores")
      .then(setSetores)
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("semInstalacao", "1");
    params.set("inativos", "0");
    params.set("pageSize", "100");
    if (applied.q.trim()) params.set("q", applied.q.trim());
    if (applied.setorId) params.set("setor", applied.setorId);
    const data = await api<ListRes>(`/equipamentos?${params.toString()}`);
    setItems(data.items);
    setTotal(data.total);
    const next: Record<string, string> = {};
    for (const eq of data.items) {
      next[eq.tag] = eq.dataInstalacao ? String(eq.dataInstalacao).slice(0, 10) : "";
    }
    setDatas(next);
  }, [applied]);

  useEffect(() => {
    void load().catch((e) => setErro(e instanceof Error ? e.message : "Erro"));
  }, [load]);

  async function salvar() {
    setBusy(true);
    setErro(null);
    setMsg(null);
    try {
      const alterados = Object.entries(datas).filter(([, v]) => v.trim());
      for (const [tag, dataInstalacao] of alterados) {
        await api(`/equipamentos/${encodeURIComponent(tag)}`, {
          method: "PATCH",
          body: JSON.stringify({ dataInstalacao }),
        });
      }
      setMsg(alterados.length ? `${alterados.length} data(s) gravada(s)` : "Informe a data de instalação nas linhas");
      await load();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <WinScreen
      title="Equipamentos Sem Data de Instalação"
      error={erro}
      toolbar={
        <>
          <ToolBtn disabled={busy} onClick={() => void salvar()}>
            {busy ? "Salvando…" : "Salvar"}
          </ToolBtn>
          {msg && <span style={{ fontSize: 12, color: "#2a7a2a", marginLeft: 8 }}>{msg}</span>}
        </>
      }
      filters={
        <>
          <FRow>
            <FItem label="Equipamento:" grow>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && setApplied({ q, setorId })}
                style={{ ...winFld, flex: 1 }}
              />
            </FItem>
            <FItem label="Setor:" labelWidth={50} grow>
              <select value={setorId} onChange={(e) => setSetorId(e.target.value)} style={{ ...winFld, flex: 1 }}>
                <option value="" />
                {setores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </FItem>
            <button type="button" onClick={() => setApplied({ q, setorId })} style={btn}>
              Procurar
            </button>
          </FRow>
        </>
      }
      footer={<span style={{ marginLeft: "auto" }}>{padCount(total)} registros</span>}
    >
      <ZebraTable
        columns={[
          { key: "tag", label: "TAG", width: 120 },
          { key: "nome", label: "Equipamento" },
          { key: "mod", label: "Modelo" },
          { key: "setor", label: "Setor" },
          { key: "pat", label: "Patrimônio", width: 110 },
          { key: "serie", label: "Nº Série", width: 120 },
          { key: "data", label: "Data de Instalação", width: 160 },
        ]}
      >
        {items.map((eq, i) => (
          <tr
            key={eq.id}
            style={zebraRow(i, eq.id === selectedId)}
            onClick={() => setSelectedId(eq.id)}
            onDoubleClick={() => openWin({ kind: "equipamento", title: eq.tag, payload: { tag: eq.tag } })}
          >
            <td style={td}>
              <strong>{eq.tag}</strong>
            </td>
            <td style={td}>{eq.nome}</td>
            <td style={td}>{eq.modelo.nome}</td>
            <td style={td}>{eq.setor.nome}</td>
            <td style={td}>{eq.patrimonio ?? ""}</td>
            <td style={td}>{eq.nSerie ?? ""}</td>
            <td style={td}>
              <input
                type="date"
                value={datas[eq.tag] ?? ""}
                onChange={(e) => setDatas((d) => ({ ...d, [eq.tag]: e.target.value }))}
                style={{ ...winFld, width: 140, background: "#fff8dc" }}
                onClick={(e) => e.stopPropagation()}
              />
            </td>
          </tr>
        ))}
      </ZebraTable>
      {items.length === 0 && (
        <div style={{ padding: 24, textAlign: "center", color: "#777", fontSize: 13 }}>
          Nenhum equipamento sem data de instalação.
        </div>
      )}
    </WinScreen>
  );
}

const btn = {
  background: "#e8e8e8",
  border: "1px solid #888",
  padding: "4px 14px",
  fontSize: 12,
  cursor: "pointer" as const,
  height: 24,
};
