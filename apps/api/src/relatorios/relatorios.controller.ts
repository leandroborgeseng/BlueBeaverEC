import { Body, Controller, Get, Param, Post, Res, UseGuards } from "@nestjs/common";
import { FrequenciaRelatorio } from "@prisma/client";
import { IsArray, IsEnum, IsOptional, IsString, MinLength } from "class-validator";
import type { Response } from "express";
import { PERMISSAO_NIVEL } from "@aion/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermission } from "../auth/permissions.guard";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { RelatoriosService } from "./relatorios.service";

class GerarDto {
  @IsString()
  template!: string;

  @IsOptional()
  @IsString()
  formato?: "pdf" | "xlsx" | "json";

  @IsOptional()
  @IsString()
  de?: string;

  @IsOptional()
  @IsString()
  ate?: string;
}

class AgendamentoDto {
  @IsString()
  @MinLength(2)
  template!: string;

  @IsEnum(FrequenciaRelatorio)
  frequencia!: FrequenciaRelatorio;

  @IsArray()
  @IsString({ each: true })
  destinatarios!: string[];
}

@Controller("relatorios")
@UseGuards(JwtAuthGuard)
@RequirePermission("estrategico", PERMISSAO_NIVEL.LEITURA)
export class RelatoriosController {
  constructor(private readonly relatorios: RelatoriosService) {}

  @Get("templates")
  templates() {
    return this.relatorios.templates();
  }

  @Post("gerar")
  async gerar(
    @CurrentUser() user: AuthUser,
    @Body() body: GerarDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const formato = body.formato ?? "json";
    const out = await this.relatorios.gerar(user.estabelecimentoId, body.template, formato, {
      de: body.de,
      ate: body.ate,
    });

    if (out.formato === "json") {
      return out;
    }

    res.setHeader("Content-Type", out.mime);
    res.setHeader("Content-Disposition", `attachment; filename="${out.filename}"`);
    res.setHeader("Content-Length", String(out.buffer.length));
    res.send(out.buffer);
  }

  @Get("agendamentos")
  list(@CurrentUser() user: AuthUser) {
    return this.relatorios.listAgendamentos(user.estabelecimentoId);
  }

  @Post("agendamentos")
  @RequirePermission("estrategico", PERMISSAO_NIVEL.EDICAO)
  create(@CurrentUser() user: AuthUser, @Body() body: AgendamentoDto) {
    return this.relatorios.createAgendamento(user, body);
  }

  @Post("agendamentos/:id/disparar")
  @RequirePermission("estrategico", PERMISSAO_NIVEL.EDICAO)
  disparar(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.relatorios.disparar(user, id);
  }

  @Post("agendamentos/disparar-pendentes")
  @RequirePermission("estrategico", PERMISSAO_NIVEL.EDICAO)
  dispararPendentes(@CurrentUser() user: AuthUser) {
    return this.relatorios.dispararPendentes(user);
  }
}
