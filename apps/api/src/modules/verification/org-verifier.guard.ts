import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import type { AuthenticatedRequest } from "../auth/session.guard";

/**
 * Authorizes org-scoped verifier routes: the caller must be an active member
 * of the :orgId organization with a responding role, and the organization
 * itself must be VERIFIED (suspended/pending orgs answer nothing, RBAC.md §2).
 * Runs after SessionGuard. Foreign orgs yield the same 403 as non-membership.
 */
@Injectable()
export class OrgVerifierGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const orgId = (request.params as Record<string, string>).orgId;
    if (!orgId) throw new ForbiddenException({ code: "FORBIDDEN" });

    const membership = await this.prisma.organizationMember.findFirst({
      where: {
        organizationId: orgId,
        userId: request.auth.user.id,
        removedAt: null,
        role: { in: ["OWNER", "ADMIN", "ISSUER"] },
      },
      include: { organization: { select: { verificationStatus: true, deletedAt: true } } },
    });
    if (
      !membership ||
      membership.organization.deletedAt ||
      membership.organization.verificationStatus !== "VERIFIED"
    ) {
      throw new ForbiddenException({ code: "FORBIDDEN" });
    }
    return true;
  }
}
