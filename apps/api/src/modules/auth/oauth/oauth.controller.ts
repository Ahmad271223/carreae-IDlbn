import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Body,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { branding } from "@careerid/branding";
import type { Request, Response } from "express";
import { CurrentAuth, SessionGuard } from "../session.guard";
import type { SessionContext } from "../session.service";
import { SESSION_COOKIE } from "../session.service";
import { CallbackResult, OauthService } from "./oauth.service";

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

@Controller("auth/oauth")
export class OauthController {
  constructor(private readonly oauth: OauthService) {}

  @Get(":provider/start")
  async start(
    @Param("provider") provider: string,
    @Res() res: Response,
  ): Promise<void> {
    const { url } = await this.oauth.start(provider, "LOGIN");
    res.redirect(302, url);
  }

  /** Linking is only available to an authenticated user (no silent linking). */
  @Post(":provider/link")
  @UseGuards(SessionGuard)
  async link(
    @Param("provider") provider: string,
    @CurrentAuth() auth: SessionContext,
  ): Promise<{ url: string }> {
    return this.oauth.start(provider, "LINK", auth.user.id);
  }

  @Get(":provider/callback")
  async callbackGet(
    @Param("provider") provider: string,
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.finish(provider, code, state, req, res);
  }

  /** Apple posts the callback (response_mode=form_post). */
  @Post(":provider/callback")
  async callbackPost(
    @Param("provider") provider: string,
    @Body("code") code: string | undefined,
    @Body("state") state: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.finish(provider, code, state, req, res);
  }

  private async finish(
    provider: string,
    code: string | undefined,
    state: string | undefined,
    req: Request,
    res: Response,
  ): Promise<void> {
    if (!code || !state) {
      throw new BadRequestException({ code: "OAUTH_CALLBACK_INVALID" });
    }
    const result: CallbackResult = await this.oauth.handleCallback(
      provider,
      code,
      state,
      { ip: req.ip, userAgent: req.headers["user-agent"] },
    );
    switch (result.kind) {
      case "session":
        res.cookie(SESSION_COOKIE, result.sessionToken, COOKIE_OPTIONS);
        res.redirect(302, `${branding.baseUrl}/`);
        return;
      case "conflict":
        // Existing email, no silent link: user must sign in and link explicitly.
        res.redirect(302, `${branding.baseUrl}/login?error=sso_account_exists`);
        return;
      case "linked":
        res.redirect(
          302,
          `${branding.baseUrl}/settings/security?linked=${result.provider}`,
        );
        return;
    }
  }
}
