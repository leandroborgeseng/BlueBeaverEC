import { Injectable, NotFoundException } from "@nestjs/common";
import { permissoesDoPerfil, type PerfilAcesso } from "@nexo/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/current-user.decorator";

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  async me(user: AuthUser) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: user.userId },
      include: {
        estabelecimentos: { include: { estabelecimento: true } },
        colaborador: true,
      },
    });

    if (!usuario) {
      throw new NotFoundException("Usuário não encontrado");
    }

    const atual = usuario.estabelecimentos.find(
      (v) => v.estabelecimentoId === user.estabelecimentoId,
    );
    const perfil = (atual?.perfil ?? user.perfil) as PerfilAcesso;

    const custom = await this.prisma.perfilCustom.findFirst({
      where: {
        estabelecimentoId: user.estabelecimentoId,
        ativo: true,
        OR: [{ nome: perfil }, { nome: { equals: perfil, mode: "insensitive" } }],
      },
    });

    const permissoesModulos =
      user.permissoesModulos ??
      permissoesDoPerfil(perfil, custom?.permissoes as Record<string, unknown> | null);

    return {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      perfil,
      estabelecimentoId: user.estabelecimentoId,
      estabelecimentoNome: atual?.estabelecimento.nome ?? "",
      setorIds: atual?.setorIds ?? [],
      colaboradorId: usuario.colaborador?.id ?? null,
      perfilCustomId: custom?.id ?? null,
      estabelecimentos: usuario.estabelecimentos.map((v) => ({
        id: v.estabelecimentoId,
        nome: v.estabelecimento.nome,
        perfil: v.perfil,
      })),
      permissoes: {
        editarCadastros: (permissoesModulos.equipamentos ?? 0) >= 2,
        alterarStatusOS: (permissoesModulos.os ?? 0) >= 3,
        verValoresFinanceiros: (permissoesModulos.financeiro ?? 0) >= 1,
      },
      permissoesModulos,
    };
  }
}
