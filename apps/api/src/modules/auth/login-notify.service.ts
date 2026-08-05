import { Injectable, Logger } from "@nestjs/common";
import { branding } from "@careerid/branding";
import { PrismaService } from "../../prisma/prisma.service";
import { Mailer } from "../mail/mailer";

/**
 * Suspicious-login heuristic (PRODUCT_REQUIREMENTS §7.1): a successful login
 * from a device we have never seen for this account (no earlier session with
 * the same user agent or origin IP) triggers an email + in-app notification.
 * The very first login of an account is not an anomaly. Deliberately coarse —
 * no fingerprinting infrastructure (SECURITY.md §4).
 */
@Injectable()
export class LoginNotifyService {
  private readonly logger = new Logger(LoginNotifyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: Mailer,
  ) {}

  async notifyIfNewDevice(
    userId: string,
    currentSessionId: string,
    meta: { ip?: string; userAgent?: string },
  ): Promise<void> {
    try {
      const priorCount = await this.prisma.session.count({
        where: { userId, id: { not: currentSessionId } },
      });
      if (priorCount === 0) return; // first login ever

      // User agent is the primary device signal; IP is only a fallback when
      // no user agent is present (same-network logins from a new browser must
      // still alert, so a matching IP alone never counts as "known").
      const knownDevice = await this.prisma.session.findFirst({
        where: {
          userId,
          id: { not: currentSessionId },
          ...(meta.userAgent
            ? { userAgent: meta.userAgent }
            : meta.ip
              ? { ipCreated: meta.ip }
              : {}),
        },
        select: { id: true },
      });
      if (knownDevice) return;

      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) return;

      await this.prisma.notification.create({
        data: {
          userId,
          type: "security.new_device_login",
          payload: { userAgent: meta.userAgent ?? null },
          channels: ["IN_APP", "EMAIL"],
        },
      });
      await this.mailer.send(
        user.email,
        `${branding.productName}: new login on your account`,
        `Your account was just signed in from a device we have not seen before.\n` +
          `If this was you, no action is needed. If not, reset your password and ` +
          `review your active sessions: ${branding.baseUrl}/settings/security`,
      );
    } catch (error) {
      // Detection must never break a legitimate login.
      this.logger.error(`new-device notification failed: ${String(error)}`);
    }
  }
}
