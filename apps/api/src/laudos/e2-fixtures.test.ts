/**
 * Prisma em memória para os testes da E2 (procedimentos versionados). Só o necessário:
 * filtros de igualdade/null/not/in/contains, OR/NOT, relação `tipoEquipamentoPlano.estabelecimentoId`,
 * índices únicos (inclusive os parciais do SQL da migração) e $transaction com rollback.
 */
type Row = Record<string, any>;
const clone = <T>(v: T): T => structuredClone(v);
const igual = (a: unknown, b: unknown) =>
  a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : (a ?? null) === (b ?? null);

export function criarFakePrisma(seed: Partial<Record<string, Row[]>> = {}) {
  const t: Record<string, Row[]> = {
    procedimentoLaudo: [], procedimentoLaudoVersao: [], laudo: [], logAcesso: [], usuario: [], planoTeste: [],
    planoInstancia: [], pop: [], procedimentoModelo: [], tipoEquipamentoPlano: [], usuarioEstabelecimento: [], equipamento: [],
    ...clone(seed as Record<string, Row[]>),
  };
  let seq = 0;
  const rel: Record<string, (row: Row, f: Row) => boolean> = {
    tipoEquipamentoPlano: (row, f) => match(t.tipoEquipamentoPlano.find((x) => x.id === row.tipoEquipamentoPlanoId) ?? {}, f),
  };
  function match(row: Row, where: Row = {}): boolean {
    for (const [k, v] of Object.entries(where)) {
      if (v === undefined) continue;
      if (k === "OR") { if (!(v as Row[]).some((w) => match(row, w))) return false; continue; }
      if (k === "NOT") { if (match(row, v as Row)) return false; continue; }
      if (k === "AND") { if (!(v as Row[]).every((w) => match(row, w))) return false; continue; }
      if (rel[k]) { if (!rel[k](row, v as Row)) return false; continue; }
      if (v !== null && typeof v === "object" && !(v instanceof Date)) {
        if ("not" in v) { if (igual(row[k], v.not)) return false; continue; }
        if ("in" in v) { if (!v.in.includes(row[k])) return false; continue; }
        if ("contains" in v) { if (!String(row[k] ?? "").toLowerCase().includes(String(v.contains).toLowerCase())) return false; continue; }
        if ("equals" in v) { if (!igual(row[k], v.equals)) return false; continue; }
        continue;
      }
      if (!igual(row[k], v)) return false;
    }
    return true;
  }
  /** únicos: os do schema + parciais da migração */
  const unicos: Record<string, Array<(a: Row, b: Row) => boolean>> = {
    procedimentoLaudo: [
      (a, b) => a.codigo != null && a.estabelecimentoId === b.estabelecimentoId && a.codigo === b.codigo,
      (a, b) => a.versaoPublicadaId != null && a.versaoPublicadaId === b.versaoPublicadaId,
    ],
    procedimentoLaudoVersao: [
      (a, b) => a.procedimentoId === b.procedimentoId && a.versao === b.versao,
      (a, b) => a.status === "RASCUNHO" && b.status === "RASCUNHO" && a.procedimentoId === b.procedimentoId,
    ],
  };
  const checarUnicos = (nome: string, row: Row) => {
    for (const u of unicos[nome] ?? []) {
      if (t[nome].some((o) => o !== row && o.id !== row.id && u(row, o))) {
        throw Object.assign(new Error("Unique constraint failed"), { code: "P2002", meta: { target: nome } });
      }
    }
  };
  const incluir = (nome: string, row: Row, include?: Row) => {
    if (!include) return clone(row);
    const r = clone(row);
    if (nome === "procedimentoLaudo") {
      if (include.versaoPublicada) r.versaoPublicada = clone(t.procedimentoLaudoVersao.find((v) => v.id === row.versaoPublicadaId) ?? null);
      if (include.historico) r.historico = clone(t.procedimentoLaudoVersao.filter((v) => v.procedimentoId === row.id).sort((a, b) => b.versao - a.versao));
      if (include.modelos) r.modelos = [];
      if (include.pai) r.pai = clone(t.procedimentoLaudo.find((p) => p.id === row.paiId) ?? null);
      if (include.derivados) r.derivados = clone(t.procedimentoLaudo.filter((p) => p.paiId === row.id));
      if (include.planos) r.planos = clone(t.planoTeste.filter((p) => p.procedimentoId === row.id));
    }
    if (nome === "laudo") {
      if (include.procedimento) r.procedimento = clone(t.procedimentoLaudo.find((p) => p.id === row.procedimentoId) ?? null);
      if (include.equipamento) r.equipamento = clone(t.equipamento.find((e) => e.id === row.equipamentoId) ?? null);
      if (include.planoTeste) r.planoTeste = null;
    }
    return r;
  };
  const sel = (row: Row | null, select?: Row) => {
    if (!row || !select) return row;
    const out: Row = {};
    for (const k of Object.keys(select)) {
      if (k === "versaoPublicada" && typeof select[k] === "object") {
        const v = t.procedimentoLaudoVersao.find((x) => x.id === row.versaoPublicadaId);
        out[k] = v ? sel(clone(v), select[k].select) : null;
      } else if (k === "tipoEquipamentoPlano") {
        out[k] = clone(t.tipoEquipamentoPlano.find((x) => x.id === row.tipoEquipamentoPlanoId) ?? null);
      } else out[k] = row[k];
    }
    return out;
  };
  const defaults: Record<string, Row> = {
    procedimentoLaudo: { ativo: true, versao: 1, itens: [], validadeMeses: 12, paiId: null, codigo: null, versaoPublicadaId: null, generico: null, criterioReferencia: null, criterioVersao: null },
    procedimentoLaudoVersao: { status: null, paiId: null, paiVersaoId: null, criterioReferencia: null, criterioVersao: null, certificadoCfg: null, norma: null, publicadoEm: null },
    planoTeste: { procedimentoId: null }, planoInstancia: { procedimentoId: null },
  };
  const tabela = (nome: string) => ({
    findFirst: async (a: Row = {}) => { const r = t[nome].find((x) => match(x, a.where)); return r ? sel(incluir(nome, r, a.include), a.select) : null; },
    findUnique: async (a: Row = {}) => {
      const w = a.where ?? {};
      const k = Object.keys(w)[0];
      const flat = w[k] && typeof w[k] === "object" && !(w[k] instanceof Date) ? w[k] : w;
      const r = t[nome].find((x) => match(x, flat));
      return r ? sel(incluir(nome, r, a.include), a.select) : null;
    },
    findMany: async (a: Row = {}) => {
      let rs = t[nome].filter((x) => match(x, a.where));
      if (a.orderBy?.versao === "desc") rs = [...rs].sort((x, y) => y.versao - x.versao);
      if (a.take) rs = rs.slice(0, a.take);
      return rs.map((r) => sel(incluir(nome, r, a.include), a.select));
    },
    count: async (a: Row = {}) => t[nome].filter((x) => match(x, a.where)).length,
    create: async ({ data, include }: Row) => {
      const now = new Date();
      const row = { id: `${nome.slice(0, 4)}${++seq}`, createdAt: now, updatedAt: now, ...(defaults[nome] ?? {}), ...clone(data) };
      checarUnicos(nome, row);
      t[nome].push(row);
      return incluir(nome, row, include);
    },
    update: async ({ where, data }: Row) => {
      const r = t[nome].find((x) => match(x, where));
      if (!r) throw Object.assign(new Error("not found"), { code: "P2025" });
      const novo = { ...r, ...clone(data), updatedAt: new Date() };
      checarUnicos(nome, novo);
      Object.assign(r, novo);
      return clone(r);
    },
    updateMany: async ({ where, data }: Row) => {
      const rs = t[nome].filter((x) => match(x, where));
      for (const r of rs) {
        const novo = { ...r, ...clone(data) };
        checarUnicos(nome, novo);
        Object.assign(r, novo);
      }
      return { count: rs.length };
    },
    upsert: async ({ where, create, update }: Row) => {
      const k = Object.keys(where)[0];
      const flat = typeof where[k] === "object" ? where[k] : where;
      const r = t[nome].find((x) => match(x, flat));
      if (r) { Object.assign(r, update); return clone(r); }
      const row = { id: `${nome.slice(0, 4)}${++seq}`, ...create };
      t[nome].push(row);
      return clone(row);
    },
    delete: async ({ where }: Row) => { const i = t[nome].findIndex((x) => match(x, where)); return t[nome].splice(i, 1)[0]; },
  });
  const prisma: Row = { t };
  for (const n of Object.keys(t)) prisma[n] = tabela(n);
  prisma.contadorSequencia = { upsert: async () => ({ valor: ++seq }) };
  prisma.planoTeste.findUnique = async () => null;
  prisma.equipamento.findUnique = async ({ where }: Row) =>
    clone(t.equipamento.find((e) => e.tag === where.estabelecimentoId_tag?.tag && e.estabelecimentoId === where.estabelecimentoId_tag?.estabelecimentoId) ?? null);
  prisma.$transaction = async (arg: any) => {
    if (Array.isArray(arg)) return Promise.all(arg);
    const snap = clone(t);
    try {
      return await arg(prisma);
    } catch (e) {
      for (const k of Object.keys(t)) t[k] = snap[k];
      throw e;
    }
  };
  return prisma;
}
