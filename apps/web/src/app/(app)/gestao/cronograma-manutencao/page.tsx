"use client";

import { useEffect, useMemo, useState } from "react";
import { api, downloadApi } from "@/lib/api";
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
} from "@/components/ui/nexo-ui";

type RampResult = {
  dryRun: boolean;
  inicio: string;
  fim: string;
  horizonteDias: number;
  periodicidadeMeses: number;
  equipamentosComPlano: number;
  equipamentosSemTeste: number;
  jobsPlanejados?: number;
  osCriadas?: number;
  pulados: number;
  porTipo: Record<string, number>;
  amostra: Array<{ codigo?: string; tag: string; tipo: string; abertura: string; procedimento?: string }>;
};

type CalEvento = {
  codigo: string;
  tipo: string;
  status: string;
  abertura: string;
  semana: string;
  mes: string;
  tag: string;
  equipamento: string;
  setor: string;
};

type Calendario = {
  de: string;
  ate: string;
  total: number;
  porTipo: Record<string, number>;
  anual: Array<{ mes: number; label: string; total: number; porTipo: Record<string, number> }>;
  porSemana: Record<string, number>;
  eventos: CalEvento[];
};

type Vista = "anual" | "mensal" | "semanal";

function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

export default function CronogramaManutencaoPage() {
  const year = new Date().getFullYear();
  const [de, setDe] = useState(`${year}-01-01`);
  const [ate, setAte] = useState(`${year}-12-31`);
  const [vista, setVista] = useState<Vista>("mensal");
  const [semanaSel, setSemanaSel] = useState(isoWeekKey(new Date()));
  const [cal, setCal] = useState<Calendario | null>(null);
  const [preview, setPreview] = useState<RampResult | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadCal() {
    const data = await api<Calendario>(
      `/planos/calendario?de=${encodeURIComponent(de)}&ate=${encodeURIComponent(ate)}`,
    );
    setCal(data);
  }

  useEffect(() => {
    void loadCal().catch((e) => setErro(e instanceof Error ? e.message : "Erro"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mesAtual = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }, []);

  const semanasDisponiveis = useMemo(
    () => (cal ? Object.keys(cal.porSemana).sort() : []),
    [cal],
  );

  const eventosFiltrados = useMemo(() => {
    if (!cal) return [];
    if (vista === "anual") return cal.eventos;
    if (vista === "mensal") return cal.eventos.filter((e) => e.mes === mesAtual);
    const semana =
      semanasDisponiveis.includes(semanaSel) ? semanaSel : semanasDisponiveis[0] ?? semanaSel;
    return cal.eventos.filter((e) => e.semana === semana);
  }, [cal, vista, mesAtual, semanaSel, semanasDisponiveis]);

  async function previewRamp() {
    setBusy(true);
    setErro(null);
    setMsg(null);
    try {
      const res = await api<RampResult>("/planos/ramp-up/preview", {
        method: "POST",
        body: JSON.stringify({ horizonteDias: 90, forcarAnual: true }),
      });
      setPreview(res);
      setMsg(
        `Prévia: ${res.jobsPlanejados} OS em ${res.horizonteDias} dias (P=${res.porTipo.PREVENTIVA} · C=${res.porTipo.CALIBRACAO} · T=${res.porTipo.TSE})`,
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  async function gerarRamp() {
    if (
      !window.confirm(
        "Isso cria OS abertas de preventiva, TSE e calibração para todos os equipamentos com plano, espalhadas nos próximos 90 dias (periodicidade anual). Continuar?",
      )
    ) {
      return;
    }
    setBusy(true);
    setErro(null);
    setMsg(null);
    try {
      const res = await api<RampResult>("/planos/ramp-up", {
        method: "POST",
        body: JSON.stringify({ horizonteDias: 90, forcarAnual: true }),
      });
      setPreview(res);
      setMsg(`Ramp-up gerado: ${res.osCriadas} OS criadas · ${res.pulados} puladas`);
      await loadCal();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  async function exportRelatorio(formato: "xlsx" | "pdf") {
    setBusy(true);
    setErro(null);
    try {
      const name = await downloadApi(
        "/relatorios/gerar",
        {
          method: "POST",
          body: JSON.stringify({
            template: "calendario_manutencao",
            formato,
            de,
            ate,
          }),
        },
        `calendario_manutencao.${formato}`,
      );
      setMsg(`Download: ${name}`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro no export");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Cronograma de Manutenção"
        subtitle="Ramp-up em 3 meses (plano anual) e calendário exportável anual / mensal / semanal"
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Btn type="button" variant="secondary" disabled={busy} onClick={() => void previewRamp()}>
              Prévia ramp-up
            </Btn>
            <Btn type="button" disabled={busy} onClick={() => void gerarRamp()}>
              Gerar plano 3 meses
            </Btn>
            <Btn type="button" variant="secondary" disabled={busy} onClick={() => void exportRelatorio("pdf")}>
              Exportar PDF
            </Btn>
            <Btn type="button" variant="secondary" disabled={busy} onClick={() => void exportRelatorio("xlsx")}>
              Exportar XLSX
            </Btn>
          </div>
        }
      />

      {erro && <Err>{erro}</Err>}
      {msg && (
        <div style={{ fontSize: 13, fontWeight: 600, color: "oklch(0.4 0.14 150)", marginBottom: 12 }}>
          {msg}
        </div>
      )}

      {preview && (
        <Surface style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
            <span>
              <strong>{preview.dryRun ? "Prévia" : "Gerado"}</strong> · {preview.horizonteDias} dias ·
              anual {preview.periodicidadeMeses}m
            </span>
            <span>Equip. com plano: {preview.equipamentosComPlano}</span>
            <span>Sem teste: {preview.equipamentosSemTeste}</span>
            <span>OS: {preview.osCriadas ?? preview.jobsPlanejados}</span>
            <span>Puladas: {preview.pulados}</span>
            {Object.entries(preview.porTipo).map(([k, v]) => (
              <Badge key={k} tone="info">
                {k}: {v}
              </Badge>
            ))}
          </div>
        </Surface>
      )}

      <Surface style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
          <div>
            <FieldLabel>De</FieldLabel>
            <input type="date" value={de} onChange={(e) => setDe(e.target.value)} style={fieldStyle} />
          </div>
          <div>
            <FieldLabel>Até</FieldLabel>
            <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} style={fieldStyle} />
          </div>
          <Btn
            type="button"
            variant="secondary"
            onClick={() => void loadCal().catch((e) => setErro(e instanceof Error ? e.message : "Erro"))}
          >
            Atualizar
          </Btn>
          <div style={{ display: "flex", gap: 6, marginLeft: "auto", alignItems: "end", flexWrap: "wrap" }}>
            {(["anual", "mensal", "semanal"] as Vista[]).map((v) => (
              <Btn
                key={v}
                type="button"
                size="sm"
                variant={vista === v ? undefined : "ghost"}
                onClick={() => setVista(v)}
              >
                {v}
              </Btn>
            ))}
            {vista === "semanal" && semanasDisponiveis.length > 0 && (
              <select
                value={semanasDisponiveis.includes(semanaSel) ? semanaSel : semanasDisponiveis[0]}
                onChange={(e) => setSemanaSel(e.target.value)}
                style={{ ...fieldStyle, minWidth: 120 }}
              >
                {semanasDisponiveis.map((s) => (
                  <option key={s} value={s}>
                    {s} ({cal?.porSemana[s] ?? 0})
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </Surface>

      {cal && vista === "anual" && (
        <Surface style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Visão anual · {cal.total} OS</div>
          <DataTable>
            <thead>
              <tr>
                <th style={th}>Mês</th>
                <th style={th}>Total</th>
                <th style={th}>Preventiva</th>
                <th style={th}>Calibração</th>
                <th style={th}>TSE</th>
              </tr>
            </thead>
            <tbody>
              {cal.anual.map((m) => (
                <tr key={m.mes}>
                  <td style={td}>{m.label}</td>
                  <td style={td}>{m.total}</td>
                  <td style={td}>{m.porTipo.PREVENTIVA ?? 0}</td>
                  <td style={td}>{m.porTipo.CALIBRACAO ?? 0}</td>
                  <td style={td}>{m.porTipo.TSE ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Surface>
      )}

      <DataTable>
        <thead>
          <tr>
            <th style={th}>Data</th>
            <th style={th}>OS</th>
            <th style={th}>Tipo</th>
            <th style={th}>TAG</th>
            <th style={th}>Equipamento</th>
            <th style={th}>Setor</th>
            <th style={th}>Status</th>
          </tr>
        </thead>
        <tbody>
          {eventosFiltrados.length === 0 ? (
            <tr>
              <td colSpan={7} style={td}>
                <Empty text="Nenhuma OS de plano no período/vista. Gere o ramp-up ou ajuste as datas." />
              </td>
            </tr>
          ) : (
            eventosFiltrados.slice(0, 200).map((e) => (
              <tr key={`${e.codigo}-${e.abertura}`}>
                <td style={td}>{e.abertura}</td>
                <td style={td}>{e.codigo}</td>
                <td style={td}>
                  <Badge tone="info">{e.tipo}</Badge>
                </td>
                <td style={td}>{e.tag}</td>
                <td style={td}>{e.equipamento}</td>
                <td style={td}>{e.setor}</td>
                <td style={td}>{e.status}</td>
              </tr>
            ))
          )}
        </tbody>
      </DataTable>
      {eventosFiltrados.length > 200 && (
        <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)", marginTop: 8 }}>
          Mostrando 200 de {eventosFiltrados.length} — exporte o XLSX para a lista completa.
        </div>
      )}
    </div>
  );
}
