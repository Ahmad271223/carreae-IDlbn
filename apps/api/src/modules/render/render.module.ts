import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { StorageModule } from "../storage/storage.module";
import { RenderController } from "./render.controller";
import { RenderService } from "./render.service";
import { RenderWorker } from "./render.worker";
import { ResolversService } from "./resolvers.service";

@Module({
  imports: [AuditModule, AuthModule, StorageModule],
  controllers: [RenderController],
  providers: [ResolversService, RenderService, RenderWorker],
  exports: [RenderService],
})
export class RenderModule {}
