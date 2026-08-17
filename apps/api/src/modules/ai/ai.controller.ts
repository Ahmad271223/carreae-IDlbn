import {
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  AiDraftRequestSchema,
  LetterFromPostingSchema,
  type AiDraftRequestDto,
  type LetterFromPostingDto,
} from "@careerid/shared";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { CurrentAuth, SessionGuard } from "../auth/session.guard";
import type { SessionContext } from "../auth/session.service";
import { AiService } from "./ai.service";

/** The one-shot entry point: a pasted posting in, a finished letter out. */
@Controller("cover-letters")
@UseGuards(SessionGuard)
export class LetterGeneratorController {
  constructor(private readonly ai: AiService) {}

  @Post("from-posting")
  @HttpCode(201)
  fromPosting(
    @CurrentAuth() auth: SessionContext,
    @Body(new ZodValidationPipe(LetterFromPostingSchema))
    dto: LetterFromPostingDto,
  ) {
    return this.ai.generateFromPosting(auth.user.id, dto);
  }
}

@Controller("cover-letters/:letterId/blocks/:blockId")
@UseGuards(SessionGuard)
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post("draft")
  @HttpCode(200)
  draft(
    @CurrentAuth() auth: SessionContext,
    @Param("letterId") letterId: string,
    @Param("blockId") blockId: string,
    @Body(new ZodValidationPipe(AiDraftRequestSchema)) dto: AiDraftRequestDto,
  ) {
    return this.ai.draftBlock(auth.user.id, letterId, blockId, dto.jobDescription);
  }

  @Post("adopt")
  @HttpCode(200)
  adopt(
    @CurrentAuth() auth: SessionContext,
    @Param("letterId") letterId: string,
    @Param("blockId") blockId: string,
  ) {
    return this.ai.adoptDraft(auth.user.id, letterId, blockId);
  }

  @Post("draft/discard")
  @HttpCode(200)
  discard(
    @CurrentAuth() auth: SessionContext,
    @Param("letterId") letterId: string,
    @Param("blockId") blockId: string,
  ) {
    return this.ai.discardDraft(auth.user.id, letterId, blockId);
  }
}
