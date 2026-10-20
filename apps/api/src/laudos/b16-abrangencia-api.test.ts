/**
 * E1 — borda B16 (k ausente), U ≤ 0 em certificado legado, nível API (400, nunca 500) e PDF real.
 */
import "reflect-metadata";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BadRequestException, HttpException, ValidationPipe } from "@nestjs/common";
import { bloqueiosMetrologicosPadrao } from "./laudo-regras";
import { LaudosService } from "./laudos.service";
import { CreateCertificadoDto, InstrumentosController } from "./instrumentos.controller";
import { InstrumentosService } from "./instrumentos.service";
import { buildRelatorioServicoPdf } from "./relatorio-servico-pdf";

const B16 = "Ponto 1: k não informado no certificado do padrão";

describe("B16 — k não informado no certificado do padrão", () => {
  it("regra pura: k ausente após herança bloqueia com a mensagem exata", () => {
    assert.deepEqual(bloqueiosMetrologicosPadrao([{ incertezaExpandida: 0.1, fatorK: null }]), [B16]);
    assert.deepEqual(bloqueiosMetrologicosPadrao([{ incertezaExpandida: 0.1, fatorK: 2 }]), []);
  });
  it("U ≤ 0 (certificado antigo) bloqueia — nunca u_cal = 0", () => {
    assert.deepEqual(bloqueiosMetrologicosPadrao([{ incertezaExpandida: 0.1, fatorK: 2 }, { incertezaExpandida: 0, fatorK: 2 }]), [
      "Ponto 2: U deve ser maior que zero",
    ]);
  });

  function laudosCom(pontos: any[]) {
    let atualizou = false;
    const prisma: any = {
      laudo: {
        findFirst: async () => ({
          id: "l1", tipo: "CALIBRACAO", statusDocumento: "RASCUNHO", respostas: [],
          instrumentoSnapshot: { nome: "ESA", certificado: { numero: "C-OLD", pontos } },
          procedimentoSnapshot: null, procedimento: null, planoTeste: null, equipamento: {},
        }),
        update: async () => { atualizou = true; return {}; },
      },
    };
    return { svc: new LaudosService(prisma, {} as any, {} as any), atualizou: () => atualizou };
  }
  const rt = { userId: "u1", estabelecimentoId: "e1", email: "rt@aion.local", perfil: "ADMIN", permissoesModulos: { laudos: 3 } } as any;

  it("B16: finalizar laudo com padrão sem k → 400 com a mensagem, sem gravar", async () => {
    const { svc, atualizou } = laudosCom([{ valorNominal: 10, incertezaExpandida: 0.1, fatorK: null }]);
    await assert.rejects(svc.finalizar(rt, "l1"), (e: any) => e instanceof BadRequestException && e.getStatus() === 400 && e.message.includes(B16));
    assert.equal(atualizou(), false);
  });
  it("certificado antigo com U = 0 usado em laudo novo → finalização bloqueada", async () => {
    const { svc, atualizou } = laudosCom([{ valorNominal: 10, incertezaExpandida: 0, fatorK: 2 }]);
    await assert.rejects(svc.finalizar(rt, "l1"), (e: any) => e instanceof BadRequestException && /Ponto 1: U deve ser maior que zero/.test(e.message));
    assert.equal(atualizou(), false);
  });
});

describe("API — POST /instrumentos-padroes/:id/certificados", () => {
  const Dto = CreateCertificadoDto;
  const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });
  const prisma: any = {
    instrumentoPadrao: { findFirst: async () => ({ id: "a", estabelecimentoId: "e1", ativo: true }) },
    certificadoPadrao: { findFirst: async () => null },
  };
  const ctrl = new InstrumentosController(new InstrumentosService(prisma));
  const admin = { id: "u1", estabelecimentoId: "e1", perfil: "ADMIN", email: "qa@aion.local" } as any;
  const post = async (body: any) => {
    const dto = await pipe.transform(body, { type: "body", metatype: Dto });
    return ctrl.addCertificado(admin, "a", dto);
  };
  const base = { numero: "C1", dataEmissao: "2026-01-01", dataValidade: "2027-01-01" };

  it("k nulo no ponto e no certificado → 400 com mensagem (nunca 500)", async () => {
    await assert.rejects(post({ ...base, pontos: [{ unidade: "V", incertezaExpandida: 0.5 }] }), (e: any) =>
      e instanceof HttpException && e.getStatus() === 400 && /Ponto 1: informe k no ponto ou no certificado/.test(e.message));
  });
  it("DTO aceita probabilidadeAbrangencia no certificado e no ponto (whitelist)", async () => {
    const dto = await pipe.transform({ ...base, probabilidadeAbrangencia: 95.45, pontos: [{ unidade: "V", incertezaExpandida: 0.5, fatorK: 2, probabilidadeAbrangencia: 99 }] }, { type: "body", metatype: Dto });
    assert.equal(dto.probabilidadeAbrangencia, 95.45);
    assert.equal(dto.pontos[0].probabilidadeAbrangencia, 99);
  });
  it("probabilidade 100 → 400", async () => {
    await assert.rejects(post({ ...base, fatorAbrangencia: 2, probabilidadeAbrangencia: 100, pontos: [{ unidade: "V", incertezaExpandida: 0.5 }] }), (e: any) =>
      e instanceof HttpException && e.getStatus() === 400);
  });
});

describe("PDF real — 'não informada', sem null/NaN/undefined", () => {
  const temPdftotext = (() => { try { execFileSync("pdftotext", ["-v"], { stdio: "ignore" }); return true; } catch { return false; } })();
  it("texto extraído do PDF", { skip: !temPdftotext && "pdftotext ausente" }, async () => {
    const pdf = await buildRelatorioServicoPdf({
      instituicao: { nome: "Hospital Teste" }, numero: "L-1", tipo: "CALIBRACAO", statusDocumento: "FINAL",
      equipamento: { tag: "T1", nome: "Monitor" }, executores: [], respostas: [],
      instrumento: { nome: "ESA612", nSerie: "1", certificado: { numero: "C1", fatorAbrangencia: 2, probabilidadeAbrangencia: null,
        pontos: [{ unidade: "V", valorNominal: 230, incertezaExpandida: 0.5, fatorK: null, probabilidadeAbrangencia: null }] } },
    });
    const dir = mkdtempSync(join(tmpdir(), "pdf-"));
    const f = join(dir, "l.pdf");
    writeFileSync(f, pdf);
    assert.ok(existsSync(f));
    const txt = execFileSync("pdftotext", ["-layout", f, "-"], { encoding: "utf8" });
    assert.match(txt, /probabilidade de abrangência: não informada/);
    assert.match(txt, /U = 0.5 V · k = 2/);
    assert.ok(!/\bnull\b|\bNaN\b|\bundefined\b/.test(txt), txt);
    assert.ok(!/95/.test(txt));
  });
});
