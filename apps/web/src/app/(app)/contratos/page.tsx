"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  Badge,
  Btn,
  Err,
  FieldLabel,
  PageHeader,
  Panel,
  Surface,
  fieldStyle,
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
  alertaReajuste?: { dias: number; status: string } | null;
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

export default function ContratosPage() {
  const [items, setItems] = useState<Contrato[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [alertas, setAlertas] = useState<Alertas | null>(null);
  const [matriz, setMatriz] = useState<Matriz | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const [c, f, a] = await Promise.all([
      api<Contrato[]>("/contratos"),
      api<Fornecedor[]>("/fornecedores"),
      api<Alertas>("/contratos/alertas"),
    ]);
    setItems(c);
    setFornecedores(f);
    setAlertas(a);
  }

  useEffect(() => {
    void load().catch((e) => setMsg(e.message));
  }, []);

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
      setMsg("Contrato criado");
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erro");
    }
  }

  async function glosa(numero: string) {
    const motivo = window.prompt("Motivo da glosa:");
    const valor = Number(window.prompt("Valor da glosa:") || 0);
    if (!motivo || !valor) return;
    try {
      await api(`/contratos/${numero}/glosas`, {
        method: "POST",
        body: JSON.stringify({ valor, motivo }),
      });
      setMsg("Glosa registrada");
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erro");
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
      <PageHeader title="Contratos" subtitle="Matriz de cobertura · SLA · reajuste · alertas 90/60/30" />
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

      <Surface style={{ marginBottom: 16 }}>
        <form onSubmit={(e) => void onCreate(e)} style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: 10 }}>
            <div>
              <FieldLabel>Número</FieldLabel>
              <input name="numero" placeholder="Número" required style={fieldStyle} />
            </div>
            <div>
              <FieldLabel>Descrição</FieldLabel>
              <input name="descricao" placeholder="Descrição" required style={fieldStyle} />
            </div>
            <div>
              <FieldLabel>Valor</FieldLabel>
              <input name="valor" type="number" placeholder="Valor" required style={fieldStyle} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 10 }}>
            <div>
              <FieldLabel>Fornecedor</FieldLabel>
              <select name="fornecedorId" required defaultValue="" style={fieldStyle}>
                <option value="" disabled>
                  Fornecedor
                </option>
                {fornecedores.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>Início</FieldLabel>
              <input name="vigenciaInicio" type="date" required style={fieldStyle} />
            </div>
            <div>
              <FieldLabel>Fim</FieldLabel>
              <input name="vigenciaFim" type="date" required style={fieldStyle} />
            </div>
            <div>
              <FieldLabel>TAGs</FieldLabel>
              <input name="equipamentoTags" placeholder="EQ-0001,EQ-0002" style={fieldStyle} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 10, alignItems: "end" }}>
            <div>
              <FieldLabel>SLA atendimento (h)</FieldLabel>
              <input name="slaAtendimento" type="number" placeholder="24" style={fieldStyle} />
            </div>
            <div>
              <FieldLabel>SLA solução (h)</FieldLabel>
              <input name="slaSolucao" type="number" placeholder="72" style={fieldStyle} />
            </div>
            <div>
              <FieldLabel>Índice reajuste</FieldLabel>
              <select name="indiceReajuste" defaultValue="IPCA" style={fieldStyle}>
                <option value="IPCA">IPCA</option>
                <option value="IGP_M">IGP-M</option>
              </select>
            </div>
            <div>
              <FieldLabel>Aniversário reajuste</FieldLabel>
              <input name="dataReajuste" type="date" style={fieldStyle} />
            </div>
            <Btn type="submit">+</Btn>
          </div>
        </form>
      </Surface>

      <div style={{ display: "grid", gap: 10 }}>
        {items.map((c) => (
          <Surface key={c.id}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <strong>{c.numero}</strong> · {c.fornecedor.nome}
                <div style={{ fontSize: 13, color: "oklch(0.5 0.02 250)" }}>{c.descricao}</div>
              </div>
              <div style={{ textAlign: "right", fontSize: 12 }}>
                <Badge tone={c.situacaoCalculada}>{c.situacaoCalculada}</Badge>
                {c.alertaSeveridade ? (
                  <div style={{ marginTop: 6, fontWeight: 700, color: sevColor(c.alertaSeveridade) }}>
                    alerta {c.alertaSeveridade}d
                  </div>
                ) : null}
                {c.alertaReajuste ? (
                  <div style={{ marginTop: 4, fontWeight: 600, color: "oklch(0.55 0.14 85)" }}>
                    reajuste {c.alertaReajuste.dias}d
                  </div>
                ) : null}
                <div style={{ marginTop: 4, color: "oklch(0.5 0.02 250)" }}>
                  Fim {new Date(c.vigenciaFim).toLocaleDateString("pt-BR")}
                </div>
              </div>
            </div>
            <div style={{ marginTop: 8, fontSize: 13 }}>
              Valor {Number(c.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              {" · "}rateio {c.rateioPorEquipamento.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              {" · "}glosas {c.totalGlosas.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              {" · "}{c.equipamentos.map((e) => e.equipamento.tag).join(", ") || "sem cobertura"}
            </div>
            {(c.slaAtendimentoHoras || c.slaSolucaoHoras) && (
              <div style={{ marginTop: 4, fontSize: 12, color: "oklch(0.5 0.02 250)" }}>
                SLA {c.slaAtendimentoHoras ?? "—"}h atendimento / {c.slaSolucaoHoras ?? "—"}h solução
                {c.indiceReajuste ? ` · ${c.indiceReajuste}` : ""}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <Btn variant="secondary" onClick={() => void openMatriz(c.numero)}>
                Matriz de cobertura
              </Btn>
              <Btn variant="ghost" onClick={() => void glosa(c.numero)}>
                Registrar glosa
              </Btn>
            </div>
          </Surface>
        ))}
      </div>

      {matriz && (
        <div
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
