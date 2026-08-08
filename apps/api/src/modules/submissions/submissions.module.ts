import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { MailModule } from "../mail/mail.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { ShareModule } from "../share/share.module";
import {
  OrgSubmissionsController,
  SubmissionsController,
} from "./submissions.controllers";
import { SubmissionsService } from "./submissions.service";

@Module({
  imports: [AuditModule, AuthModule, MailModule, OrganizationsModule, ShareModule],
  controllers: [SubmissionsController, OrgSubmissionsController],
  providers: [SubmissionsService],
})
export class SubmissionsModule {}
