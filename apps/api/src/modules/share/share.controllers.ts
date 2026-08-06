import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { ShareCreateSchema, type ShareCreateDto } from "@careerid/shared";
import type { Request } from "express";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { CurrentAuth, SessionGuard } from "../auth/session.guard";
import type { SessionContext } from "../auth/session.service";
import { ShareService } from "./share.service";
import { ViewerService } from "./viewer.service";

@Controller()
@UseGuards(SessionGuard)
export class ShareController {
  constructor(private readonly shares: ShareService) {}

  @Post("applications/:id/share")
  @HttpCode(201)
  create(
    @CurrentAuth() auth: SessionContext,
    @Param("id") applicationId: string,
    @Body(new ZodValidationPipe(ShareCreateSchema)) dto: ShareCreateDto,
  ) {
    return this.shares.createForApplication(auth.user.id, applicationId, dto);
  }

  @Get("shares")
  list(@CurrentAuth() auth: SessionContext) {
    return this.shares.list(auth.user.id);
  }

  @Post("shares/:id/revoke")
  @HttpCode(200)
  revoke(@CurrentAuth() auth: SessionContext, @Param("id") id: string) {
    return this.shares.revoke(auth.user.id, id);
  }

  @Get("shares/:id/access-log")
  accessLog(@CurrentAuth() auth: SessionContext, @Param("id") id: string) {
    return this.shares.accessLog(auth.user.id, id);
  }

  @Get("consents")
  consents(@CurrentAuth() auth: SessionContext) {
    return this.shares.listConsents(auth.user.id);
  }

  @Post("consents/:id/revoke")
  @HttpCode(200)
  revokeConsent(@CurrentAuth() auth: SessionContext, @Param("id") id: string) {
    return this.shares.revokeConsent(auth.user.id, id);
  }
}

/** PUBLIC account-less viewer (§7.5, 3.8) — token is the only authority. */
@Controller("share")
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class PublicShareController {
  constructor(private readonly viewer: ViewerService) {}

  @Get(":token")
  view(
    @Param("token") token: string,
    @Query("pin") pin: string | undefined,
    @Req() req: Request,
  ) {
    return this.viewer.view(token, { ip: req.ip, pin });
  }

  /** PIN entry variant (§35). */
  @Post(":token/unlock")
  @HttpCode(200)
  unlock(
    @Param("token") token: string,
    @Body("pin") pin: string | undefined,
    @Req() req: Request,
  ) {
    return this.viewer.view(token, { ip: req.ip, pin });
  }

  @Get(":token/documents/:documentId")
  document(
    @Param("token") token: string,
    @Param("documentId") documentId: string,
    @Query("pin") pin: string | undefined,
  ) {
    return this.viewer.documentUrl(token, documentId, pin);
  }
}
