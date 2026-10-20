/**
 * E2 — Procedimentos versionados: árvore do checklist (até 3 níveis), validação de forma (schema),
 * validação de publicação (bloqueios/avisos), herança do procedimento-pai (6e, cadeia até 3 níveis)
 * e achatamento para o formato de itens que o laudo já avalia.
 * Regras puras, sem banco: usadas pela API (publicação/snapshot) e pela web (editor).
 */
import type { ItemChecklistModelo, ToleranciaCriterio } from "./laudo-regras";

export const PROFUNDIDADE_MAX_ARVORE = 3;
export const NIVEIS_HERANCA_MAX = 3;
export const TIPOS_ITEM = ["MEDICAO", "QUALITATIVA", "AMBIENTE", "REGISTRO"] as const;
export const TIPOS_LIMITE = ["INTERVALO", "NOM_ABS", "NOM_PCT", "MAX_LE", "MAX_LT", "MIN_GE", "SEM_LIMITE"] as const;
export const BASES_LIMITE = ["NOMINAL", "VVC"] as const;
export const REGRAS_DECISAO = ["DIRETA", "CONSIDERANDO_U"] as const;
export const TIPOS_DOCUMENTO = ["LAUDO", "CERTIFICADO"] as const;
/** Campos que o derivado pode sobrescrever por item (6e). */
export const CAMPOS_SOBRESCREVIVEIS = ["tipo", "resolucao", "nLeituras", "ordem", "limites"] as const;

export type TipoItem = (typeof TIPOS_ITEM)[number];
export type TipoLimite = (typeof TIPOS_LIMITE)[number];
export type TipoDocumentoEmitido = (typeof TIPOS_DOCUMENTO)[number];

export type LimitePonto = { tipo: TipoLimite; a?: number | null; b?: number | null };
export type PontoMedicao = { id: string; nominal: number; limite: LimitePonto; base?: (typeof BASES_LIMITE)[number] };
export type SubitemQualitativo = { id: string; texto: string; instrucao?: string };

export type ItemProcedimento = {
  id: string;
  tipo: TipoItem;
  titulo: string;
  instrucoes?: string;
  obrigatorio?: boolean;
  // MEDICAO (6b–6d)
  grandeza?: string;
  unidade?: string;
  tipoPadrao?: string;
  leitura?: "DIGITAL" | "ANALOGICA";
  resolucao?: number | null;
  nLeituras?: number;
  ordem?: "CRESCENTE" | "DECRESCENTE" | "AMBAS";
  pontos?: PontoMedicao[];
  regra?: (typeof REGRAS_DECISAO)[number];
  incertezaModeloId?: string | null;
  tolerancia?: { referencia?: string | null; versao?: string | null } | null;
  // QUALITATIVA
  subitens?: SubitemQualitativo[];
  // AMBIENTE
  tMin?: number | null;
  tMax?: number | null;
  urMin?: number | null;
  urMax?: number | null;
};

export type NoArvore = {
  id: string;
  /** seção (tem filhos) ou item (folha) */
  titulo: string;
  filhos?: NoArvore[];
  item?: ItemProcedimento;
  /** preenchido na resolução: item/seção vindo do pai e campos sobrescritos no derivado */
  origem?: "pai";
  sobrescritos?: string[];
};

export type Sobrescrita = {
  tipo?: TipoItem;
  resolucao?: number | null;
  nLeituras?: number;
  ordem?: ItemProcedimento["ordem"];
  /** limite por id de ponto */
  limites?: Record<string, LimitePonto>;
};

export type ArvoreProcedimento = {
  nos: NoArvore[];
  /** só em derivados: alterações sobre os itens herdados do pai */
  heranca?: { sobrescritas?: Record<string, Sobrescrita>; ocultos?: string[] };
};

export type CertificadoCfg = {
  tituloImpresso?: string;
  declaracao?: { modo: "PADRAO" | "PROPRIO"; texto?: string };
  fraseLiberacao?: boolean;
  ocultarPadroes?: boolean;
  exibirDataExecucao?: { ativo: boolean; rotulo?: string };
  exibirValidade?: { ativo: boolean; rotulo?: string; formato?: "MM/AAAA" | "DD/MM/AAAA" };
  memoriaCalculo?: boolean;
  assinaturas?: { executor?: boolean; responsavelTecnico?: boolean; aprovacaoFinal?: boolean };
  /** abas Anexos e Bibliografia (crit. 7): referências textuais/links; upload de arquivo fica fora da E2 */
  anexos?: Array<{ nome: string; url?: string }>;
  bibliografia?: string[];
};

const ehNum = (v: unknown) => typeof v === "number" && Number.isFinite(v);
const ehTxt = (v: unknown) => typeof v === "string";

/** Validação de FORMA (schema) da árvore — Q8. Retorna mensagens; vazio = ok. */
export function validarFormaArvore(arvore: unknown): string[] {
  const erros: string[] = [];
  if (!arvore || typeof arvore !== "object" || !Array.isArray((arvore as ArvoreProcedimento).nos)) {
    return ["Árvore inválida: esperado { nos: [] }"];
  }
  const ids = new Set<string>();
  const visita = (nos: unknown[], nivel: number, caminho: string) => {
    nos.forEach((n, i) => {
      const onde = `${caminho}${i + 1}`;
      if (!n || typeof n !== "object") return void erros.push(`Nó ${onde}: inválido`);
      const no = n as NoArvore;
      if (!ehTxt(no.id) || !no.id) erros.push(`Nó ${onde}: id obrigatório`);
      else if (ids.has(no.id)) erros.push(`Nó ${onde}: id repetido (${no.id})`);
      else ids.add(no.id);
      if (!ehTxt(no.titulo) || !no.titulo.trim()) erros.push(`Nó ${onde}: título obrigatório`);
      if (nivel > PROFUNDIDADE_MAX_ARVORE) erros.push(`Nó ${onde}: profundidade máxima é ${PROFUNDIDADE_MAX_ARVORE} níveis`);
      if (no.item && no.filhos?.length) erros.push(`Nó ${onde}: item não aceita filhos`);
      if (no.filhos != null && !Array.isArray(no.filhos)) erros.push(`Nó ${onde}: filhos deve ser lista`);
      if (no.item) {
        const it = no.item;
        if (!TIPOS_ITEM.includes(it.tipo)) erros.push(`Item ${onde}: tipo inválido`);
        if (it.id !== no.id) erros.push(`Item ${onde}: id do item deve ser igual ao do nó`);
        if (it.nLeituras != null && !(Number.isInteger(it.nLeituras) && it.nLeituras >= 1)) erros.push(`Item ${onde}: nº de leituras deve ser inteiro ≥ 1`);
        if (it.resolucao != null && !(ehNum(it.resolucao) && it.resolucao >= 0)) erros.push(`Item ${onde}: resolução inválida`);
        if (it.regra != null && !REGRAS_DECISAO.includes(it.regra)) erros.push(`Item ${onde}: regra de decisão inválida`);
        (it.pontos ?? []).forEach((p, j) => {
          if (!ehTxt(p?.id) || !ehNum(p?.nominal)) erros.push(`Item ${onde} ponto ${j + 1}: id e nominal numérico obrigatórios`);
          if (!p?.limite || !TIPOS_LIMITE.includes(p.limite.tipo)) erros.push(`Item ${onde} ponto ${j + 1}: tipo de limite inválido`);
          if (p?.base != null && !BASES_LIMITE.includes(p.base)) erros.push(`Item ${onde} ponto ${j + 1}: base do limite inválida`);
        });
      }
      if (Array.isArray(no.filhos)) visita(no.filhos, nivel + 1, `${onde}.`);
    });
  };
  visita((arvore as ArvoreProcedimento).nos, 1, "");
  const h = (arvore as ArvoreProcedimento).heranca;
  if (h?.sobrescritas) {
    for (const [id, s] of Object.entries(h.sobrescritas)) {
      for (const k of Object.keys(s ?? {})) {
        if (!(CAMPOS_SOBRESCREVIVEIS as readonly string[]).includes(k)) erros.push(`Sobrescrita de ${id}: campo "${k}" não pode ser sobrescrito`);
      }
    }
  }
  return erros;
}

function limiteTexto(l: LimitePonto, nominal: number, unidade = ""): string {
  const u = unidade ? ` ${unidade}` : "";
  switch (l.tipo) {
    case "INTERVALO": return `Aceita de ${l.a} a ${l.b}${u}`;
    case "NOM_ABS": return `Aceita de ${nominal - Number(l.a)} a ${nominal + Number(l.a)}${u}`;
    case "NOM_PCT": return `Aceita ${nominal} ± ${l.a}%`;
    case "MAX_LE": return `Aceita até ${l.b}${u}, sem limite inferior`;
    case "MAX_LT": return `Aceita abaixo de ${l.b}${u} (estrito), sem limite inferior`;
    case "MIN_GE": return `Aceita a partir de ${l.a}${u}, sem limite superior`;
    default: return "Sem limite: não avaliado";
  }
}
export { limiteTexto as textoLimitePonto };

/** Ponto sem limite efetivo (SEM_LIMITE ou intervalo 0–0) → NÃO_AVALIADO / NÃO APLICA (6f). */
export function pontoSemLimite(l: LimitePonto | undefined): boolean {
  if (!l || l.tipo === "SEM_LIMITE") return true;
  if (l.tipo === "INTERVALO" && Number(l.a ?? 0) === 0 && Number(l.b ?? 0) === 0) return true;
  return false;
}

export const MSG_B10 = "Regra 'Considerando U' exige um modelo de incerteza. Vincule um modelo ou use a regra Direta.";

export type DadosPublicacao = {
  codigo?: string | null;
  tituloLaudo?: string | null;
  tipoDocumento?: string | null;
  validadeMeses?: number | null;
  arvore?: unknown;
};

/** Validação de PUBLICAÇÃO (crit. 5, 8, 10, 11a, 6f, B10, B11). */
export function validarPublicacao(d: DadosPublicacao, arvoreResolvida?: ArvoreProcedimento): { bloqueios: string[]; avisos: string[] } {
  const bloqueios: string[] = [];
  const avisos: string[] = [];
  if (!d.codigo?.trim()) bloqueios.push("Informe o código do procedimento.");
  if (!d.tituloLaudo?.trim()) bloqueios.push("Informe o título do laudo.");
  if (!d.tipoDocumento || !TIPOS_DOCUMENTO.includes(d.tipoDocumento as TipoDocumentoEmitido)) bloqueios.push("Escolha o tipo de documento emitido (Laudo ou Certificado).");
  if (!(Number.isInteger(d.validadeMeses) && Number(d.validadeMeses) >= 1)) bloqueios.push("Validade em meses deve ser inteiro ≥ 1.");
  bloqueios.push(...validarFormaArvore(d.arvore));
  const arv = arvoreResolvida ?? (d.arvore as ArvoreProcedimento);
  for (const it of itensDaArvore(arv?.nos ?? [])) {
    const nome = it.titulo || it.id;
    if (it.tipo === "MEDICAO") {
      if (!it.unidade?.trim()) bloqueios.push(`${nome}: Informe a unidade.`);
      if (!it.tipoPadrao?.trim()) bloqueios.push(`${nome}: Escolha o tipo de padrão.`);
      if ((it.regra ?? "DIRETA") === "CONSIDERANDO_U" && !it.incertezaModeloId) bloqueios.push(`${nome}: ${MSG_B10}`);
      if (!(it.pontos ?? []).length) bloqueios.push(`${nome}: cadastre ao menos um ponto.`);
      for (const p of it.pontos ?? []) {
        const l = p.limite;
        if (l?.tipo === "INTERVALO" && l.a != null && l.b != null && Number(l.a) > Number(l.b)) bloqueios.push(`${nome}, ponto ${p.nominal}: Mínimo maior que o máximo.`);
        if ((l?.tipo === "NOM_ABS" || l?.tipo === "NOM_PCT") && !(Number(l.a) >= 0)) bloqueios.push(`${nome}, ponto ${p.nominal}: tolerância inválida.`);
        if ((l?.tipo === "MAX_LE" || l?.tipo === "MAX_LT") && l.b == null) bloqueios.push(`${nome}, ponto ${p.nominal}: informe o máximo.`);
        if (l?.tipo === "MIN_GE" && l.a == null) bloqueios.push(`${nome}, ponto ${p.nominal}: informe o mínimo.`);
        if (pontoSemLimite(l)) avisos.push(`Ponto ${p.nominal}${it.unidade ? ` ${it.unidade}` : ""} sem limite: será NÃO AVALIADO e não reprova.`);
      }
      if (!it.tolerancia?.referencia?.trim()) avisos.push(`${nome}: medição sem tolerância com referência — fica NÃO AVALIADO no laudo.`);
    }
    if (it.tipo === "AMBIENTE") {
      if (it.tMin != null && it.tMax != null && it.tMin > it.tMax) bloqueios.push(`${nome}: Mínimo maior que o máximo.`);
      if (it.urMin != null && it.urMax != null && it.urMin > it.urMax) bloqueios.push(`${nome}: Mínimo maior que o máximo.`);
    }
  }
  return { bloqueios, avisos };
}

export function itensDaArvore(nos: NoArvore[]): ItemProcedimento[] {
  const out: ItemProcedimento[] = [];
  const v = (ns: NoArvore[]) => ns.forEach((n) => (n.item ? out.push(n.item) : v(n.filhos ?? [])));
  v(nos ?? []);
  return out;
}

function profundidade(nos: NoArvore[], nivel = 1): number {
  return Math.max(nivel - 1, ...(nos ?? []).map((n) => (n.filhos?.length ? profundidade(n.filhos, nivel + 1) : nivel)));
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/**
 * Herança 6e: `cadeia` = árvores do topo (avô) até o derivado, no máximo 3 níveis (Q3).
 * Cada nível herda a árvore resolvida do anterior, oculta `heranca.ocultos`, aplica `heranca.sobrescritas`
 * (só campos permitidos) e acrescenta seus próprios nós. "Herdar do pai" é o padrão.
 */
export function resolverHeranca(cadeia: ArvoreProcedimento[]): ArvoreProcedimento {
  if (cadeia.length > NIVEIS_HERANCA_MAX) throw new Error(`Herança permite no máximo ${NIVEIS_HERANCA_MAX} níveis`);
  let atual: NoArvore[] = [];
  cadeia.forEach((arv, idx) => {
    if (idx === 0) {
      atual = clone(arv.nos ?? []);
      return;
    }
    const ocultos = new Set(arv.heranca?.ocultos ?? []);
    const sobres = arv.heranca?.sobrescritas ?? {};
    const herdar = (ns: NoArvore[]): NoArvore[] =>
      ns
        .filter((n) => !ocultos.has(n.id))
        .map((n) => {
          const novo: NoArvore = { ...n, origem: "pai", sobrescritos: [] };
          if (n.filhos) novo.filhos = herdar(n.filhos);
          if (n.item) {
            const s = sobres[n.item.id];
            const it: ItemProcedimento = { ...n.item };
            const campos: string[] = [];
            if (s) {
              if (s.tipo) (it.tipo = s.tipo), campos.push("tipo");
              if (s.resolucao !== undefined) (it.resolucao = s.resolucao), campos.push("resolucao");
              if (s.nLeituras != null) (it.nLeituras = s.nLeituras), campos.push("nLeituras");
              if (s.ordem) (it.ordem = s.ordem), campos.push("ordem");
              if (s.limites) {
                it.pontos = (it.pontos ?? []).map((p) => (s.limites![p.id] ? { ...p, limite: s.limites![p.id] } : p));
                campos.push("limites");
              }
            }
            novo.item = it;
            novo.sobrescritos = campos;
          }
          return novo;
        });
    atual = [...herdar(atual), ...clone(arv.nos ?? [])];
  });
  const resolvida = { nos: atual };
  if (profundidade(resolvida.nos) > PROFUNDIDADE_MAX_ARVORE) throw new Error(`Árvore resolvida excede ${PROFUNDIDADE_MAX_ARVORE} níveis`);
  return resolvida;
}

/** Ciclo na cadeia de pais (Q3). `paiDe(id)` devolve o pai de um procedimento. */
export function verificarCadeiaPais(id: string, paiProposto: string | null, paiDe: (id: string) => string | null | undefined): { ok: boolean; erro?: string; cadeia: string[] } {
  const cadeia = [id];
  let p = paiProposto;
  while (p) {
    if (cadeia.includes(p)) return { ok: false, erro: "Herança circular: um procedimento não pode ser pai de si mesmo (direta ou indiretamente).", cadeia };
    cadeia.push(p);
    if (cadeia.length > NIVEIS_HERANCA_MAX) return { ok: false, erro: `Herança permite no máximo ${NIVEIS_HERANCA_MAX} níveis (pai e avô).`, cadeia };
    p = paiDe(p) ?? null;
  }
  return { ok: true, cadeia };
}

/** Numeração 1 / 1.1 / 1.1.1 (calculada, não gravada). */
export function numerarArvore(nos: NoArvore[], prefixo = ""): Array<{ id: string; numero: string; nivel: number; titulo: string }> {
  const out: Array<{ id: string; numero: string; nivel: number; titulo: string }> = [];
  nos.forEach((n, i) => {
    const numero = `${prefixo}${i + 1}`;
    out.push({ id: n.id, numero, nivel: numero.split(".").length, titulo: n.titulo });
    if (n.filhos?.length) out.push(...numerarArvore(n.filhos, `${numero}.`));
  });
  return out;
}

function toleranciaLegada(l: LimitePonto, it: ItemProcedimento): ToleranciaCriterio | null {
  if (l.tipo === "NOM_ABS") return { valor: Number(l.a), modo: "absoluto", unidade: it.unidade ?? null, referencia: it.tolerancia?.referencia ?? null, versao: it.tolerancia?.versao ?? null };
  if (l.tipo === "NOM_PCT") return { valor: Number(l.a), modo: "percentual", referencia: it.tolerancia?.referencia ?? null, versao: it.tolerancia?.versao ?? null };
  return null;
}

/**
 * Achata a árvore resolvida no formato de itens que o laudo já avalia (`ItemChecklistModelo`).
 * MEDIÇÃO vira um item por ponto (`<item>:<ponto>`). Limites ± absoluto/% viram tolerância; os demais
 * tipos (intervalo, só máximo/mínimo) seguem estruturados em `limitePonto` e ficam NÃO_AVALIADO até a E4 (19/19c).
 */
export function achatarParaItens(arvore: ArvoreProcedimento): Array<ItemChecklistModelo & Record<string, unknown>> {
  const out: Array<ItemChecklistModelo & Record<string, unknown>> = [];
  const numeros = new Map(numerarArvore(arvore.nos).map((x) => [x.id, x.numero]));
  const visita = (nos: NoArvore[], secao: string[]) => {
    for (const n of nos) {
      if (!n.item) {
        visita(n.filhos ?? [], [...secao, n.titulo]);
        continue;
      }
      const it = n.item;
      const base = { secao: secao.join(" › "), numero: numeros.get(n.id), instrucoes: it.instrucoes, obrigatorio: it.obrigatorio ?? true };
      if (it.tipo === "MEDICAO") {
        for (const p of it.pontos ?? []) {
          out.push({
            ...base,
            id: `${it.id}:${p.id}`,
            pergunta: `${it.titulo} — ${p.nominal}${it.unidade ? ` ${it.unidade}` : ""}`,
            tipo: "calibracao",
            grandeza: it.grandeza,
            unidade: it.unidade,
            valorPadrao: p.nominal,
            repeticoes: it.nLeituras ?? 1,
            tolerancia: pontoSemLimite(p.limite) ? null : toleranciaLegada(p.limite, it),
            limitePonto: p.limite,
            baseLimite: p.base ?? "NOMINAL",
            regra: it.regra ?? "DIRETA",
            tipoPadrao: it.tipoPadrao,
            resolucao: it.resolucao ?? null,
            ordemMedicao: it.ordem ?? "CRESCENTE",
          });
        }
      } else if (it.tipo === "QUALITATIVA") {
        for (const s of it.subitens?.length ? it.subitens : [{ id: "0", texto: it.titulo }]) {
          out.push({ ...base, id: `${it.id}:${s.id}`, pergunta: s.texto, tipo: "check", permiteNA: true, instrucoes: s.instrucao ?? it.instrucoes });
        }
      } else if (it.tipo === "AMBIENTE") {
        out.push({ ...base, id: `${it.id}:t`, pergunta: `${it.titulo} — temperatura`, tipo: "numero", unidade: "°C", faixa: { min: it.tMin ?? null, max: it.tMax ?? null } });
        out.push({ ...base, id: `${it.id}:ur`, pergunta: `${it.titulo} — umidade`, tipo: "numero", unidade: "%UR", faixa: { min: it.urMin ?? null, max: it.urMax ?? null } });
      } else {
        out.push({ ...base, id: it.id, pergunta: it.titulo, tipo: "numero", unidade: it.unidade, obrigatorio: false, registro: true });
      }
    }
  };
  visita(arvore.nos ?? [], []);
  return out;
}

/** Converte itens planos legados (com `secao` texto) em árvore de 1–2 níveis, sem reescrever o banco. */
export function arvoreDeItensLegados(itens: ItemChecklistModelo[] | null | undefined): ArvoreProcedimento {
  const secoes = new Map<string, NoArvore>();
  const soltos: NoArvore[] = [];
  (itens ?? []).forEach((i, idx) => {
    const id = i.id || `legado-${idx + 1}`;
    const tipo: TipoItem = i.tipo === "calibracao" || i.tipo === "medicao" ? "MEDICAO" : i.tipo === "numero" || i.tipo === "texto" ? "REGISTRO" : "QUALITATIVA";
    const item: ItemProcedimento = {
      id, tipo, titulo: i.pergunta || `Item ${idx + 1}`, unidade: i.unidade, grandeza: i.grandeza, nLeituras: i.repeticoes,
      obrigatorio: i.obrigatorio,
      ...(tipo === "MEDICAO" && i.valorPadrao != null
        ? { pontos: [{ id: "p1", nominal: Number(i.valorPadrao), limite: i.tolerancia?.valor != null ? { tipo: i.tolerancia.modo === "percentual" ? "NOM_PCT" : "NOM_ABS", a: Number(i.tolerancia.valor) } : { tipo: "SEM_LIMITE" } }] as PontoMedicao[],
            tolerancia: { referencia: i.tolerancia?.referencia ?? null, versao: i.tolerancia?.versao ?? null } }
        : {}),
    };
    const no: NoArvore = { id, titulo: item.titulo, item };
    if (i.secao?.trim()) {
      const k = i.secao.trim();
      if (!secoes.has(k)) secoes.set(k, { id: `secao-${secoes.size + 1}`, titulo: k, filhos: [] });
      secoes.get(k)!.filhos!.push(no);
    } else soltos.push(no);
  });
  return { nos: [...secoes.values(), ...soltos] };
}

/** Título do documento emitido (D-L1/7a): título configurado na aba Certificado, senão padrão pelo tipo. */
export function tituloDocumentoEmitido(tipoDocumento: TipoDocumentoEmitido | null | undefined, tipoLaudo: string, cfg?: CertificadoCfg | null): string | null {
  if (!tipoDocumento) return null;
  if (cfg?.tituloImpresso?.trim()) return cfg.tituloImpresso.trim().toUpperCase();
  const alvo: Record<string, string> = { CALIBRACAO: "CALIBRAÇÃO", TSE: "SEGURANÇA ELÉTRICA", PREVENTIVA: "MANUTENÇÃO PREVENTIVA", RECEBIMENTO: "RECEBIMENTO", QUALIFICACAO: "QUALIFICAÇÃO" };
  return `${tipoDocumento === "CERTIFICADO" ? "CERTIFICADO" : "LAUDO"} DE ${alvo[tipoLaudo] ?? tipoLaudo}`;
}

/** Aviso de coerência título × tipo (7a). */
export function avisoTituloIncoerente(tipoDocumento: string | null | undefined, titulo: string | null | undefined): string | null {
  const t = (titulo ?? "").toUpperCase();
  if (tipoDocumento === "LAUDO" && t.includes("CERTIFICADO")) return "O título fala em certificado, mas o documento está como Laudo.";
  if (tipoDocumento === "CERTIFICADO" && t.includes("LAUDO")) return "O título fala em laudo, mas o documento está como Certificado.";
  return null;
}

/** Rótulo da lista (crit. 8): "CÓDIGO – TÍTULO vX (publicação dd/mm/aaaa)". */
export function rotuloProcedimento(p: { codigo?: string | null; titulo?: string | null; versao?: number | null; publicadoEm?: Date | string | null }): string {
  const data = p.publicadoEm
    ? new Date(p.publicadoEm).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : null;
  return `${p.codigo ?? "SEM CÓDIGO"} – ${p.titulo ?? "Sem título"} v${p.versao ?? 1}${data ? ` (publicação ${data})` : " (rascunho)"}`;
}
