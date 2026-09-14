import { Module } from "@nestjs/common";
import { AtendimentoExternoController, OsAtendimentoExternoController } from "./atendimento-externo.controller";
import { AtendimentoExternoService } from "./atendimento-externo.service";

@Module({
  controllers: [AtendimentoExternoController, OsAtendimentoExternoController],
  providers: [AtendimentoExternoService],
  exports: [AtendimentoExternoService],
})
export class AtendimentoExternoModule {}
