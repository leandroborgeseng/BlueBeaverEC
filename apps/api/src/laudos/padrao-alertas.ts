import type { PrismaClient } from "@prisma/client";
import { janelaAlerta, montarAlertasPadroes, resumoAlertasPadroes, type AlertaPadrao } from "./padrao-regras";

type PrismaLike = Pick<PrismaClient, "instrumentoPadrao" | "estabelecimento">;

/** Carrega os alertas de certificados de padrão (crit. 3); usado por /instrumentos-padroes/alertas, nav e dashboard. */
export async function carregarAlertasPadroes(
  prisma: PrismaLike,
  estabelecimentoId: string,
  diasParam?: number,
  agora: Date = new Date(),
) {
  let dias: number;
  if (diasParam != null) dias = janelaAlerta(diasParam);
  else {
    const org = await prisma.estabelecimento
      .findUnique({ where: { id: estabelecimentoId }, select: { diasAlertaCertificado: true } })
      .catch(() => null);
    dias = janelaAlerta(org?.diasAlertaCertificado);
  }
  const rows = await prisma.instrumentoPadrao.findMany({
    where: { estabelecimentoId, ativo: true },
    select: {
      id: true,
      nome: true,
      nSerie: true,
      tipoAnalisador: true,
      certificadoNumero: true,
      certificadoValidade: true,
      certificados: {
        where: { vigente: true, revisoes: { none: {} } },
        take: 1,
        orderBy: { dataValidade: "desc" },
        select: { numero: true, dataValidade: true },
      },
    },
  });
  const itens = montarAlertasPadroes(
    rows.map((r) => ({
      id: r.id,
      nome: r.nome,
      nSerie: r.nSerie,
      tipoAnalisador: r.tipoAnalisador,
      certificadoNumero: r.certificados[0]?.numero ?? r.certificadoNumero,
      certificadoValidade: r.certificados[0]?.dataValidade ?? r.certificadoValidade,
    })),
    agora,
    dias,
  );
  return { diasAlerta: dias, resumo: resumoAlertasPadroes(itens), itens };
}

export type NotificacaoPadrao = {
  id: string;
  tipo: "PADRAO_CERTIFICADO_VENCIDO" | "PADRAO_CERTIFICADO_A_VENCER" | "PADRAO_SEM_CERTIFICADO";
  titulo: string;
  detalhe: string;
  href: string;
  severidade: "warning" | "danger";
  createdAt: string;
};

/** Itens do sino para padrões (vencido, a vencer e sem certificado), com link para o padrão. */
export function notificacoesPadroes(itens: AlertaPadrao[], agora: Date = new Date()): NotificacaoPadrao[] {
  return itens.map((a) => {
    const href = `/instrumentos/${a.instrumentoId}`;
    const id = `padrao-${a.instrumentoId}`;
    if (a.status === "SEM_CERTIFICADO") {
      return {
        id,
        tipo: "PADRAO_SEM_CERTIFICADO",
        titulo: `Padrão sem certificado · ${a.nome} (${a.nSerie})`,
        detalhe: "Cadastre o certificado de calibração antes de usar em laudos",
        href,
        severidade: "warning",
        createdAt: agora.toISOString(),
      };
    }
    const vencido = a.status === "VENCIDO";
    return {
      id,
      tipo: vencido ? "PADRAO_CERTIFICADO_VENCIDO" : "PADRAO_CERTIFICADO_A_VENCER",
      titulo: vencido
        ? `Certificado do padrão vencido · ${a.nome} (${a.nSerie})`
        : `Certificado do padrão a vencer (${a.dias}d) · ${a.nome} (${a.nSerie})`,
      detalhe: a.certificadoNumero ?? "",
      href,
      severidade: vencido ? "danger" : "warning",
      createdAt: a.certificadoValidade ?? agora.toISOString(),
    };
  });
}
