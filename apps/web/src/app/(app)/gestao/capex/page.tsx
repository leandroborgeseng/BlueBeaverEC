"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { FormDialog } from "@/components/ui/FormDialog";
import {
  Badge,
  Btn,
  DataTable,
  Empty,
  FieldLabel,
  PageHeader,
  Panel,
  Surface,
  fieldStyle,
  td,
  th,
} from "@/components/ui/aion-ui";

interface Cand {
  equipamentoId: string;
  tag: string;
  nome: string;
  idadeAnos: number;
  custoAcumulado: number;
  prioridade: number;
  flags: { anvisaVencida: boolean; eos: boolean; eol: boolean };
  criterio: string[];
}

interface Capex {
  id: string;
  descricao: string;
  valorEstimado: string | number;
  justificativa: string;
  status: string;
  origem: string;
}

interface Plano {
  id: string;
  iniciativa: string;
  horizonteTexto?: string | null;
  status: string;
  investimentoPrevisto?: string | number | null;
}

export default function CapexPage() {
  const [cands, setCands] = useState<Cand[]>([]);
  const [capex, setCapex] = useState<Capex[]>([]);
  const [plano, setPlano] = useState<Plano[]>([]);
  const [tab, setTab] = useState<"sub" | "capex" | "plano">("sub");
  const [msg, setMsg] = useState<string | null>(null);
  const [capexDraft, setCapexDraft] = useState<{
    cand: Cand;
    valor: string;
    justificativa: string;
  } | null>(null);

  async function load() {
    const [c, x, p] = await Promise.all([
      api<Cand[]>("/gestao/substituicao-tecnologica"),
      api<Capex[]>("/gestao/capex"),
      api<Plano[]>("/gestao/plano-diretor"),
    ]);
    setCands(c);
    setCapex(x);
    setPlano(p);
  }

  useEffect(() => {
    void load().catch((e) => setMsg(e.message));
  }, []);

  async function gerarCapex(c: Cand) {
    setCapexDraft({
      cand: c,
      valor: "50000",
      justificativa: `Substituição ${c.tag}`,
    });
  }

  async function gerarAutomatico() {
    const res = await api<{ criados: number; candidatos: number; minScore: number }>(
      "/gestao/capex/gerar-automatico",
      { method: "POST", body: JSON.stringify({ minScore: 40 }) },
    );
    setMsg(`CAPEX automático: ${res.criados} criado(s) de ${res.candidatos} candidato(s) (score ≥ ${res.minScore})`);
    setTab("capex");
    await load();
  }

  async function createCapex(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await api("/gestao/capex", {
      method: "POST",
      body: JSON.stringify({
        descricao: String(fd.get("descricao")),
        valorEstimado: Number(fd.get("valor")),
        justificativa: String(fd.get("justificativa")),
        origem: "MANUAL",
      }),
    });
    e.currentTarget.reset();
    await load();
  }

  async function status(id: string, status: string) {
    await api(`/gestao/capex/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    await load();
  }

  async function createPlano(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await api("/gestao/plano-diretor", {
      method: "POST",
      body: JSON.stringify({
        iniciativa: String(fd.get("iniciativa")),
        horizonteTexto: String(fd.get("horizonte") || "") || undefined,
        investimentoPrevisto: Number(fd.get("investimento") || 0) || undefined,
      }),
    });
    e.currentTarget.reset();
    await load();
  }

  return (
    <div>
      <PageHeader title="CAPEX e Plano Diretor" subtitle="Scoring Anvisa/EoS/EoL · custo OS · geração automática" />
      {msg && <div style={{ marginBottom: 10, fontSize: 13, fontWeight: 600 }}>{msg}</div>}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {([
          ["sub", "Substituição"],
          ["capex", "CAPEX"],
          ["plano", "Plano Diretor"],
        ] as const).map(([k, l]) => (
          <Btn key={k} variant={tab === k ? "primary" : "ghost"} onClick={() => setTab(k)}>
            {l}
          </Btn>
        ))}
        <Btn variant="secondary" onClick={() => void gerarAutomatico()}>
          Gerar CAPEX automático
        </Btn>
      </div>

      {tab === "sub" && (
        <div style={{ display: "grid", gap: 10 }}>
          {cands.length === 0 && <Empty text="Nenhum candidato no momento" />}
          {cands.map((c) => (
            <Panel
              key={c.equipamentoId}
              title={`${c.tag} · ${c.nome}`}
              action={<Btn variant="secondary" onClick={() => void gerarCapex(c)}>Gerar CAPEX</Btn>}
            >
              <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)", marginBottom: 6 }}>
                Prioridade {c.prioridade} · idade {c.idadeAnos}a · custo R$ {c.custoAcumulado} · {c.criterio.join(", ")}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {c.flags.anvisaVencida && <Badge tone="VENCIDO">Anvisa vencida</Badge>}
                {c.flags.eos && <Badge tone="MEDIA">EoS</Badge>}
                {c.flags.eol && <Badge tone="ALTA">EoL</Badge>}
              </div>
            </Panel>
          ))}
        </div>
      )}

      {tab === "capex" && (
        <div>
          <Surface style={{ marginBottom: 14 }}>
            <form onSubmit={(e) => void createCapex(e)} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 2fr auto", gap: 10, alignItems: "end" }}>
              <div>
                <FieldLabel>Descrição</FieldLabel>
                <input name="descricao" placeholder="Descrição" required style={fieldStyle} />
              </div>
              <div>
                <FieldLabel>Valor</FieldLabel>
                <input name="valor" type="number" placeholder="Valor" required style={fieldStyle} />
              </div>
              <div>
                <FieldLabel>Justificativa</FieldLabel>
                <input name="justificativa" placeholder="Justificativa" required style={fieldStyle} />
              </div>
              <Btn type="submit">Lançar</Btn>
            </form>
          </Surface>
          <DataTable>
            <thead>
              <tr>
                <th style={th}>Descrição</th>
                <th style={th}>Status</th>
                <th style={th}>Origem</th>
                <th style={th}>Valor</th>
                <th style={th}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {capex.length === 0 ? (
                <tr>
                  <td colSpan={5} style={td}><Empty /></td>
                </tr>
              ) : (
                capex.map((c) => (
                  <tr key={c.id}>
                    <td style={td}>
                      <strong>{c.descricao}</strong>
                      <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)" }}>{c.justificativa}</div>
                    </td>
                    <td style={td}><Badge tone={c.status}>{c.status}</Badge></td>
                    <td style={td}>{c.origem}</td>
                    <td style={td}>R$ {Number(c.valorEstimado).toLocaleString("pt-BR")}</td>
                    <td style={td}>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {["PROPOSTO", "APROVADO", "EXECUTADO"].map((s) => (
                          <Btn key={s} variant={c.status === s ? "primary" : "ghost"} style={{ fontSize: 11, padding: "4px 8px" }} onClick={() => void status(c.id, s)}>
                            {s}
                          </Btn>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </DataTable>
        </div>
      )}

      {tab === "plano" && (
        <div>
          <Surface style={{ marginBottom: 14 }}>
            <form onSubmit={(e) => void createPlano(e)} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 10, alignItems: "end" }}>
              <div>
                <FieldLabel>Iniciativa</FieldLabel>
                <input name="iniciativa" placeholder="Iniciativa" required style={fieldStyle} />
              </div>
              <div>
                <FieldLabel>Horizonte</FieldLabel>
                <input name="horizonte" placeholder="Horizonte (texto)" style={fieldStyle} />
              </div>
              <div>
                <FieldLabel>Investimento</FieldLabel>
                <input name="investimento" type="number" placeholder="Investimento" style={fieldStyle} />
              </div>
              <Btn type="submit">Adicionar</Btn>
            </form>
          </Surface>
          <div style={{ display: "grid", gap: 10 }}>
            {plano.map((p) => (
              <Panel key={p.id} title={p.iniciativa}>
                <Badge tone={p.status}>{p.status}</Badge>
                <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)", marginTop: 6 }}>
                  {p.horizonteTexto || "Documento vivo — sem horizonte fixo"}
                </div>
                {p.investimentoPrevisto != null && (
                  <div style={{ fontSize: 13, marginTop: 4 }}>R$ {Number(p.investimentoPrevisto).toLocaleString("pt-BR")}</div>
                )}
              </Panel>
            ))}
          </div>
        </div>
      )}

      <FormDialog
        open={Boolean(capexDraft)}
        title={capexDraft ? `CAPEX · ${capexDraft.cand.tag}` : "CAPEX"}
        confirmLabel="Propor"
        onCancel={() => setCapexDraft(null)}
        onConfirm={async () => {
          if (!capexDraft?.justificativa.trim()) return;
          await api("/gestao/capex", {
            method: "POST",
            body: JSON.stringify({
              descricao: `Substituição ${capexDraft.cand.tag} — ${capexDraft.cand.nome}`,
              valorEstimado: Number(capexDraft.valor) || 0,
              justificativa: capexDraft.justificativa.trim(),
              equipamentoOrigemId: capexDraft.cand.equipamentoId,
              origem: "SUBSTITUICAO",
            }),
          });
          setCapexDraft(null);
          setMsg("CAPEX proposto a partir da substituição");
          setTab("capex");
          await load();
        }}
      >
        {capexDraft && (
          <>
            <div>
              <FieldLabel htmlFor="capex-val">Valor estimado</FieldLabel>
              <input
                id="capex-val"
                type="number"
                value={capexDraft.valor}
                onChange={(e) => setCapexDraft({ ...capexDraft, valor: e.target.value })}
                style={fieldStyle}
              />
            </div>
            <div>
              <FieldLabel htmlFor="capex-just">Justificativa</FieldLabel>
              <input
                id="capex-just"
                value={capexDraft.justificativa}
                onChange={(e) => setCapexDraft({ ...capexDraft, justificativa: e.target.value })}
                style={fieldStyle}
              />
            </div>
          </>
        )}
      </FormDialog>
    </div>
  );
}
