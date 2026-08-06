import {
  Injectable,
  NotFoundException,
  OnModuleDestroy,
} from "@nestjs/common";
import type { Queue } from "bullmq";
import type { RenderJob } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { ResolversService } from "./resolvers.service";
import { RenderJobPayload, createRenderQueue } from "./render.worker";

@Injectable()
export class RenderService implements OnModuleDestroy {
  private readonly queue: Queue<RenderJobPayload> = createRenderQueue();

  constructor(
    private readonly prisma: PrismaService,
    private readonly resolvers: ResolversService,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }

  async enqueueCv(userId: string, cvId: string): Promise<RenderJob> {
    // Resolving up front surfaces ownership/profile errors synchronously.
    await this.resolvers.resolveCv(userId, cvId);
    return this.enqueue(userId, "CV", cvId);
  }

  async enqueueLetter(userId: string, letterId: string): Promise<RenderJob> {
    await this.resolvers.resolveLetter(userId, letterId);
    return this.enqueue(userId, "COVER_LETTER", letterId);
  }

  async jobStatus(userId: string, jobId: string): Promise<RenderJob> {
    const job = await this.prisma.renderJob.findFirst({
      where: { id: jobId, userId },
    });
    if (!job) throw new NotFoundException({ code: "NOT_FOUND" });
    return job;
  }

  private async enqueue(
    userId: string,
    sourceType: "CV" | "COVER_LETTER",
    sourceId: string,
  ): Promise<RenderJob> {
    const job = await this.prisma.renderJob.create({
      data: { userId, sourceType, sourceId },
    });
    await this.queue.add("render", { renderJobId: job.id });
    return job;
  }
}
