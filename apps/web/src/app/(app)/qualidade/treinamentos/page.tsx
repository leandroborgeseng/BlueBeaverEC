"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  AVISO_NAO_CONFORMIDADE_REGULATORIA,
  LABEL_TIPO_TREINAMENTO,
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

type Treino = {
  id: string;
  codigo: string;
  tema: string;
  tipo: keyof typeof LABEL_TIPO_TREINAMENTO;
  instrutorNome: string;
  data: string;
  publico?: string | null;
  presencaConfereCompetencia?: boolean;
  documento?: { codigo: string; titulo: string } | null;
  pop?: { codigo: string; titulo: string } | null;
  createdBy?: { nome: string; email: string } | null;
  equipamentos: Array<{ id: string; equipamento: { tag: string; nome: string } }>;
  participantes: Array<{ id: string; presente: boolean; colaborador: { nome: string; matricula: string } }>;
  evidencias: Array<{ id: string; arquivo: { id: string; nomeArquivo: string } }>;
};

type Opt = { id: string; nome: string; tag?: string; matricula?: string };
type DocOpt = { id: string; codigo: string; titulo: string };
type Pop = { id: string; codigo: string; titulo: string };

export default function TreinamentosPage() {
  const canEdit = useCan("auditorias", PERMISSAO_NIVEL.EDICAO);
  const [items, setItems] = useState<Treino[]>([]);
  const [sel, setSel] = useState<Treino | null>(null);
  const [colabs, setColabs] = useState<Opt[]>([]);
  const [equips, setEquips] = useState<Opt[]>([]);
  const [docs, setDocs] = useState<DocOpt[]>([]);
  const [pops, setPops] = useState<Pop[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  async function load() {
    const [list, c, e, d, p] = await Promise.all([
      api<Treino[]>("/qualidade/treinamentos"),
      api<Opt[]>("/cadastros/colaboradores"),
      api<{ items: Opt[] }>("/equipamentos?pageSize=50"),
      api<DocOpt[]>("/qualidade/documentos"),
      api<Pop[]>("/qualidade/pops").catch(() => []),
    ]);
    setItems(list);
    setColabs(c);
    setEquips(e.items ?? []);
    setDocs(d);
    setPops(p);
    if (sel) {
      const fresh = await api<Treino>(`/qualidade/treinamentos/${sel.id}`);
      setSel(fresh);
    }
  }

  useEffect(() => {
    void load().catch((e) => setErro(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function criar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const ids = fd.getAll("colaboradorIds").map(String);
    const eqIds = fd.getAll("equipamentoIds").map(String);
    const f = fd.get("arquivo") as File | null;
    await api("/qualidade/treinamentos", {
      method: "POST",
      body: JSON.stringify({
        tema: String(fd.get("tema")),
        tipo: String(fd.get("tipo")),
        instrutorNome: String(fd.get("instrutorNome")),
        data: String(fd.get("data")),
        publico: String(fd.get("publico") || "") || undefined,
        documentoId: String(fd.get("documentoId") || "") || undefined,
        popId: String(fd.get("popId") || "") || undefined,
        colaboradorIds: ids,
        equipamentoIds: eqIds,
        ...(f && f.size ? { dataUrl: await fileToDataUrl(f), nomeArquivo: f.name } : {}),
      }),
    });
    e.currentTarget.reset();
    await load();
  }

  async function abrir(id: string) {
    setSel(await api<Treino>(`/qualidade/treinamentos/${id}`));
  }

  return (
    <div>
      <PageHeader
        title="Treinamentos"
        subtitle={`${AVISO_NAO_CONFORMIDADE_REGULATORIA} Presença não atesta competência — competências ficam em Colaboradores.`}
      />
      <QualidadeTabs />
      {erro && <Err>{erro}</Err>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.15fr", gap: 14 }}>
        <Panel title="Eventos">
          {canEdit && (
            <form onSubmit={(e) => void criar(e)} style={{ display: "grid", gap: 8, marginBottom: 14 }}>
              <input name="tema" required placeholder="Tema" style={fieldStyle} />
              <select name="tipo" style={fieldStyle} defaultValue="INICIAL">
                {Object.entries(LABEL_TIPO_TREINAMENTO).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <input name="instrutorNome" required placeholder="Instrutor" style={fieldStyle} />
              <input name="data" type="date" required style={fieldStyle} />
              <input name="publico" placeholder="Público (setor, função…)" style={fieldStyle} />
              <select name="documentoId" style={fieldStyle} defaultValue="">
                <option value="">Material: documento controlado</option>
                {docs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.codigo} · {d.titulo}
                  </option>
                ))}
              </select>
              <select name="popId" style={fieldStyle} defaultValue="">
                <option value="">ou POP da biblioteca (não duplicar)</option>
                {pops.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.codigo}
                  </option>
                ))}
              </select>
              <FieldLabel>Participantes</FieldLabel>
              <select name="colaboradorIds" multiple size={4} style={fieldStyle}>
                {colabs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome} ({c.matricula})
                  </option>
                ))}
              </select>
              <FieldLabel>Equipamentos</FieldLabel>
              <select name="equipamentoIds" multiple size={3} style={fieldStyle}>
                {equips.map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {eq.tag} · {eq.nome}
                  </option>
                ))}
              </select>
              <input type="file" name="arquivo" accept="application/pdf,image/*" />
              <Btn type="submit">Registrar treinamento</Btn>
            </form>
          )}
          {items.length === 0 && <Empty text="Nenhum treinamento registrado." />}
          {items.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => void abrir(t.id)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                border: "none",
                borderTop: "1px solid oklch(0.93 0.005 255)",
                background: sel?.id === t.id ? "oklch(0.96 0.02 255)" : "transparent",
                padding: "10px 0",
                cursor: "pointer",
              }}
            >
              <strong>{t.codigo}</strong> · {t.tema}
              <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)" }}>
                {LABEL_TIPO_TREINAMENTO[t.tipo]} · {fmtData(t.data)} · {t.participantes.filter((p) => p.presente).length}/
                {t.participantes.length} presentes
              </div>
            </button>
          ))}
        </Panel>

        <Panel title={sel ? sel.tema : "Presença e evidências"}>
          {!sel && <Empty text="Selecione um treinamento para comprovar presença." />}
          {sel && (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ fontSize: 13 }}>
                {sel.codigo} · {sel.instrutorNome} · {fmtData(sel.data)}
                {sel.createdBy && ` · registrado por ${sel.createdBy.nome}`}
              </div>
              <Badge>Presença ≠ competência</Badge>
              {(sel.documento || sel.pop) && (
                <div style={{ fontSize: 12 }}>
                  Material vinculado: {sel.documento ? `${sel.documento.codigo} ${sel.documento.titulo}` : sel.pop?.codigo}
                </div>
              )}
              <div>
                <FieldLabel>Participantes</FieldLabel>
                {sel.participantes.map((p) => (
                  <label key={p.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginTop: 4 }}>
                    <input
                      type="checkbox"
                      checked={p.presente}
                      disabled={!canEdit}
                      onChange={(e) =>
                        void api(`/qualidade/treinamentos/${sel.id}/participantes/${p.id}`, {
                          method: "PATCH",
                          body: JSON.stringify({ presente: e.target.checked }),
                        }).then(() => abrir(sel.id))
                      }
                    />
                    {p.colaborador.nome} ({p.colaborador.matricula}) {p.presente ? "· presente" : "· ausente"}
                  </label>
                ))}
              </div>
              <div>
                <FieldLabel>Equipamentos</FieldLabel>
                {sel.equipamentos.map((e) => (
                  <div key={e.id} style={{ fontSize: 13 }}>
                    {e.equipamento.tag} · {e.equipamento.nome}
                  </div>
                ))}
              </div>
              <div>
                <FieldLabel>Evidências (vincular arquivo existente ou enviar uma vez)</FieldLabel>
                {sel.evidencias.map((ev) => (
                  <Btn
                    key={ev.id}
                    variant="secondary"
                    onClick={() =>
                      void fetchBlob(`/qualidade/arquivos/${ev.arquivo.id}`).then((blob) => {
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = ev.arquivo.nomeArquivo;
                        a.click();
                        URL.revokeObjectURL(url);
                      })
                    }
                  >
                    {ev.arquivo.nomeArquivo}
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
                          api(`/qualidade/treinamentos/${sel.id}/evidencias`, {
                            method: "POST",
                            body: JSON.stringify({ dataUrl, nomeArquivo: f.name }),
                          }),
                        )
                        .then(() => abrir(sel.id));
                    }}
                  />
                )}
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
