"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  Badge,
  Btn,
  DataTable,
  Empty,
  Err,
  FieldLabel,
  PageHeader,
  Surface,
  fieldStyle,
  td,
  th,
} from "@/components/ui/nexo-ui";

interface Named {
  id: string;
  nome: string;
}

interface Modelo extends Named {
  fabricanteId: string;
  fabricante: { id: string; nome: string };
}

interface Plano extends Named {
  criticidade: string;
  vidaUtilAnos: number;
}

export default function CadastrosPage() {
  const [fabricantes, setFabricantes] = useState<Named[]>([]);
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [setores, setSetores] = useState<Named[]>([]);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [fornecedores, setFornecedores] = useState<Named[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [tab, setTab] = useState<"fabricantes" | "modelos" | "setores" | "planos" | "fornecedores">(
    "fabricantes",
  );

  async function reload() {
    const [f, m, s, p, fo] = await Promise.all([
      api<Named[]>("/fabricantes"),
      api<Modelo[]>("/modelos"),
      api<Named[]>("/setores"),
      api<Plano[]>("/planos-descricao"),
      api<Named[]>("/fornecedores"),
    ]);
    setFabricantes(f);
    setModelos(m);
    setSetores(s);
    setPlanos(p);
    setFornecedores(fo);
  }

  useEffect(() => {
    void reload().catch((e) => setMsg(e.message));
  }, []);

  async function createNamed(path: string, body: Record<string, unknown>, e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const payload: Record<string, unknown> = { ...body };
    fd.forEach((v, k) => {
      if (k === "vidaUtilAnos") payload[k] = Number(v);
      else payload[k] = String(v);
    });
    try {
      await api(path, { method: "POST", body: JSON.stringify(payload) });
      form.reset();
      setMsg("Salvo com sucesso");
      await reload();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erro");
    }
  }

  const tabs = [
    { key: "fabricantes" as const, label: "Fabricantes", count: fabricantes.length },
    { key: "modelos" as const, label: "Modelos", count: modelos.length },
    { key: "setores" as const, label: "Setores", count: setores.length },
    { key: "planos" as const, label: "Plano de Descrições", count: planos.length },
    { key: "fornecedores" as const, label: "Fornecedores", count: fornecedores.length },
  ];

  return (
    <div>
      <PageHeader
        title="Cadastros Básicos"
        subtitle="Fabricantes, modelos, setores, planos de descrição e fornecedores"
      />
      {msg &&
        (msg.toLowerCase().includes("erro") || msg.toLowerCase().includes("fail") ? (
          <Err>{msg}</Err>
        ) : (
          <div
            style={{
              marginBottom: 12,
              padding: "10px 12px",
              borderRadius: 10,
              background: "oklch(0.96 0.03 150)",
              color: "oklch(0.4 0.12 150)",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {msg}
          </div>
        ))}

      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {tabs.map((t) => (
          <Btn key={t.key} variant={tab === t.key ? "primary" : "ghost"} onClick={() => setTab(t.key)}>
            {t.label} ({t.count})
          </Btn>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 14 }}>
        <Surface>
          {tab === "fabricantes" && (
            <form onSubmit={(e) => void createNamed("/fabricantes", {}, e)}>
              <FieldLabel>Nome</FieldLabel>
              <input name="nome" placeholder="Fabricante" style={{ ...fieldStyle, marginBottom: 10 }} required />
              <Btn type="submit">Adicionar fabricante</Btn>
            </form>
          )}
          {tab === "modelos" && (
            <form onSubmit={(e) => void createNamed("/modelos", {}, e)}>
              <FieldLabel>Fabricante</FieldLabel>
              <select name="fabricanteId" style={{ ...fieldStyle, marginBottom: 10 }} required defaultValue="">
                <option value="" disabled>
                  Selecione
                </option>
                {fabricantes.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </select>
              <FieldLabel>Modelo</FieldLabel>
              <input name="nome" placeholder="Modelo" style={{ ...fieldStyle, marginBottom: 10 }} required />
              <Btn type="submit">Adicionar modelo</Btn>
            </form>
          )}
          {tab === "setores" && (
            <form onSubmit={(e) => void createNamed("/setores", {}, e)}>
              <FieldLabel>Setor</FieldLabel>
              <input name="nome" placeholder="UTI Adulto…" style={{ ...fieldStyle, marginBottom: 10 }} required />
              <Btn type="submit">Adicionar setor</Btn>
            </form>
          )}
          {tab === "planos" && (
            <form onSubmit={(e) => void createNamed("/planos-descricao", {}, e)}>
              <FieldLabel>Tipo do ativo</FieldLabel>
              <input name="nome" placeholder="Ventilador Pulmonar" style={{ ...fieldStyle, marginBottom: 10 }} required />
              <FieldLabel>Criticidade</FieldLabel>
              <select name="criticidade" style={{ ...fieldStyle, marginBottom: 10 }} defaultValue="MEDIA">
                <option value="BAIXA">Baixa</option>
                <option value="MEDIA">Média</option>
                <option value="ALTA">Alta</option>
              </select>
              <FieldLabel>Vida útil (anos)</FieldLabel>
              <input name="vidaUtilAnos" type="number" min={1} defaultValue={10} style={{ ...fieldStyle, marginBottom: 10 }} />
              <Btn type="submit">Adicionar plano</Btn>
            </form>
          )}
          {tab === "fornecedores" && (
            <form onSubmit={(e) => void createNamed("/fornecedores", {}, e)}>
              <FieldLabel>Nome</FieldLabel>
              <input name="nome" placeholder="Razão social" style={{ ...fieldStyle, marginBottom: 10 }} required />
              <FieldLabel>CNPJ</FieldLabel>
              <input name="cnpj" placeholder="00.000.000/0000-00" style={{ ...fieldStyle, marginBottom: 10 }} />
              <Btn type="submit">Adicionar fornecedor</Btn>
            </form>
          )}
        </Surface>

        {tab === "fabricantes" && (
          <NamedTable items={fabricantes.map((x) => ({ title: x.nome }))} cols={["Nome"]} />
        )}
        {tab === "modelos" && (
          <NamedTable
            items={modelos.map((m) => ({ title: m.nome, meta: m.fabricante.nome }))}
            cols={["Modelo", "Fabricante"]}
          />
        )}
        {tab === "setores" && (
          <NamedTable items={setores.map((x) => ({ title: x.nome }))} cols={["Setor"]} />
        )}
        {tab === "planos" && (
          <NamedTable
            items={planos.map((p) => ({
              title: p.nome,
              meta: `${p.vidaUtilAnos} anos`,
              badge: p.criticidade,
            }))}
            cols={["Tipo", "Vida útil", "Criticidade"]}
          />
        )}
        {tab === "fornecedores" && (
          <NamedTable items={fornecedores.map((x) => ({ title: x.nome }))} cols={["Fornecedor"]} />
        )}
      </div>
    </div>
  );
}

function NamedTable({
  items,
  cols,
}: {
  items: Array<{ title: string; meta?: string; badge?: string }>;
  cols: string[];
}) {
  if (items.length === 0) return <Empty text="Nenhum registro neste cadastro." />;
  return (
    <DataTable>
      <thead>
        <tr>
          {cols.map((c) => (
            <th key={c} style={th}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={`${item.title}-${item.meta ?? ""}`}>
            <td style={td}><strong>{item.title}</strong></td>
            {item.meta != null && <td style={td}>{item.meta}</td>}
            {item.badge != null && (
              <td style={td}><Badge tone={item.badge}>{item.badge}</Badge></td>
            )}
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}
