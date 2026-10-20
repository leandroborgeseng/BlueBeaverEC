/**
 * E1 — probabilidade de abrangência, k por ponto sem default e U > 0 (decisão TL 19/10).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException } from "@nestjs/common";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validarCertificadoPadrao, problemasCertificadoVigente } from "./padrao-regras";
import { avaliarPontoCalibracao, pontoComHeranca, snapshotInstrumentoNaData, textoProbabilidadeAbrangencia } from "./laudo-regras";
import { linhasIncertezaPadrao } from "./relatorio-servico-pdf";
import { InstrumentosService } from "./instrumentos.service";

const ok = { numero: "RBC-1", dataEmissao: "2026-01-10", dataValidade: "2027-01-10" };

describe("validação — probabilidade de abrangência (0 < p < 100)", () => {
  it("aceita vazia e valores dentro do intervalo", () => {
    assert.deepEqual(validarCertificadoPadrao({ ...ok, fatorAbrangencia: 2, pontos: [{ unidade: "V", incertezaExpandida: 0.1 }] }), []);
    assert.deepEqual(
      validarCertificadoPadrao({ ...ok, fatorAbrangencia: 2, probabilidadeAbrangencia: 95.45, pontos: [{ unidade: "V", incertezaExpandida: 0.1, probabilidadeAbrangencia: 99.73 }] }),
      [],
    );
  });
  for (const p of [0, 100, -1, 120]) {
    it(`rejeita ${p} no certificado e no ponto`, () => {
      const e = validarCertificadoPadrao({ ...ok, fatorAbrangencia: 2, probabilidadeAbrangencia: p, pontos: [{ unidade: "V", incertezaExpandida: 0.1, probabilidadeAbrangencia: p }] });
      assert.ok(e.some((x) => /^Probabilidade de abrangência/.test(x)));
      assert.ok(e.some((x) => /^Ponto 1: probabilidade de abrangência/.test(x)));
    });
  }
});

describe("validação — k e U do ponto", () => {
  it("k vazio no ponto e no certificado → erro", () => {
    const e = validarCertificadoPadrao({ ...ok, pontos: [{ unidade: "V", incertezaExpandida: 0.1 }] });
    assert.ok(e.includes("Ponto 1: informe k no ponto ou no certificado"));
  });
  it("k só no ponto ou só no certificado → ok", () => {
    assert.deepEqual(validarCertificadoPadrao({ ...ok, pontos: [{ unidade: "V", incertezaExpandida: 0.1, fatorK: 2.1 }] }), []);
    assert.deepEqual(validarCertificadoPadrao({ ...ok, fatorAbrangencia: 2, pontos: [{ unidade: "V", incertezaExpandida: 0.1 }] }), []);
  });
  it("U = 0 bloqueado com a mensagem exata", () => {
    const e = validarCertificadoPadrao({ ...ok, fatorAbrangencia: 2, pontos: [{ unidade: "V", incertezaExpandida: 0.1 }, { unidade: "V", incertezaExpandida: 0 }] });
    assert.deepEqual(e, ["Ponto 2: U deve ser maior que zero"]);
  });
});

describe("herança ponto > certificado > null", () => {
  it("ponto sobrescreve", () => {
    const r = pontoComHeranca({ fatorK: 2.2, probabilidadeAbrangencia: 99 }, { fatorAbrangencia: 2, probabilidadeAbrangencia: 95.45 });
    assert.equal(r.fatorK, 2.2);
    assert.equal(r.probabilidadeAbrangencia, 99);
  });
  it("ponto vazio herda do certificado", () => {
    const r = pontoComHeranca({ fatorK: null }, { fatorAbrangencia: 2, probabilidadeAbrangencia: 95.45 });
    assert.equal(r.fatorK, 2);
    assert.equal(r.probabilidadeAbrangencia, 95.45);
  });
  it("ambos vazios → null (nunca 2 nem 95)", () => {
    const r = pontoComHeranca({}, {});
    assert.equal(r.fatorK, null);
    assert.equal(r.probabilidadeAbrangencia, null);
  });
  it("snapshot do laudo aplica a herança e o cálculo propaga a probabilidade", () => {
    const snap = snapshotInstrumentoNaData({
      instrumento: { id: "i", nome: "ESA", nSerie: "1" },
      certificados: [{ id: "c", numero: "C1", dataEmissao: "2026-01-01", dataValidade: "2027-01-01", fatorAbrangencia: 2, probabilidadeAbrangencia: 95.45,
        pontos: [{ valorNominal: 10, incertezaExpandida: 0.1, correcao: 0 }, { valorNominal: 20, incertezaExpandida: 0.2, fatorK: 3, probabilidadeAbrangencia: 99 }] }],
      dataServico: "2026-06-01",
    });
    const pts = snap.certificado!.pontos;
    assert.deepEqual([pts[0].fatorK, pts[0].probabilidadeAbrangencia], [2, 95.45]);
    assert.deepEqual([pts[1].fatorK, pts[1].probabilidadeAbrangencia], [3, 99]);
    const r = avaliarPontoCalibracao({ itemModelo: { valorPadrao: 20 } as never, resposta: { leituras: [20] } as never, pontosCertificado: pts });
    assert.equal(r.probabilidadeAbrangencia, 99);
    assert.equal(r.fatorK, 3);
  });
});

describe("PDF — texto da probabilidade", () => {
  it("null → \"não informada\"; valor → %", () => {
    assert.equal(textoProbabilidadeAbrangencia(null), "não informada");
    assert.equal(textoProbabilidadeAbrangencia(undefined), "não informada");
    assert.equal(textoProbabilidadeAbrangencia(95.45), "95,45%");
  });
  it("linhas do padrão no PDF dizem \"não informada\" e nunca 95%", () => {
    const l = linhasIncertezaPadrao({ numero: "C1", fatorAbrangencia: 2, pontos: [{ unidade: "V", valorNominal: 230, incertezaExpandida: 0.5 }] });
    assert.match(l[0], /probabilidade de abrangência: não informada/);
    assert.match(l[1], /U = 0.5 V · k = 2 · probabilidade de abrangência: não informada/);
    assert.ok(!l.join("\n").includes("95"));
  });
  it("ponto sobrescreve a probabilidade do certificado no PDF", () => {
    const l = linhasIncertezaPadrao({ fatorAbrangencia: 2, probabilidadeAbrangencia: 95.45, pontos: [{ incertezaExpandida: 1, probabilidadeAbrangencia: 99 }, { incertezaExpandida: 1 }] });
    assert.match(l[0], /95,45%/);
    assert.match(l[1], /99%/);
    assert.match(l[2], /95,45%/);
  });
  it("o gerador usa as linhas e o pacote fica em PDF", () => {
    const src = readFileSync(resolve(__dirname, "relatorio-servico-pdf.ts"), "utf8");
    assert.match(src, /linhasIncertezaPadrao\(c\)/);
  });
});

describe("cadastro incompleto — registros antigos", () => {
  it("k ausente nos dois níveis ou U <= 0 marca incompleto; completo não", () => {
    assert.deepEqual(problemasCertificadoVigente({ fatorAbrangencia: 2, pontos: [{ incertezaExpandida: 0.1 }] }), []);
    assert.deepEqual(problemasCertificadoVigente({ fatorAbrangencia: null, pontos: [{ incertezaExpandida: 0.1 }] }), ["ponto 1: k"]);
    assert.deepEqual(problemasCertificadoVigente({ fatorAbrangencia: 2, pontos: [{ incertezaExpandida: 0, fatorK: 2 }] }), ["ponto 1: U > 0"]);
    assert.deepEqual(problemasCertificadoVigente(null), []);
  });
});

describe("service — gravação sem injetar defaults", () => {
  function prismaCaptura() {
    const criados: any[] = [];
    const tx: any = {
      certificadoPadrao: {
        updateMany: async () => ({}),
        create: async ({ data }: any) => {
          const row = { id: "c1", ...data, pontos: data.pontos.create };
          criados.push(row);
          return row;
        },
        findFirst: async () => null,
      },
      instrumentoPadrao: {
        findFirst: async () => ({ id: "a", estabelecimentoId: "e1", ativo: true }),
        update: async () => ({}),
      },
      estabelecimento: { findUnique: async () => ({ diasAlertaCertificado: 60 }) },
    };
    tx.$transaction = async (fn: any) => fn(tx);
    return { tx, criados };
  }
  const admin = { id: "u1", estabelecimentoId: "e1", perfil: "ADMIN", email: "qa@aion.local" } as any;
  it("ponto sem k/probabilidade fica null (herda na leitura); certificado sem probabilidade fica null", async () => {
    const { tx, criados } = prismaCaptura();
    await new InstrumentosService(tx).addCertificado(admin, "a", {
      ...ok, fatorAbrangencia: 2, pontos: [{ unidade: "V", incertezaExpandida: 0.5 }],
    });
    assert.equal(criados[0].fatorAbrangencia, 2);
    assert.equal(criados[0].probabilidadeAbrangencia, null);
    assert.equal(criados[0].pontos[0].fatorK, null);
    assert.equal(criados[0].pontos[0].probabilidadeAbrangencia, null);
  });
  it("certificado sem k não recebe 2 silencioso (k vem do ponto)", async () => {
    const { tx, criados } = prismaCaptura();
    await new InstrumentosService(tx).addCertificado(admin, "a", {
      ...ok, probabilidadeAbrangencia: 95.45, pontos: [{ unidade: "V", incertezaExpandida: 0.5, fatorK: 2.1 }],
    });
    assert.equal(criados[0].fatorAbrangencia, null);
    assert.equal(criados[0].probabilidadeAbrangencia, 95.45);
  });
  it("k vazio nos dois níveis → 400; U = 0 → 400", async () => {
    const { tx } = prismaCaptura();
    await assert.rejects(new InstrumentosService(tx).addCertificado(admin, "a", { ...ok, pontos: [{ unidade: "V", incertezaExpandida: 0.5 }] }), BadRequestException);
    await assert.rejects(
      new InstrumentosService(tx).addCertificado(admin, "a", { ...ok, fatorAbrangencia: 2, pontos: [{ unidade: "V", incertezaExpandida: 0 }] }),
      (e: any) => e instanceof BadRequestException && /Ponto 1: U deve ser maior que zero/.test(e.message),
    );
  });
});
