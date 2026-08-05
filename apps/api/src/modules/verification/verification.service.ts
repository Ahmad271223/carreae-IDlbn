import {
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  Education,
  Experience,
  Prisma,
  UserLanguage,
  VerificationRequest,
} from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { canonicalJson } from "../../common/canonical";
import { sha256Hex } from "../../common/crypto";
import { AuditService } from "../audit/audit.service";
import {
  COVERED_FIELDS,
  VerifiableSubjectType,
  buildSnapshot,
} from "./coverage";

const REQUEST_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days (brief §5)

type SubjectEntity = Education | Experience | UserLanguage;

@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------- User side ----------

  async request(
    userId: string,
    subjectType: VerifiableSubjectType,
    subjectId: string,
    organizationId: string,
  ): Promise<VerificationRequest> {
    const subject = await this.loadSubject(userId, subjectType, subjectId);
    if (!subject) throw new NotFoundException({ code: "NOT_FOUND" });

    const organization = await this.prisma.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
    });
    // Only verified organizations may confirm anything (§44) — requesting
    // from an unverified one would just park the request, so we refuse early.
    if (!organization || organization.verificationStatus !== "VERIFIED") {
      throw new ConflictException({ code: "ORGANIZATION_NOT_VERIFIED" });
    }

    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile) throw new ConflictException({ code: "PROFILE_REQUIRED" });

    const open = await this.prisma.verificationRequest.findFirst({
      where: {
        subjectType,
        subjectId,
        organizationId,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
    });
    if (open) throw new ConflictException({ code: "REQUEST_ALREADY_PENDING" });

    const snapshot = buildSnapshot(
      subjectType,
      subject,
      `${profile.firstName} ${profile.lastName}`,
    );
    const request = await this.prisma.verificationRequest.create({
      data: {
        userId,
        subjectType,
        subjectId,
        organizationId,
        status: "PENDING",
        fieldSnapshot: snapshot as Prisma.InputJsonValue,
        fieldHash: sha256Hex(canonicalJson(snapshot)),
        expiresAt: new Date(Date.now() + REQUEST_TTL_MS),
      },
    });
    await this.audit.append({
      actorType: "USER",
      actorId: userId,
      action: "verification.requested",
      targetType: "verification_request",
      targetId: request.id,
      metadata: { subjectType, organizationId },
    });
    return request;
  }

  /** Owner view — includes DECLINED/EXPIRED/REVOKED (internal only, §5). */
  async listOwn(
    userId: string,
  ): Promise<Array<VerificationRequest & { organizationName: string }>> {
    await this.expireDue(userId);
    const rows = await this.prisma.verificationRequest.findMany({
      where: { userId },
      include: { organization: { select: { name: true } } },
      orderBy: { requestedAt: "desc" },
    });
    return rows.map(({ organization, ...row }) => ({
      ...row,
      organizationName: organization.name,
    }));
  }

  /** User withdraws a PENDING request or drops an existing VERIFIED badge. */
  async revokeOwn(userId: string, id: string): Promise<VerificationRequest> {
    const request = await this.prisma.verificationRequest.findFirst({
      where: { id, userId },
    });
    if (!request) throw new NotFoundException({ code: "NOT_FOUND" });
    if (request.status !== "PENDING" && request.status !== "VERIFIED") {
      throw new ConflictException({ code: "NOT_REVOCABLE" });
    }
    const updated = await this.prisma.verificationRequest.update({
      where: { id },
      data: {
        status: "REVOKED",
        revokedAt: new Date(),
        revokeReason: "revoked_by_user",
      },
    });
    await this.audit.append({
      actorType: "USER",
      actorId: userId,
      action: "verification.revoked",
      targetType: "verification_request",
      targetId: id,
      metadata: { previousStatus: request.status },
    });
    return updated;
  }

  // ---------- Organization side ----------

  /**
   * Queue for the verifier: the snapshot and nothing else — no user id, no
   * email, no profile access (M4). The snapshot IS the statement to confirm.
   */
  async listForOrganization(organizationId: string): Promise<
    Array<{
      id: string;
      subjectType: string;
      fieldSnapshot: unknown;
      requestedAt: Date;
      expiresAt: Date;
    }>
  > {
    await this.expireDueForOrg(organizationId);
    return this.prisma.verificationRequest.findMany({
      where: {
        organizationId,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        subjectType: true,
        fieldSnapshot: true,
        requestedAt: true,
        expiresAt: true,
      },
      orderBy: { requestedAt: "asc" },
    });
  }

  /**
   * Atomic confirmation: the endpoint takes no payload; what is confirmed is
   * exactly the stored snapshot. If the underlying entry changed since the
   * request, the hash no longer matches — the request dies instead of
   * verifying data nobody looked at.
   */
  async confirm(
    organizationId: string,
    requestId: string,
    respondedById: string,
  ): Promise<VerificationRequest> {
    const request = await this.loadPendingForOrg(organizationId, requestId);

    const subject = await this.loadSubject(
      request.userId,
      request.subjectType as VerifiableSubjectType,
      request.subjectId,
    );
    const profile = await this.prisma.profile.findUnique({
      where: { userId: request.userId },
    });
    const currentHash = subject && profile
      ? sha256Hex(
          canonicalJson(
            buildSnapshot(
              request.subjectType as VerifiableSubjectType,
              subject,
              `${profile.firstName} ${profile.lastName}`,
            ),
          ),
        )
      : null;

    if (currentHash !== request.fieldHash) {
      await this.prisma.verificationRequest.update({
        where: { id: request.id },
        data: {
          status: "REVOKED",
          revokedAt: new Date(),
          revokeReason: "subject_changed_since_request",
        },
      });
      throw new ConflictException({ code: "SNAPSHOT_STALE" });
    }

    const updated = await this.prisma.verificationRequest.update({
      where: { id: request.id },
      data: {
        status: "VERIFIED",
        respondedAt: new Date(),
        respondedById,
      },
    });
    await this.audit.append({
      actorType: "ORG_MEMBER",
      actorId: respondedById,
      action: "verification.confirmed",
      targetType: "verification_request",
      targetId: request.id,
      metadata: { organizationId },
    });
    return updated;
  }

  async decline(
    organizationId: string,
    requestId: string,
    respondedById: string,
  ): Promise<VerificationRequest> {
    const request = await this.loadPendingForOrg(organizationId, requestId);
    const updated = await this.prisma.verificationRequest.update({
      where: { id: request.id },
      data: {
        status: "DECLINED",
        respondedAt: new Date(),
        respondedById,
      },
    });
    await this.audit.append({
      actorType: "ORG_MEMBER",
      actorId: respondedById,
      action: "verification.declined",
      targetType: "verification_request",
      targetId: request.id,
      metadata: { organizationId },
    });
    return updated;
  }

  // ---------- Auto-reset (§5: verified data is immutable) ----------

  /**
   * Returns the VERIFIED request that must fall if any of `changedFields`
   * is covered for this subject — the caller revokes it in the same
   * transaction as the entity update.
   */
  async findResettableRequest(
    subjectType: VerifiableSubjectType,
    subjectId: string,
    changedFields: string[],
  ): Promise<VerificationRequest | null> {
    const covered = COVERED_FIELDS[subjectType] as readonly string[];
    if (!changedFields.some((field) => covered.includes(field))) return null;
    return this.prisma.verificationRequest.findFirst({
      where: { subjectType, subjectId, status: "VERIFIED" },
    });
  }

  async auditReset(userId: string, requestId: string): Promise<void> {
    await this.audit.append({
      actorType: "SYSTEM",
      action: "verification.reset",
      targetType: "verification_request",
      targetId: requestId,
      metadata: { cause: "verified_field_edited", editedBy: userId },
    });
  }

  // ---------- Internals ----------

  private async loadSubject(
    userId: string,
    subjectType: VerifiableSubjectType,
    subjectId: string,
  ): Promise<SubjectEntity | null> {
    const where = { id: subjectId, userId, deletedAt: null };
    switch (subjectType) {
      case "EDUCATION":
        return this.prisma.education.findFirst({ where });
      case "EXPERIENCE":
        return this.prisma.experience.findFirst({ where });
      case "LANGUAGE":
        return this.prisma.userLanguage.findFirst({ where });
    }
  }

  private async loadPendingForOrg(
    organizationId: string,
    requestId: string,
  ): Promise<VerificationRequest> {
    const request = await this.prisma.verificationRequest.findFirst({
      where: { id: requestId, organizationId },
    });
    if (!request) throw new NotFoundException({ code: "NOT_FOUND" });
    if (request.status === "PENDING" && request.expiresAt <= new Date()) {
      await this.prisma.verificationRequest.update({
        where: { id: request.id },
        data: { status: "EXPIRED" },
      });
      throw new GoneException({ code: "REQUEST_EXPIRED" });
    }
    if (request.status !== "PENDING") {
      throw new ConflictException({ code: "ALREADY_RESPONDED" });
    }
    return request;
  }

  private async expireDue(userId: string): Promise<void> {
    await this.prisma.verificationRequest.updateMany({
      where: { userId, status: "PENDING", expiresAt: { lte: new Date() } },
      data: { status: "EXPIRED" },
    });
  }

  private async expireDueForOrg(organizationId: string): Promise<void> {
    await this.prisma.verificationRequest.updateMany({
      where: {
        organizationId,
        status: "PENDING",
        expiresAt: { lte: new Date() },
      },
      data: { status: "EXPIRED" },
    });
  }
}
