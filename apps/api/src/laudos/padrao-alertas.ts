import type { PrismaClient } from "@prisma/client";
import { janelaAlerta, montarAlertasPadroes, resumoAlertasPadroes } from "./padrao-regras";

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
        where: { vigente: true },
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
