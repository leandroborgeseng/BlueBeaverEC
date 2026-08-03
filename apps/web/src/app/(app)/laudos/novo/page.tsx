"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useWindowStore } from "@/store/windows";
import {
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
  itens: Array<{ id?: string; pergunta?: string; valorPadrao?: number; limite?: number }>;
}

interface Colaborador {
  id: string;
  nome: string;
  registroProfissional?: string | null;
}

interface Inst {
  id: string;
  nome: string;
  nSerie: string;
  selecionavel: boolean;
}

export default function NovoLaudoPage() {
  const openWindow = useWindowStore((s) => s.open);
  const [tipo, setTipo] = useState("PREVENTIVA");
  const [procs, setProcs] = useState<Proc[]>([]);
  const [cols, setCols] = useState<Colaborador[]>([]);
  const [insts, setInsts] = useState<Inst[]>([]);
  const [procId, setProcId] = useState("");
  const [respostas, setRespostas] = useState<
    Array<{ id?: string; pergunta?: string; status?: string; valorMedido?: number; erroPct?: number; limite?: number; observacao?: string }>
  >([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [laudoId, setLaudoId] = useState<string | null>(null);

  const proc = useMemo(() => procs.find((p) => p.id === procId), [procs, procId]);

  useEffect(() => {
    void Promise.all([
      api<Proc[]>(`/procedimentos-laudo?tipo=${tipo}`),
      api<Colaborador[]>("/colaboradores"),
      api<Inst[]>("/instrumentos-padroes"),
    ]).then(([p, c, i]) => {
      setProcs(p);
      setCols(c);
      setInsts(i.filter((x) => x.selecionavel));
      setProcId(p[0]?.id ?? "");
    });
  }, [tipo]);

  useEffect(() => {
    if (!proc) {
      setRespostas([]);
      return;
    }
    setRespostas(
      (proc.itens ?? []).map((item) => ({
        id: item.id,
        pergunta: item.pergunta,
        status: tipo === "CALIBRACAO" || tipo === "TSE" ? "APROVADO" : "SIM",
        valorMedido: item.valorPadrao,
        limite: item.limite,
        erroPct: 0,
      })),
    );
  }, [proc, tipo]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    const fd = new FormData(e.currentTarget);
    const criterio = Number(fd.get("criterioAceitacao") || 2);

    const computed = respostas.map((r) => {
      if (tipo === "CALIBRACAO" && r.valorMedido != null && proc) {
        const padrao = proc.itens.find((i) => i.id === r.id)?.valorPadrao ?? 0;
        const erroPct = padrao === 0 ? 0 : Number((((r.valorMedido - padrao) / padrao) * 100).toFixed(2));
        return {
          ...r,
          erroPct,
          limite: criterio,
          status: Math.abs(erroPct) <= criterio ? "APROVADO" : "REPROVADO",
        };
      }
      if (tipo === "TSE" && r.valorMedido != null && r.limite != null) {
        return {
          ...r,
          status: r.valorMedido <= r.limite ? "APROVADO" : "REPROVADO",
        };
      }
      return r;
    });

    try {
      const laudo = await api<{ id: string; numero: string; resultado: string }>("/laudos", {
        method: "POST",
        body: JSON.stringify({
          tipo,
          equipamentoTag: String(fd.get("equipamentoTag")),
          procedimentoId: procId || undefined,
          instrumentoId: String(fd.get("instrumentoId") || "") || undefined,
          responsavelTecnicoId: String(fd.get("responsavelTecnicoId") || "") || undefined,
          tecnicoNome: String(fd.get("tecnicoNome") || "") || undefined,
          respostas: computed,
          metadados: {
            criterioAceitacao: criterio,
            norma: String(fd.get("norma") || ""),
            proximaPreventiva: String(fd.get("proximaPreventiva") || "") || undefined,
          },
          justificativaRessalva: String(fd.get("justificativaRessalva") || "") || undefined,
        }),
      });
      setLaudoId(laudo.id);
      setMsg(`${laudo.numero} salvo · resultado ${laudo.resultado}`);
      setRespostas(computed);
      openWindow({
        kind: "laudo",
        title: `Laudo ${laudo.numero}`,
        payload: { id: laudo.id },
      });
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erro");
    }
  }

  async function gerarOs() {
    if (!laudoId) return;
    try {
      const res = await api<{ os: { codigo: string }; problemas: number }>(
        `/laudos/${laudoId}/gerar-os-corretiva`,
        { method: "POST" },
      );
      setMsg(`OS ${res.os.codigo} criada com ${res.problemas} NC agregadas`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erro");
    }
  }

  return (
    <div style={{ maxWidth: 820 }}>
      <PageHeader
        title="Novo Laudo"
        subtitle="Recebimento · Preventiva · Calibração · TSE · Qualificação"
        actions={
          <Btn
            variant="secondary"
            onClick={() =>
              openWindow({
                kind: "laudo",
                title: "Novo Laudo",
                payload: { tipo, equipamentoTag: "EQ-0001" },
              })
            }
          >
            Abrir em janela
          </Btn>
        }
      />

      <Surface>
        <form onSubmit={(e) => void onSubmit(e)} style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <FieldLabel>Tipo</FieldLabel>
              <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={fieldStyle}>
                <option value="RECEBIMENTO">Recebimento</option>
                <option value="PREVENTIVA">Preventiva</option>
                <option value="CALIBRACAO">Calibração</option>
                <option value="TSE">TSE</option>
                <option value="QUALIFICACAO">Qualificação</option>
              </select>
            </div>
            <div>
              <FieldLabel>TAG equipamento</FieldLabel>
              <input name="equipamentoTag" placeholder="TAG equipamento" required defaultValue="EQ-0001" style={fieldStyle} />
            </div>
          </div>

          <div>
            <FieldLabel>Procedimento</FieldLabel>
            <select value={procId} onChange={(e) => setProcId(e.target.value)} style={fieldStyle}>
              <option value="">Procedimento</option>
              {procs.map((p) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>
          </div>

          {(tipo === "CALIBRACAO" || tipo === "TSE") && (
            <>
              <div>
                <FieldLabel>Responsável técnico (CREA)</FieldLabel>
                <select name="responsavelTecnicoId" required style={fieldStyle} defaultValue="">
                  <option value="" disabled>Responsável técnico (CREA)</option>
                  {cols.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}{c.registroProfissional ? ` · ${c.registroProfissional}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <FieldLabel>Instrumento padrão</FieldLabel>
                <select name="instrumentoId" style={fieldStyle} defaultValue="">
                  <option value="">Instrumento padrão</option>
                  {insts.map((i) => (
                    <option key={i.id} value={i.id}>{i.nome} · {i.nSerie}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {(tipo === "RECEBIMENTO" || tipo === "PREVENTIVA") && (
            <div>
              <FieldLabel>Nome do técnico</FieldLabel>
              <input name="tecnicoNome" placeholder="Nome do técnico" style={fieldStyle} />
            </div>
          )}

          {tipo === "CALIBRACAO" && (
            <div>
              <FieldLabel>Critério ±%</FieldLabel>
              <input name="criterioAceitacao" type="number" step="0.1" defaultValue={2} placeholder="Critério ±%" style={fieldStyle} />
            </div>
          )}
          {tipo === "TSE" && (
            <div>
              <FieldLabel>Norma</FieldLabel>
              <select name="norma" defaultValue="EC" style={fieldStyle}>
                <option value="FABRICA">Ensaio de Fábrica</option>
                <option value="EC">NBR IEC 60601-1 / EC</option>
              </select>
            </div>
          )}
          {tipo === "PREVENTIVA" && (
            <div>
              <FieldLabel>Próxima preventiva</FieldLabel>
              <input name="proximaPreventiva" type="date" style={fieldStyle} />
            </div>
          )}

          <div style={{ display: "grid", gap: 8 }}>
            <FieldLabel>Checklist / Pontos / Testes</FieldLabel>
            {respostas.map((r, idx) => (
              <div key={r.id ?? idx} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 13 }}>{r.pergunta}</span>
                {(tipo === "CALIBRACAO" || tipo === "TSE") ? (
                  <input
                    type="number"
                    step="0.01"
                    value={r.valorMedido ?? ""}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setRespostas((prev) => prev.map((x, i) => (i === idx ? { ...x, valorMedido: v } : x)));
                    }}
                    style={fieldStyle}
                  />
                ) : (
                  <select
                    value={r.status}
                    onChange={(e) =>
                      setRespostas((prev) => prev.map((x, i) => (i === idx ? { ...x, status: e.target.value } : x)))
                    }
                    style={fieldStyle}
                  >
                    <option value="SIM">Sim</option>
                    <option value="NAO">Não</option>
                    <option value="NA">N/A</option>
                  </select>
                )}
                <input
                  placeholder="Obs."
                  value={r.observacao ?? ""}
                  onChange={(e) =>
                    setRespostas((prev) => prev.map((x, i) => (i === idx ? { ...x, observacao: e.target.value } : x)))
                  }
                  style={fieldStyle}
                />
              </div>
            ))}
          </div>

          <div>
            <FieldLabel>Justificativa ressalva</FieldLabel>
            <input name="justificativaRessalva" placeholder="Justificativa ressalva (se aplicável)" style={fieldStyle} />
          </div>

          <Btn type="submit">Salvar laudo</Btn>
          {laudoId && (
            <Btn type="button" variant="secondary" onClick={() => void gerarOs()}>
              Gerar OS Corretiva (agregada)
            </Btn>
          )}
          {msg && <div style={{ fontSize: 13, fontWeight: 600 }}>{msg}</div>}
        </form>
      </Surface>

      <p style={{ marginTop: 16, fontSize: 13 }}>
        <a href="/equipamentos/EQ-0001/ficha-vida">Ver Ficha Vida EQ-0001 →</a>
      </p>
    </div>
  );
}
