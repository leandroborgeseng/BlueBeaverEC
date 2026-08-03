"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  Badge,
  Btn,
  Err,
  FieldLabel,
  PageHeader,
  Surface,
  fieldStyle,
} from "@/components/ui/nexo-ui";

interface Contrato {
  id: string;
  numero: string;
  descricao: string;
  valor: string | number;
  vigenciaFim: string;
  situacaoCalculada: string;
  alertaSeveridade: string | null;
  rateioPorEquipamento: number;
  totalGlosas: number;
  fornecedor: { nome: string };
  equipamentos: Array<{ equipamento: { tag: string } }>;
}

interface Fornecedor {
  id: string;
  nome: string;
}

export default function ContratosPage() {
  const [items, setItems] = useState<Contrato[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const [c, f] = await Promise.all([
      api<Contrato[]>("/contratos"),
      api<Fornecedor[]>("/fornecedores"),
    ]);
    setItems(c);
    setFornecedores(f);
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
          indiceReajuste: "IPCA",
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

  return (
    <div>
      <PageHeader title="Contratos" subtitle="N:N com equipamentos · rateio igualitário · alertas 90/60/30" />
      {msg && <Err>{msg}</Err>}

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
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr auto", gap: 10, alignItems: "end" }}>
            <div>
              <FieldLabel>Fornecedor</FieldLabel>
              <select name="fornecedorId" required defaultValue="" style={fieldStyle}>
                <option value="" disabled>Fornecedor</option>
                {fornecedores.map((f) => (
                  <option key={f.id} value={f.id}>{f.nome}</option>
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
            <Btn variant="secondary" style={{ marginTop: 10 }} onClick={() => void glosa(c.numero)}>
              Registrar glosa
            </Btn>
          </Surface>
        ))}
      </div>
    </div>
  );
}

function sevColor(s: string | null) {
  if (s === "VENCIDO" || s === "30") return "oklch(0.5 0.17 25)";
  if (s === "60") return "oklch(0.55 0.14 85)";
  if (s === "90") return "oklch(0.55 0.14 255)";
  return "oklch(0.45 0.13 150)";
}
