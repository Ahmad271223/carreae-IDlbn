import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type { UploadIntentDto } from "@careerid/shared";
import type { Document } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { sha256Hex } from "../../common/crypto";
import { sniffMimeType } from "../../common/mime-sniff";
import { AuditService } from "../audit/audit.service";
import { StorageService } from "../storage/storage.service";
import { SCANNER, Scanner } from "./scanner";

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/**
 * Wallet pipeline (SECURITY.md §1, ARCHITECTURE §4.3):
 * quarantine upload → size check → magic-byte sniff → malware scan →
 * checksum → move to private documents bucket. Downloads are gated on
 * scanStatus = CLEAN and always short-lived signed URLs.
 *
 * The scan currently runs synchronously inside complete() — acceptable for
 * the 15MB cap; it moves onto the BullMQ worker when the render queue lands
 * in Phase 3 (tracked in ROADMAP.md).
 */
@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    @Inject(SCANNER) private readonly scanner: Scanner | null,
  ) {}

  async createUploadIntent(
    userId: string,
    dto: UploadIntentDto,
  ): Promise<{ documentId: string; uploadUrl: string }> {
    const document = await this.prisma.document.create({
      data: {
        ownerUserId: userId,
        category: dto.category,
        origin: "USER_UPLOADED",
        fileName: dto.fileName,
        storageKey: "", // set below once the id exists
        scanStatus: "PENDING",
      },
    });
    const storageKey = `q/${document.id}`;
    await this.prisma.document.update({
      where: { id: document.id },
      data: { storageKey },
    });
    const uploadUrl = await this.storage.presignUpload(
      this.storage.quarantineBucket,
      storageKey,
    );
    return { documentId: document.id, uploadUrl };
  }

  async complete(userId: string, documentId: string): Promise<Document> {
    const document = await this.owned(userId, documentId);
    if (document.scanStatus !== "PENDING" || !document.storageKey.startsWith("q/")) {
      throw new ConflictException({ code: "ALREADY_PROCESSED" });
    }
    // Fail closed: without a scanner nothing leaves quarantine (§42).
    if (!this.scanner) {
      throw new ServiceUnavailableException({ code: "SCANNER_UNAVAILABLE" });
    }

    const quarantineKey = document.storageKey;
    const size = await this.storage.headSize(
      this.storage.quarantineBucket,
      quarantineKey,
    );
    if (size === null) {
      throw new ConflictException({ code: "UPLOAD_MISSING" });
    }
    if (size > MAX_UPLOAD_BYTES) {
      await this.discardQuarantine(document.id, quarantineKey, "FAILED");
      throw new PayloadTooLargeException({ code: "FILE_TOO_LARGE" });
    }

    const buffer = await this.storage.getBuffer(
      this.storage.quarantineBucket,
      quarantineKey,
    );

    const mimeType = sniffMimeType(buffer);
    if (!mimeType) {
      await this.discardQuarantine(document.id, quarantineKey, "FAILED");
      throw new UnprocessableEntityException({ code: "UNSUPPORTED_FILE_TYPE" });
    }
    if (document.category === "PHOTO" && !mimeType.startsWith("image/")) {
      await this.discardQuarantine(document.id, quarantineKey, "FAILED");
      throw new UnprocessableEntityException({ code: "PHOTO_MUST_BE_IMAGE" });
    }

    const verdict = await this.scanner.scan(buffer);
    if (verdict.status === "INFECTED") {
      await this.discardQuarantine(document.id, quarantineKey, "INFECTED");
      await this.audit.append({
        actorType: "SYSTEM",
        action: "document.infected",
        targetType: "document",
        targetId: document.id,
        metadata: { signature: verdict.signature },
      });
      throw new UnprocessableEntityException({ code: "MALWARE_DETECTED" });
    }

    const finalKey = `u/${userId}/${document.id}`;
    await this.storage.copy(
      this.storage.quarantineBucket,
      quarantineKey,
      this.storage.documentsBucket,
      finalKey,
    );
    await this.storage.delete(this.storage.quarantineBucket, quarantineKey);

    const updated = await this.prisma.document.update({
      where: { id: document.id },
      data: {
        storageKey: finalKey,
        mimeType,
        sizeBytes: buffer.length,
        checksumSha256: sha256Hex(buffer),
        scanStatus: "CLEAN",
      },
    });
    await this.audit.append({
      actorType: "USER",
      actorId: userId,
      action: "document.uploaded",
      targetType: "document",
      targetId: document.id,
      metadata: { category: document.category, mimeType, sizeBytes: buffer.length },
    });
    return updated;
  }

  list(userId: string): Promise<Document[]> {
    return this.prisma.document.findMany({
      where: { ownerUserId: userId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  }

  async get(userId: string, id: string): Promise<Document> {
    return this.owned(userId, id);
  }

  async downloadUrl(userId: string, id: string): Promise<{ url: string }> {
    const document = await this.owned(userId, id);
    if (document.scanStatus !== "CLEAN") {
      throw new ConflictException({ code: "NOT_AVAILABLE" });
    }
    const url = await this.storage.presignDownload(
      this.storage.documentsBucket,
      document.storageKey,
      document.fileName,
      document.mimeType ?? undefined,
    );
    // Document access is an audited event (§41).
    await this.audit.append({
      actorType: "USER",
      actorId: userId,
      action: "document.downloaded",
      targetType: "document",
      targetId: document.id,
    });
    return { url };
  }

  async softDelete(userId: string, id: string): Promise<void> {
    const document = await this.owned(userId, id);
    await this.prisma.document.update({
      where: { id: document.id },
      data: { deletedAt: new Date() },
    });
    await this.audit.append({
      actorType: "USER",
      actorId: userId,
      action: "document.deleted",
      targetType: "document",
      targetId: document.id,
    });
  }

  private async owned(userId: string, id: string): Promise<Document> {
    const document = await this.prisma.document.findFirst({
      where: { id, ownerUserId: userId, deletedAt: null },
    });
    if (!document) throw new NotFoundException({ code: "NOT_FOUND" });
    return document;
  }

  private async discardQuarantine(
    documentId: string,
    key: string,
    status: "INFECTED" | "FAILED",
  ): Promise<void> {
    try {
      await this.storage.delete(this.storage.quarantineBucket, key);
    } catch (error) {
      this.logger.error(`quarantine cleanup failed for ${key}: ${String(error)}`);
    }
    await this.prisma.document.update({
      where: { id: documentId },
      data: { scanStatus: status },
    });
  }
}
