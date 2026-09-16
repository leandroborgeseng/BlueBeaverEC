"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useCan } from "@/lib/session";
import { PERMISSAO_NIVEL } from "@aion/shared";
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

interface Inst {
  id: string;
  nome: string;
  nSerie: string;
  fabricante?: string | null;
  modelo?: string | null;
  tipoAnalisador?: string | null;
}

interface Pref {
  tipo: string;
  instrumentoId: string;
  instrumento: { id: string; nome: string; nSerie: string };
}

interface Payload {
  tipos: string[];
  instrumentos: Inst[];
  preferenciais: Pref[];
}

function labelInst(i: { nome: string; nSerie: string; fabricante?: string | null; modelo?: string | null }) {
  const bits = [i.nome];
  if (i.modelo) bits.push(i.modelo);
  bits.push(`S/N ${i.nSerie}`);
  return bits.join(" · ");
}

export default function PadroesPreferenciaisPage() {
  const podeEditar = useCan("laudos", PERMISSAO_NIVEL.EDICAO);
  const [tipos, setTipos] = useState<string[]>([]);
  const [instrumentos, setInstrumentos] = useState<Inst[]>([]);
  const [escolha, setEscolha] = useState<Record<string, string>>({});
  const [novoTipo, setNovoTipo] = useState("");
  const [q, setQ] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const data = await api<Payload>("/instrumentos-padroes/preferenciais");
    setTipos(data.tipos);
    setInstrumentos(data.instrumentos);
    const next: Record<string, string> = {};
    for (const t of data.tipos) next[t] = "";
    for (const p of data.preferenciais) next[p.tipo] = p.instrumentoId;
    setEscolha(next);
  }

  useEffect(() => {
    void load().catch((e) => setErro(e instanceof Error ? e.message : "Erro"));
  }, []);

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return tipos;
    return tipos.filter((tipo) => {
      if (tipo.toLowerCase().includes(t)) return true;
      const inst = instrumentos.find((i) => i.id === escolha[tipo]);
      return inst ? labelInst(inst).toLowerCase().includes(t) : false;
    });
  }, [tipos, q, escolha, instrumentos]);

  function addTipo() {
    const tipo = novoTipo.trim();
    if (!tipo) return;
    if (!tipos.includes(tipo)) setTipos((prev) => [...prev, tipo].sort((a, b) => a.localeCompare(b, "pt-BR")));
    setEscolha((prev) => ({ ...prev, [tipo]: prev[tipo] ?? "" }));
    setNovoTipo("");
  }

  async function salvar() {
    setBusy(true);
    setErro(null);
    setMsg(null);
    try {
      const data = await api<Payload>("/instrumentos-padroes/preferenciais", {
        method: "PUT",
        body: JSON.stringify({
          itens: tipos.map((tipo) => ({ tipo, instrumentoId: escolha[tipo] || "" })),
        }),
      });
      setTipos(data.tipos);
      setInstrumentos(data.instrumentos);
      const next: Record<string, string> = {};
      for (const t of data.tipos) next[t] = "";
      for (const p of data.preferenciais) next[p.tipo] = p.instrumentoId;
      setEscolha(next);
      setMsg("Preferências gravadas");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <WinScreen
      title="Padrões Preferenciais"
      error={erro}
      toolbar={
        <>
          {podeEditar && (
            <ToolBtn disabled={busy} onClick={() => void salvar()}>
              {busy ? "Salvando…" : "Salvar"}
            </ToolBtn>
          )}
          {msg && <span style={{ fontSize: 12, color: "#2a7a2a", marginLeft: 8 }}>{msg}</span>}
        </>
      }
      filters={
        <>
          <FRow>
            <FItem label="Filtrar:" grow>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Tipo ou padrão"
                style={{ ...winFld, flex: 1 }}
              />
            </FItem>
          </FRow>
          {podeEditar && (
            <FRow>
              <FItem label="Novo tipo:" grow>
                <input
                  value={novoTipo}
                  onChange={(e) => setNovoTipo(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addTipo()}
                  placeholder="Ex.: ANALISADOR DE BISTURI"
                  style={{ ...winFld, flex: 1 }}
                />
              </FItem>
              <ToolBtn onClick={addTipo}>Adicionar</ToolBtn>
            </FRow>
          )}
        </>
      }
      footer={<span style={{ marginLeft: "auto" }}>{filtrados.length} tipo(s)</span>}
    >
      <ZebraTable
        columns={[
          { key: "tipo", label: "Tipo de analisador", width: "42%" },
          { key: "padrao", label: "Padrão preferencial" },
        ]}
      >
        {filtrados.map((tipo, i) => (
          <tr key={tipo} style={zebraRow(i, false, { cursor: "default" })}>
            <td style={td}>{tipo}</td>
            <td style={{ ...td, whiteSpace: "normal" }}>
              <select
                value={escolha[tipo] ?? ""}
                disabled={!podeEditar}
                onChange={(e) => setEscolha((prev) => ({ ...prev, [tipo]: e.target.value }))}
                style={{ ...winFld, width: "100%", maxWidth: 520 }}
              >
                <option value="">&lt;Nenhum&gt;</option>
                {instrumentos.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {labelInst(inst)}
                  </option>
                ))}
              </select>
            </td>
          </tr>
        ))}
      </ZebraTable>
      {tipos.length === 0 && !erro && (
        <div style={{ padding: 24, color: "#777", fontSize: 13 }}>
          Nenhum tipo cadastrado. Preencha o tipo de analisador na ficha do padrão ou adicione um tipo acima.
        </div>
      )}
    </WinScreen>
  );
}
