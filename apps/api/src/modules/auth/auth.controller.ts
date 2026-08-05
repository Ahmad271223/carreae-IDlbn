import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import {
  ForgotPasswordSchema,
  LoginSchema,
  RegisterSchema,
  ResetPasswordSchema,
  VerifyEmailSchema,
  type ForgotPasswordDto,
  type LoginDto,
  type RegisterDto,
  type ResetPasswordDto,
  type VerifyEmailDto,
} from "@careerid/shared";
import type { Request, Response } from "express";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { AuthService } from "./auth.service";
import { CurrentAuth, SessionGuard } from "./session.guard";
import {
  SESSION_COOKIE,
  SessionContext,
  SessionService,
} from "./session.service";

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

function requestMeta(req: Request): { ip?: string; userAgent?: string } {
  return { ip: req.ip, userAgent: req.headers["user-agent"] };
}

@Controller("auth")
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  @Post("register")
  @HttpCode(202)
  async register(
    @Body(new ZodValidationPipe(RegisterSchema)) dto: RegisterDto,
  ): Promise<{ message: string }> {
    await this.auth.register(dto);
    // Identical response whether or not the account already existed.
    return { message: "Check your inbox to continue." };
  }

  @Post("verify-email")
  @HttpCode(200)
  async verifyEmail(
    @Body(new ZodValidationPipe(VerifyEmailSchema)) dto: VerifyEmailDto,
  ): Promise<{ verified: true }> {
    await this.auth.verifyEmail(dto.token);
    return { verified: true };
  }

  @Post("login")
  @HttpCode(200)
  @Throttle({ default: { limit: authThrottleLimit(), ttl: 60_000 } })
  async login(
    @Body(new ZodValidationPipe(LoginSchema)) dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: { id: string; email: string; locale: string } }> {
    const { token, user } = await this.auth.login(dto, requestMeta(req));
    res.cookie(SESSION_COOKIE, token, COOKIE_OPTIONS);
    return { user: { id: user.id, email: user.email, locale: user.locale } };
  }

  @Post("logout")
  @HttpCode(204)
  @UseGuards(SessionGuard)
  async logout(
    @CurrentAuth() auth: SessionContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(auth.session.id, auth.user.id);
    res.clearCookie(SESSION_COOKIE, { path: "/" });
  }

  @Post("password/forgot")
  @HttpCode(202)
  async forgot(
    @Body(new ZodValidationPipe(ForgotPasswordSchema)) dto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
    await this.auth.forgotPassword(dto);
    return { message: "If the account exists, a reset mail was sent." };
  }

  @Post("password/reset")
  @HttpCode(200)
  async reset(
    @Body(new ZodValidationPipe(ResetPasswordSchema)) dto: ResetPasswordDto,
  ): Promise<{ reset: true }> {
    await this.auth.resetPassword(dto);
    return { reset: true };
  }

  @Get("me")
  @UseGuards(SessionGuard)
  me(@CurrentAuth() auth: SessionContext): {
    id: string;
    email: string;
    locale: string;
    emailVerified: boolean;
    mfaEnabled: boolean;
  } {
    return {
      id: auth.user.id,
      email: auth.user.email,
      locale: auth.user.locale,
      emailVerified: auth.user.emailVerifiedAt !== null,
      mfaEnabled: auth.user.mfaEnabled,
    };
  }

  @Get("sessions")
  @UseGuards(SessionGuard)
  async listSessions(@CurrentAuth() auth: SessionContext): Promise<{
    sessions: Array<{
      id: string;
      deviceName: string | null;
      createdAt: Date;
      lastSeenAt: Date;
      current: boolean;
    }>;
  }> {
    const sessions = await this.sessions.listActive(auth.user.id);
    return {
      sessions: sessions.map((s) => ({
        id: s.id,
        deviceName: s.deviceName,
        createdAt: s.createdAt,
        lastSeenAt: s.lastSeenAt,
        current: s.id === auth.session.id,
      })),
    };
  }

  @Delete("sessions/:id")
  @HttpCode(204)
  @UseGuards(SessionGuard)
  async revokeSession(
    @CurrentAuth() auth: SessionContext,
    @Param("id") id: string,
  ): Promise<void> {
    const owned = (await this.sessions.listActive(auth.user.id)).some(
      (s) => s.id === id,
    );
    // Same response shape for "not yours" and "not found" — no ID probing.
    if (!owned) throw new ForbiddenException({ code: "FORBIDDEN" });
    await this.sessions.revoke(id);
  }
}

function authThrottleLimit(): number {
  return Number(process.env.AUTH_THROTTLE_LIMIT ?? 10);
}
