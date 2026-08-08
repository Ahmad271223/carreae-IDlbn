import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  SubmissionStatusUpdateSchema,
  SubmitApplicationSchema,
  type SubmissionStatusUpdateDto,
  type SubmitApplicationDto,
} from "@careerid/shared";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { CurrentAuth, SessionGuard } from "../auth/session.guard";
import type { SessionContext } from "../auth/session.service";
import { OrgAccessGuard, type OrgRequest } from "../organizations/org-access.guard";
import { SubmissionsService } from "./submissions.service";

/** Applicant side: discover employers, submit, track, withdraw. */
@Controller()
@UseGuards(SessionGuard)
export class SubmissionsController {
  constructor(private readonly submissions: SubmissionsService) {}

  @Get("employers")
  employers() {
    return this.submissions.listEmployers();
  }

  @Post("applications/:id/submit")
  @HttpCode(201)
  submit(
    @CurrentAuth() auth: SessionContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(SubmitApplicationSchema)) dto: SubmitApplicationDto,
  ) {
    return this.submissions.submit(auth.user.id, id, dto.organizationId);
  }

  @Get("applications/:id/submissions")
  list(@CurrentAuth() auth: SessionContext, @Param("id") id: string) {
    return this.submissions.listForApplication(auth.user.id, id);
  }

  @Post("submissions/:id/withdraw")
  @HttpCode(200)
  withdraw(@CurrentAuth() auth: SessionContext, @Param("id") id: string) {
    return this.submissions.withdraw(auth.user.id, id);
  }
}

/** Employer inbox (Phase 5.1) — membership via OrgAccessGuard, roles in service. */
@Controller("org/:orgId/submissions")
@UseGuards(SessionGuard, OrgAccessGuard)
export class OrgSubmissionsController {
  constructor(private readonly submissions: SubmissionsService) {}

  @Get()
  inbox(@Req() req: OrgRequest) {
    return this.submissions.inbox(req.orgMembership);
  }

  @Get(":id/view")
  view(@Req() req: OrgRequest, @Param("id") id: string) {
    return this.submissions.view(req.orgMembership, id);
  }

  @Get(":id/documents/:documentId")
  document(
    @Req() req: OrgRequest,
    @Param("id") id: string,
    @Param("documentId") documentId: string,
  ) {
    return this.submissions.documentUrl(req.orgMembership, id, documentId);
  }

  @Post(":id/status")
  @HttpCode(200)
  setStatus(
    @Req() req: OrgRequest,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(SubmissionStatusUpdateSchema))
    dto: SubmissionStatusUpdateDto,
  ) {
    return this.submissions.setStatus(req.orgMembership, id, dto);
  }
}
