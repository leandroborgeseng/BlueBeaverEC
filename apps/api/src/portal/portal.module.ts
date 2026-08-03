import { Module } from "@nestjs/common";
import { SessionModule } from "../session/session.module";
import { PortalController } from "./portal.controller";

@Module({
  imports: [SessionModule],
  controllers: [PortalController],
})
export class PortalModule {}
