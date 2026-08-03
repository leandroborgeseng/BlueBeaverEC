import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrioridadeOS, StatusSolicitacao, UrgenciaSolicitacao } from "@prisma/client";
import { PERMISSAO_NIVEL, podeAlterarStatusOS, temPermissao } from "@aion/shared";
import { PrismaService } from "../prisma/prisma.service";
import { OsService } from "../os/os.service";
import type { AuthUser } from "../auth/current-user.decorator";

@Injectable()
export class SolicitacoesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly os: OsService,
  ) {}

  async list(user: AuthUser, status?: StatusSolicitacao) {
    const podeTriagem = temPermissao(
      user.permissoesModulos,
      "os",
      PERMISSAO_NIVEL.EDICAO,
    );

    let solicitanteNome: string | undefined;
    if (!podeTriagem) {
      const me = await this.prisma.usuario.findUnique({ where: { id: user.userId } });
      solicitanteNome = me?.nome;
    }

    return this.prisma.solicitacaoServico.findMany({
      where: {
        estabelecimentoId: user.estabelecimentoId,
        ...(status ? { status } : {}),
        ...(solicitanteNome ? { solicitanteNome } : {}),
      },
      include: { equipamento: true, ordemServico: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async create(
    user: AuthUser,
    data: {
      descricao: string;
      setorNome: string;
      urgencia?: UrgenciaSolicitacao;
      equipamentoTag?: string;
      solicitanteNome?: string;
      ramal?: string;
    },
  ) {
    if (!data.descricao?.trim()) {
      throw new BadRequestException("Descrição obrigatória");
    }
    if (!data.setorNome?.trim()) {
      throw new BadRequestException("Setor obrigatório");
    }

    let equipamentoId: string | undefined;
    if (data.equipamentoTag) {
      const eq = await this.prisma.equipamento.findUnique({
        where: {
          estabelecimentoId_tag: {
            estabelecimentoId: user.estabelecimentoId,
            tag: data.equipamentoTag.trim(),
          },
        },
      });
      if (!eq) throw new NotFoundException("Equipamento não encontrado");
      equipamentoId = eq.id;
    }

    const protocolo = await this.nextProtocolo(user.estabelecimentoId);
    const me = await this.prisma.usuario.findUnique({ where: { id: user.userId } });

    return this.prisma.solicitacaoServico.create({
      data: {
        estabelecimentoId: user.estabelecimentoId,
        protocolo,
        descricao: data.descricao.trim(),
        setorNome: data.setorNome.trim(),
        urgencia: data.urgencia ?? UrgenciaSolicitacao.MEDIA,
        equipamentoId,
        solicitanteNome: data.solicitanteNome?.trim() || me?.nome || "Solicitante",
        ramal: data.ramal,
      },
    });
  }

  async aprovar(user: AuthUser, id: string, responsavelId?: string) {
    if (!podeAlterarStatusOS(user.perfil, user.permissoesModulos)) {
      throw new ForbiddenException("Somente Engenheiro pode aprovar solicitações");
    }

    const sol = await this.prisma.solicitacaoServico.findFirst({
      where: { id, estabelecimentoId: user.estabelecimentoId },
      include: { equipamento: true },
    });
    if (!sol) throw new NotFoundException();
    if (sol.status !== StatusSolicitacao.PENDENTE) {
      throw new BadRequestException("Solicitação já tratada");
    }
    if (!sol.equipamento) {
      throw new BadRequestException("Vincule um equipamento antes de aprovar (informe a TAG)");
    }

    const prioridade = this.mapPrioridade(sol.urgencia);
    const os = await this.os.create(user, {
      equipamentoTag: sol.equipamento.tag,
      prioridade,
      observacaoRequisicao: sol.descricao,
      responsavelId,
      solicitacaoId: sol.id,
    });

    await this.prisma.solicitacaoServico.update({
      where: { id: sol.id },
      data: { status: StatusSolicitacao.CONVERTIDA },
    });

    return { solicitacaoId: sol.id, protocolo: sol.protocolo, os };
  }

  async recusar(user: AuthUser, id: string, justificativa: string) {
    if (!podeAlterarStatusOS(user.perfil, user.permissoesModulos)) {
      throw new ForbiddenException("Somente Engenheiro pode recusar solicitações");
    }
    if (!justificativa?.trim()) {
      throw new BadRequestException("Justificativa obrigatória");
    }

    const sol = await this.prisma.solicitacaoServico.findFirst({
      where: { id, estabelecimentoId: user.estabelecimentoId },
    });
    if (!sol) throw new NotFoundException();
    if (sol.status !== StatusSolicitacao.PENDENTE) {
      throw new BadRequestException("Solicitação já tratada");
    }

    return this.prisma.solicitacaoServico.update({
      where: { id },
      data: {
        status: StatusSolicitacao.RECUSADA,
        justificativaRecusa: justificativa.trim(),
      },
    });
  }

  async vincularEquipamento(user: AuthUser, id: string, equipamentoTag: string) {
    if (!podeAlterarStatusOS(user.perfil, user.permissoesModulos)) {
      throw new ForbiddenException();
    }
    const sol = await this.prisma.solicitacaoServico.findFirst({
      where: { id, estabelecimentoId: user.estabelecimentoId },
    });
    if (!sol) throw new NotFoundException();

    const eq = await this.prisma.equipamento.findUnique({
      where: {
        estabelecimentoId_tag: {
          estabelecimentoId: user.estabelecimentoId,
          tag: equipamentoTag.trim(),
        },
      },
    });
    if (!eq) throw new NotFoundException("Equipamento não encontrado");

    return this.prisma.solicitacaoServico.update({
      where: { id },
      data: { equipamentoId: eq.id, setorNome: sol.setorNome },
      include: { equipamento: true },
    });
  }

  private mapPrioridade(urgencia: UrgenciaSolicitacao): PrioridadeOS {
    switch (urgencia) {
      case UrgenciaSolicitacao.PARADA_CRITICA:
        return PrioridadeOS.URGENTE;
      case UrgenciaSolicitacao.ALTA:
        return PrioridadeOS.ALTA;
      default:
        return PrioridadeOS.MEDIA;
    }
  }

  private async nextProtocolo(estabelecimentoId: string) {
    const row = await this.prisma.contadorSequencia.upsert({
      where: { estabelecimentoId_chave: { estabelecimentoId, chave: "SOL" } },
      create: { estabelecimentoId, chave: "SOL", valor: 1 },
      update: { valor: { increment: 1 } },
    });
    return `SOL-${String(row.valor).padStart(4, "0")}`;
  }
}
