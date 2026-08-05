import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  VerificationCreateSchema,
  type VerificationCreateDto,
} from "@careerid/shared";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { CurrentAuth, SessionGuard } from "../auth/session.guard";
import type { SessionContext } from "../auth/session.service";
import { OrgVerifierGuard } from "./org-verifier.guard";
import { VerificationService } from "./verification.service";

@Controller("verifications")
@UseGuards(SessionGuard)
export class VerificationsController {
  constructor(private readonly verifications: VerificationService) {}

  @Post()
  create(
    @CurrentAuth() auth: SessionContext,
    @Body(new ZodValidationPipe(VerificationCreateSchema))
    dto: VerificationCreateDto,
  ) {
    return this.verifications.request(
      auth.user.id,
      dto.subjectType,
      dto.subjectId,
      dto.organizationId,
    );
  }

  @Get()
  list(@CurrentAuth() auth: SessionContext) {
    return this.verifications.listOwn(auth.user.id);
  }

  @Post(":id/revoke")
  @HttpCode(200)
  revoke(@CurrentAuth() auth: SessionContext, @Param("id") id: string) {
    return this.verifications.revokeOwn(auth.user.id, id);
  }
}

@Controller("org/:orgId/verifications")
@UseGuards(SessionGuard, OrgVerifierGuard)
export class OrgVerificationsController {
  constructor(private readonly verifications: VerificationService) {}

  @Get()
  queue(@Param("orgId") orgId: string) {
    return this.verifications.listForOrganization(orgId);
  }

  /** Atomic: no request body is read — confirmed is exactly the snapshot. */
  @Post(":id/confirm")
  @HttpCode(200)
  confirm(
    @CurrentAuth() auth: SessionContext,
    @Param("orgId") orgId: string,
    @Param("id") id: string,
  ) {
    return this.verifications.confirm(orgId, id, auth.user.id);
  }

  @Post(":id/decline")
  @HttpCode(200)
  decline(
    @CurrentAuth() auth: SessionContext,
    @Param("orgId") orgId: string,
    @Param("id") id: string,
  ) {
    return this.verifications.decline(orgId, id, auth.user.id);
  }
}
