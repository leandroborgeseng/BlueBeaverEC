"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, downloadApi } from "@/lib/api";

interface Tpl {
  codigo: string;
  nome: string;
  descricao: string;
}

export default function RelatoriosPage() {
  const [templates, setTemplates] = useState<Tpl[]>([]);
  const [agends, setAgends] = useState<
    Array<{ id: string; template: string; frequencia: string; destinatarios: string[]; proximoEnvio?: string | null }>
  >([]);
  const [preview, setPreview] = useState<unknown>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const [t, a] = await Promise.all([
      api<Tpl[]>("/relatorios/templates"),
      api<typeof agends>("/relatorios/agendamentos"),
    ]);
    setTemplates(t);
    setAgends(a);
  }

  useEffect(() => {
    void load().catch((e) => setMsg(e.message));
  }, []);

  async function gerar(codigo: string, formato: "json" | "xlsx" | "pdf") {
    setBusy(`${codigo}:${formato}`);
    setMsg(null);
    try {
      if (formato === "json") {
        const res = await api("/relatorios/gerar", {
          method: "POST",
          body: JSON.stringify({ template: codigo, formato }),
        });
        setPreview(res);
        setMsg(`Pré-visualização JSON — ${codigo}`);
      } else {
        const name = await downloadApi(
          "/relatorios/gerar",
          { method: "POST", body: JSON.stringify({ template: codigo, formato }) },
          `${codigo}.${formato}`,
        );
        setMsg(`Download iniciado: ${name}`);
        setPreview(null);
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro ao gerar");
    } finally {
      setBusy(null);
    }
  }

  async function agendar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await api("/relatorios/agendamentos", {
      method: "POST",
      body: JSON.stringify({
        template: String(fd.get("template")),
        frequencia: String(fd.get("frequencia")),
        destinatarios: String(fd.get("destinatarios") || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      }),
    });
    e.currentTarget.reset();
    setMsg("Agendamento criado (envio por e-mail via job futuro)");
    await load();
  }

  return (
    <div>
      <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 800 }}>Relatórios Executivos</h1>
      <p style={{ margin: "0 0 16px", color: "var(--nexo-muted)", fontSize: 13 }}>
        Templates pré-definidos · PDF (pdfkit) · Excel (exceljs) · agendamento
      </p>
      {msg && <div style={{ marginBottom: 10 }}>{msg}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10, marginBottom: 18 }}>
        {templates.map((t) => (
          <div key={t.codigo} style={card}>
            <strong>{t.nome}</strong>
            <p style={{ fontSize: 12, color: "var(--nexo-muted)", margin: "6px 0 10px" }}>{t.descricao}</p>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" disabled={!!busy} onClick={() => void gerar(t.codigo, "json")} style={btn}>
                JSON
              </button>
              <button type="button" disabled={!!busy} onClick={() => void gerar(t.codigo, "xlsx")} style={btn}>
                Excel
              </button>
              <button type="button" disabled={!!busy} onClick={() => void gerar(t.codigo, "pdf")} style={btn}>
                PDF
              </button>
            </div>
          </div>
        ))}
      </div>

      <section style={{ ...card, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: 15 }}>Agendamentos</h2>
        <form onSubmit={(e) => void agendar(e)} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr auto", gap: 8, marginBottom: 12 }}>
          <select name="template" style={input}>
            {templates.map((t) => (
              <option key={t.codigo} value={t.codigo}>
                {t.nome}
              </option>
            ))}
          </select>
          <select name="frequencia" style={input}>
            <option value="MENSAL">Mensal</option>
            <option value="SEMANAL">Semanal</option>
            <option value="TRIMESTRAL">Trimestral</option>
          </select>
          <input name="destinatarios" placeholder="e-mails separados por vírgula" required style={input} />
          <button type="submit" style={btn}>
            Agendar
          </button>
        </form>
        {agends.map((a) => (
          <div key={a.id} style={{ fontSize: 13, padding: "6px 0", borderTop: "1px solid var(--nexo-border)" }}>
            {a.template} · {a.frequencia} · {a.destinatarios.join(", ")}
            {a.proximoEnvio && (
              <span style={{ color: "var(--nexo-muted)" }}> · próximo {String(a.proximoEnvio).slice(0, 10)}</span>
            )}
          </div>
        ))}
      </section>

      {preview != null && (
        <pre style={{ ...card, fontSize: 11, overflow: "auto", maxHeight: 320 }}>
          {JSON.stringify(preview, null, 2)}
        </pre>
      )}
    </div>
  );
}

const card: React.CSSProperties = {
  background: "var(--nexo-surface)",
  border: "1px solid var(--nexo-border)",
  borderRadius: 12,
  padding: 14,
};
const input: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid var(--nexo-border)",
  background: "var(--nexo-bg)",
};
const btn: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 8,
  border: "none",
  background: "var(--nexo-brand)",
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 12,
};
