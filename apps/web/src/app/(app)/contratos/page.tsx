"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { FormDialog } from "@/components/ui/FormDialog";
import {
  Badge,
  Btn,
  DataTable,
  Empty,
  Err,
  FieldLabel,
  FilterBar,
  Loading,
  PageHeader,
  Panel,
  Surface,
  fieldStyle,
  td,
  th,
} from "@/components/ui/aion-ui";

interface Contrato {
  id: string;
  numero: string;
  descricao: string;
  valor: string | number;
  vigenciaFim: string;
  situacaoCalculada: string;
  alertaSeveridade: string | null;
  alertaReajuste?: { dias: number; status: string } | null;
  rateioPorEquipamento: number;
  totalGlosas: number;
  slaAtendimentoHoras?: number | null;
  slaSolucaoHoras?: number | null;
  indiceReajuste?: string | null;
  dataReajusteAniversario?: string | null;
  fornecedor: { nome: string };
  equipamentos: Array<{ equipamento: { tag: string } }>;
}

interface Matriz {
  numero: string;
  descricao: string;
  fornecedor: { nome: string };
  cobertura: Array<{ tag: string; nome: string; setor: string | null; situacao: string }>;
  slaResumo: {
    atendimentoHoras: number | null;
    solucaoHoras: number | null;
    osAbertas: number;
    osSlaEstourado: number;
  };
  osAbertas: Array<{
    codigo: string | null;
    numero: number;
    tag?: string;
    equipamento?: { tag: string };
    horasAberto: number;
    slaAtendimentoHoras: number;
    slaEstourado: boolean;
  }>;
}

interface Fornecedor {
  id: string;
  nome: string;
}

interface Alertas {
  vencimento: Contrato[];
  reajuste: Contrato[];
  slaEstourados: Array<{
    contratoNumero: string;
    osCodigo: string | null;
    osNumero: number;
    tag: string;
    horasAberto: number;
    slaHoras: number;
  }>;
}

type EditDraft = {
  numero: string;
  descricao: string;
  valor: string;
  vigenciaFim: string;
  equipamentoTags: string;
};

type GlosaDraft = { numero: string; motivo: string; valor: string };

export default function ContratosPage() {
  const [items, setItems] = useState<Contrato[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [alertas, setAlertas] = useState<Alertas | null>(null);
  const [matriz, setMatriz] = useState<Matriz | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [situacao, setSituacao] = useState("");
  const [q, setQ] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [edit, setEdit] = useState<EditDraft | null>(null);
  const [glosa, setGlosa] = useState<GlosaDraft | null>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogErro, setDialogErro] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const params = situacao ? `?situacao=${encodeURIComponent(situacao)}` : "";
      const [c, f, a] = await Promise.all([
        api<Contrato[]>(`/contratos${params}`),
        api<Fornecedor[]>("/fornecedores"),
        api<Alertas>("/contratos/alertas"),
      ]);
      setItems(c);
      setFornecedores(f);
      setAlertas(a);
      setMsg(null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [situacao]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items.filter(
      (c) =>
        c.numero.toLowerCase().includes(term) ||
        c.descricao.toLowerCase().includes(term) ||
        c.fornecedor.nome.toLowerCase().includes(term),
    );
  }, [items, q]);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const tags = String(fd.get("equipamentoTags") || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    try {
      await api("/contratos", {
        method: "POST",
        body: JSON.stringify({
          numero: String(fd.get("numero")),
          fornecedorId: String(fd.get("fornecedorId")),
          descricao: String(fd.get("descricao")),
          vigenciaInicio: String(fd.get("vigenciaInicio")),
          vigenciaFim: String(fd.get("vigenciaFim")),
          valor: Number(fd.get("valor")),
          equipamentoTags: tags,
          slaAtendimentoHoras: Number(fd.get("slaAtendimento") || 0) || undefined,
          slaSolucaoHoras: Number(fd.get("slaSolucao") || 0) || undefined,
          indiceReajuste: String(fd.get("indiceReajuste") || "IPCA"),
          dataReajusteAniversario: String(fd.get("dataReajuste") || "") || undefined,
        }),
      });
      e.currentTarget.reset();
      setShowCreate(false);
      setMsg("Contrato criado");
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erro");
    }
  }

  async function saveEdit() {
    if (!edit) return;
    setDialogBusy(true);
    setDialogErro(null);
    try {
      await api(`/contratos/${encodeURIComponent(edit.numero)}`, {
        method: "PATCH",
        body: JSON.stringify({
          descricao: edit.descricao,
          valor: Number(edit.valor),
          vigenciaFim: edit.vigenciaFim,
          equipamentoTags: edit.equipamentoTags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });
      setEdit(null);
      setMsg(`Contrato ${edit.numero} atualizado`);
      await load();
    } catch (err) {
      setDialogErro(err instanceof Error ? err.message : "Erro");
    } finally {
      setDialogBusy(false);
    }
  }

  async function saveGlosa() {
    if (!glosa) return;
    if (!glosa.motivo.trim() || !Number(glosa.valor)) {
      setDialogErro("Informe motivo e valor");
      return;
    }
    setDialogBusy(true);
    setDialogErro(null);
    try {
      await api(`/contratos/${glosa.numero}/glosas`, {
        method: "POST",
        body: JSON.stringify({ valor: Number(glosa.valor), motivo: glosa.motivo.trim() }),
      });
      setGlosa(null);
      setMsg("Glosa registrada");
      await load();
    } catch (err) {
      setDialogErro(err instanceof Error ? err.message : "Erro");
    } finally {
      setDialogBusy(false);
    }
  }

  async function openMatriz(numero: string) {
    try {
      setMatriz(await api<Matriz>(`/contratos/${numero}/matriz-cobertura`));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erro");
    }
  }

  return (
    <div>
      <PageHeader
        title="Contratos"
        subtitle="Lista · filtros · matriz de cobertura · SLA · reajuste"
        actions={
          <Btn type="button" onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? "Fechar formulário" : "Novo contrato"}
          </Btn>
        }
      />
      {msg && <Err>{msg}</Err>}

      {alertas && (alertas.slaEstourados.length > 0 || alertas.reajuste.length > 0) && (
        <div style={{ marginBottom: 14 }}>
          <Panel title="Alertas operacionais">
            {alertas.slaEstourados.slice(0, 5).map((s) => (
              <div key={`${s.contratoNumero}-${s.osNumero}`} style={{ fontSize: 13, padding: "4px 0" }}>
                SLA estourado · contrato {s.contratoNumero} · {s.osCodigo ?? `OS-${s.osNumero}`} · {s.tag} ·{" "}
                {s.horasAberto}h / {s.slaHoras}h
              </div>
            ))}
            {alertas.reajuste.slice(0, 5).map((c) => (
              <div key={c.id} style={{ fontSize: 13, padding: "4px 0" }}>
                Reajuste {c.indiceReajuste} · {c.numero} · {c.alertaReajuste?.dias}d
              </div>
            ))}
          </Panel>
        </div>
      )}

      <FilterBar>
        <div>
          <FieldLabel htmlFor="ctr-q">Busca</FieldLabel>
          <input
            id="ctr-q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Número, fornecedor…"
            style={fieldStyle}
          />
        </div>
        <div>
          <FieldLabel htmlFor="ctr-sit">Situação</FieldLabel>
          <select id="ctr-sit" value={situacao} onChange={(e) => setSituacao(e.target.value)} style={fieldStyle}>
            <option value="">Todas</option>
            <option value="VIGENTE">Vigente</option>
            <option value="A_VENCER">A vencer</option>
            <option value="VENCIDO">Vencido</option>
          </select>
        </div>
        <Btn type="button" variant="secondary" onClick={() => void load()}>
          Atualizar
        </Btn>
      </FilterBar>

      {showCreate && (
        <Surface style={{ marginBottom: 16 }}>
          <form onSubmit={(e) => void onCreate(e)} style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: 10 }}>
              <div>
                <FieldLabel htmlFor="ctr-num">Número</FieldLabel>
                <input id="ctr-num" name="numero" required style={fieldStyle} />
              </div>
              <div>
                <FieldLabel htmlFor="ctr-desc">Descrição</FieldLabel>
                <input id="ctr-desc" name="descricao" required style={fieldStyle} />
              </div>
              <div>
                <FieldLabel htmlFor="ctr-val">Valor</FieldLabel>
                <input id="ctr-val" name="valor" type="number" required style={fieldStyle} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 10 }}>
              <div>
                <FieldLabel htmlFor="ctr-forn">Fornecedor</FieldLabel>
                <select id="ctr-forn" name="fornecedorId" required defaultValue="" style={fieldStyle}>
                  <option value="" disabled>
                    Selecione…
                  </option>
                  {fornecedores.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <FieldLabel htmlFor="ctr-ini">Início</FieldLabel>
                <input id="ctr-ini" name="vigenciaInicio" type="date" required style={fieldStyle} />
              </div>
              <div>
                <FieldLabel htmlFor="ctr-fim">Fim</FieldLabel>
                <input id="ctr-fim" name="vigenciaFim" type="date" required style={fieldStyle} />
              </div>
              <div>
                <FieldLabel htmlFor="ctr-tags">TAGs</FieldLabel>
                <input id="ctr-tags" name="equipamentoTags" placeholder="EQ-0001,EQ-0002" style={fieldStyle} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 10, alignItems: "end" }}>
              <div>
                <FieldLabel htmlFor="ctr-sla-a">SLA atendimento (h)</FieldLabel>
                <input id="ctr-sla-a" name="slaAtendimento" type="number" style={fieldStyle} />
              </div>
              <div>
                <FieldLabel htmlFor="ctr-sla-s">SLA solução (h)</FieldLabel>
                <input id="ctr-sla-s" name="slaSolucao" type="number" style={fieldStyle} />
              </div>
              <div>
                <FieldLabel htmlFor="ctr-idx">Índice reajuste</FieldLabel>
                <select id="ctr-idx" name="indiceReajuste" defaultValue="IPCA" style={fieldStyle}>
                  <option value="IPCA">IPCA</option>
                  <option value="IGP_M">IGP-M</option>
                </select>
              </div>
              <div>
                <FieldLabel htmlFor="ctr-reaj">Aniversário reajuste</FieldLabel>
                <input id="ctr-reaj" name="dataReajuste" type="date" style={fieldStyle} />
              </div>
              <Btn type="submit">Criar</Btn>
            </div>
          </form>
        </Surface>
      )}

      {loading ? (
        <Loading />
      ) : (
        <DataTable>
          <thead>
            <tr>
              <th style={th}>Número</th>
              <th style={th}>Fornecedor</th>
              <th style={th}>Situação</th>
              <th style={th}>Vigência</th>
              <th style={th}>Valor</th>
              <th style={th}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id}>
                <td style={td}>
                  <strong>{c.numero}</strong>
                  <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)" }}>{c.descricao}</div>
                </td>
                <td style={td}>{c.fornecedor.nome}</td>
                <td style={td}>
                  <Badge tone={c.situacaoCalculada}>{c.situacaoCalculada}</Badge>
                  {c.alertaSeveridade && (
                    <div style={{ marginTop: 4, fontSize: 11, fontWeight: 700, color: sevColor(c.alertaSeveridade) }}>
                      alerta {c.alertaSeveridade}d
                    </div>
                  )}
                </td>
                <td style={td}>{new Date(c.vigenciaFim).toLocaleDateString("pt-BR")}</td>
                <td style={td}>
                  {Number(c.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  <div style={{ fontSize: 11, color: "oklch(0.5 0.02 250)" }}>
                    glosas {c.totalGlosas.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </div>
                </td>
                <td style={td}>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <Btn variant="secondary" size="sm" onClick={() => void openMatriz(c.numero)}>
                      Matriz
                    </Btn>
                    <Btn
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setEdit({
                          numero: c.numero,
                          descricao: c.descricao,
                          valor: String(c.valor),
                          vigenciaFim: c.vigenciaFim.slice(0, 10),
                          equipamentoTags: c.equipamentos.map((e) => e.equipamento.tag).join(", "),
                        })
                      }
                    >
                      Editar
                    </Btn>
                    <Btn
                      variant="ghost"
                      size="sm"
                      onClick={() => setGlosa({ numero: c.numero, motivo: "", valor: "" })}
                    >
                      Glosa
                    </Btn>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
      {!loading && filtered.length === 0 && <Empty text="Nenhum contrato encontrado." />}

      <FormDialog
        open={Boolean(edit)}
        title={`Editar ${edit?.numero ?? ""}`}
        busy={dialogBusy}
        erro={dialogErro}
        onCancel={() => setEdit(null)}
        onConfirm={saveEdit}
      >
        {edit && (
          <>
            <div>
              <FieldLabel htmlFor="edit-desc">Descrição</FieldLabel>
              <input
                id="edit-desc"
                value={edit.descricao}
                onChange={(e) => setEdit({ ...edit, descricao: e.target.value })}
                style={fieldStyle}
              />
            </div>
            <div>
              <FieldLabel htmlFor="edit-val">Valor (R$)</FieldLabel>
              <input
                id="edit-val"
                type="number"
                value={edit.valor}
                onChange={(e) => setEdit({ ...edit, valor: e.target.value })}
                style={fieldStyle}
              />
            </div>
            <div>
              <FieldLabel htmlFor="edit-fim">Vigência fim</FieldLabel>
              <input
                id="edit-fim"
                type="date"
                value={edit.vigenciaFim}
                onChange={(e) => setEdit({ ...edit, vigenciaFim: e.target.value })}
                style={fieldStyle}
              />
            </div>
            <div>
              <FieldLabel htmlFor="edit-tags">TAGs cobertas</FieldLabel>
              <input
                id="edit-tags"
                value={edit.equipamentoTags}
                onChange={(e) => setEdit({ ...edit, equipamentoTags: e.target.value })}
                style={fieldStyle}
              />
            </div>
          </>
        )}
      </FormDialog>

      <FormDialog
        open={Boolean(glosa)}
        title={`Glosa · ${glosa?.numero ?? ""}`}
        confirmLabel="Registrar"
        busy={dialogBusy}
        erro={dialogErro}
        onCancel={() => setGlosa(null)}
        onConfirm={saveGlosa}
      >
        {glosa && (
          <>
            <div>
              <FieldLabel htmlFor="glosa-motivo">Motivo</FieldLabel>
              <input
                id="glosa-motivo"
                value={glosa.motivo}
                onChange={(e) => setGlosa({ ...glosa, motivo: e.target.value })}
                style={fieldStyle}
              />
            </div>
            <div>
              <FieldLabel htmlFor="glosa-valor">Valor</FieldLabel>
              <input
                id="glosa-valor"
                type="number"
                value={glosa.valor}
                onChange={(e) => setGlosa({ ...glosa, valor: e.target.value })}
                style={fieldStyle}
              />
            </div>
          </>
        )}
      </FormDialog>

      {matriz && (
        <div
          role="dialog"
          aria-modal
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(16,24,40,0.35)",
            zIndex: 80,
            display: "grid",
            placeItems: "center",
            padding: 24,
          }}
          onClick={() => setMatriz(null)}
        >
          <div
            style={{ maxWidth: 640, width: "100%", maxHeight: "80vh", overflow: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <Surface>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                <div>
                  <strong>Matriz · {matriz.numero}</strong>
                  <div style={{ fontSize: 13, color: "oklch(0.5 0.02 250)" }}>
                    {matriz.fornecedor.nome} · {matriz.descricao}
                  </div>
                </div>
                <Btn variant="ghost" onClick={() => setMatriz(null)}>
                  Fechar
                </Btn>
              </div>
              <div style={{ fontSize: 13, marginBottom: 10 }}>
                SLA {matriz.slaResumo.atendimentoHoras ?? "—"}h / {matriz.slaResumo.solucaoHoras ?? "—"}h ·{" "}
                {matriz.slaResumo.osAbertas} OS abertas · {matriz.slaResumo.osSlaEstourado} estouradas
              </div>
              <div style={{ display: "grid", gap: 6, marginBottom: 14 }}>
                {matriz.cobertura.length === 0 ? (
                  <div style={{ fontSize: 13 }}>Sem equipamentos cobertos</div>
                ) : (
                  matriz.cobertura.map((eq) => (
                    <div
                      key={eq.tag}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: 13,
                        padding: "6px 0",
                        borderTop: "1px solid oklch(0.94 0.005 255)",
                      }}
                    >
                      <span>
                        <strong>{eq.tag}</strong> · {eq.nome}
                      </span>
                      <span style={{ color: "oklch(0.5 0.02 250)" }}>
                        {eq.setor ?? "—"} · {eq.situacao}
                      </span>
                    </div>
                  ))
                )}
              </div>
              {matriz.osAbertas.length > 0 && (
                <div>
                  <strong style={{ fontSize: 13 }}>OS sob cobertura</strong>
                  {matriz.osAbertas.map((os) => (
                    <div key={os.numero} style={{ fontSize: 12, padding: "4px 0" }}>
                      {os.codigo ?? `OS-${os.numero}`} · {os.equipamento?.tag ?? os.tag} · {os.horasAberto}h
                      {os.slaEstourado ? " · SLA estourado" : ""}
                    </div>
                  ))}
                </div>
              )}
            </Surface>
          </div>
        </div>
      )}
    </div>
  );
}

function sevColor(s: string | null) {
  if (s === "VENCIDO" || s === "30") return "oklch(0.5 0.17 25)";
  if (s === "60") return "oklch(0.55 0.14 85)";
  if (s === "90") return "oklch(0.55 0.14 255)";
  return "oklch(0.45 0.13 150)";
}
