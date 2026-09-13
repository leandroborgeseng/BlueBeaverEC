import type { AcaoStatusOS, StatusOS } from "@aion/shared";

export const ACOES_STATUS: AcaoStatusOS[] = [
  "iniciar",
  "pausar",
  "aguardar",
  "retomar",
  "fechar",
  "cancelar",
  "reabrir",
];

const ABERTAS: StatusOS[] = ["NAO_ATRIBUIDA", "ABERTA", "EM_ANDAMENTO", "AGUARDANDO"];

export function statusAposAtribuir(temResponsavel: boolean): StatusOS {
  return temResponsavel ? "ABERTA" : "NAO_ATRIBUIDA";
}

export function transicaoStatusOS(
  atual: StatusOS,
  acao: AcaoStatusOS,
  temResponsavel: boolean,
): { ok: true; proximo: StatusOS } | { ok: false; erro: string } {
  if (acao === "iniciar") {
    if (atual !== "ABERTA" && atual !== "NAO_ATRIBUIDA") {
      return { ok: false, erro: "Só é possível iniciar OS aberta ou não atribuída" };
    }
    return { ok: true, proximo: "EM_ANDAMENTO" };
  }

  if (acao === "pausar") {
    if (atual !== "EM_ANDAMENTO") {
      return { ok: false, erro: "Só é possível pausar OS em atendimento" };
    }
    return { ok: true, proximo: statusAposAtribuir(temResponsavel) };
  }

  if (acao === "aguardar") {
    if (atual !== "EM_ANDAMENTO" && atual !== "ABERTA") {
      return { ok: false, erro: "Só é possível aguardar OS atribuída ou em atendimento" };
    }
    return { ok: true, proximo: "AGUARDANDO" };
  }

  if (acao === "retomar") {
    if (atual !== "AGUARDANDO") {
      return { ok: false, erro: "Só é possível retomar OS em aguardo" };
    }
    return { ok: true, proximo: "EM_ANDAMENTO" };
  }

  if (acao === "fechar") {
    if (!ABERTAS.includes(atual)) {
      return { ok: false, erro: "Só é possível concluir OS em aberto" };
    }
    return { ok: true, proximo: "CONCLUIDA" };
  }

  if (acao === "cancelar") {
    if (!ABERTAS.includes(atual)) {
      return { ok: false, erro: "Só é possível cancelar OS em aberto" };
    }
    return { ok: true, proximo: "CANCELADA" };
  }

  if (acao === "reabrir") {
    if (atual !== "CONCLUIDA" && atual !== "CANCELADA") {
      return { ok: false, erro: "Só é possível reabrir OS concluída ou cancelada" };
    }
    return { ok: true, proximo: statusAposAtribuir(temResponsavel) };
  }

  return { ok: false, erro: "Ação de status desconhecida" };
}

export function atribuicaoConflitou(opts: {
  atualResponsavelId: string | null;
  expectedResponsavelId?: string | null;
  atualVersao: number;
  expectedVersao?: number;
}): boolean {
  if (opts.expectedVersao != null && opts.expectedVersao !== opts.atualVersao) return true;
  if (opts.expectedResponsavelId === undefined) return false;
  return (opts.atualResponsavelId ?? null) !== (opts.expectedResponsavelId ?? null);
}
