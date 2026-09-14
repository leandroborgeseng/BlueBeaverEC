"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  AVISO_NAO_CONFORMIDADE_REGULATORIA,
  LABEL_CATEGORIA_DOCUMENTO,
  LABEL_ORIGEM_DOCUMENTO,
  LABEL_STATUS_DOCUMENTO,
  LABEL_VINCULO_DOCUMENTO,
  PERMISSAO_NIVEL,
  versaoVigente,
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

type Doc = {
  id: string;
  codigo: string;
  titulo: string;
  categoria: keyof typeof LABEL_CATEGORIA_DOCUMENTO;
  origem: keyof typeof LABEL_ORIGEM_DOCUMENTO;
  pop?: { id: string; codigo: string; titulo: string } | null;
  versoes: Array<{
    id: string;
    versao: string;
    status: keyof typeof LABEL_STATUS_DOCUMENTO;
    dataRevisao?: string | null;
    proximaRevisao?: string | null;
    publicadoEm?: string | null;
    observacao?: string | null;
    arquivo?: { id: string; nomeArquivo: string } | null;
    createdBy?: { nome: string; email: string } | null;
    publicadoPor?: { nome: string; email: string } | null;
  }>;
  vinculos: Array<{
    id: string;
    tipo: keyof typeof LABEL_VINCULO_DOCUMENTO;
    tipoIntervencao?: string | null;
    equipamento?: { tag: string; nome: string } | null;
    modelo?: { nome: string } | null;
    setor?: { nome: string } | null;
  }>;
};

type Pop = { id: string; codigo: string; titulo: string };
type Opt = { id: string; nome: string; tag?: string };

export default function DocumentosPage() {
  const canEdit = useCan("auditorias", PERMISSAO_NIVEL.EDICAO);
  const [items, setItems] = useState<Doc[]>([]);
  const [sel, setSel] = useState<Doc | null>(null);
  const [pops, setPops] = useState<Pop[]>([]);
  const [setores, setSetores] = useState<Opt[]>([]);
  const [equips, setEquips] = useState<Opt[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  async function load() {
    const [docs, popList, s, e] = await Promise.all([
      api<Doc[]>("/qualidade/documentos"),
      api<Pop[]>("/qualidade/pops").catch(() => []),
      api<Opt[]>("/setores"),
      api<{ items: Opt[] }>("/equipamentos?pageSize=50"),
    ]);
    setItems(docs);
    setPops(popList);
    setSetores(s);
    setEquips(e.items ?? []);
    if (sel) setSel(docs.find((d) => d.id === sel.id) ?? docs[0] ?? null);
  }

  useEffect(() => {
    void load().catch((e) => setErro(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function criar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await api("/qualidade/documentos", {
      method: "POST",
      body: JSON.stringify({
        titulo: String(fd.get("titulo")),
        categoria: String(fd.get("categoria")),
        popId: String(fd.get("popId") || "") || undefined,
        versao: String(fd.get("versao") || "") || undefined,
        dataRevisao: String(fd.get("dataRevisao") || "") || undefined,
        proximaRevisao: String(fd.get("proximaRevisao") || "") || undefined,
        observacao: String(fd.get("observacao") || "") || undefined,
        ...(file ? { dataUrl: await fileToDataUrl(file), nomeArquivo: file.name } : {}),
      }),
    });
    e.currentTarget.reset();
    setFile(null);
    await load();
  }

  async function novaVersao(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!sel) return;
    const fd = new FormData(e.currentTarget);
    const f = fd.get("arquivo") as File | null;
    await api(`/qualidade/documentos/${sel.id}/versoes`, {
      method: "POST",
      body: JSON.stringify({
        versao: String(fd.get("versao")),
        observacao: String(fd.get("observacao") || "") || undefined,
        dataRevisao: String(fd.get("dataRevisao") || "") || undefined,
        proximaRevisao: String(fd.get("proximaRevisao") || "") || undefined,
        ...(f && f.size ? { dataUrl: await fileToDataUrl(f), nomeArquivo: f.name } : {}),
      }),
    });
    e.currentTarget.reset();
    await abrir(sel.id);
  }

  async function abrir(id: string) {
    const d = await api<Doc>(`/qualidade/documentos/${id}`);
    setSel(d);
    setItems((prev) => prev.map((x) => (x.id === d.id ? d : x)));
  }

  async function baixar(arquivoId: string, nome: string) {
    const blob = await fetchBlob(`/qualidade/arquivos/${arquivoId}`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <PageHeader
        title="Documentos controlados"
        subtitle={`${AVISO_NAO_CONFORMIDADE_REGULATORIA} Manual do fabricante permanece no equipamento e não vira procedimento institucional.`}
      />
      <QualidadeTabs />
      {erro && <Err>{erro}</Err>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 14 }}>
        <Panel title="Lista">
          {canEdit && (
            <form onSubmit={(e) => void criar(e)} style={{ display: "grid", gap: 8, marginBottom: 14 }}>
              <input name="titulo" required placeholder="Título" style={fieldStyle} />
              <select name="categoria" style={fieldStyle} defaultValue="PROCEDIMENTO">
                {Object.entries(LABEL_CATEGORIA_DOCUMENTO).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <select name="popId" style={fieldStyle} defaultValue="">
                <option value="">Sem vínculo a POP (arquivo próprio)</option>
                {pops.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.codigo} · {p.titulo}
                  </option>
                ))}
              </select>
              <input name="versao" placeholder="Versão inicial (1.0)" style={fieldStyle} />
              <FieldLabel>Arquivo (opcional — não use o manual do fabricante)</FieldLabel>
              <input type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <Btn type="submit">Criar rascunho</Btn>
            </form>
          )}
          {items.length === 0 && <Empty text="Nenhum documento controlado." />}
          {items.map((d) => {
            const vig = versaoVigente(d.versoes);
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => void abrir(d.id)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  border: "none",
                  borderTop: "1px solid oklch(0.93 0.005 255)",
                  background: sel?.id === d.id ? "oklch(0.96 0.02 255)" : "transparent",
                  padding: "10px 0",
                  cursor: "pointer",
                }}
              >
                <strong>{d.codigo}</strong> · {d.titulo}
                <div style={{ fontSize: 12, marginTop: 4 }}>
                  <Badge tone={vig?.status ?? "RASCUNHO"}>
                    {vig ? `Vigente ${vig.versao}` : "Sem versão vigente"}
                  </Badge>
                </div>
              </button>
            );
          })}
        </Panel>

        <Panel title={sel ? `${sel.codigo} · histórico` : "Detalhe"}>
          {!sel && <Empty text="Selecione um documento para ver o vigente e o histórico." />}
          {sel && (
            <div style={{ display: "grid", gap: 12 }}>
              <div>
                {LABEL_CATEGORIA_DOCUMENTO[sel.categoria]} · {LABEL_ORIGEM_DOCUMENTO[sel.origem]}
                {sel.pop && (
                  <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)" }}>
                    Material vinculado ao POP {sel.pop.codigo} (sem duplicar arquivo)
                  </div>
                )}
              </div>
              {sel.versoes.map((v) => (
                <div key={v.id} style={{ borderTop: "1px solid oklch(0.93 0.005 255)", paddingTop: 10 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <strong>v{v.versao}</strong>
                    <Badge tone={v.status}>{LABEL_STATUS_DOCUMENTO[v.status]}</Badge>
                    {v.arquivo && (
                      <Btn variant="secondary" onClick={() => void baixar(v.arquivo!.id, v.arquivo!.nomeArquivo)}>
                        {v.arquivo.nomeArquivo}
                      </Btn>
                    )}
                    {canEdit && v.status === "RASCUNHO" && (
                      <Btn
                        onClick={() =>
                          void api(`/qualidade/documentos/${sel.id}/versoes/${v.id}/publicar`, { method: "POST" }).then(() =>
                            abrir(sel.id),
                          )
                        }
                      >
                        Publicar vigente
                      </Btn>
                    )}
                    {canEdit && v.status === "VIGENTE" && (
                      <Btn
                        variant="secondary"
                        onClick={() =>
                          void api(`/qualidade/documentos/${sel.id}/versoes/${v.id}/obsoletar`, { method: "POST" }).then(() =>
                            abrir(sel.id),
                          )
                        }
                      >
                        Tornar obsoleto
                      </Btn>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)", marginTop: 4 }}>
                    Revisão {fmtData(v.dataRevisao)} · próxima {fmtData(v.proximaRevisao)}
                    {v.publicadoPor && ` · publicado por ${v.publicadoPor.nome} em ${fmtData(v.publicadoEm)}`}
                    {v.createdBy && ` · autor ${v.createdBy.nome}`}
                  </div>
                </div>
              ))}

              {canEdit && (
                <form onSubmit={(e) => void novaVersao(e)} style={{ display: "grid", gap: 8 }}>
                  <FieldLabel>Nova versão (rascunho)</FieldLabel>
                  <input name="versao" required placeholder="1.1" style={fieldStyle} />
                  <input type="file" name="arquivo" accept="application/pdf,image/*" />
                  <Btn type="submit" variant="secondary">
                    Registrar versão
                  </Btn>
                </form>
              )}

              <div>
                <FieldLabel>Vínculos (equipamento / modelo / intervenção / setor)</FieldLabel>
                {sel.vinculos.map((v) => (
                  <div key={v.id} style={{ fontSize: 13, marginTop: 4 }}>
                    {LABEL_VINCULO_DOCUMENTO[v.tipo]} ·{" "}
                    {v.equipamento?.tag ?? v.modelo?.nome ?? v.setor?.nome ?? v.tipoIntervencao}
                    {canEdit && (
                      <Btn
                        variant="secondary"
                        onClick={() =>
                          void api(`/qualidade/documentos/${sel.id}/vinculos/${v.id}`, { method: "DELETE" }).then(() =>
                            abrir(sel.id),
                          )
                        }
                      >
                        Remover
                      </Btn>
                    )}
                  </div>
                ))}
                {canEdit && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const fd = new FormData(e.currentTarget);
                      void api(`/qualidade/documentos/${sel.id}/vinculos`, {
                        method: "POST",
                        body: JSON.stringify({
                          tipo: String(fd.get("tipo")),
                          equipamentoId: String(fd.get("equipamentoId") || "") || undefined,
                          setorId: String(fd.get("setorId") || "") || undefined,
                          tipoIntervencao: String(fd.get("tipoIntervencao") || "") || undefined,
                        }),
                      }).then(() => abrir(sel.id));
                    }}
                    style={{ display: "grid", gap: 8, marginTop: 8 }}
                  >
                    <select name="tipo" defaultValue="EQUIPAMENTO" style={fieldStyle}>
                      {Object.entries(LABEL_VINCULO_DOCUMENTO).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
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
                    <input name="tipoIntervencao" placeholder="Intervenção (PREVENTIVA, TSE…)" style={fieldStyle} />
                    <Btn type="submit" variant="secondary">
                      Vincular
                    </Btn>
                  </form>
                )}
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
