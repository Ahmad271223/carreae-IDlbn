import { Module } from "@nestjs/common";
import { Mailer } from "./mailer";
import { SmtpMailer } from "./smtp-mailer.service";

@Module({
  providers: [{ provide: Mailer, useClass: SmtpMailer }],
  exports: [Mailer],
})
export class MailModule {}
