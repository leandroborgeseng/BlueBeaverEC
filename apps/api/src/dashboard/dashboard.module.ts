import { Module } from "@nestjs/common";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";
import { ContratosModule } from "../contratos/contratos.module";

@Module({
  imports: [ContratosModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
