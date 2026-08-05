import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { MailModule } from "../mail/mail.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { SessionGuard } from "./session.guard";
import { SessionService } from "./session.service";

@Module({
  imports: [AuditModule, MailModule],
  controllers: [AuthController],
  providers: [AuthService, SessionService, SessionGuard],
  exports: [SessionService, SessionGuard],
})
export class AuthModule {}
