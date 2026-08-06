import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  OrgInviteMemberSchema,
  OrgRegisterSchema,
  OrgRelationshipInviteSchema,
  type OrgInviteMemberDto,
  type OrgRegisterDto,
  type OrgRelationshipInviteDto,
} from "@careerid/shared";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { CurrentAuth, SessionGuard } from "../auth/session.guard";
import type { SessionContext } from "../auth/session.service";
import { OrgAccessGuard, type OrgRequest } from "./org-access.guard";
import { OrganizationsService } from "./organizations.service";

@Controller("organizations")
@UseGuards(SessionGuard)
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Post()
  @HttpCode(201)
  register(
    @CurrentAuth() auth: SessionContext,
    @Body(new ZodValidationPipe(OrgRegisterSchema)) dto: OrgRegisterDto,
  ) {
    return this.organizations.register(auth.user.id, dto);
  }

  @Get("mine")
  mine(@CurrentAuth() auth: SessionContext) {
    return this.organizations.mine(auth.user.id);
  }
}

@Controller("org/:orgId")
@UseGuards(SessionGuard, OrgAccessGuard)
export class OrgPortalController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Post("relationships/invite")
  @HttpCode(201)
  invite(
    @Req() req: OrgRequest,
    @Body(new ZodValidationPipe(OrgRelationshipInviteSchema))
    dto: OrgRelationshipInviteDto,
  ) {
    return this.organizations.inviteRelationship(
      req.orgMembership.organizationId,
      dto,
    );
  }

  @Get("relationships")
  relationships(@Req() req: OrgRequest) {
    return this.organizations.listRelationships(req.orgMembership.organizationId);
  }

  @Get("members")
  members(@Req() req: OrgRequest) {
    return this.organizations.listMembers(req.orgMembership.organizationId);
  }

  @Post("members")
  @HttpCode(201)
  addMember(
    @Req() req: OrgRequest,
    @Body(new ZodValidationPipe(OrgInviteMemberSchema)) dto: OrgInviteMemberDto,
  ) {
    return this.organizations.addMember(
      req.orgMembership.organizationId,
      req.orgMembership,
      dto,
    );
  }

  @Delete("members/:memberId")
  @HttpCode(204)
  async removeMember(@Req() req: OrgRequest, @Param("memberId") memberId: string) {
    await this.organizations.removeMember(
      req.orgMembership.organizationId,
      req.orgMembership,
      memberId,
    );
  }
}

/** User side of relationships: accept/decline invitations (M7/M8 consent). */
@Controller("relationships")
@UseGuards(SessionGuard)
export class RelationshipsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get()
  list(@CurrentAuth() auth: SessionContext) {
    return this.organizations.listOwnRelationships(auth.user.id);
  }

  @Post(":id/accept")
  @HttpCode(200)
  accept(@CurrentAuth() auth: SessionContext, @Param("id") id: string) {
    return this.organizations.respondRelationship(auth.user.id, id, true);
  }

  @Post(":id/decline")
  @HttpCode(200)
  decline(@CurrentAuth() auth: SessionContext, @Param("id") id: string) {
    return this.organizations.respondRelationship(auth.user.id, id, false);
  }
}
