import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { StatusOS } from "@prisma/client";
import { podeEditarCadastros } from "@aion/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/current-user.decorator";

@Injectable()
export class PessoasService {
  constructor(private readonly prisma: PrismaService) {}

  async colaboradores(estabelecimentoId: string) {
    const rows = await this.prisma.colaborador.findMany({
      where: { estabelecimentoId, ativo: true },
      include: {
        competencias: true,
        equipes: { include: { equipe: true } },
        osResponsavel: {
          where: { status: { in: [StatusOS.ABERTA, StatusOS.EM_ANDAMENTO] } },
          select: { id: true },
        },
      },
      orderBy: { nome: "asc" },
    });

    return rows.map((c) => {
      const cargaAtual = c.osResponsavel.length;
      return {
        ...c,
        cargaAtual,
        sobrecarga: cargaAtual >= 2,
        competenciasVencidas: c.competencias.filter(
          (comp) => comp.validade && comp.validade.getTime() < Date.now(),
        ),
      };
    });
  }

  async createColaborador(
    user: AuthUser,
    data: { matricula: string; nome: string; cargo?: string; registroProfissional?: string },
  ) {
    if (!podeEditarCadastros(user.perfil, user.permissoesModulos)) throw new ForbiddenException();
    return this.prisma.colaborador.create({
      data: {
        estabelecimentoId: user.estabelecimentoId,
        matricula: data.matricula.trim(),
        nome: data.nome.trim(),
        cargo: data.cargo,
        registroProfissional: data.registroProfissional,
      },
    });
  }

  async addCompetencia(
    user: AuthUser,
    colaboradorId: string,
    data: { nome: string; nivel?: string; validade?: string },
  ) {
    if (!podeEditarCadastros(user.perfil, user.permissoesModulos)) throw new ForbiddenException();
    const colab = await this.prisma.colaborador.findFirst({
      where: { id: colaboradorId, estabelecimentoId: user.estabelecimentoId },
    });
    if (!colab) throw new NotFoundException();
    return this.prisma.competencia.create({
      data: {
        colaboradorId,
        nome: data.nome.trim(),
        nivel: data.nivel,
        validade: data.validade ? new Date(data.validade) : null,
      },
    });
  }

  listEquipes(estabelecimentoId: string) {
    return this.prisma.equipe.findMany({
      where: { estabelecimentoId, ativo: true },
      include: {
        membros: { include: { colaborador: true } },
      },
      orderBy: { nome: "asc" },
    });
  }

  async createEquipe(
    user: AuthUser,
    data: { nome: string; turno?: string; liderId?: string; membroIds?: string[] },
  ) {
    if (!podeEditarCadastros(user.perfil, user.permissoesModulos)) throw new ForbiddenException();
    return this.prisma.equipe.create({
      data: {
        estabelecimentoId: user.estabelecimentoId,
        nome: data.nome.trim(),
        turno: data.turno,
        liderId: data.liderId,
        membros: {
          create: (data.membroIds ?? []).map((colaboradorId) => ({ colaboradorId })),
        },
      },
      include: { membros: { include: { colaborador: true } } },
    });
  }

  async addMembro(user: AuthUser, equipeId: string, colaboradorId: string) {
    if (!podeEditarCadastros(user.perfil, user.permissoesModulos)) throw new ForbiddenException();
    const equipe = await this.prisma.equipe.findFirst({
      where: { id: equipeId, estabelecimentoId: user.estabelecimentoId },
    });
    if (!equipe) throw new NotFoundException();
    return this.prisma.equipeMembro.upsert({
      where: { equipeId_colaboradorId: { equipeId, colaboradorId } },
      create: { equipeId, colaboradorId },
      update: {},
    });
  }
}
