import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { branding } from "@careerid/branding";
import type { User } from "@prisma/client";
import { generateSecret, generateURI, verifySync } from "otplib";
import { PrismaService } from "../../prisma/prisma.service";
import { decrypt, encrypt } from "../../common/encryption";
import { AuditService } from "../audit/audit.service";

// One 30s time-step of clock-skew tolerance in each direction.
const EPOCH_TOLERANCE_SECONDS = 30;

function totpMatches(secret: string, code: string): boolean {
  return verifySync({
    secret,
    token: code,
    epochTolerance: EPOCH_TOLERANCE_SECONDS,
  }).valid;
}

@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Starts TOTP enrollment. The secret is returned exactly once (for the
   * authenticator app / QR); it is stored encrypted and never readable again.
   * Enrollment only becomes active after confirm() proves possession.
   */
  async enrollTotp(
    user: User,
  ): Promise<{ secret: string; otpauthUri: string }> {
    if (user.mfaEnabled) {
      throw new ConflictException({ code: "MFA_ALREADY_ENABLED" });
    }
    // A fresh enrollment supersedes any dangling unconfirmed one.
    await this.prisma.authCredential.updateMany({
      where: { userId: user.id, type: "TOTP", confirmedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const secret = generateSecret();
    await this.prisma.authCredential.create({
      data: {
        userId: user.id,
        type: "TOTP",
        secretEncrypted: encrypt(secret),
        label: "Authenticator app",
      },
    });
    return {
      secret,
      otpauthUri: generateURI({
        issuer: branding.productName,
        label: user.email,
        secret,
      }),
    };
  }

  async confirmTotp(user: User, code: string): Promise<void> {
    const pending = await this.prisma.authCredential.findFirst({
      where: { userId: user.id, type: "TOTP", confirmedAt: null, revokedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (!pending) throw new BadRequestException({ code: "NO_PENDING_ENROLLMENT" });
    if (!totpMatches(decrypt(pending.secretEncrypted), code)) {
      throw new BadRequestException({ code: "MFA_CODE_INVALID" });
    }
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.authCredential.update({
        where: { id: pending.id },
        data: { confirmedAt: now, lastUsedAt: now },
      }),
      this.prisma.user.update({
        where: { id: user.id },
        data: { mfaEnabled: true },
      }),
    ]);
    await this.audit.append({
      actorType: "USER",
      actorId: user.id,
      action: "auth.mfa_enabled",
      targetType: "user",
      targetId: user.id,
    });
  }

  /** Checks a code against the user's confirmed, unrevoked TOTP credentials. */
  async verifyCode(userId: string, code: string): Promise<boolean> {
    const credentials = await this.prisma.authCredential.findMany({
      where: { userId, type: "TOTP", confirmedAt: { not: null }, revokedAt: null },
    });
    for (const credential of credentials) {
      if (totpMatches(decrypt(credential.secretEncrypted), code)) {
        void this.prisma.authCredential
          .update({ where: { id: credential.id }, data: { lastUsedAt: new Date() } })
          .catch(() => undefined);
        return true;
      }
    }
    return false;
  }

  /** Disabling requires a valid current code — step-up, not just a session. */
  async disableTotp(user: User, code: string): Promise<void> {
    if (!user.mfaEnabled) throw new BadRequestException({ code: "MFA_NOT_ENABLED" });
    if (!(await this.verifyCode(user.id, code))) {
      throw new UnauthorizedException({ code: "MFA_CODE_INVALID" });
    }
    await this.prisma.$transaction([
      this.prisma.authCredential.updateMany({
        where: { userId: user.id, type: "TOTP", revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: user.id },
        data: { mfaEnabled: false },
      }),
    ]);
    await this.audit.append({
      actorType: "USER",
      actorId: user.id,
      action: "auth.mfa_disabled",
      targetType: "user",
      targetId: user.id,
    });
  }
}
