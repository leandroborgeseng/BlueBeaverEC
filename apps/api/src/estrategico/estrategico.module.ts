import { Module } from "@nestjs/common";
import { EstrategicoController } from "./estrategico.controller";
import { EstrategicoService } from "./estrategico.service";

@Module({
  controllers: [EstrategicoController],
  providers: [EstrategicoService],
  exports: [EstrategicoService],
})
export class EstrategicoModule {}
