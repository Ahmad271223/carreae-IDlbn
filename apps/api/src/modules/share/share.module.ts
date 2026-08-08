import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { MailModule } from "../mail/mail.module";
import { StorageModule } from "../storage/storage.module";
import { PublicShareController, ShareController } from "./share.controllers";
import { ShareService } from "./share.service";
import { ViewerService } from "./viewer.service";

@Module({
  imports: [AuditModule, AuthModule, MailModule, StorageModule],
  controllers: [ShareController, PublicShareController],
  providers: [ShareService, ViewerService],
  exports: [ShareService, ViewerService],
})
export class ShareModule {}
