import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { IsArray, IsOptional, IsString, MinLength } from "class-validator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { PessoasService } from "./pessoas.service";

class CreateColabDto {
  @IsString()
  matricula!: string;

  @IsString()
  @MinLength(2)
  nome!: string;

  @IsOptional()
  @IsString()
  cargo?: string;

  @IsOptional()
  @IsString()
  registroProfissional?: string;
}

class CompetenciaDto {
  @IsString()
  @MinLength(2)
  nome!: string;

  @IsOptional()
  @IsString()
  nivel?: string;

  @IsOptional()
  @IsString()
  validade?: string;
}

class CreateEquipeDto {
  @IsString()
  @MinLength(2)
  nome!: string;

  @IsOptional()
  @IsString()
  turno?: string;

  @IsOptional()
  @IsString()
  liderId?: string;

  @IsOptional()
  @IsArray()
  membroIds?: string[];
}

class MembroDto {
  @IsString()
  colaboradorId!: string;
}

@Controller("pessoas")
@UseGuards(JwtAuthGuard)
export class PessoasController {
  constructor(private readonly pessoas: PessoasService) {}

  @Get("colaboradores")
  colaboradores(@CurrentUser() user: AuthUser) {
    return this.pessoas.colaboradores(user.estabelecimentoId);
  }

  @Post("colaboradores")
  createColab(@CurrentUser() user: AuthUser, @Body() body: CreateColabDto) {
    return this.pessoas.createColaborador(user, body);
  }

  @Post("colaboradores/:id/competencias")
  competencia(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: CompetenciaDto,
  ) {
    return this.pessoas.addCompetencia(user, id, body);
  }

  @Get("equipes")
  equipes(@CurrentUser() user: AuthUser) {
    return this.pessoas.listEquipes(user.estabelecimentoId);
  }

  @Post("equipes")
  createEquipe(@CurrentUser() user: AuthUser, @Body() body: CreateEquipeDto) {
    return this.pessoas.createEquipe(user, body);
  }

  @Post("equipes/:id/membros")
  addMembro(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: MembroDto) {
    return this.pessoas.addMembro(user, id, body.colaboradorId);
  }
}
