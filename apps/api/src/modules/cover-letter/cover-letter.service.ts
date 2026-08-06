import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  CoverLetterBlocksPutDto,
  CoverLetterCreateDto,
  CoverLetterUpdateDto,
} from "@careerid/shared";
import type { BlockOrigin, CoverLetter, CoverLetterBlock } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

/** Default skeleton per §24 — one of each block, a single body to start. */
const DEFAULT_BLOCKS: Array<{ type: CoverLetterBlock["type"]; order: number }> = [
  { type: "RECIPIENT", order: 0 },
  { type: "SUBJECT", order: 1 },
  { type: "SALUTATION", order: 2 },
  { type: "OPENING", order: 3 },
  { type: "BODY", order: 4 },
  { type: "CLOSING", order: 5 },
  { type: "SIGNATURE", order: 6 },
];

/**
 * Origin bookkeeping (§28): user edits to an AI-generated block demote it to
 * AI_EDITED; untouched blocks keep their origin; everything else is USER.
 * AI never writes here — drafts land in draft_content via the 3.5 milestone.
 */
function nextOrigin(
  existing: CoverLetterBlock | undefined,
  newContent: string,
): BlockOrigin {
  if (!existing) return "USER";
  if (existing.content === newContent) return existing.origin;
  return existing.origin === "AI_GENERATED" || existing.origin === "AI_EDITED"
    ? "AI_EDITED"
    : "USER";
}

@Injectable()
export class CoverLetterService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    dto: CoverLetterCreateDto,
  ): Promise<CoverLetter & { blocks: CoverLetterBlock[] }> {
    const letter = await this.prisma.coverLetter.create({
      data: {
        userId,
        title: dto.title,
        layoutTemplate: dto.layoutTemplate,
        convention: dto.convention,
        language: dto.language,
        blocks: { create: DEFAULT_BLOCKS },
      },
      include: { blocks: { orderBy: { order: "asc" } } },
    });
    return letter;
  }

  list(userId: string): Promise<CoverLetter[]> {
    return this.prisma.coverLetter.findMany({
      where: { userId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
    });
  }

  async get(
    userId: string,
    id: string,
  ): Promise<CoverLetter & { blocks: CoverLetterBlock[] }> {
    const letter = await this.prisma.coverLetter.findFirst({
      where: { id, userId, deletedAt: null },
      include: { blocks: { orderBy: { order: "asc" } } },
    });
    if (!letter) throw new NotFoundException({ code: "NOT_FOUND" });
    return letter;
  }

  async update(
    userId: string,
    id: string,
    dto: CoverLetterUpdateDto,
  ): Promise<CoverLetter> {
    await this.get(userId, id);
    return this.prisma.coverLetter.update({ where: { id }, data: dto });
  }

  async softDelete(userId: string, id: string): Promise<void> {
    await this.get(userId, id);
    await this.prisma.coverLetter.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /** Replaces the block list while carrying origin state across edits. */
  async putBlocks(
    userId: string,
    id: string,
    dto: CoverLetterBlocksPutDto,
  ): Promise<CoverLetterBlock[]> {
    const letter = await this.get(userId, id);
    const existingById = new Map(letter.blocks.map((b) => [b.id, b]));

    return this.prisma.$transaction(async (tx) => {
      await tx.coverLetterBlock.deleteMany({ where: { coverLetterId: id } });
      for (const block of dto.blocks) {
        const existing = block.id ? existingById.get(block.id) : undefined;
        await tx.coverLetterBlock.create({
          data: {
            coverLetterId: id,
            type: block.type,
            order: block.order,
            content: block.content,
            origin: nextOrigin(existing, block.content),
            // Pending drafts survive a reorder/edit of the same block.
            draftContent: existing?.draftContent ?? null,
          },
        });
      }
      return tx.coverLetterBlock.findMany({
        where: { coverLetterId: id },
        orderBy: { order: "asc" },
      });
    });
  }
}
