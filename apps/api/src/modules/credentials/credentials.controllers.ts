import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  IssueCredentialSchema,
  RevokeCredentialSchema,
  SupersedeCredentialSchema,
  type IssueCredentialDto,
  type RevokeCredentialDto,
  type SupersedeCredentialDto,
} from "@careerid/shared";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { CurrentAuth, SessionGuard } from "../auth/session.guard";
import type { SessionContext } from "../auth/session.service";
import { OrgVerifierGuard } from "../verification/org-verifier.guard";
import { CredentialsService } from "./credentials.service";

@Controller("credentials")
export class CredentialsController {
  constructor(private readonly credentials: CredentialsService) {}

  @Get()
  @UseGuards(SessionGuard)
  list(@CurrentAuth() auth: SessionContext) {
    return this.credentials.listOwn(auth.user.id);
  }

  /** PUBLIC: signature + live status for holders of the credential id. */
  @Get(":id/verify")
  publicVerify(@Param("id") id: string) {
    return this.credentials.publicVerify(id);
  }

  @Get(":id")
  @UseGuards(SessionGuard)
  get(@CurrentAuth() auth: SessionContext, @Param("id") id: string) {
    return this.credentials.getOwn(auth.user.id, id);
  }

  @Post(":id/accept")
  @HttpCode(200)
  @UseGuards(SessionGuard)
  accept(@CurrentAuth() auth: SessionContext, @Param("id") id: string) {
    return this.credentials.accept(auth.user.id, id);
  }

  @Post(":id/decline")
  @HttpCode(200)
  @UseGuards(SessionGuard)
  decline(@CurrentAuth() auth: SessionContext, @Param("id") id: string) {
    return this.credentials.decline(auth.user.id, id);
  }
}

@Controller("org/:orgId/credentials")
@UseGuards(SessionGuard, OrgVerifierGuard)
export class OrgCredentialsController {
  constructor(private readonly credentials: CredentialsService) {}

  @Post()
  @HttpCode(201)
  issue(
    @CurrentAuth() auth: SessionContext,
    @Param("orgId") orgId: string,
    @Body(new ZodValidationPipe(IssueCredentialSchema)) dto: IssueCredentialDto,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return this.credentials.issue(orgId, auth.user.id, dto, idempotencyKey);
  }

  @Get()
  list(@Param("orgId") orgId: string) {
    return this.credentials.listIssued(orgId);
  }

  @Post(":id/revoke")
  @HttpCode(200)
  revoke(
    @CurrentAuth() auth: SessionContext,
    @Param("orgId") orgId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(RevokeCredentialSchema)) dto: RevokeCredentialDto,
  ) {
    return this.credentials.revoke(orgId, id, auth.user.id, dto.reason);
  }

  @Post(":id/supersede")
  @HttpCode(201)
  supersede(
    @CurrentAuth() auth: SessionContext,
    @Param("orgId") orgId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(SupersedeCredentialSchema))
    dto: SupersedeCredentialDto,
  ) {
    return this.credentials.supersede(orgId, id, auth.user.id, dto);
  }
}
