import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { OrgVerifierGuard } from "./org-verifier.guard";
import {
  OrgVerificationsController,
  VerificationsController,
} from "./verification.controllers";
import { VerificationService } from "./verification.service";

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [VerificationsController, OrgVerificationsController],
  providers: [VerificationService, OrgVerifierGuard],
  exports: [VerificationService],
})
export class VerificationModule {}
