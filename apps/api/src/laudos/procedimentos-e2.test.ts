/**
 * E2 — procedimentos versionados: um bloco por critério (5–11a), bordas B3/B8–B11 e decisões Q1–Q8 do TL.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "reflect-metadata";
import { BadRequestException, ConflictException, ForbiddenException, GoneException, UnprocessableEntityException, ValidationPipe } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { permissoesDoPerfil, MSG_B10, achatarParaItens, resolverHeranca } from "@aion/shared";
import { criarFakePrisma } from "./e2-fixtures.test";
import { ProcedimentosService, MSG_SO_RASCUNHO, MSG_CONFLITO_RASCUNHO, MSG_SEM_PERMISSAO_PUBLICAR, MSG_ROTA_DEPRECIADA } from "./procedimentos.service";
import { ProcedimentosController, CreateProcDto } from "./procedimentos.controller";
import { LaudosService, MSG_PROCEDIMENTO_INATIVO } from "./laudos.service";
import { buildRelatorioServicoPdf } from "./relatorio-servico-pdf";
import { resolverProcedimentoDoPlano } from "./procedimento-resolver";
import { backfillPlanoProcedimento } from "./backfill-plano-procedimento";
import { OrganizacaoConfigService } from "../config/organizacao-config.service";

const user = (over: Record<string, unknown> = {}) =>
  ({ userId: "u-rt", email: "rt@aion.local", estabelecimentoId: "e1", perfil: "ADMIN", permissoesModulos: permissoesDoPerfil("ADMIN"), permissoesEspeciais: ["procedimento.publicar"], ...over }) as any;
const semPublicar = user({ userId: "u-eng", email: "eng@aion.local", perfil: "ENGENHEIRO", permissoesModulos: permissoesDoPerfil("ENGENHEIRO"), permissoesEspeciais: [] });

const medicao = (over: Record<string, unknown> = {}) => ({
  id: "m1", titulo: "Energia", item: {
    id: "m1", tipo: "MEDICAO", titulo: "Energia", grandeza: "Energia", unidade: "J", tipoPadrao: "Analisador de desfibrilador",
    nLeituras: 3, resolucao: 1, tolerancia: { referencia: "IEC 60601-2-4", versao: "2010" },
    pontos: [{ id: "p50", nominal: 50, limite: { tipo: "NOM_PCT", a: 15 } }, { id: "p150", nominal: 150, limite: { tipo: "NOM_ABS", a: 10 } }],
    ...over,
  },
});
const arvoreOk = (over: Record<string, unknown> = {}) => ({
  nos: [{ id: "s1", titulo: "Desfibrilação", filhos: [{ id: "s1.1", titulo: "Energia entregue", filhos: [medicao(over)] }] },
    { id: "q1", titulo: "Inspeção visual", item: { id: "q1", tipo: "QUALITATIVA", titulo: "Inspeção visual", subitens: [{ id: "a", texto: "Gabinete íntegro" }] } }],
});

function mundo(seed: Record<string, any[]> = {}) {
  const p = criarFakePrisma({
    usuario: [{ id: "u-rt", nome: "RT Teste" }, { id: "u-eng", nome: "Eng Teste" }],
    equipamento: [{ id: "eq1", estabelecimentoId: "e1", tag: "T-1", nome: "Desfibrilador", tipoEquipamentoPlanoId: null }],
    ...seed,
  });
  return { p, svc: new ProcedimentosService(p as any), laudos: new LaudosService(p as any, {} as any, {} as any) };
}

async function publicado(svc: ProcedimentosService, over: Record<string, unknown> = {}, arv: unknown = arvoreOk()) {
  const proc = await svc.create(user(), { codigo: "PR-DEF", tituloLaudo: "Calibração de desfibrilador", tipo: "CALIBRACAO" as any, tipoDocumento: "CERTIFICADO" as any, ...over } as any);
  const v = await svc.salvarRascunho(user(), proc.id, proc.rascunho.id, { atualizadoEm: proc.rascunho.atualizadoEm!.toISOString(), arvore: arv });
  const r = await svc.publicar(user(), proc.id, v.id!, { confirmarAvisos: true });
  return { proc, versao: r.versao! };
}

describe("crit. 5 — procedimento novo nasce em RASCUNHO com cabeçalho completo", () => {
  it("cria código, título, tipo, genérico, validade, norma; v1 RASCUNHO", async () => {
    const { p, svc } = mundo();
    const r = await svc.create(user(), { codigo: "PR-01", tituloLaudo: "Calibração de monitor", tipo: "CALIBRACAO" as any, generico: true, validadeMeses: 12, norma: "IEC 60601", tipoDocumento: "LAUDO" as any });
    assert.equal(r.codigo, "PR-01");
    assert.equal(r.rascunho.status, "RASCUNHO");
    assert.equal(r.rascunho.versao, 1);
    assert.equal(r.rascunho.generico, true);
    assert.equal(r.rascunho.norma, "IEC 60601");
    assert.equal(r.versaoPublicadaId, null);
    assert.equal(p.t.procedimentoLaudoVersao.length, 1);
  });
  it("código repetido no estabelecimento → 409; em outro estabelecimento pode", async () => {
    const { svc } = mundo();
    await svc.create(user(), { codigo: "PR-01", tituloLaudo: "A b", tipo: "CALIBRACAO" as any });
    await assert.rejects(svc.create(user(), { codigo: "PR-01", tituloLaudo: "C d", tipo: "TSE" as any }), (e: any) => e instanceof ConflictException && /PR-01 já é usado/.test(e.message));
    await svc.create(user({ estabelecimentoId: "e2" }), { codigo: "PR-01", tituloLaudo: "C d", tipo: "TSE" as any });
  });
  it("DTO: sem código ou título → 400 (ValidationPipe)", async () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true });
    await assert.rejects(pipe.transform({ tipo: "CALIBRACAO", tituloLaudo: "Ok ok" }, { type: "body", metatype: CreateProcDto }), BadRequestException);
    await assert.rejects(pipe.transform({ tipo: "CALIBRACAO", codigo: "X" }, { type: "body", metatype: CreateProcDto }), BadRequestException);
  });
  it("Q5: procedimentos legados seguem com código nulo (não há escrita em linhas existentes)", async () => {
    const { p, svc } = mundo({ procedimentoLaudo: [{ id: "leg", estabelecimentoId: "e1", nome: "Legado", tipo: "CALIBRACAO", itens: [], versao: 2, ativo: true, codigo: null, versaoPublicadaId: null }] });
    await svc.create(user(), { codigo: "PR-02", tituloLaudo: "Novo novo", tipo: "CALIBRACAO" as any });
    assert.equal(p.t.procedimentoLaudo.find((x: any) => x.id === "leg").codigo, null);
  });
});

describe("crit. 6/6a–6d — checklist em árvore (até 3 níveis) com itens tipados", () => {
  it("aceita seção > subseção > item MEDIÇÃO com pontos e limites por ponto", async () => {
    const { svc } = mundo();
    const proc = await svc.create(user(), { codigo: "PR-A", tituloLaudo: "Árvore ok", tipo: "CALIBRACAO" as any });
    const v = await svc.salvarRascunho(user(), proc.id, proc.rascunho.id, { atualizadoEm: proc.rascunho.atualizadoEm!.toISOString(), arvore: arvoreOk() });
    assert.equal((v.arvore as any).nos[0].filhos[0].filhos[0].item.pontos.length, 2);
  });
  it("4º nível → 400 (schema do @aion/shared)", async () => {
    const { svc } = mundo();
    const proc = await svc.create(user(), { codigo: "PR-B", tituloLaudo: "Árvore funda", tipo: "CALIBRACAO" as any });
    const funda = { nos: [{ id: "a", titulo: "A", filhos: [{ id: "b", titulo: "B", filhos: [{ id: "c", titulo: "C", filhos: [{ id: "d", titulo: "D", item: { id: "d", tipo: "REGISTRO", titulo: "D" } }] }] }] }] };
    await assert.rejects(svc.salvarRascunho(user(), proc.id, proc.rascunho.id, { atualizadoEm: proc.rascunho.atualizadoEm!.toISOString(), arvore: funda }), (e: any) => e instanceof BadRequestException && /profundidade máxima é 3/.test(e.message));
  });
  it("tipo de item, limite e id inválidos → 400", async () => {
    const { svc } = mundo();
    const proc = await svc.create(user(), { codigo: "PR-C", tituloLaudo: "Árvore ruim", tipo: "CALIBRACAO" as any });
    const ruim = { nos: [{ id: "x", titulo: "X", item: { id: "x", tipo: "FOO", titulo: "X", pontos: [{ id: "p", nominal: 1, limite: { tipo: "BAR" } }] } }, { id: "x", titulo: "Dup" }] };
    await assert.rejects(svc.salvarRascunho(user(), proc.id, proc.rascunho.id, { atualizadoEm: proc.rascunho.atualizadoEm!.toISOString(), arvore: ruim }), (e: any) =>
      /tipo inválido/.test(e.message) && /tipo de limite inválido/.test(e.message) && /id repetido/.test(e.message));
  });
  it("achatamento: um item por ponto, nLeituras → repetições, % e ± viram tolerância; qualitativo vira check", () => {
    const itens = achatarParaItens(arvoreOk() as any);
    assert.deepEqual(itens.map((i) => i.id), ["m1:p50", "m1:p150", "q1:a"]);
    assert.equal(itens[0].repeticoes, 3);
    assert.deepEqual([itens[0].tolerancia?.modo, itens[0].tolerancia?.valor], ["percentual", 15]);
    assert.deepEqual([itens[1].tolerancia?.modo, itens[1].tolerancia?.valor], ["absoluto", 10]);
    assert.equal(itens[0].secao, "Desfibrilação › Energia entregue");
    assert.equal(itens[2].tipo, "check");
  });
});

describe("crit. 6e + Q3/Q4 — herança do procedimento-pai", () => {
  it("derivado herda itens, sobrescreve só campos permitidos, oculta e acrescenta", async () => {
    const { svc } = mundo();
    const { proc: pai } = await publicado(svc);
    const filho = await svc.create(user(), { codigo: "PR-FILHO", tituloLaudo: "Derivado", tipo: "CALIBRACAO" as any, tipoDocumento: "LAUDO" as any, paiId: pai.id });
    const arv = { nos: [{ id: "r1", titulo: "Rede", item: { id: "r1", tipo: "REGISTRO", titulo: "Tensão de rede", unidade: "V" } }],
      heranca: { sobrescritas: { m1: { nLeituras: 5, limites: { p50: { tipo: "MAX_LE", b: 60 } } } }, ocultos: ["q1"] } };
    const v = await svc.salvarRascunho(user(), filho.id, filho.rascunho.id, { atualizadoEm: filho.rascunho.atualizadoEm!.toISOString(), arvore: arv });
    const r = await svc.publicar(user(), filho.id, v.id!, { confirmarAvisos: true });
    const res = (r.versao as any).itensResolvidos.arvore;
    const m1 = res.nos[0].filhos[0].filhos[0];
    assert.equal(m1.origem, "pai");
    assert.deepEqual(m1.sobrescritos, ["nLeituras", "limites"]);
    assert.equal(m1.item.nLeituras, 5);
    assert.deepEqual(m1.item.pontos[0].limite, { tipo: "MAX_LE", b: 60 });
    assert.equal(m1.item.pontos[1].limite.tipo, "NOM_ABS", "ponto não sobrescrito herda do pai");
    assert.ok(!JSON.stringify(res).includes('"q1"'), "item oculto some");
    assert.equal(res.nos.at(-1).id, "r1");
  });
  it("sobrescrever campo não permitido (ex.: unidade) → 400", async () => {
    const { svc } = mundo();
    const { proc: pai } = await publicado(svc);
    const filho = await svc.create(user(), { codigo: "PR-F2", tituloLaudo: "Derivado", tipo: "CALIBRACAO" as any, paiId: pai.id });
    await assert.rejects(svc.salvarRascunho(user(), filho.id, filho.rascunho.id, { atualizadoEm: filho.rascunho.atualizadoEm!.toISOString(), arvore: { nos: [], heranca: { sobrescritas: { m1: { unidade: "kJ" } } } } }),
      (e: any) => /campo "unidade" não pode ser sobrescrito/.test(e.message));
  });
  it("Q3: cadeia de 3 níveis ok; 4º nível e ciclo → 400", async () => {
    const { svc } = mundo();
    const { proc: a } = await publicado(svc, { codigo: "A" });
    const b = await svc.create(user(), { codigo: "B", tituloLaudo: "Nível B", tipo: "CALIBRACAO" as any, paiId: a.id });
    const c = await svc.create(user(), { codigo: "C", tituloLaudo: "Nível C", tipo: "CALIBRACAO" as any, paiId: b.id });
    await assert.rejects(svc.create(user(), { codigo: "D", tituloLaudo: "Nível D", tipo: "CALIBRACAO" as any, paiId: c.id }), (e: any) => /no máximo 3 níveis/.test(e.message));
    const va = await svc.abrirRascunho(user(), a.id);
    await assert.rejects(svc.salvarRascunho(user(), a.id, va.id, { atualizadoEm: va.atualizadoEm!.toISOString(), paiId: c.id }), (e: any) => /Herança circular|no máximo 3/.test(e.message));
    await assert.rejects(svc.salvarRascunho(user(), b.id, (await svc.abrirRascunho(user(), b.id)).id, { atualizadoEm: new Date(0).toISOString(), paiId: b.id }), (e: any) => /Herança circular/.test(e.message));
  });
  it("resolverHeranca recusa cadeia com mais de 3 árvores", () => {
    assert.throws(() => resolverHeranca([{ nos: [] }, { nos: [] }, { nos: [] }, { nos: [] }]), /no máximo 3/);
  });
  it("Q4: filho fica na versão do pai usada; pai republicado → aviso 'Procedimento pai tem versão N'; filho muda só ao republicar", async () => {
    const { svc } = mundo();
    const { proc: pai } = await publicado(svc);
    const filho = await svc.create(user(), { codigo: "PR-F", tituloLaudo: "Derivado", tipo: "CALIBRACAO" as any, tipoDocumento: "LAUDO" as any, paiId: pai.id });
    await svc.publicar(user(), filho.id, filho.rascunho.id, { confirmarAvisos: true });
    assert.deepEqual((await svc.byId("e1", filho.id)).avisos, []);
    const rp = await svc.abrirRascunho(user(), pai.id);
    const vp = await svc.salvarRascunho(user(), pai.id, rp.id, { atualizadoEm: rp.atualizadoEm!.toISOString(), arvore: arvoreOk({ nLeituras: 9 }) });
    await svc.publicar(user(), pai.id, vp.id!, { confirmarAvisos: true });
    const det = await svc.byId("e1", filho.id);
    assert.deepEqual(det.avisos, ["Procedimento pai tem versão 2"]);
    assert.equal((det.versaoPublicada as any).itensResolvidos.arvore.nos[0].filhos[0].filhos[0].item.nLeituras, 3, "filho preso à v1 do pai");
    const rf = await svc.abrirRascunho(user(), filho.id);
    const novo = await svc.publicar(user(), filho.id, rf.id, { confirmarAvisos: true });
    assert.equal((novo.versao as any).itensResolvidos.arvore.nos[0].filhos[0].filhos[0].item.nLeituras, 9);
    assert.deepEqual((await svc.byId("e1", filho.id)).avisos, []);
  });
});

describe("crit. 8 — publicação: versão + data, imutável, editar abre rascunho, rótulo da lista", () => {
  it("publica v1, espelha no procedimento e audita", async () => {
    const { p, svc } = mundo();
    const { proc, versao } = await publicado(svc);
    assert.equal(versao.status, "PUBLICADO");
    assert.ok(versao.publicadoEm instanceof Date);
    assert.equal(versao.publicadoPorNome, "RT Teste");
    const pr = p.t.procedimentoLaudo.find((x: any) => x.id === proc.id);
    assert.equal(pr.versaoPublicadaId, versao.id);
    assert.equal(pr.itens.length, 3, "espelho dos itens para leitores legados (mobile)");
    assert.equal(p.t.logAcesso.at(-1).acao, "PROCEDIMENTO_PUBLICADO");
  });
  it("versão publicada é imutável (PATCH → 409); novo rascunho v2; publicar arquiva v1", async () => {
    const { p, svc } = mundo();
    const { proc, versao } = await publicado(svc);
    await assert.rejects(svc.salvarRascunho(user(), proc.id, versao.id, { atualizadoEm: new Date().toISOString(), tituloLaudo: "x" }), (e: any) => e instanceof ConflictException && e.message === MSG_SO_RASCUNHO);
    const r2 = await svc.abrirRascunho(user(), proc.id);
    assert.equal(r2.versao, 2);
    assert.equal((await svc.abrirRascunho(user(), proc.id)).id, r2.id, "idempotente: um rascunho por vez");
    await svc.publicar(user(), proc.id, r2.id, { confirmarAvisos: true });
    assert.equal(p.t.procedimentoLaudoVersao.find((v: any) => v.id === versao.id).status, "ARQUIVADO");
    assert.deepEqual(p.t.procedimentoLaudoVersao.find((v: any) => v.id === versao.id).itens.length, 3, "conteúdo da v1 intacto");
  });
  it("lista mostra 'CÓDIGO – TÍTULO vX (publicação dd/mm/aaaa)'", async () => {
    const { svc } = mundo();
    const { versao } = await publicado(svc);
    const l = await svc.list("e1");
    const data = versao.publicadoEm!.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
    assert.equal((l[0] as any).rotulo, `PR-DEF – Calibração de desfibrilador v1 (publicação ${data})`);
  });
  it("concorrência no rascunho: token velho → 409", async () => {
    const { svc } = mundo();
    const proc = await svc.create(user(), { codigo: "PR-X", tituloLaudo: "Concorrência", tipo: "CALIBRACAO" as any });
    const tok = proc.rascunho.atualizadoEm!.toISOString();
    await new Promise((r) => setTimeout(r, 2));
    await svc.salvarRascunho(user(), proc.id, proc.rascunho.id, { atualizadoEm: tok, tituloLaudo: "A primeira" });
    await assert.rejects(svc.salvarRascunho(user(), proc.id, proc.rascunho.id, { atualizadoEm: tok, tituloLaudo: "A segunda" }), (e: any) => e.message === MSG_CONFLITO_RASCUNHO);
  });
  it("publicação concorrente: a segunda recebe 409 e nada fica pela metade", async () => {
    const { p, svc } = mundo();
    const proc = await svc.create(user(), { codigo: "PR-Y", tituloLaudo: "Corrida", tipo: "CALIBRACAO" as any, tipoDocumento: "LAUDO" as any });
    const v = await svc.salvarRascunho(user(), proc.id, proc.rascunho.id, { atualizadoEm: proc.rascunho.atualizadoEm!.toISOString(), arvore: arvoreOk() });
    const rs = await Promise.allSettled([svc.publicar(user(), proc.id, v.id!, { confirmarAvisos: true }), svc.publicar(user(), proc.id, v.id!, { confirmarAvisos: true })]);
    assert.equal(rs.filter((r) => r.status === "fulfilled").length, 1);
    assert.ok(rs.some((r) => r.status === "rejected" && r.reason instanceof ConflictException));
    assert.equal(p.t.procedimentoLaudoVersao.filter((x: any) => x.status === "PUBLICADO").length, 1);
  });
});

describe("Q1 — permissão especial procedimento.publicar", () => {
  it("sem a permissão → 403 (mesmo com EDIÇÃO_APROVAÇÃO); ADMIN sem atribuição também não publica", async () => {
    const { svc } = mundo();
    const proc = await svc.create(user(), { codigo: "PR-P", tituloLaudo: "Permissão", tipo: "CALIBRACAO" as any, tipoDocumento: "LAUDO" as any });
    await assert.rejects(svc.publicar(semPublicar, proc.id, proc.rascunho.id, {}), (e: any) => e instanceof ForbiddenException && e.message === MSG_SEM_PERMISSAO_PUBLICAR);
    await assert.rejects(svc.publicar(user({ permissoesEspeciais: [] }), proc.id, proc.rascunho.id, {}), ForbiddenException);
  });
  it("só ADMIN concede; concede a qualquer usuário; normaliza e audita; personificação não concede", async () => {
    const p = criarFakePrisma({ usuarioEstabelecimento: [{ id: "v1", usuarioId: "u-tec", estabelecimentoId: "e1", perfil: "TECNICO", permissoesEspeciais: null }] });
    const cfg = new OrganizacaoConfigService(p as any);
    await assert.rejects(cfg.setPermissoesEspeciais(user({ perfil: "GESTOR" }), "u-tec", ["procedimento.publicar"]), ForbiddenException);
    await assert.rejects(cfg.setPermissoesEspeciais(user({ impersonatorId: "x" }), "u-tec", ["procedimento.publicar"]), ForbiddenException);
    await assert.rejects(cfg.setPermissoesEspeciais(user(), "u-tec", ["laudos.tudo"]), BadRequestException);
    const r = await cfg.setPermissoesEspeciais(user(), "u-tec", ["procedimento.publicar", "procedimento.publicar"]);
    assert.deepEqual(r.permissoesEspeciais, ["procedimento.publicar"]);
    const log = p.t.logAcesso.at(-1);
    assert.equal(log.acao, "PERMISSOES_ESPECIAIS_ALTERADAS");
    assert.deepEqual(JSON.parse(log.detalhe).depois, ["procedimento.publicar"]);
  });
});

describe("crit. 9 — vínculo a modelos e planos; plano → FK com dual-read", () => {
  it("rascunho nunca publicado não vincula; publicado vincula plano por FK sem tocar procedimentoCodigo", async () => {
    const { p, svc } = mundo({ tipoEquipamentoPlano: [{ id: "tp1", estabelecimentoId: "e1" }], planoTeste: [{ id: "pt1", tipoEquipamentoPlanoId: "tp1", tipoTeste: "CALIBRACAO", procedimentoCodigo: "POP-9", procedimentoId: null }] });
    const rasc = await svc.create(user(), { codigo: "PR-R", tituloLaudo: "Só rascunho", tipo: "CALIBRACAO" as any });
    await assert.rejects(svc.vincularPlano(user(), rasc.id, "pt1"), (e: any) => /Publique o procedimento/.test(e.message));
    await assert.rejects(svc.vincularModelo(user(), rasc.id, "mod1"), (e: any) => /Publique o procedimento/.test(e.message));
    const { proc } = await publicado(svc);
    await svc.vincularPlano(user(), proc.id, "pt1");
    assert.equal(p.t.planoTeste[0].procedimentoId, proc.id);
    assert.equal(p.t.planoTeste[0].procedimentoCodigo, "POP-9");
  });
  it("dual-read: id → código do procedimento → código do POP → null com aviso", async () => {
    const p = criarFakePrisma({
      procedimentoLaudo: [{ id: "pA", estabelecimentoId: "e1", codigo: "PR-A", ativo: true }, { id: "pB", estabelecimentoId: "e1", codigo: null, ativo: true }],
      pop: [{ id: "pop1", estabelecimentoId: "e1", codigo: "POP-B", procedimentoLaudoId: "pB" }],
    });
    assert.equal((await resolverProcedimentoDoPlano(p as any, "e1", { procedimentoId: "pB", procedimentoCodigo: "PR-A" })).via, "id");
    assert.equal((await resolverProcedimentoDoPlano(p as any, "e1", { procedimentoCodigo: "PR-A" })).procedimento.id, "pA");
    const viaPop = await resolverProcedimentoDoPlano(p as any, "e1", { procedimentoCodigo: "POP-B" });
    assert.deepEqual([viaPop.via, viaPop.procedimento.id], ["pop", "pB"]);
    const nada = await resolverProcedimentoDoPlano(p as any, "e1", { procedimentoCodigo: "ZZZ" });
    assert.equal(nada.procedimento, null);
    assert.match(nada.aviso!, /ZZZ não encontrado/);
    assert.equal((await resolverProcedimentoDoPlano(p as any, "e2", { procedimentoCodigo: "PR-A" })).procedimento, null, "não cruza estabelecimento");
  });
  it("Q6: backfill --dry-run não grava; execução real é idempotente e não toca procedimentoCodigo", async () => {
    const p = criarFakePrisma({
      tipoEquipamentoPlano: [{ id: "tp1", estabelecimentoId: "e1" }],
      procedimentoLaudo: [{ id: "pA", estabelecimentoId: "e1", codigo: "PR-A", ativo: true }],
      planoTeste: [{ id: "t1", tipoEquipamentoPlanoId: "tp1", tipoTeste: "CALIBRACAO", procedimentoCodigo: "PR-A", procedimentoId: null }, { id: "t2", tipoEquipamentoPlanoId: "tp1", tipoTeste: "TSE", procedimentoCodigo: "SEM", procedimentoId: null }],
      planoInstancia: [{ id: "i1", estabelecimentoId: "e1", procedimentoCodigo: "PR-A", procedimentoId: null }],
    });
    const seco = await backfillPlanoProcedimento(p as any, { dryRun: true });
    assert.deepEqual([seco.analisadas, seco.resolvidas, seco.semProcedimento, seco.gravadas], [3, 2, 1, 0]);
    assert.equal(p.t.planoTeste[0].procedimentoId, null);
    const real = await backfillPlanoProcedimento(p as any, { dryRun: false });
    assert.equal(real.gravadas, 2);
    assert.equal(p.t.planoTeste[0].procedimentoId, "pA");
    assert.equal(p.t.planoInstancia[0].procedimentoId, "pA");
    assert.equal(p.t.planoTeste[0].procedimentoCodigo, "PR-A");
    const de_novo = await backfillPlanoProcedimento(p as any, { dryRun: false });
    assert.equal(de_novo.gravadas, 0);
  });
});

describe("crit. 10 / 6f / B10 / B11 — validação da publicação", () => {
  const publicarCom = async (item: Record<string, unknown>, extra: Record<string, unknown> = {}) => {
    const { svc } = mundo();
    const proc = await svc.create(user(), { codigo: "PR-V", tituloLaudo: "Validação", tipo: "CALIBRACAO" as any, tipoDocumento: "LAUDO" as any, ...extra });
    const v = await svc.salvarRascunho(user(), proc.id, proc.rascunho.id, { atualizadoEm: proc.rascunho.atualizadoEm!.toISOString(), arvore: arvoreOk(item) });
    return { svc, proc, v };
  };
  it("crit. 10: medição sem tolerância com referência → aviso; exige confirmação; publicada fica NÃO_AVALIADO depois", async () => {
    const { svc, proc, v } = await publicarCom({ tolerancia: null });
    await assert.rejects(svc.publicar(user(), proc.id, v.id!, {}), (e: any) => e instanceof BadRequestException && (e.getResponse() as any).avisos.some((a: string) => /sem tolerância com referência/.test(a)));
    const r = await svc.publicar(user(), proc.id, v.id!, { confirmarAvisos: true });
    assert.ok(r.avisos.some((a) => /fica NÃO AVALIADO/.test(a)));
  });
  it("6f: ponto sem limite ou 0 a 0 → aviso 'Ponto 100 J sem limite: será NÃO AVALIADO e não reprova.'", async () => {
    const { svc, proc, v } = await publicarCom({ pontos: [{ id: "p100", nominal: 100, limite: { tipo: "INTERVALO", a: 0, b: 0 } }] });
    const prev = await svc.previaPublicacao(user(), proc.id, v.id!);
    assert.ok(prev.avisos.includes("Ponto 100 J sem limite: será NÃO AVALIADO e não reprova."));
    assert.deepEqual(prev.bloqueios, []);
  });
  it("B10: 'Considerando U' sem modelo → bloqueio com a mensagem exata (422)", async () => {
    const { svc, proc, v } = await publicarCom({ regra: "CONSIDERANDO_U" });
    await assert.rejects(svc.publicar(user(), proc.id, v.id!, { confirmarAvisos: true }), (e: any) =>
      e instanceof UnprocessableEntityException && (e.getResponse() as any).bloqueios.includes(`Energia: ${MSG_B10}`));
    assert.equal(MSG_B10, "Regra 'Considerando U' exige um modelo de incerteza. Vincule um modelo ou use a regra Direta.");
  });
  it("B11: item sem regra escolhida assume Direta", () => {
    const itens = achatarParaItens(arvoreOk() as any);
    assert.equal(itens[0].regra, "DIRETA");
  });
  it("bloqueios de campo: unidade, tipo de padrão, mínimo > máximo", async () => {
    const { svc, proc, v } = await publicarCom({ unidade: "", tipoPadrao: "", pontos: [{ id: "p", nominal: 5, limite: { tipo: "INTERVALO", a: 9, b: 1 } }] });
    const prev = await svc.previaPublicacao(user(), proc.id, v.id!);
    for (const m of ["Informe a unidade.", "Escolha o tipo de padrão.", "Mínimo maior que o máximo."]) assert.ok(prev.bloqueios.some((b) => b.includes(m)), m);
  });
});

describe("crit. 11 — sem exclusão; só inativar", () => {
  it("controller não expõe DELETE", () => {
    const metodos = Object.getOwnPropertyNames(ProcedimentosController.prototype)
      .map((k) => Reflect.getMetadata(METHOD_METADATA, (ProcedimentosController.prototype as any)[k]))
      .filter((m) => m != null);
    assert.ok(metodos.length > 5);
    assert.ok(!metodos.includes(3), "RequestMethod.DELETE = 3");
  });
  it("inativar com laudo emitido funciona, audita e bloqueia laudos novos", async () => {
    const { p, svc, laudos } = mundo();
    const { proc } = await publicado(svc);
    p.t.laudo.push({ id: "lx", procedimentoId: proc.id, estabelecimentoId: "e1" });
    await svc.inativar(user(), proc.id);
    assert.equal(p.t.procedimentoLaudo.find((x: any) => x.id === proc.id).ativo, false);
    assert.equal(JSON.parse(p.t.logAcesso.at(-1).detalhe).laudos, 1);
    await assert.rejects(laudos.create(user(), { tipo: "CALIBRACAO" as any, equipamentoTag: "T-1", procedimentoId: proc.id, responsavelTecnicoId: "rt1" }), (e: any) => /inativo/.test(e.message));
  });
});

describe("crit. 11a / D-L1 / B3 / B8 / B9 — tipo do documento e snapshot da versão", () => {
  it("11a: publicar sem tipo do documento → bloqueio", async () => {
    const { svc } = mundo();
    const proc = await svc.create(user(), { codigo: "PR-T", tituloLaudo: "Sem tipo", tipo: "CALIBRACAO" as any });
    const v = await svc.salvarRascunho(user(), proc.id, proc.rascunho.id, { atualizadoEm: proc.rascunho.atualizadoEm!.toISOString(), arvore: arvoreOk() });
    const prev = await svc.previaPublicacao(user(), proc.id, v.id!);
    assert.ok(prev.bloqueios.includes("Escolha o tipo de documento emitido (Laudo ou Certificado)."));
  });
  it("procedimento novo só em rascunho não emite laudo (409); legado segue como antes", async () => {
    const { svc, laudos } = mundo({
      procedimentoLaudo: [{ id: "leg", estabelecimentoId: "e1", nome: "Legado", tipo: "CALIBRACAO", itens: [{ id: "i1", pergunta: "Antigo", tipo: "check" }], versao: 1, ativo: true }],
      procedimentoLaudoVersao: [{ id: "lv1", procedimentoId: "leg", estabelecimentoId: "e1", versao: 1, status: null, itens: [], nome: "Legado", tipo: "CALIBRACAO", validadeMeses: 12 }],
    });
    const proc = await svc.create(user(), { codigo: "PR-N", tituloLaudo: "Novo", tipo: "CALIBRACAO" as any });
    await assert.rejects(laudos.create(user(), { tipo: "CALIBRACAO" as any, equipamentoTag: "T-1", procedimentoId: proc.id, responsavelTecnicoId: "rt1" }), (e: any) => /ainda não publicado/.test(e.message));
    const l = await laudos.create(user(), { tipo: "CALIBRACAO" as any, equipamentoTag: "T-1", procedimentoId: "leg", responsavelTecnicoId: "rt1" });
    assert.equal(l.tipoDocumento, null);
    assert.equal(l.procedimentoVersaoId, null);
    assert.equal((l.procedimentoSnapshot as any).itens[0].pergunta, "Antigo");
  });
  it("B3/B8/B9: laudo congela itens, tipo e regra da versão usada; republicar não altera o laudo", async () => {
    const { p, svc, laudos } = mundo();
    const { proc, versao } = await publicado(svc);
    const l1 = await laudos.create(user(), { tipo: "CALIBRACAO" as any, equipamentoTag: "T-1", procedimentoId: proc.id, responsavelTecnicoId: "rt1" });
    assert.equal(l1.tipoDocumento, "CERTIFICADO");
    assert.equal(l1.procedimentoVersaoId, versao.id);
    const antes = JSON.stringify(p.t.laudo.find((x: any) => x.id === l1.id));
    const r2 = await svc.abrirRascunho(user(), proc.id);
    const v2 = await svc.salvarRascunho(user(), proc.id, r2.id, { atualizadoEm: r2.atualizadoEm!.toISOString(), tipoDocumento: "LAUDO" as any, arvore: arvoreOk({ regra: "CONSIDERANDO_U", incertezaModeloId: "mu1", pontos: [{ id: "p50", nominal: 50, limite: { tipo: "NOM_PCT", a: 5 } }] }) });
    await svc.publicar(user(), proc.id, v2.id!, { confirmarAvisos: true });
    assert.equal(JSON.stringify(p.t.laudo.find((x: any) => x.id === l1.id)), antes, "laudo antigo intacto");
    assert.equal((l1.procedimentoSnapshot as any).itens[0].regra, "DIRETA");
    assert.equal((l1.procedimentoSnapshot as any).itens[0].tolerancia.valor, 15);
    const l2 = await laudos.create(user(), { tipo: "CALIBRACAO" as any, equipamentoTag: "T-1", procedimentoId: proc.id, responsavelTecnicoId: "rt1" });
    assert.equal(l2.tipoDocumento, "LAUDO");
    assert.equal((l2.procedimentoSnapshot as any).itens[0].regra, "CONSIDERANDO_U");
    assert.equal((l2.procedimentoSnapshot as any).versao, 2);
  });
  it("PDF: título vem do tipo do documento (antes/depois); legado mantém 'Relatório de serviço'", async () => {
    const base = { instituicao: { nome: "Hosp" }, numero: "CAL-1", tipo: "CALIBRACAO", statusDocumento: "FINAL", equipamento: { tag: "T-1", nome: "Desf" }, executores: [], respostas: [], resultado: "APROVADO" };
    const dir = mkdtempSync(join(tmpdir(), "e2pdf-"));
    const texto = async (payload: any, nome: string) => {
      const f = join(dir, `${nome}.pdf`);
      writeFileSync(f, await buildRelatorioServicoPdf(payload));
      return execFileSync("pdftotext", [f, "-"]).toString();
    };
    const legado = await texto(base, "legado");
    assert.match(legado, /Relatório de serviço/);
    assert.match(legado, /Não é certificado de calibração/);
    const cert = await texto({ ...base, tipoDocumento: "CERTIFICADO", tituloEmitido: "CERTIFICADO DE CALIBRAÇÃO", certificadoCfg: { fraseLiberacao: true } }, "cert");
    assert.match(cert, /CERTIFICADO DE CALIBRAÇÃO/);
    assert.doesNotMatch(cert, /Não é certificado de calibração/);
    assert.match(cert, /O EQUIPAMENTO ENSAIADO ESTÁ LIBERADO PARA USO\./);
    const laudo = await texto({ ...base, resultado: "REPROVADO", tipoDocumento: "LAUDO", tituloEmitido: "LAUDO DE CALIBRAÇÃO", certificadoCfg: { fraseLiberacao: true } }, "laudo");
    assert.match(laudo, /LAUDO DE CALIBRAÇÃO/);
    assert.match(laudo, /NÃO LIBERADO PARA USO/);
  });
});

describe("Q7 — rotas JSON antigas: leitura depreciada, escrita 410", () => {
  it("PATCH itens/criterio → 410 com a mensagem de migração; criação com itens → 400", async () => {
    const { svc } = mundo();
    assert.throws(() => svc.rotaDepreciada(), (e: any) => e instanceof GoneException && e.message === MSG_ROTA_DEPRECIADA);
    await assert.rejects(svc.create(user(), { codigo: "PR-Z", tituloLaudo: "Com itens", tipo: "CALIBRACAO" as any, itens: [{}] }), BadRequestException);
  });
  it("GET :id/itens marcado com cabeçalho Deprecation", () => {
    const h = Reflect.getMetadata("__headers__", ProcedimentosController.prototype.itensLegado) as Array<{ name: string; value: string }>;
    assert.ok(h.some((x) => x.name === "Deprecation" && x.value === "true"));
    assert.equal(Reflect.getMetadata(PATH_METADATA, ProcedimentosController.prototype.itensLegado), ":id/itens");
  });
});

describe("revisão TL 20/10 — inativo bloqueia só laudos NOVOS", () => {
  it("rascunho aberto antes da inativação finaliza, com aviso no detalhe e na resposta", async () => {
    const { p, svc, laudos } = mundo();
    const { proc } = await publicado(svc, { tipo: "RECEBIMENTO" });
    const l = await laudos.create(user(), { tipo: "RECEBIMENTO" as any, equipamentoTag: "T-1", procedimentoId: proc.id });
    await svc.inativar(user(), proc.id);
    const det = await laudos.byId("e1", l.id);
    assert.deepEqual(det.avisos, [MSG_PROCEDIMENTO_INATIVO]);
    const fin = await laudos.finalizar(user(), l.id);
    assert.equal(p.t.laudo.find((x: any) => x.id === l.id).statusDocumento, "FINAL");
    assert.deepEqual(fin.avisos, [MSG_PROCEDIMENTO_INATIVO]);
    assert.deepEqual((await laudos.byId("e1", l.id)).avisos, [], "documento final não carrega o aviso");
    await assert.rejects(laudos.create(user(), { tipo: "RECEBIMENTO" as any, equipamentoTag: "T-1", procedimentoId: proc.id }), (e: any) => /inativo/.test(e.message));
  });
  it("procedimento ativo: sem aviso", async () => {
    const { svc, laudos } = mundo();
    const { proc } = await publicado(svc, { tipo: "RECEBIMENTO" });
    const l = await laudos.create(user(), { tipo: "RECEBIMENTO" as any, equipamentoTag: "T-1", procedimentoId: proc.id });
    assert.deepEqual((await laudos.byId("e1", l.id)).avisos, []);
  });
});

describe("revisão TL 20/10 — Q7: leituras antigas seguem funcionando, só escrita dá 410", () => {
  it("GET lista, GET :id e GET :id/itens respondem (inclusive procedimento legado e inativo)", async () => {
    const { svc } = mundo({ procedimentoLaudo: [{ id: "leg", estabelecimentoId: "e1", nome: "Legado", tipo: "CALIBRACAO", itens: [{ id: "i1", pergunta: "Antigo" }], versao: 3, ativo: false, codigo: null, versaoPublicadaId: null }] });
    assert.deepEqual(await svc.itensDepreciados("e1", "leg"), { id: "leg", versao: 3, itens: [{ id: "i1", pergunta: "Antigo" }] });
    assert.equal((await svc.byId("e1", "leg")).id, "leg");
    assert.equal((await svc.list("e1", undefined, true)).length, 1);
    const { proc } = await publicado(svc);
    assert.equal(((await svc.itensDepreciados("e1", proc.id)).itens as unknown[]).length, 3, "publicado expõe os itens espelhados");
  });
  it("só os métodos de escrita antigos são 410; o GET não chama rotaDepreciada", () => {
    const ctl = new ProcedimentosController({ rotaDepreciada: () => { throw new GoneException(MSG_ROTA_DEPRECIADA); }, itensDepreciados: async () => ({ itens: [] }) } as any);
    assert.throws(() => ctl.itens(), GoneException);
    assert.throws(() => ctl.criterio(), GoneException);
    assert.doesNotThrow(() => ctl.itensLegado(user(), "x"));
    for (const m of ["itens", "criterio"] as const) {
      assert.equal(Reflect.getMetadata(METHOD_METADATA, (ProcedimentosController.prototype as any)[m]), 4, "PATCH");
      const h = Reflect.getMetadata("__headers__", (ProcedimentosController.prototype as any)[m]) as Array<{ name: string }>;
      assert.ok(h.some((x) => x.name === "Deprecation"));
    }
    assert.equal(Reflect.getMetadata(METHOD_METADATA, ProcedimentosController.prototype.itensLegado), 0, "GET");
  });
});
