import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { ProfileUpdateDto, SensitiveUpdateDto } from "@careerid/shared";
import type { Prisma, Profile } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { decrypt, encrypt } from "../../common/encryption";
import { AuditService } from "../audit/audit.service";
import { buildSlug, slugBase, slugSuffix } from "./slug";

const SLUG_RETRIES = 5;

export interface SensitiveView {
  dateOfBirth: string | null;
  nationality: string | null;
  contactPhone: string | null;
  contactAddress: string | null;
}

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(userId: string): Promise<Profile | null> {
    return this.prisma.profile.findUnique({ where: { userId } });
  }

  /** Upsert; the slug is minted on first save of a complete name. */
  async update(userId: string, dto: ProfileUpdateDto): Promise<Profile> {
    const existing = await this.prisma.profile.findUnique({ where: { userId } });

    if (!existing) {
      if (!dto.firstName || !dto.lastName) {
        throw new ConflictException({
          code: "PROFILE_NAME_REQUIRED",
          message: "firstName and lastName are required on first save",
        });
      }
      return this.createWithUniqueSlug(userId, dto);
    }

    const data: Prisma.ProfileUpdateInput = { ...dto };
    return this.prisma.profile.update({ where: { userId }, data });
  }

  /** New random suffix; the base follows the current name. */
  async regenerateSlug(userId: string): Promise<Profile> {
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException({ code: "PROFILE_NOT_FOUND" });
    for (let attempt = 0; attempt < SLUG_RETRIES; attempt++) {
      const slug = `${slugBase(profile.firstName, profile.lastName)}-${slugSuffix()}`;
      try {
        return await this.prisma.profile.update({
          where: { userId },
          data: { slug },
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
    throw new ConflictException({ code: "SLUG_GENERATION_FAILED" });
  }

  async getSensitive(userId: string): Promise<SensitiveView> {
    const row = await this.prisma.profileSensitive.findUnique({
      where: { userId },
    });
    return {
      dateOfBirth: row?.dateOfBirth?.toISOString().slice(0, 10) ?? null,
      nationality: row?.nationality ?? null,
      contactPhone: row?.contactPhoneEncrypted
        ? decrypt(row.contactPhoneEncrypted)
        : null,
      contactAddress: row?.contactAddressEncrypted
        ? decrypt(row.contactAddressEncrypted)
        : null,
    };
  }

  async updateSensitive(
    userId: string,
    dto: SensitiveUpdateDto,
  ): Promise<SensitiveView> {
    const data: Prisma.ProfileSensitiveUncheckedUpdateInput = {};
    if ("dateOfBirth" in dto) {
      data.dateOfBirth = dto.dateOfBirth ? new Date(dto.dateOfBirth) : null;
    }
    if ("nationality" in dto) data.nationality = dto.nationality ?? null;
    if ("contactPhone" in dto) {
      data.contactPhoneEncrypted = dto.contactPhone
        ? encrypt(dto.contactPhone)
        : null;
    }
    if ("contactAddress" in dto) {
      data.contactAddressEncrypted = dto.contactAddress
        ? encrypt(dto.contactAddress)
        : null;
    }
    await this.prisma.profileSensitive.upsert({
      where: { userId },
      create: {
        ...(data as Omit<Prisma.ProfileSensitiveUncheckedCreateInput, "userId">),
        userId,
      },
      update: data,
    });
    // Field names only — audit metadata never carries the values themselves.
    await this.audit.append({
      actorType: "USER",
      actorId: userId,
      action: "profile.sensitive_updated",
      targetType: "user",
      targetId: userId,
      metadata: { fields: Object.keys(dto) },
    });
    return this.getSensitive(userId);
  }

  /** Coarse completion score for the dashboard — data presence, no judgement. */
  async completion(userId: string): Promise<{
    score: number;
    sections: Record<string, boolean>;
  }> {
    const [profile, educations, experiences, skills, languages] =
      await Promise.all([
        this.prisma.profile.findUnique({ where: { userId } }),
        this.prisma.education.count({ where: { userId, deletedAt: null } }),
        this.prisma.experience.count({ where: { userId, deletedAt: null } }),
        this.prisma.skill.count({ where: { userId, deletedAt: null } }),
        this.prisma.userLanguage.count({ where: { userId, deletedAt: null } }),
      ]);
    const sections = {
      basics: Boolean(profile?.firstName && profile.lastName),
      headline: Boolean(profile?.headline),
      summary: Boolean(profile?.summary),
      education: educations > 0,
      experience: experiences > 0,
      skills: skills >= 3,
      languages: languages > 0,
    };
    const weights: Record<keyof typeof sections, number> = {
      basics: 20,
      headline: 10,
      summary: 10,
      education: 20,
      experience: 15,
      skills: 15,
      languages: 10,
    };
    const score = (Object.keys(sections) as Array<keyof typeof sections>)
      .filter((key) => sections[key])
      .reduce((sum, key) => sum + weights[key], 0);
    return { score, sections };
  }

  private async createWithUniqueSlug(
    userId: string,
    dto: ProfileUpdateDto,
  ): Promise<Profile> {
    for (let attempt = 0; attempt < SLUG_RETRIES; attempt++) {
      try {
        return await this.prisma.profile.create({
          data: {
            userId,
            slug: buildSlug(dto.firstName!, dto.lastName!),
            firstName: dto.firstName!,
            lastName: dto.lastName!,
            headline: dto.headline ?? null,
            summary: dto.summary ?? null,
            desiredRole: dto.desiredRole ?? null,
            city: dto.city ?? null,
            countryCode: dto.countryCode ?? null,
          },
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
    throw new ConflictException({ code: "SLUG_GENERATION_FAILED" });
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2002"
  );
}
