"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Overlay, WinForm } from "@/components/os/os-win-ui";
import {
  FItem,
  FRow,
  ToolBtn,
  ZebraTable,
  td,
  winFld,
  zebraRow,
} from "@/components/equipamentos/eq-win-ui";

export type ConsolidarKind = "modelos" | "fabricantes";

interface Item {
  id: string;
  nome: string;
  equipamentos: number;
  extra?: string;
  fabricanteId?: string;
}

interface Grupo {
  key: string;
  rotulo: string;
  itens: Item[];
}

export function ConsolidarCadastroDialog({
  kind,
  onClose,
  onDone,
}: {
  kind: ConsolidarKind;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const isModelo = kind === "modelos";
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [todos, setTodos] = useState<Item[]>([]);
  const [fabs, setFabs] = useState<Array<{ id: string; nome: string }>>([]);
  const [fabId, setFabId] = useState("");
  const [q, setQ] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [destinoId, setDestinoId] = useState("");
  const [origemIds, setOrigemIds] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [modo, setModo] = useState<"sugestoes" | "manual">("sugestoes");

  const load = useCallback(async () => {
    if (isModelo) {
      const params = fabId ? `?fabricanteId=${encodeURIComponent(fabId)}` : "";
      const [sim, lista, fabricantes] = await Promise.all([
        api<{
          grupos: Array<{
            chave: string;
            fabricante: { id: string; nome: string };
            modelos: Array<{ id: string; nome: string; equipamentos: number; tags: string[] }>;
          }>;
        }>(`/modelos/similares${params}`),
        api<Array<{
          id: string;
          nome: string;
          fabricanteId: string;
          fabricante: { nome: string };
          _count?: { equipamentos?: number };
        }>>(fabId ? `/modelos?fabricanteId=${encodeURIComponent(fabId)}` : "/modelos"),
        api<Array<{ id: string; nome: string }>>("/fabricantes"),
      ]);
      setGrupos(
        sim.grupos.map((g) => ({
          key: `${g.fabricante.id}:${g.chave}`,
          rotulo: g.fabricante.nome,
          itens: g.modelos.map((m) => ({
            id: m.id,
            nome: m.nome,
            equipamentos: m.equipamentos,
            extra: m.tags.join(", "),
            fabricanteId: g.fabricante.id,
          })),
        })),
      );
      setTodos(
        lista.map((m) => ({
          id: m.id,
          nome: m.nome,
          equipamentos: m._count?.equipamentos ?? 0,
          extra: m.fabricante.nome,
          fabricanteId: m.fabricanteId,
        })),
      );
      setFabs(fabricantes);
    } else {
      const [sim, lista] = await Promise.all([
        api<{
          grupos: Array<{
            chave: string;
            fabricantes: Array<{ id: string; nome: string; equipamentos: number; modelos: number }>;
          }>;
        }>("/fabricantes/similares"),
        api<Array<{ id: string; nome: string; _count?: { equipamentos?: number; modelos?: number } }>>(
          "/fabricantes",
        ),
      ]);
      setGrupos(
        sim.grupos.map((g) => ({
          key: g.chave,
          rotulo: g.fabricantes.map((f) => f.nome).join(" · "),
          itens: g.fabricantes.map((f) => ({
            id: f.id,
            nome: f.nome,
            equipamentos: f.equipamentos,
            extra: `${f.modelos} modelo(s)`,
          })),
        })),
      );
      setTodos(
        lista.map((f) => ({
          id: f.id,
          nome: f.nome,
          equipamentos: f._count?.equipamentos ?? 0,
          extra: `${f._count?.modelos ?? 0} modelo(s)`,
        })),
      );
    }
  }, [fabId, isModelo]);

  useEffect(() => {
    void load().catch((e) => setErro(e instanceof Error ? e.message : "Erro"));
  }, [load]);

  const grupoSel = grupos.find((g) => g.key === selectedKey) ?? null;
  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return todos;
    return todos.filter(
      (m) => m.nome.toLowerCase().includes(t) || (m.extra ?? "").toLowerCase().includes(t),
    );
  }, [todos, q]);

  const listaAtiva = modo === "sugestoes" ? (grupoSel?.itens ?? []) : filtrados;
  const destino = listaAtiva.find((m) => m.id === destinoId);
  const origensSel = listaAtiva.filter(
    (m) =>
      origemIds.includes(m.id) &&
      m.id !== destinoId &&
      (!isModelo || !destino || m.fabricanteId === destino.fabricanteId),
  );

  function escolherGrupo(g: Grupo) {
    setModo("sugestoes");
    setSelectedKey(g.key);
    const keep = g.itens[0]?.id ?? "";
    setDestinoId(keep);
    setOrigemIds(g.itens.filter((m) => m.id !== keep).map((m) => m.id));
    setErro(null);
  }

  function setKeep(id: string) {
    setDestinoId(id);
    setOrigemIds((prev) => {
      const next = prev.filter((x) => x !== id);
      return next.length ? next : listaAtiva.filter((m) => m.id !== id).map((m) => m.id);
    });
  }

  async function consolidar() {
    if (!destinoId || origensSel.length === 0) return;
    setBusy(true);
    setErro(null);
    try {
      const path = isModelo ? "/modelos/consolidar" : "/fabricantes/consolidar";
      const r = await api<{
        equipamentosMovidos: number;
        modelosDesativados?: number;
        fabricantesDesativados?: number;
        modelosMesclados?: number;
        destino: { nome: string };
      }>(path, {
        method: "POST",
        body: JSON.stringify({ destinoId, origemIds: origensSel.map((m) => m.id) }),
      });
      const saida = isModelo
        ? `${r.modelosDesativados ?? origensSel.length} modelo(s) saíram da lista`
        : `${r.fabricantesDesativados ?? origensSel.length} fabricante(s) saíram da lista`;
      const extra =
        !isModelo && r.modelosMesclados
          ? ` · ${r.modelosMesclados} modelo(s) iguais também foram unidos`
          : "";
      onDone(`${r.equipamentosMovidos} equipamento(s) passaram a ${r.destino.nome}. ${saida}${extra}.`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao consolidar");
    } finally {
      setBusy(false);
    }
  }

  const titulo = isModelo ? "Consolidar modelos" : "Consolidar fabricantes";

  return (
    <>
      <WinForm
        title={titulo}
        onCancel={onClose}
        showContinuar={false}
        hideSubmit
        width="min(860px, 96vw)"
        extraRight={
          <button
            type="button"
            disabled={busy || !destino || origensSel.length === 0}
            onClick={() => setConfirm(true)}
            style={acao}
          >
            Consolidar
          </button>
        }
        erro={erro}
      >
        <FRow>
          <ToolBtn
            onClick={() => {
              setModo("sugestoes");
              setSelectedKey(null);
              setDestinoId("");
              setOrigemIds([]);
            }}
          >
            Sugestões
          </ToolBtn>
          <ToolBtn
            onClick={() => {
              setModo("manual");
              setSelectedKey(null);
              setDestinoId("");
              setOrigemIds([]);
            }}
          >
            Mesclar na mão
          </ToolBtn>
        </FRow>
        <FRow>
          {isModelo && (
            <FItem label="Fabricante:" grow>
              <select value={fabId} onChange={(e) => setFabId(e.target.value)} style={{ ...winFld, flex: 1 }}>
                <option value="">Todos</option>
                {fabs.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </select>
            </FItem>
          )}
          {modo === "manual" && (
            <FItem label="Buscar:" grow>
              <input value={q} onChange={(e) => setQ(e.target.value)} style={{ ...winFld, flex: 1 }} />
            </FItem>
          )}
        </FRow>
        <div style={{ fontSize: 12, color: "#555", marginBottom: 8 }}>
          {modo === "sugestoes"
            ? `${grupos.length} grupo(s) com nomes parecidos`
            : isModelo
              ? "Só mescla modelos do mesmo fabricante."
              : "Os modelos iguais dos fabricantes unidos também são mesclados."}
        </div>

        <div style={{ maxHeight: "48vh", overflow: "auto", background: "white", border: "1px solid #ddd" }}>
          {modo === "sugestoes" && !grupoSel && (
            <ZebraTable
              columns={[
                { key: "rotulo", label: isModelo ? "Fabricante" : "Grupo" },
                { key: "nomes", label: "Nomes" },
                { key: "qtd", label: "Qtd", width: 60 },
                { key: "eq", label: "Eq.", width: 70 },
              ]}
            >
              {grupos.map((g, i) => (
                <tr key={g.key} style={zebraRow(i, false)} onClick={() => escolherGrupo(g)}>
                  <td style={td}>{g.rotulo}</td>
                  <td style={{ ...td, whiteSpace: "normal" }}>{g.itens.map((m) => m.nome).join(" · ")}</td>
                  <td style={td}>{g.itens.length}</td>
                  <td style={td}>{g.itens.reduce((s, m) => s + m.equipamentos, 0)}</td>
                </tr>
              ))}
            </ZebraTable>
          )}
          {modo === "sugestoes" && grupos.length === 0 && (
            <div style={{ padding: 16, fontSize: 13, color: "#777" }}>
              Nenhum nome parecido. Use “Mesclar na mão”.
            </div>
          )}
          {(modo === "manual" || grupoSel) && (
            <>
              {grupoSel && (
                <div style={{ padding: "6px 8px", fontSize: 12 }}>
                  <ToolBtn
                    onClick={() => {
                      setSelectedKey(null);
                      setDestinoId("");
                      setOrigemIds([]);
                    }}
                  >
                    ← Grupos
                  </ToolBtn>
                  <span style={{ marginLeft: 8 }}>{grupoSel.rotulo}</span>
                </div>
              )}
              <ZebraTable
                columns={[
                  { key: "keep", label: "Manter", width: 60 },
                  { key: "src", label: "Mesclar", width: 64 },
                  { key: "nome", label: isModelo ? "Modelo" : "Fabricante" },
                  { key: "extra", label: isModelo ? "TAGs / fabricante" : "Modelos" },
                  { key: "eq", label: "Eq.", width: 60 },
                ]}
              >
                {listaAtiva.map((m, i) => (
                  <tr key={m.id} style={zebraRow(i, m.id === destinoId, { cursor: "default" })}>
                    <td style={td}>
                      <input type="radio" name="destino-cad" checked={destinoId === m.id} onChange={() => setKeep(m.id)} />
                    </td>
                    <td style={td}>
                      <input
                        type="checkbox"
                        checked={origemIds.includes(m.id)}
                        disabled={
                          m.id === destinoId ||
                          (isModelo && Boolean(destino) && m.fabricanteId !== destino?.fabricanteId)
                        }
                        onChange={() =>
                          setOrigemIds((prev) =>
                            prev.includes(m.id) ? prev.filter((x) => x !== m.id) : [...prev, m.id],
                          )
                        }
                      />
                    </td>
                    <td style={td}>{m.nome}</td>
                    <td style={{ ...td, whiteSpace: "normal" }}>{m.extra}</td>
                    <td style={td}>{m.equipamentos}</td>
                  </tr>
                ))}
              </ZebraTable>
            </>
          )}
        </div>
      </WinForm>

      {confirm && destino && (
        <Overlay onClose={() => setConfirm(false)} fixed>
          <WinForm
            title="Confirmar consolidação"
            onCancel={() => setConfirm(false)}
            onSubmit={(e) => {
              e.preventDefault();
              void consolidar();
            }}
            busy={busy}
            showContinuar={false}
            submitLabel="Consolidar"
            width="520px"
            erro={erro}
          >
            <p style={{ fontSize: 13, margin: "0 0 10px" }}>
              Tudo passa a usar <strong>{destino.nome}</strong>. Os outros saem da lista (ficam inativos, não apaga
              histórico).
            </p>
            <ul style={{ fontSize: 13, margin: 0, paddingLeft: 18 }}>
              {origensSel.map((m) => (
                <li key={m.id}>
                  {m.nome} → {destino.nome}
                  {m.equipamentos ? ` (${m.equipamentos} eq.)` : ""}
                </li>
              ))}
            </ul>
            <p style={{ fontSize: 12, color: "#666", marginTop: 12 }}>Não dá para desfazer pela tela.</p>
          </WinForm>
        </Overlay>
      )}
    </>
  );
}

const acao = {
  background: "#e8e8e8",
  border: "1px solid #888",
  padding: "5px 14px",
  fontSize: 12,
  cursor: "pointer" as const,
};
