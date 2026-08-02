import { Module } from "@nestjs/common";
import { MobileController } from "./mobile.controller";
import { MobileService } from "./mobile.service";
import { OsModule } from "../os/os.module";
import { EquipamentosModule } from "../equipamentos/equipamentos.module";

@Module({
  imports: [OsModule, EquipamentosModule],
  controllers: [MobileController],
  providers: [MobileService],
})
export class MobileModule {}
