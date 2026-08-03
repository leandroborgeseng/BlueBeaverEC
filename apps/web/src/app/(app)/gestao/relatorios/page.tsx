"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, downloadApi } from "@/lib/api";
import {
  Btn,
  FieldLabel,
  PageHeader,
  Panel,
  Surface,
  fieldStyle,
} from "@/components/ui/aion-ui";

interface Tpl {
  codigo: string;
  nome: string;
  descricao: string;
}

export default function RelatoriosPage() {
  const [templates, setTemplates] = useState<Tpl[]>([]);
  const [agends, setAgends] = useState<
    Array<{
      id: string;
      template: string;
      frequencia: string;
      destinatarios: string[];
      proximoEnvio?: string | null;
      ultimoEnvio?: string | null;
      ultimoStatus?: string | null;
    }>
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
    setMsg("Agendamento criado");
    await load();
  }

  async function disparar(id: string) {
    setBusy(`disp:${id}`);
    try {
      const res = await api<{ mensagem: string }>("/relatorios/agendamentos/" + id + "/disparar", {
        method: "POST",
        body: "{}",
      });
      setMsg(res.mensagem ?? "Disparo processado (sem SMTP)");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro ao disparar");
    } finally {
      setBusy(null);
    }
  }

  async function dispararPendentes() {
    setBusy("pendentes");
    try {
      const res = await api<{ processados: number }>("/relatorios/agendamentos/disparar-pendentes", {
        method: "POST",
        body: "{}",
      });
      setMsg(`${res.processados} agendamento(s) processado(s)`);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader title="Relatórios Executivos" subtitle="Templates pré-definidos · PDF (pdfkit) · Excel (exceljs) · agendamento" />
      {msg && <div style={{ marginBottom: 10, fontSize: 13, fontWeight: 600 }}>{msg}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10, marginBottom: 18 }}>
        {templates.map((t) => (
          <Surface key={t.codigo}>
            <strong>{t.nome}</strong>
            <p style={{ fontSize: 12, color: "oklch(0.5 0.02 250)", margin: "6px 0 10px" }}>{t.descricao}</p>
            <div style={{ display: "flex", gap: 6 }}>
              <Btn variant="ghost" disabled={!!busy} style={{ fontSize: 12, padding: "6px 10px" }} onClick={() => void gerar(t.codigo, "json")}>
                JSON
              </Btn>
              <Btn variant="secondary" disabled={!!busy} style={{ fontSize: 12, padding: "6px 10px" }} onClick={() => void gerar(t.codigo, "xlsx")}>
                Excel
              </Btn>
              <Btn disabled={!!busy} style={{ fontSize: 12, padding: "6px 10px" }} onClick={() => void gerar(t.codigo, "pdf")}>
                PDF
              </Btn>
            </div>
          </Surface>
        ))}
      </div>

      <Panel title="Agendamentos">
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
          <Btn variant="secondary" disabled={!!busy} onClick={() => void dispararPendentes()}>
            Disparar pendentes
          </Btn>
        </div>
        <form onSubmit={(e) => void agendar(e)} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr auto", gap: 10, alignItems: "end", marginBottom: 12 }}>
          <div>
            <FieldLabel>Template</FieldLabel>
            <select name="template" style={fieldStyle}>
              {templates.map((t) => (
                <option key={t.codigo} value={t.codigo}>
                  {t.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel>Frequência</FieldLabel>
            <select name="frequencia" style={fieldStyle}>
              <option value="MENSAL">Mensal</option>
              <option value="SEMANAL">Semanal</option>
              <option value="TRIMESTRAL">Trimestral</option>
            </select>
          </div>
          <div>
            <FieldLabel>Destinatários</FieldLabel>
            <input name="destinatarios" placeholder="e-mails separados por vírgula" required style={fieldStyle} />
          </div>
          <Btn type="submit">Agendar</Btn>
        </form>
        {agends.map((a) => (
          <div
            key={a.id}
            style={{
              fontSize: 13,
              padding: "8px 0",
              borderTop: "1px solid oklch(0.94 0.005 255)",
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "center",
            }}
          >
            <div>
              {a.template} · {a.frequencia} · {a.destinatarios.join(", ")}
              {a.proximoEnvio && (
                <span style={{ color: "oklch(0.5 0.02 250)" }}> · próximo {String(a.proximoEnvio).slice(0, 10)}</span>
              )}
              {a.ultimoEnvio && (
                <span style={{ color: "oklch(0.45 0.13 150)" }}>
                  {" "}
                  · último {String(a.ultimoEnvio).slice(0, 16)} ({a.ultimoStatus})
                </span>
              )}
            </div>
            <Btn
              variant="ghost"
              disabled={!!busy}
              style={{ fontSize: 12, padding: "4px 10px" }}
              onClick={() => void disparar(a.id)}
            >
              Enviar agora
            </Btn>
          </div>
        ))}
      </Panel>

      {preview != null && (
        <Surface style={{ marginTop: 16 }}>
          <pre style={{ fontSize: 11, overflow: "auto", maxHeight: 320, margin: 0 }}>
            {JSON.stringify(preview, null, 2)}
          </pre>
        </Surface>
      )}
    </div>
  );
}
