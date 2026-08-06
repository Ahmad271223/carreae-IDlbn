import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ApplicationSectionKeySchema,
  type ApplicationCreateDto,
  type ApplicationItemsPutDto,
  type ApplicationUpdateDto,
} from "@careerid/shared";
import type { Application, ApplicationItem } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class ApplicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(userId: string, dto: ApplicationCreateDto): Promise<Application> {
    return this.prisma.application.create({
      data: {
        userId,
        title: dto.title,
        type: dto.type,
        recipientName: dto.recipientName ?? null,
        jobDescription: dto.jobDescription ?? null,
      },
    });
  }

  list(userId: string): Promise<Application[]> {
    return this.prisma.application.findMany({
      where: { userId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
    });
  }

  async get(
    userId: string,
    id: string,
  ): Promise<Application & { items: ApplicationItem[] }> {
    const application = await this.prisma.application.findFirst({
      where: { id, userId, deletedAt: null },
      include: { items: { orderBy: { order: "asc" } } },
    });
    if (!application) throw new NotFoundException({ code: "NOT_FOUND" });
    return application;
  }

  async update(
    userId: string,
    id: string,
    dto: ApplicationUpdateDto,
  ): Promise<Application> {
    await this.get(userId, id);
    return this.prisma.application.update({ where: { id }, data: dto });
  }

  /**
   * Soft delete for the record — but the pasted job description contains
   * third-party data and is part of the deletion scope (P4): hard-nulled.
   */
  async softDelete(userId: string, id: string): Promise<void> {
    await this.get(userId, id);
    await this.prisma.application.update({
      where: { id },
      data: { deletedAt: new Date(), jobDescription: null },
    });
    await this.audit.append({
      actorType: "USER",
      actorId: userId,
      action: "application.deleted",
      targetType: "application",
      targetId: id,
    });
  }

  /** Replaces the package composition; every referenced artifact must be
   * usable by this user (foreign or unusable === not found). */
  async putItems(
    userId: string,
    id: string,
    dto: ApplicationItemsPutDto,
  ): Promise<ApplicationItem[]> {
    await this.get(userId, id);
    for (const item of dto.items) {
      await this.assertAttachable(userId, item.itemType, item.itemId);
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.applicationItem.deleteMany({ where: { applicationId: id } });
      for (const item of dto.items) {
        await tx.applicationItem.create({
          data: {
            applicationId: id,
            itemType: item.itemType,
            itemId: item.itemId,
            order: item.order,
          },
        });
      }
      return tx.applicationItem.findMany({
        where: { applicationId: id },
        orderBy: { order: "asc" },
      });
    });
  }

  private async assertAttachable(
    userId: string,
    itemType: ApplicationItem["itemType"],
    itemId: string,
  ): Promise<void> {
    switch (itemType) {
      case "CV": {
        const row = await this.prisma.cv.findFirst({
          where: { id: itemId, userId, deletedAt: null },
          select: { id: true },
        });
        if (!row) throw new NotFoundException({ code: "ITEM_NOT_FOUND" });
        return;
      }
      case "COVER_LETTER": {
        const row = await this.prisma.coverLetter.findFirst({
          where: { id: itemId, userId, deletedAt: null },
          select: { id: true },
        });
        if (!row) throw new NotFoundException({ code: "ITEM_NOT_FOUND" });
        return;
      }
      case "DOCUMENT": {
        // Only scanned-clean wallet files can travel in a package.
        const row = await this.prisma.document.findFirst({
          where: {
            id: itemId,
            ownerUserId: userId,
            scanStatus: "CLEAN",
            deletedAt: null,
          },
          select: { id: true },
        });
        if (!row) throw new NotFoundException({ code: "ITEM_NOT_FOUND" });
        return;
      }
      case "CREDENTIAL": {
        // Only accepted (ACTIVE) credentials — never pending offers.
        const row = await this.prisma.credential.findFirst({
          where: { id: itemId, subjectUserId: userId, status: "ACTIVE" },
          select: { id: true },
        });
        if (!row) throw new NotFoundException({ code: "ITEM_NOT_FOUND" });
        return;
      }
      case "SECTION": {
        const parsed = ApplicationSectionKeySchema.safeParse(itemId);
        if (!parsed.success) {
          throw new BadRequestException({ code: "UNKNOWN_SECTION" });
        }
        return;
      }
      default:
        // References and portfolio ship in their own milestones — refusing
        // beats silently accepting dead references (coding rule §63).
        throw new BadRequestException({
          code: "ITEM_TYPE_NOT_IMPLEMENTED",
          itemType,
        });
    }
  }
}
