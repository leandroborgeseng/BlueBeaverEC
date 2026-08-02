import { Module } from "@nestjs/common";
import { OrganizacaoConfigController } from "./organizacao-config.controller";
import { OrganizacaoConfigService } from "./organizacao-config.service";

@Module({
  controllers: [OrganizacaoConfigController],
  providers: [OrganizacaoConfigService],
})
export class ConfigAppModule {}
