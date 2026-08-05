import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from "@nestjs/common";
import type { Request } from "express";
import { SESSION_COOKIE, SessionContext, SessionService } from "./session.service";

export interface AuthenticatedRequest extends Request {
  auth: SessionContext;
}

/**
 * Deny-by-default session authentication. Applied per controller/route —
 * there is no "public unless stated" mode for authenticated resources.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = (request.cookies as Record<string, string> | undefined)?.[
      SESSION_COOKIE
    ];
    if (!token) throw new UnauthorizedException({ code: "UNAUTHENTICATED" });

    const resolved = await this.sessions.resolve(token);
    if (!resolved) throw new UnauthorizedException({ code: "UNAUTHENTICATED" });

    request.auth = resolved;
    return true;
  }
}

export const CurrentAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SessionContext => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.auth;
  },
);
