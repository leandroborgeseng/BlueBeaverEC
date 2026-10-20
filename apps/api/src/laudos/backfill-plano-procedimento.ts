/**
 * E2/Q6 — backfill idempotente de PlanoTeste.procedimentoId e PlanoInstancia.procedimentoId a partir
 * do `procedimentoCodigo` legado (ProcedimentoLaudo.codigo → Pop.codigo). Só preenche FK nula;
 * nunca altera `procedimentoCodigo`, nem linhas já vinculadas. `dryRun` não escreve nada.
 */
import { resolverProcedimentoDoPlano } from "./procedimento-resolver";

type Db = {
  planoTeste: { findMany(a: unknown): Promise<any[]>; updateMany(a: unknown): Promise<{ count: number }> };
  planoInstancia: { findMany(a: unknown): Promise<any[]>; updateMany(a: unknown): Promise<{ count: number }> };
  procedimentoLaudo: { findFirst(a: unknown): Promise<any> };
  pop: { findFirst(a: unknown): Promise<any> };
};

export type LinhaBackfill = { tabela: "PlanoTeste" | "PlanoInstancia"; id: string; codigo: string | null; procedimentoId: string | null; via: string | null; aviso?: string };

export async function backfillPlanoProcedimento(db: Db, opts: { dryRun: boolean; estabelecimentoId?: string }) {
  const linhas: LinhaBackfill[] = [];
  let gravadas = 0;
  const testes = await db.planoTeste.findMany({
    where: { procedimentoId: null, ...(opts.estabelecimentoId ? { tipoEquipamentoPlano: { estabelecimentoId: opts.estabelecimentoId } } : {}) },
    select: { id: true, procedimentoCodigo: true, tipoTeste: true, tipoEquipamentoPlano: { select: { estabelecimentoId: true } } },
  });
  for (const t of testes) {
    const r = await resolverProcedimentoDoPlano(db, t.tipoEquipamentoPlano.estabelecimentoId, { procedimentoCodigo: t.procedimentoCodigo });
    linhas.push({ tabela: "PlanoTeste", id: t.id, codigo: t.procedimentoCodigo, procedimentoId: r.procedimento?.id ?? null, via: r.via, aviso: r.aviso });
    if (!opts.dryRun && r.procedimento) {
      gravadas += (await db.planoTeste.updateMany({ where: { id: t.id, procedimentoId: null }, data: { procedimentoId: r.procedimento.id } })).count;
    }
  }
  const insts = await db.planoInstancia.findMany({
    where: { procedimentoId: null, procedimentoCodigo: { not: null }, ...(opts.estabelecimentoId ? { estabelecimentoId: opts.estabelecimentoId } : {}) },
    select: { id: true, procedimentoCodigo: true, estabelecimentoId: true },
  });
  for (const i of insts) {
    const r = await resolverProcedimentoDoPlano(db, i.estabelecimentoId, { procedimentoCodigo: i.procedimentoCodigo });
    linhas.push({ tabela: "PlanoInstancia", id: i.id, codigo: i.procedimentoCodigo, procedimentoId: r.procedimento?.id ?? null, via: r.via, aviso: r.aviso });
    if (!opts.dryRun && r.procedimento) {
      gravadas += (await db.planoInstancia.updateMany({ where: { id: i.id, procedimentoId: null }, data: { procedimentoId: r.procedimento.id } })).count;
    }
  }
  return {
    dryRun: opts.dryRun,
    analisadas: linhas.length,
    resolvidas: linhas.filter((l) => l.procedimentoId).length,
    semProcedimento: linhas.filter((l) => !l.procedimentoId).length,
    gravadas,
    linhas,
  };
}
