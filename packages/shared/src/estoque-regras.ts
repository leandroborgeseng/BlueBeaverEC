/**
 * Peças, materiais e custos de manutenção.
 *
 * Método de valorização: CUSTO MÉDIO PONDERADO.
 * - Entrada atualiza o custo médio do item: (saldo×médio + qtd×custoEntrada) / (saldo+qtd).
 * - Consumo/baixa/ajuste negativo NÃO altera o médio; grava o unitário vigente no lançamento (custo histórico).
 * - Devolução/estorno de baixa reentra pelo custo histórico do movimento original e recalcula o médio.
 * - Saldo nunca é editado direto: só via movimento. Correção = estorno com histórico.
 * - Estimado/aprovado não entra no realizado. Peça de estoque não vira serviço externo.
 */

export const METODO_VALORIZACAO_ESTOQUE = "CUSTO_MEDIO_PONDERADO" as const;

export const LABEL_METODO_VALORIZACAO =
  "Custo médio ponderado: entradas atualizam o médio do item; cada consumo preserva o unitário vigente no lançamento.";

export const TIPOS_MOVIMENTO_ESTOQUE = [
  "ENTRADA",
  "SAIDA",
  "RESERVA",
  "BAIXA",
  "LIBERACAO",
  "REPOSICAO_SOLICITADA",
  "DEVOLUCAO",
  "AJUSTE",
  "ESTORNO",
] as const;
export type TipoMovimentoEstoqueRegra = (typeof TIPOS_MOVIMENTO_ESTOQUE)[number];

export const ORIGENS_MATERIAL_OS = ["ESTOQUE", "COMPRA_DIRETA"] as const;
export type OrigemMaterialOS = (typeof ORIGENS_MATERIAL_OS)[number];

export const NATUREZAS_CUSTO_OS = ["ESTIMADO", "APROVADO", "REALIZADO"] as const;
export type NaturezaCustoOS = (typeof NATUREZAS_CUSTO_OS)[number];

export const TIPOS_ITEM_OS_CUSTO = ["MATERIAL", "MAO_DE_OBRA", "SERVICO_EXTERNO", "OUTROS_DIRETOS"] as const;
export type TipoItemOSCusto = (typeof TIPOS_ITEM_OS_CUSTO)[number];

export const DESTINOS_FISICOS_DEVOLUCAO = ["ESTOQUE", "PERDA", "USO_CONFIRMADO", "OUTRO"] as const;
export type DestinoFisicoDevolucao = (typeof DESTINOS_FISICOS_DEVOLUCAO)[number];

export const LABEL_DESTINO_FISICO: Record<DestinoFisicoDevolucao, string> = {
  ESTOQUE: "Devolver ao estoque (destino físico conferido)",
  PERDA: "Perda / sucata — não retorna ao saldo",
  USO_CONFIRMADO: "Material já usado — não retorna ao saldo",
  OUTRO: "Outro destino físico (justificar)",
};

export function round2(n: number): number {
  return Number((Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2));
}

export function round4(n: number): number {
  return Number((Math.round((n + Number.EPSILON) * 10000) / 10000).toFixed(4));
}

/** Novo custo médio após entrada (ou devolução pelo custo histórico). */
export function custoMedioPonderado(
  saldoAtual: number,
  custoMedioAtual: number,
  qtdEntrada: number,
  custoEntrada: number,
): number {
  if (qtdEntrada <= 0) return round2(Math.max(0, custoMedioAtual));
  const saldo = Math.max(0, saldoAtual);
  const novoSaldo = saldo + qtdEntrada;
  if (novoSaldo <= 0) return round2(custoEntrada);
  const custo = custoEntrada >= 0 ? custoEntrada : custoMedioAtual;
  return round2((saldo * custoMedioAtual + qtdEntrada * custo) / novoSaldo);
}

export function disponivelEstoque(qtdAtual: number, qtdReservada: number): number {
  return round4(Number(qtdAtual) - Number(qtdReservada));
}

export function podeConsumir(qtdAtual: number, qtdReservada: number, qtd: number): { ok: true } | { ok: false; erro: string } {
  if (!(qtd > 0)) return { ok: false, erro: "Quantidade inválida" };
  if (qtdAtual + 1e-9 < qtd) return { ok: false, erro: "Saldo insuficiente — estoque não pode ficar negativo" };
  return { ok: true };
}

/**
 * Consumos concorrentes serializados (equivalente a SELECT FOR UPDATE).
 * O segundo pedido que estourar o saldo falha; o saldo do primeiro é preservado.
 */
export function consumirSimultaneos(
  saldo: number,
  pedidos: number[],
): { resultados: Array<{ ok: boolean; erro?: string; saldoApos: number }>; saldoFinal: number } {
  let atual = saldo;
  const resultados: Array<{ ok: boolean; erro?: string; saldoApos: number }> = [];
  for (const qtd of pedidos) {
    const check = podeConsumir(atual, 0, qtd);
    if (!check.ok) {
      resultados.push({ ok: false, erro: check.erro, saldoApos: atual });
      continue;
    }
    atual = round4(atual - qtd);
    resultados.push({ ok: true, saldoApos: atual });
  }
  return { resultados, saldoFinal: atual };
}

/**
 * Reenvio da mesma baixa (mesmo OS+item): se a quantidade pedida já foi baixada
 * e não estornada, não gera movimento novo. Pedido maior consome só a diferença.
 */
export function qtdNovaBaixa(solicitado: number, jaBaixadoNaoEstornado: number): number {
  if (!(solicitado > 0)) return 0;
  const ja = Math.max(0, jaBaixadoNaoEstornado);
  if (solicitado <= ja + 1e-9) return 0;
  return round4(solicitado - ja);
}

export function movimentoAlteraSaldo(tipo: TipoMovimentoEstoqueRegra, estorno = false): number {
  const sinalEntrada = tipo === "ENTRADA" || tipo === "DEVOLUCAO" ? 1 : 0;
  const sinalSaida = tipo === "BAIXA" || tipo === "SAIDA" || tipo === "AJUSTE" ? 1 : 0;
  if (tipo === "ESTORNO") return 0;
  if (tipo === "RESERVA" || tipo === "LIBERACAO" || tipo === "REPOSICAO_SOLICITADA") return 0;
  if (estorno) return 0;
  return sinalEntrada - sinalSaida;
}

export function aplicarDeltaSaldo(
  saldo: number,
  delta: number,
): { ok: true; saldo: number } | { ok: false; erro: string } {
  const proximo = round4(saldo + delta);
  if (proximo < -1e-9) return { ok: false, erro: "Saldo insuficiente — estoque não pode ficar negativo" };
  return { ok: true, saldo: Math.max(0, proximo) };
}

export function itemCustoContaComoRealizado(item: {
  naturezaCusto?: NaturezaCustoOS | string | null;
  estornado?: boolean | null;
  valorUnitario?: number | null;
}): boolean {
  if (item.estornado) return false;
  const nat = (item.naturezaCusto ?? "REALIZADO") as NaturezaCustoOS;
  return nat === "REALIZADO";
}

export function valorLinhaCusto(item: { quantidade: number; valorUnitario?: number | null }): number {
  return round2(Number(item.quantidade) * Number(item.valorUnitario ?? 0));
}

export function somarCustoRealizado(
  itens: Array<{
    naturezaCusto?: NaturezaCustoOS | string | null;
    estornado?: boolean | null;
    quantidade: number;
    valorUnitario?: number | null;
    tipo?: string;
  }>,
): { realizado: number; estimado: number; aprovado: number; porTipo: Record<string, number> } {
  const porTipo: Record<string, number> = {
    MATERIAL: 0,
    MAO_DE_OBRA: 0,
    SERVICO_EXTERNO: 0,
    OUTROS_DIRETOS: 0,
  };
  let realizado = 0;
  let estimado = 0;
  let aprovado = 0;
  for (const i of itens) {
    const v = valorLinhaCusto(i);
    const tipo = i.tipo && porTipo[i.tipo] != null ? i.tipo : "MATERIAL";
    const nat = (i.naturezaCusto ?? "REALIZADO") as NaturezaCustoOS;
    if (i.estornado) continue;
    if (nat === "ESTIMADO") estimado += v;
    else if (nat === "APROVADO") aprovado += v;
    else {
      realizado += v;
      porTipo[tipo] = (porTipo[tipo] ?? 0) + v;
    }
  }
  return {
    realizado: round2(realizado),
    estimado: round2(estimado),
    aprovado: round2(aprovado),
    porTipo: Object.fromEntries(Object.entries(porTipo).map(([k, v]) => [k, round2(v)])),
  };
}

/** Orçamento aprovado / estimado não pode ser lançado de novo como serviço realizado. */
export function conflitoOrcamentoViradoServico(opts: {
  naturezaNova: NaturezaCustoOS;
  tipoNovo: TipoItemOSCusto;
  descricao: string;
  existentes: Array<{ tipo: string; descricao: string; naturezaCusto?: string | null; estornado?: boolean }>;
}): { ok: true } | { ok: false; erro: string } {
  const desc = opts.descricao.trim().toLowerCase();
  if (!desc) return { ok: true };
  if (opts.tipoNovo === "SERVICO_EXTERNO" && opts.naturezaNova === "REALIZADO") {
    const orcamento = opts.existentes.find(
      (e) =>
        !e.estornado &&
        e.descricao.trim().toLowerCase() === desc &&
        (e.naturezaCusto === "ESTIMADO" || e.naturezaCusto === "APROVADO") &&
        (e.tipo === "SERVICO_EXTERNO" || e.tipo === "OUTROS_DIRETOS"),
    );
    if (orcamento) {
      return {
        ok: false,
        erro: "Este orçamento já está como estimado/aprovado. Não lance de novo como serviço realizado — atualize a natureza do lançamento existente.",
      };
    }
  }
  return { ok: true };
}

/** Peça baixada do estoque não pode ser relançada como serviço externo. */
export function conflitoPecaComoServico(opts: {
  tipoNovo: TipoItemOSCusto;
  descricao: string;
  estoqueItemId?: string | null;
  existentes: Array<{
    tipo: string;
    descricao: string;
    estoqueItemId?: string | null;
    origemMaterial?: string | null;
    estornado?: boolean;
  }>;
}): { ok: true } | { ok: false; erro: string } {
  if (opts.tipoNovo !== "SERVICO_EXTERNO") return { ok: true };
  const desc = opts.descricao.trim().toLowerCase();
  const peca = opts.existentes.find((e) => {
    if (e.estornado) return false;
    if (e.tipo !== "MATERIAL") return false;
    if (e.estoqueItemId && (e.origemMaterial === "ESTOQUE" || e.estoqueItemId)) {
      if (opts.estoqueItemId && e.estoqueItemId === opts.estoqueItemId) return true;
      if (e.descricao.trim().toLowerCase() === desc) return true;
    }
    return false;
  });
  if (peca) {
    return { ok: false, erro: "Esta peça já foi baixada do estoque. Não lance o mesmo item como serviço externo." };
  }
  return { ok: true };
}

export function resolverValorHoraMaoDeObra(opts: {
  valorHoraConfigurado?: number | null;
  podeVerFinanceiro: boolean;
}): number | null {
  if (!opts.podeVerFinanceiro) return null;
  const cfg = Number(opts.valorHoraConfigurado ?? 0);
  if (!(cfg > 0)) return null;
  return round2(cfg);
}

export function exigeDestinoFisicoParaDevolver(opts: {
  acao: "cancelar" | "reabrir";
  qtdBaixadaNaoEstornada: number;
  destinoFisico?: DestinoFisicoDevolucao | null;
}): { ok: true; devolveAoEstoque: boolean } | { ok: false; erro: string } {
  const qtd = opts.qtdBaixadaNaoEstornada;
  if (!(qtd > 0)) return { ok: true, devolveAoEstoque: false };
  if (!opts.destinoFisico) {
    return {
      ok: false,
      erro:
        opts.acao === "reabrir"
          ? "Reabrir não devolve material. Informe o destino físico se for devolver ao estoque; senão confirme USO_CONFIRMADO ou PERDA."
          : "Cancelar não devolve material automaticamente. Confirme o destino físico (estoque, perda ou uso).",
    };
  }
  if (!DESTINOS_FISICOS_DEVOLUCAO.includes(opts.destinoFisico)) {
    return { ok: false, erro: "Destino físico inválido" };
  }
  return { ok: true, devolveAoEstoque: opts.destinoFisico === "ESTOQUE" };
}

export function ajusteExigeMotivo(motivo?: string | null): { ok: true } | { ok: false; erro: string } {
  if (!motivo?.trim() || motivo.trim().length < 3) {
    return { ok: false, erro: "Ajuste exige justificativa" };
  }
  return { ok: true };
}

export function mascararValores<T extends Record<string, unknown>>(obj: T, verValores: boolean, chaves = ["valorUnitario", "custoUnitario", "valorHora"]): T {
  if (verValores) return obj;
  const copy = { ...obj };
  for (const k of chaves) {
    if (k in copy) (copy as Record<string, unknown>)[k] = null;
  }
  return copy;
}
