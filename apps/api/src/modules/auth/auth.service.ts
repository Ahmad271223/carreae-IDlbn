import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { branding } from "@careerid/branding";
import type {
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
} from "@careerid/shared";
import type { User } from "@prisma/client";
import * as argon2 from "argon2";
import { PrismaService } from "../../prisma/prisma.service";
import { generateToken, sha256Hex } from "../../common/crypto";
import { AuditService } from "../audit/audit.service";
import { Mailer } from "../mail/mailer";
import { SessionService } from "./session.service";

const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: Number(process.env.ARGON2_MEMORY_KIB ?? 65536),
  timeCost: 3,
  parallelism: 1,
} as const;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  /** Verified against when the account does not exist — keeps timing uniform. */
  private dummyHashPromise = argon2.hash(generateToken(), ARGON2_OPTIONS);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly mailer: Mailer,
  ) {}

  /**
   * Enumeration-safe: the response is identical whether or not the email is
   * already registered. Existing accounts get a notice mail instead of a
   * duplicate; the password is hashed in both paths to keep timing uniform.
   */
  async register(dto: RegisterDto): Promise<void> {
    const passwordHash = await argon2.hash(dto.password, ARGON2_OPTIONS);
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      await this.sendSafely(
        dto.email,
        `${branding.productName}: account already exists`,
        `Someone tried to register with this email address, but an account already exists. ` +
          `If this was you, use "Forgot password" to regain access. Otherwise you can ignore this mail.`,
      );
      return;
    }

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        locale: dto.locale ?? "en",
      },
    });
    await this.audit.append({
      actorType: "USER",
      actorId: user.id,
      action: "user.registered",
      targetType: "user",
      targetId: user.id,
    });
    await this.issueEmailVerification(user);
  }

  async verifyEmail(rawToken: string): Promise<void> {
    const now = new Date();
    const token = await this.prisma.actionToken.findUnique({
      where: { tokenHash: sha256Hex(rawToken) },
      include: { user: true },
    });
    if (
      !token ||
      token.type !== "EMAIL_VERIFY" ||
      token.usedAt ||
      token.expiresAt <= now
    ) {
      throw new BadRequestException({ code: "TOKEN_INVALID" });
    }
    await this.prisma.$transaction([
      this.prisma.actionToken.update({
        where: { id: token.id },
        data: { usedAt: now },
      }),
      this.prisma.user.update({
        where: { id: token.userId },
        data: { emailVerifiedAt: token.user.emailVerifiedAt ?? now },
      }),
    ]);
    await this.audit.append({
      actorType: "USER",
      actorId: token.userId,
      action: "auth.email_verified",
      targetType: "user",
      targetId: token.userId,
    });
  }

  /** Generic 401 for unknown email, wrong password, or non-ACTIVE account. */
  async login(
    dto: LoginDto,
    meta: { ip?: string; userAgent?: string },
  ): Promise<{ token: string; user: User }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    const hashToCheck = user?.passwordHash ?? (await this.dummyHashPromise);
    let passwordOk = false;
    try {
      passwordOk = await argon2.verify(hashToCheck, dto.password);
    } catch {
      passwordOk = false;
    }

    if (!user || !user.passwordHash || !passwordOk || user.status !== "ACTIVE") {
      await this.audit.append({
        actorType: "SYSTEM",
        action: "auth.login_failed",
        metadata: { emailHash: sha256Hex(dto.email) },
        ipCoarse: meta.ip ?? null,
      });
      throw new UnauthorizedException({ code: "INVALID_CREDENTIALS" });
    }

    const { token } = await this.sessions.create(user.id, {
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    await this.audit.append({
      actorType: "USER",
      actorId: user.id,
      action: "auth.login",
      ipCoarse: meta.ip ?? null,
    });
    return { token, user };
  }

  async logout(sessionId: string, userId: string): Promise<void> {
    await this.sessions.revoke(sessionId);
    await this.audit.append({
      actorType: "USER",
      actorId: userId,
      action: "auth.logout",
      targetType: "session",
      targetId: sessionId,
    });
  }

  /** Always resolves; whether the account exists is never observable. */
  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) return;

    // Outstanding reset tokens die when a new one is requested.
    await this.prisma.actionToken.updateMany({
      where: { userId: user.id, type: "PASSWORD_RESET", usedAt: null },
      data: { usedAt: new Date() },
    });
    const raw = generateToken();
    await this.prisma.actionToken.create({
      data: {
        userId: user.id,
        type: "PASSWORD_RESET",
        tokenHash: sha256Hex(raw),
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      },
    });
    await this.sendSafely(
      user.email,
      `${branding.productName}: reset your password`,
      `Reset your password within 30 minutes: ${branding.baseUrl}/reset-password?token=${raw}\n` +
        `If you did not request this, you can ignore this mail.`,
    );
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const now = new Date();
    const token = await this.prisma.actionToken.findUnique({
      where: { tokenHash: sha256Hex(dto.token) },
    });
    if (
      !token ||
      token.type !== "PASSWORD_RESET" ||
      token.usedAt ||
      token.expiresAt <= now
    ) {
      throw new BadRequestException({ code: "TOKEN_INVALID" });
    }
    const passwordHash = await argon2.hash(dto.newPassword, ARGON2_OPTIONS);
    await this.prisma.$transaction([
      this.prisma.actionToken.update({
        where: { id: token.id },
        data: { usedAt: now },
      }),
      this.prisma.user.update({
        where: { id: token.userId },
        data: { passwordHash },
      }),
    ]);
    // A reset invalidates every existing session (SECURITY.md §2).
    await this.sessions.revokeAllForUser(token.userId);
    await this.audit.append({
      actorType: "USER",
      actorId: token.userId,
      action: "auth.password_reset",
      targetType: "user",
      targetId: token.userId,
    });
  }

  private async issueEmailVerification(user: User): Promise<void> {
    const raw = generateToken();
    await this.prisma.actionToken.create({
      data: {
        userId: user.id,
        type: "EMAIL_VERIFY",
        tokenHash: sha256Hex(raw),
        expiresAt: new Date(Date.now() + EMAIL_VERIFY_TTL_MS),
      },
    });
    await this.sendSafely(
      user.email,
      `${branding.productName}: verify your email`,
      `Welcome! Verify your email address: ${branding.baseUrl}/verify-email?token=${raw}`,
    );
  }

  /** Mail failure must never break the flow or leak account existence. */
  private async sendSafely(
    to: string,
    subject: string,
    text: string,
  ): Promise<void> {
    try {
      await this.mailer.send(to, subject, text);
    } catch (error) {
      this.logger.error(`Mail delivery failed: ${String(error)}`);
    }
  }
}
