/**
 * E1 — testes de integração do InstrumentosService com um Prisma em memória (sem banco).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { InstrumentosService } from "./instrumentos.service";

type Row = Record<string, any>;

function fakePrisma(seed: { instrumentos?: Row[]; certificados?: Row[]; prefs?: Row[]; dias?: number } = {}) {
  const db = {
    instrumentos: [...(seed.instrumentos ?? [])],
    certificados: [...(seed.certificados ?? [])],
    prefs: [...(seed.prefs ?? [])],
  };
  let seq = 0;
  const matchNSerie = (r: Row, w: Row) => {
    const n = w.nSerie;
    if (n == null) return true;
    if (typeof n === "string") return r.nSerie === n;
    return n.mode === "insensitive" ? r.nSerie.toLowerCase() === n.equals.toLowerCase() : r.nSerie === n.equals;
  };
  const filtraInst = (w: Row = {}) =>
    db.instrumentos.filter(
      (r) =>
        (w.id == null || r.id === w.id) &&
        (w.estabelecimentoId == null || r.estabelecimentoId === w.estabelecimentoId) &&
        (w.ativo == null || r.ativo === w.ativo) &&
        (w.NOT?.id == null || r.id !== w.NOT.id) &&
        matchNSerie(r, w),
    );
  const comCerts = (r: Row) => {
    const certs = db.certificados
      .filter((c) => c.instrumentoId === r.id)
      .sort((a, b) => Number(b.vigente) - Number(a.vigente) || b.dataValidade - a.dataValidade);
    return {
      ...r,
      certificados: certs.map((c) => ({ ...c, pontos: c.pontos ?? [], _count: { pontos: (c.pontos ?? []).length } })),
      _count: { certificados: certs.length },
    };
  };
  const vigenteOnly = (r: Row) => ({ ...r, certificados: r.certificados.filter((c: Row) => c.vigente).slice(0, 1) });
  const prisma: Row = {
    db,
    estabelecimento: { findUnique: async () => ({ diasAlertaCertificado: seed.dias ?? 60 }) },
    instrumentoPadrao: {
      findFirst: async ({ where }: Row) => (filtraInst(where)[0] ? comCerts(filtraInst(where)[0]) : null),
      findMany: async ({ where }: Row) => filtraInst(where).map(comCerts).map(vigenteOnly),
      create: async ({ data }: Row) => {
        if (db.instrumentos.some((r) => r.estabelecimentoId === data.estabelecimentoId && r.nSerie === data.nSerie)) {
          throw new Error("P2002");
        }
        const row = { id: `i${++seq}`, ativo: true, grandezas: [], ...data };
        db.instrumentos.push(row);
        return row;
      },
      update: async ({ where, data }: Row) => {
        const r = db.instrumentos.find((x) => x.id === where.id)!;
        Object.assign(r, data);
        return r;
      },
    },
    certificadoPadrao: {
      findFirst: async ({ where }: Row) =>
        db.certificados.find((c) => c.instrumentoId === where.instrumentoId && (where.numero == null || c.numero === where.numero) && (where.id == null || c.id === where.id)) ?? null,
      updateMany: async ({ where, data }: Row) => {
        for (const c of db.certificados) if (c.instrumentoId === where.instrumentoId && c.vigente === where.vigente) Object.assign(c, data);
        return {};
      },
      create: async ({ data }: Row) => {
        const { pontos, ...rest } = data;
        const row = { id: `c${++seq}`, ...rest, pontos: pontos?.create ?? [] };
        db.certificados.push(row);
        return row;
      },
    },
    padraoPreferencial: { findMany: async () => db.prefs },
  };
  prisma.$transaction = async (fn: (tx: Row) => unknown) => fn(prisma);
  return prisma;
}

const admin = { id: "u1", estabelecimentoId: "e1", perfil: "ADMIN", email: "qa@aion.local" } as any;
const svc = (p: Row) => new InstrumentosService(p as any);

describe("E1 crit.1 — cadastro de padrão", () => {
  it("cadastra com tipo, nº de série, grandezas, faixa e resolução", async () => {
    const p = fakePrisma();
    const r = await svc(p).create(admin, {
      nome: "ESA612", nSerie: " 123 ", tipoAnalisador: "Analisador de segurança elétrica",
      grandezas: ["tensão", " corrente "], faixaMedicao: "0–300 V", resolucao: "0,1 V",
    });
    assert.equal(r.nSerie, "123");
    assert.equal(r.tipoAnalisador, "Analisador de segurança elétrica");
    assert.deepEqual(r.grandezas, ["tensão", "corrente"]);
    assert.equal(r.faixaMedicao, "0–300 V");
    assert.equal(r.resolucao, "0,1 V");
  });
  it("nº de série duplicado no estabelecimento → 409 (inclui inativo e maiúsculas)", async () => {
    const p = fakePrisma({ instrumentos: [{ id: "x", estabelecimentoId: "e1", nome: "Antigo", nSerie: "AB-1", ativo: false }] });
    await assert.rejects(svc(p).create(admin, { nome: "Novo", nSerie: "ab-1" }), ConflictException);
  });
  it("mesmo nº de série em outro estabelecimento é permitido", async () => {
    const p = fakePrisma({ instrumentos: [{ id: "x", estabelecimentoId: "e2", nome: "Outro", nSerie: "AB-1", ativo: true }] });
    const r = await svc(p).create(admin, { nome: "Novo", nSerie: "AB-1" });
    assert.equal(r.nSerie, "AB-1");
  });
  it("editar para nº de série de outro padrão → 409", async () => {
    const p = fakePrisma({ instrumentos: [
      { id: "a", estabelecimentoId: "e1", nome: "A", nSerie: "1", ativo: true },
      { id: "b", estabelecimentoId: "e1", nome: "B", nSerie: "2", ativo: true },
    ] });
    await assert.rejects(svc(p).update(admin, "b", { nSerie: "1" }), ConflictException);
    const ok = await svc(p).update(admin, "b", { nSerie: "2" });
    assert.equal(ok.nSerie, "2");
  });
});

describe("E1 crit.2 — certificado do padrão", () => {
  const base = () => fakePrisma({
    instrumentos: [{ id: "a", estabelecimentoId: "e1", nome: "ESA612", nSerie: "1", ativo: true }],
    certificados: [{ id: "old", instrumentoId: "a", estabelecimentoId: "e1", numero: "C-2025", vigente: true,
      dataEmissao: new Date("2025-01-01"), dataValidade: new Date("2026-01-01"), pontos: [] }],
  });
  const pdf = "data:application/pdf;base64," + Buffer.from("%PDF-1.4").toString("base64");
  it("grava número, laboratório, acreditação, datas, k, PDF e pontos; o anterior deixa de ser vigente sem ser apagado", async () => {
    const p = base();
    const r = await svc(p).addCertificado(admin, "a", {
      numero: "C-2026", laboratorioEmissor: "Lab X", laboratorioAcreditacao: "CAL 0001",
      dataEmissao: "2026-01-02", dataValidade: "2027-01-02", fatorAbrangencia: 2, anexoDataUrl: pdf,
      pontos: [{ unidade: "V", valorNominal: 230, correcao: -0.1, incertezaExpandida: 0.5, fatorK: 2 }],
    });
    assert.equal(r.vigente, true);
    assert.equal(r.temAnexo, true);
    assert.equal(r.laboratorioAcreditacao, "CAL 0001");
    assert.equal(r.fatorAbrangencia, 2);
    assert.equal(r.pontos.length, 1);
    assert.equal(r.pontos[0].incertezaExpandida, 0.5);
    const db = p.db;
    assert.equal(db.certificados.length, 2, "o anterior não é apagado");
    assert.equal(db.certificados.find((c: Row) => c.id === "old").vigente, false);
    assert.equal(db.instrumentos[0].certificadoNumero, "C-2026");
  });
  it("número repetido no mesmo padrão → 409", async () => {
    await assert.rejects(
      svc(base()).addCertificado(admin, "a", { numero: "C-2025", dataEmissao: "2026-01-01", dataValidade: "2027-01-01" }),
      ConflictException,
    );
  });
  it("validade antes da emissão ou anexo não-PDF → 400", async () => {
    await assert.rejects(svc(base()).addCertificado(admin, "a", { numero: "N", dataEmissao: "2026-02-01", dataValidade: "2026-01-01" }), BadRequestException);
    await assert.rejects(
      svc(base()).addCertificado(admin, "a", { numero: "N", dataEmissao: "2026-01-01", dataValidade: "2027-01-01", anexoDataUrl: "data:image/png;base64,AAAA" }),
      BadRequestException,
    );
  });
});

describe("E1 crit.3 — alertas", () => {
  const d = (dias: number) => new Date(Date.now() + dias * 86400000);
  const seed = (dias?: number) => fakePrisma({
    dias,
    instrumentos: [
      { id: "v", estabelecimentoId: "e1", nome: "Vencido", nSerie: "1", ativo: true },
      { id: "a", estabelecimentoId: "e1", nome: "AVencer", nSerie: "2", ativo: true },
      { id: "l", estabelecimentoId: "e1", nome: "Longe", nSerie: "3", ativo: true },
      { id: "x", estabelecimentoId: "e1", nome: "Inativo", nSerie: "4", ativo: false },
    ],
    certificados: [
      { id: "c1", instrumentoId: "v", numero: "1", vigente: true, dataValidade: d(-3) },
      { id: "c2", instrumentoId: "a", numero: "2", vigente: true, dataValidade: d(30) },
      { id: "c3", instrumentoId: "l", numero: "3", vigente: true, dataValidade: d(80) },
      { id: "c4", instrumentoId: "x", numero: "4", vigente: true, dataValidade: d(-30) },
    ],
  });
  it("janela padrão 60 dias: vencido + a vencer; inativo fora", async () => {
    const r = await svc(seed()).alertas("e1");
    assert.equal(r.diasAlerta, 60);
    assert.deepEqual(r.itens.map((i) => [i.instrumentoId, i.status]), [["v", "VENCIDO"], ["a", "A_VENCER"]]);
    assert.deepEqual(r.resumo, { vencidos: 1, aVencer: 1, semCertificado: 0, total: 2 });
  });
  it("janela configurada no estabelecimento (90 dias) e por query (?dias=15)", async () => {
    assert.equal((await svc(seed(90)).alertas("e1")).itens.length, 3);
    assert.equal((await svc(seed(90)).alertas("e1", 15)).itens.length, 1);
  });
});

describe("E1 crit.4 — sugestão de padrão no laudo", () => {
  it("sugere o preferencial do tipo; se vencido, outro selecionável do mesmo tipo", async () => {
    const ponto = [{ unidade: "J", incertezaExpandida: 1 }];
    const p = fakePrisma({
      instrumentos: [
        { id: "p1", estabelecimentoId: "e1", nome: "Impulse", nSerie: "1", tipoAnalisador: "Desfibrilador", ativo: true },
        { id: "p2", estabelecimentoId: "e1", nome: "Impulse B", nSerie: "2", tipoAnalisador: "Desfibrilador", ativo: true },
      ],
      certificados: [
        { id: "c1", instrumentoId: "p1", numero: "1", vigente: true, dataValidade: new Date(Date.now() + 200 * 86400000), pontos: ponto },
        { id: "c2", instrumentoId: "p2", numero: "2", vigente: true, dataValidade: new Date(Date.now() + 200 * 86400000), pontos: ponto },
      ],
      prefs: [{ tipo: "Desfibrilador", instrumentoId: "p1" }],
    });
    const s1 = await svc(p).sugestao("e1", "Desfibrilador");
    assert.equal(s1.instrumentoId, "p1");
    assert.equal(s1.origem, "PREFERENCIAL");
    p.db.certificados[0].dataValidade = new Date(Date.now() - 86400000);
    const s2 = await svc(p).sugestao("e1", "Desfibrilador");
    assert.equal(s2.instrumentoId, "p2");
    assert.equal(s2.origem, "MESMO_TIPO");
  });
});
