import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { JwtStrategy } from "./jwt.strategy";
import { PermissionsGuard } from "./permissions.guard";
import { PrismaModule } from "../prisma/prisma.module";

function resolveJwtSecret() {
  const secret = process.env.JWT_SECRET?.trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET é obrigatório em produção");
  }
  return "dev-secret-change-me";
}

@Module({
  imports: [
    PrismaModule,
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.register({
      secret: resolveJwtSecret(),
      signOptions: { expiresIn: "12h" },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    PermissionsGuard,
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [AuthService, JwtModule, PermissionsGuard],
})
export class AuthModule {}
