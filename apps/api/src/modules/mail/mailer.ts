/**
 * Injection token + contract for outbound mail. Tests substitute an in-memory
 * implementation; production uses SMTP (Mailpit in dev). Abstract class so it
 * can serve as a Nest DI token without extra decorators.
 */
export abstract class Mailer {
  abstract send(to: string, subject: string, text: string): Promise<void>;
}
