import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { IndiceReajuste, SituacaoContrato } from "@prisma/client";
import { podeEditarCadastros } from "@nexo/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/current-user.decorator";

@Injectable()
export class ContratosService {
  constructor(private readonly prisma: PrismaService) {}

  private calcSituacao(vigenciaFim: Date): SituacaoContrato {
    const dias = (vigenciaFim.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (dias < 0) return SituacaoContrato.VENCIDO;
    if (dias <= 30) return SituacaoContrato.A_VENCER;
    return SituacaoContrato.VIGENTE;
  }

  private withExtras<T extends {
    id: string;
    valor: unknown;
    vigenciaFim: Date;
    equipamentos: unknown[];
    glosas: Array<{ valor: unknown }>;
  }>(c: T) {
    const n = c.equipamentos.length || 1;
    const valor = Number(c.valor);
    return {
      ...c,
      situacaoCalculada: this.calcSituacao(c.vigenciaFim),
      rateioPorEquipamento: Number((valor / n).toFixed(2)),
      totalGlosas: c.glosas.reduce((s, g) => s + Number(g.valor), 0),
      alertaSeveridade: this.alertaSeveridade(c.vigenciaFim),
    };
  }

  private alertaSeveridade(vigenciaFim: Date) {
    const dias = (vigenciaFim.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (dias < 0) return "VENCIDO";
    if (dias <= 30) return "30";
    if (dias <= 60) return "60";
    if (dias <= 90) return "90";
    return null;
  }

  async list(estabelecimentoId: string, situacao?: SituacaoContrato) {
    const rows = await this.prisma.contrato.findMany({
      where: { estabelecimentoId },
      include: {
        fornecedor: true,
        equipamentos: { include: { equipamento: true } },
        glosas: true,
      },
      orderBy: { vigenciaFim: "asc" },
    });
    const mapped = rows.map((c) => this.withExtras(c));
    if (!situacao) return mapped;
    return mapped.filter((c) => c.situacaoCalculada === situacao);
  }

  async create(
    user: AuthUser,
    data: {
      numero: string;
      fornecedorId: string;
      descricao: string;
      vigenciaInicio: string;
      vigenciaFim: string;
      valor: number;
      equipamentoTags?: string[];
      slaAtendimentoHoras?: number;
      slaSolucaoHoras?: number;
      indiceReajuste?: IndiceReajuste;
      dataReajusteAniversario?: string;
    },
  ) {
    if (!podeEditarCadastros(user.perfil)) throw new ForbiddenException();

    const eqs = data.equipamentoTags?.length
      ? await this.prisma.equipamento.findMany({
          where: {
            estabelecimentoId: user.estabelecimentoId,
            tag: { in: data.equipamentoTags },
          },
        })
      : [];

    const vigenciaFim = new Date(data.vigenciaFim);
    return this.prisma.contrato.create({
      data: {
        estabelecimentoId: user.estabelecimentoId,
        numero: data.numero.trim(),
        fornecedorId: data.fornecedorId,
        descricao: data.descricao.trim(),
        vigenciaInicio: new Date(data.vigenciaInicio),
        vigenciaFim,
        valor: data.valor,
        situacao: this.calcSituacao(vigenciaFim),
        slaAtendimentoHoras: data.slaAtendimentoHoras,
        slaSolucaoHoras: data.slaSolucaoHoras,
        indiceReajuste: data.indiceReajuste,
        dataReajusteAniversario: data.dataReajusteAniversario
          ? new Date(data.dataReajusteAniversario)
          : null,
        equipamentos: {
          create: eqs.map((e) => ({ equipamentoId: e.id })),
        },
      },
      include: {
        fornecedor: true,
        equipamentos: { include: { equipamento: true } },
        glosas: true,
      },
    });
  }

  async matrizCobertura(estabelecimentoId: string, numero: string) {
    const c = await this.prisma.contrato.findUnique({
      where: { estabelecimentoId_numero: { estabelecimentoId, numero } },
      include: {
        equipamentos: { include: { equipamento: { include: { setor: true } } } },
        glosas: true,
      },
    });
    if (!c) throw new NotFoundException();
    return this.withExtras(c);
  }

  async vencendo(estabelecimentoId: string, diasCsv = "90,60,30") {
    const diasList = diasCsv.split(",").map((d) => Number(d.trim())).filter(Boolean);
    const max = Math.max(...diasList, 90);
    const limite = new Date(Date.now() + max * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.contrato.findMany({
      where: {
        estabelecimentoId,
        vigenciaFim: { lte: limite },
      },
      include: {
        fornecedor: true,
        equipamentos: true,
        glosas: true,
      },
      orderBy: { vigenciaFim: "asc" },
    });
    return rows.map((c) => this.withExtras(c));
  }

  async addGlosa(
    user: AuthUser,
    numero: string,
    data: { data?: string; valor: number; motivo: string },
  ) {
    if (!podeEditarCadastros(user.perfil)) throw new ForbiddenException();
    const c = await this.prisma.contrato.findUnique({
      where: {
        estabelecimentoId_numero: {
          estabelecimentoId: user.estabelecimentoId,
          numero,
        },
      },
    });
    if (!c) throw new NotFoundException();
    return this.prisma.contratoGlosa.create({
      data: {
        contratoId: c.id,
        data: data.data ? new Date(data.data) : new Date(),
        valor: data.valor,
        motivo: data.motivo.trim(),
      },
    });
  }

  /** Rateio igualitário usado na Ficha Vida. */
  async rateioPorEquipamento(estabelecimentoId: string, equipamentoId: string) {
    const links = await this.prisma.contratoEquipamento.findMany({
      where: {
        equipamentoId,
        contrato: { estabelecimentoId },
      },
      include: {
        contrato: { include: { equipamentos: true, glosas: true } },
      },
    });

    return links.reduce((acc, link) => {
      const n = link.contrato.equipamentos.length || 1;
      const valor = Number(link.contrato.valor) / n;
      const glosas =
        link.contrato.glosas.reduce((s, g) => s + Number(g.valor), 0) / n;
      return acc + valor - glosas;
    }, 0);
  }
}
