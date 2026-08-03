import { Body, Controller, Get, Param, Post, Query, Res, UseGuards } from "@nestjs/common";
import { TipoLaudo } from "@prisma/client";
import { IsString, MinLength } from "class-validator";
import type { Response } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { LaudosService } from "./laudos.service";
import { buildPdfBuffer } from "../relatorios/report-export";

class ReabrirDto {
  @IsString()
  @MinLength(3)
  justificativa!: string;
}

@Controller("certificados")
@UseGuards(JwtAuthGuard)
export class CertificadosController {
  constructor(private readonly laudos: LaudosService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("tipo") tipo?: TipoLaudo) {
    return this.laudos.certificados(user.estabelecimentoId, tipo);
  }

  @Get(":id/documento.pdf")
  async documentoPdf(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    const original = await this.laudos.certificadoPdfOriginal(user.estabelecimentoId, id);
    if (original) {
      res.setHeader("Content-Type", original.mimeType || "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${original.nomeArquivo.replace(/"/g, "")}"`,
      );
      res.send(Buffer.from(original.conteudo));
      return;
    }

    const doc = await this.laudos.certificadoDocumento(user.estabelecimentoId, id);
    const pdf = await buildPdfBuffer({
      template: "conformidade",
      geradoEm: new Date().toISOString(),
      certificado: doc.documento,
      respostas: doc.documento.respostas,
      status: doc.statusCertificado,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="certificado-${doc.numero ?? id}.pdf"`);
    res.send(pdf);
  }

  @Get(":id/documento")
  documento(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.laudos.certificadoDocumento(user.estabelecimentoId, id);
  }

  @Post(":id/reabrir")
  reabrir(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: ReabrirDto) {
    return this.laudos.reabrirCertificado(user, id, body.justificativa);
  }
}
