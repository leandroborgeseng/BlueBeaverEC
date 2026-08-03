import { Controller, Get } from "@nestjs/common";
import { Public } from "../auth/permissions.guard";
import { PrismaService } from "../prisma/prisma.service";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: "ok", service: "aion-api" };
  }
}
