import { Injectable, NotFoundException } from "@nestjs/common";
import { branding } from "@careerid/branding";
import type { Consent, Prisma, SharePackage } from "@prisma/client";
import * as QRCode from "qrcode";
import { PrismaService } from "../../prisma/prisma.service";
import { generateToken, sha256Hex } from "../../common/crypto";
import { AuditService } from "../audit/audit.service";
import type { ShareCreateDto } from "@careerid/shared";

const DEFAULT_EXPIRY_DAYS = 7;

@Injectable()
export class ShareService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Creates the share package plus the consent object that authorizes it
   * (§38). The raw token exists exactly once — in this response and in the
   * QR code, which encodes nothing but the share URL (§37).
   */
  async createForApplication(
    userId: string,
    applicationId: string,
    dto: ShareCreateDto,
  ): Promise<{
    id: string;
    url: string;
    qrSvg: string;
    expiresAt: Date | null;
    consentId: string;
  }> {
    const application = await this.prisma.application.findFirst({
      where: { id: applicationId, userId, deletedAt: null },
    });
    if (!application) throw new NotFoundException({ code: "NOT_FOUND" });

    const token = generateToken();
    const expiresAt =
      dto.expiresInDays === null
        ? null
        : new Date(
            Date.now() +
              (dto.expiresInDays ?? DEFAULT_EXPIRY_DAYS) * 24 * 60 * 60 * 1000,
          );

    const pkg = await this.prisma.sharePackage.create({
      data: {
        userId,
        applicationId,
        tokenHash: sha256Hex(token),
        downloadAllowed: dto.downloadAllowed ?? true,
        viewLimit: dto.expireOnFirstView ? 1 : (dto.viewLimit ?? null),
        pinHash: dto.pin ? sha256Hex(dto.pin) : null,
        expiresAt,
      },
    });
    const consent = await this.prisma.consent.create({
      data: {
        subjectUserId: userId,
        recipient: application.recipientName ?? "share link",
        purpose: "application_view",
        resources: {
          sharePackageId: pkg.id,
          applicationId,
        } as Prisma.InputJsonValue,
        expiresAt,
      },
    });
    await this.audit.append({
      actorType: "USER",
      actorId: userId,
      action: "share.created",
      targetType: "share_package",
      targetId: pkg.id,
      metadata: { applicationId },
    });

    const url = `${branding.baseUrl}${branding.sharePath}/${token}`;
    const qrSvg = await QRCode.toString(url, { type: "svg", margin: 1 });
    return { id: pkg.id, url, qrSvg, expiresAt, consentId: consent.id };
  }

  list(userId: string): Promise<SharePackage[]> {
    return this.prisma.sharePackage.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Server-side and immediate (§35) — the next token lookup already fails. */
  async revoke(userId: string, id: string): Promise<SharePackage> {
    const pkg = await this.prisma.sharePackage.findFirst({
      where: { id, userId },
    });
    if (!pkg) throw new NotFoundException({ code: "NOT_FOUND" });
    const updated = await this.prisma.sharePackage.update({
      where: { id },
      data: { revokedAt: pkg.revokedAt ?? new Date() },
    });
    await this.audit.append({
      actorType: "USER",
      actorId: userId,
      action: "share.revoked",
      targetType: "share_package",
      targetId: id,
    });
    return updated;
  }

  async accessLog(userId: string, id: string) {
    const pkg = await this.prisma.sharePackage.findFirst({
      where: { id, userId },
    });
    if (!pkg) throw new NotFoundException({ code: "NOT_FOUND" });
    return this.prisma.shareAccessLog.findMany({
      where: { sharePackageId: id },
      orderBy: { accessedAt: "desc" },
    });
  }

  // ---------- Consents (§38) ----------

  listConsents(userId: string): Promise<Consent[]> {
    return this.prisma.consent.findMany({
      where: { subjectUserId: userId },
      orderBy: { grantedAt: "desc" },
    });
  }

  /** Revoking the consent also revokes the share it authorizes. */
  async revokeConsent(userId: string, id: string): Promise<Consent> {
    const consent = await this.prisma.consent.findFirst({
      where: { id, subjectUserId: userId },
    });
    if (!consent) throw new NotFoundException({ code: "NOT_FOUND" });
    const updated = await this.prisma.consent.update({
      where: { id },
      data: { revokedAt: consent.revokedAt ?? new Date() },
    });
    const resources = consent.resources as { sharePackageId?: string };
    if (resources.sharePackageId) {
      await this.prisma.sharePackage.updateMany({
        where: { id: resources.sharePackageId, userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await this.audit.append({
      actorType: "USER",
      actorId: userId,
      action: "consent.revoked",
      targetType: "consent",
      targetId: id,
    });
    return updated;
  }
}
