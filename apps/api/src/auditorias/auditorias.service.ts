import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { StatusAuditoria, StatusNC } from "@prisma/client";
import { podeEditarCadastros } from "@aion/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/current-user.decorator";

@Injectable()
export class AuditoriasService {
  constructor(private readonly prisma: PrismaService) {}

  list(estabelecimentoId: string) {
    return this.prisma.auditoria.findMany({
      where: { estabelecimentoId },
      include: {
        responsavel: true,
        achados: { include: { planosAcao: true } },
      },
      orderBy: { data: "desc" },
    });
  }

  async create(user: AuthUser, data: { escopo: string; responsavelId?: string }) {
    if (!podeEditarCadastros(user.perfil, user.permissoesModulos)) throw new ForbiddenException();
    const codigo = await this.nextCodigo(user.estabelecimentoId, "AUD");
    return this.prisma.auditoria.create({
      data: {
        estabelecimentoId: user.estabelecimentoId,
        codigo,
        escopo: data.escopo.trim(),
        responsavelId: data.responsavelId,
        status: StatusAuditoria.PLANEJADA,
      },
    });
  }

  async iniciar(user: AuthUser, id: string) {
    if (!podeEditarCadastros(user.perfil, user.permissoesModulos)) throw new ForbiddenException();
    const aud = await this.findAud(user.estabelecimentoId, id);
    return this.prisma.auditoria.update({
      where: { id: aud.id },
      data: { status: StatusAuditoria.EM_EXECUCAO },
    });
  }

  async createNc(
    user: AuthUser,
    data: {
      descricao: string;
      origem: string;
      auditoriaId?: string;
      ordemServicoId?: string;
    },
  ) {
    const codigo = await this.nextCodigo(user.estabelecimentoId, "NC");
    if (data.auditoriaId) {
      const aud = await this.findAud(user.estabelecimentoId, data.auditoriaId);
      if (aud.status === StatusAuditoria.PLANEJADA) {
        await this.prisma.auditoria.update({
          where: { id: aud.id },
          data: { status: StatusAuditoria.EM_EXECUCAO },
        });
      }
    }
    return this.prisma.naoConformidade.create({
      data: {
        estabelecimentoId: user.estabelecimentoId,
        codigo,
        descricao: data.descricao.trim(),
        origem: data.origem.trim(),
        auditoriaId: data.auditoriaId,
        ordemServicoId: data.ordemServicoId,
      },
    });
  }

  listNc(estabelecimentoId: string) {
    return this.prisma.naoConformidade.findMany({
      where: { estabelecimentoId },
      include: { planosAcao: true, auditoria: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async fecharNc(user: AuthUser, id: string, justificativa: string) {
    if (!justificativa?.trim()) throw new BadRequestException("Justificativa obrigatória");
    const nc = await this.findNc(user.estabelecimentoId, id);
    return this.prisma.naoConformidade.update({
      where: { id: nc.id },
      data: {
        status: StatusNC.FECHADA,
        justificativaFechamento: justificativa.trim(),
      },
    });
  }

  async reabrirNc(user: AuthUser, id: string, justificativa: string) {
    if (!justificativa?.trim()) throw new BadRequestException("Justificativa obrigatória");
    const nc = await this.findNc(user.estabelecimentoId, id);
    return this.prisma.naoConformidade.update({
      where: { id: nc.id },
      data: {
        status: StatusNC.ABERTA,
        justificativaReabertura: justificativa.trim(),
      },
    });
  }

  async addPlano(
    user: AuthUser,
    ncId: string,
    data: { descricao: string; responsavelNome?: string; prazo?: string },
  ) {
    const nc = await this.findNc(user.estabelecimentoId, ncId);
    const plano = await this.prisma.planoAcao.create({
      data: {
        naoConformidadeId: nc.id,
        descricao: data.descricao.trim(),
        responsavelNome: data.responsavelNome,
        prazo: data.prazo ? new Date(data.prazo) : null,
      },
    });
    await this.prisma.naoConformidade.update({
      where: { id: nc.id },
      data: { status: StatusNC.EM_ACAO },
    });
    return plano;
  }

  /** Escalonamento automático de planos vencidos. */
  async escalonarVencidos(estabelecimentoId: string) {
    const agora = new Date();
    const vencidos = await this.prisma.planoAcao.findMany({
      where: {
        concluidoEm: null,
        prazo: { lt: agora },
        escalonadoEm: null,
        naoConformidade: { estabelecimentoId },
      },
      include: { naoConformidade: true },
    });

    for (const p of vencidos) {
      await this.prisma.planoAcao.update({
        where: { id: p.id },
        data: { escalonadoEm: agora },
      });
      await this.prisma.logAcesso.create({
        data: {
          acao: "ESCALONAMENTO_PLANO_ACAO",
          detalhe: `${estabelecimentoId} · ${p.naoConformidade.codigo} · plano ${p.id} · notificar gestor`,
        },
      });
    }

    return { escalonados: vencidos.length };
  }

  private async findAud(estabelecimentoId: string, id: string) {
    const aud = await this.prisma.auditoria.findFirst({ where: { id, estabelecimentoId } });
    if (!aud) throw new NotFoundException();
    return aud;
  }

  private async findNc(estabelecimentoId: string, id: string) {
    const nc = await this.prisma.naoConformidade.findFirst({ where: { id, estabelecimentoId } });
    if (!nc) throw new NotFoundException();
    return nc;
  }

  private async nextCodigo(estabelecimentoId: string, chave: string) {
    const row = await this.prisma.contadorSequencia.upsert({
      where: { estabelecimentoId_chave: { estabelecimentoId, chave } },
      create: { estabelecimentoId, chave, valor: 1 },
      update: { valor: { increment: 1 } },
    });
    return `${chave}-${String(row.valor).padStart(3, "0")}`;
  }
}
