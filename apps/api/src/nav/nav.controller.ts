import { Controller, Get, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";

@Controller("nav")
@UseGuards(JwtAuthGuard)
export class NavController {
  @Get("favoritos")
  favoritos() {
    return [
      { id: "equipamentos", label: "Equipamentos", href: "/equipamentos" },
      { id: "os", label: "Ordens de Serviço", href: "/os" },
    ];
  }

  @Get("recentes")
  recentes() {
    return [];
  }
}

@Controller("notificacoes")
@UseGuards(JwtAuthGuard)
export class NotificacoesController {
  @Get()
  list() {
    return { items: [], unread: 0 };
  }
}
