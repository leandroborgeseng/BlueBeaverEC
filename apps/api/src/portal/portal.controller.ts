import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { TipoLaudo } from "@prisma/client";
import { PERMISSAO_NIVEL } from "@aion/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermission } from "../auth/permissions.guard";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { SessionService } from "../session/session.service";

@Controller("portal")
@UseGuards(JwtAuthGuard)
@RequirePermission("portal", PERMISSAO_NIVEL.LEITURA)
export class PortalController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly session: SessionService,
  ) {}

  @Get("cronograma-calibracao")
  async cronograma(@CurrentUser() user: AuthUser, @Query("setor") setor?: string) {
    const me = await this.session.me(user);
    const setorFilter = await this.resolveSetorFilter(user.estabelecimentoId, me.setorIds, setor);

    const laudos = await this.prisma.laudo.findMany({
      where: {
        estabelecimentoId: user.estabelecimentoId,
        tipo: { in: [TipoLaudo.CALIBRACAO, TipoLaudo.TSE] },
        ...(setorFilter ? { equipamento: { setorId: { in: setorFilter } } } : {}),
      },
      include: {
        equipamento: { include: { setor: true } },
      },
      orderBy: { validadeAte: "asc" },
      take: 100,
    });

    return laudos.map((l) => ({
      id: l.id,
      tipo: l.tipo,
      validadeAte: l.validadeAte,
      equipamento: {
        tag: l.equipamento.tag,
        nome: l.equipamento.nome,
        setor: l.equipamento.setor.nome,
      },
      status:
        !l.validadeAte
          ? "SEM_VALIDADE"
          : l.validadeAte.getTime() < Date.now()
            ? "VENCIDO"
            : (l.validadeAte.getTime() - Date.now()) / (1000 * 60 * 60 * 24) <= 60
              ? "A_VENCER"
              : "VALIDO",
    }));
  }

  @Get("inventario-setor")
  async inventario(@CurrentUser() user: AuthUser, @Query("setor") setor?: string) {
    const me = await this.session.me(user);
    const setorFilter = await this.resolveSetorFilter(user.estabelecimentoId, me.setorIds, setor);

    const items = await this.prisma.equipamento.findMany({
      where: {
        estabelecimentoId: user.estabelecimentoId,
        ...(setorFilter ? { setorId: { in: setorFilter } } : {}),
      },
      include: {
        setor: true,
        fabricante: true,
        modelo: true,
        descricao: true,
      },
      orderBy: { tag: "asc" },
      take: 200,
    });

    return items.map((e) => ({
      tag: e.tag,
      nome: e.nome,
      situacao: e.situacao,
      setor: e.setor.nome,
      fabricante: e.fabricante.nome,
      modelo: e.modelo.nome,
      tipo: e.descricao.nome,
      criticidade: e.descricao.criticidade,
    }));
  }

  private async resolveSetorFilter(
    estabelecimentoId: string,
    setorIds: string[],
    setorNome?: string,
  ) {
    if (setorNome?.trim()) {
      const s = await this.prisma.setor.findFirst({
        where: {
          estabelecimentoId,
          nome: { contains: setorNome.trim(), mode: "insensitive" },
        },
      });
      return s ? [s.id] : ["__none__"];
    }
    if (setorIds?.length) return setorIds;
    return null;
  }
}
