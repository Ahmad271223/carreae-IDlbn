import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  OrgInviteMemberDto,
  OrgRegisterDto,
  OrgRelationshipInviteDto,
} from "@careerid/shared";
import type {
  Organization,
  OrganizationMember,
  OrganizationRelationship,
  OrganizationRole,
} from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

const MANAGER_ROLES: OrganizationRole[] = ["OWNER", "ADMIN"];

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Registration → PENDING; issuing stays locked until admin approval (§44). */
  async register(userId: string, dto: OrgRegisterDto): Promise<Organization> {
    const organization = await this.prisma.organization.create({
      data: {
        type: dto.type,
        name: dto.name,
        legalName: dto.legalName ?? null,
        countryCode: dto.countryCode,
        educationSystem: dto.educationSystem ?? null,
        website: dto.website ?? null,
        members: { create: { userId, role: "OWNER" } },
      },
    });
    await this.audit.append({
      actorType: "USER",
      actorId: userId,
      action: "organization.registered",
      targetType: "organization",
      targetId: organization.id,
    });
    return organization;
  }

  /** Orgs the caller belongs to (any status — owners must see PENDING). */
  async mine(userId: string) {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId, removedAt: null },
      include: { organization: true },
    });
    return memberships.map((m) => ({ role: m.role, organization: m.organization }));
  }

  // ---------- Relationships (§7.3 — invite by handle/email, never search) ----------

  async inviteRelationship(
    orgId: string,
    dto: OrgRelationshipInviteDto,
  ): Promise<OrganizationRelationship> {
    const user = dto.handle
      ? (
          await this.prisma.profile.findUnique({ where: { slug: dto.handle } })
        )?.userId
      : (
          await this.prisma.user.findUnique({
            where: { email: dto.email!.toLowerCase() },
          })
        )?.id;
    if (!user) throw new NotFoundException({ code: "USER_NOT_FOUND" });

    const existing = await this.prisma.organizationRelationship.findUnique({
      where: {
        organizationId_userId_type: {
          organizationId: orgId,
          userId: user,
          type: dto.type,
        },
      },
    });
    if (existing && existing.status !== "DECLINED") {
      throw new ConflictException({ code: "RELATIONSHIP_EXISTS" });
    }

    const relationship = existing
      ? await this.prisma.organizationRelationship.update({
          where: { id: existing.id },
          data: { status: "INVITED", initiatedBy: "ORG" },
        })
      : await this.prisma.organizationRelationship.create({
          data: {
            organizationId: orgId,
            userId: user,
            type: dto.type,
            status: "INVITED",
            initiatedBy: "ORG",
          },
        });
    await this.prisma.notification.create({
      data: {
        userId: user,
        type: "relationship.invited",
        payload: { organizationId: orgId, type: dto.type },
        channels: ["IN_APP", "EMAIL"],
      },
    });
    return relationship;
  }

  /** Only the org's OWN relationships — never a view into the user base. */
  listRelationships(orgId: string): Promise<OrganizationRelationship[]> {
    return this.prisma.organizationRelationship.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
    });
  }

  async listOwnRelationships(userId: string) {
    const rows = await this.prisma.organizationRelationship.findMany({
      where: { userId },
      include: { organization: { select: { name: true, type: true } } },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(({ organization, ...row }) => ({
      ...row,
      organizationName: organization.name,
      organizationType: organization.type,
    }));
  }

  async respondRelationship(
    userId: string,
    id: string,
    accept: boolean,
  ): Promise<OrganizationRelationship> {
    const relationship = await this.prisma.organizationRelationship.findFirst({
      where: { id, userId, status: "INVITED" },
    });
    if (!relationship) throw new NotFoundException({ code: "NOT_FOUND" });
    return this.prisma.organizationRelationship.update({
      where: { id },
      data: { status: accept ? "ACTIVE" : "DECLINED" },
    });
  }

  // ---------- Team (§65 tests 11/12: escalation & takeover must fail) ----------

  listMembers(orgId: string): Promise<OrganizationMember[]> {
    return this.prisma.organizationMember.findMany({
      where: { organizationId: orgId, removedAt: null },
      orderBy: { joinedAt: "asc" },
    });
  }

  async addMember(
    orgId: string,
    caller: OrganizationMember,
    dto: OrgInviteMemberDto,
  ): Promise<OrganizationMember> {
    this.assertManager(caller);
    // Granting OWNER/ADMIN is an OWNER-only power (RBAC.md §2).
    if (MANAGER_ROLES.includes(dto.role) && caller.role !== "OWNER") {
      throw new ForbiddenException({ code: "OWNER_REQUIRED" });
    }
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (!user) throw new NotFoundException({ code: "USER_NOT_FOUND" });
    const existing = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId: user.id } },
    });
    if (existing && !existing.removedAt) {
      throw new ConflictException({ code: "ALREADY_MEMBER" });
    }
    const member = existing
      ? await this.prisma.organizationMember.update({
          where: { id: existing.id },
          data: { role: dto.role, removedAt: null, invitedById: caller.userId },
        })
      : await this.prisma.organizationMember.create({
          data: {
            organizationId: orgId,
            userId: user.id,
            role: dto.role,
            invitedById: caller.userId,
          },
        });
    await this.audit.append({
      actorType: "ORG_MEMBER",
      actorId: caller.userId,
      action: "organization.member_added",
      targetType: "organization",
      targetId: orgId,
      metadata: { memberUserId: user.id, role: dto.role },
    });
    return member;
  }

  async removeMember(
    orgId: string,
    caller: OrganizationMember,
    memberId: string,
  ): Promise<void> {
    this.assertManager(caller);
    const member = await this.prisma.organizationMember.findFirst({
      where: { id: memberId, organizationId: orgId, removedAt: null },
    });
    if (!member) throw new NotFoundException({ code: "NOT_FOUND" });
    if (member.role === "OWNER") {
      if (caller.role !== "OWNER") {
        throw new ForbiddenException({ code: "OWNER_REQUIRED" });
      }
      const owners = await this.prisma.organizationMember.count({
        where: { organizationId: orgId, role: "OWNER", removedAt: null },
      });
      if (owners <= 1) {
        throw new BadRequestException({ code: "LAST_OWNER" });
      }
    }
    await this.prisma.organizationMember.update({
      where: { id: member.id },
      data: { removedAt: new Date() },
    });
    await this.audit.append({
      actorType: "ORG_MEMBER",
      actorId: caller.userId,
      action: "organization.member_removed",
      targetType: "organization",
      targetId: orgId,
      metadata: { memberUserId: member.userId },
    });
  }

  private assertManager(caller: OrganizationMember): void {
    if (!MANAGER_ROLES.includes(caller.role)) {
      throw new ForbiddenException({ code: "FORBIDDEN" });
    }
  }
}
