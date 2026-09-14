"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import {
  Btn,
  DataTable,
  Empty,
  Err,
  FieldLabel,
  FilterBar,
  Loading,
  PageHeader,
  Surface,
  fieldStyle,
  td,
  th,
} from "@/components/ui/aion-ui";

interface Fornecedor {
  id: string;
  nome: string;
  cnpj?: string | null;
  telefone?: string | null;
  email?: string | null;
  especialidades?: string[];
  _count?: { contratos: number; equipamentos: number; atendimentos: number; contatos: number };
}

export default function FornecedoresPage() {
  const [items, setItems] = useState<Fornecedor[]>([]);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setItems(await api<Fornecedor[]>(`/fornecedores${q ? `?q=${encodeURIComponent(q)}` : ""}`));
      setMsg(null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items.filter(
      (f) =>
        f.nome.toLowerCase().includes(term) ||
        (f.cnpj ?? "").includes(term) ||
        (f.especialidades ?? []).some((s) => s.toLowerCase().includes(term)),
    );
  }, [items, q]);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const especialidades = String(fd.get("especialidades") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      await api("/fornecedores", {
        method: "POST",
        body: JSON.stringify({
          nome: String(fd.get("nome")),
          cnpj: String(fd.get("cnpj") || "") || undefined,
          telefone: String(fd.get("telefone") || "") || undefined,
          email: String(fd.get("email") || "") || undefined,
          endereco: String(fd.get("endereco") || "") || undefined,
          especialidades,
          observacoes: String(fd.get("observacoes") || "") || undefined,
        }),
      });
      e.currentTarget.reset();
      setShow(false);
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erro");
    }
  }

  return (
    <div>
      <PageHeader
        title="Fornecedores"
        subtitle="Quem atende, especialidades, contratos e histórico de serviços"
        actions={
          <Btn type="button" onClick={() => setShow((v) => !v)}>
            {show ? "Fechar" : "Novo fornecedor"}
          </Btn>
        }
      />
      {msg && <Err>{msg}</Err>}
      <FilterBar>
        <div>
          <FieldLabel htmlFor="forn-q">Busca</FieldLabel>
          <input
            id="forn-q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nome, CNPJ, especialidade"
            style={fieldStyle}
          />
        </div>
        <Btn type="button" variant="secondary" onClick={() => void load()}>
          Atualizar
        </Btn>
      </FilterBar>

      {show && (
        <Surface style={{ marginBottom: 16 }}>
          <form onSubmit={(e) => void onCreate(e)} style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10 }}>
              <div>
                <FieldLabel>Nome</FieldLabel>
                <input name="nome" required style={fieldStyle} />
              </div>
              <div>
                <FieldLabel>CNPJ</FieldLabel>
                <input name="cnpj" style={fieldStyle} />
              </div>
              <div>
                <FieldLabel>Telefone</FieldLabel>
                <input name="telefone" style={fieldStyle} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <div>
                <FieldLabel>E-mail</FieldLabel>
                <input name="email" type="email" style={fieldStyle} />
              </div>
              <div>
                <FieldLabel>Endereço</FieldLabel>
                <input name="endereco" style={fieldStyle} />
              </div>
              <div>
                <FieldLabel>Especialidades</FieldLabel>
                <input name="especialidades" placeholder="ventilação, infusão" style={fieldStyle} />
              </div>
            </div>
            <input name="observacoes" placeholder="Observações internas" style={fieldStyle} />
            <Btn type="submit">Salvar</Btn>
          </form>
        </Surface>
      )}

      {loading ? (
        <Loading />
      ) : (
        <DataTable>
          <thead>
            <tr>
              <th style={th}>Fornecedor</th>
              <th style={th}>Contato</th>
              <th style={th}>Especialidades</th>
              <th style={th}>Vínculos</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((f) => (
              <tr key={f.id}>
                <td style={td}>
                  <Link href={`/fornecedores/${f.id}`} style={{ fontWeight: 700 }}>
                    {f.nome}
                  </Link>
                  <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)" }}>{f.cnpj || "—"}</div>
                </td>
                <td style={td}>
                  {f.telefone || "—"}
                  <div style={{ fontSize: 12 }}>{f.email || ""}</div>
                </td>
                <td style={td}>{(f.especialidades ?? []).join(", ") || "—"}</td>
                <td style={td}>
                  {f._count?.contratos ?? 0} contratos · {f._count?.equipamentos ?? 0} eq. ·{" "}
                  {f._count?.atendimentos ?? 0} serviços
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
      {!loading && filtered.length === 0 && <Empty text="Nenhum fornecedor." />}
    </div>
  );
}
