import {
  ForbiddenException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { branding } from "@careerid/branding";
import type { SharePackage } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { sha256Hex } from "../../common/crypto";
import { Mailer } from "../mail/mailer";
import { StorageService } from "../storage/storage.service";
import type {
  ViewerCredential,
  ViewerDocument,
  ViewerEntry,
  ViewerLetter,
  ViewerPayload,
} from "./viewer-payload";

function yearRange(start: Date, end: Date | null): string {
  return end
    ? `${start.getUTCFullYear()} – ${end.getUTCFullYear()}`
    : `${start.getUTCFullYear()} –`;
}

/**
 * Resolves a share token to the viewer projection. Every failure mode is
 * indistinguishable where it must be (unknown === revoked === expired ===
 * exhausted → 404/410 without detail), and the projection is built through
 * an allow-list only (§65 tests 4/5/6/13).
 */
@Injectable()
export class ViewerService {
  private readonly logger = new Logger(ViewerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly mailer: Mailer,
  ) {}

  /** Validates token + options; does NOT count a view yet. */
  private async resolvePackage(
    token: string,
    pin?: string,
  ): Promise<SharePackage> {
    const pkg = await this.prisma.sharePackage.findUnique({
      where: { tokenHash: sha256Hex(token) },
    });
    if (!pkg || pkg.revokedAt) throw new NotFoundException({ code: "NOT_FOUND" });
    if (pkg.expiresAt && pkg.expiresAt <= new Date()) {
      throw new GoneException({ code: "GONE" });
    }
    if (pkg.viewLimit !== null && pkg.viewCount >= pkg.viewLimit) {
      throw new GoneException({ code: "GONE" });
    }
    if (pkg.pinHash) {
      if (!pin || sha256Hex(pin) !== pkg.pinHash) {
        throw new UnauthorizedException({ code: "PIN_REQUIRED" });
      }
    }
    return pkg;
  }

  async view(
    token: string,
    meta: { ip?: string; pin?: string },
  ): Promise<ViewerPayload> {
    const pkg = await this.resolvePackage(token, meta.pin);
    const payload = await this.buildPayload(pkg);

    await this.prisma.sharePackage.update({
      where: { id: pkg.id },
      data: { viewCount: { increment: 1 } },
    });
    await this.prisma.shareAccessLog.create({
      data: {
        sharePackageId: pkg.id,
        sectionsViewed: Object.keys(payload.sections),
        ipCoarse: meta.ip ?? null,
      },
    });
    await this.notifyOwner(pkg);
    return payload;
  }

  /** Document bytes leave only when the package allows downloads. */
  async documentUrl(
    token: string,
    documentId: string,
    pin?: string,
  ): Promise<{ url: string }> {
    const pkg = await this.resolvePackage(token, pin);
    if (!pkg.downloadAllowed) {
      throw new ForbiddenException({ code: "DOWNLOAD_DISABLED" });
    }
    const attached = await this.attachedDocumentIds(pkg);
    if (!attached.has(documentId)) {
      throw new NotFoundException({ code: "NOT_FOUND" });
    }
    const document = await this.prisma.document.findFirst({
      where: {
        id: documentId,
        ownerUserId: pkg.userId,
        scanStatus: "CLEAN",
        deletedAt: null,
      },
    });
    if (!document) throw new NotFoundException({ code: "NOT_FOUND" });
    const url = await this.storage.presignDownload(
      this.storage.documentsBucket,
      document.storageKey,
      document.fileName,
      document.mimeType ?? undefined,
    );
    return { url };
  }

  /**
   * Allow-list projection. Verification is resolved LIVE (§34): only a
   * currently-VERIFIED request yields a badge; everything else yields
   * silence. No status enum ever crosses this boundary (§65 test 13).
   */
  private async buildPayload(pkg: SharePackage): Promise<ViewerPayload> {
    const application = await this.prisma.application.findFirst({
      where: { id: pkg.applicationId, deletedAt: null },
      include: { items: { orderBy: { order: "asc" } } },
    });
    if (!application) throw new NotFoundException({ code: "NOT_FOUND" });
    const profile = await this.prisma.profile.findUnique({
      where: { userId: pkg.userId },
    });

    const payload: ViewerPayload = {
      applicant: {
        name: profile ? `${profile.firstName} ${profile.lastName}` : "",
        headline: profile?.headline ?? undefined,
      },
      sections: {},
      credentials: [],
      documents: [],
      coverLetters: [],
    };

    for (const item of application.items) {
      switch (item.itemType) {
        case "SECTION":
          await this.addSection(payload, pkg.userId, item.itemId);
          break;
        case "CREDENTIAL": {
          const credential = await this.credentialView(pkg.userId, item.itemId);
          if (credential) payload.credentials.push(credential);
          break;
        }
        case "DOCUMENT": {
          const document = await this.prisma.document.findFirst({
            where: {
              id: item.itemId,
              ownerUserId: pkg.userId,
              scanStatus: "CLEAN",
              deletedAt: null,
            },
          });
          if (document) {
            payload.documents.push(this.documentView(document, pkg));
          }
          break;
        }
        case "CV": {
          // The viewer receives the rendered artifact, not the builder state.
          const version = await this.prisma.documentVersion.findFirst({
            where: { sourceType: "CV", sourceId: item.itemId },
            orderBy: { renderedAt: "desc" },
          });
          if (!version) break;
          const document = await this.prisma.document.findFirst({
            where: { id: version.documentId, deletedAt: null },
          });
          if (document) payload.documents.push(this.documentView(document, pkg));
          break;
        }
        case "COVER_LETTER": {
          const letter = await this.prisma.coverLetter.findFirst({
            where: { id: item.itemId, userId: pkg.userId, deletedAt: null },
            include: { blocks: { orderBy: { order: "asc" } } },
          });
          if (letter) {
            const view: ViewerLetter = {
              title: letter.title,
              paragraphs: letter.blocks
                .filter((b) => b.content.trim() !== "")
                .map((b) => b.content),
            };
            payload.coverLetters.push(view);
          }
          break;
        }
        default:
          break;
      }
    }
    return payload;
  }

  private async addSection(
    payload: ViewerPayload,
    userId: string,
    key: string,
  ): Promise<void> {
    if (key === "experience") {
      const rows = await this.prisma.experience.findMany({
        where: { userId, deletedAt: null },
        orderBy: { displayOrder: "asc" },
      });
      payload.sections.experience = await Promise.all(
        rows.map(async (row) => ({
          title: row.position,
          subtitle: row.companyName,
          dateRange: yearRange(row.startDate, row.endDate),
          description: row.description ?? undefined,
          ...(await this.badge("EXPERIENCE", row.id)),
        })),
      );
    } else if (key === "education") {
      const rows = await this.prisma.education.findMany({
        where: { userId, deletedAt: null },
        orderBy: { displayOrder: "asc" },
      });
      payload.sections.education = await Promise.all(
        rows.map(async (row) => ({
          title: row.degreeType,
          subtitle: row.institutionName + (row.grade ? ` — ${row.grade}` : ""),
          dateRange: yearRange(row.startDate, row.endDate),
          ...(await this.badge("EDUCATION", row.id)),
        })),
      );
    } else if (key === "languages") {
      const rows = await this.prisma.userLanguage.findMany({
        where: { userId, deletedAt: null },
        orderBy: { displayOrder: "asc" },
      });
      payload.sections.languages = await Promise.all(
        rows.map(async (row) => ({
          title: `${row.language} — ${row.level}`,
          ...(await this.badge("LANGUAGE", row.id)),
        })),
      );
    } else if (key === "skills") {
      const rows = await this.prisma.skill.findMany({
        where: { userId, deletedAt: null },
        orderBy: { displayOrder: "asc" },
      });
      payload.sections.skills = rows.map((row) => ({
        title: row.name,
        subtitle: row.level ?? undefined,
      }));
    }
    // "profile" is always represented by the applicant header.
  }

  /** Live two-state resolution: badge or nothing (§5). */
  private async badge(
    subjectType: "EDUCATION" | "EXPERIENCE" | "LANGUAGE",
    subjectId: string,
  ): Promise<{ badge?: ViewerEntry["badge"] }> {
    const verified = await this.prisma.verificationRequest.findFirst({
      where: { subjectType, subjectId, status: "VERIFIED" },
      include: { organization: { select: { name: true } } },
    });
    if (!verified?.respondedAt) return {};
    return {
      badge: {
        verifiedBy: verified.organization.name,
        verifiedAt: verified.respondedAt.toISOString().slice(0, 10),
      },
    };
  }

  private async credentialView(
    userId: string,
    credentialId: string,
  ): Promise<ViewerCredential | null> {
    const credential = await this.prisma.credential.findFirst({
      where: {
        id: credentialId,
        subjectUserId: userId,
        // Everything that was ever accepted stays visible with its CURRENT
        // status — a snapshot must never hide a revocation (§34).
        status: { in: ["ACTIVE", "EXPIRED", "REVOKED", "SUPERSEDED"] },
      },
      include: { issuer: { select: { name: true } } },
    });
    if (!credential) return null;
    return {
      credentialType: credential.credentialType,
      issuer: credential.issuer.name,
      issuedAt: credential.issuedAt.toISOString().slice(0, 10),
      status: credential.status,
      payload: credential.payload as Record<string, unknown>,
    };
  }

  private documentView(
    document: { id: string; fileName: string; category: string },
    pkg: SharePackage,
  ): ViewerDocument {
    return {
      id: document.id,
      fileName: document.fileName,
      category: document.category,
      downloadable: pkg.downloadAllowed,
    };
  }

  private async attachedDocumentIds(pkg: SharePackage): Promise<Set<string>> {
    const items = await this.prisma.applicationItem.findMany({
      where: { applicationId: pkg.applicationId },
    });
    const ids = new Set<string>();
    for (const item of items) {
      if (item.itemType === "DOCUMENT") ids.add(item.itemId);
      if (item.itemType === "CV") {
        const version = await this.prisma.documentVersion.findFirst({
          where: { sourceType: "CV", sourceId: item.itemId },
          orderBy: { renderedAt: "desc" },
        });
        if (version) ids.add(version.documentId);
      }
    }
    return ids;
  }

  /** §56: "Application viewed" — in-app + mail, never blocking the viewer. */
  private async notifyOwner(pkg: SharePackage): Promise<void> {
    try {
      await this.prisma.notification.create({
        data: {
          userId: pkg.userId,
          type: "share.viewed",
          payload: { sharePackageId: pkg.id },
          channels: ["IN_APP", "EMAIL"],
        },
      });
      const user = await this.prisma.user.findUnique({
        where: { id: pkg.userId },
      });
      if (user) {
        await this.mailer.send(
          user.email,
          `${branding.productName}: your application was viewed`,
          `A shared application of yours was just opened. See the access log in your dashboard.`,
        );
      }
    } catch (error) {
      this.logger.error(`view notification failed: ${String(error)}`);
    }
  }
}
