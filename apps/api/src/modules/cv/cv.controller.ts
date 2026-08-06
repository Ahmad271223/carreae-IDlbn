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
  CvCreateSchema,
  CvItemsPutSchema,
  CvUpdateSchema,
  type CvCreateDto,
  type CvItemsPutDto,
  type CvUpdateDto,
} from "@careerid/shared";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { CurrentAuth, SessionGuard } from "../auth/session.guard";
import type { SessionContext } from "../auth/session.service";
import { CvService } from "./cv.service";

@Controller("cvs")
@UseGuards(SessionGuard)
export class CvController {
  constructor(private readonly cvs: CvService) {}

  @Get("templates")
  templates() {
    return this.cvs.templates();
  }

  @Post()
  @HttpCode(201)
  create(
    @CurrentAuth() auth: SessionContext,
    @Body(new ZodValidationPipe(CvCreateSchema)) dto: CvCreateDto,
  ) {
    return this.cvs.create(auth.user.id, dto);
  }

  @Get()
  list(@CurrentAuth() auth: SessionContext) {
    return this.cvs.list(auth.user.id);
  }

  @Get(":id")
  get(@CurrentAuth() auth: SessionContext, @Param("id") id: string) {
    return this.cvs.get(auth.user.id, id);
  }

  @Patch(":id")
  update(
    @CurrentAuth() auth: SessionContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(CvUpdateSchema)) dto: CvUpdateDto,
  ) {
    return this.cvs.update(auth.user.id, id, dto);
  }

  @Put(":id/items")
  putItems(
    @CurrentAuth() auth: SessionContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(CvItemsPutSchema)) dto: CvItemsPutDto,
  ) {
    return this.cvs.putItems(auth.user.id, id, dto);
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(@CurrentAuth() auth: SessionContext, @Param("id") id: string) {
    await this.cvs.softDelete(auth.user.id, id);
  }
}
