import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { AdminController } from "../admin/admin.controller";
import { AdminGuard } from "../admin/admin.guard";
import { OrgAccessGuard } from "./org-access.guard";
import {
  OrgPortalController,
  OrganizationsController,
  RelationshipsController,
} from "./organizations.controllers";
import { OrganizationsService } from "./organizations.service";

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [
    OrganizationsController,
    OrgPortalController,
    RelationshipsController,
    AdminController,
  ],
  providers: [OrganizationsService, OrgAccessGuard, AdminGuard],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
