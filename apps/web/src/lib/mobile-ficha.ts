/** Ficha de campo: só mostra alerta quando a data existe. Nunca inventa KPI. */

export type FichaCampo = {
  tag: string;
  nome: string;
  situacao?: string | null;
  patrimonio?: string | null;
  nSerie?: string | null;
  planoDescricao?: string | null;
  fabricante?: string | null;
  modelo?: string | null;
  localizacao?: string | null;
  setor?: string | null;
  sigla?: string | null;
  localizacaoFisica?: string | null;
  validadeAnvisa?: string | Date | null;
  dataEndOfLife?: string | Date | null;
  dataEndOfService?: string | Date | null;
  fotoDocumentoId?: string | null;
};

export type OsCampo = {
  id: string;
  numero: number;
  codigo: string;
  prioridade: string;
  status: string;
  abertura?: string | Date | null;
  atrasada?: boolean;
  slaLimite?: string | null;
  slaEstourado?: boolean;
  atribuicaoVersao?: number | null;
  equipamento: {
    tag: string;
    nome: string;
    fabricante?: string | null;
    modelo?: string | null;
    localizacao?: string | null;
    setor?: string | null;
    sigla?: string | null;
  };
};

export type AlertaCampo = { tom: "warning" | "danger"; texto: string };

function asDate(v?: string | Date | null): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function diasAberta(abertura?: string | Date | null): number | null {
  const d = asDate(abertura);
  if (!d) return null;
  const ms = Date.now() - d.getTime();
  if (ms < 0) return 0;
  return Math.floor(ms / 86_400_000);
}

export function labelDiasAberta(abertura?: string | Date | null): string | null {
  const n = diasAberta(abertura);
  if (n == null) return null;
  if (n === 0) return "Aberta hoje";
  if (n === 1) return "Aberta há 1 dia";
  return `Aberta há ${n} dias`;
}

function diasAte(v?: string | Date | null): number | null {
  const d = asDate(v);
  if (!d) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
}

export function alertasFicha(f: FichaCampo, hoje = new Date()): AlertaCampo[] {
  const out: AlertaCampo[] = [];
  const anvisa = diasAte(f.validadeAnvisa);
  if (anvisa != null) {
    if (anvisa < 0) out.push({ tom: "danger", texto: "Registro Anvisa vencido." });
    else if (anvisa <= 90) {
      out.push({
        tom: "warning",
        texto: `Registro Anvisa vence em ${anvisa} dia(s).`,
      });
    }
  }
  const eol = diasAte(f.dataEndOfLife);
  if (eol != null) {
    if (eol < 0) out.push({ tom: "danger", texto: "Fim de vida (End of Life) já atingido." });
    else {
      out.push({
        tom: eol <= 180 ? "warning" : "warning",
        texto: `Equipamento encerra o prazo de End of Life em ${eol} dia(s).`,
      });
    }
  }
  const eos = diasAte(f.dataEndOfService);
  if (eos != null) {
    if (eos < 0) out.push({ tom: "danger", texto: "Fim de suporte do fabricante (End of Service) já atingido." });
    else if (eos <= 180) {
      out.push({
        tom: "warning",
        texto: `Fim de suporte do fabricante em ${eos} dia(s).`,
      });
    }
  }
  void hoje;
  return out;
}

export function fromEquipamentoApi(eq: {
  tag: string;
  nome: string;
  situacao?: string | null;
  patrimonio?: string | null;
  nSerie?: string | null;
  planoDescricao?: string | null;
  localizacaoFisica?: string | null;
  validadeAnvisa?: string | Date | null;
  dataEndOfLife?: string | Date | null;
  dataEndOfService?: string | Date | null;
  descricao?: { nome?: string } | null;
  fabricante?: { nome?: string } | string | null;
  modelo?: { nome?: string } | string | null;
  setor?: { nome?: string; setorArea?: { nome?: string; sigla?: string } | null } | string | null;
}): FichaCampo {
  const fab = typeof eq.fabricante === "string" ? eq.fabricante : eq.fabricante?.nome ?? null;
  const mod = typeof eq.modelo === "string" ? eq.modelo : eq.modelo?.nome ?? null;
  const loc = typeof eq.setor === "string" ? eq.setor : eq.setor?.nome ?? null;
  const area = typeof eq.setor === "string" ? eq.setor : eq.setor?.setorArea?.nome ?? loc;
  const sigla = typeof eq.setor === "string" ? null : eq.setor?.setorArea?.sigla ?? null;
  return {
    tag: eq.tag,
    nome: eq.nome,
    situacao: eq.situacao ?? null,
    patrimonio: eq.patrimonio ?? null,
    nSerie: eq.nSerie ?? null,
    planoDescricao: eq.planoDescricao ?? eq.descricao?.nome ?? null,
    fabricante: fab,
    modelo: mod,
    localizacao: loc,
    setor: area,
    sigla,
    localizacaoFisica: eq.localizacaoFisica ?? null,
    validadeAnvisa: eq.validadeAnvisa ?? null,
    dataEndOfLife: eq.dataEndOfLife ?? null,
    dataEndOfService: eq.dataEndOfService ?? null,
  };
}
