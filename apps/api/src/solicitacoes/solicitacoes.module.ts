import { Module } from "@nestjs/common";
import { SolicitacoesController } from "./solicitacoes.controller";
import { SolicitacoesService } from "./solicitacoes.service";
import { OsModule } from "../os/os.module";

@Module({
  imports: [OsModule],
  controllers: [SolicitacoesController],
  providers: [SolicitacoesService],
  exports: [SolicitacoesService],
})
export class SolicitacoesModule {}
