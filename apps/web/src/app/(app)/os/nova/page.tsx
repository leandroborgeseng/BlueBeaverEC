"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

interface Colaborador {
  id: string;
  nome: string;
}

interface EstoqueItem {
  codigo: string;
  descricao: string;
  disponivel: number;
}

export default function NovaOsPage() {
  const router = useRouter();
  const [cols, setCols] = useState<Colaborador[]>([]);
  const [pecas, setPecas] = useState<EstoqueItem[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pecaCodigo, setPecaCodigo] = useState("");
  const [pecaQtd, setPecaQtd] = useState(1);

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
          ? `Já existe OS #${ativas.map((a) => a.numero).join(", ")} em aberto para este equipamento`
          : null,
      );
    } catch {
      setAviso(null);
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {
      equipamentoTag: String(fd.get("equipamentoTag")),
      tipo: String(fd.get("tipo")),
      prioridade: String(fd.get("prioridade")),
      oficina: String(fd.get("oficina") || "") || undefined,
      observacaoRequisicao: String(fd.get("observacaoRequisicao") || "") || undefined,
      pendencia: String(fd.get("pendencia") || "") || undefined,
      responsavelId: String(fd.get("responsavelId") || "") || undefined,
    };
    if (pecaCodigo) {
      body.pecas = [{ itemCodigo: pecaCodigo, qtd: pecaQtd }];
    }
    try {
      const res = await api<{
        codigo: string;
        avisoDuplicidade?: string | null;
        alertaCriticoUrgente?: string | null;
      }>("/os", { method: "POST", body: JSON.stringify(body) });
      const notes = [res.avisoDuplicidade, res.alertaCriticoUrgente].filter(Boolean).join(" · ");
      window.alert(`${res.codigo} criada${notes ? `\n${notes}` : ""}`);
      router.push("/os");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro");
    }
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 800 }}>Abrir Ordem de Serviço</h1>
      <p style={{ margin: "0 0 16px", color: "var(--nexo-muted)", fontSize: 13 }}>
        Duplicidade não bloqueia · peça reserva estoque até fechar/cancelar
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
        <input
          name="equipamentoTag"
          placeholder="TAG do equipamento"
          required
          style={input}
          onBlur={(e) => void onTagBlur(e.target.value)}
        />
        {aviso && (
          <div style={{ background: "oklch(0.97 0.05 85)", borderRadius: 10, padding: 10, fontSize: 13 }}>
            {aviso}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
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
        <select name="responsavelId" defaultValue="" style={input}>
          <option value="">Sem responsável (Não Atribuída)</option>
          {cols.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
        <textarea name="observacaoRequisicao" placeholder="Ocorrência / observação" rows={3} style={input} />
        <input name="pendencia" placeholder="Pendência (bloqueia fechamento se preenchida)" style={input} />

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8 }}>
          <select value={pecaCodigo} onChange={(e) => setPecaCodigo(e.target.value)} style={input}>
            <option value="">Peça (opcional)</option>
            {pecas.map((p) => (
              <option key={p.codigo} value={p.codigo}>
                {p.codigo} — {p.descricao} (disp. {p.disponivel})
              </option>
            ))}
          </select>
          <input
            type="number"
            min={0.01}
            step={0.01}
            value={pecaQtd}
            onChange={(e) => setPecaQtd(Number(e.target.value))}
            style={input}
          />
        </div>

        {erro && <div style={{ color: "var(--nexo-danger)" }}>{erro}</div>}
        <button type="submit" style={btn}>
          Abrir OS
        </button>
      </form>
    </div>
  );
}

const input: React.CSSProperties = {
  width: "100%",
  border: "1px solid var(--nexo-border)",
  borderRadius: 10,
  padding: "10px 12px",
};
const btn: React.CSSProperties = {
  border: "none",
  borderRadius: 10,
  padding: "12px 14px",
  background: "var(--nexo-primary)",
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
};
