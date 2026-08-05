import { Injectable } from "@nestjs/common";
import type { Session, User } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { generateToken, sha256Hex } from "../../common/crypto";

export const SESSION_COOKIE = "cid.sid";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // absolute 30 days
const LAST_SEEN_REFRESH_MS = 5 * 60 * 1000;

export interface SessionContext {
  session: Session;
  user: User;
}

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  /** Creates a session and returns the RAW token — stored only as a hash. */
  async create(
    userId: string,
    meta: { deviceName?: string; ip?: string; userAgent?: string },
  ): Promise<{ token: string; session: Session }> {
    const token = generateToken();
    const session = await this.prisma.session.create({
      data: {
        userId,
        tokenHash: sha256Hex(token),
        deviceName: meta.deviceName ?? null,
        ipCreated: meta.ip ?? null,
        userAgent: meta.userAgent?.slice(0, 400) ?? null,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });
    return { token, session };
  }

  /** Resolves a raw cookie token to an active session + user, or null. */
  async resolve(token: string): Promise<SessionContext | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: sha256Hex(token) },
      include: { user: true },
    });
    if (!session) return null;
    if (session.revokedAt || session.expiresAt <= new Date()) return null;
    if (session.user.status !== "ACTIVE") return null;

    if (Date.now() - session.lastSeenAt.getTime() > LAST_SEEN_REFRESH_MS) {
      // Best-effort freshness marker; a failure here must not fail the request.
      void this.prisma.session
        .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
        .catch(() => undefined);
    }
    const { user, ...bare } = session;
    return { session: bare as Session, user };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async listActive(userId: string): Promise<Session[]> {
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: "desc" },
    });
  }
}
