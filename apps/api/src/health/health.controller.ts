import { Controller, Get } from "@nestjs/common";
import { Public } from "../auth/permissions.guard";
import { PrismaService } from "../prisma/prisma.service";

/** SHA curto em GET /api/health.version (Railway injeta RAILWAY_GIT_COMMIT_SHA). */
function gitSha() {
  const raw =
    process.env.RAILWAY_GIT_COMMIT_SHA?.trim() ||
    process.env.SOURCE_COMMIT?.trim() ||
    process.env.GIT_COMMIT?.trim() ||
    "";
  return raw ? raw.slice(0, 7) : null;
}

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: "ok", service: "aion-api", version: gitSha() };
  }
}
