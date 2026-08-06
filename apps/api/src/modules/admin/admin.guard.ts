import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/session.guard";

/**
 * Operator surface (§47): platformRole ADMIN only — a separate authorization
 * context, never a frontend state. MFA-mandatory policy and IP restriction
 * land with the trust-portal hardening milestone.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.auth.user.platformRole !== "ADMIN") {
      throw new ForbiddenException({ code: "FORBIDDEN" });
    }
    return true;
  }
}
