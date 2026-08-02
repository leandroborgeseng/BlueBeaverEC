import { Injectable } from "@nestjs/common";
import { SituacaoEquipamento, StatusOS } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async kpis(estabelecimentoId: string) {
    const [equipamentosAtivos, totalEquip, osAbertas, osConcluidas] = await Promise.all([
      this.prisma.equipamento.count({
        where: {
          estabelecimentoId,
          situacao: {
            in: [
              SituacaoEquipamento.ATIVO,
              SituacaoEquipamento.EM_GARANTIA,
              SituacaoEquipamento.EM_GARANTIA_ESTENDIDA,
            ],
          },
        },
      }),
      this.prisma.equipamento.count({
        where: { estabelecimentoId, situacao: { not: SituacaoEquipamento.ARQUIVADO } },
      }),
      this.prisma.ordemServico.count({
        where: {
          estabelecimentoId,
          status: { in: [StatusOS.NAO_ATRIBUIDA, StatusOS.ABERTA, StatusOS.EM_ANDAMENTO] },
        },
      }),
      this.prisma.ordemServico.findMany({
        where: {
          estabelecimentoId,
          status: StatusOS.CONCLUIDA,
          fechamento: { not: null },
        },
        select: { abertura: true, fechamento: true },
        take: 200,
        orderBy: { fechamento: "desc" },
      }),
    ]);

    const mttrHoras =
      osConcluidas.length === 0
        ? null
        : osConcluidas.reduce((acc, os) => {
            const ms = (os.fechamento!.getTime() - os.abertura.getTime()) / (1000 * 60 * 60);
            return acc + ms;
          }, 0) / osConcluidas.length;

    return {
      equipamentosAtivos,
      osAbertas,
      mttrMedioHoras: mttrHoras === null ? null : Number(mttrHoras.toFixed(1)),
      disponibilidadePct:
        totalEquip === 0 ? null : Number(((equipamentosAtivos / totalEquip) * 100).toFixed(1)),
    };
  }

  async osPorSituacao(estabelecimentoId: string) {
    const groups = await this.prisma.ordemServico.groupBy({
      by: ["status"],
      where: { estabelecimentoId },
      _count: { _all: true },
    });
    return groups.map((g) => ({ situacao: g.status, total: g._count._all }));
  }

  async equipamentosStatus(estabelecimentoId: string) {
    const groups = await this.prisma.equipamento.groupBy({
      by: ["situacao"],
      where: { estabelecimentoId },
      _count: { _all: true },
    });
    return groups.map((g) => ({ situacao: g.situacao, total: g._count._all }));
  }

  async osRecentes(estabelecimentoId: string, limit = 5) {
    return this.prisma.ordemServico.findMany({
      where: { estabelecimentoId },
      include: { equipamento: true, responsavel: true },
      orderBy: { abertura: "desc" },
      take: limit,
    });
  }
}
