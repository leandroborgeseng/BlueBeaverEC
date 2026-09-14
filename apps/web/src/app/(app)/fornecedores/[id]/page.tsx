"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, downloadApi } from "@/lib/api";
import { filesToAnexos } from "@/lib/os-ui";
import { LABEL_STATUS_ATENDIMENTO, type StatusAtendimentoExterno } from "@aion/shared";
import {
  Badge,
  Btn,
  Empty,
  Err,
  FieldLabel,
  PageHeader,
  Panel,
  Surface,
  fieldStyle,
} from "@/components/ui/aion-ui";

interface Detalhe {
  id: string;
  nome: string;
  cnpj?: string | null;
  telefone?: string | null;
  email?: string | null;
  endereco?: string | null;
  especialidades: string[];
  observacoes?: string | null;
  contatos: Array<{ id: string; nome: string; cargo?: string | null; telefone?: string | null; email?: string | null; principal: boolean }>;
  documentos: Array<{ id: string; tipo: string; nomeArquivo: string; createdAt: string }>;
  notas: Array<{ id: string; texto: string; createdAt: string; usuario?: { nome: string } | null }>;
  fabricantes: Array<{ fabricante: { id: string; nome: string } }>;
  contratos: Array<{
    id: string;
    numero: string;
    descricao: string;
    tipo: string;
    vigenciaFim: string;
    cobrePecas: boolean;
    cobreServicos: boolean;
  }>;
  equipamentos: Array<{ id: string; tag: string; nome: string; situacao: string }>;
  historicoServicos: Array<{
    id: string;
    status: StatusAtendimentoExterno;
    custoInformado?: string | number | null;
    custoAprovado?: string | number | null;
    custoRealizado?: string | number | null;
    ordemServico: { numero: number; codigo?: string | null };
    equipamento: { tag: string; nome: string };
  }>;
}

export default function FornecedorDetalhePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [data, setData] = useState<Detalhe | null>(null);
  const [fabs, setFabs] = useState<Array<{ id: string; nome: string }>>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [fabId, setFabId] = useState("");
  const [nota, setNota] = useState("");

  async function load() {
    const [d, f] = await Promise.all([
      api<Detalhe>(`/fornecedores/${id}`),
      api<Array<{ id: string; nome: string }>>("/fabricantes"),
    ]);
    setData(d);
    setFabs(f);
  }

  useEffect(() => {
    void load().catch((e) => setErro(e instanceof Error ? e.message : "Erro"));
  }, [id]);

  async function salvarCadastro(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!data) return;
    const fd = new FormData(e.currentTarget);
    try {
      await api(`/fornecedores/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          nome: String(fd.get("nome")),
          cnpj: String(fd.get("cnpj") || "") || null,
          telefone: String(fd.get("telefone") || "") || null,
          email: String(fd.get("email") || "") || null,
          endereco: String(fd.get("endereco") || "") || null,
          especialidades: String(fd.get("especialidades") || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          observacoes: String(fd.get("observacoes") || "") || null,
        }),
      });
      await load();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro");
    }
  }

  if (erro && !data) return <Err>{erro}</Err>;
  if (!data) return <div>Carregando…</div>;

  return (
    <div>
      <PageHeader title={data.nome} subtitle="Contatos, especialidades, documentos e histórico de serviços" />
      {erro && <Err>{erro}</Err>}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 14 }}>
        <div style={{ display: "grid", gap: 14 }}>
          <Surface>
            <form onSubmit={(e) => void salvarCadastro(e)} style={{ display: "grid", gap: 8 }}>
              <FieldLabel>Nome</FieldLabel>
              <input name="nome" defaultValue={data.nome} style={fieldStyle} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <input name="cnpj" defaultValue={data.cnpj ?? ""} placeholder="CNPJ" style={fieldStyle} />
                <input name="telefone" defaultValue={data.telefone ?? ""} placeholder="Telefone" style={fieldStyle} />
              </div>
              <input name="email" defaultValue={data.email ?? ""} placeholder="E-mail" style={fieldStyle} />
              <input name="endereco" defaultValue={data.endereco ?? ""} placeholder="Endereço" style={fieldStyle} />
              <input
                name="especialidades"
                defaultValue={data.especialidades.join(", ")}
                placeholder="Especialidades"
                style={fieldStyle}
              />
              <textarea name="observacoes" defaultValue={data.observacoes ?? ""} rows={2} style={fieldStyle} />
              <Btn type="submit" size="sm">
                Salvar cadastro
              </Btn>
            </form>
          </Surface>

          <Panel title="Contatos">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                void api(`/fornecedores/${id}/contatos`, {
                  method: "POST",
                  body: JSON.stringify({
                    nome: String(fd.get("nome")),
                    cargo: String(fd.get("cargo") || "") || undefined,
                    telefone: String(fd.get("telefone") || "") || undefined,
                    email: String(fd.get("email") || "") || undefined,
                    principal: Boolean(fd.get("principal")),
                  }),
                })
                  .then(() => load())
                  .catch((err) => setErro(err instanceof Error ? err.message : "Erro"));
                e.currentTarget.reset();
              }}
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 8, marginBottom: 10 }}
            >
              <input name="nome" required placeholder="Nome" style={fieldStyle} />
              <input name="cargo" placeholder="Cargo" style={fieldStyle} />
              <input name="telefone" placeholder="Telefone" style={fieldStyle} />
              <Btn type="submit" size="sm">
                +
              </Btn>
            </form>
            {data.contatos.length === 0 ? (
              <Empty text="Sem contatos" />
            ) : (
              data.contatos.map((c) => (
                <div key={c.id} style={{ fontSize: 13, padding: "6px 0", display: "flex", justifyContent: "space-between" }}>
                  <span>
                    {c.principal ? <Badge>Principal</Badge> : null} {c.nome} {c.cargo ? `· ${c.cargo}` : ""} ·{" "}
                    {c.telefone || c.email || "—"}
                  </span>
                  <Btn
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void api(`/fornecedores/${id}/contatos/${c.id}`, { method: "DELETE" }).then(() => load())
                    }
                  >
                    Remover
                  </Btn>
                </div>
              ))
            )}
          </Panel>

          <Panel title="Notas internas">
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input value={nota} onChange={(e) => setNota(e.target.value)} style={{ ...fieldStyle, flex: 1 }} />
              <Btn
                size="sm"
                disabled={!nota.trim()}
                onClick={() =>
                  void api(`/fornecedores/${id}/notas`, {
                    method: "POST",
                    body: JSON.stringify({ texto: nota }),
                  }).then(() => {
                    setNota("");
                    return load();
                  })
                }
              >
                Registrar
              </Btn>
            </div>
            {data.notas.map((n) => (
              <div key={n.id} style={{ fontSize: 13, padding: "6px 0" }}>
                {n.texto}
                <div style={{ fontSize: 11, color: "oklch(0.5 0.02 250)" }}>
                  {n.usuario?.nome} · {new Date(n.createdAt).toLocaleString("pt-BR")}
                </div>
              </div>
            ))}
          </Panel>
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          <Panel title="Fabricantes vinculados">
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <select value={fabId} onChange={(e) => setFabId(e.target.value)} style={{ ...fieldStyle, flex: 1 }}>
                <option value="">Fabricante…</option>
                {fabs.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </select>
              <Btn
                size="sm"
                disabled={!fabId}
                onClick={() =>
                  void api(`/fornecedores/${id}/fabricantes`, {
                    method: "POST",
                    body: JSON.stringify({ fabricanteId: fabId }),
                  }).then(() => load())
                }
              >
                Vincular
              </Btn>
            </div>
            {data.fabricantes.map((l) => (
              <div key={l.fabricante.id} style={{ fontSize: 13, padding: "4px 0" }}>
                {l.fabricante.nome}
              </div>
            ))}
          </Panel>

          <Panel title="Documentos">
            <input
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => {
                const input = e.currentTarget;
                void filesToAnexos(input.files).then((anexos) => {
                  const a = anexos[0];
                  if (!a) return;
                  return api(`/fornecedores/${id}/documentos`, {
                    method: "POST",
                    body: JSON.stringify({ dataUrl: a.dataUrl, nomeArquivo: a.nomeArquivo }),
                  }).then(() => load());
                });
              }}
            />
            {data.documentos.map((d) => (
              <div key={d.id} style={{ fontSize: 13, padding: "4px 0" }}>
                <button
                  type="button"
                  style={{ background: "none", border: "none", cursor: "pointer", color: "oklch(0.4 0.12 250)" }}
                  onClick={() => void downloadApi(`/fornecedores/${id}/documentos/${d.id}`, undefined, d.nomeArquivo)}
                >
                  {d.nomeArquivo}
                </button>
              </div>
            ))}
          </Panel>

          <Panel title="Contratos de manutenção">
            <p style={{ fontSize: 12, color: "oklch(0.5 0.02 250)" }}>
              Garantia de aquisição fica no equipamento, não aqui.
            </p>
            {data.contratos.length === 0 ? (
              <Empty text="Sem contratos" />
            ) : (
              data.contratos.map((c) => (
                <div key={c.id} style={{ fontSize: 13, padding: "6px 0" }}>
                  <Link href="/contratos">{c.numero}</Link> · {c.tipo} · peças {c.cobrePecas ? "sim" : "não"} / serviços{" "}
                  {c.cobreServicos ? "sim" : "não"}
                </div>
              ))
            )}
          </Panel>

          <Panel title="Equipamentos">
            {data.equipamentos.map((e) => (
              <div key={e.id} style={{ fontSize: 13, padding: "4px 0" }}>
                <Link href={`/equipamentos/${encodeURIComponent(e.tag)}`}>{e.tag}</Link> · {e.nome}
              </div>
            ))}
          </Panel>

          <Panel title="Histórico de serviços">
            {data.historicoServicos.length === 0 ? (
              <Empty text="Nenhum encaminhamento" />
            ) : (
              data.historicoServicos.map((h) => (
                <div key={h.id} style={{ fontSize: 13, padding: "6px 0" }}>
                  <Badge>{LABEL_STATUS_ATENDIMENTO[h.status] ?? h.status}</Badge> OS{" "}
                  {h.ordemServico.codigo ?? h.ordemServico.numero} · {h.equipamento.tag}
                  <div style={{ fontSize: 11 }}>
                    inf. {h.custoInformado ?? "—"} · apr. {h.custoAprovado ?? "—"} · real. {h.custoRealizado ?? "—"}
                  </div>
                </div>
              ))
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
