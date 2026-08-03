"use client";

import { FormEvent, useEffect, useState } from "react";
import { MODULOS } from "@nexo/shared";
import { api } from "@/lib/api";
import {
  Btn,
  DataTable,
  Empty,
  Err,
  FieldLabel,
  PageHeader,
  Panel,
  fieldStyle,
  td,
  th,
} from "@/components/ui/nexo-ui";

const NIVEIS = ["NENHUM", "LEITURA", "EDICAO", "EDICAO_APROVACAO"] as const;

export default function ConfigPage() {
  const [org, setOrg] = useState<{ nome: string; cnpj?: string | null; fusoHorario: string; slaUrgenteHoras: number } | null>(null);
  const [usuarios, setUsuarios] = useState<Array<{ id: string; perfil: string; usuario: { id: string; nome: string; email: string; ativo: boolean } }>>([]);
  const [perfis, setPerfis] = useState<Array<{ id: string; nome: string; permissoes: Record<string, string | number>; ativo?: boolean }>>([]);
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
    const permissoes: Record<string, string> = {};
    for (const m of MODULOS) {
      permissoes[m] = String(fd.get(m) || "NENHUM");
    }
    await api("/config/perfis", {
      method: "POST",
      body: JSON.stringify({
        nome: String(fd.get("nome")),
        permissoes,
      }),
    });
    e.currentTarget.reset();
    setMsg("Perfil custom criado — use o mesmo nome do enum (ex.: ENGENHEIRO) para sobrescrever");
    await load();
  }

  return (
    <div>
      <PageHeader title="Configurações" subtitle="Organização · usuários · RBAC por módulo · logs de acesso" />
      {msg && <Err>{msg}</Err>}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {([
          ["org", "Organização"],
          ["users", "Usuários"],
          ["perfis", "Perfis"],
          ["logs", "Logs"],
        ] as const).map(([k, l]) => (
          <Btn key={k} variant={tab === k ? "primary" : "ghost"} onClick={() => setTab(k)}>
            {l}
          </Btn>
        ))}
      </div>

      {tab === "org" && org && (
        <Panel title="Organização">
          <form onSubmit={(e) => void saveOrg(e)} style={{ display: "grid", gap: 10, maxWidth: 480 }}>
            <div>
              <FieldLabel>Nome</FieldLabel>
              <input name="nome" defaultValue={org.nome} required style={fieldStyle} />
            </div>
            <div>
              <FieldLabel>CNPJ</FieldLabel>
              <input name="cnpj" defaultValue={org.cnpj ?? ""} placeholder="CNPJ" style={fieldStyle} />
            </div>
            <div>
              <FieldLabel>Fuso horário</FieldLabel>
              <input name="fuso" defaultValue={org.fusoHorario} style={fieldStyle} />
            </div>
            <div>
              <FieldLabel>SLA urgente (horas)</FieldLabel>
              <input name="sla" type="number" defaultValue={org.slaUrgenteHoras} style={fieldStyle} />
            </div>
            <Btn type="submit">Salvar</Btn>
          </form>
        </Panel>
      )}

      {tab === "users" && (
        <Panel title="Usuários">
          <form onSubmit={(e) => void createUser(e)} style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr auto", gap: 10, alignItems: "end", marginBottom: 14 }}>
            <div>
              <FieldLabel>E-mail</FieldLabel>
              <input name="email" type="email" placeholder="E-mail" required style={fieldStyle} />
            </div>
            <div>
              <FieldLabel>Nome</FieldLabel>
              <input name="nome" placeholder="Nome" required style={fieldStyle} />
            </div>
            <div>
              <FieldLabel>Senha</FieldLabel>
              <input name="senha" type="password" placeholder="Senha" required style={fieldStyle} />
            </div>
            <div>
              <FieldLabel>Perfil</FieldLabel>
              <select name="perfil" style={fieldStyle}>
                {["ENGENHEIRO", "GESTOR", "TECNICO", "SOLICITANTE", "AUDITORIA", "ADMIN"].map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <Btn type="submit">Adicionar</Btn>
          </form>
          <DataTable>
            <thead>
              <tr>
                <th style={th}>Nome</th>
                <th style={th}>E-mail</th>
                <th style={th}>Perfil</th>
                <th style={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.length === 0 ? (
                <tr><td colSpan={4} style={td}><Empty /></td></tr>
              ) : (
                usuarios.map((u) => (
                  <tr key={u.id}>
                    <td style={td}><strong>{u.usuario.nome}</strong></td>
                    <td style={td}>{u.usuario.email}</td>
                    <td style={td}>{u.perfil}</td>
                    <td style={td}>{u.usuario.ativo ? "ativo" : "inativo"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </DataTable>
        </Panel>
      )}

      {tab === "perfis" && (
        <Panel title="Perfis customizados (RBAC por módulo)">
          <p style={{ fontSize: 12, color: "oklch(0.5 0.02 250)", marginBottom: 12 }}>
            Nome igual ao enum do usuário (ex.: TECNICO) sobrescreve a matriz padrão na sessão JWT.
          </p>
          <form onSubmit={(e) => void createPerfil(e)} style={{ display: "grid", gap: 10, marginBottom: 14 }}>
            <div>
              <FieldLabel>Nome do perfil</FieldLabel>
              <input name="nome" placeholder="ENGENHEIRO / TECNICO / …" required style={fieldStyle} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
              {MODULOS.map((m) => (
                <div key={m}>
                  <FieldLabel>{m}</FieldLabel>
                  <select name={m} defaultValue="LEITURA" style={fieldStyle}>
                    {NIVEIS.map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <Btn type="submit">Criar perfil</Btn>
          </form>
          <DataTable>
            <thead>
              <tr>
                <th style={th}>Nome</th>
                <th style={th}>Permissões</th>
              </tr>
            </thead>
            <tbody>
              {perfis.length === 0 ? (
                <tr><td colSpan={2} style={td}><Empty /></td></tr>
              ) : (
                perfis.map((p) => (
                  <tr key={p.id}>
                    <td style={td}><strong>{p.nome}</strong></td>
                    <td style={td}><code style={{ fontSize: 11 }}>{JSON.stringify(p.permissoes)}</code></td>
                  </tr>
                ))
              )}
            </tbody>
          </DataTable>
        </Panel>
      )}

      {tab === "logs" && (
        <Panel title="Logs de acesso">
          <div style={{ maxHeight: 480, overflow: "auto" }}>
            {logs.length === 0 ? (
              <Empty />
            ) : (
              <DataTable>
                <thead>
                  <tr>
                    <th style={th}>Ação</th>
                    <th style={th}>Usuário</th>
                    <th style={th}>Data</th>
                    <th style={th}>Detalhe</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.id}>
                      <td style={td}><strong>{l.acao}</strong></td>
                      <td style={td}>{l.usuario?.nome ?? "sistema"}</td>
                      <td style={td}>{String(l.createdAt).slice(0, 19)}</td>
                      <td style={td}>{l.detalhe ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </div>
        </Panel>
      )}
    </div>
  );
}
