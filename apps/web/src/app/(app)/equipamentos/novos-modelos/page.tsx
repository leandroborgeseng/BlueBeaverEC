"use client";

import { FormEvent, useState } from "react";
import { api } from "@/lib/api";
import { ToolBtn, WinScreen, td, winFld } from "@/components/equipamentos/eq-win-ui";

interface Named {
  id: string;
  nome: string;
}

interface Recente {
  descricao: string;
  fabricante: string;
  modelo: string;
}

export default function NovosModelosPage() {
  const [descricao, setDescricao] = useState("");
  const [fabricante, setFabricante] = useState("");
  const [modelo, setModelo] = useState("");
  const [recentes, setRecentes] = useState<Recente[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function findOrCreate(path: string, nome: string, extra?: Record<string, unknown>) {
    const list = await api<Named[]>(`${path}?q=${encodeURIComponent(nome)}`);
    const hit = list.find((x) => x.nome.trim().toLowerCase() === nome.trim().toLowerCase());
    if (hit) return hit;
    return api<Named>(path, { method: "POST", body: JSON.stringify({ nome: nome.trim(), ...extra }) });
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const desc = descricao.trim();
    const fab = fabricante.trim();
    const mod = modelo.trim();
    if (!desc || !fab || !mod) {
      setErro("Preencha descrição, fabricante e modelo");
      return;
    }
    setBusy(true);
    setErro(null);
    try {
      const plano = await findOrCreate("/planos-descricao", desc);
      const fabRow = await findOrCreate("/fabricantes", fab);
      await api("/modelos", {
        method: "POST",
        body: JSON.stringify({ fabricanteId: fabRow.id, nome: mod }),
      });
      setRecentes((r) => [{ descricao: plano.nome, fabricante: fabRow.nome, modelo: mod }, ...r].slice(0, 12));
      setModelo("");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <WinScreen
      title="Novos Modelos e Fabricantes"
      error={erro}
      toolbar={<ToolBtn onClick={() => void (document.getElementById("novos-modelos-form") as HTMLFormElement | null)?.requestSubmit()}>Salvar</ToolBtn>}
      filters={
        <form id="novos-modelos-form" onSubmit={(e) => void salvar(e)} style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 90, textAlign: "right", fontSize: 12 }}>Descrição:</span>
            <input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              style={{ ...winFld, flex: 1, background: "#fff8dc" }}
              placeholder="Tipo do equipamento (plano de descrição)"
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 90, textAlign: "right", fontSize: 12 }}>Modelo:</span>
            <input
              value={modelo}
              onChange={(e) => setModelo(e.target.value)}
              style={{ ...winFld, flex: 1, background: "#fff8dc" }}
            />
            <span style={{ width: 90, textAlign: "right", fontSize: 12 }}>Fabricante:</span>
            <input
              value={fabricante}
              onChange={(e) => setFabricante(e.target.value)}
              style={{ ...winFld, flex: 1, background: "#fff8dc" }}
            />
            <button type="submit" disabled={busy} style={btn}>
              {busy ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </form>
      }
    >
      <div style={{ padding: "12px 14px", fontSize: 13, color: "#1a5fb4", fontWeight: 700 }}>Últimos itens cadastrados:</div>
      {recentes.length === 0 ? (
        <div style={{ padding: "8px 14px", color: "#777", fontSize: 13 }}>Nenhum nesta sessão. Reaproveita fabricante/descrição se o nome já existir.</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <tbody>
            {recentes.map((r, i) => (
              <tr key={`${r.modelo}-${i}`}>
                <td style={td}>{r.descricao}</td>
                <td style={td}>{r.modelo}</td>
                <td style={td}>{r.fabricante}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
