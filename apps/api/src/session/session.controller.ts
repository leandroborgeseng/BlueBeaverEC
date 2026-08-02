import { Controller, Get, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { SessionService } from "./session.service";

@Controller("session")
@UseGuards(JwtAuthGuard)
export class SessionController {
  constructor(private readonly session: SessionService) {}

  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return this.session.me(user);
  }
}
