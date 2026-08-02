import { Module } from "@nestjs/common";
import { ProcedimentosController } from "./procedimentos.controller";
import { ProcedimentosService } from "./procedimentos.service";
import { LaudosController } from "./laudos.controller";
import { LaudosService } from "./laudos.service";
import { InstrumentosController } from "./instrumentos.controller";
import { InstrumentosService } from "./instrumentos.service";
import { CertificadosController } from "./certificados.controller";
import { FichaVidaController } from "./ficha-vida.controller";
import { OsModule } from "../os/os.module";
import { ContratosModule } from "../contratos/contratos.module";

@Module({
  imports: [OsModule, ContratosModule],
  controllers: [
    ProcedimentosController,
    LaudosController,
    InstrumentosController,
    CertificadosController,
    FichaVidaController,
  ],
  providers: [ProcedimentosService, LaudosService, InstrumentosService],
  exports: [LaudosService, ProcedimentosService, InstrumentosService],
})
export class LaudosModule {}
