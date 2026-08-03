import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { PERMISSAO_NIVEL } from "@aion/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermission } from "../auth/permissions.guard";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { DashboardService } from "./dashboard.service";
import { ContratosService } from "../contratos/contratos.service";

@Controller("dashboard")
@UseGuards(JwtAuthGuard)
@RequirePermission("dashboard", PERMISSAO_NIVEL.LEITURA)
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly contratos: ContratosService,
  ) {}

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

  @Get("os-atrasadas")
  osAtrasadas(@CurrentUser() user: AuthUser) {
    return this.dashboard.osAtrasadas(user.estabelecimentoId);
  }

  @Get("contratos-vencendo")
  contratosVencendo(@CurrentUser() user: AuthUser, @Query("dias") dias?: string) {
    return this.contratos.vencendo(user.estabelecimentoId, dias ?? "30");
  }
}
