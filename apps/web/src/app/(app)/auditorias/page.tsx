"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { FormDialog } from "@/components/ui/FormDialog";
import {
  Badge,
  Btn,
  Empty,
  Err,
  FieldLabel,
  PageHeader,
  Panel,
  fieldStyle,
} from "@/components/ui/aion-ui";

interface Aud {
  id: string;
  codigo: string;
  escopo: string;
  status: string;
  achados: Array<{
    id: string;
    codigo: string;
    descricao: string;
    status: string;
    planosAcao: Array<{ id: string; descricao: string; prazo?: string | null; escalonadoEm?: string | null }>;
  }>;
}

interface Nc {
  id: string;
  codigo: string;
  descricao: string;
  origem: string;
  status: string;
  planosAcao: Array<{ id: string; descricao: string; prazo?: string | null; escalonadoEm?: string | null }>;
}

export default function AuditoriasPage() {
  const [auds, setAuds] = useState<Aud[]>([]);
  const [ncs, setNcs] = useState<Nc[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [fecharId, setFecharId] = useState<string | null>(null);
  const [planoDraft, setPlanoDraft] = useState<{ id: string; descricao: string; prazo: string } | null>(null);
  const [dialogErro, setDialogErro] = useState<string | null>(null);

  async function load() {
    const [a, n] = await Promise.all([api<Aud[]>("/auditorias"), api<Nc[]>("/nao-conformidades")]);
    setAuds(a);
    setNcs(n);
  }

  useEffect(() => {
    void load().catch((e) => setErro(e.message));
  }, []);

  async function createAud(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await api("/auditorias", { method: "POST", body: JSON.stringify({ escopo: String(fd.get("escopo")) }) });
    e.currentTarget.reset();
    await load();
  }

  async function createNc(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await api("/nao-conformidades", {
      method: "POST",
      body: JSON.stringify({
        descricao: String(fd.get("descricao")),
        origem: String(fd.get("origem") || "Livre"),
        auditoriaId: String(fd.get("auditoriaId") || "") || undefined,
      }),
    });
    e.currentTarget.reset();
    await load();
  }

  async function fechar(id: string) {
    setFecharId(id);
  }

  async function plano(id: string) {
    setPlanoDraft({ id, descricao: "", prazo: "" });
    setDialogErro(null);
  }

  async function escalonar() {
    const res = await api<{ escalonados: number }>("/auditorias/escalonar-planos", { method: "POST" });
    setMsg(`${res.escalonados} plano(s) escalonados ao gestor`);
    await load();
  }

  return (
    <div>
      <PageHeader
        title="Auditorias e NC"
        subtitle="Planejada → Em Execução ao registrar achados · plano vencido escala automaticamente"
        actions={
          <Btn variant="secondary" onClick={() => void escalonar()}>
            Escalonar planos vencidos
          </Btn>
        }
      />

      {erro && <Err>{erro}</Err>}
      {msg && (
        <div style={{ marginBottom: 12, fontSize: 13, fontWeight: 600, color: "oklch(0.4 0.14 255)" }}>{msg}</div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Panel title="Auditorias">
          <form onSubmit={(e) => void createAud(e)} style={{ display: "grid", gap: 10, marginBottom: 14 }}>
            <div>
              <FieldLabel>Escopo</FieldLabel>
              <input name="escopo" placeholder="Ex: Setor UTI · RDC 509" required style={fieldStyle} />
            </div>
            <Btn type="submit">Nova auditoria</Btn>
          </form>
          {auds.map((a) => (
            <div key={a.id} style={{ borderTop: "1px solid oklch(0.93 0.005 255)", padding: "12px 0" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <strong>{a.codigo}</strong>
                <Badge tone={a.status}>{a.status.replace("_", " ")}</Badge>
              </div>
              <div style={{ fontSize: 13, marginTop: 4 }}>{a.escopo}</div>
              <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)", marginTop: 2 }}>{a.achados.length} achados</div>
            </div>
          ))}
          {auds.length === 0 && <Empty text="Nenhuma auditoria cadastrada." />}
        </Panel>

        <Panel title="Não Conformidades">
          <form onSubmit={(e) => void createNc(e)} style={{ display: "grid", gap: 10, marginBottom: 14 }}>
            <div>
              <FieldLabel>Descrição</FieldLabel>
              <textarea name="descricao" placeholder="Descrição da NC" required style={fieldStyle} rows={2} />
            </div>
            <div>
              <FieldLabel>Origem</FieldLabel>
              <input name="origem" placeholder="Livre / OS-xxx / Auditoria" defaultValue="Livre" style={fieldStyle} />
            </div>
            <div>
              <FieldLabel>Auditoria (opcional)</FieldLabel>
              <select name="auditoriaId" defaultValue="" style={fieldStyle}>
                <option value="">Sem auditoria</option>
                {auds.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.codigo}
                  </option>
                ))}
              </select>
            </div>
            <Btn type="submit">Abrir NC</Btn>
          </form>
          {ncs.map((n) => (
            <div key={n.id} style={{ borderTop: "1px solid oklch(0.93 0.005 255)", padding: "12px 0" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <strong>{n.codigo}</strong>
                <Badge tone={n.status}>{n.status}</Badge>
                <span style={{ fontSize: 12, color: "oklch(0.5 0.02 250)" }}>{n.origem}</span>
              </div>
              <div style={{ fontSize: 13, marginTop: 4 }}>{n.descricao}</div>
              {n.planosAcao.map((p) => (
                <div
                  key={p.id}
                  style={{
                    fontSize: 12,
                    marginTop: 6,
                    color: p.escalonadoEm ? "oklch(0.45 0.16 25)" : "oklch(0.5 0.02 250)",
                    fontWeight: p.escalonadoEm ? 700 : 400,
                  }}
                >
                  Plano: {p.descricao}
                  {p.prazo ? ` · prazo ${new Date(p.prazo).toLocaleDateString("pt-BR")}` : ""}
                  {p.escalonadoEm ? " · ESCALONADO" : ""}
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <Btn variant="ghost" style={{ padding: "6px 10px", fontSize: 12 }} onClick={() => void plano(n.id)}>
                  Plano
                </Btn>
                {n.status !== "FECHADA" && (
                  <Btn variant="secondary" style={{ padding: "6px 10px", fontSize: 12 }} onClick={() => void fechar(n.id)}>
                    Fechar
                  </Btn>
                )}
              </div>
            </div>
          ))}
          {ncs.length === 0 && <Empty text="Nenhuma não conformidade aberta." />}
        </Panel>
      </div>

      <ConfirmModal
        open={Boolean(fecharId)}
        title="Fechar NC"
        message="Informe a justificativa de fechamento."
        requireJustification
        confirmLabel="Fechar"
        onCancel={() => setFecharId(null)}
        onConfirm={async (justificativa) => {
          if (!fecharId) return;
          await api(`/nao-conformidades/${fecharId}/fechar`, {
            method: "POST",
            body: JSON.stringify({ justificativa }),
          });
          setFecharId(null);
          await load();
        }}
      />

      <FormDialog
        open={Boolean(planoDraft)}
        title="Plano de ação"
        confirmLabel="Salvar"
        erro={dialogErro}
        onCancel={() => setPlanoDraft(null)}
        onConfirm={async () => {
          if (!planoDraft?.descricao.trim()) {
            setDialogErro("Descrição obrigatória");
            return;
          }
          await api(`/nao-conformidades/${planoDraft.id}/planos-acao`, {
            method: "POST",
            body: JSON.stringify({
              descricao: planoDraft.descricao.trim(),
              prazo: planoDraft.prazo || undefined,
            }),
          });
          setPlanoDraft(null);
          await load();
        }}
      >
        {planoDraft && (
          <>
            <div>
              <FieldLabel htmlFor="plano-desc">Descrição</FieldLabel>
              <input
                id="plano-desc"
                value={planoDraft.descricao}
                onChange={(e) => setPlanoDraft({ ...planoDraft, descricao: e.target.value })}
                style={fieldStyle}
              />
            </div>
            <div>
              <FieldLabel htmlFor="plano-prazo">Prazo</FieldLabel>
              <input
                id="plano-prazo"
                type="date"
                value={planoDraft.prazo}
                onChange={(e) => setPlanoDraft({ ...planoDraft, prazo: e.target.value })}
                style={fieldStyle}
              />
            </div>
          </>
        )}
      </FormDialog>
    </div>
  );
}
