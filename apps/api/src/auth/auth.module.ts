import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { JwtStrategy } from "./jwt.strategy";
import { PermissionsGuard } from "./permissions.guard";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
  imports: [
    PrismaModule,
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? "dev-secret-change-me",
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
