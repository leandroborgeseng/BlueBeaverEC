/**
 * E2 (crit. 9) — dual-read plano → procedimento, sem reescrever dados existentes:
 * 1) procedimentoId (FK nova) → 2) ProcedimentoLaudo.codigo == procedimentoCodigo →
 * 3) Pop.codigo == procedimentoCodigo → pop.procedimentoLaudoId → 4) null + aviso.
 */
type Db = {
  procedimentoLaudo: { findFirst(args: unknown): Promise<any> };
  pop: { findFirst(args: unknown): Promise<any> };
};

export type ResolucaoProcedimento = {
  procedimento: any | null;
  via: "id" | "codigo" | "pop" | null;
  aviso?: string;
};

export async function resolverProcedimentoDoPlano(
  db: Db,
  estabelecimentoId: string,
  plano: { procedimentoId?: string | null; procedimentoCodigo?: string | null },
  filtro: { tipo?: string } = {},
): Promise<ResolucaoProcedimento> {
  const base = { estabelecimentoId, ativo: true, ...(filtro.tipo ? { tipo: filtro.tipo } : {}) };
  if (plano.procedimentoId) {
    const p = await db.procedimentoLaudo.findFirst({ where: { ...base, id: plano.procedimentoId } });
    if (p) return { procedimento: p, via: "id" };
  }
  const codigo = plano.procedimentoCodigo?.trim();
  if (codigo) {
    const p = await db.procedimentoLaudo.findFirst({ where: { ...base, codigo } });
    if (p) return { procedimento: p, via: "codigo" };
    const pop = await db.pop.findFirst({ where: { estabelecimentoId, codigo }, select: { procedimentoLaudoId: true } });
    if (pop?.procedimentoLaudoId) {
      const pp = await db.procedimentoLaudo.findFirst({ where: { ...base, id: pop.procedimentoLaudoId } });
      if (pp) return { procedimento: pp, via: "pop" };
    }
  }
  return {
    procedimento: null,
    via: null,
    aviso: codigo ? `Plano sem procedimento vinculado (código ${codigo} não encontrado)` : "Plano sem procedimento vinculado",
  };
}
