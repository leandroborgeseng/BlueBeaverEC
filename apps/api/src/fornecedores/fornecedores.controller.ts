import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { IsArray, IsBoolean, IsOptional, IsString, MinLength } from "class-validator";
import { PERMISSAO_NIVEL } from "@aion/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermission } from "../auth/permissions.guard";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { FornecedoresService } from "./fornecedores.service";

class CreateFornecedorDto {
  @IsString()
  @MinLength(2)
  nome!: string;

  @IsOptional()
  @IsString()
  cnpj?: string;

  @IsOptional()
  @IsString()
  telefone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  endereco?: string;

  @IsOptional()
  @IsArray()
  especialidades?: string[];

  @IsOptional()
  @IsString()
  observacoes?: string;
}

class UpdateFornecedorDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  nome?: string;

  @IsOptional()
  @IsString()
  cnpj?: string | null;

  @IsOptional()
  @IsString()
  telefone?: string | null;

  @IsOptional()
  @IsString()
  email?: string | null;

  @IsOptional()
  @IsString()
  endereco?: string | null;

  @IsOptional()
  @IsArray()
  especialidades?: string[];

  @IsOptional()
  @IsString()
  observacoes?: string | null;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

class ContatoDto {
  @IsString()
  @MinLength(2)
  nome!: string;

  @IsOptional()
  @IsString()
  cargo?: string;

  @IsOptional()
  @IsString()
  telefone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsBoolean()
  principal?: boolean;
}

@Controller("fornecedores")
@UseGuards(JwtAuthGuard)
export class FornecedoresController {
  constructor(private readonly fornecedores: FornecedoresService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("q") q?: string) {
    return this.fornecedores.list(user, q);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateFornecedorDto) {
    return this.fornecedores.create(user, body);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.fornecedores.get(user, id);
  }

  @Patch(":id")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: UpdateFornecedorDto) {
    return this.fornecedores.update(user, id, body);
  }

  @Post(":id/contatos")
  contato(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: ContatoDto) {
    return this.fornecedores.addContato(user, id, body);
  }

  @Delete(":id/contatos/:contatoId")
  delContato(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("contatoId") contatoId: string,
  ) {
    return this.fornecedores.removeContato(user, id, contatoId);
  }

  @Post(":id/notas")
  nota(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: { texto: string }) {
    return this.fornecedores.addNota(user, id, body.texto);
  }

  @Post(":id/documentos")
  documento(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: { tipo?: string; dataUrl: string; nomeArquivo?: string; descricao?: string },
  ) {
    return this.fornecedores.addDocumento(user, id, body);
  }

  @Get(":id/documentos/:docId")
  async baixar(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("docId") docId: string,
    @Res() res: Response,
  ) {
    const doc = await this.fornecedores.baixarDocumento(user, id, docId);
    res.setHeader("Content-Type", doc.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${doc.nomeArquivo.replace(/"/g, "")}"`);
    res.send(Buffer.from(doc.conteudo));
  }

  @Post(":id/fabricantes")
  fab(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: { fabricanteId: string }) {
    return this.fornecedores.vincularFabricante(user, id, body.fabricanteId);
  }

  @Delete(":id/fabricantes/:fabricanteId")
  delFab(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("fabricanteId") fabricanteId: string,
  ) {
    return this.fornecedores.desvincularFabricante(user, id, fabricanteId);
  }
}
