import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { UploadIntentSchema, type UploadIntentDto } from "@careerid/shared";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { CurrentAuth, SessionGuard } from "../auth/session.guard";
import type { SessionContext } from "../auth/session.service";
import { DocumentsService } from "./documents.service";

@Controller("documents")
@UseGuards(SessionGuard)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post("upload-intent")
  @HttpCode(201)
  uploadIntent(
    @CurrentAuth() auth: SessionContext,
    @Body(new ZodValidationPipe(UploadIntentSchema)) dto: UploadIntentDto,
  ) {
    return this.documents.createUploadIntent(auth.user.id, dto);
  }

  @Post(":id/complete")
  @HttpCode(200)
  complete(@CurrentAuth() auth: SessionContext, @Param("id") id: string) {
    return this.documents.complete(auth.user.id, id);
  }

  @Get()
  list(@CurrentAuth() auth: SessionContext) {
    return this.documents.list(auth.user.id);
  }

  @Get(":id")
  get(@CurrentAuth() auth: SessionContext, @Param("id") id: string) {
    return this.documents.get(auth.user.id, id);
  }

  @Get(":id/download")
  download(@CurrentAuth() auth: SessionContext, @Param("id") id: string) {
    return this.documents.downloadUrl(auth.user.id, id);
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(@CurrentAuth() auth: SessionContext, @Param("id") id: string) {
    await this.documents.softDelete(auth.user.id, id);
  }
}
