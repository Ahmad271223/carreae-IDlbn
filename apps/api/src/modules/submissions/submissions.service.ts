import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { branding } from "@careerid/branding";
import type { SubmissionStatusUpdateDto } from "@careerid/shared";
import type {
  ApplicationSubmission,
  OrganizationMember,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { generateToken, sha256Hex } from "../../common/crypto";
import { AuditService } from "../audit/audit.service";
import { Mailer } from "../mail/mailer";
import { ViewerService } from "../share/viewer.service";
import type { ViewerPayload } from "../share/viewer-payload";

/** RBAC.md: application inbox is OWNER/ADMIN/RECRUITER territory. */
const INBOX_ROLES = new Set(["OWNER", "ADMIN", "RECRUITER"]);

export interface InboxRow {
  id: string;
  status: string;
  note: string | null;
  submittedAt: Date;
  updatedAt: Date;
  applicationTitle: string;
  applicationType: string;
  applicantName: string;
}

@Injectable()
export class SubmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mailer: Mailer,
    private readonly viewer: ViewerService,
  ) {}

  /** VERIFIED employers only — the submit target list (§44). */
  listEmployers(): Promise<Array<{ id: string; name: string }>> {
    return this.prisma.organization.findMany({
      where: {
        type: "EMPLOYER",
        verificationStatus: "VERIFIED",
        deletedAt: null,
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  }

  /**
   * Submitting hands the employer a dedicated share package (consent object
   * included, §38) — the SAME projection and revocation semantics as a link
   * share, but without any raw token ever existing.
   */
  async submit(
    userId: string,
    applicationId: string,
    organizationId: string,
  ): Promise<ApplicationSubmission> {
    const application = await this.prisma.application.findFirst({
      where: { id: applicationId, userId, deletedAt: null },
    });
    if (!application) throw new NotFoundException({ code: "NOT_FOUND" });

    const organization = await this.prisma.organization.findFirst({
      where: {
        id: organizationId,
        type: "EMPLOYER",
        verificationStatus: "VERIFIED",
        deletedAt: null,
      },
    });
    if (!organization) throw new NotFoundException({ code: "NOT_FOUND" });

    const existing = await this.prisma.applicationSubmission.findUnique({
      where: {
        applicationId_organizationId: { applicationId, organizationId },
      },
    });
    if (existing && existing.status !== "WITHDRAWN") {
      throw new ConflictException({ code: "ALREADY_SUBMITTED" });
    }

    const submission = await this.prisma.$transaction(async (tx) => {
      // Dedicated package: no expiry while the application is in review; a
      // hash of a token nobody holds means no link-based access path.
      const pkg = await tx.sharePackage.create({
        data: {
          userId,
          applicationId,
          tokenHash: sha256Hex(generateToken()),
          downloadAllowed: true,
          expiresAt: null,
        },
      });
      await tx.consent.create({
        data: {
          subjectUserId: userId,
          recipient: organization.name,
          purpose: "application_submission",
          resources: {
            sharePackageId: pkg.id,
            applicationId,
            organizationId,
          } as Prisma.InputJsonValue,
        },
      });
      const created = existing
        ? await tx.applicationSubmission.update({
            where: { id: existing.id },
            data: { status: "RECEIVED", note: null, sharePackageId: pkg.id },
          })
        : await tx.applicationSubmission.create({
            data: { applicationId, organizationId, sharePackageId: pkg.id },
          });
      await tx.application.update({
        where: { id: applicationId },
        data: { status: "SENT" },
      });
      return created;
    });

    await this.audit.append({
      actorType: "USER",
      actorId: userId,
      action: "submission.created",
      targetType: "application_submission",
      targetId: submission.id,
      metadata: { applicationId, organizationId },
    });
    await this.notifyInboxMembers(
      organizationId,
      "submission.received",
      { submissionId: submission.id },
      `${branding.productName}: new application received`,
      `A new application arrived in your ${organization.name} inbox.`,
    );
    return submission;
  }

  /** Applicant view: submissions of one owned application. */
  async listForApplication(
    userId: string,
    applicationId: string,
  ): Promise<
    Array<{
      id: string;
      status: string;
      organizationName: string;
      submittedAt: Date;
      updatedAt: Date;
    }>
  > {
    const application = await this.prisma.application.findFirst({
      where: { id: applicationId, userId, deletedAt: null },
    });
    if (!application) throw new NotFoundException({ code: "NOT_FOUND" });
    const rows = await this.prisma.applicationSubmission.findMany({
      where: { applicationId },
      include: { organization: { select: { name: true } } },
      orderBy: { submittedAt: "desc" },
    });
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      organizationName: row.organization.name,
      submittedAt: row.submittedAt,
      updatedAt: row.updatedAt,
    }));
  }

  /** Applicant-only exit: withdraw + revoke the backing share package. */
  async withdraw(userId: string, id: string): Promise<ApplicationSubmission> {
    const submission = await this.prisma.applicationSubmission.findFirst({
      where: { id, application: { userId, deletedAt: null } },
    });
    if (!submission) throw new NotFoundException({ code: "NOT_FOUND" });
    if (submission.status === "WITHDRAWN") {
      throw new ConflictException({ code: "ALREADY_WITHDRAWN" });
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.sharePackage.updateMany({
        where: { id: submission.sharePackageId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return tx.applicationSubmission.update({
        where: { id },
        data: { status: "WITHDRAWN" },
      });
    });
    await this.audit.append({
      actorType: "USER",
      actorId: userId,
      action: "submission.withdrawn",
      targetType: "application_submission",
      targetId: id,
    });
    return updated;
  }

  // ---------- Employer side (OrgAccessGuard attaches the membership) ----------

  async inbox(membership: OrganizationMember): Promise<InboxRow[]> {
    this.assertInboxRole(membership);
    const rows = await this.prisma.applicationSubmission.findMany({
      where: { organizationId: membership.organizationId },
      include: {
        application: {
          select: { title: true, type: true, userId: true },
        },
      },
      orderBy: { submittedAt: "desc" },
    });
    const profiles = await this.prisma.profile.findMany({
      where: { userId: { in: rows.map((r) => r.application.userId) } },
      select: { userId: true, firstName: true, lastName: true },
    });
    const nameByUser = new Map(
      profiles.map((p) => [p.userId, `${p.firstName} ${p.lastName}`]),
    );
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      note: row.note,
      submittedAt: row.submittedAt,
      updatedAt: row.updatedAt,
      applicationTitle: row.application.title,
      applicationType: row.application.type,
      applicantName: nameByUser.get(row.application.userId) ?? "—",
    }));
  }

  /** The §65-tested projection, resolved server-side for the inbox. */
  async view(
    membership: OrganizationMember,
    id: string,
  ): Promise<ViewerPayload> {
    this.assertInboxRole(membership);
    const submission = await this.ownSubmission(membership, id);
    const pkg = await this.prisma.sharePackage.findUniqueOrThrow({
      where: { id: submission.sharePackageId },
    });
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: membership.organizationId },
      select: { name: true },
    });
    return this.viewer.viewPackage(pkg, { orgHint: organization.name });
  }

  async documentUrl(
    membership: OrganizationMember,
    id: string,
    documentId: string,
  ): Promise<{ url: string }> {
    this.assertInboxRole(membership);
    const submission = await this.ownSubmission(membership, id);
    const pkg = await this.prisma.sharePackage.findUniqueOrThrow({
      where: { id: submission.sharePackageId },
    });
    return this.viewer.documentUrlForPackage(pkg, documentId);
  }

  async setStatus(
    membership: OrganizationMember,
    id: string,
    dto: SubmissionStatusUpdateDto,
  ): Promise<ApplicationSubmission> {
    this.assertInboxRole(membership);
    const submission = await this.ownSubmission(membership, id);
    if (submission.status === "WITHDRAWN") {
      throw new ConflictException({ code: "WITHDRAWN" });
    }
    const updated = await this.prisma.applicationSubmission.update({
      where: { id },
      data: {
        status: dto.status,
        ...(dto.note !== undefined ? { note: dto.note } : {}),
      },
    });
    await this.audit.append({
      actorType: "ORG_MEMBER",
      actorId: membership.userId,
      action: "submission.status_changed",
      targetType: "application_submission",
      targetId: id,
      metadata: { organizationId: membership.organizationId, status: dto.status },
    });
    // §56: the applicant always sees state changes — in-app + mail.
    const application = await this.prisma.application.findUniqueOrThrow({
      where: { id: submission.applicationId },
      select: { userId: true, title: true },
    });
    await this.notifyUser(
      application.userId,
      "submission.status",
      { submissionId: id, status: dto.status },
      `${branding.productName}: application status updated`,
      `The status of your application "${application.title}" changed to ${dto.status}.`,
    );
    return updated;
  }

  // ---------- Internals ----------

  private assertInboxRole(membership: OrganizationMember): void {
    if (!INBOX_ROLES.has(membership.role)) {
      throw new ForbiddenException({ code: "FORBIDDEN" });
    }
  }

  /** Foreign submissions 404 like nonexistent ones (cross-tenant equality). */
  private async ownSubmission(
    membership: OrganizationMember,
    id: string,
  ): Promise<ApplicationSubmission> {
    const submission = await this.prisma.applicationSubmission.findFirst({
      where: { id, organizationId: membership.organizationId },
    });
    if (!submission) throw new NotFoundException({ code: "NOT_FOUND" });
    return submission;
  }

  private async notifyInboxMembers(
    organizationId: string,
    type: string,
    payload: Record<string, unknown>,
    subject: string,
    text: string,
  ): Promise<void> {
    const members = await this.prisma.organizationMember.findMany({
      where: {
        organizationId,
        removedAt: null,
        role: { in: ["OWNER", "ADMIN", "RECRUITER"] },
      },
    });
    for (const member of members) {
      await this.notifyUser(member.userId, type, payload, subject, text);
    }
  }

  private async notifyUser(
    userId: string,
    type: string,
    payload: Record<string, unknown>,
    subject: string,
    text: string,
  ): Promise<void> {
    await this.prisma.notification.create({
      data: {
        userId,
        type,
        payload: payload as Prisma.InputJsonValue,
        channels: ["IN_APP", "EMAIL"],
      },
    });
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;
    try {
      await this.mailer.send(user.email, subject, text);
    } catch {
      // Mail failure must never fail the pipeline action.
    }
  }
}
