import { Injectable, NotFoundException } from "@nestjs/common";
import { FormulaIndicador, SituacaoEquipamento, StatusOS, TipoOS } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/current-user.decorator";

@Injectable()
export class IndicadoresService {
  constructor(private readonly prisma: PrismaService) {}

  async list(estabelecimentoId: string) {
    await this.ensureSistema();
    const indicadores = await this.prisma.indicador.findMany({
      where: {
        ativo: true,
        OR: [{ sistema: true }, { estabelecimentoId }],
      },
      orderBy: [{ sistema: "desc" }, { nome: "asc" }],
    });

    const withValues = await Promise.all(
      indicadores.map(async (ind) => {
        const valor = await this.calcular(estabelecimentoId, ind);
        const historico = await this.prisma.indicadorSnapshot.findMany({
          where: { indicadorId: ind.id },
          orderBy: { periodo: "desc" },
          take: 2,
        });
        const tendencia =
          historico.length < 2
            ? "estavel"
            : historico[0].valor > historico[1].valor
              ? "alta"
              : historico[0].valor < historico[1].valor
                ? "baixa"
                : "estavel";
        return {
          ...ind,
          valorAtual: valor,
          meta: ind.metaTexto ?? (ind.metaNum != null ? String(ind.metaNum) : null),
          tendencia,
        };
      }),
    );
    return withValues;
  }

  async historico(estabelecimentoId: string, id: string, meses = 6) {
    const ind = await this.prisma.indicador.findUnique({ where: { id } });
    if (!ind) throw new NotFoundException("Indicador não encontrado");
    await this.snapshotMesAtual(estabelecimentoId, ind);
    const snaps = await this.prisma.indicadorSnapshot.findMany({
      where: { indicadorId: id },
      orderBy: { periodo: "desc" },
      take: meses,
    });
    return snaps.reverse();
  }

  async construtor(
    user: AuthUser,
    body: { nome: string; campos: string[]; formula: FormulaIndicador; metaTexto?: string; metaNum?: number },
  ) {
    const codigo = `custom_${Date.now()}`;
    return this.prisma.indicador.create({
      data: {
        estabelecimentoId: user.estabelecimentoId,
        codigo,
        nome: body.nome,
        categoria: "Customizado",
        formula: body.formula,
        campos: body.campos,
        metaTexto: body.metaTexto,
        metaNum: body.metaNum,
        sistema: false,
      },
    });
  }

  private async ensureSistema() {
    const defs = [
      {
        codigo: "disp_criticos",
        nome: "Disponibilidade de críticos",
        categoria: "Operação",
        formula: FormulaIndicador.PERCENTUAL,
        metaTexto: "≥ 95%",
        metaNum: 95,
      },
      {
        codigo: "mttr",
        nome: "MTTR (horas)",
        categoria: "Operação",
        formula: FormulaIndicador.MEDIA,
        metaTexto: "≤ 24h",
        metaNum: 24,
      },
      {
        codigo: "cumpr_prev",
        nome: "Cumprimento de preventivas",
        categoria: "Manutenção",
        formula: FormulaIndicador.PERCENTUAL,
        metaTexto: "≥ 90%",
        metaNum: 90,
      },
      {
        codigo: "idx_conf",
        nome: "Índice de conformidade",
        categoria: "Qualidade",
        formula: FormulaIndicador.PERCENTUAL,
        metaTexto: "≥ 80%",
        metaNum: 80,
      },
      {
        codigo: "custo_manut",
        nome: "Custo manutenção / valor patrimonial",
        categoria: "Financeiro",
        formula: FormulaIndicador.PERCENTUAL,
        metaTexto: "≤ 8%",
        metaNum: 8,
      },
    ];
    for (const d of defs) {
      await this.prisma.indicador.upsert({
        where: { codigo: d.codigo },
        create: { ...d, sistema: true, campos: [] },
        update: {},
      });
    }
  }

  private async calcular(
    estabelecimentoId: string,
    ind: { codigo: string; sistema: boolean; formula: FormulaIndicador; campos: unknown },
  ) {
    if (ind.sistema) {
      switch (ind.codigo) {
        case "disp_criticos": {
          const ativos = await this.prisma.equipamento.count({
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
          });
          const total = await this.prisma.equipamento.count({
            where: { estabelecimentoId, situacao: { not: SituacaoEquipamento.ARQUIVADO } },
          });
          return total === 0 ? 0 : Number(((ativos / total) * 100).toFixed(1));
        }
        case "mttr": {
          const rows = await this.prisma.ordemServico.findMany({
            where: { estabelecimentoId, status: StatusOS.CONCLUIDA, fechamento: { not: null } },
            select: { abertura: true, fechamento: true },
            take: 200,
            orderBy: { fechamento: "desc" },
          });
          if (!rows.length) return 0;
          const h =
            rows.reduce((a, o) => a + (o.fechamento!.getTime() - o.abertura.getTime()) / 36e5, 0) /
            rows.length;
          return Number(h.toFixed(1));
        }
        case "cumpr_prev": {
          const prev = await this.prisma.ordemServico.count({
            where: { estabelecimentoId, tipo: TipoOS.PREVENTIVA },
          });
          const concl = await this.prisma.ordemServico.count({
            where: { estabelecimentoId, tipo: TipoOS.PREVENTIVA, status: StatusOS.CONCLUIDA },
          });
          return prev === 0 ? 100 : Number(((concl / prev) * 100).toFixed(1));
        }
        case "idx_conf": {
          const reqs = await this.prisma.requisitoNormativo.count({ where: { ativo: true } });
          if (!reqs) return 0;
          const evs = await this.prisma.evidenciaConformidade.findMany({
            where: { estabelecimentoId, status: "CONFORME" },
            distinct: ["requisitoId"],
          });
          return Number(((evs.length / reqs) * 100).toFixed(1));
        }
        case "custo_manut": {
          const itens = await this.prisma.ordemServicoItem.findMany({
            where: { ordemServico: { estabelecimentoId } },
            select: { quantidade: true, valorUnitario: true },
          });
          const custo = itens.reduce((s, i) => s + Number(i.quantidade) * Number(i.valorUnitario ?? 0), 0);
          const eqs = await this.prisma.equipamento.findMany({
            where: { estabelecimentoId },
            select: { valorAquisicao: true },
          });
          const patrimonio = eqs.reduce((s, e) => s + Number(e.valorAquisicao ?? 0), 0);
          return patrimonio === 0 ? 0 : Number(((custo / patrimonio) * 100).toFixed(2));
        }
        default:
          return 0;
      }
    }
    // Custom: contagem simples de OS abertas como placeholder se campos vazios
    return this.prisma.ordemServico.count({
      where: {
        estabelecimentoId,
        status: { in: [StatusOS.ABERTA, StatusOS.EM_ANDAMENTO, StatusOS.NAO_ATRIBUIDA] },
      },
    });
  }

  private async snapshotMesAtual(
    estabelecimentoId: string,
    ind: { id: string; codigo: string; sistema: boolean; formula: FormulaIndicador; campos: unknown },
  ) {
    const periodo = new Date().toISOString().slice(0, 7);
    const valor = await this.calcular(estabelecimentoId, ind);
    await this.prisma.indicadorSnapshot.upsert({
      where: { indicadorId_periodo: { indicadorId: ind.id, periodo } },
      create: { indicadorId: ind.id, periodo, valor },
      update: { valor },
    });
  }
}
