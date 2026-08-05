import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { MailModule } from "../mail/mail.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { LoginNotifyService } from "./login-notify.service";
import { MfaService } from "./mfa.service";
import { OauthController } from "./oauth/oauth.controller";
import { OauthService, buildOidcClients } from "./oauth/oauth.service";
import { OIDC_CLIENTS } from "./oauth/oidc-client";
import { SessionGuard } from "./session.guard";
import { SessionService } from "./session.service";

@Module({
  imports: [AuditModule, MailModule],
  controllers: [AuthController, OauthController],
  providers: [
    AuthService,
    SessionService,
    SessionGuard,
    MfaService,
    LoginNotifyService,
    OauthService,
    { provide: OIDC_CLIENTS, useFactory: buildOidcClients },
  ],
  exports: [SessionService, SessionGuard],
})
export class AuthModule {}
