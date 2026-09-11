import { Module } from "@nestjs/common";
import { SolicitacoesController } from "./solicitacoes.controller";
import { SolicitacoesService } from "./solicitacoes.service";

@Module({
  controllers: [SolicitacoesController],
  providers: [SolicitacoesService],
  exports: [SolicitacoesService],
})
export class SolicitacoesModule {}
