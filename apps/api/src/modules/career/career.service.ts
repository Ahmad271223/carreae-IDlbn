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
import { VerificationService } from "../verification/verification.service";
import type { VerifiableSubjectType } from "../verification/coverage";

/** Entity plus the flag telling the client a verification badge just fell. */
export interface UpdateResult<T> {
  entity: T;
  verificationReset: boolean;
}

/**
 * Owner-scoped CRUD for the career entities. Every query filters by the
 * authenticated user's id — a foreign id behaves exactly like a missing one
 * (404, no existence leak). Deletes are soft (deletedAt) per DATABASE_SCHEMA.
 *
 * Verified data is immutable (§5): editing a covered field revokes the
 * VERIFIED request in the same transaction as the entity update.
 */
@Injectable()
export class CareerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly verifications: VerificationService,
  ) {}

  /** Runs the update together with a verification reset when required. */
  private async updateWithResetCheck<T>(
    userId: string,
    subjectType: VerifiableSubjectType,
    subjectId: string,
    changedFields: string[],
    performUpdate: (tx: Parameters<Parameters<PrismaService["$transaction"]>[0]>[0]) => Promise<T>,
  ): Promise<UpdateResult<T>> {
    const resettable = await this.verifications.findResettableRequest(
      subjectType,
      subjectId,
      changedFields,
    );
    const entity = await this.prisma.$transaction(async (tx) => {
      const updated = await performUpdate(tx);
      if (resettable) {
        await tx.verificationRequest.update({
          where: { id: resettable.id },
          data: {
            status: "REVOKED",
            revokedAt: new Date(),
            revokeReason: "verified_field_edited",
          },
        });
      }
      return updated;
    });
    if (resettable) {
      await this.verifications.auditReset(userId, resettable.id);
    }
    return { entity, verificationReset: Boolean(resettable) };
  }

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
  ): Promise<UpdateResult<Education>> {
    await this.getEducation(userId, id);
    return this.updateWithResetCheck(
      userId,
      "EDUCATION",
      id,
      Object.keys(dto),
      (tx) =>
        tx.education.update({
          where: { id },
          data: {
            ...dto,
            ...(dto.startDate ? { startDate: new Date(dto.startDate) } : {}),
            ...("endDate" in dto
              ? { endDate: dto.endDate ? new Date(dto.endDate) : null }
              : {}),
          },
        }),
    );
  }

  async deleteEducation(userId: string, id: string): Promise<void> {
    await this.getEducation(userId, id);
    await this.softDeleteWithRequests("education", "EDUCATION", id);
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
  ): Promise<UpdateResult<Experience>> {
    await this.getExperience(userId, id);
    return this.updateWithResetCheck(
      userId,
      "EXPERIENCE",
      id,
      Object.keys(dto),
      (tx) =>
        tx.experience.update({
          where: { id },
          data: {
            ...dto,
            ...(dto.startDate ? { startDate: new Date(dto.startDate) } : {}),
            ...("endDate" in dto
              ? { endDate: dto.endDate ? new Date(dto.endDate) : null }
              : {}),
          },
        }),
    );
  }

  async deleteExperience(userId: string, id: string): Promise<void> {
    await this.getExperience(userId, id);
    await this.softDeleteWithRequests("experience", "EXPERIENCE", id);
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
  ): Promise<UpdateResult<UserLanguage>> {
    const row = await this.prisma.userLanguage.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!row) throw new NotFoundException({ code: "NOT_FOUND" });
    return this.updateWithResetCheck(userId, "LANGUAGE", id, Object.keys(dto), (tx) =>
      tx.userLanguage.update({ where: { id }, data: dto }),
    );
  }

  async deleteLanguage(userId: string, id: string): Promise<void> {
    const row = await this.prisma.userLanguage.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!row) throw new NotFoundException({ code: "NOT_FOUND" });
    await this.softDeleteWithRequests("userLanguage", "LANGUAGE", id);
  }

  /** Deleting an entry also ends any open or granted verification on it. */
  private async softDeleteWithRequests(
    model: "education" | "experience" | "userLanguage",
    subjectType: VerifiableSubjectType,
    id: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const delegate = tx[model] as unknown as {
        update: (args: {
          where: { id: string };
          data: { deletedAt: Date };
        }) => Promise<unknown>;
      };
      await delegate.update({ where: { id }, data: { deletedAt: new Date() } });
      await tx.verificationRequest.updateMany({
        where: {
          subjectType,
          subjectId: id,
          status: { in: ["PENDING", "VERIFIED"] },
        },
        data: {
          status: "REVOKED",
          revokedAt: new Date(),
          revokeReason: "subject_deleted",
        },
      });
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
