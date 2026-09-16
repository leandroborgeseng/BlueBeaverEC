"use client";

import { type CSSProperties, type FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useCan, useSession } from "@/lib/session";
import { LABEL_MOVIMENTACAO, PERMISSAO_NIVEL, type TipoMovimentacaoEquipamento } from "@aion/shared";
import { useWindowStore } from "@/store/windows";
import { Overlay, WinForm, fld } from "@/components/os/os-win-ui";
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

interface MovRow {
  id: string;
  tipo: TipoMovimentacaoEquipamento;
  data: string;
  motivo: string;
  responsavelNome: string;
  origemLocalizacao?: string | null;
  destinoLocalizacao?: string | null;
  equipamento: { tag: string; nome: string };
  origemSetor?: { nome: string } | null;
  destinoSetor?: { nome: string } | null;
}

interface ListRes {
  items: MovRow[];
  total: number;
  page: number;
  pageSize: number;
}

const TIPOS = Object.keys(LABEL_MOVIMENTACAO) as TipoMovimentacaoEquipamento[];

function fmtDate(v?: string | null) {
  if (!v) return "";
  return new Date(v).toLocaleString("pt-BR");
}

export default function TransportePage() {
  const podeEditar = useCan("equipamentos", PERMISSAO_NIVEL.EDICAO);
  const me = useSession();
  const openWin = useWindowStore((s) => s.open);
  const [items, setItems] = useState<MovRow[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState("");
  const [setorId, setSetorId] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [applied, setApplied] = useState({ q: "", tipo: "", setorId: "", de: "", ate: "" });
  const [setores, setSetores] = useState<Lookup[]>([]);
  const [cols, setCols] = useState<Lookup[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void Promise.all([api<Lookup[]>("/setores"), api<Lookup[]>("/colaboradores")])
      .then(([s, c]) => {
        setSetores(s);
        setCols(c);
      })
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("pageSize", "100");
    if (applied.q.trim()) params.set("q", applied.q.trim());
    if (applied.tipo) params.set("tipo", applied.tipo);
    if (applied.setorId) params.set("setor", applied.setorId);
    if (applied.de) params.set("de", applied.de);
    if (applied.ate) params.set("ate", applied.ate);
    const data = await api<ListRes>(`/equipamentos/movimentacoes?${params.toString()}`);
    setItems(data.items);
    setTotal(data.total);
  }, [applied]);

  useEffect(() => {
    void load().catch((e) => setErro(e instanceof Error ? e.message : "Erro"));
  }, [load]);

  function procurar() {
    setApplied({ q, tipo, setorId, de, ate });
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErro(null);
    setMsg(null);
    const fd = new FormData(e.currentTarget as HTMLFormElement);
    const tag = String(fd.get("tag") || "").trim();
    try {
      await api(`/equipamentos/${encodeURIComponent(tag)}/movimentacoes`, {
        method: "POST",
        body: JSON.stringify({
          tipo: String(fd.get("tipo")),
          destinoSetorId: String(fd.get("destinoSetorId") || "") || undefined,
          destinoLocalizacao: String(fd.get("destinoLocalizacao") || "") || undefined,
          data: String(fd.get("data") || "") || undefined,
          responsavelId: String(fd.get("responsavelId") || "") || undefined,
          responsavelNome: String(fd.get("responsavelNome") || "") || me?.nome || undefined,
          motivo: String(fd.get("motivo")),
        }),
      });
      setMsg("Movimentação registrada");
      setNovo(false);
      await load();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao registrar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <WinScreen
      title="Transporte"
      error={erro}
      toolbar={
        <>
          {podeEditar && <ToolBtn onClick={() => setNovo(true)}>Novo</ToolBtn>}
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
                onKeyDown={(e) => e.key === "Enter" && procurar()}
                placeholder="TAG ou nome"
                style={{ ...winFld, flex: 1 }}
              />
            </FItem>
            <FItem label="Tipo:" labelWidth={48}>
              <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={{ ...winFld, width: 200 }}>
                <option value="">Todos</option>
                {TIPOS.map((k) => (
                  <option key={k} value={k}>
                    {LABEL_MOVIMENTACAO[k]}
                  </option>
                ))}
              </select>
            </FItem>
            <FItem label="Setor:" labelWidth={48}>
              <select value={setorId} onChange={(e) => setSetorId(e.target.value)} style={{ ...winFld, width: 200 }}>
                <option value="">Todos</option>
                {setores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </FItem>
          </FRow>
          <FRow>
            <FItem label="De:">
              <input type="date" value={de} onChange={(e) => setDe(e.target.value)} style={winFld} />
            </FItem>
            <FItem label="Até:" labelWidth={40}>
              <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} style={winFld} />
            </FItem>
            <button type="button" onClick={procurar} style={btn}>
              Procurar
            </button>
          </FRow>
        </>
      }
      footer={<span style={{ marginLeft: "auto" }}>{padCount(total)} registros</span>}
    >
      <ZebraTable
        columns={[
          { key: "data", label: "Data", width: 150 },
          { key: "tipo", label: "Tipo", width: 160 },
          { key: "tag", label: "TAG", width: 120 },
          { key: "nome", label: "Equipamento" },
          { key: "origem", label: "Origem" },
          { key: "destino", label: "Destino" },
          { key: "resp", label: "Responsável", width: 160 },
          { key: "motivo", label: "Motivo" },
        ]}
      >
        {items.map((m, i) => (
          <tr
            key={m.id}
            style={zebraRow(i, selectedId === m.id)}
            onClick={() => setSelectedId(m.id)}
            onDoubleClick={() =>
              openWin({ kind: "equipamento", title: m.equipamento.tag, payload: { tag: m.equipamento.tag } })
            }
          >
            <td style={td}>{fmtDate(m.data)}</td>
            <td style={td}>{LABEL_MOVIMENTACAO[m.tipo]}</td>
            <td style={td}>{m.equipamento.tag}</td>
            <td style={td}>{m.equipamento.nome}</td>
            <td style={td}>{m.origemSetor?.nome ?? m.origemLocalizacao ?? "—"}</td>
            <td style={td}>{m.destinoSetor?.nome ?? m.destinoLocalizacao ?? "—"}</td>
            <td style={td}>{m.responsavelNome}</td>
            <td style={td}>{m.motivo}</td>
          </tr>
        ))}
      </ZebraTable>
      {items.length === 0 && !erro && (
        <div style={{ padding: 24, color: "#777", fontSize: 13 }}>Nenhuma movimentação encontrada.</div>
      )}

      {novo && (
        <Overlay onClose={() => setNovo(false)} fixed>
          <WinForm
            title="Nova movimentação"
            onCancel={() => setNovo(false)}
            onSubmit={(e) => void onCreate(e)}
            busy={busy}
            showContinuar={false}
            submitLabel="Registrar"
            width="520px"
          >
            <label style={lab}>
              TAG
              <input name="tag" required style={fld} placeholder="HEF-CME-001" />
            </label>
            <label style={lab}>
              Tipo
              <select name="tipo" required style={fld}>
                {TIPOS.map((k) => (
                  <option key={k} value={k}>
                    {LABEL_MOVIMENTACAO[k]}
                  </option>
                ))}
              </select>
            </label>
            <label style={lab}>
              Data
              <input name="data" type="date" style={fld} />
            </label>
            <label style={lab}>
              Setor destino
              <select name="destinoSetorId" style={fld}>
                <option value="">—</option>
                {setores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </label>
            <label style={lab}>
              Localização destino
              <input name="destinoLocalizacao" style={fld} />
            </label>
            <label style={lab}>
              Responsável (lista)
              <select name="responsavelId" style={fld}>
                <option value="">—</option>
                {cols.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </label>
            <label style={lab}>
              Ou nome livre
              <input name="responsavelNome" defaultValue={me?.nome ?? ""} style={fld} />
            </label>
            <label style={lab}>
              Motivo
              <input name="motivo" required minLength={3} style={fld} />
            </label>
          </WinForm>
        </Overlay>
      )}
    </WinScreen>
  );
}

const lab: CSSProperties = { display: "grid", gap: 4, fontSize: 12, marginBottom: 8 };
const btn: CSSProperties = {
  height: 24,
  padding: "0 12px",
  fontSize: 12,
  border: "1px solid #aaa",
  background: "#f7f7f7",
  cursor: "pointer",
};
