import { Module } from "@nestjs/common";
import { SessionModule } from "../session/session.module";
import { OsModule } from "../os/os.module";
import { LaudosModule } from "../laudos/laudos.module";
import { PortalController } from "./portal.controller";

@Module({
  imports: [SessionModule, OsModule, LaudosModule],
  controllers: [PortalController],
})
export class PortalModule {}
