import { Controller, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentAuth, SessionGuard } from "../auth/session.guard";
import type { SessionContext } from "../auth/session.service";
import { RenderService } from "./render.service";

@Controller()
@UseGuards(SessionGuard)
export class RenderController {
  constructor(private readonly render: RenderService) {}

  @Post("cvs/:id/render")
  @HttpCode(202)
  async renderCv(@CurrentAuth() auth: SessionContext, @Param("id") id: string) {
    const job = await this.render.enqueueCv(auth.user.id, id);
    return { jobId: job.id, status: job.status };
  }

  @Post("cover-letters/:id/render")
  @HttpCode(202)
  async renderLetter(
    @CurrentAuth() auth: SessionContext,
    @Param("id") id: string,
  ) {
    const job = await this.render.enqueueLetter(auth.user.id, id);
    return { jobId: job.id, status: job.status };
  }

  @Get("render-jobs/:id")
  jobStatus(@CurrentAuth() auth: SessionContext, @Param("id") id: string) {
    return this.render.jobStatus(auth.user.id, id);
  }
}
