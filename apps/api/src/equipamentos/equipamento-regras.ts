/** Regras puras de inventário: unicidade, TAG HEF e importação sem overwrite. */

export function normalizarIdent(v?: string | null): string {
  return String(v ?? "").trim();
}

/** Série vazia ou só espaço não conta como duplicata. */
export function serieContaComoDuplicata(v?: string | null): boolean {
  return normalizarIdent(v).length > 0;
}

export function proximaTagHef(tags: string[]): string {
  let max = 0;
  for (const t of tags) {
    const m = /^HEF-(\d+)$/i.exec(t.trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `HEF-${String(max + 1).padStart(4, "0")}`;
}

export function payloadQrAutenticado(token: string): string {
  return `aion:eq:${token}`;
}

/** Aceita TAG, token opaco ou payload `aion:eq:…`. Não resolve dados sozinho. */
export function extrairCodigoQr(raw: string): string {
  const v = String(raw ?? "").trim();
  const prefixed = /^aion:eq:(.+)$/i.exec(v);
  if (prefixed) return prefixed[1].trim();
  try {
    const url = new URL(v);
    const last = url.pathname.split("/").filter(Boolean).pop() ?? "";
    return decodeURIComponent(last);
  } catch {
    return v;
  }
}

export type ImportRowIn = {
  tag?: string;
  nome?: string;
  planoDescricao?: string;
  fabricante?: string;
  modelo?: string;
  setor?: string;
  patrimonio?: string;
  nSerie?: string;
  idInterna?: string;
  unidade?: string;
  localizacaoFisica?: string;
  propriedade?: string;
  registroAnvisa?: string;
  validadeAnvisa?: string;
  dataAquisicao?: string;
  dataInstalacao?: string;
  valorAquisicao?: number | string;
  garantiaInicio?: string;
  garantiaFim?: string;
  observacao?: string;
};

export type ImportLinhaResultado =
  | { ok: true; linha: number; tag: string; acao: "criar"; row: ImportRowIn }
  | { ok: false; linha: number; tag: string; erro: string };

export type IndiceExistentes = {
  tags: Set<string>;
  series: Set<string>;
  patrimonios: Set<string>;
  idInternas: Set<string>;
};

function chave(v: string) {
  return v.trim().toLocaleLowerCase("pt-BR");
}

export function validarLinhaImportacao(
  row: ImportRowIn,
  linha: number,
  existentes: IndiceExistentes,
  vistos: IndiceExistentes,
): ImportLinhaResultado {
  const tag = normalizarIdent(row.tag);
  const nome = normalizarIdent(row.nome);
  if (!nome) {
    return { ok: false, linha, tag: tag || "(vazio)", erro: "nome obrigatório" };
  }

  if (tag) {
    if (existentes.tags.has(chave(tag))) {
      return {
        ok: false,
        linha,
        tag,
        erro: `TAG ${tag} já existe — importação não sobrescreve`,
      };
    }
    if (vistos.tags.has(chave(tag))) {
      return { ok: false, linha, tag, erro: `TAG ${tag} repetida neste arquivo` };
    }
  }

  const patrimonio = normalizarIdent(row.patrimonio);
  if (patrimonio) {
    if (existentes.patrimonios.has(chave(patrimonio)) || vistos.patrimonios.has(chave(patrimonio))) {
      return { ok: false, linha, tag: tag || "(sem TAG)", erro: `patrimônio ${patrimonio} já cadastrado nesta instituição` };
    }
  }

  const nSerie = normalizarIdent(row.nSerie);
  if (serieContaComoDuplicata(nSerie)) {
    if (existentes.series.has(chave(nSerie)) || vistos.series.has(chave(nSerie))) {
      return { ok: false, linha, tag: tag || "(sem TAG)", erro: `nº de série ${nSerie} já cadastrado nesta instituição` };
    }
  }

  const idInterna = normalizarIdent(row.idInterna);
  if (idInterna) {
    if (existentes.idInternas.has(chave(idInterna)) || vistos.idInternas.has(chave(idInterna))) {
      return { ok: false, linha, tag: tag || "(sem TAG)", erro: `ID interna ${idInterna} já cadastrada nesta instituição` };
    }
  }

  if (tag) vistos.tags.add(chave(tag));
  if (patrimonio) vistos.patrimonios.add(chave(patrimonio));
  if (serieContaComoDuplicata(nSerie)) vistos.series.add(chave(nSerie));
  if (idInterna) vistos.idInternas.add(chave(idInterna));

  return {
    ok: true,
    linha,
    tag: tag || "(será gerada)",
    acao: "criar",
    row: { ...row, tag, nome, patrimonio: patrimonio || undefined, nSerie: nSerie || undefined, idInterna: idInterna || undefined },
  };
}

export function validarLoteImportacao(rows: ImportRowIn[], existentes: IndiceExistentes): ImportLinhaResultado[] {
  const vistos: IndiceExistentes = {
    tags: new Set(),
    series: new Set(),
    patrimonios: new Set(),
    idInternas: new Set(),
  };
  return rows.map((row, i) => validarLinhaImportacao(row, i + 1, existentes, vistos));
}

export const COLUNAS_IMPORT = [
  "tag",
  "nome",
  "planoDescricao",
  "fabricante",
  "modelo",
  "setor",
  "unidade",
  "localizacaoFisica",
  "patrimonio",
  "idInterna",
  "nSerie",
  "propriedade",
  "dataAquisicao",
  "valorAquisicao",
  "garantiaInicio",
  "garantiaFim",
  "observacao",
] as const;

export function garantiaVigente(fim?: Date | string | null, agora = new Date()): boolean {
  if (!fim) return false;
  const d = fim instanceof Date ? fim : new Date(fim);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() >= agora.getTime();
}
