"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

interface Colaborador {
  id: string;
  nome: string;
}

interface EstoqueItem {
  codigo: string;
  descricao: string;
}

export default function OsRapidaPage() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [cols, setCols] = useState<Colaborador[]>([]);
  const [pecas, setPecas] = useState<EstoqueItem[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      api<Colaborador[]>("/colaboradores"),
      api<EstoqueItem[]>("/estoque/itens"),
    ]).then(([c, e]) => {
      setCols(c);
      setPecas(e);
    });
  }, []);

  async function onTagBlur(tag: string) {
    if (!tag.trim()) return;
    try {
      const ativas = await api<Array<{ numero: number }>>(
        `/os/equipamento/${encodeURIComponent(tag.trim())}/ativas`,
      );
      setAviso(
        ativas.length
          ? `Já existe OS #${ativas.map((a) => a.numero).join(", ")} em aberto`
          : null,
      );
    } catch {
      setAviso(null);
    }
  }

  async function submit(fechar: boolean) {
    const form = formRef.current;
    if (!form) return;
    setErro(null);
    const fd = new FormData(form);
    const pecaCodigo = String(fd.get("pecaCodigo") || "");
    const body: Record<string, unknown> = {
      equipamentoTag: String(fd.get("equipamentoTag")),
      tipo: String(fd.get("tipo")),
      prioridade: String(fd.get("prioridade")),
      oficina: String(fd.get("oficina") || "") || undefined,
      observacaoRequisicao: String(fd.get("ocorrencia") || "") || undefined,
      responsavelId: String(fd.get("responsavelId") || "") || undefined,
      servicoExecutado: String(fd.get("servicoExecutado") || "") || undefined,
      deslocamentoKm: Number(fd.get("deslocamentoKm") || 0) || undefined,
      fechar,
    };
    const horas = Number(fd.get("horas") || 0);
    if (horas > 0) {
      body.maoDeObra = {
        descricao: String(fd.get("maoDeObraDesc") || "Mão de obra"),
        horas,
        valorHora: Number(fd.get("valorHora") || 0) || undefined,
      };
    }
    if (pecaCodigo) {
      body.pecas = [{ itemCodigo: pecaCodigo, qtd: Number(fd.get("pecaQtd") || 1) }];
    }
    try {
      const res = await api<{ codigo: string; fechada?: boolean }>("/os/rapida", {
        method: "POST",
        body: JSON.stringify(body),
      });
      window.alert(`${res.codigo} ${res.fechada ? "criada e fechada" : "criada (aberta)"}`);
      router.push("/os");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro");
    }
  }

  return (
    <div>
      <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 800 }}>OS Rápida</h1>
      <p style={{ margin: "0 0 16px", color: "var(--nexo-muted)", fontSize: 13 }}>
        Abertura + execução em um passo · Fechar ou deixar aberta
      </p>
      {aviso && <div style={{ marginBottom: 10, color: "var(--nexo-warning)", fontWeight: 700 }}>{aviso}</div>}
      {erro && <div style={{ marginBottom: 10, color: "var(--nexo-danger)" }}>{erro}</div>}

      <form
        ref={formRef}
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void submit(false);
        }}
        style={{
          display: "grid",
          gap: 10,
          maxWidth: 640,
          background: "var(--nexo-surface)",
          border: "1px solid var(--nexo-border)",
          borderRadius: 12,
          padding: 16,
        }}
      >
        <input
          name="equipamentoTag"
          placeholder="TAG do equipamento"
          required
          style={input}
          onBlur={(e) => void onTagBlur(e.target.value)}
        />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <select name="tipo" defaultValue="CORRETIVA" style={input}>
            <option value="CORRETIVA">Corretiva</option>
            <option value="PREVENTIVA">Preventiva</option>
            <option value="CALIBRACAO">Calibração</option>
            <option value="TSE">TSE</option>
          </select>
          <select name="prioridade" defaultValue="MEDIA" style={input}>
            <option value="BAIXA">Baixa</option>
            <option value="MEDIA">Média</option>
            <option value="ALTA">Alta</option>
            <option value="URGENTE">Urgente</option>
          </select>
        </div>
        <input name="oficina" placeholder="Oficina" style={input} />
        <select name="responsavelId" style={input}>
          <option value="">Responsável…</option>
          {cols.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
        <textarea name="ocorrencia" placeholder="Ocorrência / reclamação" rows={2} style={input} />
        <textarea name="servicoExecutado" placeholder="Serviço executado (Interno/Externo)" rows={2} style={input} />
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8 }}>
          <input name="maoDeObraDesc" placeholder="Mão de obra (descrição)" defaultValue="Mão de obra técnica" style={input} />
          <input name="horas" type="number" step="0.25" min="0" placeholder="Horas" style={input} />
          <input name="valorHora" type="number" step="0.01" min="0" placeholder="R$/h" style={input} />
        </div>
        <input name="deslocamentoKm" type="number" min="0" step="0.1" placeholder="Deslocamento (km)" style={input} />
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8 }}>
          <select name="pecaCodigo" style={input}>
            <option value="">Peça (opcional)</option>
            {pecas.map((p) => (
              <option key={p.codigo} value={p.codigo}>
                {p.codigo} — {p.descricao}
              </option>
            ))}
          </select>
          <input name="pecaQtd" type="number" min="0.01" step="0.01" defaultValue={1} style={input} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" style={ghost}>
            Deixar OS aberta
          </button>
          <button type="button" style={primary} onClick={() => void submit(true)}>
            Fechar OS
          </button>
        </div>
      </form>
    </div>
  );
}

const input: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid var(--nexo-border)",
  background: "var(--nexo-bg)",
};
const primary: React.CSSProperties = {
  border: "none",
  borderRadius: 10,
  padding: "10px 14px",
  background: "var(--nexo-primary)",
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
};
const ghost: React.CSSProperties = {
  ...primary,
  background: "white",
  color: "var(--nexo-text)",
  border: "1px solid var(--nexo-border)",
};
