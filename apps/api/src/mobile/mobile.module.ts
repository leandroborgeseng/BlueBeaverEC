import { Module } from "@nestjs/common";
import { MobileController } from "./mobile.controller";
import { MobileService } from "./mobile.service";
import { OsModule } from "../os/os.module";
import { EquipamentosModule } from "../equipamentos/equipamentos.module";
import { EstoqueModule } from "../estoque/estoque.module";
import { SolicitacoesModule } from "../solicitacoes/solicitacoes.module";

@Module({
  imports: [OsModule, EquipamentosModule, EstoqueModule, SolicitacoesModule],
  controllers: [MobileController],
  providers: [MobileService],
})
export class MobileModule {}
