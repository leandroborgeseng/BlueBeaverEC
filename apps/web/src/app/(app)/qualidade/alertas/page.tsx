"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  AVISO_NAO_CONFORMIDADE_REGULATORIA,
  LABEL_STATUS_ALERTA,
  LABEL_TIPO_ALERTA,
  PERMISSAO_NIVEL,
} from "@aion/shared";
import { api, fetchBlob } from "@/lib/api";
import { useCan } from "@/lib/session";
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
import { QualidadeTabs, fileToDataUrl, fmtData } from "../tabs";

type Alerta = {
  id: string;
  codigo: string;
  tipo: keyof typeof LABEL_TIPO_ALERTA;
  titulo: string;
  origem: string;
  status: keyof typeof LABEL_STATUS_ALERTA;
  prazo?: string | null;
  protocoloComunicacaoExterna?: string | null;
  notificacaoAutomatica?: boolean;
  createdBy?: { nome: string; email: string } | null;
  equipamentos: Array<{ id: string; equipamento: { tag: string; nome: string } }>;
  arquivos: Array<{ id: string; arquivo: { id: string; nomeArquivo: string } }>;
};

type Opt = { id: string; nome: string; tag?: string };

export default function AlertasPage() {
  const canEdit = useCan("auditorias", PERMISSAO_NIVEL.EDICAO);
  const [items, setItems] = useState<Alerta[]>([]);
  const [sel, setSel] = useState<Alerta | null>(null);
  const [equips, setEquips] = useState<Opt[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  async function load() {
    const [list, e] = await Promise.all([
      api<Alerta[]>("/qualidade/alertas"),
      api<{ items: Opt[] }>("/equipamentos?pageSize=50"),
    ]);
    setItems(list);
    setEquips(e.items ?? []);
  }

  useEffect(() => {
    void load().catch((e) => setErro(e.message));
  }, []);

  async function abrir(id: string) {
    setSel(await api<Alerta>(`/qualidade/alertas/${id}`));
  }

  async function criar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await api("/qualidade/alertas", {
      method: "POST",
      body: JSON.stringify({
        tipo: String(fd.get("tipo")),
        titulo: String(fd.get("titulo")),
        origem: String(fd.get("origem")),
        prazo: String(fd.get("prazo") || "") || undefined,
        protocoloComunicacaoExterna: String(fd.get("protocolo") || "") || undefined,
        observacao: String(fd.get("observacao") || "") || undefined,
        equipamentoIds: fd.getAll("equipamentoIds").map(String),
      }),
    });
    e.currentTarget.reset();
    await load();
  }

  return (
    <div>
      <PageHeader
        title="Alertas de fabricante, recolhimentos e ações de campo"
        subtitle={`${AVISO_NAO_CONFORMIDADE_REGULATORIA} Somente registro manual. O sistema não dispara notificação externa.`}
      />
      <QualidadeTabs />
      {erro && <Err>{erro}</Err>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.15fr", gap: 14 }}>
        <Panel title="Registros manuais">
          {canEdit && (
            <form onSubmit={(e) => void criar(e)} style={{ display: "grid", gap: 8, marginBottom: 14 }}>
              <select name="tipo" style={fieldStyle} defaultValue="ALERTA_FABRICANTE">
                {Object.entries(LABEL_TIPO_ALERTA).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <input name="titulo" required placeholder="Título" style={fieldStyle} />
              <input name="origem" required placeholder="Origem (fabricante, circular…)" style={fieldStyle} />
              <input name="prazo" type="date" style={fieldStyle} />
              <textarea name="protocolo" placeholder="Protocolo de comunicação externa (se houver)" rows={2} style={fieldStyle} />
              <select name="equipamentoIds" multiple size={4} style={fieldStyle}>
                {equips.map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {eq.tag} · {eq.nome}
                  </option>
                ))}
              </select>
              <Btn type="submit">Registrar alerta</Btn>
            </form>
          )}
          {items.length === 0 && <Empty text="Nenhum alerta registrado." />}
          {items.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => void abrir(a.id)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                border: "none",
                borderTop: "1px solid oklch(0.93 0.005 255)",
                background: sel?.id === a.id ? "oklch(0.96 0.02 255)" : "transparent",
                padding: "10px 0",
                cursor: "pointer",
              }}
            >
              <strong>{a.codigo}</strong> · {a.titulo}
              <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                <Badge>{LABEL_TIPO_ALERTA[a.tipo]}</Badge>
                <Badge tone={a.status}>{LABEL_STATUS_ALERTA[a.status]}</Badge>
              </div>
            </button>
          ))}
        </Panel>

        <Panel title={sel ? sel.titulo : "Equipamentos, prazos e evidências"}>
          {!sel && <Empty text="Selecione um alerta." />}
          {sel && (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ fontSize: 13 }}>
                Origem: {sel.origem}
                {sel.prazo && ` · prazo ${fmtData(sel.prazo)}`}
                {sel.createdBy && ` · registrado por ${sel.createdBy.nome} (${sel.createdBy.email})`}
              </div>
              <Badge tone="warning">Notificação automática: desligada</Badge>
              {sel.protocoloComunicacaoExterna && (
                <div style={{ fontSize: 13 }}>
                  <strong>Protocolo de comunicação externa:</strong> {sel.protocoloComunicacaoExterna}
                </div>
              )}
              <div>
                <FieldLabel>Equipamentos envolvidos</FieldLabel>
                {sel.equipamentos.map((e) => (
                  <div key={e.id} style={{ fontSize: 13 }}>
                    {e.equipamento.tag} · {e.equipamento.nome}
                  </div>
                ))}
                {canEdit && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const fd = new FormData(e.currentTarget);
                      void api(`/qualidade/alertas/${sel.id}/equipamentos`, {
                        method: "POST",
                        body: JSON.stringify({ equipamentoId: String(fd.get("equipamentoId")) }),
                      }).then(() => abrir(sel.id));
                    }}
                    style={{ display: "flex", gap: 8, marginTop: 8 }}
                  >
                    <select name="equipamentoId" style={fieldStyle}>
                      {equips.map((eq) => (
                        <option key={eq.id} value={eq.id}>
                          {eq.tag}
                        </option>
                      ))}
                    </select>
                    <Btn type="submit" variant="secondary">
                      Incluir
                    </Btn>
                  </form>
                )}
              </div>
              <div>
                <FieldLabel>Evidências</FieldLabel>
                {sel.arquivos.map((ar) => (
                  <Btn
                    key={ar.id}
                    variant="secondary"
                    onClick={() =>
                      void fetchBlob(`/qualidade/arquivos/${ar.arquivo.id}`).then((blob) => {
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = ar.arquivo.nomeArquivo;
                        a.click();
                        URL.revokeObjectURL(url);
                      })
                    }
                  >
                    {ar.arquivo.nomeArquivo}
                  </Btn>
                ))}
                {canEdit && (
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      void fileToDataUrl(f)
                        .then((dataUrl) =>
                          api(`/qualidade/alertas/${sel.id}/evidencias`, {
                            method: "POST",
                            body: JSON.stringify({ dataUrl, nomeArquivo: f.name }),
                          }),
                        )
                        .then(() => abrir(sel.id));
                    }}
                  />
                )}
              </div>
              {canEdit && sel.status !== "CONCLUIDO" && (
                <Btn
                  onClick={() =>
                    void api(`/qualidade/alertas/${sel.id}/status`, {
                      method: "POST",
                      body: JSON.stringify({
                        status: sel.status === "ABERTO" ? "EM_ANDAMENTO" : "CONCLUIDO",
                      }),
                    }).then(() => {
                      void abrir(sel.id);
                      void load();
                    })
                  }
                >
                  {sel.status === "ABERTO" ? "Marcar em andamento" : "Concluir alerta"}
                </Btn>
              )}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
