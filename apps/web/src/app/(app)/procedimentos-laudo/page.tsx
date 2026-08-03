"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  Badge,
  Btn,
  FieldLabel,
  PageHeader,
  Surface,
  fieldStyle,
} from "@/components/ui/aion-ui";

interface Proc {
  id: string;
  nome: string;
  tipo: string;
  validadeMeses: number;
  itens: unknown[];
  modelos: Array<{ modelo: { id: string; nome: string; fabricante: { nome: string } } }>;
}

interface Modelo {
  id: string;
  nome: string;
  fabricante: { nome: string };
}

export default function ProcedimentosPage() {
  const [items, setItems] = useState<Proc[]>([]);
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editJson, setEditJson] = useState("");
  const [editErro, setEditErro] = useState<string | null>(null);

  async function load() {
    const [p, m] = await Promise.all([
      api<Proc[]>("/procedimentos-laudo"),
      api<Modelo[]>("/modelos"),
    ]);
    setItems(p);
    setModelos(m);
  }

  useEffect(() => {
    void load().catch((e) => setMsg(e.message));
  }, []);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const tipo = String(fd.get("tipo"));
    const defaultItens =
      tipo === "CALIBRACAO"
        ? [
            { id: "p0", pergunta: "0%", valorPadrao: 0 },
            { id: "p25", pergunta: "25%", valorPadrao: 25 },
            { id: "p50", pergunta: "50%", valorPadrao: 50 },
            { id: "p75", pergunta: "75%", valorPadrao: 75 },
            { id: "p100", pergunta: "100%", valorPadrao: 100 },
          ]
        : tipo === "TSE"
          ? [
              { id: "aterramento", pergunta: "Aterramento", limite: 0.1 },
              { id: "isolamento", pergunta: "Isolamento", limite: 1 },
              { id: "fuga", pergunta: "Fuga para terra", limite: 500 },
            ]
          : [
              { id: "1", pergunta: "Aspecto visual adequado" },
              { id: "2", pergunta: "Funcionamento conforme especificação" },
              { id: "3", pergunta: "Acessórios completos" },
            ];

    try {
      await api("/procedimentos-laudo", {
        method: "POST",
        body: JSON.stringify({
          nome: String(fd.get("nome")),
          tipo,
          validadeMeses: Number(fd.get("validadeMeses") || 12),
          itens: defaultItens,
        }),
      });
      e.currentTarget.reset();
      setMsg("Procedimento criado");
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erro");
    }
  }

  async function vincular(procId: string, modeloId: string) {
    if (!modeloId) return;
    try {
      await api(`/procedimentos-laudo/${procId}/vincular`, {
        method: "POST",
        body: JSON.stringify({ modeloId }),
      });
      setMsg("Modelo vinculado (exclusivo por tipo)");
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erro");
    }
  }

  function abrirEdicaoItens(p: Proc) {
    setEditId(p.id);
    setEditJson(JSON.stringify(p.itens ?? [], null, 2));
    setEditErro(null);
  }

  async function salvarItens() {
    if (!editId) return;
    setEditErro(null);
    let parsed: unknown[];
    try {
      parsed = JSON.parse(editJson) as unknown[];
      if (!Array.isArray(parsed)) throw new Error("JSON deve ser um array");
    } catch (err) {
      setEditErro(err instanceof Error ? err.message : "JSON inválido");
      return;
    }
    try {
      await api(`/procedimentos-laudo/${editId}/itens`, {
        method: "PATCH",
        body: JSON.stringify({ itens: parsed }),
      });
      setMsg("Itens atualizados");
      setEditId(null);
      await load();
    } catch (err) {
      setEditErro(err instanceof Error ? err.message : "Erro");
    }
  }

  return (
    <div>
      <PageHeader title="Procedimentos de Laudo" subtitle="Base reutilizável · vínculo exclusivo por modelo/tipo" />
      {msg && <div style={{ marginBottom: 12, fontSize: 13, fontWeight: 600 }}>{msg}</div>}

      <Surface style={{ marginBottom: 16 }}>
        <form
          onSubmit={(e) => void onCreate(e)}
          style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 10, alignItems: "end" }}
        >
          <div>
            <FieldLabel>Nome</FieldLabel>
            <input name="nome" placeholder="Nome do procedimento" required style={fieldStyle} />
          </div>
          <div>
            <FieldLabel>Tipo</FieldLabel>
            <select name="tipo" defaultValue="PREVENTIVA" style={fieldStyle}>
              <option value="RECEBIMENTO">Recebimento</option>
              <option value="PREVENTIVA">Preventiva</option>
              <option value="CALIBRACAO">Calibração</option>
              <option value="TSE">TSE</option>
            </select>
          </div>
          <div>
            <FieldLabel>Validade (meses)</FieldLabel>
            <input name="validadeMeses" type="number" defaultValue={12} min={1} style={fieldStyle} />
          </div>
          <Btn type="submit">+ Novo</Btn>
        </form>
      </Surface>

      <div style={{ display: "grid", gap: 12 }}>
        {items.map((p) => (
          <Surface key={p.id}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
              <div>
                <strong>{p.nome}</strong>
                <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                  <Badge tone="ATIVO">{p.tipo}</Badge>
                  <span style={{ fontSize: 12, color: "oklch(0.5 0.02 250)" }}>
                    validade {p.validadeMeses} meses · {(p.itens as unknown[]).length} itens
                  </span>
                </div>
              </div>
              <select
                defaultValue=""
                onChange={(e) => void vincular(p.id, e.target.value)}
                style={{ ...fieldStyle, width: 260 }}
              >
                <option value="">Vincular modelo…</option>
                {modelos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fabricante.nome} / {m.nome}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ marginTop: 10, fontSize: 12 }}>
              {p.modelos.length === 0
                ? "Sem modelos vinculados"
                : p.modelos
                    .map((m) => `${m.modelo.fabricante.nome} / ${m.modelo.nome}`)
                    .join(" · ")}
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <Btn variant="ghost" size="sm" onClick={() => abrirEdicaoItens(p)}>
                Editar itens (JSON)
              </Btn>
            </div>
            {editId === p.id && (
              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                <FieldLabel>Itens do checklist (JSON)</FieldLabel>
                <textarea
                  value={editJson}
                  onChange={(e) => setEditJson(e.target.value)}
                  rows={8}
                  style={{ ...fieldStyle, fontFamily: "monospace", fontSize: 12 }}
                />
                {editErro && (
                  <div style={{ fontSize: 13, fontWeight: 600, color: "oklch(0.45 0.15 25)" }}>{editErro}</div>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn size="sm" onClick={() => void salvarItens()}>
                    Salvar itens
                  </Btn>
                  <Btn variant="ghost" size="sm" onClick={() => setEditId(null)}>
                    Cancelar
                  </Btn>
                </div>
              </div>
            )}
          </Surface>
        ))}
      </div>
    </div>
  );
}
