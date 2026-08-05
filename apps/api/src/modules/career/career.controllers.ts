import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  EducationCreateSchema,
  EducationUpdateSchema,
  ExperienceCreateSchema,
  ExperienceUpdateSchema,
  LanguageCreateSchema,
  LanguageUpdateSchema,
  SkillCreateSchema,
  SkillUpdateSchema,
  type EducationCreateDto,
  type EducationUpdateDto,
  type ExperienceCreateDto,
  type ExperienceUpdateDto,
  type LanguageCreateDto,
  type LanguageUpdateDto,
  type SkillCreateDto,
  type SkillUpdateDto,
} from "@careerid/shared";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { CurrentAuth, SessionGuard } from "../auth/session.guard";
import type { SessionContext } from "../auth/session.service";
import { CareerService } from "./career.service";

@Controller("educations")
@UseGuards(SessionGuard)
export class EducationsController {
  constructor(private readonly career: CareerService) {}

  @Get()
  list(@CurrentAuth() auth: SessionContext) {
    return this.career.listEducations(auth.user.id);
  }

  @Post()
  create(
    @CurrentAuth() auth: SessionContext,
    @Body(new ZodValidationPipe(EducationCreateSchema)) dto: EducationCreateDto,
  ) {
    return this.career.createEducation(auth.user.id, dto);
  }

  @Get(":id")
  get(@CurrentAuth() auth: SessionContext, @Param("id") id: string) {
    return this.career.getEducation(auth.user.id, id);
  }

  @Patch(":id")
  update(
    @CurrentAuth() auth: SessionContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(EducationUpdateSchema)) dto: EducationUpdateDto,
  ) {
    return this.career.updateEducation(auth.user.id, id, dto);
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(@CurrentAuth() auth: SessionContext, @Param("id") id: string) {
    await this.career.deleteEducation(auth.user.id, id);
  }
}

@Controller("experiences")
@UseGuards(SessionGuard)
export class ExperiencesController {
  constructor(private readonly career: CareerService) {}

  @Get()
  list(@CurrentAuth() auth: SessionContext) {
    return this.career.listExperiences(auth.user.id);
  }

  @Post()
  create(
    @CurrentAuth() auth: SessionContext,
    @Body(new ZodValidationPipe(ExperienceCreateSchema)) dto: ExperienceCreateDto,
  ) {
    return this.career.createExperience(auth.user.id, dto);
  }

  @Get(":id")
  get(@CurrentAuth() auth: SessionContext, @Param("id") id: string) {
    return this.career.getExperience(auth.user.id, id);
  }

  @Patch(":id")
  update(
    @CurrentAuth() auth: SessionContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(ExperienceUpdateSchema)) dto: ExperienceUpdateDto,
  ) {
    return this.career.updateExperience(auth.user.id, id, dto);
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(@CurrentAuth() auth: SessionContext, @Param("id") id: string) {
    await this.career.deleteExperience(auth.user.id, id);
  }
}

@Controller("skills")
@UseGuards(SessionGuard)
export class SkillsController {
  constructor(private readonly career: CareerService) {}

  @Get()
  list(@CurrentAuth() auth: SessionContext) {
    return this.career.listSkills(auth.user.id);
  }

  @Post()
  create(
    @CurrentAuth() auth: SessionContext,
    @Body(new ZodValidationPipe(SkillCreateSchema)) dto: SkillCreateDto,
  ) {
    return this.career.createSkill(auth.user.id, dto);
  }

  @Patch(":id")
  update(
    @CurrentAuth() auth: SessionContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(SkillUpdateSchema)) dto: SkillUpdateDto,
  ) {
    return this.career.updateSkill(auth.user.id, id, dto);
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(@CurrentAuth() auth: SessionContext, @Param("id") id: string) {
    await this.career.deleteSkill(auth.user.id, id);
  }
}

@Controller("languages")
@UseGuards(SessionGuard)
export class LanguagesController {
  constructor(private readonly career: CareerService) {}

  @Get()
  list(@CurrentAuth() auth: SessionContext) {
    return this.career.listLanguages(auth.user.id);
  }

  @Post()
  create(
    @CurrentAuth() auth: SessionContext,
    @Body(new ZodValidationPipe(LanguageCreateSchema)) dto: LanguageCreateDto,
  ) {
    return this.career.createLanguage(auth.user.id, dto);
  }

  @Patch(":id")
  update(
    @CurrentAuth() auth: SessionContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(LanguageUpdateSchema)) dto: LanguageUpdateDto,
  ) {
    return this.career.updateLanguage(auth.user.id, id, dto);
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(@CurrentAuth() auth: SessionContext, @Param("id") id: string) {
    await this.career.deleteLanguage(auth.user.id, id);
  }
}
