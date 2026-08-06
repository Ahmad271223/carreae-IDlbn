import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import {
  getTemplate,
  renderCoverLetterHtml,
  renderCvHtml,
  type ConventionKey,
  type LetterLayoutKey,
} from "@careerid/templates";
import { Queue, Worker } from "bullmq";
import { chromium, type Browser } from "playwright";
import { PrismaService } from "../../prisma/prisma.service";
import { sha256Hex } from "../../common/crypto";
import { AuditService } from "../audit/audit.service";
import { StorageService } from "../storage/storage.service";
import { ResolversService } from "./resolvers.service";

export const RENDER_QUEUE = "render";

export interface RenderJobPayload {
  renderJobId: string;
}

function redisConnection() {
  const url = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    // BullMQ requirement for blocking connections.
    maxRetriesPerRequest: null as null,
  };
}

/**
 * PDF rendering (§25): server-side only — Arabic shaping, bidi and page
 * breaks must not depend on the viewer's device. Headless Chromium prints
 * the SAME HTML the preview shows; output keeps a real text layer.
 */
@Injectable()
export class RenderWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RenderWorker.name);
  private worker: Worker<RenderJobPayload> | null = null;
  private browser: Browser | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly resolvers: ResolversService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit(): void {
    this.worker = new Worker<RenderJobPayload>(
      RENDER_QUEUE,
      async (job) => this.process(job.data.renderJobId),
      { connection: redisConnection(), concurrency: 1 },
    );
    this.worker.on("failed", (job, error) => {
      this.logger.error(`render job ${job?.id} failed: ${error.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.browser?.close();
  }

  private async process(renderJobId: string): Promise<void> {
    const job = await this.prisma.renderJob.findUnique({
      where: { id: renderJobId },
    });
    if (!job || job.status !== "QUEUED") return;
    await this.prisma.renderJob.update({
      where: { id: job.id },
      data: { status: "RUNNING" },
    });
    try {
      const { html, title, templateKey, language, category } =
        await this.buildHtml(job.userId, job.sourceType, job.sourceId);
      const pdf = await this.htmlToPdf(html);
      const documentId = await this.storeVersion(
        job.userId,
        job.sourceType,
        job.sourceId,
        pdf,
        title,
        templateKey,
        language,
        category,
      );
      await this.prisma.renderJob.update({
        where: { id: job.id },
        data: { status: "SUCCEEDED", documentId },
      });
    } catch (error) {
      await this.prisma.renderJob.update({
        where: { id: job.id },
        data: { status: "FAILED", error: String(error).slice(0, 500) },
      });
      throw error;
    }
  }

  private async buildHtml(
    userId: string,
    sourceType: "CV" | "COVER_LETTER",
    sourceId: string,
  ): Promise<{
    html: string;
    title: string;
    templateKey: string;
    language: string;
    category: "CV" | "COVER_LETTER";
  }> {
    if (sourceType === "CV") {
      const { doc, templateKey, language, title } = await this.resolvers.resolveCv(
        userId,
        sourceId,
      );
      const template = getTemplate(templateKey);
      if (!template) throw new Error(`unknown template ${templateKey}`);
      return {
        html: renderCvHtml(doc, template),
        title,
        templateKey,
        language,
        category: "CV",
      };
    }
    const { doc, layoutTemplate, convention, language, title } =
      await this.resolvers.resolveLetter(userId, sourceId);
    return {
      html: renderCoverLetterHtml(
        doc,
        layoutTemplate as LetterLayoutKey,
        convention as ConventionKey,
      ),
      title,
      templateKey: `${layoutTemplate}/${convention}`,
      language,
      category: "COVER_LETTER",
    };
  }

  private async htmlToPdf(html: string): Promise<Buffer> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        // Containers running as root need the sandbox disabled; the input is
        // our own sanitized template HTML, never arbitrary web content.
        args: process.env.CHROMIUM_NO_SANDBOX === "1" ? ["--no-sandbox"] : [],
      });
    }
    const page = await this.browser.newPage();
    try {
      await page.setContent(html, { waitUntil: "networkidle" });
      return await page.pdf({
        format: "A4",
        printBackground: true,
        // Margins live in the template CSS (@page), not the print call.
        margin: { top: "0", bottom: "0", left: "0", right: "0" },
      });
    } finally {
      await page.close();
    }
  }

  private async storeVersion(
    userId: string,
    sourceType: "CV" | "COVER_LETTER",
    sourceId: string,
    pdf: Buffer,
    title: string,
    templateKey: string,
    language: string,
    category: "CV" | "COVER_LETTER",
  ): Promise<string> {
    // §26: every render is a new immutable version linked to its predecessor.
    const previous = await this.prisma.document.findFirst({
      where: {
        ownerUserId: userId,
        category,
        origin: "PLATFORM_GENERATED",
        versions: { none: {} }, // newest = not yet superseded by a version chain
        deletedAt: null,
        fileName: `${title}.pdf`,
      },
      orderBy: { versionNumber: "desc" },
    });

    const document = await this.prisma.document.create({
      data: {
        ownerUserId: userId,
        category,
        origin: "PLATFORM_GENERATED",
        fileName: `${title}.pdf`,
        mimeType: "application/pdf",
        sizeBytes: pdf.length,
        storageKey: "",
        checksumSha256: sha256Hex(pdf),
        // Platform-generated from sanitized content — not user-supplied bytes.
        scanStatus: "CLEAN",
        language,
        versionOfId: previous?.id ?? null,
        versionNumber: (previous?.versionNumber ?? 0) + 1,
      },
    });
    const storageKey = `u/${userId}/${document.id}`;
    await this.storage.putObject(
      this.storage.documentsBucket,
      storageKey,
      pdf,
      "application/pdf",
    );
    await this.prisma.document.update({
      where: { id: document.id },
      data: { storageKey },
    });
    await this.prisma.documentVersion.create({
      data: {
        sourceType,
        sourceId,
        documentId: document.id,
        templateKey,
        language,
      },
    });
    await this.audit.append({
      actorType: "USER",
      actorId: userId,
      action: "document.rendered",
      targetType: "document",
      targetId: document.id,
      metadata: { sourceType, sourceId, templateKey },
    });
    return document.id;
  }
}

/** Queue provider shared by service (enqueue) and tests. */
export function createRenderQueue(): Queue<RenderJobPayload> {
  return new Queue<RenderJobPayload>(RENDER_QUEUE, {
    connection: redisConnection(),
  });
}
