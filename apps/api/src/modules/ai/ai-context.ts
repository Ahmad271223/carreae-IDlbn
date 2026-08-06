import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * The ONLY projection of user data that may reach an LLM (§31). Included:
 * headline/summary/desired role, education, experience, skills, languages.
 * Excluded BY CONSTRUCTION — this builder simply never reads them: wallet
 * document contents, third-party reference texts, date of birth, nationality,
 * phone, email, address/city. Those belong in the letter head, not in a
 * prompt.
 */
export interface AiCareerContext {
  headline: string | null;
  summary: string | null;
  desiredRole: string | null;
  educations: Array<{
    institution: string;
    degree: string;
    field: string | null;
    grade: string | null;
    startYear: number;
    endYear: number | null;
  }>;
  experiences: Array<{
    company: string;
    position: string;
    startYear: number;
    endYear: number | null;
    description: string | null;
  }>;
  skills: string[];
  languages: Array<{ code: string; level: string }>;
}

/** Entity inventory used by the post-generation validator (§29). */
export interface KnownEntities {
  organizations: string[];
  degrees: string[];
  years: Set<number>;
  levels: Set<string>;
}

@Injectable()
export class AiContextBuilder {
  constructor(private readonly prisma: PrismaService) {}

  async build(
    userId: string,
  ): Promise<{ context: AiCareerContext; entities: KnownEntities }> {
    const [profile, educations, experiences, skills, languages] =
      await Promise.all([
        this.prisma.profile.findUnique({ where: { userId } }),
        this.prisma.education.findMany({ where: { userId, deletedAt: null } }),
        this.prisma.experience.findMany({ where: { userId, deletedAt: null } }),
        this.prisma.skill.findMany({ where: { userId, deletedAt: null } }),
        this.prisma.userLanguage.findMany({ where: { userId, deletedAt: null } }),
      ]);

    const context: AiCareerContext = {
      headline: profile?.headline ?? null,
      summary: profile?.summary ?? null,
      desiredRole: profile?.desiredRole ?? null,
      educations: educations.map((e) => ({
        institution: e.institutionName,
        degree: e.degreeType,
        field: e.fieldOfStudy,
        grade: e.grade,
        startYear: e.startDate.getUTCFullYear(),
        endYear: e.endDate?.getUTCFullYear() ?? null,
      })),
      experiences: experiences.map((e) => ({
        company: e.companyName,
        position: e.position,
        startYear: e.startDate.getUTCFullYear(),
        endYear: e.endDate?.getUTCFullYear() ?? null,
        description: e.description,
      })),
      skills: skills.map((s) => s.name),
      languages: languages.map((l) => ({ code: l.language, level: l.level })),
    };

    const years = new Set<number>();
    for (const e of context.educations) {
      years.add(e.startYear);
      if (e.endYear) years.add(e.endYear);
    }
    for (const e of context.experiences) {
      years.add(e.startYear);
      if (e.endYear) years.add(e.endYear);
    }
    // The letter's own date is legitimate content.
    years.add(new Date().getUTCFullYear());

    const entities: KnownEntities = {
      organizations: [
        ...context.educations.map((e) => e.institution),
        ...context.experiences.map((e) => e.company),
      ],
      degrees: context.educations.map((e) => e.degree),
      years,
      levels: new Set(context.languages.map((l) => l.level)),
    };
    return { context, entities };
  }
}
