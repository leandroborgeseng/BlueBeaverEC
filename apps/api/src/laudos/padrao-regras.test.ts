import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  janelaAlerta,
  montarAlertasPadroes,
  normalizarNSerie,
  resumoAlertasPadroes,
  sugerirPadrao,
  validarCertificadoPadrao,
} from "./padrao-regras";

const agora = new Date("2026-10-19T12:00:00Z");

describe("E1 crit.1 — nº de série", () => {
  it("normaliza espaços para a unicidade", () => {
    assert.equal(normalizarNSerie("  ESA 612   001 "), "ESA 612 001");
    assert.equal(normalizarNSerie(undefined), "");
  });
});

describe("E1 crit.2 — validação do certificado do padrão", () => {
  const ok = { numero: "RBC-123", dataEmissao: "2026-01-10", dataValidade: "2027-01-10", fatorAbrangencia: 2,
    pontos: [{ unidade: "V", incertezaExpandida: 0.02, fatorK: 2 }] };
  it("certificado completo passa", () => assert.deepEqual(validarCertificadoPadrao(ok), []));
  it("validade antes da emissão é rejeitada", () =>
    assert.match(validarCertificadoPadrao({ ...ok, dataValidade: "2025-12-31" }).join(), /anterior/));
  it("sem número/datas é rejeitado", () => {
    const e = validarCertificadoPadrao({ pontos: [] });
    assert.ok(e.some((x) => /Número/.test(x)) && e.some((x) => /obrigatórias/.test(x)));
  });
  it("U ausente ou negativo e k <= 0 são rejeitados", () => {
    const e = validarCertificadoPadrao({ ...ok, fatorAbrangencia: 0, pontos: [{ unidade: "V", incertezaExpandida: -1, fatorK: 0 }, { unidade: "", incertezaExpandida: null }] });
    assert.ok(e.some((x) => /Fator de abrangência/.test(x)));
    assert.ok(e.some((x) => /Ponto 1: incerteza.*negativa/.test(x)));
    assert.ok(e.some((x) => /Ponto 1: k/.test(x)));
    assert.ok(e.some((x) => /Ponto 2: unidade/.test(x)));
    assert.ok(e.some((x) => /Ponto 2: incerteza.*obrigatória/.test(x)));
  });
  it("anexo que não é PDF é rejeitado", () =>
    assert.match(validarCertificadoPadrao({ ...ok, anexoMime: "image/png" }).join(), /PDF/));
});

describe("E1 crit.3 — alertas de certificado de padrão", () => {
  const padroes = [
    { id: "a", nome: "ESA612", nSerie: "1", certificadoNumero: "C1", certificadoValidade: "2027-06-01T00:00:00Z" },
    { id: "b", nome: "Impulse 7000", nSerie: "2", certificadoNumero: "C2", certificadoValidade: "2026-11-10T00:00:00Z" },
    { id: "c", nome: "BP Pump", nSerie: "3", certificadoNumero: "C3", certificadoValidade: "2026-10-01T00:00:00Z" },
    { id: "d", nome: "QA-ES", nSerie: "4", certificadoValidade: null },
    { id: "e", nome: "Termo", nSerie: "5", certificadoNumero: "C5", certificadoValidade: "2026-12-30T00:00:00Z" },
  ];
  it("janela padrão 60 dias: vencido, sem certificado e a vencer, nessa ordem; válido fica fora", () => {
    const out = montarAlertasPadroes(padroes, agora);
    assert.deepEqual(out.map((x) => [x.instrumentoId, x.status]), [
      ["c", "VENCIDO"], ["d", "SEM_CERTIFICADO"], ["b", "A_VENCER"],
    ]);
    assert.equal(out[0].dias, -19);
    assert.equal(out[2].dias, 21);
  });
  it("janela configurável (90 dias) inclui o que vence em ~71 dias", () => {
    const out = montarAlertasPadroes(padroes, agora, 90);
    assert.ok(out.some((x) => x.instrumentoId === "e" && x.status === "A_VENCER"));
  });
  it("janela inválida cai para 60", () => {
    assert.equal(janelaAlerta(0), 60);
    assert.equal(janelaAlerta(-5), 60);
    assert.equal(janelaAlerta(Number.NaN), 60);
    assert.equal(janelaAlerta(30), 30);
  });
  it("resumo conta por situação", () => {
    assert.deepEqual(resumoAlertasPadroes(montarAlertasPadroes(padroes, agora)), { vencidos: 1, aVencer: 1, semCertificado: 1, total: 3 });
  });
});

describe("E1 crit.4 — padrão preferencial sugerido", () => {
  const prefs = [{ tipo: "Analisador de desfibrilador", instrumentoId: "p1" }];
  it("usa o preferencial quando selecionável (tipo sem diferenciar maiúsculas)", () => {
    const s = sugerirPadrao("analisador de DESFIBRILADOR", prefs, [
      { id: "p1", tipoAnalisador: "Analisador de desfibrilador", selecionavel: true },
      { id: "p2", tipoAnalisador: "Analisador de desfibrilador", selecionavel: true },
    ]);
    assert.deepEqual(s, { instrumentoId: "p1", origem: "PREFERENCIAL", aviso: null });
  });
  it("preferencial vencido → outro do mesmo tipo, com aviso", () => {
    const s = sugerirPadrao("Analisador de desfibrilador", prefs, [
      { id: "p1", tipoAnalisador: "Analisador de desfibrilador", selecionavel: false },
      { id: "x", tipoAnalisador: "Analisador de PNI", selecionavel: true },
      { id: "p2", tipoAnalisador: "Analisador de desfibrilador", selecionavel: true },
    ]);
    assert.equal(s.instrumentoId, "p2");
    assert.equal(s.origem, "MESMO_TIPO");
    assert.match(s.aviso ?? "", /preferencial não está disponível/);
  });
  it("nenhum válido → sem sugestão", () => {
    const s = sugerirPadrao("Analisador de desfibrilador", prefs, [{ id: "p1", tipoAnalisador: "x", selecionavel: false }]);
    assert.equal(s.instrumentoId, null);
    assert.equal(s.origem, "NENHUM");
  });
  it("sem tipo → sem sugestão", () => assert.equal(sugerirPadrao("", prefs, []).origem, "NENHUM"));
});
