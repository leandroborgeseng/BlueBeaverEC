import { Module } from "@nestjs/common";
import { OsController } from "./os.controller";
import { OsDominiosController } from "./os-dominios.controller";
import { OsService } from "./os.service";
import { OsDominiosService } from "./os-dominios.service";
import { EstoqueModule } from "../estoque/estoque.module";

@Module({
  imports: [EstoqueModule],
  controllers: [OsController, OsDominiosController],
  providers: [OsService, OsDominiosService],
  exports: [OsService],
})
export class OsModule {}
