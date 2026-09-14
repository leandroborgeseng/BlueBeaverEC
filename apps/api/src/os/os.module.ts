import { Module } from "@nestjs/common";
import { OsController } from "./os.controller";
import { OsService } from "./os.service";
import { EstoqueModule } from "../estoque/estoque.module";

@Module({
  imports: [EstoqueModule],
  controllers: [OsController],
  providers: [OsService],
  exports: [OsService],
})
export class OsModule {}
