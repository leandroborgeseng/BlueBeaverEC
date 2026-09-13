import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  CondicaoUsoEquipamento,
  PrioridadeOS,
  Prisma,
  ResultadoLaudo,
  StatusOS,
  TipoLaudo,
  TipoOS,
  VisibilidadeOs,
} from "@prisma/client";
import {
  PERMISSAO_NIVEL,
  SLA_HORAS,
  podeAlterarStatusOS,
  podeAtribuirOS,
  podeExecutarAcaoStatusOS,
  temPermissao,
  type AcaoStatusOS,
  type PrioridadeOS as PrioridadeShared,
} from "@aion/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/current-user.decorator";
import { colaboradorPodeReceberOS, listarResponsaveisAtribuiveis } from "../pessoas/responsaveis-os";
import { parseAnexoDataUrl } from "./os-anexos";
import { atribuicaoConflitou, transicaoStatusOS } from "./os-transicoes";
import { ehSolicitante, filtrarTimeline, visibilidadeLog } from "./os-visibilidade";

const STATUS_ATIVAS: StatusOS[] = [
  StatusOS.NAO_ATRIBUIDA,
  StatusOS.ABERTA,
  StatusOS.EM_ANDAMENTO,
  StatusOS.AGUARDANDO,
];

const TIPOS_OS_EXIGEM_LAUDO: TipoOS[] = [
  TipoOS.PREVENTIVA,
  TipoOS.CALIBRACAO,
  TipoOS.TSE,
  TipoOS.QUALIFICACAO,
];

const RESULTADOS_LAUDO_OK: ResultadoLaudo[] = [
  ResultadoLaudo.APROVADO,
  ResultadoLaudo.APROVADO_COM_RESSALVAS,
];

@Injectable()
export class OsService {
  constructor(private readonly prisma: PrismaService) {}

  private isAtrasada(prioridade: PrioridadeOS, abertura: Date, fechamento: Date | null, status: StatusOS) {
    if (fechamento || status === StatusOS.CANCELADA || status === StatusOS.CONCLUIDA) {
      return false;
    }
    const horas = SLA_HORAS[prioridade as PrioridadeShared];
    const limite = new Date(abertura.getTime() + horas * 60 * 60 * 1000);
    return Date.now() > limite.getTime();
  }

  async list(
    estabelecimentoId: string,
    query: {
      situacao?: StatusOS;
      prioridade?: PrioridadeOS;
      q?: string;
      setor?: string;
      oficina?: string;
      atrasada?: boolean;
      responsavelId?: string;
      equipamento?: string;
      de?: string;
      ate?: string;
      fila?: "nao-atribuidas" | "minhas" | "do-outro" | "em-atendimento" | "aguardando";
      colaboradorId?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
    const q = query.q?.trim();
    const where: Prisma.OrdemServicoWhereInput = {
      estabelecimentoId,
      ...(query.situacao ? { status: query.situacao } : {}),
      ...(query.prioridade ? { prioridade: query.prioridade } : {}),
      ...(query.oficina ? { oficina: { contains: query.oficina, mode: "insensitive" } } : {}),
      ...(query.responsavelId ? { responsavelId: query.responsavelId } : {}),
      ...(q
        ? {
            OR: [
              { codigo: { contains: q, mode: "insensitive" } },
              { solicitacao: { protocolo: { contains: q, mode: "insensitive" } } },
              { equipamento: { tag: { contains: q, mode: "insensitive" } } },
              { equipamento: { nome: { contains: q, mode: "insensitive" } } },
              { equipamento: { patrimonio: { contains: q, mode: "insensitive" } } },
              { equipamento: { nSerie: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    if (query.setor) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        {
          OR: [
            { setor: { nome: { contains: query.setor, mode: "insensitive" } } },
            { equipamento: { setor: { nome: { contains: query.setor, mode: "insensitive" } } } },
          ],
        },
      ];
    }

    if (query.equipamento?.trim()) {
      const eq = query.equipamento.trim();
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        {
          OR: [
            { equipamento: { tag: { contains: eq, mode: "insensitive" } } },
            { equipamento: { nome: { contains: eq, mode: "insensitive" } } },
            { equipamento: { patrimonio: { contains: eq, mode: "insensitive" } } },
            { equipamento: { nSerie: { contains: eq, mode: "insensitive" } } },
          ],
        },
      ];
    }

    if (query.de || query.ate) {
      where.abertura = {
        ...(query.de ? { gte: new Date(query.de) } : {}),
        ...(query.ate ? { lte: new Date(`${query.ate}T23:59:59.999`) } : {}),
      };
    }

    if (query.fila === "nao-atribuidas") {
      where.status = StatusOS.NAO_ATRIBUIDA;
      where.responsavelId = null;
    } else if (query.fila === "em-atendimento") {
      where.status = StatusOS.EM_ANDAMENTO;
    } else if (query.fila === "aguardando") {
      where.status = StatusOS.AGUARDANDO;
    } else if (query.fila === "minhas" && query.colaboradorId) {
      where.responsavelId = query.colaboradorId;
      where.status = { in: STATUS_ATIVAS };
    } else if (query.fila === "do-outro" && query.colaboradorId) {
      where.responsavelId = { not: query.colaboradorId };
      where.status = { in: STATUS_ATIVAS };
    }

    if (query.atrasada === true) {
      const now = Date.now();
      const slaOr = (Object.entries(SLA_HORAS) as Array<[PrioridadeShared, number]>).map(
        ([prioridade, horas]) => ({
          prioridade: prioridade as PrioridadeOS,
          abertura: { lt: new Date(now - horas * 60 * 60 * 1000) },
        }),
      );
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        { fechamento: null },
        { status: { notIn: [StatusOS.CANCELADA, StatusOS.CONCLUIDA] } },
        { OR: slaOr },
      ];
    }

    const [total, rows] = await Promise.all([
      this.prisma.ordemServico.count({ where }),
      this.prisma.ordemServico.findMany({
        where,
        include: {
          equipamento: { include: { setor: true, descricao: true } },
          setor: true,
          responsavel: true,
          solicitacao: { select: { protocolo: true, solicitanteNome: true } },
        },
        orderBy: [{ prioridade: "desc" }, { abertura: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const items = rows.map((os) => this.decorateListItem(os));

    return {
      items,
      total,
      page,
      pageSize,
    };
  }

  async getByNumero(estabelecimentoId: string, numero: number, perfil?: string) {
    const os = await this.prisma.ordemServico.findUnique({
      where: { estabelecimentoId_numero: { estabelecimentoId, numero } },
      include: {
        equipamento: {
          include: { setor: true, descricao: true, fabricante: true, modelo: true },
        },
        setor: true,
        responsavel: true,
        itens: { include: { estoqueItem: true } },
        solicitacao: true,
        logs: {
          include: { usuario: { select: { nome: true, email: true } } },
          orderBy: { createdAt: "desc" },
          take: 80,
        },
        comentarios: {
          include: { usuario: { select: { nome: true } } },
          orderBy: { createdAt: "desc" },
          take: 80,
        },
        anexos: {
          select: {
            id: true,
            nomeArquivo: true,
            mimeType: true,
            visibilidade: true,
            createdAt: true,
            usuario: { select: { nome: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!os) throw new NotFoundException(`OS ${numero} não encontrada`);
    const logs = filtrarTimeline(os.logs, perfil);
    const comentarios = filtrarTimeline(os.comentarios, perfil);
    const anexos = filtrarTimeline(os.anexos, perfil);
    const timeline = filtrarTimeline(
      [
        ...logs.map((l) => ({
          id: `log-${l.id}`,
          tipo: "LOG" as const,
          acao: l.acao,
          texto: l.justificativa,
          visibilidade: l.visibilidade,
          createdAt: l.createdAt,
          autor: l.usuario?.nome ?? null,
        })),
        ...comentarios.map((c) => ({
          id: `com-${c.id}`,
          tipo: "COMENTARIO" as const,
          acao: "COMENTARIO",
          texto: c.texto,
          visibilidade: c.visibilidade,
          createdAt: c.createdAt,
          autor: c.usuario?.nome ?? null,
        })),
        ...anexos.map((a) => ({
          id: `anx-${a.id}`,
          tipo: "ANEXO" as const,
          acao: "ANEXO",
          texto: a.nomeArquivo,
          visibilidade: a.visibilidade,
          createdAt: a.createdAt,
          autor: a.usuario?.nome ?? null,
        })),
      ],
      perfil,
    ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return {
      ...os,
      logs,
      comentarios,
      anexos,
      timeline,
      equipamento: this.equipamentoExibicao(os),
      atrasada: this.isAtrasada(os.prioridade, os.abertura, os.fechamento, os.status),
      condicaoUsoAtual: os.equipamento && "condicaoUso" in os.equipamento ? os.equipamento.condicaoUso : null,
    };
  }

  async updatePendencia(user: AuthUser, numero: number, pendencia: string | null) {
    if (!podeAlterarStatusOS(user.perfil)) {
      throw new ForbiddenException("Sem permissão para alterar pendência");
    }
    const os = await this.findByNumero(user.estabelecimentoId, numero);
    return this.prisma.ordemServico.update({
      where: { id: os.id },
      data: { pendencia: pendencia?.trim() || null },
    });
  }

  async naoAtribuidas(estabelecimentoId: string) {
    const rows = await this.prisma.ordemServico.findMany({
      where: { estabelecimentoId, status: StatusOS.NAO_ATRIBUIDA },
      include: { equipamento: { include: { setor: true } }, setor: true },
      orderBy: [{ prioridade: "desc" }, { abertura: "asc" }],
    });
    return rows.map((os) => this.decorateListItem(os));
  }

  async ativasDoEquipamento(estabelecimentoId: string, tag: string) {
    return this.prisma.ordemServico.findMany({
      where: {
        estabelecimentoId,
        equipamento: { tag },
        status: { in: STATUS_ATIVAS },
      },
      select: { numero: true, status: true, prioridade: true },
    });
  }

  async log(estabelecimentoId: string, numero: number, perfil?: string) {
    const os = await this.findByNumero(estabelecimentoId, numero);
    const rows = await this.prisma.logOrdemServico.findMany({
      where: { ordemServicoId: os.id },
      include: { usuario: { select: { nome: true, email: true } } },
      orderBy: { createdAt: "desc" },
    });
    return filtrarTimeline(rows, perfil);
  }

  async auditoria(
    estabelecimentoId: string,
    filtros: { acao?: string; numero?: number } = {},
  ) {
    return this.prisma.logOrdemServico.findMany({
      where: {
        ordemServico: {
          estabelecimentoId,
          ...(filtros.numero ? { numero: filtros.numero } : {}),
        },
        ...(filtros.acao ? { acao: filtros.acao } : {}),
      },
      include: {
        usuario: { select: { nome: true, email: true } },
        ordemServico: { select: { numero: true, codigo: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  async create(
    user: AuthUser,
    data: {
      equipamentoTag: string;
      tipo?: TipoOS;
      prioridade?: PrioridadeOS;
      oficina?: string;
      observacaoRequisicao?: string;
      pendencia?: string;
      responsavelId?: string;
      solicitacaoId?: string;
      pecas?: Array<{ itemCodigo: string; qtd: number }>;
      maoDeObra?: { descricao: string; horas: number; valorHora?: number };
      deslocamentoKm?: number;
      servicoExecutado?: string;
    },
  ) {
    const equipamento = await this.prisma.equipamento.findUnique({
      where: {
        estabelecimentoId_tag: {
          estabelecimentoId: user.estabelecimentoId,
          tag: data.equipamentoTag,
        },
      },
      include: { descricao: true },
    });
    if (!equipamento) {
      throw new NotFoundException("Equipamento não encontrado");
    }

    const ativas = await this.ativasDoEquipamento(user.estabelecimentoId, data.equipamentoTag);
    const avisoDuplicidade =
      ativas.length > 0
        ? `Já existe OS #${ativas.map((a) => a.numero).join(", ")} em aberto para este equipamento`
        : null;

    const alertaCriticoUrgente =
      data.prioridade === PrioridadeOS.URGENTE && equipamento.descricao.criticidade === "ALTA"
        ? "Prioridade URGENTE em equipamento de criticidade ALTA"
        : null;

    if (data.responsavelId) {
      await this.assertResponsavelAtribuivel(user.estabelecimentoId, data.responsavelId);
    }

    const numero = await this.nextNumero(user.estabelecimentoId);
    const status = data.responsavelId ? StatusOS.ABERTA : StatusOS.NAO_ATRIBUIDA;

    const os = await this.prisma.$transaction(async (tx) => {
      const created = await tx.ordemServico.create({
        data: {
          estabelecimentoId: user.estabelecimentoId,
          numero,
          codigo: `OS-${String(numero).padStart(5, "0")}`,
          equipamentoId: equipamento.id,
          setorId: equipamento.setorId,
          tipo: data.tipo ?? TipoOS.CORRETIVA,
          prioridade: data.prioridade ?? PrioridadeOS.MEDIA,
          oficina: data.oficina,
          observacaoRequisicao: data.observacaoRequisicao,
          pendencia: data.pendencia,
          responsavelId: data.responsavelId,
          solicitacaoId: data.solicitacaoId,
          status,
          logs: {
            create: {
              usuarioId: user.userId,
              acao: "ABERTURA",
            },
          },
        },
        include: { equipamento: true, responsavel: true },
      });

      for (const peca of data.pecas ?? []) {
        const item = await tx.estoqueItem.findUnique({
          where: {
            estabelecimentoId_codigo: {
              estabelecimentoId: user.estabelecimentoId,
              codigo: peca.itemCodigo,
            },
          },
        });
        if (!item) {
          throw new NotFoundException(`Peça ${peca.itemCodigo} não encontrada no estoque`);
        }
        await tx.ordemServicoItem.create({
          data: {
            ordemServicoId: created.id,
            tipo: "MATERIAL",
            descricao: item.descricao,
            quantidade: peca.qtd,
            valorUnitario: item.valorUnitario,
            estoqueItemId: item.id,
          },
        });
        await tx.estoqueReserva.create({
          data: {
            estoqueItemId: item.id,
            ordemServicoId: created.id,
            quantidade: peca.qtd,
            ativa: true,
          },
        });
      }

      if (data.maoDeObra?.descricao) {
        await tx.ordemServicoItem.create({
          data: {
            ordemServicoId: created.id,
            tipo: "MAO_DE_OBRA",
            descricao: data.maoDeObra.descricao,
            quantidade: data.maoDeObra.horas || 1,
            valorUnitario: data.maoDeObra.valorHora ?? 0,
          },
        });
      }

      if (data.deslocamentoKm && data.deslocamentoKm > 0) {
        await tx.ordemServicoItem.create({
          data: {
            ordemServicoId: created.id,
            tipo: "MAO_DE_OBRA",
            descricao: `Deslocamento ${data.deslocamentoKm} km`,
            quantidade: data.deslocamentoKm,
            valorUnitario: 0,
          },
        });
      }

      if (data.servicoExecutado) {
        await tx.logOrdemServico.create({
          data: {
            ordemServicoId: created.id,
            usuarioId: user.userId,
            acao: "SERVICO_EXECUTADO",
            justificativa: data.servicoExecutado,
          },
        });
      }

      return created;
    });

    return { ...os, avisoDuplicidade, alertaCriticoUrgente };
  }

  /** Abertura + execução em um passo (§4.3). */
  async rapida(
    user: AuthUser,
    data: {
      equipamentoTag: string;
      tipo?: TipoOS;
      prioridade?: PrioridadeOS;
      oficina?: string;
      observacaoRequisicao?: string;
      responsavelId?: string;
      pecas?: Array<{ itemCodigo: string; qtd: number }>;
      maoDeObra?: { descricao: string; horas: number; valorHora?: number };
      deslocamentoKm?: number;
      servicoExecutado?: string;
      resultadoAtendimento?: string;
      condicaoFinal?: CondicaoUsoEquipamento;
      fechar?: boolean;
    },
  ) {
    const created = await this.create(user, {
      ...data,
      responsavelId: data.responsavelId,
    });

    if (data.fechar) {
      if (!data.responsavelId) {
        throw new BadRequestException("Informe responsável para fechar a OS Rápida");
      }
      if (!data.servicoExecutado?.trim()) {
        throw new BadRequestException("Informe o serviço realizado para fechar a OS Rápida");
      }
      if (!data.resultadoAtendimento?.trim()) {
        throw new BadRequestException("Informe o resultado do atendimento para fechar a OS Rápida");
      }
      if (!data.condicaoFinal) {
        throw new BadRequestException("Informe a condição final do equipamento — a OS não marca apto sozinha");
      }
      const fechada = await this.changeStatus(user, created.numero, "fechar", {
        justificativa: data.servicoExecutado,
        servicoRealizado: data.servicoExecutado,
        resultadoAtendimento: data.resultadoAtendimento,
        condicaoFinal: data.condicaoFinal,
        textoConclusaoPublico: data.servicoExecutado,
      });
      return { ...fechada, avisoDuplicidade: created.avisoDuplicidade, alertaCriticoUrgente: created.alertaCriticoUrgente, fechada: true };
    }

    return { ...created, fechada: false };
  }

  async responsaveis(user: AuthUser) {
    return listarResponsaveisAtribuiveis(this.prisma, user.estabelecimentoId);
  }

  async atribuir(
    user: AuthUser,
    numero: number,
    opts: {
      responsavelId: string;
      expectedResponsavelId?: string | null;
      expectedVersao?: number;
    },
  ) {
    if (!podeAtribuirOS(user.perfil, user.permissoesModulos)) {
      throw new ForbiddenException("Sem permissão para atribuir OS");
    }
    await this.assertResponsavelAtribuivel(user.estabelecimentoId, opts.responsavelId);
    const os = await this.findByNumero(user.estabelecimentoId, numero);
    if (
      atribuicaoConflitou({
        atualResponsavelId: os.responsavelId,
        expectedResponsavelId: opts.expectedResponsavelId,
        atualVersao: os.atribuicaoVersao,
        expectedVersao: opts.expectedVersao,
      })
    ) {
      throw new ConflictException(
        "Esta OS já foi atribuída por outra pessoa. Atualize a tela e tente de novo.",
      );
    }

    const where: Prisma.OrdemServicoWhereInput = {
      id: os.id,
      ...(opts.expectedVersao != null ? { atribuicaoVersao: opts.expectedVersao } : {}),
      ...(opts.expectedResponsavelId !== undefined
        ? { responsavelId: opts.expectedResponsavelId }
        : {}),
    };

    const updated = await this.prisma.ordemServico.updateMany({
      where,
      data: {
        responsavelId: opts.responsavelId,
        status: os.status === StatusOS.NAO_ATRIBUIDA ? StatusOS.ABERTA : os.status,
        atribuicaoVersao: { increment: 1 },
      },
    });
    if (updated.count === 0) {
      throw new ConflictException(
        "Esta OS já foi atribuída por outra pessoa. Atualize a tela e tente de novo.",
      );
    }

    await this.prisma.logOrdemServico.create({
      data: {
        ordemServicoId: os.id,
        usuarioId: user.userId,
        acao: os.responsavelId && os.responsavelId !== opts.responsavelId ? "TRANSFERENCIA" : "ATRIBUICAO",
        visibilidade: VisibilidadeOs.PUBLICO,
      },
    });

    return this.findByNumero(user.estabelecimentoId, numero);
  }

  async assumir(user: AuthUser, numero: number, expected?: { expectedResponsavelId?: string | null; expectedVersao?: number }) {
    const colab = await this.colaboradorDoUsuario(user);
    if (!colab) throw new ForbiddenException("Seu usuário não está vinculado como colaborador");
    return this.atribuir(user, numero, {
      responsavelId: colab.id,
      expectedResponsavelId: expected?.expectedResponsavelId ?? null,
      expectedVersao: expected?.expectedVersao,
    });
  }

  /**
   * Preventiva/calibração/TSE/QLF só fecham com laudo aprovado vinculado (osNumero)
   * ou override de engenheiro com justificativa.
   */
  async assertLaudoAprovadoParaFechar(
    user: AuthUser,
    os: { numero: number; tipo: TipoOS; equipamentoId: string | null },
    justificativa?: string,
  ) {
    if (!TIPOS_OS_EXIGEM_LAUDO.includes(os.tipo)) return;
    if (!os.equipamentoId) return;

    const tipoLaudo = os.tipo as unknown as TipoLaudo;
    const laudo = await this.prisma.laudo.findFirst({
      where: {
        estabelecimentoId: user.estabelecimentoId,
        equipamentoId: os.equipamentoId,
        tipo: tipoLaudo,
        osNumero: os.numero,
        resultado: { in: RESULTADOS_LAUDO_OK },
      },
      select: { id: true, numero: true },
    });
    if (laudo) return;

    const podeOverride =
      Boolean(justificativa?.trim()) &&
      temPermissao(user.permissoesModulos, "os", PERMISSAO_NIVEL.EDICAO_APROVACAO);
    if (podeOverride) return;

    throw new ConflictException(
      `Não é possível fechar OS ${os.tipo} sem laudo aprovado vinculado (nº OS ${os.numero}). ` +
        "Engenheiro pode justificar o override.",
    );
  }

  async changeStatus(
    user: AuthUser,
    numero: number,
    acao: AcaoStatusOS,
    opts: {
      justificativa?: string;
      servicoRealizado?: string;
      resultadoAtendimento?: string;
      condicaoFinal?: CondicaoUsoEquipamento;
      textoConclusaoPublico?: string;
      diagnostico?: string;
    } = {},
  ) {
    if (!podeExecutarAcaoStatusOS(user.perfil, acao, user.permissoesModulos)) {
      throw new ForbiddenException("Sem permissão para alterar o status desta OS");
    }

    const os = await this.findByNumero(user.estabelecimentoId, numero);
    let responsavelId = os.responsavelId;
    if ((acao === "iniciar" || acao === "fechar") && !responsavelId) {
      const colab = await this.colaboradorDoUsuario(user);
      if (!colab) {
        throw new ForbiddenException("Seu usuário não está vinculado como colaborador para assumir a OS");
      }
      responsavelId = colab.id;
    }
    const trans = transicaoStatusOS(os.status, acao, Boolean(responsavelId));
    if (!trans.ok) throw new ConflictException(trans.erro);

    if (acao === "aguardar" && !opts.justificativa?.trim()) {
      throw new BadRequestException("Informe o motivo do aguardo");
    }

    if (acao === "fechar") {
      if (os.pendencia?.trim()) {
        throw new ConflictException("Não é possível fechar OS com pendência aberta");
      }
      const servico = opts.servicoRealizado?.trim() || os.servicoRealizado?.trim();
      const resultado = opts.resultadoAtendimento?.trim() || os.resultadoAtendimento?.trim();
      const condicao = opts.condicaoFinal ?? os.condicaoFinal;
      if (!servico) throw new BadRequestException("Informe o serviço realizado");
      if (!resultado) throw new BadRequestException("Informe o resultado do atendimento");
      if (!condicao) throw new BadRequestException("Informe a condição final do equipamento");
      await this.assertLaudoAprovadoParaFechar(user, os, opts.justificativa);
      const textoPublico =
        opts.textoConclusaoPublico?.trim() ||
        `Serviço realizado: ${servico}\nResultado: ${resultado}`;

      return this.prisma.$transaction(async (tx) => {
        const reservas = await tx.estoqueReserva.findMany({
          where: { ordemServicoId: os.id, ativa: true },
        });
        for (const r of reservas) {
          await tx.estoqueItem.update({
            where: { id: r.estoqueItemId },
            data: { qtdAtual: { decrement: r.quantidade } },
          });
        }
        await tx.estoqueReserva.updateMany({
          where: { ordemServicoId: os.id, ativa: true },
          data: { ativa: false },
        });
        if (os.equipamentoId) {
          await tx.equipamento.update({
            where: { id: os.equipamentoId },
            data: { condicaoUso: condicao },
          });
        }
        return tx.ordemServico.update({
          where: { id: os.id },
          data: {
            status: StatusOS.CONCLUIDA,
            fechamento: new Date(),
            motivoAguardo: null,
            servicoRealizado: servico,
            resultadoAtendimento: resultado,
            condicaoFinal: condicao,
            diagnostico: opts.diagnostico?.trim() || os.diagnostico,
            textoConclusaoPublico: textoPublico,
            ...(responsavelId && !os.responsavelId
              ? { responsavelId, atribuicaoVersao: { increment: 1 } }
              : {}),
            pedidoReaberturaJustificativa: null,
            pedidoReaberturaEm: null,
            pedidoReaberturaPorId: null,
            logs: {
              create: {
                usuarioId: user.userId,
                acao: "FECHAMENTO",
                justificativa: textoPublico,
                visibilidade: VisibilidadeOs.PUBLICO,
              },
            },
          },
        });
      });
    }

    if (acao === "cancelar") {
      if (!opts.justificativa?.trim()) {
        throw new BadRequestException("Justificativa obrigatória para cancelar");
      }
      return this.prisma.$transaction(async (tx) => {
        await tx.estoqueReserva.updateMany({
          where: { ordemServicoId: os.id, ativa: true },
          data: { ativa: false },
        });
        return tx.ordemServico.update({
          where: { id: os.id },
          data: {
            status: StatusOS.CANCELADA,
            fechamento: new Date(),
            logs: {
              create: {
                usuarioId: user.userId,
                acao: "CANCELAMENTO",
                justificativa: opts.justificativa!.trim(),
                visibilidade: VisibilidadeOs.PUBLICO,
              },
            },
          },
        });
      });
    }

    if (acao === "reabrir") {
      if (!opts.justificativa?.trim()) {
        throw new BadRequestException("Justificativa obrigatória para reabrir");
      }
      const snapshot = JSON.stringify({
        status: os.status,
        fechamento: os.fechamento,
        servicoRealizado: os.servicoRealizado,
        resultadoAtendimento: os.resultadoAtendimento,
        condicaoFinal: os.condicaoFinal,
        textoConclusaoPublico: os.textoConclusaoPublico,
        em: new Date().toISOString(),
      });
      return this.prisma.ordemServico.update({
        where: { id: os.id },
        data: {
          status: trans.proximo as StatusOS,
          fechamento: null,
          conclusaoSnapshot: snapshot,
          pedidoReaberturaJustificativa: null,
          pedidoReaberturaEm: null,
          pedidoReaberturaPorId: null,
          logs: {
            create: {
              usuarioId: user.userId,
              acao: "REABERTURA",
              justificativa: opts.justificativa.trim(),
              visibilidade: VisibilidadeOs.PUBLICO,
            },
          },
        },
      });
    }

    const acaoLog =
      acao === "iniciar"
        ? "INICIO_EXECUCAO"
        : acao === "pausar"
          ? "PAUSA"
          : acao === "aguardar"
            ? "AGUARDO"
            : "RETOMADA";

    return this.prisma.ordemServico.update({
      where: { id: os.id },
      data: {
        status: trans.proximo as StatusOS,
        motivoAguardo: acao === "aguardar" ? opts.justificativa!.trim() : acao === "retomar" ? null : os.motivoAguardo,
        ...(responsavelId && !os.responsavelId
          ? { responsavelId, atribuicaoVersao: { increment: 1 } }
          : {}),
        logs: {
          create: {
            usuarioId: user.userId,
            acao: acaoLog,
            justificativa:
              acao === "iniciar" && !os.responsavelId
                ? "Atendimento iniciado e OS assumida"
                : opts.justificativa,
            visibilidade: VisibilidadeOs.PUBLICO,
          },
        },
      },
    });
  }

  async minhasOs(estabelecimentoId: string, tecnicoColaboradorId: string) {
    const rows = await this.prisma.ordemServico.findMany({
      where: {
        estabelecimentoId,
        responsavelId: tecnicoColaboradorId,
        status: { in: STATUS_ATIVAS },
      },
      include: { equipamento: { include: { setor: true } } },
      orderBy: [{ prioridade: "desc" }, { abertura: "asc" }],
    });
    return rows.map((os) => ({
      ...os,
      atrasada: this.isAtrasada(os.prioridade, os.abertura, os.fechamento, os.status),
    }));
  }

  async comentar(
    user: AuthUser,
    numero: number,
    texto: string,
    visibilidade: VisibilidadeOs = VisibilidadeOs.PUBLICO,
  ) {
    if (!texto?.trim()) throw new BadRequestException("Escreva uma mensagem");
    const os = await this.findByNumero(user.estabelecimentoId, numero);
    const vis = ehSolicitante(user.perfil) ? VisibilidadeOs.PUBLICO : visibilidade;
    return this.prisma.osComentario.create({
      data: {
        ordemServicoId: os.id,
        usuarioId: user.userId,
        texto: texto.trim(),
        visibilidade: vis,
      },
      include: { usuario: { select: { nome: true } } },
    });
  }

  async anexar(
    user: AuthUser,
    numero: number,
    data: { dataUrl: string; nomeArquivo?: string; visibilidade?: VisibilidadeOs },
  ) {
    const os = await this.findByNumero(user.estabelecimentoId, numero);
    const parsed = parseAnexoDataUrl(data.dataUrl, data.nomeArquivo);
    const vis = ehSolicitante(user.perfil)
      ? VisibilidadeOs.PUBLICO
      : (data.visibilidade ?? VisibilidadeOs.PUBLICO);
    const row = await this.prisma.osAnexo.create({
      data: {
        ordemServicoId: os.id,
        usuarioId: user.userId,
        nomeArquivo: parsed.nomeArquivo,
        mimeType: parsed.mimeType,
        conteudo: parsed.buffer,
        visibilidade: vis,
      },
    });
    await this.prisma.logOrdemServico.create({
      data: {
        ordemServicoId: os.id,
        usuarioId: user.userId,
        acao: "ANEXO",
        justificativa: parsed.nomeArquivo,
        visibilidade: vis,
      },
    });
    return {
      id: row.id,
      nomeArquivo: row.nomeArquivo,
      mimeType: row.mimeType,
      visibilidade: row.visibilidade,
      createdAt: row.createdAt,
    };
  }

  async baixarAnexo(user: AuthUser, numero: number, anexoId: string) {
    const os = await this.findByNumero(user.estabelecimentoId, numero);
    const anexo = await this.prisma.osAnexo.findFirst({
      where: { id: anexoId, ordemServicoId: os.id },
    });
    if (!anexo) throw new NotFoundException("Anexo não encontrado");
    if (ehSolicitante(user.perfil) && anexo.visibilidade === VisibilidadeOs.INTERNO) {
      throw new ForbiddenException("Anexo interno");
    }
    return anexo;
  }

  async pedirReabertura(user: AuthUser, numero: number, justificativa: string) {
    if (!justificativa?.trim()) {
      throw new BadRequestException("Informe o motivo do pedido de reabertura");
    }
    const os = await this.findByNumero(user.estabelecimentoId, numero);
    if (os.status !== StatusOS.CONCLUIDA) {
      throw new ConflictException("Só é possível pedir reabertura de OS concluída");
    }
    await this.assertPodeVerComoSolicitante(user, os);
    const updated = await this.prisma.ordemServico.update({
      where: { id: os.id },
      data: {
        pedidoReaberturaJustificativa: justificativa.trim(),
        pedidoReaberturaEm: new Date(),
        pedidoReaberturaPorId: user.userId,
        logs: {
          create: {
            usuarioId: user.userId,
            acao: "PEDIDO_REABERTURA",
            justificativa: justificativa.trim(),
            visibilidade: VisibilidadeOs.PUBLICO,
          },
        },
      },
    });
    return updated;
  }

  async vincularEquipamento(user: AuthUser, numero: number, equipamentoTag: string) {
    if (!podeAtribuirOS(user.perfil, user.permissoesModulos)) {
      throw new ForbiddenException("Sem permissão para identificar o equipamento");
    }
    const os = await this.findByNumero(user.estabelecimentoId, numero);
    const eq = await this.prisma.equipamento.findFirst({
      where: {
        estabelecimentoId: user.estabelecimentoId,
        tag: { equals: equipamentoTag.trim(), mode: "insensitive" },
      },
    });
    if (!eq) throw new NotFoundException("Equipamento não encontrado");
    return this.prisma.ordemServico.update({
      where: { id: os.id },
      data: {
        equipamentoId: eq.id,
        setorId: eq.setorId,
        identificacaoPendente: false,
        logs: {
          create: {
            usuarioId: user.userId,
            acao: "IDENTIFICACAO_EQUIPAMENTO",
            justificativa: eq.tag,
            visibilidade: VisibilidadeOs.PUBLICO,
          },
        },
      },
    });
  }

  async atualizarExecucao(
    user: AuthUser,
    numero: number,
    data: {
      diagnostico?: string;
      servicoRealizado?: string;
      resultadoAtendimento?: string;
      pendencia?: string | null;
      itens?: Array<{ tipo?: "MATERIAL" | "MAO_DE_OBRA"; descricao: string; quantidade?: number }>;
    },
  ) {
    if (!podeAtribuirOS(user.perfil, user.permissoesModulos)) {
      throw new ForbiddenException("Sem permissão para registrar a execução");
    }
    const os = await this.findByNumero(user.estabelecimentoId, numero);
    if (data.itens?.length) {
      for (const item of data.itens) {
        if (!item.descricao?.trim()) continue;
        await this.prisma.ordemServicoItem.create({
          data: {
            ordemServicoId: os.id,
            tipo: item.tipo === "MAO_DE_OBRA" ? "MAO_DE_OBRA" : "MATERIAL",
            descricao: item.descricao.trim(),
            quantidade: item.quantidade ?? 1,
          },
        });
      }
    }
    return this.prisma.ordemServico.update({
      where: { id: os.id },
      data: {
        diagnostico: data.diagnostico?.trim() ?? os.diagnostico,
        servicoRealizado: data.servicoRealizado?.trim() ?? os.servicoRealizado,
        resultadoAtendimento: data.resultadoAtendimento?.trim() ?? os.resultadoAtendimento,
        pendencia: data.pendencia !== undefined ? data.pendencia?.trim() || null : os.pendencia,
        logs: data.diagnostico?.trim()
          ? {
              create: {
                usuarioId: user.userId,
                acao: "DIAGNOSTICO",
                justificativa: data.diagnostico.trim(),
                visibilidade: visibilidadeLog("DIAGNOSTICO"),
              },
            }
          : undefined,
      },
    });
  }

  async areaContagens(estabelecimentoId: string, colaboradorId?: string) {
    const base = { estabelecimentoId, status: { in: STATUS_ATIVAS } };
    const [naoAtribuidas, minhas, doOutro, emAtendimento, aguardando] = await Promise.all([
      this.prisma.ordemServico.count({
        where: { estabelecimentoId, status: StatusOS.NAO_ATRIBUIDA },
      }),
      colaboradorId
        ? this.prisma.ordemServico.count({ where: { ...base, responsavelId: colaboradorId } })
        : Promise.resolve(0),
      colaboradorId
        ? this.prisma.ordemServico.count({
            where: { ...base, responsavelId: { not: colaboradorId } },
          })
        : this.prisma.ordemServico.count({
            where: { ...base, responsavelId: { not: null } },
          }),
      this.prisma.ordemServico.count({
        where: { estabelecimentoId, status: StatusOS.EM_ANDAMENTO },
      }),
      this.prisma.ordemServico.count({
        where: { estabelecimentoId, status: StatusOS.AGUARDANDO },
      }),
    ]);
    return { naoAtribuidas, minhas, doOutro, emAtendimento, aguardando };
  }

  async colaboradorDoUsuario(user: AuthUser) {
    return this.prisma.colaborador.findFirst({
      where: { usuarioId: user.userId, estabelecimentoId: user.estabelecimentoId, ativo: true },
    });
  }

  private decorateListItem(os: {
    prioridade: PrioridadeOS;
    abertura: Date;
    fechamento: Date | null;
    status: StatusOS;
    equipamentoParado?: boolean;
    identificacaoPendente?: boolean;
    pedidoReaberturaEm?: Date | null;
    equipamento?: {
      tag: string;
      nome: string;
      condicaoUso?: string;
      setor?: { nome: string } | null;
    } | null;
    setor?: { nome: string } | null;
  }) {
    return {
      ...os,
      equipamento: this.equipamentoExibicao(os),
      atrasada: this.isAtrasada(os.prioridade, os.abertura, os.fechamento, os.status),
      destaqueParado: Boolean(os.equipamentoParado || os.equipamento?.condicaoUso === "PARADO"),
      identificacaoPendente: Boolean(os.identificacaoPendente || !os.equipamento),
      pedidoReabertura: Boolean(os.pedidoReaberturaEm),
    };
  }

  async assertPodeVerComoSolicitante(
    user: AuthUser,
    os: { solicitacaoId?: string | null },
  ) {
    if (!ehSolicitante(user.perfil)) return;
    if (!os.solicitacaoId) throw new ForbiddenException("Sem acesso a esta OS");
    const sol = await this.prisma.solicitacaoServico.findUnique({
      where: { id: os.solicitacaoId },
    });
    if (!sol) throw new ForbiddenException("Sem acesso a esta OS");
    if (sol.solicitanteUsuarioId && sol.solicitanteUsuarioId !== user.userId) {
      throw new ForbiddenException("Você só acompanha as suas solicitações");
    }
    if (!sol.solicitanteUsuarioId) {
      const me = await this.prisma.usuario.findUnique({ where: { id: user.userId } });
      if (!me || sol.solicitanteNome !== me.nome) {
        throw new ForbiddenException("Você só acompanha as suas solicitações");
      }
    }
  }

  private equipamentoExibicao(os: {
    equipamento?: {
      tag: string;
      nome: string;
      setor?: { nome: string } | null;
    } | null;
    setor?: { nome: string } | null;
  }) {
    if (os.equipamento) return os.equipamento;
    const setorNome = os.setor?.nome;
    return {
      tag: "—",
      nome: setorNome ? `Chamado · ${setorNome}` : "Chamado do setor",
      setor: os.setor ?? null,
    };
  }

  private async assertResponsavelAtribuivel(estabelecimentoId: string, responsavelId: string) {
    const ok = await colaboradorPodeReceberOS(this.prisma, estabelecimentoId, responsavelId);
    if (!ok) {
      throw new BadRequestException("Não é possível atribuir a OS ao usuário final (solicitante)");
    }
  }

  private async findByNumero(estabelecimentoId: string, numero: number) {
    const os = await this.prisma.ordemServico.findUnique({
      where: { estabelecimentoId_numero: { estabelecimentoId, numero } },
    });
    if (!os) throw new NotFoundException(`OS ${numero} não encontrada`);
    return os;
  }

  private async nextNumero(estabelecimentoId: string) {
    const row = await this.prisma.contadorSequencia.upsert({
      where: {
        estabelecimentoId_chave: { estabelecimentoId, chave: "OS" },
      },
      create: { estabelecimentoId, chave: "OS", valor: 1 },
      update: { valor: { increment: 1 } },
    });
    return row.valor;
  }
}
