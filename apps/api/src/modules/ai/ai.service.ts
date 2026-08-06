import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { CoverLetterBlock, LanguageLevel } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AI_PROVIDER, AIProvider } from "./ai-provider";
import { AiContextBuilder, type AiCareerContext } from "./ai-context";
import { validateDraft, type DraftWarning } from "./entity-validator";

const LEVEL_RANK: Record<LanguageLevel, number> = {
  A1: 1,
  A2: 2,
  B1: 3,
  B2: 4,
  C1: 5,
  C2: 6,
  NATIVE: 7,
};
const C1_RANK = 5;

export interface DraftResult {
  blockId: string;
  draft: string;
  warnings: DraftWarning[];
  backTranslation?: { language: string; text: string; hintKey: string };
}

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contextBuilder: AiContextBuilder,
    private readonly audit: AuditService,
    @Inject(AI_PROVIDER) private readonly provider: AIProvider | null,
  ) {}

  /**
   * §28: the draft lands in draft_content and NOWHERE else. content is only
   * written by the explicit adopt step.
   */
  async draftBlock(
    userId: string,
    letterId: string,
    blockId: string,
    jobDescription?: string,
  ): Promise<DraftResult> {
    if (!this.provider) {
      throw new ServiceUnavailableException({ code: "AI_UNAVAILABLE" });
    }
    const { letter, block } = await this.ownedBlock(userId, letterId, blockId);
    const { context, entities } = await this.contextBuilder.build(userId);

    const draft = (
      await this.provider.complete({
        system: this.systemPrompt(letter.language, block.type),
        // §29/§31: prompt = structured career context + job description.
        // Never free text of the user about themselves, never sensitive data.
        prompt: this.userPrompt(context, block.type, jobDescription),
        maxTokens: 700,
      })
    ).trim();

    await this.prisma.coverLetterBlock.update({
      where: { id: block.id },
      data: { draftContent: draft },
    });
    await this.audit.append({
      actorType: "USER",
      actorId: userId,
      action: "ai.draft_generated",
      targetType: "cover_letter_block",
      targetId: block.id,
      metadata: { blockType: block.type, language: letter.language },
    });

    const result: DraftResult = {
      blockId: block.id,
      draft,
      warnings: validateDraft(draft, entities),
    };

    // §30: back-translation whenever the letter language exceeds the user's
    // documented level (below C1 or not in the profile at all).
    const backTranslation = await this.maybeBackTranslate(
      userId,
      letter.language,
      draft,
      context,
    );
    if (backTranslation) result.backTranslation = backTranslation;
    return result;
  }

  /** Explicit promotion: draft → content, origin AI_GENERATED (§28). */
  async adoptDraft(
    userId: string,
    letterId: string,
    blockId: string,
  ): Promise<CoverLetterBlock> {
    const { block } = await this.ownedBlock(userId, letterId, blockId);
    if (!block.draftContent) {
      throw new ConflictException({ code: "NO_DRAFT" });
    }
    const updated = await this.prisma.coverLetterBlock.update({
      where: { id: block.id },
      data: {
        content: block.draftContent,
        draftContent: null,
        origin: "AI_GENERATED",
      },
    });
    await this.audit.append({
      actorType: "USER",
      actorId: userId,
      action: "ai.draft_adopted",
      targetType: "cover_letter_block",
      targetId: block.id,
    });
    return updated;
  }

  async discardDraft(
    userId: string,
    letterId: string,
    blockId: string,
  ): Promise<CoverLetterBlock> {
    const { block } = await this.ownedBlock(userId, letterId, blockId);
    return this.prisma.coverLetterBlock.update({
      where: { id: block.id },
      data: { draftContent: null },
    });
  }

  private async maybeBackTranslate(
    userId: string,
    letterLanguage: string,
    draft: string,
    context: AiCareerContext,
  ): Promise<DraftResult["backTranslation"] | null> {
    const native = context.languages.find((l) => l.level === "NATIVE");
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const mainLanguage = native?.code ?? user.locale;
    if (letterLanguage === mainLanguage) return null;

    const documented = context.languages.find((l) => l.code === letterLanguage);
    const rank = documented ? LEVEL_RANK[documented.level as LanguageLevel] : 0;
    if (rank >= C1_RANK) return null;

    const text = (
      await this.provider!.complete({
        system:
          `Translate the following text sentence by sentence into the language ` +
          `with ISO 639-1 code "${mainLanguage}". Keep sentence order. Output ` +
          `only the translation, one sentence per line.`,
        prompt: draft,
        maxTokens: 900,
      })
    ).trim();
    return { language: mainLanguage, text, hintKey: "ai.backTranslation.hint" };
  }

  private systemPrompt(language: string, blockType: string): string {
    return [
      `You write one block of a job application cover letter.`,
      `Write in the language with ISO 639-1 code "${language}".`,
      `Block type: ${blockType}. Output ONLY the text of this block — no headers, no quotes, no commentary.`,
      // §27 hard rules — additionally enforced by the post-generation validator.
      `Use ONLY facts from the CAREER PROFILE below.`,
      `NEVER invent employers, schools, degrees, certificates, grades, language levels or dates.`,
      `NEVER state birth date, nationality, phone numbers or addresses.`,
      `Do not exaggerate: if the profile does not support a claim, do not make it.`,
    ].join("\n");
  }

  private userPrompt(
    context: AiCareerContext,
    blockType: string,
    jobDescription?: string,
  ): string {
    return [
      `CAREER PROFILE (structured, authoritative):`,
      JSON.stringify(context, null, 2),
      jobDescription
        ? `\nJOB DESCRIPTION (target of the application):\n${jobDescription}`
        : `\n(No job description provided — write generically for the desired role.)`,
      `\nTASK: write the ${blockType} block of the cover letter.`,
    ].join("\n");
  }

  private async ownedBlock(userId: string, letterId: string, blockId: string) {
    const letter = await this.prisma.coverLetter.findFirst({
      where: { id: letterId, userId, deletedAt: null },
    });
    if (!letter) throw new NotFoundException({ code: "NOT_FOUND" });
    const block = await this.prisma.coverLetterBlock.findFirst({
      where: { id: blockId, coverLetterId: letter.id },
    });
    if (!block) throw new NotFoundException({ code: "NOT_FOUND" });
    return { letter, block };
  }
}
