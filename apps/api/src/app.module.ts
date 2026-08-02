import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { HealthModule } from "./health/health.module";
import { AuthModule } from "./auth/auth.module";
import { SessionModule } from "./session/session.module";
import { NavModule } from "./nav/nav.module";
import { CadastrosModule } from "./cadastros/cadastros.module";
import { EquipamentosModule } from "./equipamentos/equipamentos.module";
import { OsModule } from "./os/os.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { MobileModule } from "./mobile/mobile.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    AuthModule,
    SessionModule,
    NavModule,
    CadastrosModule,
    EquipamentosModule,
    OsModule,
    DashboardModule,
    MobileModule,
  ],
})
export class AppModule {}
