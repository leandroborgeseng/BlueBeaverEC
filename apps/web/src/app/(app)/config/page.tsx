"use client";

import { FormEvent, useEffect, useState } from "react";
import { MODULOS } from "@aion/shared";
import { api } from "@/lib/api";
import { FormDialog } from "@/components/ui/FormDialog";
import {
  Badge,
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
} from "@/components/ui/aion-ui";

const NIVEIS = ["NENHUM", "LEITURA", "EDICAO", "EDICAO_APROVACAO"] as const;
const PERFIS = [
  "ENGENHEIRO",
  "GESTOR",
  "TECNICO",
  "TECNICO_RESTRITO",
  "SOLICITANTE",
  "AUDITORIA",
  "ADMIN",
] as const;

type SetorOpt = { id: string; nome: string };

type UsuarioRow = {
  id: string;
  usuarioId: string;
  perfil: string;
  setorIds: string[];
  setores: SetorOpt[];
  usuario: { id: string; nome: string; email: string; ativo: boolean };
};

type EditDraft = {
  usuarioId: string;
  nome: string;
  email: string;
  perfil: string;
  ativo: boolean;
  senha: string;
  confirmarSenha: string;
  setorIds: string[];
};

function opcoesSetor(hospital: SetorOpt[], vinculados: SetorOpt[] = []) {
  const extras = vinculados.filter((s) => !hospital.some((h) => h.id === s.id));
  return [...hospital, ...extras];
}

function SetoresCheckboxes({
  setores,
  selected,
  onToggle,
  name,
}: {
  setores: SetorOpt[];
  selected?: string[];
  onToggle?: (id: string, checked: boolean) => void;
  name?: string;
}) {
  if (setores.length === 0) {
    return (
      <p style={{ fontSize: 12, color: "oklch(0.5 0.02 250)", margin: 0 }}>
        Nenhum setor cadastrado. Cadastre em Cadastros → Setores.
      </p>
    );
  }
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
        gap: 6,
        maxHeight: 180,
        overflow: "auto",
        padding: "4px 0",
      }}
    >
      {setores.map((s) => {
        const controlled = selected != null;
        return (
          <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <input
              type="checkbox"
              name={name}
              value={s.id}
              {...(controlled
                ? { checked: selected.includes(s.id), onChange: (e) => onToggle?.(s.id, e.target.checked) }
                : {})}
            />
            {s.nome}
          </label>
        );
      })}
    </div>
  );
}

export default function ConfigPage() {
  const [org, setOrg] = useState<{
    nome: string;
    cnpj?: string | null;
    fusoHorario: string;
    slaUrgenteHoras: number;
  } | null>(null);
  const [usuarios, setUsuarios] = useState<UsuarioRow[]>([]);
  const [perfis, setPerfis] = useState<
    Array<{ id: string; nome: string; permissoes: Record<string, string | number>; ativo?: boolean }>
  >([]);
  const [logs, setLogs] = useState<
    Array<{ id: string; acao: string; detalhe?: string | null; createdAt: string; usuario?: { nome: string } | null }>
  >([]);
  const [tab, setTab] = useState<"org" | "users" | "perfis" | "logs">("org");
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [edit, setEdit] = useState<EditDraft | null>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogErro, setDialogErro] = useState<string | null>(null);
  const [setores, setSetores] = useState<SetorOpt[]>([]);

  async function load() {
    const [o, u, p, l, s] = await Promise.all([
      api<typeof org>("/config/organizacao"),
      api<UsuarioRow[]>("/config/usuarios"),
      api<typeof perfis>("/config/perfis"),
      api<typeof logs>("/config/logs-acesso"),
      api<SetorOpt[]>("/setores").catch(() => [] as SetorOpt[]),
    ]);
    setOrg(o);
    setUsuarios(u);
    setPerfis(p);
    setLogs(l);
    setSetores(s);
  }

  useEffect(() => {
    void load().catch((e) => setErro(e instanceof Error ? e.message : "Erro"));
  }, []);

  async function saveOrg(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await api("/config/organizacao", {
        method: "PATCH",
        body: JSON.stringify({
          nome: String(fd.get("nome")),
          cnpj: String(fd.get("cnpj") || "") || undefined,
          fusoHorario: String(fd.get("fuso")),
          slaUrgenteHoras: Number(fd.get("sla")),
        }),
      });
      setErro(null);
      setMsg("Organização atualizada");
      await load();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro");
    }
  }

  async function createUser(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await api("/config/usuarios", {
        method: "POST",
        body: JSON.stringify({
          email: String(fd.get("email")),
          nome: String(fd.get("nome")),
          senha: String(fd.get("senha")),
          perfil: String(fd.get("perfil")),
          setorIds: fd.getAll("setorIds").map(String),
        }),
      });
      e.currentTarget.reset();
      setShowCreateUser(false);
      setErro(null);
      setMsg("Usuário vinculado");
      await load();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro");
    }
  }

  function openEdit(u: UsuarioRow) {
    setDialogErro(null);
    setEdit({
      usuarioId: u.usuario.id,
      nome: u.usuario.nome,
      email: u.usuario.email,
      perfil: u.perfil,
      ativo: u.usuario.ativo,
      senha: "",
      confirmarSenha: "",
      setorIds: u.setorIds ?? u.setores?.map((s) => s.id) ?? [],
    });
  }

  async function saveEdit() {
    if (!edit) return;
    if (edit.senha && edit.senha !== edit.confirmarSenha) {
      setDialogErro("As senhas não coincidem");
      return;
    }
    if (edit.senha && edit.senha.length < 6) {
      setDialogErro("Senha deve ter no mínimo 6 caracteres");
      return;
    }
    setDialogBusy(true);
    setDialogErro(null);
    try {
      const body: Record<string, unknown> = {
        nome: edit.nome.trim(),
        email: edit.email.trim(),
        perfil: edit.perfil,
        ativo: edit.ativo,
        setorIds: edit.setorIds,
      };
      if (edit.senha.trim()) body.senha = edit.senha.trim();

      await api(`/config/usuarios/${edit.usuarioId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setEdit(null);
      setErro(null);
      setMsg("Usuário atualizado");
      await load();
    } catch (err) {
      setDialogErro(err instanceof Error ? err.message : "Erro");
    } finally {
      setDialogBusy(false);
    }
  }

  async function createPerfil(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const permissoes: Record<string, string> = {};
    for (const m of MODULOS) {
      permissoes[m] = String(fd.get(m) || "NENHUM");
    }
    try {
      await api("/config/perfis", {
        method: "POST",
        body: JSON.stringify({
          nome: String(fd.get("nome")),
          permissoes,
        }),
      });
      e.currentTarget.reset();
      setErro(null);
      setMsg("Perfil custom criado — use o mesmo nome do enum (ex.: ENGENHEIRO) para sobrescrever");
      await load();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro");
    }
  }

  return (
    <div>
      <PageHeader title="Configurações" subtitle="Organização · usuários · RBAC por módulo · logs de acesso" />
      {erro && <Err>{erro}</Err>}
      {msg && !erro && (
        <div style={{ marginBottom: 12, fontSize: 13, fontWeight: 600, color: "oklch(0.45 0.13 150)" }}>{msg}</div>
      )}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {(
          [
            ["org", "Organização"],
            ["users", "Usuários"],
            ["perfis", "Perfis"],
            ["logs", "Logs"],
          ] as const
        ).map(([k, l]) => (
          <Btn key={k} variant={tab === k ? "primary" : "ghost"} onClick={() => setTab(k)}>
            {l}
          </Btn>
        ))}
      </div>

      {tab === "org" && org && (
        <Panel title="Organização">
          <form onSubmit={(e) => void saveOrg(e)} style={{ display: "grid", gap: 10, maxWidth: 480 }}>
            <div>
              <FieldLabel htmlFor="org-nome">Nome</FieldLabel>
              <input id="org-nome" name="nome" defaultValue={org.nome} required style={fieldStyle} />
            </div>
            <div>
              <FieldLabel htmlFor="org-cnpj">CNPJ</FieldLabel>
              <input id="org-cnpj" name="cnpj" defaultValue={org.cnpj ?? ""} placeholder="CNPJ" style={fieldStyle} />
            </div>
            <div>
              <FieldLabel htmlFor="org-fuso">Fuso horário</FieldLabel>
              <input id="org-fuso" name="fuso" defaultValue={org.fusoHorario} style={fieldStyle} />
            </div>
            <div>
              <FieldLabel htmlFor="org-sla">SLA urgente (horas)</FieldLabel>
              <input id="org-sla" name="sla" type="number" defaultValue={org.slaUrgenteHoras} style={fieldStyle} />
            </div>
            <Btn type="submit">Salvar</Btn>
          </form>
        </Panel>
      )}

      {tab === "users" && (
        <Panel
          title="Usuários"
          action={
            <Btn type="button" size="sm" variant="secondary" onClick={() => setShowCreateUser((v) => !v)}>
              {showCreateUser ? "Cancelar" : "Novo usuário"}
            </Btn>
          }
        >
          {showCreateUser && (
            <form
              onSubmit={(e) => void createUser(e)}
              style={{
                display: "grid",
                gap: 10,
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.5fr 1fr 1fr 1fr auto",
                  gap: 10,
                  alignItems: "end",
                }}
              >
                <div>
                  <FieldLabel htmlFor="new-email">E-mail</FieldLabel>
                  <input id="new-email" name="email" type="email" required style={fieldStyle} />
                </div>
                <div>
                  <FieldLabel htmlFor="new-nome">Nome</FieldLabel>
                  <input id="new-nome" name="nome" required style={fieldStyle} />
                </div>
                <div>
                  <FieldLabel htmlFor="new-senha">Senha</FieldLabel>
                  <input id="new-senha" name="senha" type="password" minLength={6} required style={fieldStyle} />
                </div>
                <div>
                  <FieldLabel htmlFor="new-perfil">Perfil</FieldLabel>
                  <select id="new-perfil" name="perfil" style={fieldStyle}>
                    {PERFIS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <Btn type="submit">Adicionar</Btn>
              </div>
              <div>
                <FieldLabel>Setores do hospital</FieldLabel>
                <p style={{ fontSize: 12, color: "oklch(0.5 0.02 250)", margin: "0 0 6px" }}>
                  Solicitantes só veem o portal dos setores vinculados. Vazio = sem setor.
                </p>
                <SetoresCheckboxes setores={setores} name="setorIds" />
              </div>
            </form>
          )}
          <DataTable>
            <thead>
              <tr>
                <th style={th}>Nome</th>
                <th style={th}>E-mail</th>
                <th style={th}>Perfil</th>
                <th style={th}>Setores</th>
                <th style={th}>Status</th>
                <th style={th}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.length === 0 ? (
                <tr>
                  <td colSpan={6} style={td}>
                    <Empty />
                  </td>
                </tr>
              ) : (
                usuarios.map((u) => (
                  <tr key={u.id}>
                    <td style={td}>
                      <strong>{u.usuario.nome}</strong>
                    </td>
                    <td style={td}>{u.usuario.email}</td>
                    <td style={td}>{u.perfil}</td>
                    <td style={td}>
                      {(u.setores ?? []).length
                        ? u.setores.map((s) => s.nome).join(", ")
                        : "—"}
                    </td>
                    <td style={td}>
                      <Badge tone={u.usuario.ativo ? "success" : "warning"}>
                        {u.usuario.ativo ? "ativo" : "inativo"}
                      </Badge>
                    </td>
                    <td style={td}>
                      <Btn variant="ghost" size="sm" onClick={() => openEdit(u)}>
                        Editar
                      </Btn>
                    </td>
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
              <FieldLabel htmlFor="perfil-nome">Nome do perfil</FieldLabel>
              <input id="perfil-nome" name="nome" placeholder="ENGENHEIRO / TECNICO / …" required style={fieldStyle} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
              {MODULOS.map((m) => (
                <div key={m}>
                  <FieldLabel htmlFor={`perfil-${m}`}>{m}</FieldLabel>
                  <select id={`perfil-${m}`} name={m} defaultValue="LEITURA" style={fieldStyle}>
                    {NIVEIS.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
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
                <tr>
                  <td colSpan={2} style={td}>
                    <Empty />
                  </td>
                </tr>
              ) : (
                perfis.map((p) => (
                  <tr key={p.id}>
                    <td style={td}>
                      <strong>{p.nome}</strong>
                    </td>
                    <td style={td}>
                      <code style={{ fontSize: 11 }}>{JSON.stringify(p.permissoes)}</code>
                    </td>
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
                      <td style={td}>
                        <strong>{l.acao}</strong>
                      </td>
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

      <FormDialog
        open={Boolean(edit)}
        title={edit ? `Editar · ${edit.email}` : "Editar usuário"}
        confirmLabel="Salvar"
        busy={dialogBusy}
        erro={dialogErro}
        onCancel={() => setEdit(null)}
        onConfirm={saveEdit}
      >
        {edit && (
          <>
            <div>
              <FieldLabel htmlFor="edit-nome">Nome</FieldLabel>
              <input
                id="edit-nome"
                value={edit.nome}
                onChange={(e) => setEdit({ ...edit, nome: e.target.value })}
                style={fieldStyle}
              />
            </div>
            <div>
              <FieldLabel htmlFor="edit-email">E-mail</FieldLabel>
              <input
                id="edit-email"
                type="email"
                value={edit.email}
                onChange={(e) => setEdit({ ...edit, email: e.target.value })}
                style={fieldStyle}
              />
            </div>
            <div>
              <FieldLabel htmlFor="edit-perfil">Perfil neste estabelecimento</FieldLabel>
              <select
                id="edit-perfil"
                value={edit.perfil}
                onChange={(e) => setEdit({ ...edit, perfil: e.target.value })}
                style={fieldStyle}
              >
                {PERFIS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>Setores do hospital</FieldLabel>
              <p style={{ fontSize: 12, color: "oklch(0.5 0.02 250)", margin: "0 0 6px" }}>
                Solicitantes só veem o portal dos setores vinculados. Vazio = sem setor.
              </p>
              <SetoresCheckboxes
                setores={opcoesSetor(
                  setores,
                  usuarios.find((x) => x.usuario.id === edit.usuarioId)?.setores,
                )}
                selected={edit.setorIds}
                onToggle={(id, checked) =>
                  setEdit({
                    ...edit,
                    setorIds: checked ? [...edit.setorIds, id] : edit.setorIds.filter((x) => x !== id),
                  })
                }
              />
            </div>
            <div>
              <FieldLabel htmlFor="edit-ativo">Status</FieldLabel>
              <select
                id="edit-ativo"
                value={edit.ativo ? "1" : "0"}
                onChange={(e) => setEdit({ ...edit, ativo: e.target.value === "1" })}
                style={fieldStyle}
              >
                <option value="1">Ativo</option>
                <option value="0">Inativo</option>
              </select>
            </div>
            <div
              style={{
                marginTop: 4,
                paddingTop: 12,
                borderTop: "1px solid oklch(0.92 0.006 255)",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: "oklch(0.5 0.02 250)", marginBottom: 8 }}>
                Trocar senha (opcional — deixe em branco para manter)
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                <div>
                  <FieldLabel htmlFor="edit-senha">Nova senha</FieldLabel>
                  <input
                    id="edit-senha"
                    type="password"
                    autoComplete="new-password"
                    value={edit.senha}
                    onChange={(e) => setEdit({ ...edit, senha: e.target.value })}
                    style={fieldStyle}
                    placeholder="Mín. 6 caracteres"
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="edit-senha2">Confirmar senha</FieldLabel>
                  <input
                    id="edit-senha2"
                    type="password"
                    autoComplete="new-password"
                    value={edit.confirmarSenha}
                    onChange={(e) => setEdit({ ...edit, confirmarSenha: e.target.value })}
                    style={fieldStyle}
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </FormDialog>
    </div>
  );
}
