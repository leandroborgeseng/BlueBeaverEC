import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  IndiceReajuste,
  PeriodicidadeContrato,
  SituacaoContrato,
  StatusOS,
  TipoContrato,
} from "@prisma/client";
import {
  alertaVencimentoDias,
  podeEditarModulo,
  recusarContratoComoGarantia,
  situacaoVigencia,
} from "@aion/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/current-user.decorator";
import { parseAnexoDataUrl } from "../os/os-anexos";

@Injectable()
export class ContratosService {
  constructor(private readonly prisma: PrismaService) {}

  private calcSituacao(vigenciaFim: Date, diasAlerta = 30): SituacaoContrato {
    return situacaoVigencia(vigenciaFim, diasAlerta) as SituacaoContrato;
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
    diasAlertaVencimento?: number | null;
    tipo?: string;
  }>(c: T) {
    const n = c.equipamentos.length || 1;
    const valor = c.valor == null ? 0 : Number(c.valor);
    const diasAlerta = c.diasAlertaVencimento ?? 30;
    return {
      ...c,
      tipo: c.tipo ?? "MANUTENCAO",
      garantiaAquisicao: false,
      situacaoCalculada: this.calcSituacao(c.vigenciaFim, diasAlerta),
      rateioPorEquipamento: n ? Number((valor / n).toFixed(2)) : 0,
      totalGlosas: c.glosas.reduce((s, g) => s + Number(g.valor), 0),
      alertaSeveridade: alertaVencimentoDias(c.vigenciaFim),
      alertaReajuste: this.alertaReajuste(c.dataReajusteAniversario ?? null),
    };
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
      valor?: number | null;
      equipamentoTags?: string[];
      slaAtendimentoHoras?: number;
      slaSolucaoHoras?: number;
      indiceReajuste?: IndiceReajuste;
      dataReajusteAniversario?: string;
      tipo?: TipoContrato;
      periodicidade?: PeriodicidadeContrato;
      escopo?: string;
      exclusoes?: string;
      cobrePecas?: boolean;
      cobreServicos?: boolean;
      diasAlertaVencimento?: number;
      observacoes?: string;
    },
  ) {
    if (!podeEditarModulo(user.perfil, user.permissoesModulos, "contratos")) throw new ForbiddenException();
    const recusa = recusarContratoComoGarantia(data.tipo);
    if (recusa) throw new BadRequestException(recusa);

    const eqs = data.equipamentoTags?.length
      ? await this.prisma.equipamento.findMany({
          where: {
            estabelecimentoId: user.estabelecimentoId,
            tag: { in: data.equipamentoTags },
          },
        })
      : [];

    const vigenciaFim = new Date(data.vigenciaFim);
    const diasAlerta = data.diasAlertaVencimento ?? 30;
    return this.prisma.contrato.create({
      data: {
        estabelecimentoId: user.estabelecimentoId,
        numero: data.numero.trim(),
        fornecedorId: data.fornecedorId,
        descricao: data.descricao.trim(),
        tipo: data.tipo ?? TipoContrato.MANUTENCAO,
        vigenciaInicio: new Date(data.vigenciaInicio),
        vigenciaFim,
        valor: data.valor ?? null,
        periodicidade: data.periodicidade ?? null,
        situacao: this.calcSituacao(vigenciaFim, diasAlerta),
        slaAtendimentoHoras: data.slaAtendimentoHoras,
        slaSolucaoHoras: data.slaSolucaoHoras,
        indiceReajuste: data.indiceReajuste,
        dataReajusteAniversario: data.dataReajusteAniversario
          ? new Date(data.dataReajusteAniversario)
          : null,
        escopo: data.escopo?.trim() || null,
        exclusoes: data.exclusoes?.trim() || null,
        cobrePecas: Boolean(data.cobrePecas),
        cobreServicos: data.cobreServicos !== false,
        diasAlertaVencimento: diasAlerta,
        observacoes: data.observacoes?.trim() || null,
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

  async update(
    user: AuthUser,
    numero: string,
    data: {
      fornecedorId?: string;
      descricao?: string;
      vigenciaInicio?: string;
      vigenciaFim?: string;
      valor?: number | null;
      equipamentoTags?: string[];
      slaAtendimentoHoras?: number;
      slaSolucaoHoras?: number;
      indiceReajuste?: IndiceReajuste;
      dataReajusteAniversario?: string | null;
      situacao?: SituacaoContrato;
      tipo?: TipoContrato;
      periodicidade?: PeriodicidadeContrato | null;
      escopo?: string | null;
      exclusoes?: string | null;
      cobrePecas?: boolean;
      cobreServicos?: boolean;
      diasAlertaVencimento?: number;
      observacoes?: string | null;
    },
  ) {
    if (!podeEditarModulo(user.perfil, user.permissoesModulos, "contratos")) throw new ForbiddenException();
    if (data.tipo) {
      const recusa = recusarContratoComoGarantia(data.tipo);
      if (recusa) throw new BadRequestException(recusa);
    }
    const existing = await this.prisma.contrato.findUnique({
      where: { estabelecimentoId_numero: { estabelecimentoId: user.estabelecimentoId, numero } },
    });
    if (!existing) throw new NotFoundException("Contrato não encontrado");

    const vigenciaFim = data.vigenciaFim ? new Date(data.vigenciaFim) : existing.vigenciaFim;
    const diasAlerta = data.diasAlertaVencimento ?? existing.diasAlertaVencimento;
    const situacao = data.situacao ?? this.calcSituacao(vigenciaFim, diasAlerta);

    if (data.equipamentoTags) {
      const eqs = data.equipamentoTags.length
        ? await this.prisma.equipamento.findMany({
            where: {
              estabelecimentoId: user.estabelecimentoId,
              tag: { in: data.equipamentoTags },
            },
          })
        : [];
      await this.prisma.contratoEquipamento.deleteMany({ where: { contratoId: existing.id } });
      if (eqs.length) {
        await this.prisma.contratoEquipamento.createMany({
          data: eqs.map((e) => ({ contratoId: existing.id, equipamentoId: e.id })),
        });
      }
    }

    return this.prisma.contrato.update({
      where: { id: existing.id },
      data: {
        ...(data.fornecedorId ? { fornecedorId: data.fornecedorId } : {}),
        ...(data.descricao ? { descricao: data.descricao.trim() } : {}),
        ...(data.vigenciaInicio ? { vigenciaInicio: new Date(data.vigenciaInicio) } : {}),
        ...(data.vigenciaFim ? { vigenciaFim } : {}),
        ...(data.valor !== undefined ? { valor: data.valor } : {}),
        situacao,
        ...(data.slaAtendimentoHoras != null ? { slaAtendimentoHoras: data.slaAtendimentoHoras } : {}),
        ...(data.slaSolucaoHoras != null ? { slaSolucaoHoras: data.slaSolucaoHoras } : {}),
        ...(data.indiceReajuste ? { indiceReajuste: data.indiceReajuste } : {}),
        ...(data.dataReajusteAniversario !== undefined
          ? {
              dataReajusteAniversario: data.dataReajusteAniversario
                ? new Date(data.dataReajusteAniversario)
                : null,
            }
          : {}),
        ...(data.tipo ? { tipo: data.tipo } : {}),
        ...(data.periodicidade !== undefined ? { periodicidade: data.periodicidade } : {}),
        ...(data.escopo !== undefined ? { escopo: data.escopo?.trim() || null } : {}),
        ...(data.exclusoes !== undefined ? { exclusoes: data.exclusoes?.trim() || null } : {}),
        ...(data.cobrePecas !== undefined ? { cobrePecas: data.cobrePecas } : {}),
        ...(data.cobreServicos !== undefined ? { cobreServicos: data.cobreServicos } : {}),
        ...(data.diasAlertaVencimento != null ? { diasAlertaVencimento: data.diasAlertaVencimento } : {}),
        ...(data.observacoes !== undefined ? { observacoes: data.observacoes?.trim() || null } : {}),
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
            tag: o.equipamento?.tag ?? "—",
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
    if (!podeEditarModulo(user.perfil, user.permissoesModulos, "contratos")) throw new ForbiddenException();
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
      const valor = (link.contrato.valor == null ? 0 : Number(link.contrato.valor)) / n;
      const glosas =
        link.contrato.glosas.reduce((s, g) => s + Number(g.valor), 0) / n;
      return acc + valor - glosas;
    }, 0);
  }

  async get(estabelecimentoId: string, numero: string) {
    const c = await this.prisma.contrato.findUnique({
      where: { estabelecimentoId_numero: { estabelecimentoId, numero } },
      include: {
        fornecedor: true,
        equipamentos: { include: { equipamento: { include: { setor: true } } } },
        glosas: true,
        documentos: {
          select: { id: true, nomeArquivo: true, mimeType: true, descricao: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!c) throw new NotFoundException("Contrato não encontrado");
    return this.withExtras(c);
  }

  async addDocumento(
    user: AuthUser,
    numero: string,
    body: { dataUrl: string; nomeArquivo?: string; descricao?: string },
  ) {
    if (!podeEditarModulo(user.perfil, user.permissoesModulos, "contratos")) throw new ForbiddenException();
    const c = await this.prisma.contrato.findUnique({
      where: { estabelecimentoId_numero: { estabelecimentoId: user.estabelecimentoId, numero } },
    });
    if (!c) throw new NotFoundException();
    const parsed = parseAnexoDataUrl(body.dataUrl, body.nomeArquivo);
    return this.prisma.contratoDocumento.create({
      data: {
        contratoId: c.id,
        nomeArquivo: parsed.nomeArquivo,
        mimeType: parsed.mimeType,
        conteudo: parsed.buffer,
        descricao: body.descricao?.trim() || null,
        usuarioId: user.userId,
      },
      select: { id: true, nomeArquivo: true, mimeType: true, descricao: true, createdAt: true },
    });
  }

  async baixarDocumento(user: AuthUser, numero: string, docId: string) {
    const doc = await this.prisma.contratoDocumento.findFirst({
      where: {
        id: docId,
        contrato: { estabelecimentoId: user.estabelecimentoId, numero },
      },
    });
    if (!doc) throw new NotFoundException();
    return doc;
  }

  async coberturaDoEquipamento(estabelecimentoId: string, equipamentoId: string) {
    const eq = await this.prisma.equipamento.findFirst({
      where: { id: equipamentoId, estabelecimentoId },
      select: { garantiaInicio: true, garantiaFim: true, tag: true, nome: true },
    });
    const contratos = await this.prisma.contratoEquipamento.findMany({
      where: { equipamentoId, contrato: { estabelecimentoId } },
      include: {
        contrato: {
          include: { fornecedor: { select: { id: true, nome: true } } },
        },
      },
    });
    const agora = Date.now();
    return {
      garantiaAquisicao: {
        fonte: "GARANTIA_AQUISICAO" as const,
        vigente: Boolean(eq?.garantiaFim && eq.garantiaFim.getTime() >= agora),
        inicio: eq?.garantiaInicio ?? null,
        fim: eq?.garantiaFim ?? null,
      },
      contratosManutencao: contratos.map((l) => ({
        fonte: "CONTRATO_MANUTENCAO" as const,
        id: l.contrato.id,
        numero: l.contrato.numero,
        tipo: l.contrato.tipo,
        fornecedor: l.contrato.fornecedor.nome,
        vigenciaFim: l.contrato.vigenciaFim,
        vigente: l.contrato.vigenciaFim.getTime() >= agora,
        cobrePecas: l.contrato.cobrePecas,
        cobreServicos: l.contrato.cobreServicos,
        escopo: l.contrato.escopo,
        exclusoes: l.contrato.exclusoes,
        situacao: this.calcSituacao(l.contrato.vigenciaFim, l.contrato.diasAlertaVencimento),
      })),
    };
  }
}
