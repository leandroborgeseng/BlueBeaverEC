import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { IndiceReajuste, SituacaoContrato, StatusOS } from "@prisma/client";
import { podeEditarCadastros } from "@aion/shared";
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
    slaAtendimentoHoras?: number | null;
    slaSolucaoHoras?: number | null;
    indiceReajuste?: IndiceReajuste | null;
    dataReajusteAniversario?: Date | null;
  }>(c: T) {
    const n = c.equipamentos.length || 1;
    const valor = Number(c.valor);
    return {
      ...c,
      situacaoCalculada: this.calcSituacao(c.vigenciaFim),
      rateioPorEquipamento: Number((valor / n).toFixed(2)),
      totalGlosas: c.glosas.reduce((s, g) => s + Number(g.valor), 0),
      alertaSeveridade: this.alertaSeveridade(c.vigenciaFim),
      alertaReajuste: this.alertaReajuste(c.dataReajusteAniversario ?? null),
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

  private alertaReajuste(data: Date | null) {
    if (!data) return null;
    const dias = (data.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (dias < -7) return null;
    if (dias < 0) return { dias: Math.ceil(dias), status: "VENCIDO" as const };
    if (dias <= 30) return { dias: Math.ceil(dias), status: "PROXIMO" as const };
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
    if (!podeEditarCadastros(user.perfil, user.permissoesModulos)) throw new ForbiddenException();

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
        fornecedor: true,
      },
    });
    if (!c) throw new NotFoundException();

    const eqIds = c.equipamentos.map((e) => e.equipamentoId);
    const osAbertas = eqIds.length
      ? await this.prisma.ordemServico.findMany({
          where: {
            estabelecimentoId,
            equipamentoId: { in: eqIds },
            status: { in: [StatusOS.NAO_ATRIBUIDA, StatusOS.ABERTA, StatusOS.EM_ANDAMENTO] },
          },
          select: {
            numero: true,
            codigo: true,
            abertura: true,
            prioridade: true,
            equipamentoId: true,
            equipamento: { select: { tag: true } },
          },
        })
      : [];

    const agora = Date.now();
    const slaHoras = c.slaAtendimentoHoras ?? 24;
    const osComSla = osAbertas.map((os) => {
      const horasAberto = (agora - os.abertura.getTime()) / (1000 * 60 * 60);
      const estourado = horasAberto > slaHoras;
      return {
        ...os,
        horasAberto: Number(horasAberto.toFixed(1)),
        slaAtendimentoHoras: slaHoras,
        slaEstourado: estourado,
      };
    });

    return {
      ...this.withExtras(c),
      cobertura: c.equipamentos.map((link) => ({
        tag: link.equipamento.tag,
        nome: link.equipamento.nome,
        setor: link.equipamento.setor?.nome ?? null,
        situacao: link.equipamento.situacao,
      })),
      osAbertas: osComSla,
      slaResumo: {
        atendimentoHoras: c.slaAtendimentoHoras,
        solucaoHoras: c.slaSolucaoHoras,
        osAbertas: osComSla.length,
        osSlaEstourado: osComSla.filter((o) => o.slaEstourado).length,
      },
    };
  }

  async alertas(estabelecimentoId: string) {
    const rows = await this.list(estabelecimentoId);
    const reajuste = rows.filter((c) => c.alertaReajuste);
    const vencimento = rows.filter((c) => c.alertaSeveridade);

    const comSla = rows.filter((c) => c.slaAtendimentoHoras);
    const slaEstourados: Array<{
      contratoNumero: string;
      osCodigo: string | null;
      osNumero: number;
      tag: string;
      horasAberto: number;
      slaHoras: number;
    }> = [];

    for (const c of comSla) {
      const eqIds = (c.equipamentos as Array<{ equipamentoId: string }>).map((e) => e.equipamentoId);

      if (!eqIds.length) continue;
      const os = await this.prisma.ordemServico.findMany({
        where: {
          estabelecimentoId,
          equipamentoId: { in: eqIds },
          status: { in: [StatusOS.NAO_ATRIBUIDA, StatusOS.ABERTA, StatusOS.EM_ANDAMENTO] },
        },
        include: { equipamento: { select: { tag: true } } },
      });
      const slaHoras = c.slaAtendimentoHoras ?? 24;
      const agora = Date.now();
      for (const o of os) {
        const horas = (agora - o.abertura.getTime()) / (1000 * 60 * 60);
        if (horas > slaHoras) {
          slaEstourados.push({
            contratoNumero: c.numero,
            osCodigo: o.codigo,
            osNumero: o.numero,
            tag: o.equipamento.tag,
            horasAberto: Number(horas.toFixed(1)),
            slaHoras,
          });
        }
      }
    }

    return { vencimento, reajuste, slaEstourados };
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
    if (!podeEditarCadastros(user.perfil, user.permissoesModulos)) throw new ForbiddenException();
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
