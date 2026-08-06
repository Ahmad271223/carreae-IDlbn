import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { branding } from "@careerid/branding";
import type { IssueCredentialDto, SupersedeCredentialDto } from "@careerid/shared";
import type {
  Credential,
  CredentialStatus,
  CredentialStatusHistory,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { Mailer } from "../mail/mailer";
import {
  CredentialSignature,
  SigningDocument,
  SigningService,
} from "./signing.service";

export type CredentialWithHistory = Credential & {
  statusHistory: CredentialStatusHistory[];
  issuerName: string;
};

function toSigningDocument(credential: {
  id: string;
  issuerOrganizationId: string;
  subjectUserId: string;
  credentialType: string;
  payload: unknown;
  issuedAt: Date;
  expiresAt: Date | null;
}): SigningDocument {
  return {
    id: credential.id,
    issuerOrganizationId: credential.issuerOrganizationId,
    subjectUserId: credential.subjectUserId,
    credentialType: credential.credentialType,
    payload: credential.payload,
    issuedAt: credential.issuedAt.toISOString(),
    expiresAt: credential.expiresAt?.toISOString() ?? null,
  };
}

@Injectable()
export class CredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly signing: SigningService,
    private readonly audit: AuditService,
    private readonly mailer: Mailer,
  ) {}

  // ---------- Issuing (org side; guard enforces role + VERIFIED org) ----------

  /**
   * Issues as an OFFER (M8): nothing lands on a profile until the subject
   * accepts. Subject is addressed by Career ID handle — organizations never
   * search the user base (§39). Idempotency-Key makes retries safe.
   */
  async issue(
    organizationId: string,
    issuerUserId: string,
    dto: IssueCredentialDto,
    idempotencyKey?: string,
  ): Promise<Credential> {
    if (idempotencyKey) {
      const existing = await this.prisma.credential.findUnique({
        where: {
          issuerOrganizationId_idempotencyKey: {
            issuerOrganizationId: organizationId,
            idempotencyKey,
          },
        },
      });
      if (existing) return existing;
    }

    const profile = await this.prisma.profile.findUnique({
      where: { slug: dto.subjectSlug },
    });
    if (!profile) throw new NotFoundException({ code: "SUBJECT_NOT_FOUND" });

    const issuedAt = dto.issuedAt ? new Date(dto.issuedAt) : new Date();
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;

    const credential = await this.prisma.$transaction(async (tx) => {
      const created = await tx.credential.create({
        data: {
          issuerOrganizationId: organizationId,
          subjectUserId: profile.userId,
          credentialType: dto.credentialType,
          payload: dto.payload as Prisma.InputJsonValue,
          countryCode: dto.countryCode ?? null,
          educationSystem: dto.educationSystem ?? null,
          credentialFramework: dto.credentialFramework ?? null,
          language: dto.language ?? null,
          issuedAt,
          expiresAt,
          status: "OFFERED",
          idempotencyKey: idempotencyKey ?? null,
          signature: {},
        },
      });
      const signature = this.signing.sign(toSigningDocument(created));
      const signed = await tx.credential.update({
        where: { id: created.id },
        data: { signature: signature as unknown as Prisma.InputJsonValue },
      });
      await tx.credentialStatusHistory.create({
        data: {
          credentialId: created.id,
          fromStatus: null,
          toStatus: "OFFERED",
          actorUserId: issuerUserId,
        },
      });
      return signed;
    });

    await this.audit.append({
      actorType: "ORG_MEMBER",
      actorId: issuerUserId,
      action: "credential.issued",
      targetType: "credential",
      targetId: credential.id,
      metadata: { organizationId, credentialType: dto.credentialType },
    });
    await this.notifySubject(
      profile.userId,
      "credential.offered",
      { credentialId: credential.id, credentialType: dto.credentialType },
      `${branding.productName}: a new credential was issued to you`,
      `An institution issued a credential to your ${branding.productName} account. ` +
        `Review and accept it in your wallet: ${branding.baseUrl}/wallet`,
    );
    return credential;
  }

  listIssued(organizationId: string): Promise<Credential[]> {
    return this.prisma.credential.findMany({
      where: { issuerOrganizationId: organizationId },
      orderBy: { createdAt: "desc" },
    });
  }

  async revoke(
    organizationId: string,
    credentialId: string,
    actorUserId: string,
    reason: string,
  ): Promise<Credential> {
    const credential = await this.issuedBy(organizationId, credentialId);
    if (credential.status !== "ACTIVE" && credential.status !== "OFFERED") {
      throw new ConflictException({ code: "NOT_REVOCABLE" });
    }
    const updated = await this.transition(
      credential,
      "REVOKED",
      actorUserId,
      reason,
    );
    await this.audit.append({
      actorType: "ORG_MEMBER",
      actorId: actorUserId,
      action: "credential.revoked",
      targetType: "credential",
      targetId: credentialId,
      metadata: { organizationId },
    });
    await this.notifySubject(
      credential.subjectUserId,
      "credential.revoked",
      { credentialId },
      `${branding.productName}: a credential was revoked`,
      `The issuing institution revoked one of your credentials. ` +
        `Details in your wallet: ${branding.baseUrl}/wallet`,
    );
    return updated;
  }

  /** Corrections never edit an issued credential — supersede + reissue (§6). */
  async supersede(
    organizationId: string,
    credentialId: string,
    actorUserId: string,
    dto: SupersedeCredentialDto,
  ): Promise<{ superseded: Credential; replacement: Credential }> {
    const credential = await this.issuedBy(organizationId, credentialId);
    if (credential.status !== "ACTIVE" && credential.status !== "OFFERED") {
      throw new ConflictException({ code: "NOT_SUPERSEDABLE" });
    }
    const profile = await this.prisma.profile.findUnique({
      where: { userId: credential.subjectUserId },
    });
    if (!profile) throw new ConflictException({ code: "SUBJECT_UNAVAILABLE" });

    const replacement = await this.issue(organizationId, actorUserId, {
      subjectSlug: profile.slug,
      credentialType: credential.credentialType,
      payload: dto.payload,
      countryCode: dto.countryCode ?? credential.countryCode ?? undefined,
      educationSystem:
        dto.educationSystem ?? credential.educationSystem ?? undefined,
      credentialFramework:
        dto.credentialFramework ?? credential.credentialFramework ?? undefined,
      language: dto.language ?? credential.language ?? undefined,
      issuedAt: dto.issuedAt,
      expiresAt: dto.expiresAt,
    });
    await this.prisma.credential.update({
      where: { id: credential.id },
      data: { supersededById: replacement.id },
    });
    const superseded = await this.transition(
      credential,
      "SUPERSEDED",
      actorUserId,
      dto.reason ?? "superseded",
    );
    await this.audit.append({
      actorType: "ORG_MEMBER",
      actorId: actorUserId,
      action: "credential.superseded",
      targetType: "credential",
      targetId: credential.id,
      metadata: { organizationId, replacementId: replacement.id },
    });
    return { superseded, replacement };
  }

  // ---------- Subject side ----------

  async listOwn(userId: string): Promise<CredentialWithHistory[]> {
    await this.expireDue(userId);
    const rows = await this.prisma.credential.findMany({
      where: { subjectUserId: userId },
      include: {
        statusHistory: { orderBy: { createdAt: "asc" } },
        issuer: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(({ issuer, ...row }) => ({ ...row, issuerName: issuer.name }));
  }

  async getOwn(userId: string, id: string): Promise<CredentialWithHistory> {
    await this.expireDue(userId);
    const row = await this.prisma.credential.findFirst({
      where: { id, subjectUserId: userId },
      include: {
        statusHistory: { orderBy: { createdAt: "asc" } },
        issuer: { select: { name: true } },
      },
    });
    if (!row) throw new NotFoundException({ code: "NOT_FOUND" });
    const { issuer, ...rest } = row;
    return { ...rest, issuerName: issuer.name };
  }

  async accept(userId: string, id: string): Promise<Credential> {
    await this.offeredTo(userId, id);
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.credential.update({
        where: { id },
        data: { status: "ACTIVE", acceptedAt: new Date() },
      });
      await tx.credentialStatusHistory.create({
        data: {
          credentialId: id,
          fromStatus: "OFFERED",
          toStatus: "ACTIVE",
          actorUserId: userId,
        },
      });
      return row;
    });
    await this.audit.append({
      actorType: "USER",
      actorId: userId,
      action: "credential.accepted",
      targetType: "credential",
      targetId: id,
    });
    return updated;
  }

  async decline(userId: string, id: string): Promise<Credential> {
    const credential = await this.offeredTo(userId, id);
    const updated = await this.transition(
      credential,
      "DECLINED_BY_SUBJECT",
      userId,
    );
    await this.audit.append({
      actorType: "USER",
      actorId: userId,
      action: "credential.declined",
      targetType: "credential",
      targetId: id,
    });
    return updated;
  }

  // ---------- Public verification ----------

  /**
   * Anonymous check for someone already holding the credential (e.g. via a
   * share): signature validity + CURRENT status. No subject PII is returned.
   */
  async publicVerify(id: string): Promise<{
    valid: boolean;
    status: CredentialStatus;
    credentialType: string;
    issuedAt: Date;
    expiresAt: Date | null;
    issuer: { name: string; verificationStatus: string };
    keyId: string | null;
  }> {
    const credential = await this.prisma.credential.findUnique({
      where: { id },
      include: {
        issuer: { select: { name: true, verificationStatus: true } },
      },
    });
    if (!credential) throw new NotFoundException({ code: "NOT_FOUND" });
    await this.expireOne(credential.id, credential.status, credential.expiresAt);

    const signature = credential.signature as unknown as CredentialSignature;
    const valid = this.signing.verify(toSigningDocument(credential), signature);
    const current = await this.prisma.credential.findUniqueOrThrow({
      where: { id },
      select: { status: true },
    });
    return {
      valid,
      status: current.status,
      credentialType: credential.credentialType,
      issuedAt: credential.issuedAt,
      expiresAt: credential.expiresAt,
      issuer: {
        name: credential.issuer.name,
        verificationStatus: credential.issuer.verificationStatus,
      },
      keyId: signature?.keyId ?? null,
    };
  }

  // ---------- Internals ----------

  private async issuedBy(
    organizationId: string,
    credentialId: string,
  ): Promise<Credential> {
    const credential = await this.prisma.credential.findFirst({
      where: { id: credentialId, issuerOrganizationId: organizationId },
    });
    if (!credential) throw new NotFoundException({ code: "NOT_FOUND" });
    return credential;
  }

  private async offeredTo(userId: string, id: string): Promise<Credential> {
    const credential = await this.prisma.credential.findFirst({
      where: { id, subjectUserId: userId },
    });
    if (!credential) throw new NotFoundException({ code: "NOT_FOUND" });
    if (credential.status !== "OFFERED") {
      throw new ConflictException({ code: "NOT_OFFERED" });
    }
    return credential;
  }

  private async transition(
    credential: Credential,
    toStatus: CredentialStatus,
    actorUserId: string | null,
    reason?: string,
  ): Promise<Credential> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.credential.update({
        where: { id: credential.id },
        data: { status: toStatus },
      });
      await tx.credentialStatusHistory.create({
        data: {
          credentialId: credential.id,
          fromStatus: credential.status,
          toStatus,
          actorUserId,
          reason: reason ?? null,
        },
      });
      return updated;
    });
  }

  private async expireDue(userId: string): Promise<void> {
    const due = await this.prisma.credential.findMany({
      where: {
        subjectUserId: userId,
        status: "ACTIVE",
        expiresAt: { lte: new Date() },
      },
    });
    for (const credential of due) {
      await this.transition(credential, "EXPIRED", null, "expired");
    }
  }

  private async expireOne(
    id: string,
    status: CredentialStatus,
    expiresAt: Date | null,
  ): Promise<void> {
    if (status === "ACTIVE" && expiresAt && expiresAt <= new Date()) {
      const credential = await this.prisma.credential.findUniqueOrThrow({
        where: { id },
      });
      await this.transition(credential, "EXPIRED", null, "expired");
    }
  }

  private async notifySubject(
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
      // Mail failure must not fail issuing; the in-app notification stands.
    }
  }
}
