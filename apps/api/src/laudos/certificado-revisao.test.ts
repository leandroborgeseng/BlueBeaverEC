/**
 * E1 — edição × revisão de certificado de padrão (decisão final TL 20/10, critério 2a do Analista).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { InstrumentosService, CERT_ATUAL, MSG_CERT_USADO } from "./instrumentos.service";
import { LaudosService } from "./laudos.service";
import { buildRelatorioServicoPdf } from "./relatorio-servico-pdf";

type Row = Record<string, any>;
const clone = <T>(v: T): T => structuredClone(v);
const PDF_ORIGINAL = new Uint8Array(Buffer.from("%PDF-1.4 original"));

function mundo(opts: { usado: boolean }) {
  const db: Row = {
    instrumentos: [{ id: "a", estabelecimentoId: "e1", nome: "ESA612", nSerie: "SN1", ativo: true }],
    certificados: [{
      id: "c1", instrumentoId: "a", estabelecimentoId: "e1", numero: "C-1", revisao: null, revisaoDeId: null, vigente: true,
      dataEmissao: new Date("2026-01-02"), dataValidade: new Date("2027-01-02"), laboratorioEmissor: "Lab X", laboratorioAcreditacao: "CAL 1",
      fatorAbrangencia: 2, probabilidadeAbrangencia: null, observacoes: null, anexoNome: "C-1.pdf", anexoMime: "application/pdf", anexoConteudo: PDF_ORIGINAL,
      pontos: [{ id: "p1", ordem: 1, grandeza: null, unidade: "V", valorNominal: 230, valorConvencional: null, indicacao: null, correcao: -0.1, incertezaExpandida: 0.5, fatorK: null, probabilidadeAbrangencia: null, observacao: null }],
    }],
    laudos: [] as Row[],
    logs: [] as Row[],
  };
  if (opts.usado) {
    db.laudos.push({ id: "l1", estabelecimentoId: "e1", instrumentoId: "a", statusDocumento: "FINAL",
      instrumentoSnapshot: { nome: "ESA612", certificado: { id: "c1", numero: "C-1", fatorAbrangencia: 2, probabilidadeAbrangencia: null, pontos: [{ unidade: "V", valorNominal: 230, incertezaExpandida: 0.5, fatorK: 2, probabilidadeAbrangencia: null }] } } });
  }
  let seq = 0;
  const achaCert = (w: Row) => db.certificados.find((c: Row) =>
    (w.id == null || c.id === w.id) && (w.instrumentoId == null || c.instrumentoId === w.instrumentoId) &&
    (w.estabelecimentoId == null || c.estabelecimentoId === w.estabelecimentoId) &&
    (w.numero == null || c.numero === w.numero) && (w.revisaoDeId == null || c.revisaoDeId === w.revisaoDeId));
  const prisma: Row = {
    db,
    estabelecimento: { findUnique: async () => ({ diasAlertaCertificado: 60, bloquearPadraoVencido: true }) },
    logAcesso: { create: async ({ data }: Row) => { db.logs.push({ ...data, createdAt: new Date() }); return data; } },
    usuario: { findUnique: async () => ({ nome: "RT Teste" }) },
    equipamento: { update: async () => ({}) },
    laudo: {
      findFirst: async ({ where }: Row) => db.laudos.find((l: Row) => l.estabelecimentoId === where.estabelecimentoId &&
        (where.id == null || l.id === where.id) &&
        (where.statusDocumento == null || l.statusDocumento === where.statusDocumento) &&
        (where.instrumentoSnapshot == null || l.instrumentoSnapshot?.certificado?.id === where.instrumentoSnapshot.equals)) ?? null,
      update: async ({ where, data }: Row) => { const l = db.laudos.find((x: Row) => x.id === where.id); Object.assign(l, data); db.laudoUpdates = (db.laudoUpdates ?? 0) + 1; return clone(l); },
      findMany: async ({ where }: Row) => db.laudos.filter((l: Row) => l.instrumentoId === where.instrumentoId && l.statusDocumento === where.statusDocumento),
    },
    instrumentoPadrao: {
      update: async ({ where, data }: Row) => Object.assign(db.instrumentos.find((i: Row) => i.id === where.id), data),
      findFirst: async ({ where, include }: Row) => {
        const i = db.instrumentos.find((x: Row) => x.id === where.id);
        if (!i) return null;
        let certs = db.certificados.filter((c: Row) => c.instrumentoId === i.id);
        if (include?.certificados?.where?.revisoes?.none) certs = certs.filter((c: Row) => !db.certificados.some((r: Row) => r.revisaoDeId === c.id));
        return { ...i, certificados: clone(certs) };
      },
    },
    certificadoPadrao: {
      findFirst: async ({ where }: Row) => { const c = achaCert(where); return c ? clone(c) : null; },
      update: async ({ where, data }: Row) => {
        const c = achaCert({ id: where.id });
        const { pontos, ...resto } = data;
        Object.assign(c, resto);
        if (pontos?.create) c.pontos = pontos.create.map((p: Row) => ({ id: `p${++seq}x`, ...p }));
        return clone(c);
      },
      updateMany: async ({ where, data }: Row) => {
        const alvo = db.certificados.filter((c: Row) => (where.id == null || c.id === where.id) && (where.vigente == null || c.vigente === where.vigente));
        alvo.forEach((c: Row) => Object.assign(c, data));
        return { count: alvo.length };
      },
      create: async ({ data }: Row) => {
        const { pontos, ...resto } = data;
        // índice único (instrumentoId, numero, revisao) + parcial do original
        if (db.certificados.some((c: Row) => c.instrumentoId === resto.instrumentoId && c.numero === resto.numero && (c.revisao ?? null) === (resto.revisao ?? null))) {
          throw Object.assign(new Error("Unique constraint"), { code: "P2002" });
        }
        const c = { id: `c${++seq}r`, ...resto, pontos: (pontos?.create ?? []).map((p: Row) => ({ id: `p${++seq}r`, ...p })) };
        db.certificados.push(c);
        return clone(c);
      },
    },
    certificadoPadraoPonto: { deleteMany: async ({ where }: Row) => { achaCert({ id: where.certificadoId }).pontos = []; } },
  };
  prisma.$transaction = async (fn: any) => fn(prisma);
  return prisma;
}

const rt = { userId: "u-rt", estabelecimentoId: "e1", perfil: "ADMIN", email: "rt@aion.local" } as any;
const body = (over: Row = {}) => ({
  numero: "C-1", dataEmissao: "2026-01-02", dataValidade: "2027-01-02", laboratorioEmissor: "Lab X", laboratorioAcreditacao: "CAL 1",
  fatorAbrangencia: 2, pontos: [{ unidade: "V", valorNominal: 230, correcao: -0.1, incertezaExpandida: 0.5 }], ...over,
});

describe("(1) certificado sem uso em laudo final — PATCH no lugar", () => {
  it("grava no mesmo registro e audita antes/depois (quem, quando)", async () => {
    const p = mundo({ usado: false });
    const r = await new InstrumentosService(p as any).updateCertificado(rt, "a", "c1", body({ pontos: [{ unidade: "V", valorNominal: 230, incertezaExpandida: 0.7 }], probabilidadeAbrangencia: 95.45 }));
    assert.equal(r.modo, "no_lugar");
    assert.equal(r.id, "c1");
    assert.equal(p.db.certificados.length, 1);
    assert.equal(p.db.certificados[0].pontos[0].incertezaExpandida, 0.7);
    const log = p.db.logs.at(-1);
    assert.equal(log.acao, "CERTIFICADO_PADRAO_EDITADO");
    assert.equal(log.usuarioId, "u-rt");
    assert.ok(log.createdAt instanceof Date);
    const d = JSON.parse(log.detalhe);
    assert.equal(d.antes.pontos[0].incertezaExpandida, 0.5);
    assert.equal(d.depois.pontos[0].incertezaExpandida, 0.7);
    assert.equal(d.depois.probabilidadeAbrangencia, 95.45);
  });
  it("mesmas validações: k vazio nos dois níveis → 400; U = 0 → 400; nada gravado", async () => {
    const p = mundo({ usado: false });
    const s = new InstrumentosService(p as any);
    await assert.rejects(s.updateCertificado(rt, "a", "c1", body({ fatorAbrangencia: undefined })), (e: any) =>
      e instanceof BadRequestException && /Ponto 1: informe k no ponto ou no certificado/.test(e.message));
    await assert.rejects(s.updateCertificado(rt, "a", "c1", body({ pontos: [{ unidade: "V", incertezaExpandida: 0 }] })), (e: any) =>
      e instanceof BadRequestException && /Ponto 1: U deve ser maior que zero/.test(e.message));
    assert.equal(p.db.certificados[0].pontos[0].incertezaExpandida, 0.5);
    assert.equal(p.db.logs.length, 0);
  });
});

describe("(2) certificado usado em laudo final — nunca muda no lugar", () => {
  for (const [nome, over] of [
    ["U", { pontos: [{ unidade: "V", valorNominal: 230, correcao: -0.1, incertezaExpandida: 0.9 }] }],
    ["k", { fatorAbrangencia: 2.1 }],
    ["probabilidade", { probabilidadeAbrangencia: 95 }],
    ["validade", { dataValidade: "2027-06-01" }],
    ["PDF", { anexoDataUrl: "data:application/pdf;base64," + Buffer.from("%PDF-novo").toString("base64") }],
  ] as const) {
    it(`PATCH alterando ${nome} → 409 com a mensagem exata, registro intacto`, async () => {
      const p = mundo({ usado: true });
      const antes = clone(p.db.certificados[0]);
      await assert.rejects(new InstrumentosService(p as any).updateCertificado(rt, "a", "c1", body(over as Row)), (e: any) =>
        e instanceof ConflictException && e.getStatus() === 409 && e.message === MSG_CERT_USADO);
      assert.deepEqual(p.db.certificados[0], antes);
      assert.equal(p.db.certificados.length, 1);
    });
  }
  it("só observações: grava no lugar e audita", async () => {
    const p = mundo({ usado: true });
    const r = await new InstrumentosService(p as any).updateCertificado(rt, "a", "c1", body({ observacoes: "conferido pelo RT" }));
    assert.equal(r.modo, "observacoes");
    assert.equal(p.db.certificados[0].observacoes, "conferido pelo RT");
    assert.equal(p.db.certificados[0].pontos[0].id, "p1", "pontos não recriados");
    const d = JSON.parse(p.db.logs.at(-1).detalhe);
    assert.deepEqual([d.antes.observacoes, d.depois.observacoes], [null, "conferido pelo RT"]);
  });
  it("laudo FINAL é o critério: laudo em rascunho não bloqueia", async () => {
    const p = mundo({ usado: true });
    p.db.laudos[0].statusDocumento = "RASCUNHO";
    const r = await new InstrumentosService(p as any).updateCertificado(rt, "a", "c1", body({ fatorAbrangencia: 2.1 }));
    assert.equal(r.modo, "no_lugar");
  });
});

describe("(2) revisão explícita — POST .../certificados/:certId/revisoes", () => {
  const pdfTexto = async (snap: Row) => {
    const pdf = await buildRelatorioServicoPdf({ instituicao: { nome: "Hospital Teste" }, numero: "L-1", tipo: "CALIBRACAO", statusDocumento: "FINAL",
      equipamento: { tag: "T1", nome: "Monitor" }, executores: [], respostas: [], instrumento: { nome: snap.nome, certificado: snap.certificado } });
    const f = join(mkdtempSync(join(tmpdir(), "rev-")), "l.pdf");
    writeFileSync(f, pdf);
    return execFileSync("pdftotext", ["-layout", f, "-"], { encoding: "utf8" }).replace(/\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}.*$/gm, "");
  };
  const temPdftotext = (() => { try { execFileSync("pdftotext", ["-v"], { stdio: "ignore" }); return true; } catch { return false; } })();

  it("cria revisão ligada, anterior fica não vigente com dados/pontos/PDF intactos; laudo emitido idêntico (valores e PDF)", { skip: !temPdftotext && "pdftotext ausente" }, async () => {
    const p = mundo({ usado: true });
    const certAntes = clone(p.db.certificados[0]);
    const laudoAntes = clone(p.db.laudos[0]);
    const textoAntes = await pdfTexto(p.db.laudos[0].instrumentoSnapshot);
    const s = new InstrumentosService(p as any);
    const r = await s.criarRevisao(rt, "a", "c1", body({ pontos: [{ unidade: "V", valorNominal: 230, incertezaExpandida: 0.4 }], probabilidadeAbrangencia: 95.45 }));
    assert.equal(r.modo, "revisao");
    assert.equal(r.revisao, 1);
    assert.equal(r.revisaoDeId, "c1");
    assert.equal(r.vigente, true);
    const old = p.db.certificados.find((c: Row) => c.id === "c1");
    assert.equal(old.vigente, false);
    assert.deepEqual({ ...old, vigente: true }, certAntes, "só o vigente mudou no anterior");
    const pdfOld = await s.certificadoPdf("e1", "a", "c1");
    assert.deepEqual(Buffer.from(pdfOld.conteudo), Buffer.from(PDF_ORIGINAL), "PDF original segue ligado");
    assert.deepEqual(p.db.laudos[0], laudoAntes, "laudo emitido não muda");
    assert.equal(await pdfTexto(p.db.laudos[0].instrumentoSnapshot), textoAntes, "PDF regerado idêntico");
    const d = JSON.parse(p.db.logs.at(-1).detalhe);
    assert.equal(p.db.logs.at(-1).acao, "CERTIFICADO_PADRAO_REVISAO");
    assert.equal(d.antes.pontos[0].incertezaExpandida, 0.5);
    assert.equal(d.depois.pontos[0].incertezaExpandida, 0.4);
  });
  it("mesmas validações na revisão (k vazio nos dois níveis e U = 0 → 400) e revisar duas vezes o mesmo → 409", async () => {
    const p = mundo({ usado: true });
    const s = new InstrumentosService(p as any);
    await assert.rejects(s.criarRevisao(rt, "a", "c1", body({ fatorAbrangencia: undefined })), BadRequestException);
    await assert.rejects(s.criarRevisao(rt, "a", "c1", body({ pontos: [{ unidade: "V", incertezaExpandida: 0, fatorK: 2 }] })), BadRequestException);
    assert.equal(p.db.certificados[0].vigente, true, "validação falha antes de tocar no anterior");
    await s.criarRevisao(rt, "a", "c1", body());
    await assert.rejects(s.criarRevisao(rt, "a", "c1", body()), ConflictException);
  });
});

describe("(3) laudo novo, sugestão e lista usam a revisão", () => {
  it("snapshot de laudo novo pega a revisão (o substituído fica fora)", async () => {
    const p = mundo({ usado: true });
    const s = new InstrumentosService(p as any);
    const rev = await s.criarRevisao(rt, "a", "c1", body({ pontos: [{ unidade: "V", valorNominal: 230, incertezaExpandida: 0.4 }] }));
    const laudos = new LaudosService(p as any, {} as any, {} as any);
    const snap = await (laudos as any).montarInstrumentoSnapshot("e1", "a", new Date("2026-06-01"), false);
    assert.equal(snap.certificado.id, rev.id);
    assert.equal(snap.certificado.pontos[0].incertezaExpandida, 0.4);
    assert.equal(snap.certificado.pontos[0].fatorK, 2, "k herdado do certificado da revisão");
  });
  it("lista/sugestão (selecionável, pontos) e alertas filtram por certificado atual (vigente e sem revisão posterior)", () => {
    assert.deepEqual(CERT_ATUAL, { vigente: true, revisoes: { none: {} } });
    const svc = readFileSync(resolve(__dirname, "instrumentos.service.ts"), "utf8");
    assert.match(svc, /where: CERT_ATUAL/);
    const alertas = readFileSync(resolve(__dirname, "padrao-alertas.ts"), "utf8");
    assert.match(alertas, /where: \{ vigente: true, revisoes: \{ none: \{\} \} \}/);
  });
});

describe("(4) não existe DELETE de certificado", () => {
  it("baseline de permissões não tem DELETE em /instrumentos-padroes nem /certificados", () => {
    const rotas = JSON.parse(readFileSync(resolve(__dirname, "../auth/permissions-baseline.snapshot.json"), "utf8")) as Row[];
    const del = rotas.filter((r) => r.method === "DELETE" && /instrumentos-padroes|certificad/.test(r.route));
    assert.deepEqual(del, []);
    assert.ok(rotas.some((r) => r.method === "PATCH" && r.route === "/instrumentos-padroes/:id/certificados/:certId"));
    assert.ok(rotas.some((r) => r.method === "POST" && r.route === "/instrumentos-padroes/:id/certificados/:certId/revisoes"));
  });
  it("controller não importa nem usa @Delete", () => {
    const src = readFileSync(resolve(__dirname, "instrumentos.controller.ts"), "utf8");
    assert.ok(!/@Delete\(|\bDelete,/.test(src));
  });
});

describe("B17 — rascunho com certificado do padrão revisado", () => {
  const rtLaudo = { ...rt, permissoesModulos: { laudos: 3 } };
  async function cenario() {
    const p = mundo({ usado: true });
    const inst = new InstrumentosService(p as any);
    const laudos = new LaudosService(p as any, {} as any, {} as any);
    // rascunho criado com o certificado original (U = 0,5)
    const snap = await (laudos as any).montarInstrumentoSnapshot("e1", "a", new Date("2026-06-01"), false);
    p.db.laudos.push({ id: "l2", estabelecimentoId: "e1", instrumentoId: "a", tipo: "RECEBIMENTO", statusDocumento: "RASCUNHO",
      dataExecucao: new Date("2026-06-01"), procedimentoSnapshot: null, procedimento: null, planoTeste: null, equipamento: {},
      respostas: [{ id: "r1", tipo: "calibracao", valorConfigurado: 230, leituras: [230.2] }], instrumentoSnapshot: snap });
    await inst.criarRevisao(rt, "a", "c1", body({ pontos: [{ unidade: "V", valorNominal: 230, correcao: -0.3, incertezaExpandida: 0.4 }] }));
    return { p, laudos };
  }
  it("finalizar → 409 com a mensagem exata e nada gravado", async () => {
    const { p, laudos } = await cenario();
    const antes = clone(p.db.laudos.find((l: Row) => l.id === "l2"));
    await assert.rejects(laudos.finalizar(rtLaudo, "l2"), (e: any) =>
      e instanceof ConflictException && e.getStatus() === 409 && e.message === "Certificado do padrão foi revisado; atualize para a revisão vigente");
    assert.deepEqual(p.db.laudos.find((l: Row) => l.id === "l2"), antes);
    assert.equal(p.db.laudoUpdates ?? 0, 0);
  });
  it("atualizar para a revisão vigente recalcula e depois finaliza", async () => {
    const { p, laudos } = await cenario();
    const atualizado: Row = await laudos.atualizarPadraoRascunho(rtLaudo, "l2");
    const rev = p.db.certificados.find((c: Row) => c.revisaoDeId === "c1");
    assert.equal(atualizado.instrumentoSnapshot.certificado.id, rev.id);
    assert.equal(atualizado.respostas[0].incertezaExpandida, 0.4, "U da revisão");
    assert.equal(atualizado.respostas[0].correcaoPadrao, -0.3, "correção da revisão");
    await laudos.finalizar(rtLaudo, "l2");
    assert.equal(p.db.laudos.find((l: Row) => l.id === "l2").statusDocumento, "FINAL");
  });
  it("laudo final não é atualizado pela rota (400)", async () => {
    const { laudos } = await cenario();
    await assert.rejects(laudos.atualizarPadraoRascunho(rtLaudo, "l1"), BadRequestException);
  });
});

describe("concorrência — duas revisões simultâneas da mesma versão", () => {
  it("uma cria, a outra 409; nunca 500 nem dois vigentes", async () => {
    const p = mundo({ usado: true });
    const s = new InstrumentosService(p as any);
    const rs = await Promise.allSettled([s.criarRevisao(rt, "a", "c1", body()), s.criarRevisao(rt, "a", "c1", body())]);
    assert.equal(rs.filter((r) => r.status === "fulfilled").length, 1);
    const rej = rs.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    assert.equal(rej.length, 1);
    assert.ok(rej[0].reason instanceof ConflictException && rej[0].reason.getStatus() === 409);
    assert.equal(p.db.certificados.filter((c: Row) => c.vigente).length, 1);
  });
  it("violação de índice único (P2002) vira 409", async () => {
    const p = mundo({ usado: true });
    p.db.certificados.push({ ...clone(p.db.certificados[0]), id: "fantasma", revisao: 1, revisaoDeId: null, vigente: false });
    await assert.rejects(new InstrumentosService(p as any).criarRevisao(rt, "a", "c1", body()), (e: any) => e instanceof ConflictException);
  });
  it("certificado não vigente não é revisado (409)", async () => {
    const p = mundo({ usado: true });
    p.db.certificados[0].vigente = false;
    await assert.rejects(new InstrumentosService(p as any).criarRevisao(rt, "a", "c1", body()), ConflictException);
  });
});

describe("auditoria da revisão (LogAcesso)", () => {
  it("quem, quando, antes/depois completos", async () => {
    const p = mundo({ usado: true });
    await new InstrumentosService(p as any).criarRevisao(rt, "a", "c1", body({ fatorAbrangencia: 2.1 }));
    const log = p.db.logs.at(-1);
    assert.equal(log.acao, "CERTIFICADO_PADRAO_REVISAO");
    assert.equal(log.usuarioId, "u-rt");
    assert.ok(log.createdAt instanceof Date);
    const d = JSON.parse(log.detalhe);
    assert.equal(d.certificadoAnteriorId, "c1");
    assert.equal(d.antes.fatorAbrangencia, 2);
    assert.equal(d.depois.fatorAbrangencia, 2.1);
    assert.equal(d.depois.revisao, 1);
    assert.ok(!("anexoConteudo" in d.antes), "sem bytes do PDF no log");
  });
});

describe("índice único parcial do original", () => {
  it("está na migration da revisão", () => {
    const sql = readFileSync(resolve(__dirname, "../../prisma/migrations/20261020120000_certificado_revisao/migration.sql"), "utf8");
    assert.match(sql, /CREATE UNIQUE INDEX "CertificadoPadrao_instrumentoId_numero_original_key" ON "CertificadoPadrao"\("instrumentoId", "numero"\) WHERE "revisao" IS NULL;/);
  });
});
