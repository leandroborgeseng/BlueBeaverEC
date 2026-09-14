import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  atrasoProgramadaDias,
  classificarProgramada,
  cumprimentoProgramadas,
  disponibilidadeDeParadas,
  horasDe,
  metricaMedia,
  motivoAguardaFornecedor,
  mtbfDeFalhas,
  mttrDeParadas,
  razaoPercentual,
  snapshotParqueEmOperacao,
  somarCustos,
  somaIntervalosMs,
  temposDaOs,
  unirIntervalos,
} from "./indicador-regras";

describe("divisão por zero e ausência ≠ 100%", () => {
  it("denominador 0 devolve nulo, nunca 100%", () => {
    const r = razaoPercentual(0, 0, "x/y");
    assert.equal(r.percentual, null);
    assert.equal(r.status, "dados_insuficientes");
    assert.equal(r.denominador, 0);
  });

  it("parque vazio não vira disponibilidade 100%", () => {
    const r = snapshotParqueEmOperacao(0, 0);
    assert.equal(r.percentual, null);
    assert.equal(r.status, "dados_insuficientes");
  });

  it("média sem amostra é insuficiente, não zero disfarçado", () => {
    const m = metricaMedia([], "média", "teste");
    assert.equal(m.valor, null);
    assert.equal(m.status, "dados_insuficientes");
  });
});

describe("tempos da OS são grandezas distintas", () => {
  const abertura = "2026-09-01T08:00:00.000Z";
  const logs = [
    { acao: "ABERTURA", em: "2026-09-01T08:00:00.000Z" },
    { acao: "INICIO_EXECUCAO", em: "2026-09-01T10:00:00.000Z" },
    { acao: "AGUARDO", em: "2026-09-01T12:00:00.000Z" },
    { acao: "RETOMADA", em: "2026-09-01T16:00:00.000Z" },
    { acao: "FECHAMENTO", em: "2026-09-01T18:00:00.000Z" },
  ];

  it("1º atendimento ≠ duração ≠ trabalhado ≠ indisponibilidade", () => {
    const t = temposDaOs({
      abertura,
      fechamento: "2026-09-01T18:00:00.000Z",
      status: "CONCLUIDA",
      logs,
      equipamentoParado: true,
    });
    assert.equal(horasDe(t.atePrimeiroAtendimentoMs), 2);
    assert.equal(horasDe(t.duracaoTotalMs), 10);
    assert.equal(horasDe(t.tempoTrabalhadoMs), 4);
    assert.equal(horasDe(t.pausasEAguardosMs), 4);
    assert.equal(horasDe(t.indisponibilidadeMs), 10);
    assert.notEqual(t.atePrimeiroAtendimentoMs, t.duracaoTotalMs);
    assert.notEqual(t.tempoTrabalhadoMs, t.duracaoTotalMs);
    assert.notEqual(t.tempoTrabalhadoMs, t.indisponibilidadeMs);
  });

  it("sem log de início não inventa 1º atendimento nem tempo trabalhado", () => {
    const t = temposDaOs({
      abertura,
      fechamento: "2026-09-01T18:00:00.000Z",
      status: "CONCLUIDA",
      logs: [{ acao: "ABERTURA", em: abertura }],
    });
    assert.equal(t.atePrimeiroAtendimentoMs, null);
    assert.equal(t.tempoTrabalhadoMs, null);
    assert.equal(horasDe(t.duracaoTotalMs), 10);
  });

  it("OS aberta sem parada marcada não vira indisponibilidade", () => {
    const t = temposDaOs({
      abertura,
      status: "EM_ANDAMENTO",
      agora: "2026-09-01T12:00:00.000Z",
      logs: [],
      equipamentoParado: false,
    });
    assert.equal(t.indisponibilidadeMs, null);
    assert.equal(horasDe(t.duracaoTotalMs), 4);
  });
});

describe("intervalos sobrepostos não duplicam", () => {
  it("funde paradas do mesmo equipamento", () => {
    const a = { inicio: Date.parse("2026-09-01T08:00:00Z"), fim: Date.parse("2026-09-01T12:00:00Z") };
    const b = { inicio: Date.parse("2026-09-01T10:00:00Z"), fim: Date.parse("2026-09-01T14:00:00Z") };
    const unidos = unirIntervalos([a, b]);
    assert.equal(unidos.length, 1);
    assert.equal(somaIntervalosMs([a, b]) / 36e5, 6);
  });
});

describe("programadas: reagendar não apaga atraso", () => {
  it("mantém atraso pela data original depois de reagendar", () => {
    const original = "2026-09-01T12:00:00";
    const agora = "2026-09-10T12:00:00";
    assert.equal(atrasoProgramadaDias(original, agora), 9);
    const classe = classificarProgramada(
      {
        id: "1",
        status: "PREVISTA",
        dataPrevista: "2026-09-20T12:00:00",
        dataPrevistaOriginal: original,
        atrasoDias: 9,
        reprogramadaEm: "2026-09-05T12:00:00",
        cumpriuPlano: false,
      },
      agora,
    );
    assert.equal(classe, "pendente_atrasada");
  });

  it("cumprimento usa numerador/denominador e exclui cancelada/suspensa", () => {
    const de = "2026-09-01";
    const ate = "2026-09-30";
    const agora = "2026-09-15T12:00:00";
    const r = cumprimentoProgramadas(
      [
        {
          id: "ok",
          status: "EXECUTADA",
          dataPrevistaOriginal: "2026-09-05",
          dataPrevista: "2026-09-05",
          atrasoDias: 0,
          executadaEm: "2026-09-05",
          cumpriuPlano: true,
        },
        {
          id: "atraso",
          status: "EXECUTADA",
          dataPrevistaOriginal: "2026-09-06",
          dataPrevista: "2026-09-12",
          atrasoDias: 6,
          executadaEm: "2026-09-12",
          cumpriuPlano: true,
          reprogramadaEm: "2026-09-08",
        },
        {
          id: "canc",
          status: "CANCELADA",
          dataPrevistaOriginal: "2026-09-07",
          dataPrevista: "2026-09-07",
          atrasoDias: 0,
          cumpriuPlano: false,
        },
        {
          id: "susp",
          status: "PREVISTA",
          dataPrevistaOriginal: "2026-09-08",
          dataPrevista: "2026-09-08",
          atrasoDias: 0,
          cumpriuPlano: false,
          planoStatus: "SUSPENSO",
        },
      ],
      de,
      ate,
      agora,
    );
    assert.equal(r.razao.numerador, 1);
    assert.equal(r.razao.denominador, 2);
    assert.equal(r.razao.percentual, 50);
    assert.equal(r.excluidas.canceladas, 1);
    assert.equal(r.excluidas.suspensas, 1);
  });

  it("sem devidas no período não reporta 100%", () => {
    const r = cumprimentoProgramadas([], "2026-09-01", "2026-09-30");
    assert.equal(r.razao.percentual, null);
    assert.equal(r.razao.status, "dados_insuficientes");
  });
});

describe("MTTR / MTBF / disponibilidade só com dados", () => {
  it("não usa duração de OS como MTTR quando não há parada", () => {
    const m = mttrDeParadas([]);
    assert.equal(m.valor, null);
    assert.match(m.motivo ?? "", /não é usada como MTTR/i);
  });

  it("MTTR médio das paradas encerradas", () => {
    const m = mttrDeParadas([4 * 36e5, 6 * 36e5]);
    assert.equal(m.status, "medido");
    assert.equal(m.valor, 5);
    assert.equal(m.n, 2);
  });

  it("MTBF recusa intervalo entre aberturas se não há operação conhecida", () => {
    const m = mtbfDeFalhas({ periodoMs: 0, downtimeMs: 0, falhas: 3 });
    assert.equal(m.status, "dados_insuficientes");
  });

  it("disponibilidade sem parada registrada não é 100%", () => {
    const d = disponibilidadeDeParadas({
      parqueHorasMs: 10 * 24 * 36e5,
      downtimeMs: 0,
      equipamentosComSinal: 0,
      equipamentosParque: 10,
    });
    assert.equal(d.valor, null);
    assert.equal(d.status, "dados_insuficientes");
    assert.match(d.motivo ?? "", /não é 100%/);
  });
});

describe("custos e fornecedor", () => {
  it("separa realizado de estimado/aprovado", () => {
    const s = somarCustos([
      { valor: 100, natureza: "realizado" },
      { valor: 500, natureza: "estimado" },
      { valor: 400, natureza: "aprovado" },
    ]);
    assert.equal(s.realizado, 100);
    assert.equal(s.estimado, 500);
    assert.equal(s.aprovado, 400);
  });

  it("reconhece aguardo de fornecedor pelo motivo", () => {
    assert.equal(motivoAguardaFornecedor("Aguardando peça do fornecedor"), true);
    assert.equal(motivoAguardaFornecedor("Falta de técnico interno"), false);
  });
});
