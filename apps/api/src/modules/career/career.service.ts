import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  EducationCreateDto,
  EducationUpdateDto,
  ExperienceCreateDto,
  ExperienceUpdateDto,
  LanguageCreateDto,
  LanguageUpdateDto,
  SkillCreateDto,
  SkillUpdateDto,
} from "@careerid/shared";
import type { Education, Experience, Skill, UserLanguage } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * Owner-scoped CRUD for the career entities. Every query filters by the
 * authenticated user's id — a foreign id behaves exactly like a missing one
 * (404, no existence leak). Deletes are soft (deletedAt) per DATABASE_SCHEMA.
 */
@Injectable()
export class CareerService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- Educations ----------

  listEducations(userId: string): Promise<Education[]> {
    return this.prisma.education.findMany({
      where: { userId, deletedAt: null },
      orderBy: { displayOrder: "asc" },
    });
  }

  async createEducation(
    userId: string,
    dto: EducationCreateDto,
  ): Promise<Education> {
    return this.prisma.education.create({
      data: {
        userId,
        institutionName: dto.institutionName,
        degreeType: dto.degreeType,
        fieldOfStudy: dto.fieldOfStudy ?? null,
        countryCode: dto.countryCode,
        educationSystem: dto.educationSystem ?? null,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        grade: dto.grade ?? null,
        description: dto.description ?? null,
        displayOrder: await this.nextOrder("education", userId),
      },
    });
  }

  async getEducation(userId: string, id: string): Promise<Education> {
    const row = await this.prisma.education.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!row) throw new NotFoundException({ code: "NOT_FOUND" });
    return row;
  }

  async updateEducation(
    userId: string,
    id: string,
    dto: EducationUpdateDto,
  ): Promise<Education> {
    await this.getEducation(userId, id);
    return this.prisma.education.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.startDate ? { startDate: new Date(dto.startDate) } : {}),
        ...("endDate" in dto
          ? { endDate: dto.endDate ? new Date(dto.endDate) : null }
          : {}),
      },
    });
  }

  async deleteEducation(userId: string, id: string): Promise<void> {
    await this.getEducation(userId, id);
    await this.prisma.education.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  // ---------- Experiences ----------

  listExperiences(userId: string): Promise<Experience[]> {
    return this.prisma.experience.findMany({
      where: { userId, deletedAt: null },
      orderBy: { displayOrder: "asc" },
    });
  }

  async createExperience(
    userId: string,
    dto: ExperienceCreateDto,
  ): Promise<Experience> {
    return this.prisma.experience.create({
      data: {
        userId,
        companyName: dto.companyName,
        position: dto.position,
        employmentType: dto.employmentType,
        location: dto.location ?? null,
        countryCode: dto.countryCode ?? null,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        description: dto.description ?? null,
        displayOrder: await this.nextOrder("experience", userId),
      },
    });
  }

  async getExperience(userId: string, id: string): Promise<Experience> {
    const row = await this.prisma.experience.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!row) throw new NotFoundException({ code: "NOT_FOUND" });
    return row;
  }

  async updateExperience(
    userId: string,
    id: string,
    dto: ExperienceUpdateDto,
  ): Promise<Experience> {
    await this.getExperience(userId, id);
    return this.prisma.experience.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.startDate ? { startDate: new Date(dto.startDate) } : {}),
        ...("endDate" in dto
          ? { endDate: dto.endDate ? new Date(dto.endDate) : null }
          : {}),
      },
    });
  }

  async deleteExperience(userId: string, id: string): Promise<void> {
    await this.getExperience(userId, id);
    await this.prisma.experience.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  // ---------- Skills ----------

  listSkills(userId: string): Promise<Skill[]> {
    return this.prisma.skill.findMany({
      where: { userId, deletedAt: null },
      orderBy: { displayOrder: "asc" },
    });
  }

  async createSkill(userId: string, dto: SkillCreateDto): Promise<Skill> {
    return this.prisma.skill.create({
      data: {
        userId,
        name: dto.name,
        category: dto.category,
        level: dto.level ?? null,
        displayOrder: await this.nextOrder("skill", userId),
      },
    });
  }

  async updateSkill(
    userId: string,
    id: string,
    dto: SkillUpdateDto,
  ): Promise<Skill> {
    const row = await this.prisma.skill.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!row) throw new NotFoundException({ code: "NOT_FOUND" });
    return this.prisma.skill.update({ where: { id }, data: dto });
  }

  async deleteSkill(userId: string, id: string): Promise<void> {
    const row = await this.prisma.skill.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!row) throw new NotFoundException({ code: "NOT_FOUND" });
    await this.prisma.skill.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  // ---------- Languages ----------

  listLanguages(userId: string): Promise<UserLanguage[]> {
    return this.prisma.userLanguage.findMany({
      where: { userId, deletedAt: null },
      orderBy: { displayOrder: "asc" },
    });
  }

  /** Always SELF_DECLARED; CERTIFIED is set only by credential linkage (Phase 2). */
  async createLanguage(
    userId: string,
    dto: LanguageCreateDto,
  ): Promise<UserLanguage> {
    return this.prisma.userLanguage.create({
      data: {
        userId,
        language: dto.language,
        level: dto.level,
        source: "SELF_DECLARED",
        displayOrder: await this.nextOrder("userLanguage", userId),
      },
    });
  }

  async updateLanguage(
    userId: string,
    id: string,
    dto: LanguageUpdateDto,
  ): Promise<UserLanguage> {
    const row = await this.prisma.userLanguage.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!row) throw new NotFoundException({ code: "NOT_FOUND" });
    return this.prisma.userLanguage.update({ where: { id }, data: dto });
  }

  async deleteLanguage(userId: string, id: string): Promise<void> {
    const row = await this.prisma.userLanguage.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!row) throw new NotFoundException({ code: "NOT_FOUND" });
    await this.prisma.userLanguage.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  private async nextOrder(
    model: "education" | "experience" | "skill" | "userLanguage",
    userId: string,
  ): Promise<number> {
    const delegate = this.prisma[model] as unknown as {
      aggregate: (args: {
        where: { userId: string; deletedAt: null };
        _max: { displayOrder: true };
      }) => Promise<{ _max: { displayOrder: number | null } }>;
    };
    const result = await delegate.aggregate({
      where: { userId, deletedAt: null },
      _max: { displayOrder: true },
    });
    return (result._max.displayOrder ?? -1) + 1;
  }
}
