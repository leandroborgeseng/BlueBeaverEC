import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { TipoLaudo } from "@prisma/client";
import { podeEditarCadastros } from "@aion/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/current-user.decorator";

@Injectable()
export class ProcedimentosService {
  constructor(private readonly prisma: PrismaService) {}

  list(estabelecimentoId: string, tipo?: TipoLaudo) {
    return this.prisma.procedimentoLaudo.findMany({
      where: {
        estabelecimentoId,
        ativo: true,
        ...(tipo ? { tipo } : {}),
      },
      include: {
        modelos: { include: { modelo: { include: { fabricante: true } } } },
      },
      orderBy: { nome: "asc" },
    });
  }

  async create(
    user: AuthUser,
    data: { nome: string; tipo: TipoLaudo; validadeMeses?: number; itens?: unknown[] },
  ) {
    if (!podeEditarCadastros(user.perfil, user.permissoesModulos)) throw new ForbiddenException();
    return this.prisma.procedimentoLaudo.create({
      data: {
        estabelecimentoId: user.estabelecimentoId,
        nome: data.nome.trim(),
        tipo: data.tipo,
        validadeMeses: data.validadeMeses ?? 12,
        itens: (data.itens ?? []) as object,
      },
    });
  }

  async updateItens(user: AuthUser, id: string, itens: unknown[]) {
    if (!podeEditarCadastros(user.perfil, user.permissoesModulos)) throw new ForbiddenException();
    const proc = await this.findOwned(user.estabelecimentoId, id);
    return this.prisma.procedimentoLaudo.update({
      where: { id: proc.id },
      data: { itens: itens as object },
    });
  }

  async vincularModelo(user: AuthUser, id: string, modeloId: string) {
    if (!podeEditarCadastros(user.perfil, user.permissoesModulos)) throw new ForbiddenException();
    const proc = await this.findOwned(user.estabelecimentoId, id);

    // Vínculo exclusivo: desvincula outros procedimentos do mesmo tipo neste modelo
    const outros = await this.prisma.procedimentoModelo.findMany({
      where: {
        modeloId,
        procedimento: {
          estabelecimentoId: user.estabelecimentoId,
          tipo: proc.tipo,
          NOT: { id: proc.id },
        },
      },
    });
    await this.prisma.$transaction([
      ...outros.map((o) =>
        this.prisma.procedimentoModelo.delete({ where: { id: o.id } }),
      ),
      this.prisma.procedimentoModelo.upsert({
        where: {
          procedimentoId_modeloId: { procedimentoId: proc.id, modeloId },
        },
        create: { procedimentoId: proc.id, modeloId },
        update: {},
      }),
    ]);

    return this.prisma.procedimentoLaudo.findUnique({
      where: { id: proc.id },
      include: { modelos: { include: { modelo: true } } },
    });
  }

  private async findOwned(estabelecimentoId: string, id: string) {
    const proc = await this.prisma.procedimentoLaudo.findFirst({
      where: { id, estabelecimentoId },
    });
    if (!proc) throw new NotFoundException("Procedimento não encontrado");
    return proc;
  }
}
