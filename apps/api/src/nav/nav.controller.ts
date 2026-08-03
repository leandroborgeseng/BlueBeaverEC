import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { NavService } from "./nav.service";

@Controller("nav")
@UseGuards(JwtAuthGuard)
export class NavController {
  constructor(private readonly nav: NavService) {}

  @Get("favoritos")
  favoritos() {
    return [
      { id: "equipamentos", label: "Equipamentos", href: "/equipamentos" },
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
  busca(@CurrentUser() user: AuthUser, @Query("q") q?: string) {
    return this.nav.busca(user.estabelecimentoId, q ?? "");
  }
}

@Controller("notificacoes")
@UseGuards(JwtAuthGuard)
export class NotificacoesController {
  constructor(private readonly nav: NavService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.nav.notificacoes(user);
  }
}
