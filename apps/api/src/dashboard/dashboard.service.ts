import { Injectable } from "@nestjs/common";
import { CondicaoUsoEquipamento, SituacaoEquipamento, StatusOS, TipoOS } from "@prisma/client";
import { calcularSlaOs } from "@aion/shared";
import { PrismaService } from "../prisma/prisma.service";
import { mttrDeParadas, snapshotParqueEmOperacao } from "../indicadores/indicador-regras";

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
    const [equipamentosAtivos, totalEquip, parados, osAbertas, semResponsavel, osConcluidas, paradasEncerradas, osAbertasSla] =
      await Promise.all([
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
        this.prisma.equipamento.count({
          where: {
            estabelecimentoId,
            situacao: { not: SituacaoEquipamento.ARQUIVADO },
            condicaoUso: CondicaoUsoEquipamento.PARADO,
          },
        }),
        this.prisma.ordemServico.count({
          where: {
            estabelecimentoId,
            status: { in: [StatusOS.NAO_ATRIBUIDA, StatusOS.ABERTA, StatusOS.EM_ANDAMENTO, StatusOS.AGUARDANDO] },
          },
        }),
        this.prisma.ordemServico.count({
          where: {
            estabelecimentoId,
            status: { in: [StatusOS.NAO_ATRIBUIDA, StatusOS.ABERTA, StatusOS.EM_ANDAMENTO, StatusOS.AGUARDANDO] },
            responsavelId: null,
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
            tipo: TipoOS.CORRETIVA,
            equipamentoParado: true,
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

    const duracaoMediaOsHoras =
      osConcluidas.length === 0
        ? null
        : Number(
            (
              osConcluidas.reduce((acc, os) => {
                const h = (os.fechamento!.getTime() - os.abertura.getTime()) / (1000 * 60 * 60);
                return acc + h;
              }, 0) / osConcluidas.length
            ).toFixed(1),
          );

    const mttr = mttrDeParadas(
      paradasEncerradas.filter((os) => os.fechamento).map((os) => os.fechamento!.getTime() - os.abertura.getTime()),
    );
    const parque = snapshotParqueEmOperacao(equipamentosAtivos, totalEquip);

    return {
      equipamentosAtivos,
      osAbertas,
      osSemResponsavel: semResponsavel,
      equipamentosParados: parados,
      osSlaEstourado: osAbertasSla.filter((os) => this.slaDe(os).slaEstourado).length,
      duracaoMediaOsHoras,
      mttrMedioHoras: mttr.valor,
      mttrStatus: mttr.status,
      mttrMotivo: mttr.motivo ?? null,
      parqueEmOperacaoPct: parque.percentual,
      disponibilidadePct: null,
      disponibilidadeNota: "Disponibilidade medida está no painel do gestor. Este card é snapshot do parque, não uptime.",
      atualizadoEm: new Date().toISOString(),
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
