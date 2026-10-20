/**
 * Validade de certificado por dia civil em America/Sao_Paulo, inclusiva (decisão TL E1).
 * validade gravada = new Date("YYYY-MM-DD") = 00:00Z do dia digitado.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dataCivilDeData, dataCivilDeInstante, dataCivilSP, diasCivisEntre } from "@aion/shared";
import { certificadoVigenteNaData, statusCertificadoNaData } from "./laudo-regras";
import { diasAteValidade, montarAlertasPadroes } from "./padrao-regras";

const VALIDADE = new Date("2019-02-23"); // como a API grava o <input type=date>

describe("helper de data civil", () => {
  it("dataCivilSP converte instante para o dia em São Paulo", () => {
    assert.equal(dataCivilSP(new Date("2019-02-24T02:59:00Z")), "2019-02-23");
    assert.equal(dataCivilSP(new Date("2019-02-24T03:00:00Z")), "2019-02-24");
  });
  it("validade só-data vale pelo dia digitado (meia-noite UTC ou string YYYY-MM-DD)", () => {
    assert.equal(dataCivilDeData(VALIDADE), "2019-02-23");
    assert.equal(dataCivilDeData("2019-02-23"), "2019-02-23");
    assert.equal(dataCivilDeData("2019-02-23T00:00:00.000Z"), "2019-02-23");
    assert.equal(dataCivilDeData(null), null);
  });
  it("DateTime com hora é lido pelo dia civil em SP", () => {
    assert.equal(dataCivilDeData("2019-02-24T02:59:00Z"), "2019-02-23");
  });
  it("execução 'YYYY-MM-DD' vale como dia; instante vale pelo dia em SP", () => {
    assert.equal(dataCivilDeInstante("2019-02-23"), "2019-02-23");
    assert.equal(dataCivilDeInstante("2019-02-23T23:59:00-03:00"), "2019-02-23");
  });
  it("diasCivisEntre atravessa mês/ano e horário de verão sem pular dia", () => {
    assert.equal(diasCivisEntre("2019-02-16", "2019-02-17"), 1); // fim do horário de verão 2019
    assert.equal(diasCivisEntre("2026-12-31", "2027-01-01"), 1);
    assert.equal(diasCivisEntre("2019-02-24", "2019-02-23"), -1);
  });
});

describe("statusCertificadoNaData — inclusivo por dia civil SP", () => {
  it("validade 2019-02-23, execução 2019-02-23 23:59 BRT (02:59Z do dia 24) → válido", () => {
    assert.notEqual(statusCertificadoNaData(VALIDADE, new Date("2019-02-24T02:59:00Z"), 60), "VENCIDO");
    assert.equal(statusCertificadoNaData(VALIDADE, new Date("2019-02-24T02:59:00Z"), 0), "A_VENCER"); // vence hoje
  });
  it("execução 2019-02-24 00:00 BRT → VENCIDO", () => {
    assert.equal(statusCertificadoNaData(VALIDADE, new Date("2019-02-24T03:00:00Z"), 60), "VENCIDO");
  });
  it("execução 2019-02-23 00:00 BRT (03:00Z) → válido (antes também já era)", () => {
    assert.notEqual(statusCertificadoNaData(VALIDADE, new Date("2019-02-23T03:00:00Z"), 60), "VENCIDO");
  });
  it("janela a vencer por dias civis: 60 dias antes = A_VENCER; 61 = VALIDO (independente da hora)", () => {
    // validade 2019-02-23; 60 dias civis antes = 2018-12-25. Em dez/2018 SP estava em horário de verão (UTC-2).
    assert.equal(statusCertificadoNaData(VALIDADE, new Date("2018-12-25T02:00:00Z"), 60), "A_VENCER"); // 25/12 00:00 BRST
    assert.equal(statusCertificadoNaData(VALIDADE, new Date("2018-12-26T01:59:00Z"), 60), "A_VENCER"); // 25/12 23:59 BRST
    assert.equal(statusCertificadoNaData(VALIDADE, new Date("2018-12-25T01:59:00Z"), 60), "VALIDO"); // 24/12 23:59 BRST
    assert.equal(statusCertificadoNaData(VALIDADE, new Date("2018-12-24T15:00:00Z"), 60), "VALIDO");
  });
});

describe("certificadoVigenteNaData — cobre o dia inteiro da validade e da emissão", () => {
  const certs = [
    { id: "antigo", numero: "A", dataEmissao: new Date("2018-02-23"), dataValidade: VALIDADE },
    { id: "novo", numero: "N", dataEmissao: new Date("2019-02-24"), dataValidade: new Date("2020-02-24") },
  ];
  it("23:59 BRT do dia da validade ainda usa o certificado antigo", () => {
    assert.equal(certificadoVigenteNaData(certs as any, new Date("2019-02-24T02:59:00Z"))?.id, "antigo");
  });
  it("00:00 BRT do dia seguinte usa o novo (emitido naquele dia)", () => {
    assert.equal(certificadoVigenteNaData(certs as any, new Date("2019-02-24T03:00:00Z"))?.id, "novo");
  });
});

describe("dias até a validade (alertas) por dia civil", () => {
  it("vence hoje = 0 dias, ontem = -1, amanhã = 1, a qualquer hora do dia em SP", () => {
    assert.equal(diasAteValidade(VALIDADE, new Date("2019-02-23T03:00:00Z")), 0);
    assert.equal(diasAteValidade(VALIDADE, new Date("2019-02-24T02:59:00Z")), 0);
    assert.equal(diasAteValidade(VALIDADE, new Date("2019-02-24T03:00:00Z")), -1);
    assert.equal(diasAteValidade(VALIDADE, new Date("2019-02-22T12:00:00Z")), 1);
  });
  it("alerta no último minuto do dia da validade é A_VENCER com 0 dias, não VENCIDO", () => {
    const [a] = montarAlertasPadroes(
      [{ id: "p", nome: "ESA612", nSerie: "1", certificadoNumero: "C", certificadoValidade: VALIDADE }],
      new Date("2019-02-24T02:59:00Z"),
      60,
    );
    assert.equal(a.status, "A_VENCER");
    assert.equal(a.dias, 0);
  });
});
