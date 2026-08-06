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
  ApplicationCreateSchema,
  ApplicationItemsPutSchema,
  ApplicationUpdateSchema,
  type ApplicationCreateDto,
  type ApplicationItemsPutDto,
  type ApplicationUpdateDto,
} from "@careerid/shared";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { CurrentAuth, SessionGuard } from "../auth/session.guard";
import type { SessionContext } from "../auth/session.service";
import { ApplicationService } from "./application.service";

@Controller("applications")
@UseGuards(SessionGuard)
export class ApplicationController {
  constructor(private readonly applications: ApplicationService) {}

  @Post()
  @HttpCode(201)
  create(
    @CurrentAuth() auth: SessionContext,
    @Body(new ZodValidationPipe(ApplicationCreateSchema)) dto: ApplicationCreateDto,
  ) {
    return this.applications.create(auth.user.id, dto);
  }

  @Get()
  list(@CurrentAuth() auth: SessionContext) {
    return this.applications.list(auth.user.id);
  }

  @Get(":id")
  get(@CurrentAuth() auth: SessionContext, @Param("id") id: string) {
    return this.applications.get(auth.user.id, id);
  }

  @Patch(":id")
  update(
    @CurrentAuth() auth: SessionContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(ApplicationUpdateSchema)) dto: ApplicationUpdateDto,
  ) {
    return this.applications.update(auth.user.id, id, dto);
  }

  @Put(":id/items")
  putItems(
    @CurrentAuth() auth: SessionContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(ApplicationItemsPutSchema))
    dto: ApplicationItemsPutDto,
  ) {
    return this.applications.putItems(auth.user.id, id, dto);
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(@CurrentAuth() auth: SessionContext, @Param("id") id: string) {
    await this.applications.softDelete(auth.user.id, id);
  }
}
