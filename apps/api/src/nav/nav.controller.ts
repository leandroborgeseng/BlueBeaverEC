import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { PERMISSAO_NIVEL, temPermissao } from "@aion/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermission } from "../auth/permissions.guard";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { NavService } from "./nav.service";

/** Shell autenticado: busca/recentes exigem ao menos leitura de equipamentos (solicitante incluso). */
@Controller("nav")
@UseGuards(JwtAuthGuard)
@RequirePermission("equipamentos", PERMISSAO_NIVEL.LEITURA)
export class NavController {
  constructor(private readonly nav: NavService) {}

  @Get("favoritos")
  favoritos(@CurrentUser() user: AuthUser) {
    const base = [{ id: "equipamentos", label: "Equipamentos", href: "/equipamentos" }];
    if (!temPermissao(user.permissoesModulos, "os", PERMISSAO_NIVEL.LEITURA)) return base;
    return [
      ...base,
      { id: "os", label: "Ordens de Serviço", href: "/os" },
      { id: "triagem", label: "Triagem", href: "/os/triagem-solicitacoes" },
      { id: "nao-atribuidas", label: "Não atribuídas", href: "/os/nao-atribuidas" },
    ];
  }

  @Get("recentes")
  recentes(@CurrentUser() user: AuthUser) {
    return this.nav.recentes(user.estabelecimentoId);
  }

  @Get("busca")
  async busca(@CurrentUser() user: AuthUser, @Query("q") q?: string) {
    const res = await this.nav.busca(user.estabelecimentoId, q ?? "");
    if (!temPermissao(user.permissoesModulos, "os", PERMISSAO_NIVEL.LEITURA)) {
      return { ...res, os: [] };
    }
    return res;
  }
}

@Controller("notificacoes")
@UseGuards(JwtAuthGuard)
@RequirePermission("equipamentos", PERMISSAO_NIVEL.LEITURA)
export class NotificacoesController {
  constructor(private readonly nav: NavService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.nav.notificacoes(user);
  }
}
