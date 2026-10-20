import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  avaliarMedicao,
  avaliarPontoCalibracao,
  calcularResultadoLaudo,
  certificadoVigenteNaData,
  itensObrigatoriosPendentes,
  mediaLeituras,
  statusCertificadoNaData,
  tituloDocumentoTecnico,
} from "./laudo-regras";

describe("medições — sem tolerância inventada", () => {
  it("média ignora vazios", () => {
    assert.equal(mediaLeituras([10, 12, undefined]), 11);
    assert.equal(mediaLeituras([null, undefined]), null);
  });

  it("sem critério não aprova", () => {
    const out = avaliarMedicao({ valorMedido: 37.2, valorReferencia: 37, item: {} });
    assert.equal(out.status, "NAO_AVALIADO");
    assert.match(out.motivo, /critério/i);
  });

  it("não usa fallback percentual implícito", () => {
    const out = avaliarMedicao({ valorMedido: 102, valorReferencia: 100, item: {} });
    assert.equal(out.status, "NAO_AVALIADO");
  });

  it("critério absoluto publicado avalia erro", () => {
    const ok = avaliarMedicao({
      valorMedido: 37.2,
      valorReferencia: 37,
      item: { tolerancia: { valor: 1.5, modo: "absoluto", referencia: "POP.EC.CAL.001", versao: "1" } },
    });
    assert.equal(ok.status, "APROVADO");
    const nc = avaliarMedicao({
      valorMedido: 40,
      valorReferencia: 37,
      item: { tolerancia: { valor: 1.5, modo: "absoluto" } },
    });
    assert.equal(nc.status, "REPROVADO");
  });

  it("aplica correção do padrão antes do erro", () => {
    const out = avaliarMedicao({
      valorMedido: 36.4,
      valorReferencia: 37,
      correcao: 0.6,
      item: { tolerancia: { valor: 0.2, modo: "absoluto" } },
    });
    assert.equal(out.mediaCorrigida, 37);
    assert.equal(out.status, "APROVADO");
  });

  it("ponto herda critério do modelo, não inventa", () => {
    const sem = avaliarPontoCalibracao({
      itemModelo: { id: "p1", tipo: "calibracao", valorPadrao: 37, unidade: "°C" },
      resposta: { id: "p1", leituras: [37.1, 37.0, 37.2] },
    });
    assert.equal(sem.status, "NAO_AVALIADO");
    assert.equal(sem.origemMedicao, "MANUAL");
    const com = avaliarPontoCalibracao({
      itemModelo: {
        id: "p1",
        tipo: "calibracao",
        valorPadrao: 37,
        tolerancia: { valor: 1.5, modo: "absoluto", referencia: "Quadro 7", versao: "POP.EC.CAL.001" },
      },
      resposta: { id: "p1", leituras: [37.1, 37.0, 37.2] },
    });
    assert.equal(com.status, "APROVADO");
    assert.equal(com.criterioReferencia, "Quadro 7");
  });
});

describe("resultado do laudo", () => {
  it("calibração sem critério permanece não avaliada", () => {
    assert.equal(
      calcularResultadoLaudo("CALIBRACAO", [
        { tipo: "calibracao", valorMedido: 37, status: "NAO_AVALIADO", avaliacao: "NAO_AVALIADO" },
      ]),
      "NAO_AVALIADO",
    );
  });

  it("reprovação prevalece", () => {
    assert.equal(
      calcularResultadoLaudo("CALIBRACAO", [
        { tipo: "calibracao", status: "APROVADO", avaliacao: "APROVADO", valorMedido: 37 },
        { tipo: "calibracao", status: "REPROVADO", avaliacao: "REPROVADO", valorMedido: 40 },
      ]),
      "REPROVADO",
    );
  });

  it("preventiva", () => {
    assert.equal(calcularResultadoLaudo("PREVENTIVA", [{ status: "NAO" }]), "REPROVADO");
    assert.equal(calcularResultadoLaudo("PREVENTIVA", [{ status: "SIM", observacao: "ok" }]), "APROVADO_COM_RESSALVAS");
    assert.equal(calcularResultadoLaudo("PREVENTIVA", [{ status: "SIM" }, { status: "NA" }]), "APROVADO");
  });

  it("qualificação não inventa tolerância", () => {
    assert.equal(calcularResultadoLaudo("QUALIFICACAO", [{ status: "SIM" }]), "APROVADO");
    const d = tituloDocumentoTecnico("QUALIFICACAO");
    assert.equal(d.titulo, "Relatório de serviço");
  });

  it("obrigatórios pendentes", () => {
    assert.deepEqual(
      itensObrigatoriosPendentes([{ id: "1", pergunta: "Aspecto", tipo: "aprovado_reprovado", obrigatorio: true }]),
      ["Aspecto"],
    );
  });
});

describe("documento e instrumento na data", () => {
  it("título é relatório de serviço", () => {
    const d = tituloDocumentoTecnico("CALIBRACAO");
    assert.equal(d.titulo, "Relatório de serviço");
    assert.doesNotMatch(d.titulo.toLowerCase(), /certificado/);
  });

  it("status na data do serviço", () => {
    const data = new Date("2026-06-01T12:00:00Z");
    assert.equal(statusCertificadoNaData("2026-05-01T00:00:00Z", data, 60), "VENCIDO");
    assert.equal(statusCertificadoNaData("2026-06-20T00:00:00Z", data, 60), "A_VENCER");
    assert.equal(statusCertificadoNaData("2027-01-01T00:00:00Z", data, 60), "VALIDO");
  });

  it("escolhe certificado que cobria a data", () => {
    const escolhido = certificadoVigenteNaData(
      [
        { id: "novo", numero: "2026", dataEmissao: "2026-01-01", dataValidade: "2027-01-01", vigente: true },
        { id: "antigo", numero: "2024", dataEmissao: "2024-01-01", dataValidade: "2025-12-31", vigente: false },
      ],
      new Date("2025-03-01T00:00:00Z"),
    );
    assert.equal(escolhido?.id, "antigo");
  });
});

describe("certificadoVigenteNaData — empate de data (ciclo 3)", () => {
  const base = { dataEmissao: "2026-01-02", dataValidade: "2027-01-02" };
  it("dois certificados com a mesma data: escolhe o vigente / revisão mais recente", () => {
    const antigo = { ...base, id: "rev0", numero: "C-1", revisao: 0, vigente: false };
    const novo = { ...base, id: "rev1", numero: "C-1", revisao: 1, vigente: true };
    for (const lista of [[antigo, novo], [novo, antigo]]) {
      assert.equal(certificadoVigenteNaData(lista, "2026-03-10T12:00:00-03:00")?.id, "rev1");
    }
  });
  it("mesma data, sem flag vigente: escolhe a revisão mais alta", () => {
    const lista = [
      { ...base, id: "r2", revisao: 2 },
      { ...base, id: "r0", revisao: 0 },
      { ...base, id: "r1", revisao: 1 },
    ];
    assert.equal(certificadoVigenteNaData(lista, "2026-03-10")?.id, "r2");
  });
  it("rev1 com emissão ANTERIOR à rev0 (sem flag vigente): escolhe rev1", () => {
    const rev0 = { id: "rev0", revisao: 0, dataEmissao: "2026-02-01", dataValidade: "2027-02-01" };
    const rev1 = { id: "rev1", revisao: 1, dataEmissao: "2026-01-15", dataValidade: "2027-01-15" };
    for (const lista of [[rev0, rev1], [rev1, rev0]]) {
      assert.equal(certificadoVigenteNaData(lista, "2026-03-10")?.id, "rev1");
    }
  });
  it("vigente com revisão menor vence não-vigente com revisão maior", () => {
    const vig = { ...base, id: "vig-r1", revisao: 1, vigente: true };
    const nao = { ...base, id: "nao-r3", revisao: 3, vigente: false, dataEmissao: "2026-02-01" };
    for (const lista of [[vig, nao], [nao, vig]]) {
      assert.equal(certificadoVigenteNaData(lista, "2026-03-10")?.id, "vig-r1");
    }
  });
});
