import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { IsEmail, IsOptional, IsString, MinLength } from "class-validator";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { Public } from "./permissions.guard";
import type { Request } from "express";

class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(4)
  senha!: string;

  @IsOptional()
  @IsString()
  estabelecimentoId?: string;
}

class SwitchDto {
  @IsString()
  estabelecimentoId!: string;
}

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("login")
  login(@Body() body: LoginDto) {
    return this.auth.login(body.email, body.senha, body.estabelecimentoId);
  }

  @UseGuards(JwtAuthGuard)
  @Post("switch-estabelecimento")
  switchEstabelecimento(@Req() req: Request & { user: { userId: string } }, @Body() body: SwitchDto) {
    return this.auth.switchEstabelecimento(req.user.userId, body.estabelecimentoId);
  }

  @UseGuards(JwtAuthGuard)
  @Post("logout")
  logout(@Req() req: Request & { user: { userId: string } }) {
    return this.auth.logout(req.user.userId);
  }
}
