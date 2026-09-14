import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  aplicarReprogramacao,
  calcularAtrasoDias,
  calcularProximaData,
  chaveOcorrencia,
  chaveUnicaPlano,
  classificarAgenda,
  devePularGeracaoOs,
  grupoEstaCumprido,
  noPrazoDeGeracao,
  resultadoLiberaProximaData,
  tipoOsCumprePlano,
  tipoOsDaAtividade,
} from "./plano-regras";

describe("periodicidade e próxima data", () => {
  it("não inventa próxima data sem periodicidade no modo intervalo", () => {
    const exec = new Date("2026-01-15T12:00:00");
    assert.equal(calcularProximaData({ modo: "INTERVALO_EXECUCAO", dataExecucao: exec }), null);
    assert.equal(
      calcularProximaData({ modo: "INTERVALO_EXECUCAO", periodicidadeMeses: 0, dataExecucao: exec }),
      null,
    );
  });

  it("avança pelo intervalo cadastrado após execução aprovada", () => {
    const next = calcularProximaData({
      modo: "INTERVALO_EXECUCAO",
      periodicidadeMeses: 6,
      dataExecucao: new Date("2026-01-15T12:00:00"),
    });
    assert.equal(next?.toISOString().slice(0, 10), "2026-07-15");
  });

  it("no calendário fixo a próxima data não depende do atraso da execução", () => {
    const next = calcularProximaData({
      modo: "CALENDARIO_FIXO",
      diaFixo: 10,
      mesFixo: 3,
      dataExecucao: new Date("2026-04-20T12:00:00"),
    });
    assert.equal(next?.toISOString().slice(0, 10), "2027-03-10");
  });
});

describe("atraso e reprogramação", () => {
  it("mantém a data original e o atraso ao reagendar", () => {
    const original = new Date("2026-02-01T12:00:00");
    const agora = new Date("2026-03-10T12:00:00");
    const r = aplicarReprogramacao({
      dataPrevistaOriginal: original,
      novaData: new Date("2026-04-01T12:00:00"),
      motivo: "Equipamento em uso no centro cirúrgico",
      agora,
    });
    assert.equal(r.dataPrevistaOriginal.toISOString().slice(0, 10), "2026-02-01");
    assert.equal(r.dataPrevista.toISOString().slice(0, 10), "2026-04-01");
    assert.equal(r.atrasoDias, calcularAtrasoDias(original, agora));
    assert.ok(r.atrasoDias >= 30);
  });

  it("exige motivo na reprogramação", () => {
    assert.throws(
      () =>
        aplicarReprogramacao({
          dataPrevistaOriginal: new Date("2026-01-01"),
          novaData: new Date("2026-02-01"),
          motivo: "  ",
          agora: new Date("2026-01-15"),
        }),
      /motivo/i,
    );
  });
});

describe("cumprimento do plano", () => {
  it("corretiva não cumpre preventiva nem calibração", () => {
    assert.equal(tipoOsCumprePlano("CORRETIVA"), false);
    assert.equal(tipoOsCumprePlano("PREVENTIVA"), true);
    assert.equal(tipoOsCumprePlano("CALIBRACAO"), true);
    assert.equal(tipoOsDaAtividade("OUTRO"), "PREVENTIVA");
  });

  it("reprovado não libera próxima data (executado ≠ aprovado)", () => {
    assert.equal(resultadoLiberaProximaData("REPROVADO"), false);
    assert.equal(resultadoLiberaProximaData("PENDENTE_ASSINATURA"), false);
    assert.equal(resultadoLiberaProximaData("APROVADO"), true);
    assert.equal(resultadoLiberaProximaData("APROVADO_COM_RESSALVAS"), true);
  });

  it("várias atividades do grupo só cumprem no fim", () => {
    assert.equal(grupoEstaCumprido([{ cumpriu: true }, { cumpriu: false }]), false);
    assert.equal(grupoEstaCumprido([{ cumpriu: true }, { cumpriu: true }]), true);
    assert.equal(grupoEstaCumprido([]), false);
  });
});

describe("geração de OS sem duplicar", () => {
  it("pula se a ocorrência já tem OS ou se já há OS aberta do tipo", () => {
    assert.equal(devePularGeracaoOs({ osId: "os1", existeOsAbertaMesmoTipo: false, planoAtivo: true }).pular, true);
    assert.equal(
      devePularGeracaoOs({ osId: null, existeOsAbertaMesmoTipo: true, planoAtivo: true }).pular,
      true,
    );
    assert.equal(
      devePularGeracaoOs({ osId: null, existeOsAbertaMesmoTipo: false, planoAtivo: false }).pular,
      true,
    );
    assert.equal(
      devePularGeracaoOs({ osId: null, existeOsAbertaMesmoTipo: false, planoAtivo: true }).pular,
      false,
    );
  });

  it("chave de ocorrência é estável na data original", () => {
    const a = chaveOcorrencia("p1", new Date("2026-05-05T08:00:00"));
    const b = chaveOcorrencia("p1", new Date("2026-05-05T23:00:00"));
    assert.equal(a, b);
  });

  it("tipos customizados não colidem com preventiva do mesmo equipamento", () => {
    assert.equal(chaveUnicaPlano("PREVENTIVA"), "PREVENTIVA");
    assert.equal(chaveUnicaPlano("OUTRO", "abc"), "OUTRO:abc");
    assert.notEqual(chaveUnicaPlano("OUTRO", "abc"), chaveUnicaPlano("PREVENTIVA"));
  });
});

describe("agenda", () => {
  const agora = new Date("2026-06-01T12:00:00");

  it("classifica prevista, a vencer, vencida e executada", () => {
    assert.equal(classificarAgenda(new Date("2026-08-01"), 15, agora), "PREVISTA");
    assert.equal(classificarAgenda(new Date("2026-06-10"), 15, agora), "A_VENCER");
    assert.equal(classificarAgenda(new Date("2026-05-20"), 15, agora), "VENCIDA");
    assert.equal(
      classificarAgenda(new Date("2026-05-20"), 15, agora, { executada: true, cumpriu: true }),
      "EXECUTADA",
    );
    assert.equal(
      classificarAgenda(new Date("2026-05-20"), 15, agora, { executada: true, cumpriu: false }),
      "VENCIDA",
    );
    assert.equal(
      classificarAgenda(new Date("2026-06-20"), 15, agora, { osId: "x" }),
      "OS_GERADA",
    );
  });

  it("vencida permanece visível e entra no prazo de geração", () => {
    assert.equal(noPrazoDeGeracao(new Date("2026-05-01"), 15, agora), true);
    assert.equal(noPrazoDeGeracao(new Date("2026-06-10"), 15, agora), true);
    assert.equal(noPrazoDeGeracao(new Date("2026-08-01"), 15, agora), false);
    assert.equal(noPrazoDeGeracao(null, 15, agora), false);
  });
});
