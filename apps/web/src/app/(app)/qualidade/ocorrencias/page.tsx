"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  AVISO_NAO_CONFORMIDADE_REGULATORIA,
  LABEL_CONDICAO_USO,
  LABEL_STATUS_OCORRENCIA,
  LABEL_TIPO_OCORRENCIA,
  PERMISSAO_NIVEL,
} from "@aion/shared";
import { api } from "@/lib/api";
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
import { QualidadeTabs, fmtData } from "../tabs";

type Oc = {
  id: string;
  codigo: string;
  tipo: keyof typeof LABEL_TIPO_OCORRENCIA;
  status: keyof typeof LABEL_STATUS_OCORRENCIA;
  dataOcorrido: string;
  descricao: string;
  medidasImediatas?: string | null;
  acessoSensivel: boolean;
  condicaoUsoSugerida?: string | null;
  causalidadeInferida?: null;
  equipamento?: { id: string; tag: string; nome: string; condicaoUso?: string } | null;
  setor?: { nome: string } | null;
  ordemServico?: { numero: number; codigo?: string | null } | null;
  createdBy?: { nome: string } | null;
  investigacoes: Array<{ id: string; relato: string; hipotese?: string | null; createdBy?: { nome: string } | null; createdAt: string }>;
  acoes: Array<{
    id: string;
    descricao: string;
    responsavelNome?: string | null;
    prazo?: string | null;
    concluidoEm?: string | null;
  }>;
  _count?: { investigacoes: number; acoes: number };
};

type Opt = { id: string; nome: string; tag?: string };
type Nc = { id: string; codigo: string; descricao: string };

export default function OcorrenciasPage() {
  const canEdit = useCan("auditorias", PERMISSAO_NIVEL.EDICAO);
  const canCondicao = useCan("equipamentos", PERMISSAO_NIVEL.EDICAO_APROVACAO);
  const [items, setItems] = useState<Oc[]>([]);
  const [sel, setSel] = useState<Oc | null>(null);
  const [setores, setSetores] = useState<Opt[]>([]);
  const [equips, setEquips] = useState<Opt[]>([]);
  const [ncs, setNcs] = useState<Nc[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  async function load() {
    const [list, s, e, n] = await Promise.all([
      api<Oc[]>("/qualidade/ocorrencias"),
      api<Opt[]>("/setores"),
      api<{ items: Opt[] }>("/equipamentos?pageSize=50"),
      api<Nc[]>("/nao-conformidades").catch(() => []),
    ]);
    setItems(list);
    setSetores(s);
    setEquips(e.items ?? []);
    setNcs(n);
  }

  useEffect(() => {
    void load().catch((e) => setErro(e.message));
  }, []);

  async function abrir(id: string) {
    setSel(await api<Oc>(`/qualidade/ocorrencias/${id}`));
  }

  async function criar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await api("/qualidade/ocorrencias", {
      method: "POST",
      body: JSON.stringify({
        tipo: String(fd.get("tipo")),
        dataOcorrido: String(fd.get("dataOcorrido")),
        descricao: String(fd.get("descricao")),
        medidasImediatas: String(fd.get("medidasImediatas") || "") || undefined,
        equipamentoId: String(fd.get("equipamentoId") || "") || undefined,
        setorId: String(fd.get("setorId") || "") || undefined,
        acessoSensivel: fd.get("acessoSensivel") === "on",
        condicaoUsoSugerida: String(fd.get("condicaoUsoSugerida") || "") || undefined,
      }),
    });
    e.currentTarget.reset();
    await load();
  }

  return (
    <div>
      <PageHeader
        title="Ocorrências de segurança"
        subtitle={`${AVISO_NAO_CONFORMIDADE_REGULATORIA} Sem dados de paciente. Investigação não infere causalidade. Condição de uso só muda por profissional autorizado.`}
      />
      <QualidadeTabs />
      {erro && <Err>{erro}</Err>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 14 }}>
        <Panel title="Registro">
          {canEdit && (
            <form onSubmit={(e) => void criar(e)} style={{ display: "grid", gap: 8, marginBottom: 14 }}>
              <select name="tipo" style={fieldStyle} defaultValue="FALHA">
                {Object.entries(LABEL_TIPO_OCORRENCIA).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <input name="dataOcorrido" type="datetime-local" required style={fieldStyle} />
              <textarea name="descricao" required placeholder="Descrição (sem dados de paciente)" rows={3} style={fieldStyle} />
              <textarea name="medidasImediatas" placeholder="Medidas imediatas" rows={2} style={fieldStyle} />
              <select name="equipamentoId" style={fieldStyle} defaultValue="">
                <option value="">Equipamento</option>
                {equips.map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {eq.tag} · {eq.nome}
                  </option>
                ))}
              </select>
              <select name="setorId" style={fieldStyle} defaultValue="">
                <option value="">Setor</option>
                {setores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
              <input name="condicaoUsoSugerida" placeholder="Sugestão de condição de uso (não aplica sozinha)" style={fieldStyle} />
              <label style={{ fontSize: 12 }}>
                <input type="checkbox" name="acessoSensivel" /> Acesso sensível
              </label>
              <Btn type="submit">Abrir ocorrência</Btn>
            </form>
          )}
          {items.length === 0 && <Empty text="Nenhuma ocorrência." />}
          {items.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => void abrir(o.id)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                border: "none",
                borderTop: "1px solid oklch(0.93 0.005 255)",
                background: sel?.id === o.id ? "oklch(0.96 0.02 255)" : "transparent",
                padding: "10px 0",
                cursor: "pointer",
              }}
            >
              <strong>{o.codigo}</strong> · {o.equipamento?.tag ?? "—"}
              <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                <Badge tone={o.tipo}>{LABEL_TIPO_OCORRENCIA[o.tipo]}</Badge>
                <Badge tone={o.status}>{LABEL_STATUS_OCORRENCIA[o.status]}</Badge>
              </div>
            </button>
          ))}
        </Panel>

        <Panel title={sel ? `${sel.codigo} · acompanhamento` : "Investigação e ações"}>
          {!sel && <Empty text="Selecione uma ocorrência para acompanhar até a conclusão." />}
          {sel && (
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ fontSize: 13 }}>
                {LABEL_TIPO_OCORRENCIA[sel.tipo]} · {fmtData(sel.dataOcorrido)} · {sel.setor?.nome ?? "setor n/d"}
                {sel.createdBy && ` · ${sel.createdBy.nome}`}
              </div>
              <div>{sel.descricao}</div>
              <div style={{ fontSize: 13 }}>
                <strong>Medidas imediatas:</strong> {sel.medidasImediatas || "—"}
              </div>
              {sel.ordemServico && (
                <div style={{ fontSize: 12 }}>OS vinculada: {sel.ordemServico.codigo ?? sel.ordemServico.numero}</div>
              )}
              <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)" }}>
                Causalidade automática: não. Condição de uso automática: não.
                {sel.condicaoUsoSugerida && ` Sugestão registrada: ${sel.condicaoUsoSugerida}.`}
              </div>

              <div>
                <FieldLabel>Investigação (hipótese opcional, nunca preenchida sozinha)</FieldLabel>
                {sel.investigacoes.map((i) => (
                  <div key={i.id} style={{ fontSize: 13, marginTop: 6 }}>
                    {i.relato}
                    {i.hipotese && <div style={{ color: "oklch(0.5 0.02 250)" }}>Hipótese: {i.hipotese}</div>}
                    <div style={{ fontSize: 11 }}>{i.createdBy?.nome} · {fmtData(i.createdAt)}</div>
                  </div>
                ))}
                {canEdit && sel.status !== "CONCLUIDA" && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const fd = new FormData(e.currentTarget);
                      void api(`/qualidade/ocorrencias/${sel.id}/investigacao`, {
                        method: "POST",
                        body: JSON.stringify({
                          relato: String(fd.get("relato")),
                          hipotese: String(fd.get("hipotese") || "") || undefined,
                        }),
                      }).then(() => abrir(sel.id));
                      e.currentTarget.reset();
                    }}
                    style={{ display: "grid", gap: 8, marginTop: 8 }}
                  >
                    <textarea name="relato" required placeholder="Relato da investigação" rows={2} style={fieldStyle} />
                    <input name="hipotese" placeholder="Hipótese (opcional)" style={fieldStyle} />
                    <Btn type="submit" variant="secondary">
                      Registrar investigação
                    </Btn>
                  </form>
                )}
              </div>

              <div>
                <FieldLabel>Ações</FieldLabel>
                {sel.acoes.map((a) => (
                  <div key={a.id} style={{ fontSize: 13, marginTop: 6, display: "flex", gap: 8, alignItems: "center" }}>
                    <span>
                      {a.descricao} {a.responsavelNome && `· ${a.responsavelNome}`} {a.prazo && `· prazo ${fmtData(a.prazo)}`}
                    </span>
                    {a.concluidoEm ? (
                      <Badge tone="CONCLUIDA">Concluída {fmtData(a.concluidoEm)}</Badge>
                    ) : (
                      canEdit && (
                        <Btn
                          variant="secondary"
                          onClick={() =>
                            void api(`/qualidade/ocorrencias/${sel.id}/acoes/${a.id}/concluir`, { method: "POST" }).then(() =>
                              abrir(sel.id),
                            )
                          }
                        >
                          Concluir ação
                        </Btn>
                      )
                    )}
                  </div>
                ))}
                {canEdit && sel.status !== "CONCLUIDA" && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const fd = new FormData(e.currentTarget);
                      void api(`/qualidade/ocorrencias/${sel.id}/acoes`, {
                        method: "POST",
                        body: JSON.stringify({
                          descricao: String(fd.get("descricao")),
                          responsavelNome: String(fd.get("responsavelNome") || "") || undefined,
                          prazo: String(fd.get("prazo") || "") || undefined,
                        }),
                      }).then(() => abrir(sel.id));
                      e.currentTarget.reset();
                    }}
                    style={{ display: "grid", gap: 8, marginTop: 8 }}
                  >
                    <input name="descricao" required placeholder="Ação" style={fieldStyle} />
                    <input name="responsavelNome" placeholder="Responsável" style={fieldStyle} />
                    <input name="prazo" type="date" style={fieldStyle} />
                    <Btn type="submit" variant="secondary">
                      Incluir ação
                    </Btn>
                  </form>
                )}
              </div>

              {canEdit && sel.status !== "CONCLUIDA" && (
                <Btn
                  onClick={() =>
                    void api(`/qualidade/ocorrencias/${sel.id}/status`, {
                      method: "POST",
                      body: JSON.stringify({
                        status:
                          sel.status === "ABERTA"
                            ? "EM_INVESTIGACAO"
                            : sel.status === "EM_INVESTIGACAO"
                              ? "ACOES_EM_ANDAMENTO"
                              : "CONCLUIDA",
                      }),
                    })
                      .then(() => {
                        void abrir(sel.id);
                        void load();
                      })
                      .catch((err: Error) => setErro(err.message))
                  }
                >
                  {sel.status === "ACOES_EM_ANDAMENTO" ? "Concluir ocorrência" : "Avançar etapa"}
                </Btn>
              )}

              {canCondicao && sel.equipamento && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    void api(`/qualidade/ocorrencias/${sel.id}/condicao-uso`, {
                      method: "POST",
                      body: JSON.stringify({ condicao: String(fd.get("condicao")) }),
                    }).then(() => abrir(sel.id));
                  }}
                  style={{ display: "grid", gap: 8 }}
                >
                  <FieldLabel>
                    Aplicar condição de uso no equipamento {sel.equipamento.tag} (ato explícito)
                  </FieldLabel>
                  <select name="condicao" style={fieldStyle} defaultValue={sel.equipamento.condicaoUso ?? "APTO"}>
                    {Object.entries(LABEL_CONDICAO_USO).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                  <Btn type="submit" variant="secondary">
                    Aplicar condição
                  </Btn>
                </form>
              )}

              {canEdit && ncs.length > 0 && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    void api(`/qualidade/ocorrencias/${sel.id}/nc`, {
                      method: "POST",
                      body: JSON.stringify({ naoConformidadeId: String(fd.get("naoConformidadeId")) }),
                    }).then(() => abrir(sel.id));
                  }}
                  style={{ display: "grid", gap: 8 }}
                >
                  <FieldLabel>Vincular NC existente</FieldLabel>
                  <select name="naoConformidadeId" style={fieldStyle}>
                    {ncs.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.codigo} · {n.descricao.slice(0, 60)}
                      </option>
                    ))}
                  </select>
                  <Btn type="submit" variant="secondary">
                    Vincular NC
                  </Btn>
                </form>
              )}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
