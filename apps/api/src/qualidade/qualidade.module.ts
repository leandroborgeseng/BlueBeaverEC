import { Module } from "@nestjs/common";
import { QualidadeController } from "./qualidade.controller";
import { QualidadeService } from "./qualidade.service";

@Module({
  controllers: [QualidadeController],
  providers: [QualidadeService],
  exports: [QualidadeService],
})
export class QualidadeModule {}
