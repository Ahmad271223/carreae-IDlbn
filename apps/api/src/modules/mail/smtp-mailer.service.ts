import { Injectable, Logger } from "@nestjs/common";
import { branding } from "@careerid/branding";
import nodemailer, { type Transporter } from "nodemailer";
import { Mailer } from "./mailer";

@Injectable()
export class SmtpMailer extends Mailer {
  private readonly logger = new Logger(SmtpMailer.name);
  private readonly transport: Transporter;

  constructor() {
    super();
    this.transport = nodemailer.createTransport(
      process.env.SMTP_URL ?? "smtp://localhost:1025",
    );
  }

  async send(to: string, subject: string, text: string): Promise<void> {
    await this.transport.sendMail({
      from: `${branding.productName} <${branding.emailFrom}>`,
      to,
      subject,
      text,
    });
    this.logger.log(`Mail sent: "${subject}"`);
  }
}
