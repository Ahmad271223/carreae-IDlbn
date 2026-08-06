import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { CvCreateDto, CvItemsPutDto, CvUpdateDto } from "@careerid/shared";
import {
  TEMPLATE_CATALOG,
  getTemplate,
  recommendPhoto,
  type PhotoRecommendation,
} from "@careerid/templates";
import type { Cv, CvItem, CvItemSourceType, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { disallowedKeys, lockedKeys } from "./override-rules";

const DEFAULT_SECTION_ORDER = [
  "profile",
  "experience",
  "education",
  "languages",
  "skills",
  "certificates",
  "references",
];

/** Maps CV source types onto verification subject types (where verifiable). */
const VERIFIABLE: Partial<Record<CvItemSourceType, "EDUCATION" | "EXPERIENCE" | "LANGUAGE">> = {
  EDUCATION: "EDUCATION",
  EXPERIENCE: "EXPERIENCE",
  LANGUAGE: "LANGUAGE",
};

@Injectable()
export class CvService {
  constructor(private readonly prisma: PrismaService) {}

  /** Template catalog for the builder UI — honest ATS flags included (§19). */
  templates() {
    return Object.values(TEMPLATE_CATALOG).map((t) => ({
      key: t.key,
      name: t.name,
      columns: t.columns,
      photoSlot: t.photoSlot,
      atsSafe: t.atsSafe,
      primaryMarket: t.primaryMarket,
    }));
  }

  async create(
    userId: string,
    dto: CvCreateDto,
  ): Promise<{ cv: Cv; photoRecommendation: PhotoRecommendation }> {
    const template = getTemplate(dto.templateKey);
    if (!template) throw new BadRequestException({ code: "UNKNOWN_TEMPLATE" });

    // §20: target country preselects the photo default; always overridable.
    const recommendation = recommendPhoto(dto.targetCountryCode);
    const photoEnabled =
      template.photoSlot === "none" ? false : recommendation.photoDefault;

    const cv = await this.prisma.cv.create({
      data: {
        userId,
        title: dto.title,
        templateKey: template.key,
        language: dto.language,
        targetCountryCode: dto.targetCountryCode ?? null,
        photoEnabled,
        sectionOrder: DEFAULT_SECTION_ORDER,
      },
    });
    return { cv, photoRecommendation: recommendation };
  }

  list(userId: string): Promise<Cv[]> {
    return this.prisma.cv.findMany({
      where: { userId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
    });
  }

  async get(userId: string, id: string): Promise<Cv & { items: CvItem[] }> {
    const cv = await this.prisma.cv.findFirst({
      where: { id, userId, deletedAt: null },
      include: { items: { orderBy: { order: "asc" } } },
    });
    if (!cv) throw new NotFoundException({ code: "NOT_FOUND" });
    return cv;
  }

  async update(userId: string, id: string, dto: CvUpdateDto): Promise<Cv> {
    await this.get(userId, id);
    if (dto.templateKey && !getTemplate(dto.templateKey)) {
      throw new BadRequestException({ code: "UNKNOWN_TEMPLATE" });
    }
    return this.prisma.cv.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.sectionOrder ? { sectionOrder: dto.sectionOrder } : {}),
      },
    });
  }

  async softDelete(userId: string, id: string): Promise<void> {
    await this.get(userId, id);
    await this.prisma.cv.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Replaces the item list. Every item is validated:
   *  - referenced sources must belong to the user (foreign === not found),
   *  - override keys must be allowed for the source type,
   *  - locked keys of VERIFIED sources are rejected (§22, §65 test 14) —
   *    the client then offers "cancel" or "drop verification & edit freely",
   *    which is an explicit verification revoke, never an implicit one.
   */
  async putItems(
    userId: string,
    cvId: string,
    dto: CvItemsPutDto,
  ): Promise<CvItem[]> {
    await this.get(userId, cvId);

    for (const item of dto.items) {
      const overrideKeys = Object.keys(item.displayOverride ?? {});

      const invalid = disallowedKeys(item.sourceType, overrideKeys);
      if (invalid.length > 0) {
        throw new BadRequestException({
          code: "OVERRIDE_KEY_NOT_ALLOWED",
          sourceType: item.sourceType,
          keys: invalid,
        });
      }

      if (item.sourceType !== "CUSTOM") {
        await this.assertSourceOwned(userId, item.sourceType, item.sourceId!);
      }

      const subjectType = VERIFIABLE[item.sourceType];
      if (subjectType && overrideKeys.length > 0) {
        const locked = lockedKeys(item.sourceType, overrideKeys);
        if (locked.length > 0) {
          const verified = await this.prisma.verificationRequest.findFirst({
            where: {
              subjectType,
              subjectId: item.sourceId!,
              status: "VERIFIED",
            },
            select: { id: true },
          });
          if (verified) {
            throw new ConflictException({
              code: "VERIFIED_FIELD_LOCKED",
              keys: locked,
              verificationRequestId: verified.id,
            });
          }
        }
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.cvItem.deleteMany({ where: { cvId } });
      for (const item of dto.items) {
        await tx.cvItem.create({
          data: {
            cvId,
            sourceType: item.sourceType,
            sourceId: item.sourceId ?? null,
            displayOverride:
              (item.displayOverride as Prisma.InputJsonValue | undefined) ?? undefined,
            order: item.order,
            visible: item.visible,
          },
        });
      }
      return tx.cvItem.findMany({ where: { cvId }, orderBy: { order: "asc" } });
    });
  }

  private async assertSourceOwned(
    userId: string,
    sourceType: CvItemSourceType,
    sourceId: string,
  ): Promise<void> {
    const owned = await (async () => {
      switch (sourceType) {
        case "EXPERIENCE":
          return this.prisma.experience.findFirst({
            where: { id: sourceId, userId, deletedAt: null },
            select: { id: true },
          });
        case "EDUCATION":
          return this.prisma.education.findFirst({
            where: { id: sourceId, userId, deletedAt: null },
            select: { id: true },
          });
        case "LANGUAGE":
          return this.prisma.userLanguage.findFirst({
            where: { id: sourceId, userId, deletedAt: null },
            select: { id: true },
          });
        case "SKILL":
          return this.prisma.skill.findFirst({
            where: { id: sourceId, userId, deletedAt: null },
            select: { id: true },
          });
        case "CREDENTIAL":
          // Only credentials the subject ACCEPTED can appear on a CV.
          return this.prisma.credential.findFirst({
            where: { id: sourceId, subjectUserId: userId, status: "ACTIVE" },
            select: { id: true },
          });
        default:
          return null;
      }
    })();
    if (!owned) throw new NotFoundException({ code: "SOURCE_NOT_FOUND" });
  }
}
