import { Injectable } from "@nestjs/common";
import type { AuditActorType, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { sha256Hex } from "../../common/crypto";

const GENESIS_HASH = "0".repeat(64);
/** Arbitrary constant key for the Postgres advisory lock serializing the chain. */
const AUDIT_CHAIN_LOCK = 728_691_337;

export interface AuditEntry {
  actorType: AuditActorType;
  actorId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  /** IDs and coarse facts only — never PII payloads (SECURITY.md §1). */
  metadata?: Record<string, unknown> | null;
  ipCoarse?: string | null;
}

/**
 * Append-only, hash-chained audit log (SECURITY.md §1). Each event's hash
 * covers the previous hash plus the canonical event content; a chain walk
 * detects any retroactive tampering. Writes are serialized with a transaction-
 * scoped advisory lock so concurrent requests cannot fork the chain.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async append(entry: AuditEntry): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${AUDIT_CHAIN_LOCK})`;
      const last = await tx.auditEvent.findFirst({
        orderBy: { sequence: "desc" },
        select: { hash: true },
      });
      const prevHash = last?.hash ?? GENESIS_HASH;
      const createdAt = new Date();
      const hash = this.computeHash(prevHash, entry, createdAt);
      await tx.auditEvent.create({
        data: {
          actorType: entry.actorType,
          actorId: entry.actorId ?? null,
          action: entry.action,
          targetType: entry.targetType ?? null,
          targetId: entry.targetId ?? null,
          metadata: (entry.metadata ?? undefined) as
            | Prisma.InputJsonValue
            | undefined,
          ipCoarse: entry.ipCoarse ?? null,
          prevHash,
          hash,
          createdAt,
        },
      });
    });
  }

  /** Walks the full chain; returns false if any link has been altered. */
  async verifyChain(): Promise<boolean> {
    const events = await this.prisma.auditEvent.findMany({
      orderBy: { sequence: "asc" },
    });
    let prevHash = GENESIS_HASH;
    for (const event of events) {
      if (event.prevHash !== prevHash) return false;
      const recomputed = this.computeHash(
        prevHash,
        {
          actorType: event.actorType,
          actorId: event.actorId,
          action: event.action,
          targetType: event.targetType,
          targetId: event.targetId,
          metadata: (event.metadata ?? null) as Record<string, unknown> | null,
          ipCoarse: event.ipCoarse,
        },
        event.createdAt,
      );
      if (recomputed !== event.hash) return false;
      prevHash = event.hash;
    }
    return true;
  }

  private computeHash(
    prevHash: string,
    entry: AuditEntry,
    createdAt: Date,
  ): string {
    const canonical = JSON.stringify([
      entry.actorType,
      entry.actorId ?? null,
      entry.action,
      entry.targetType ?? null,
      entry.targetId ?? null,
      entry.metadata ?? null,
      entry.ipCoarse ?? null,
      createdAt.toISOString(),
    ]);
    return sha256Hex(prevHash + canonical);
  }
}
