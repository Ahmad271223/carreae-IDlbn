import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { t, type Locale } from "@careerid/i18n";
import type {
  CvDocument,
  CvEntry,
  CvSection,
  CvSectionType,
  LetterDocument,
} from "@careerid/templates";
import type { CvItem } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";

type Override = Record<string, unknown>;

const SECTION_BY_SOURCE: Record<CvItem["sourceType"], CvSectionType> = {
  EXPERIENCE: "experience",
  EDUCATION: "education",
  LANGUAGE: "languages",
  SKILL: "skills",
  CREDENTIAL: "certificates",
  // Free entries render under the profile section (MVP decision).
  CUSTOM: "profile",
};

function yearRange(start: Date, end: Date | null): string {
  const from = start.getUTCFullYear();
  return end ? `${from} – ${end.getUTCFullYear()}` : `${from} –`;
}

function str(override: Override | null, key: string): string | undefined {
  const value = override?.[key];
  return typeof value === "string" ? value : undefined;
}

function strArray(override: Override | null, key: string): string[] | undefined {
  const value = override?.[key];
  return Array.isArray(value) ? value.filter((v) => typeof v === "string") : undefined;
}

function languageName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * Resolves stored CVs/letters into the render documents of
 * @careerid/templates. Reads live data — a render always reflects the
 * current state of the Career ID plus presentation overrides (§22).
 */
@Injectable()
export class ResolversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async resolveCv(userId: string, cvId: string): Promise<{
    doc: CvDocument;
    templateKey: string;
    language: string;
    title: string;
  }> {
    const cv = await this.prisma.cv.findFirst({
      where: { id: cvId, userId, deletedAt: null },
      include: { items: { orderBy: { order: "asc" } } },
    });
    if (!cv) throw new NotFoundException({ code: "NOT_FOUND" });
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile) throw new ConflictException({ code: "PROFILE_REQUIRED" });
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const locale = cv.language as Locale;

    const entriesBySection = new Map<CvSectionType, CvEntry[]>();
    for (const item of cv.items) {
      if (!item.visible) continue;
      const entry = await this.resolveItem(userId, item, locale);
      if (!entry) continue;
      const section = SECTION_BY_SOURCE[item.sourceType];
      const list = entriesBySection.get(section) ?? [];
      list.push(entry);
      entriesBySection.set(section, list);
    }

    const order = (cv.sectionOrder as CvSectionType[]) ?? [];
    const sections: CvSection[] = order.map((type) => ({
      type,
      title: t(locale, `cv.section.${type}`),
      visible: true,
      entries: entriesBySection.get(type) ?? [],
    }));

    const doc: CvDocument = {
      locale,
      fullName: `${profile.firstName} ${profile.lastName}`,
      headline: profile.headline ?? undefined,
      contact: {
        email: user.email,
        location: [profile.city, profile.countryCode].filter(Boolean).join(", "),
      },
      photoEnabled: cv.photoEnabled,
      photoDataUri: cv.photoEnabled
        ? ((await this.photoDataUri(userId, profile.photoDocumentId)) ?? undefined)
        : undefined,
      summary: profile.summary ?? undefined,
      sections,
      labels: { verifiedBy: t(locale, "verification.verifiedBy") },
    };
    return { doc, templateKey: cv.templateKey, language: cv.language, title: cv.title };
  }

  async resolveLetter(userId: string, letterId: string): Promise<{
    doc: LetterDocument;
    layoutTemplate: string;
    convention: string;
    language: string;
    title: string;
  }> {
    const letter = await this.prisma.coverLetter.findFirst({
      where: { id: letterId, userId, deletedAt: null },
      include: { blocks: { orderBy: { order: "asc" } } },
    });
    if (!letter) throw new NotFoundException({ code: "NOT_FOUND" });
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile) throw new ConflictException({ code: "PROFILE_REQUIRED" });
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const date = new Intl.DateTimeFormat(letter.language, {
      dateStyle: "long",
    }).format(new Date());
    const doc: LetterDocument = {
      language: letter.language,
      senderLines: [
        `${profile.firstName} ${profile.lastName}`,
        [profile.city, profile.countryCode].filter(Boolean).join(", "),
        user.email,
      ].filter((line) => line !== ""),
      dateLine: profile.city ? `${profile.city}, ${date}` : date,
      blocks: letter.blocks.map((block) => ({
        type: block.type,
        content: block.content,
      })),
    };
    return {
      doc,
      layoutTemplate: letter.layoutTemplate,
      convention: letter.convention,
      language: letter.language,
      title: letter.title,
    };
  }

  private async resolveItem(
    userId: string,
    item: CvItem,
    locale: Locale,
  ): Promise<CvEntry | null> {
    const ov = (item.displayOverride as Override | null) ?? null;
    switch (item.sourceType) {
      case "EXPERIENCE": {
        const row = await this.prisma.experience.findFirst({
          where: { id: item.sourceId!, userId, deletedAt: null },
        });
        if (!row) return null;
        return {
          id: item.id,
          title: str(ov, "position") ?? row.position,
          subtitle: [str(ov, "companyName") ?? row.companyName, str(ov, "location") ?? row.location]
            .filter(Boolean)
            .join(" · "),
          dateRange: str(ov, "dateRange") ?? yearRange(row.startDate, row.endDate),
          description: str(ov, "description") ?? row.description ?? undefined,
          bullets: strArray(ov, "bullets"),
          verifiedBy: await this.verifierName("EXPERIENCE", row.id),
        };
      }
      case "EDUCATION": {
        const row = await this.prisma.education.findFirst({
          where: { id: item.sourceId!, userId, deletedAt: null },
        });
        if (!row) return null;
        const grade = str(ov, "grade") ?? row.grade;
        return {
          id: item.id,
          title: str(ov, "degreeType") ?? row.degreeType,
          subtitle:
            (str(ov, "institutionName") ?? row.institutionName) +
            (grade ? ` — ${grade}` : ""),
          dateRange: str(ov, "dateRange") ?? yearRange(row.startDate, row.endDate),
          description: str(ov, "description") ?? row.description ?? undefined,
          bullets: strArray(ov, "bullets"),
          verifiedBy: await this.verifierName("EDUCATION", row.id),
        };
      }
      case "LANGUAGE": {
        const row = await this.prisma.userLanguage.findFirst({
          where: { id: item.sourceId!, userId, deletedAt: null },
        });
        if (!row) return null;
        const label =
          str(ov, "label") ??
          `${languageName(row.language, locale)} — ${str(ov, "level") ?? row.level}`;
        return {
          id: item.id,
          title: label,
          verifiedBy: await this.verifierName("LANGUAGE", row.id),
        };
      }
      case "SKILL": {
        const row = await this.prisma.skill.findFirst({
          where: { id: item.sourceId!, userId, deletedAt: null },
        });
        if (!row) return null;
        return {
          id: item.id,
          title: str(ov, "title") ?? row.name,
          subtitle: str(ov, "subtitle") ?? row.level ?? undefined,
          description: str(ov, "description"),
        };
      }
      case "CREDENTIAL": {
        const row = await this.prisma.credential.findFirst({
          where: { id: item.sourceId!, subjectUserId: userId, status: "ACTIVE" },
          include: { issuer: { select: { name: true } } },
        });
        if (!row) return null;
        const payload = row.payload as Record<string, unknown>;
        const title =
          row.credentialType === "LANGUAGE" &&
          typeof payload.language === "string" &&
          typeof payload.level === "string"
            ? `${languageName(payload.language, locale)} — ${payload.level}`
            : typeof payload.title === "string"
              ? payload.title
              : row.credentialType;
        return {
          id: item.id,
          title,
          subtitle: row.issuer.name,
          dateRange: String(row.issuedAt.getUTCFullYear()),
          // Credentials are issuer-verified by definition (§6).
          verifiedBy: row.issuer.name,
        };
      }
      case "CUSTOM":
        return {
          id: item.id,
          title: str(ov, "title") ?? "",
          subtitle: str(ov, "subtitle"),
          dateRange: str(ov, "dateRange"),
          description: str(ov, "description"),
          bullets: strArray(ov, "bullets"),
        };
      default:
        return null;
    }
  }

  private async verifierName(
    subjectType: "EDUCATION" | "EXPERIENCE" | "LANGUAGE",
    subjectId: string,
  ): Promise<string | undefined> {
    const verified = await this.prisma.verificationRequest.findFirst({
      where: { subjectType, subjectId, status: "VERIFIED" },
      include: { organization: { select: { name: true } } },
    });
    return verified?.organization.name;
  }

  private async photoDataUri(
    userId: string,
    photoDocumentId: string | null,
  ): Promise<string | null> {
    if (!photoDocumentId) return null;
    const document = await this.prisma.document.findFirst({
      where: {
        id: photoDocumentId,
        ownerUserId: userId,
        category: "PHOTO",
        scanStatus: "CLEAN",
        deletedAt: null,
      },
    });
    if (!document?.mimeType) return null;
    const bytes = await this.storage.getBuffer(
      this.storage.documentsBucket,
      document.storageKey,
    );
    // §20: embedded at export time, never referenced as an external URL.
    return `data:${document.mimeType};base64,${bytes.toString("base64")}`;
  }
}
