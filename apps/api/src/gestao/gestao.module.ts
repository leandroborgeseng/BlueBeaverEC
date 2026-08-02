import { Module } from "@nestjs/common";
import { GestaoController } from "./gestao.controller";
import { GestaoService } from "./gestao.service";

@Module({
  controllers: [GestaoController],
  providers: [GestaoService],
})
export class GestaoModule {}
