"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useCan } from "@/lib/session";
import {
  LABEL_OS_DOMINIO,
  OS_DOMINIO_TELA,
  OS_DOMINIO_TIPOS,
  PERMISSAO_NIVEL,
  type OsDominioTipo,
} from "@aion/shared";
import { agruparDominios, type OsDominioValor } from "@/lib/os-dominios";
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
} from "@/components/ui/aion-ui";

export default function OsDominiosPage() {
  const canEdit = useCan("os", PERMISSAO_NIVEL.EDICAO_APROVACAO);
  const [rows, setRows] = useState<OsDominioValor[]>([]);
  const [tipo, setTipo] = useState<OsDominioTipo>("OCORRENCIA");
  const [nome, setNome] = useState("");
  const [codigo, setCodigo] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mostrarInativos, setMostrarInativos] = useState(true);

  const mapa = useMemo(() => agruparDominios(rows), [rows]);
  const lista = (mapa[tipo] ?? []).filter((r) => mostrarInativos || r.ativo);

  async function load() {
    const data = await api<OsDominioValor[]>("/os-dominios");
    setRows(data);
  }

  useEffect(() => {
    void load().catch((e) => setErro(e instanceof Error ? e.message : "Erro"));
  }, []);

  function limparForm() {
    setNome("");
    setCodigo("");
    setEditId(null);
  }

  function editar(r: OsDominioValor) {
    setTipo(r.tipo as OsDominioTipo);
    setNome(r.nome);
    setCodigo(r.codigo ?? "");
    setEditId(r.id);
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!canEdit || busy) return;
    setBusy(true);
    setErro(null);
    setMsg(null);
    try {
      if (editId) {
        await api(`/os-dominios/${editId}`, {
          method: "PATCH",
          body: JSON.stringify({ nome: nome.trim(), codigo: codigo.trim() || null }),
        });
        setMsg("Valor atualizado");
      } else {
        await api("/os-dominios", {
          method: "POST",
          body: JSON.stringify({ tipo, nome: nome.trim(), codigo: codigo.trim() || undefined }),
        });
        setMsg("Valor cadastrado");
      }
      limparForm();
      await load();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  }

  async function toggleAtivo(r: OsDominioValor) {
    if (!canEdit || busy) return;
    setBusy(true);
    setErro(null);
    try {
      await api(`/os-dominios/${r.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ativo: !r.ativo }),
      });
      await load();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Domínios da OS"
        subtitle="Listas usadas nos combos da ficha (ocorrência, causa, motivo de baixa, oficina, etc.)"
      />
      {erro && <Err>{erro}</Err>}
      {msg && (
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
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {OS_DOMINIO_TIPOS.map((t) => (
          <Btn
            key={t}
            variant={tipo === t ? "primary" : "ghost"}
            onClick={() => {
              setTipo(t);
              limparForm();
            }}
          >
            {LABEL_OS_DOMINIO[t]} ({mapa[t]?.filter((r) => r.ativo).length ?? 0})
          </Btn>
        ))}
      </div>

      <p style={{ margin: "0 0 14px", fontSize: 13, color: "oklch(0.45 0.02 250)" }}>
        Usado em: <strong>{OS_DOMINIO_TELA[tipo]}</strong>
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 14 }}>
        <Surface>
          {canEdit ? (
            <form onSubmit={(e) => void salvar(e)}>
              <FieldLabel>{editId ? "Editar valor" : "Novo valor"}</FieldLabel>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome exibido no combo"
                style={{ ...fieldStyle, marginBottom: 10 }}
                required
                minLength={2}
              />
              <FieldLabel>Código (opcional)</FieldLabel>
              <input
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="Ex.: PEC, ABERT"
                style={{ ...fieldStyle, marginBottom: 12 }}
              />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Btn type="submit" disabled={busy}>
                  {busy ? "Salvando…" : editId ? "Salvar alteração" : "Adicionar"}
                </Btn>
                {editId && (
                  <Btn type="button" variant="ghost" onClick={limparForm}>
                    Cancelar edição
                  </Btn>
                )}
              </div>
            </form>
          ) : (
            <p style={{ margin: 0, fontSize: 13, color: "oklch(0.45 0.02 250)" }}>
              Somente engenheiro/gestor pode cadastrar ou inativar valores.
            </p>
          )}
        </Surface>

        <Surface>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 8 }}>
            <strong style={{ fontSize: 14 }}>{LABEL_OS_DOMINIO[tipo]}</strong>
            <label style={{ fontSize: 12.5, display: "flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" checked={mostrarInativos} onChange={(e) => setMostrarInativos(e.target.checked)} />
              Mostrar inativos
            </label>
          </div>
          {lista.length === 0 ? (
            <Empty text="Nenhum valor neste domínio. Cadastre o primeiro à esquerda." />
          ) : (
            <DataTable>
              <thead>
                <tr>
                  <th style={th}>Código</th>
                  <th style={th}>Nome</th>
                  <th style={th}>Situação</th>
                  {canEdit && <th style={th} />}
                </tr>
              </thead>
              <tbody>
                {lista.map((r) => (
                  <tr key={r.id}>
                    <td style={td}>{r.codigo || "—"}</td>
                    <td style={td}>{r.nome}</td>
                    <td style={td}>
                      <Badge>{r.ativo ? "Ativo" : "Inativo"}</Badge>
                    </td>
                    {canEdit && (
                      <td style={{ ...td, whiteSpace: "nowrap" }}>
                        <Btn variant="ghost" onClick={() => editar(r)}>
                          Editar
                        </Btn>
                        <Btn variant="ghost" onClick={() => void toggleAtivo(r)}>
                          {r.ativo ? "Inativar" : "Reativar"}
                        </Btn>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </Surface>
      </div>
    </div>
  );
}
