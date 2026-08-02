"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";

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

const box: React.CSSProperties = {
  background: "var(--nexo-surface)",
  border: "1px solid var(--nexo-border)",
  borderRadius: 12,
  padding: 16,
};

const input: React.CSSProperties = {
  width: "100%",
  border: "1px solid var(--nexo-border)",
  borderRadius: 10,
  padding: "10px 12px",
  marginBottom: 8,
};

const btn: React.CSSProperties = {
  border: "none",
  borderRadius: 10,
  padding: "10px 14px",
  background: "var(--nexo-primary)",
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
};

export default function CadastrosPage() {
  const [fabricantes, setFabricantes] = useState<Named[]>([]);
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [setores, setSetores] = useState<Named[]>([]);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [fornecedores, setFornecedores] = useState<Named[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

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
    const fd = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = { ...body };
    fd.forEach((v, k) => {
      payload[k] = String(v);
    });
    try {
      await api(path, { method: "POST", body: JSON.stringify(payload) });
      e.currentTarget.reset();
      setMsg("Salvo");
      await reload();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erro");
    }
  }

  return (
    <div>
      <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 800 }}>Cadastros base</h1>
      <p style={{ margin: "0 0 16px", color: "var(--nexo-muted)", fontSize: 13 }}>
        Fabricantes, modelos, setores, planos de descrição e fornecedores
      </p>
      {msg && <div style={{ marginBottom: 12, color: "var(--nexo-brand)" }}>{msg}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 14 }}>
        <section style={box}>
          <h2 style={{ marginTop: 0, fontSize: 15 }}>Fabricantes</h2>
          <form onSubmit={(e) => void createNamed("/fabricantes", {}, e)}>
            <input name="nome" placeholder="Nome" style={input} required />
            <button type="submit" style={btn}>
              Adicionar
            </button>
          </form>
          <List items={fabricantes.map((x) => x.nome)} />
        </section>

        <section style={box}>
          <h2 style={{ marginTop: 0, fontSize: 15 }}>Modelos</h2>
          <form onSubmit={(e) => void createNamed("/modelos", {}, e)}>
            <select name="fabricanteId" style={input} required defaultValue="">
              <option value="" disabled>
                Fabricante
              </option>
              {fabricantes.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
            <input name="nome" placeholder="Modelo" style={input} required />
            <button type="submit" style={btn}>
              Adicionar
            </button>
          </form>
          <List items={modelos.map((m) => `${m.fabricante.nome} / ${m.nome}`)} />
        </section>

        <section style={box}>
          <h2 style={{ marginTop: 0, fontSize: 15 }}>Setores</h2>
          <form onSubmit={(e) => void createNamed("/setores", {}, e)}>
            <input name="nome" placeholder="Setor" style={input} required />
            <button type="submit" style={btn}>
              Adicionar
            </button>
          </form>
          <List items={setores.map((x) => x.nome)} />
        </section>

        <section style={box}>
          <h2 style={{ marginTop: 0, fontSize: 15 }}>Plano de Descrições</h2>
          <form onSubmit={(e) => void createNamed("/planos-descricao", {}, e)}>
            <input name="nome" placeholder="Tipo do ativo" style={input} required />
            <select name="criticidade" style={input} defaultValue="MEDIA">
              <option value="BAIXA">Baixa</option>
              <option value="MEDIA">Média</option>
              <option value="ALTA">Alta</option>
            </select>
            <input name="vidaUtilAnos" type="number" min={1} defaultValue={10} style={input} />
            <button type="submit" style={btn}>
              Adicionar
            </button>
          </form>
          <List
            items={planos.map((p) => `${p.nome} · ${p.criticidade} · ${p.vidaUtilAnos} anos`)}
          />
        </section>

        <section style={{ ...box, gridColumn: "1 / -1" }}>
          <h2 style={{ marginTop: 0, fontSize: 15 }}>Fornecedores</h2>
          <form
            onSubmit={(e) => void createNamed("/fornecedores", {}, e)}
            style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: 8 }}
          >
            <input name="nome" placeholder="Nome" style={{ ...input, marginBottom: 0 }} required />
            <input name="cnpj" placeholder="CNPJ" style={{ ...input, marginBottom: 0 }} />
            <button type="submit" style={btn}>
              Adicionar
            </button>
          </form>
          <List items={fornecedores.map((x) => x.nome)} />
        </section>
      </div>
    </div>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul style={{ margin: "14px 0 0", padding: 0, listStyle: "none", fontSize: 13 }}>
      {items.map((item) => (
        <li
          key={item}
          style={{ padding: "8px 0", borderBottom: "1px solid var(--nexo-border)", color: "var(--nexo-text)" }}
        >
          {item}
        </li>
      ))}
      {items.length === 0 && <li style={{ color: "var(--nexo-muted)" }}>Vazio</li>}
    </ul>
  );
}
