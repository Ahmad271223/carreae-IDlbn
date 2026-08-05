import { Body, Controller, Get, Patch, Post, Put, UseGuards } from "@nestjs/common";
import {
  ProfileUpdateSchema,
  SensitiveUpdateSchema,
  type ProfileUpdateDto,
  type SensitiveUpdateDto,
} from "@careerid/shared";
import type { Profile } from "@prisma/client";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { CurrentAuth, SessionGuard } from "../auth/session.guard";
import type { SessionContext } from "../auth/session.service";
import { ProfileService, SensitiveView } from "./profile.service";

@Controller("profile")
@UseGuards(SessionGuard)
export class ProfileController {
  constructor(private readonly profiles: ProfileService) {}

  @Get()
  async get(@CurrentAuth() auth: SessionContext): Promise<Profile | null> {
    return this.profiles.get(auth.user.id);
  }

  @Patch()
  async update(
    @CurrentAuth() auth: SessionContext,
    @Body(new ZodValidationPipe(ProfileUpdateSchema)) dto: ProfileUpdateDto,
  ): Promise<Profile> {
    return this.profiles.update(auth.user.id, dto);
  }

  @Post("slug")
  async regenerateSlug(@CurrentAuth() auth: SessionContext): Promise<Profile> {
    return this.profiles.regenerateSlug(auth.user.id);
  }

  /** Separate path + audit trail for the sensitive split (DATABASE_SCHEMA §1). */
  @Get("sensitive")
  async getSensitive(@CurrentAuth() auth: SessionContext): Promise<SensitiveView> {
    return this.profiles.getSensitive(auth.user.id);
  }

  @Put("sensitive")
  async updateSensitive(
    @CurrentAuth() auth: SessionContext,
    @Body(new ZodValidationPipe(SensitiveUpdateSchema)) dto: SensitiveUpdateDto,
  ): Promise<SensitiveView> {
    return this.profiles.updateSensitive(auth.user.id, dto);
  }

  @Get("completion")
  async completion(
    @CurrentAuth() auth: SessionContext,
  ): Promise<{ score: number; sections: Record<string, boolean> }> {
    return this.profiles.completion(auth.user.id);
  }
}
