"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function ConfigPage() {
  const [org, setOrg] = useState<{ nome: string; cnpj?: string | null; fusoHorario: string; slaUrgenteHoras: number } | null>(null);
  const [usuarios, setUsuarios] = useState<Array<{ id: string; perfil: string; usuario: { id: string; nome: string; email: string; ativo: boolean } }>>([]);
  const [perfis, setPerfis] = useState<Array<{ id: string; nome: string; permissoes: Record<string, string> }>>([]);
  const [logs, setLogs] = useState<Array<{ id: string; acao: string; detalhe?: string | null; createdAt: string; usuario?: { nome: string } | null }>>([]);
  const [tab, setTab] = useState<"org" | "users" | "perfis" | "logs">("org");
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const [o, u, p, l] = await Promise.all([
      api<typeof org>("/config/organizacao"),
      api<typeof usuarios>("/config/usuarios"),
      api<typeof perfis>("/config/perfis"),
      api<typeof logs>("/config/logs-acesso"),
    ]);
    setOrg(o);
    setUsuarios(u);
    setPerfis(p);
    setLogs(l);
  }

  useEffect(() => {
    void load().catch((e) => setMsg(e.message));
  }, []);

  async function saveOrg(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await api("/config/organizacao", {
      method: "PATCH",
      body: JSON.stringify({
        nome: String(fd.get("nome")),
        cnpj: String(fd.get("cnpj") || "") || undefined,
        fusoHorario: String(fd.get("fuso")),
        slaUrgenteHoras: Number(fd.get("sla")),
      }),
    });
    setMsg("Organização atualizada");
    await load();
  }

  async function createUser(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await api("/config/usuarios", {
      method: "POST",
      body: JSON.stringify({
        email: String(fd.get("email")),
        nome: String(fd.get("nome")),
        senha: String(fd.get("senha")),
        perfil: String(fd.get("perfil")),
      }),
    });
    e.currentTarget.reset();
    setMsg("Usuário vinculado");
    await load();
  }

  async function createPerfil(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await api("/config/perfis", {
      method: "POST",
      body: JSON.stringify({
        nome: String(fd.get("nome")),
        permissoes: {
          equipamentos: String(fd.get("equipamentos")),
          os: String(fd.get("os")),
          financeiro: String(fd.get("financeiro")),
        },
      }),
    });
    e.currentTarget.reset();
    await load();
  }

  return (
    <div>
      <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 800 }}>Configurações</h1>
      <p style={{ margin: "0 0 12px", color: "var(--nexo-muted)", fontSize: 13 }}>
        Organização · usuários · perfis custom · logs de acesso
      </p>
      {msg && <div style={{ marginBottom: 10 }}>{msg}</div>}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {([
          ["org", "Organização"],
          ["users", "Usuários"],
          ["perfis", "Perfis"],
          ["logs", "Logs"],
        ] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} style={{ ...btn, background: tab === k ? "var(--nexo-brand)" : "var(--nexo-surface)", color: tab === k ? "white" : "inherit", border: "1px solid var(--nexo-border)" }}>
            {l}
          </button>
        ))}
      </div>

      {tab === "org" && org && (
        <form onSubmit={(e) => void saveOrg(e)} style={{ ...card, display: "grid", gap: 10, maxWidth: 480 }}>
          <input name="nome" defaultValue={org.nome} required style={input} />
          <input name="cnpj" defaultValue={org.cnpj ?? ""} placeholder="CNPJ" style={input} />
          <input name="fuso" defaultValue={org.fusoHorario} style={input} />
          <input name="sla" type="number" defaultValue={org.slaUrgenteHoras} style={input} />
          <button type="submit" style={btn}>Salvar</button>
        </form>
      )}

      {tab === "users" && (
        <div>
          <form onSubmit={(e) => void createUser(e)} style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr auto", gap: 8, marginBottom: 14 }}>
            <input name="email" type="email" placeholder="E-mail" required style={input} />
            <input name="nome" placeholder="Nome" required style={input} />
            <input name="senha" type="password" placeholder="Senha" required style={input} />
            <select name="perfil" style={input}>
              {["ENGENHEIRO", "GESTOR", "TECNICO", "SOLICITANTE", "AUDITORIA", "ADMIN"].map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <button type="submit" style={btn}>Adicionar</button>
          </form>
          {usuarios.map((u) => (
            <div key={u.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--nexo-border)", fontSize: 13 }}>
              <strong>{u.usuario.nome}</strong> · {u.usuario.email} · {u.perfil} · {u.usuario.ativo ? "ativo" : "inativo"}
            </div>
          ))}
        </div>
      )}

      {tab === "perfis" && (
        <div>
          <form onSubmit={(e) => void createPerfil(e)} style={{ ...card, display: "grid", gap: 8, marginBottom: 14, maxWidth: 520 }}>
            <input name="nome" placeholder="Nome do perfil" required style={input} />
            {(["equipamentos", "os", "financeiro"] as const).map((m) => (
              <label key={m} style={{ fontSize: 13, display: "flex", justifyContent: "space-between", gap: 8 }}>
                {m}
                <select name={m} style={input}>
                  <option value="NENHUM">Nenhum</option>
                  <option value="LEITURA">Leitura</option>
                  <option value="EDICAO">Edição</option>
                  <option value="EDICAO_APROVACAO">Edição+Aprovação</option>
                </select>
              </label>
            ))}
            <button type="submit" style={btn}>Criar perfil</button>
          </form>
          {perfis.map((p) => (
            <div key={p.id} style={{ fontSize: 13, padding: "8px 0", borderBottom: "1px solid var(--nexo-border)" }}>
              <strong>{p.nome}</strong>
              <pre style={{ margin: 0, fontSize: 11 }}>{JSON.stringify(p.permissoes)}</pre>
            </div>
          ))}
        </div>
      )}

      {tab === "logs" && (
        <div style={{ maxHeight: 480, overflow: "auto" }}>
          {logs.map((l) => (
            <div key={l.id} style={{ fontSize: 12, padding: "8px 0", borderBottom: "1px solid var(--nexo-border)" }}>
              <strong>{l.acao}</strong> · {l.usuario?.nome ?? "sistema"} · {String(l.createdAt).slice(0, 19)}
              {l.detalhe && <div style={{ color: "var(--nexo-muted)" }}>{l.detalhe}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const card: React.CSSProperties = { background: "var(--nexo-surface)", border: "1px solid var(--nexo-border)", borderRadius: 12, padding: 14 };
const input: React.CSSProperties = { padding: "8px 10px", borderRadius: 8, border: "1px solid var(--nexo-border)", background: "var(--nexo-bg)", width: "100%" };
const btn: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "none", background: "var(--nexo-brand)", color: "white", fontWeight: 700, cursor: "pointer", height: "fit-content" };
