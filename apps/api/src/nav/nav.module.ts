import { Module } from "@nestjs/common";
import { NavController, NotificacoesController } from "./nav.controller";

@Module({
  controllers: [NavController, NotificacoesController],
})
export class NavModule {}
