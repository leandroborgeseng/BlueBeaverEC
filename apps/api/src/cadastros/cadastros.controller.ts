import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { CadastrosService } from "./cadastros.service";

@Controller()
@UseGuards(JwtAuthGuard)
export class CadastrosController {
  constructor(private readonly cadastros: CadastrosService) {}

  @Get("fabricantes")
  fabricantes(@CurrentUser() user: AuthUser, @Query("q") q?: string) {
    return this.cadastros.fabricantes(user.estabelecimentoId, q);
  }

  @Get("modelos")
  modelos(
    @CurrentUser() user: AuthUser,
    @Query("fabricanteId") fabricanteId?: string,
    @Query("q") q?: string,
  ) {
    return this.cadastros.modelos(user.estabelecimentoId, fabricanteId, q);
  }

  @Get("setores")
  setores(@CurrentUser() user: AuthUser, @Query("q") q?: string) {
    return this.cadastros.setores(user.estabelecimentoId, q);
  }

  @Get("fornecedores")
  fornecedores(@CurrentUser() user: AuthUser, @Query("q") q?: string) {
    return this.cadastros.fornecedores(user.estabelecimentoId, q);
  }

  @Get("planos-descricao")
  planos(@CurrentUser() user: AuthUser, @Query("q") q?: string) {
    return this.cadastros.planosDescricao(user.estabelecimentoId, q);
  }

  @Get("centros-custo")
  centros(@CurrentUser() user: AuthUser) {
    return this.cadastros.centrosCusto(user.estabelecimentoId);
  }

  @Get("colaboradores")
  colaboradores(@CurrentUser() user: AuthUser, @Query("q") q?: string) {
    return this.cadastros.colaboradores(user.estabelecimentoId, q);
  }
}
