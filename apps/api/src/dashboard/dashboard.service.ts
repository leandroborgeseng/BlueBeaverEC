import { Injectable } from "@nestjs/common";
import { SituacaoEquipamento, StatusOS } from "@prisma/client";
import { calcularSlaOs } from "@aion/shared";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  private slaDe(os: {
    prioridade: string;
    abertura: Date;
    fechamento?: Date | null;
    status: StatusOS;
    equipamento?: {
      descricao?: {
        slaConclusaoHoras?: number | null;
        slaAtendimentoHoras?: number | null;
      } | null;
    } | null;
  }) {
    return calcularSlaOs({
      abertura: os.abertura,
      fechamento: os.fechamento ?? null,
      status: os.status,
      prioridade: os.prioridade,
      slaConclusaoHoras: os.equipamento?.descricao?.slaConclusaoHoras,
      slaAtendimentoHoras: os.equipamento?.descricao?.slaAtendimentoHoras,
    });
  }

  async kpis(estabelecimentoId: string) {
    const [equipamentosAtivos, totalEquip, osAbertas, osConcluidas, osAbertasSla] = await Promise.all([
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
      this.prisma.ordemServico.findMany({
        where: {
          estabelecimentoId,
          status: { in: [StatusOS.NAO_ATRIBUIDA, StatusOS.ABERTA, StatusOS.EM_ANDAMENTO, StatusOS.AGUARDANDO] },
        },
        select: {
          prioridade: true,
          abertura: true,
          fechamento: true,
          status: true,
          equipamento: {
            select: { descricao: { select: { slaConclusaoHoras: true, slaAtendimentoHoras: true } } },
          },
        },
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
      osSlaEstourado: osAbertasSla.filter((os) => this.slaDe(os).slaEstourado).length,
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
    const rows = await this.prisma.ordemServico.findMany({
      where: { estabelecimentoId },
      include: { equipamento: { include: { descricao: true } }, responsavel: true },
      orderBy: { abertura: "desc" },
      take: limit,
    });
    return rows.map((os) => {
      const sla = this.slaDe(os);
      return {
        ...os,
        ...sla,
        atrasada: sla.slaEstourado,
      };
    });
  }

  async osAtrasadas(estabelecimentoId: string) {
    const rows = await this.prisma.ordemServico.findMany({
      where: {
        estabelecimentoId,
        status: {
          in: [StatusOS.NAO_ATRIBUIDA, StatusOS.ABERTA, StatusOS.EM_ANDAMENTO, StatusOS.AGUARDANDO],
        },
      },
      include: { equipamento: { include: { descricao: true } } },
      orderBy: { abertura: "asc" },
      take: 80,
    });
    return rows
      .map((os) => {
        const sla = this.slaDe(os);
        return {
          numero: os.numero,
          codigo: os.codigo,
          status: os.status,
          prioridade: os.prioridade,
          tag: os.equipamento?.tag ?? "—",
          nome: os.equipamento?.nome ?? "Chamado do setor",
          abertura: os.abertura,
          ...sla,
          atrasada: sla.slaEstourado,
        };
      })
      .filter((os) => os.slaEstourado)
      .sort((a, b) => a.slaMinutosRestantes - b.slaMinutosRestantes);
  }

  async osSla(estabelecimentoId: string) {
    const rows = await this.prisma.ordemServico.findMany({
      where: {
        estabelecimentoId,
        status: {
          in: [StatusOS.NAO_ATRIBUIDA, StatusOS.ABERTA, StatusOS.EM_ANDAMENTO, StatusOS.AGUARDANDO],
        },
      },
      include: { equipamento: { include: { descricao: true } } },
      orderBy: { abertura: "asc" },
      take: 80,
    });
    return rows
      .map((os) => {
        const sla = this.slaDe(os);
        return {
          numero: os.numero,
          codigo: os.codigo,
          status: os.status,
          prioridade: os.prioridade,
          tag: os.equipamento?.tag ?? "—",
          nome: os.equipamento?.nome ?? "Chamado do setor",
          abertura: os.abertura,
          ...sla,
          atrasada: sla.slaEstourado,
        };
      })
      .sort((a, b) => a.slaMinutosRestantes - b.slaMinutosRestantes)
      .slice(0, 12);
  }
}
