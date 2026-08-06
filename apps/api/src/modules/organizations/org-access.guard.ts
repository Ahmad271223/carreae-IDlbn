import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import type { OrganizationMember } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type { AuthenticatedRequest } from "../auth/session.guard";

export interface OrgRequest extends AuthenticatedRequest {
  orgMembership: OrganizationMember;
}

/**
 * Active membership in :orgId of a VERIFIED, undeleted organization; the
 * membership (incl. role) is attached for service-level role rules. Foreign
 * orgs and non-members get the same 403.
 */
@Injectable()
export class OrgAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<OrgRequest>();
    const orgId = (request.params as Record<string, string>).orgId;
    if (!orgId) throw new ForbiddenException({ code: "FORBIDDEN" });
    const membership = await this.prisma.organizationMember.findFirst({
      where: { organizationId: orgId, userId: request.auth.user.id, removedAt: null },
      include: {
        organization: { select: { verificationStatus: true, deletedAt: true } },
      },
    });
    if (
      !membership ||
      membership.organization.deletedAt ||
      membership.organization.verificationStatus !== "VERIFIED"
    ) {
      throw new ForbiddenException({ code: "FORBIDDEN" });
    }
    request.orgMembership = membership;
    return true;
  }
}
