import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { MailModule } from "../mail/mail.module";
import { OrgVerifierGuard } from "../verification/org-verifier.guard";
import {
  CredentialsController,
  OrgCredentialsController,
} from "./credentials.controllers";
import { CredentialsService } from "./credentials.service";
import { SigningService } from "./signing.service";

@Module({
  imports: [AuditModule, AuthModule, MailModule],
  controllers: [CredentialsController, OrgCredentialsController],
  providers: [CredentialsService, SigningService, OrgVerifierGuard],
  exports: [CredentialsService],
})
export class CredentialsModule {}
