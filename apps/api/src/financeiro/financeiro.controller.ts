import { Controller, Get, Header, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { FinanceiroService, type LancamentoTipo } from "./financeiro.service";

@Controller("financeiro")
@UseGuards(JwtAuthGuard)
export class FinanceiroController {
  constructor(private readonly financeiro: FinanceiroService) {}

  @Get("dashboard")
  dashboard(
    @CurrentUser() user: AuthUser,
    @Query("agrupar") agrupar?: "equipamento" | "setor" | "centroCusto",
  ) {
    return this.financeiro.dashboard(user.estabelecimentoId, agrupar ?? "equipamento");
  }

  @Get("extrato")
  extrato(
    @CurrentUser() user: AuthUser,
    @Query("tipo") tipo?: LancamentoTipo,
    @Query("de") de?: string,
    @Query("ate") ate?: string,
    @Query("equipamentoTag") equipamentoTag?: string,
  ) {
    return this.financeiro.extrato(user.estabelecimentoId, { tipo, de, ate, equipamentoTag });
  }

  @Get("export")
  @Header("Content-Type", "text/csv; charset=utf-8")
  async export(@CurrentUser() user: AuthUser, @Res() res: Response) {
    const csv = await this.financeiro.exportCsv(user.estabelecimentoId);
    res.setHeader("Content-Disposition", 'attachment; filename="extrato-financeiro.csv"');
    res.send(csv);
  }

  @Get("export-xlsx")
  async exportXlsx(@CurrentUser() user: AuthUser, @Res() res: Response) {
    const buf = await this.financeiro.exportXlsx(user.estabelecimentoId);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", 'attachment; filename="extrato-financeiro.xlsx"');
    res.send(buf);
  }
}
