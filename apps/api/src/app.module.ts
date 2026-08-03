import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
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
import { SolicitacoesModule } from "./solicitacoes/solicitacoes.module";
import { EstoqueModule } from "./estoque/estoque.module";
import { LaudosModule } from "./laudos/laudos.module";
import { ContratosModule } from "./contratos/contratos.module";
import { PessoasModule } from "./pessoas/pessoas.module";
import { AuditoriasModule } from "./auditorias/auditorias.module";
import { EstrategicoModule } from "./estrategico/estrategico.module";
import { IndicadoresModule } from "./indicadores/indicadores.module";
import { FinanceiroModule } from "./financeiro/financeiro.module";
import { GestaoModule } from "./gestao/gestao.module";
import { RelatoriosModule } from "./relatorios/relatorios.module";
import { ConfigAppModule } from "./config/config.module";
import { PortalModule } from "./portal/portal.module";
import { PlanosModule } from "./planos/planos.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Senhas em DATABASE_URL podem conter `$`; expansão corrompe a URL.
      expandVariables: false,
      ignoreEnvFile: process.env.NODE_ENV === "production",
    }),
    ScheduleModule.forRoot(),
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
    SolicitacoesModule,
    EstoqueModule,
    LaudosModule,
    ContratosModule,
    PessoasModule,
    AuditoriasModule,
    EstrategicoModule,
    IndicadoresModule,
    FinanceiroModule,
    GestaoModule,
    RelatoriosModule,
    ConfigAppModule,
    PortalModule,
    PlanosModule,
  ],
})
export class AppModule {}
