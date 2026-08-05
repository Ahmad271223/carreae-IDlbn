import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaService } from "../src/prisma/prisma.service";
import { configureApp } from "../src/app.setup";
import { Mailer } from "../src/modules/mail/mailer";

export interface CapturedMail {
  to: string;
  subject: string;
  text: string;
}

/** In-memory Mailer double — no SMTP in tests, no account-existence leaks via mail errors. */
export class FakeMailer extends Mailer {
  readonly sent: CapturedMail[] = [];

  async send(to: string, subject: string, text: string): Promise<void> {
    this.sent.push({ to, subject, text });
  }

  lastFor(to: string): CapturedMail | undefined {
    return [...this.sent].reverse().find((mail) => mail.to === to);
  }
}

export async function createTestApp(): Promise<{
  app: INestApplication;
  mailer: FakeMailer;
  prisma: PrismaService;
}> {
  // Import after env is settled so decorator-time config reads test values.
  const { AppModule } = await import("../src/app.module");
  const mailer = new FakeMailer();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Mailer)
    .useValue(mailer)
    .compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return { app, mailer, prisma: app.get(PrismaService) };
}

/** Deletes all rows in FK-safe order — full isolation between test files. */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.$transaction([
    prisma.actionToken.deleteMany(),
    prisma.session.deleteMany(),
    prisma.authCredential.deleteMany(),
    prisma.identity.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.verificationRequest.deleteMany(),
    prisma.education.deleteMany(),
    prisma.experience.deleteMany(),
    prisma.skill.deleteMany(),
    prisma.userLanguage.deleteMany(),
    prisma.organizationMember.deleteMany(),
    prisma.organizationRelationship.deleteMany(),
    prisma.profileSensitive.deleteMany(),
    prisma.profile.deleteMany(),
    prisma.organization.deleteMany(),
    prisma.auditEvent.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}

export function extractToken(text: string): string {
  const match = /token=([A-Za-z0-9_-]+)/.exec(text);
  if (!match?.[1]) throw new Error("no token found in mail text");
  return match[1];
}

export function sessionCookie(headers: Record<string, unknown>): string {
  const raw = headers["set-cookie"];
  const cookies = Array.isArray(raw) ? raw : [String(raw)];
  const cookie = cookies.find((c) => c.startsWith("cid.sid="));
  if (!cookie) throw new Error("session cookie not set");
  return cookie.split(";")[0]!;
}
