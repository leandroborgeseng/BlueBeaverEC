import { Module } from "@nestjs/common";
import { NavController, NotificacoesController } from "./nav.controller";
import { NavService } from "./nav.service";

@Module({
  controllers: [NavController, NotificacoesController],
  providers: [NavService],
})
export class NavModule {}
