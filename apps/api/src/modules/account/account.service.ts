import {
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import * as argon2 from "argon2";
import type { AccountEraseDto } from "@careerid/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { StorageService } from "../storage/storage.service";

/**
 * Export & erasure (SECURITY.md §4, Lebanon Law 81/2018 + GDPR).
 * Export is a faithful JSON aggregate of everything the user owns.
 * Erasure keeps issued credentials as the issuer's audit trail but points
 * them at an anonymized shell user; everything else in scope is
 * hard-deleted, including job descriptions of applications.
 */
@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  async export(userId: string): Promise<Record<string, unknown>> {
    const [
      user,
      profile,
      educations,
      experiences,
      skills,
      languages,
      documents,
      credentials,
      cvs,
      coverLetters,
      applications,
      shares,
      consents,
      verifications,
      notifications,
    ] = await this.prisma.$transaction([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { id: true, email: true, locale: true, createdAt: true },
      }),
      this.prisma.profile.findUnique({ where: { userId } }),
      this.prisma.education.findMany({ where: { userId, deletedAt: null } }),
      this.prisma.experience.findMany({ where: { userId, deletedAt: null } }),
      this.prisma.skill.findMany({ where: { userId, deletedAt: null } }),
      this.prisma.userLanguage.findMany({ where: { userId, deletedAt: null } }),
      this.prisma.document.findMany({
        where: { ownerUserId: userId, deletedAt: null },
        select: {
          id: true,
          fileName: true,
          mimeType: true,
          sizeBytes: true,
          category: true,
          scanStatus: true,
          checksumSha256: true,
          createdAt: true,
        },
      }),
      this.prisma.credential.findMany({
        where: { subjectUserId: userId },
        include: { issuer: { select: { name: true } } },
      }),
      this.prisma.cv.findMany({
        where: { userId, deletedAt: null },
        include: { items: { orderBy: { order: "asc" } } },
      }),
      this.prisma.coverLetter.findMany({
        where: { userId, deletedAt: null },
        include: { blocks: { orderBy: { order: "asc" } } },
      }),
      this.prisma.application.findMany({
        where: { userId, deletedAt: null },
        include: { items: { orderBy: { order: "asc" } } },
      }),
      this.prisma.sharePackage.findMany({
        where: { userId },
        // The token IS the live access secret — a downloaded export file
        // must never re-leak it.
        select: {
          id: true,
          applicationId: true,
          createdAt: true,
          expiresAt: true,
          revokedAt: true,
          viewCount: true,
        },
      }),
      this.prisma.consent.findMany({ where: { subjectUserId: userId } }),
      this.prisma.verificationRequest.findMany({
        where: { userId },
        select: {
          id: true,
          subjectType: true,
          subjectId: true,
          organizationId: true,
          status: true,
          requestedAt: true,
          respondedAt: true,
        },
      }),
      this.prisma.notification.findMany({ where: { userId } }),
    ]);

    await this.audit.append({
      actorType: "USER",
      actorId: userId,
      action: "account.exported",
      targetType: "user",
      targetId: userId,
    });

    return {
      exportedAt: new Date().toISOString(),
      user,
      profile,
      educations,
      experiences,
      skills,
      languages,
      documents,
      credentials: credentials.map(({ issuer, ...c }) => ({
        ...c,
        issuerName: issuer.name,
      })),
      cvs,
      coverLetters,
      applications,
      shares,
      consents,
      verificationRequests: verifications,
      notifications,
    };
  }

  async erase(userId: string, dto: AccountEraseDto): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    // Re-authentication: destroying an account must never ride on a stolen
    // session alone. Password accounts prove the password; SSO-only
    // accounts give an explicit confirmation.
    if (user.passwordHash) {
      const ok =
        typeof dto.password === "string" &&
        (await argon2.verify(user.passwordHash, dto.password));
      if (!ok) throw new ForbiddenException({ code: "REAUTH_REQUIRED" });
    } else if (dto.confirm !== true) {
      throw new ForbiddenException({ code: "REAUTH_REQUIRED" });
    }

    // Audit before anonymization so the event still names a real actor.
    await this.audit.append({
      actorType: "USER",
      actorId: userId,
      action: "account.erased",
      targetType: "user",
      targetId: userId,
    });

    const documents = await this.prisma.document.findMany({
      where: { ownerUserId: userId },
      select: { id: true, storageKey: true },
    });
    const documentIds = documents.map((d) => d.id);

    await this.prisma.$transaction([
      this.prisma.shareAccessLog.deleteMany({
        where: { sharePackage: { userId } },
      }),
      this.prisma.sharePackage.deleteMany({ where: { userId } }),
      this.prisma.consent.deleteMany({ where: { subjectUserId: userId } }),
      this.prisma.applicationItem.deleteMany({
        where: { application: { userId } },
      }),
      this.prisma.application.deleteMany({ where: { userId } }),
      this.prisma.renderJob.deleteMany({ where: { userId } }),
      this.prisma.documentVersion.deleteMany({
        where: { documentId: { in: documentIds } },
      }),
      this.prisma.coverLetterBlock.deleteMany({
        where: { coverLetter: { userId } },
      }),
      this.prisma.coverLetter.deleteMany({ where: { userId } }),
      this.prisma.cvItem.deleteMany({ where: { cv: { userId } } }),
      this.prisma.cv.deleteMany({ where: { userId } }),
      this.prisma.document.deleteMany({ where: { ownerUserId: userId } }),
      this.prisma.oauthState.deleteMany({ where: { userId } }),
      this.prisma.actionToken.deleteMany({ where: { userId } }),
      this.prisma.session.deleteMany({ where: { userId } }),
      this.prisma.authCredential.deleteMany({ where: { userId } }),
      this.prisma.identity.deleteMany({ where: { userId } }),
      this.prisma.notification.deleteMany({ where: { userId } }),
      this.prisma.verificationRequest.deleteMany({ where: { userId } }),
      this.prisma.education.deleteMany({ where: { userId } }),
      this.prisma.experience.deleteMany({ where: { userId } }),
      this.prisma.skill.deleteMany({ where: { userId } }),
      this.prisma.userLanguage.deleteMany({ where: { userId } }),
      this.prisma.organizationMember.deleteMany({ where: { userId } }),
      this.prisma.organizationRelationship.deleteMany({ where: { userId } }),
      this.prisma.profileSensitive.deleteMany({ where: { userId } }),
      this.prisma.profile.deleteMany({ where: { userId } }),
      // Credentials + status history stay (issuer audit integrity, §6) —
      // they now reference an anonymized shell.
      this.prisma.user.update({
        where: { id: userId },
        data: {
          status: "ERASED",
          deletedAt: new Date(),
          email: `erased-${userId}@erased.invalid`,
          phone: null,
          passwordHash: null,
          mfaEnabled: false,
        },
      }),
    ]);

    // Storage cleanup is best-effort after the DB is consistent; keys may
    // live in quarantine or documents depending on scan state.
    for (const document of documents) {
      for (const bucket of [
        process.env.S3_BUCKET_DOCUMENTS!,
        process.env.S3_BUCKET_QUARANTINE!,
      ]) {
        try {
          await this.storage.delete(bucket, document.storageKey);
        } catch {
          // Object may not exist in this bucket — fine.
        }
      }
    }
  }
}
