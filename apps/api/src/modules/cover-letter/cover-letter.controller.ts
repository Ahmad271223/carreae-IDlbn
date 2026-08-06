import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import {
  CoverLetterBlocksPutSchema,
  CoverLetterCreateSchema,
  CoverLetterUpdateSchema,
  type CoverLetterBlocksPutDto,
  type CoverLetterCreateDto,
  type CoverLetterUpdateDto,
} from "@careerid/shared";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { CurrentAuth, SessionGuard } from "../auth/session.guard";
import type { SessionContext } from "../auth/session.service";
import { CoverLetterService } from "./cover-letter.service";

@Controller("cover-letters")
@UseGuards(SessionGuard)
export class CoverLetterController {
  constructor(private readonly letters: CoverLetterService) {}

  @Post()
  @HttpCode(201)
  create(
    @CurrentAuth() auth: SessionContext,
    @Body(new ZodValidationPipe(CoverLetterCreateSchema)) dto: CoverLetterCreateDto,
  ) {
    return this.letters.create(auth.user.id, dto);
  }

  @Get()
  list(@CurrentAuth() auth: SessionContext) {
    return this.letters.list(auth.user.id);
  }

  @Get(":id")
  get(@CurrentAuth() auth: SessionContext, @Param("id") id: string) {
    return this.letters.get(auth.user.id, id);
  }

  @Patch(":id")
  update(
    @CurrentAuth() auth: SessionContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(CoverLetterUpdateSchema)) dto: CoverLetterUpdateDto,
  ) {
    return this.letters.update(auth.user.id, id, dto);
  }

  @Put(":id/blocks")
  putBlocks(
    @CurrentAuth() auth: SessionContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(CoverLetterBlocksPutSchema))
    dto: CoverLetterBlocksPutDto,
  ) {
    return this.letters.putBlocks(auth.user.id, id, dto);
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(@CurrentAuth() auth: SessionContext, @Param("id") id: string) {
    await this.letters.softDelete(auth.user.id, id);
  }
}
