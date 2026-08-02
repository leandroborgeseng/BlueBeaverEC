import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { DashboardService } from "./dashboard.service";

@Controller("dashboard")
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get("kpis")
  kpis(@CurrentUser() user: AuthUser) {
    return this.dashboard.kpis(user.estabelecimentoId);
  }

  @Get("os-por-situacao")
  osPorSituacao(@CurrentUser() user: AuthUser) {
    return this.dashboard.osPorSituacao(user.estabelecimentoId);
  }

  @Get("equipamentos-status")
  equipamentosStatus(@CurrentUser() user: AuthUser) {
    return this.dashboard.equipamentosStatus(user.estabelecimentoId);
  }

  @Get("os-recentes")
  osRecentes(@CurrentUser() user: AuthUser, @Query("limit") limit?: string) {
    return this.dashboard.osRecentes(user.estabelecimentoId, limit ? Number(limit) : 5);
  }

  @Get("contratos-vencendo")
  contratosVencendo() {
    // Contratos entram na Fase 3 — endpoint já reservado.
    return [];
  }
}
