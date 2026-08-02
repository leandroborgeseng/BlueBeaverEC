import { Injectable, NotFoundException } from "@nestjs/common";
import { OrigemCapex, SituacaoEquipamento, StatusCapex } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/current-user.decorator";

@Injectable()
export class GestaoService {
  constructor(private readonly prisma: PrismaService) {}

  listPlanoDiretor(estabelecimentoId: string) {
    return this.prisma.planoDiretorItem.findMany({
      where: { estabelecimentoId },
      orderBy: { atualizadoEm: "desc" },
    });
  }

  createPlanoDiretor(
    user: AuthUser,
    body: { iniciativa: string; horizonteTexto?: string; investimentoPrevisto?: number; status?: string },
  ) {
    return this.prisma.planoDiretorItem.create({
      data: {
        estabelecimentoId: user.estabelecimentoId,
        iniciativa: body.iniciativa,
        horizonteTexto: body.horizonteTexto,
        investimentoPrevisto: body.investimentoPrevisto,
        status: body.status ?? "Em andamento",
      },
    });
  }

  async patchPlanoDiretor(
    user: AuthUser,
    id: string,
    body: Partial<{ iniciativa: string; horizonteTexto: string; investimentoPrevisto: number; status: string }>,
  ) {
    const row = await this.prisma.planoDiretorItem.findFirst({
      where: { id, estabelecimentoId: user.estabelecimentoId },
    });
    if (!row) throw new NotFoundException();
    return this.prisma.planoDiretorItem.update({
      where: { id },
      data: { ...body, atualizadoEm: new Date() },
    });
  }

  async substituicaoTecnologica(estabelecimentoId: string) {
    const eqs = await this.prisma.equipamento.findMany({
      where: { estabelecimentoId, situacao: { not: SituacaoEquipamento.ARQUIVADO } },
      include: {
        descricao: true,
        ordensServico: { include: { itens: true } },
      },
    });
    const now = Date.now();
    const candidatos = eqs.map((e) => {
      const idadeAnos = e.dataAquisicao
        ? (now - e.dataAquisicao.getTime()) / (365.25 * 24 * 3600 * 1000)
        : 0;
      const custoAcumulado = e.ordensServico.reduce(
        (s, os) =>
          s +
          os.itens.reduce((si, i) => si + Number(i.quantidade) * Number(i.valorUnitario ?? 0), 0),
        0,
      );
      const anvisaVencida = !!(e.validadeAnvisa && e.validadeAnvisa.getTime() < now);
      const eos = !!(e.dataEndOfService && e.dataEndOfService.getTime() < now);
      const eol = !!(e.dataEndOfLife && e.dataEndOfLife.getTime() < now);
      const vidaUtil = e.descricao.vidaUtilAnos || 10;
      let score = 0;
      if (idadeAnos >= vidaUtil) score += 30;
      else if (idadeAnos >= vidaUtil * 0.8) score += 15;
      if (custoAcumulado > Number(e.valorAquisicao ?? 0) * 0.5) score += 25;
      if (anvisaVencida) score += 30;
      if (eos) score += 20;
      if (eol) score += 25;
      return {
        equipamentoId: e.id,
        tag: e.tag,
        nome: e.nome,
        idadeAnos: Number(idadeAnos.toFixed(1)),
        vidaUtilAnos: vidaUtil,
        custoAcumulado: Number(custoAcumulado.toFixed(2)),
        valorAquisicao: e.valorAquisicao ? Number(e.valorAquisicao) : null,
        valorSubstituicao: e.valorSubstituicao ? Number(e.valorSubstituicao) : null,
        flags: { anvisaVencida, eos, eol },
        prioridade: score,
        criterio: [
          idadeAnos >= vidaUtil * 0.8 ? "idade" : null,
          custoAcumulado > 0 ? "custo" : null,
          anvisaVencida ? "anvisa" : null,
          eos ? "eos" : null,
          eol ? "eol" : null,
        ].filter(Boolean),
      };
    });
    return candidatos.filter((c) => c.prioridade > 0).sort((a, b) => b.prioridade - a.prioridade);
  }

  listCapex(estabelecimentoId: string) {
    return this.prisma.capexItem.findMany({
      where: { estabelecimentoId },
      orderBy: { createdAt: "desc" },
    });
  }

  createCapex(
    user: AuthUser,
    body: {
      descricao: string;
      valorEstimado: number;
      justificativa: string;
      equipamentoOrigemId?: string;
      origem?: OrigemCapex;
    },
  ) {
    return this.prisma.capexItem.create({
      data: {
        estabelecimentoId: user.estabelecimentoId,
        descricao: body.descricao,
        valorEstimado: body.valorEstimado,
        justificativa: body.justificativa,
        equipamentoOrigemId: body.equipamentoOrigemId,
        origem: body.origem ?? (body.equipamentoOrigemId ? OrigemCapex.SUBSTITUICAO : OrigemCapex.MANUAL),
      },
    });
  }

  async patchCapex(user: AuthUser, id: string, status: StatusCapex) {
    const row = await this.prisma.capexItem.findFirst({
      where: { id, estabelecimentoId: user.estabelecimentoId },
    });
    if (!row) throw new NotFoundException();
    return this.prisma.capexItem.update({ where: { id }, data: { status } });
  }
}
