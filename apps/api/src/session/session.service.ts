import { Injectable, NotFoundException } from "@nestjs/common";
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

    return {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      perfil: atual?.perfil ?? user.perfil,
      estabelecimentoId: user.estabelecimentoId,
      estabelecimentoNome: atual?.estabelecimento.nome ?? "",
      setorIds: atual?.setorIds ?? [],
      colaboradorId: usuario.colaborador?.id ?? null,
      estabelecimentos: usuario.estabelecimentos.map((v) => ({
        id: v.estabelecimentoId,
        nome: v.estabelecimento.nome,
        perfil: v.perfil,
      })),
      permissoes: {
        editarCadastros: ["ENGENHEIRO", "GESTOR", "ADMIN"].includes(atual?.perfil ?? user.perfil),
        alterarStatusOS: ["ENGENHEIRO", "GESTOR", "ADMIN"].includes(atual?.perfil ?? user.perfil),
        verValoresFinanceiros: ["ENGENHEIRO", "GESTOR", "ADMIN"].includes(
          atual?.perfil ?? user.perfil,
        ),
      },
    };
  }
}
