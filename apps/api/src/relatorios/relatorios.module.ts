import { Module } from "@nestjs/common";
import { EstrategicoModule } from "../estrategico/estrategico.module";
import { FinanceiroModule } from "../financeiro/financeiro.module";
import { RelatoriosController } from "./relatorios.controller";
import { RelatoriosService } from "./relatorios.service";

@Module({
  imports: [EstrategicoModule, FinanceiroModule],
  controllers: [RelatoriosController],
  providers: [RelatoriosService],
})
export class RelatoriosModule {}
