"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import {
  FItem,
  FRow,
  ToolBtn,
  WinScreen,
  ZebraTable,
  td,
  winFld,
  zebraRow,
} from "@/components/equipamentos/eq-win-ui";

interface Lookup {
  id: string;
  nome: string;
}

interface Linha {
  descricaoId: string;
  descricao: string;
  fabricanteId: string;
  fabricante: string;
  modeloId: string;
  modelo: string;
  custo: number | null;
  data: string | null;
  quantidade: number;
}

function fmtMoney(v: number | null) {
  if (v == null || Number.isNaN(v)) return "";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseMoney(v: string) {
  const n = Number(v.replace(/\./g, "").replace(",", ".").trim());
  return Number.isFinite(n) ? n : null;
}

function fmtDate(v?: string | null) {
  if (!v) return "";
  const [y, m, d] = v.split("-");
  if (!d) return v;
  return `${d}/${m}/${y}`;
}

export default function CustoSubstituicaoPage() {
  const verValores = Boolean(useSession()?.permissoes?.verValoresFinanceiros);
  const [items, setItems] = useState<Linha[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [fabricantes, setFabricantes] = useState<Lookup[]>([]);
  const [q, setQ] = useState("");
  const [fabricanteId, setFabricanteId] = useState("");
  const [apenasAtivos, setApenasAtivos] = useState(true);
  const [applied, setApplied] = useState({ q: "", fabricanteId: "", apenasAtivos: true });
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Lookup[]>("/fabricantes")
      .then(setFabricantes)
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (applied.q.trim()) params.set("q", applied.q.trim());
    if (applied.fabricanteId) params.set("fabricante", applied.fabricanteId);
    if (!applied.apenasAtivos) params.set("apenasAtivos", "0");
    const data = await api<{ items: Linha[] }>(`/equipamentos/custos-substituicao?${params.toString()}`);
    setItems(data.items);
    const next: Record<string, string> = {};
    for (const l of data.items) {
      const key = `${l.descricaoId}|${l.fabricanteId}|${l.modeloId}`;
      next[key] = l.custo != null ? fmtMoney(l.custo) : "";
    }
    setDraft(next);
  }, [applied]);

  useEffect(() => {
    if (!verValores) return;
    void load().catch((e) => setErro(e instanceof Error ? e.message : "Erro"));
  }, [load, verValores]);

  function keyOf(l: Linha) {
    return `${l.descricaoId}|${l.fabricanteId}|${l.modeloId}`;
  }

  async function salvar() {
    setBusy(true);
    setErro(null);
    setMsg(null);
    try {
      let n = 0;
      for (const l of items) {
        const key = keyOf(l);
        const novo = parseMoney(draft[key] ?? "");
        const antigo = l.custo;
        if (novo === antigo || (novo == null && antigo == null)) continue;
        await api("/equipamentos/custos-substituicao", {
          method: "PATCH",
          body: JSON.stringify({
            descricaoId: l.descricaoId,
            fabricanteId: l.fabricanteId,
            modeloId: l.modeloId,
            valorSubstituicao: novo,
          }),
        });
        n += 1;
      }
      setMsg(n ? `${n} grupo(s) atualizado(s)` : "Nada para salvar");
      await load();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  }

  if (!verValores) {
    return (
      <WinScreen title="Custo de Substituição" error="Sem permissão para ver valores financeiros.">
        <div />
      </WinScreen>
    );
  }

  return (
    <WinScreen
      title="Custo de Substituição"
      error={erro}
      toolbar={
        <>
          <ToolBtn disabled={busy} onClick={() => void salvar()}>
            {busy ? "Salvando…" : "Salvar"}
          </ToolBtn>
          <ToolBtn onClick={() => void load().catch((e) => setErro(e instanceof Error ? e.message : "Erro"))}>
            Atualizar
          </ToolBtn>
          {msg && <span style={{ fontSize: 12, color: "#2a7a2a", marginLeft: 8 }}>{msg}</span>}
        </>
      }
      filters={
        <>
          <FRow>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <input type="checkbox" checked={apenasAtivos} onChange={(e) => setApenasAtivos(e.target.checked)} />
              Apenas equipamentos ativos
            </label>
          </FRow>
          <FRow>
            <FItem label="Equipamento:" grow>
              <input value={q} onChange={(e) => setQ(e.target.value)} style={{ ...winFld, flex: 1 }} />
            </FItem>
            <FItem label="Fabricante:" labelWidth={80} grow>
              <select value={fabricanteId} onChange={(e) => setFabricanteId(e.target.value)} style={{ ...winFld, flex: 1 }}>
                <option value="">&lt;Nenhum&gt;</option>
                {fabricantes.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </select>
            </FItem>
            <button
              type="button"
              onClick={() => setApplied({ q, fabricanteId, apenasAtivos })}
              style={btn}
            >
              Procurar
            </button>
          </FRow>
        </>
      }
      footer={<span style={{ marginLeft: "auto" }}>{items.length} registros</span>}
    >
      <ZebraTable
        columns={[
          { key: "desc", label: "Descrição" },
          { key: "fab", label: "Fabricante" },
          { key: "mod", label: "Modelo" },
          { key: "qtd", label: "Qtd", width: 60 },
          { key: "custo", label: "Custo", width: 130 },
          { key: "data", label: "Data", width: 100 },
        ]}
      >
        {items.map((l, i) => {
          const key = keyOf(l);
          return (
            <tr key={key} style={zebraRow(i, false, { cursor: "default" })}>
              <td style={td}>{l.descricao}</td>
              <td style={td}>{l.fabricante}</td>
              <td style={td}>{l.modelo}</td>
              <td style={td}>{l.quantidade}</td>
              <td style={td}>
                <input
                  value={draft[key] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                  style={{ ...winFld, width: 110, textAlign: "right" }}
                />
              </td>
              <td style={td}>{fmtDate(l.data)}</td>
            </tr>
          );
        })}
      </ZebraTable>
      {items.length === 0 && (
        <div style={{ padding: 24, textAlign: "center", color: "#777", fontSize: 13 }}>Nenhum registro.</div>
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
