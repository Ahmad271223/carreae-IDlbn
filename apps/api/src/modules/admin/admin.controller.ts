import {
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import type { OrgVerificationStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CurrentAuth, SessionGuard } from "../auth/session.guard";
import type { SessionContext } from "../auth/session.service";
import { AdminGuard } from "./admin.guard";

const DECISIONS: Record<string, OrgVerificationStatus> = {
  verify: "VERIFIED",
  reject: "REJECTED",
  suspend: "SUSPENDED",
};

@Controller("admin")
@UseGuards(SessionGuard, AdminGuard)
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get("organizations")
  organizations(@Query("status") status?: string) {
    return this.prisma.organization.findMany({
      where: {
        deletedAt: null,
        ...(status ? { verificationStatus: status as OrgVerificationStatus } : {}),
      },
      orderBy: { createdAt: "asc" },
    });
  }

  /** Organization trust decision (§44) — every action audited (§47). */
  @Post("organizations/:id/:decision")
  @HttpCode(200)
  async decide(
    @CurrentAuth() auth: SessionContext,
    @Param("id") id: string,
    @Param("decision") decision: string,
  ) {
    const status = DECISIONS[decision];
    if (!status) throw new NotFoundException({ code: "NOT_FOUND" });
    const organization = await this.prisma.organization.findFirst({
      where: { id, deletedAt: null },
    });
    if (!organization) throw new NotFoundException({ code: "NOT_FOUND" });

    const updated = await this.prisma.organization.update({
      where: { id },
      data: {
        verificationStatus: status,
        verifiedAt: status === "VERIFIED" ? new Date() : organization.verifiedAt,
        verifiedById: status === "VERIFIED" ? auth.user.id : organization.verifiedById,
      },
    });
    await this.audit.append({
      actorType: "ADMIN",
      actorId: auth.user.id,
      action: `organization.${decision}`,
      targetType: "organization",
      targetId: id,
    });
    const owners = await this.prisma.organizationMember.findMany({
      where: { organizationId: id, role: "OWNER", removedAt: null },
    });
    for (const owner of owners) {
      await this.prisma.notification.create({
        data: {
          userId: owner.userId,
          type: `organization.${decision}`,
          payload: { organizationId: id },
          channels: ["IN_APP", "EMAIL"],
        },
      });
    }
    return updated;
  }

  /** Tamper check over the full audit chain (§41). */
  @Get("audit/verify")
  async verifyChain() {
    return { valid: await this.audit.verifyChain() };
  }
}
