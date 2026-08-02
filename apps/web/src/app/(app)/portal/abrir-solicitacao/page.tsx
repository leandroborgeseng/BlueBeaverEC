"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Setor {
  id: string;
  nome: string;
}

interface Solicitacao {
  id: string;
  protocolo: string;
  status: string;
  descricao: string;
  justificativaRecusa?: string | null;
  ordemServico?: { codigo: string } | null;
}

export default function AbrirSolicitacaoPage() {
  const [setores, setSetores] = useState<Setor[]>([]);
  const [minhas, setMinhas] = useState<Solicitacao[]>([]);
  const [ok, setOk] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function reload() {
    const [s, list] = await Promise.all([
      api<Setor[]>("/setores"),
      api<Solicitacao[]>("/solicitacoes"),
    ]);
    setSetores(s);
    setMinhas(list.slice(0, 8));
  }

  useEffect(() => {
    void reload().catch((e) => setErro(e.message));
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    setOk(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await api<{ protocolo: string }>("/solicitacoes", {
        method: "POST",
        body: JSON.stringify({
          descricao: String(fd.get("descricao")),
          setorNome: String(fd.get("setorNome")),
          urgencia: String(fd.get("urgencia")),
          equipamentoTag: String(fd.get("equipamentoTag") || "") || undefined,
          ramal: String(fd.get("ramal") || "") || undefined,
        }),
      });
      setOk(`Solicitação ${res.protocolo} registrada`);
      e.currentTarget.reset();
      await reload();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro");
    }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 800 }}>Abrir Solicitação</h1>
      <p style={{ margin: "0 0 16px", color: "var(--nexo-muted)", fontSize: 13 }}>
        Portal do solicitante
      </p>
      <form
        onSubmit={(e) => void onSubmit(e)}
        style={{
          background: "var(--nexo-surface)",
          border: "1px solid var(--nexo-border)",
          borderRadius: 12,
          padding: 18,
          display: "grid",
          gap: 12,
        }}
      >
        <select name="setorNome" required defaultValue="" style={input}>
          <option value="" disabled>
            Setor
          </option>
          {setores.map((s) => (
            <option key={s.id} value={s.nome}>
              {s.nome}
            </option>
          ))}
        </select>
        <input name="equipamentoTag" placeholder="TAG do equipamento (opcional)" style={input} />
        <textarea name="descricao" placeholder="Descrição do problema" rows={4} style={input} required />
        <select name="urgencia" defaultValue="MEDIA" style={input}>
          <option value="BAIXA">Urgência: Baixa</option>
          <option value="MEDIA">Urgência: Média</option>
          <option value="ALTA">Urgência: Alta</option>
          <option value="PARADA_CRITICA">Parada de Equipamento Crítico</option>
        </select>
        <input name="ramal" placeholder="Ramal" style={input} />
        <button type="submit" style={btn}>
          Enviar solicitação
        </button>
        {ok && <div style={{ color: "var(--nexo-success)", fontSize: 13 }}>{ok}</div>}
        {erro && <div style={{ color: "var(--nexo-danger)", fontSize: 13 }}>{erro}</div>}
      </form>

      <h2 style={{ marginTop: 28, fontSize: 16 }}>Recentes</h2>
      <div style={{ display: "grid", gap: 8 }}>
        {minhas.map((s) => (
          <div
            key={s.id}
            style={{
              background: "var(--nexo-surface)",
              border: "1px solid var(--nexo-border)",
              borderRadius: 10,
              padding: 12,
              fontSize: 13,
            }}
          >
            <strong>{s.protocolo}</strong> · {s.status}
            {s.ordemServico ? ` · ${s.ordemServico.codigo}` : ""}
            <div style={{ color: "var(--nexo-muted)", marginTop: 4 }}>{s.descricao}</div>
            {s.justificativaRecusa && (
              <div style={{ color: "var(--nexo-danger)", marginTop: 4 }}>
                Motivo: {s.justificativaRecusa}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const input: React.CSSProperties = {
  border: "1px solid var(--nexo-border)",
  borderRadius: 10,
  padding: "10px 12px",
  width: "100%",
};
const btn: React.CSSProperties = {
  border: "none",
  borderRadius: 10,
  padding: "11px 14px",
  background: "var(--nexo-primary)",
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
};
