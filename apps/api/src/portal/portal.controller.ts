import { Controller, ForbiddenException, Get, NotFoundException, Param, Query, UseGuards } from "@nestjs/common";
import { StatusOS, TipoLaudo } from "@prisma/client";
import { PERMISSAO_NIVEL, temPermissao } from "@aion/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermission } from "../auth/permissions.guard";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { SessionService } from "../session/session.service";

@Controller("portal")
@UseGuards(JwtAuthGuard)
export class PortalController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly session: SessionService,
  ) {}

  @Get("cronograma-manutencao")
  cronogramaManutencao(@CurrentUser() user: AuthUser, @Query("setor") setor?: string) {
    this.assertCronograma(user);
    return this.cronograma(user, setor);
  }

  @Get("cronograma-calibracao")
  cronogramaLegacy(@CurrentUser() user: AuthUser, @Query("setor") setor?: string) {
    this.assertCronograma(user);
    return this.cronograma(user, setor);
  }

  @Get("os-abertas")
  @RequirePermission("portal", PERMISSAO_NIVEL.LEITURA)
  async osAbertas(@CurrentUser() user: AuthUser, @Query("setor") setor?: string) {
    const me = await this.session.me(user);
    const setorFilter = await this.resolveSetorFilter(user, me.setorIds, setor);

    const rows = await this.prisma.ordemServico.findMany({
      where: {
        estabelecimentoId: user.estabelecimentoId,
        status: { in: [StatusOS.NAO_ATRIBUIDA, StatusOS.ABERTA, StatusOS.EM_ANDAMENTO] },
        ...(setorFilter ? { equipamento: { setorId: { in: setorFilter } } } : {}),
      },
      include: {
        equipamento: { include: { setor: true } },
      },
      orderBy: [{ prioridade: "desc" }, { abertura: "desc" }],
      take: 80,
    });

    return rows.map((os) => ({
      id: os.id,
      numero: os.numero,
      codigo: os.codigo,
      tipo: os.tipo,
      status: os.status,
      prioridade: os.prioridade,
      abertura: os.abertura,
      equipamento: {
        tag: os.equipamento.tag,
        nome: os.equipamento.nome,
        setor: os.equipamento.setor.nome,
      },
    }));
  }

  @Get("inventario-setor")
  @RequirePermission("portal", PERMISSAO_NIVEL.LEITURA)
  async inventario(@CurrentUser() user: AuthUser, @Query("setor") setor?: string) {
    const me = await this.session.me(user);
    const setorFilter = await this.resolveSetorFilter(user, me.setorIds, setor);

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

  @Get("equipamento/:tag")
  @RequirePermission("portal", PERMISSAO_NIVEL.LEITURA)
  async equipamento(@CurrentUser() user: AuthUser, @Param("tag") tag: string) {
    const me = await this.session.me(user);
    const setorFilter = await this.resolveSetorFilter(user, me.setorIds);
    const code = tag.trim();
    const eq = await this.prisma.equipamento.findFirst({
      where: {
        estabelecimentoId: user.estabelecimentoId,
        tag: { equals: code, mode: "insensitive" },
        ...(setorFilter ? { setorId: { in: setorFilter } } : {}),
      },
      include: {
        setor: true,
        fabricante: true,
        modelo: true,
      },
    });
    if (!eq) throw new NotFoundException("Equipamento não encontrado no seu setor");

    const osAbertas = await this.prisma.ordemServico.findMany({
      where: {
        estabelecimentoId: user.estabelecimentoId,
        equipamentoId: eq.id,
        status: { in: [StatusOS.NAO_ATRIBUIDA, StatusOS.ABERTA, StatusOS.EM_ANDAMENTO] },
      },
      orderBy: { abertura: "desc" },
      take: 20,
    });

    return {
      equipamento: {
        tag: eq.tag,
        nome: eq.nome,
        situacao: eq.situacao,
        patrimonio: eq.patrimonio,
        setor: eq.setor,
        fabricante: eq.fabricante,
        modelo: eq.modelo,
      },
      osAbertas: osAbertas.map((o) => ({
        numero: o.numero,
        codigo: o.codigo,
        status: o.status,
        prioridade: o.prioridade,
      })),
    };
  }

  private async cronograma(user: AuthUser, setor?: string) {
    const me = await this.session.me(user);
    const setorFilter = await this.resolveSetorFilter(user, me.setorIds, setor);

    const laudos = await this.prisma.laudo.findMany({
      where: {
        estabelecimentoId: user.estabelecimentoId,
        tipo: { in: [TipoLaudo.CALIBRACAO, TipoLaudo.TSE, TipoLaudo.PREVENTIVA, TipoLaudo.QUALIFICACAO] },
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

  private assertCronograma(user: AuthUser) {
    const podePortal = temPermissao(user.permissoesModulos, "portal", PERMISSAO_NIVEL.LEITURA);
    const podeOs = temPermissao(user.permissoesModulos, "os", PERMISSAO_NIVEL.LEITURA);
    if (!podePortal && !podeOs) {
      throw new ForbiddenException("Sem permissão para o cronograma de manutenção");
    }
  }

  /** Solicitante só vê o próprio setor. Sem vínculo → lista vazia. Demais perfis sem setor veem o hospital. */
  private async resolveSetorFilter(user: AuthUser, setorIds: string[], setorNome?: string) {
    const bound = setorIds?.filter(Boolean) ?? [];
    const soSetor = user.perfil === "SOLICITANTE";

    if (setorNome?.trim()) {
      const s = await this.prisma.setor.findFirst({
        where: {
          estabelecimentoId: user.estabelecimentoId,
          nome: { contains: setorNome.trim(), mode: "insensitive" },
        },
      });
      if (!s) return ["__none__"];
      if (soSetor && !bound.includes(s.id)) return ["__none__"];
      if (bound.length && !bound.includes(s.id)) return ["__none__"];
      return [s.id];
    }
    if (bound.length) return bound;
    if (soSetor) return ["__none__"];
    return null;
  }
}
