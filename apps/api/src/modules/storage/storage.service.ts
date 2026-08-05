import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import {
  CopyObjectCommand,
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const UPLOAD_URL_TTL_SECONDS = 10 * 60;
/** Short-lived by design — SECURITY.md §6 caps signed download URLs at 5 min. */
const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;

/**
 * S3-compatible object storage (MinIO in dev, any S3 API in prod). All
 * buckets are private; the only way bytes leave is a short-lived signed URL.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client = new S3Client({
    endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
    region: process.env.S3_REGION ?? "us-east-1",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY ?? "",
      secretAccessKey: process.env.S3_SECRET_KEY ?? "",
    },
    forcePathStyle: true, // MinIO
  });

  readonly quarantineBucket =
    process.env.S3_BUCKET_QUARANTINE ?? "careerid-quarantine";
  readonly documentsBucket =
    process.env.S3_BUCKET_DOCUMENTS ?? "careerid-documents";

  /** Dev/test convenience; production buckets are provisioned by infra. */
  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === "production") return;
    for (const bucket of [this.quarantineBucket, this.documentsBucket]) {
      try {
        await this.client.send(new HeadBucketCommand({ Bucket: bucket }));
      } catch {
        try {
          await this.client.send(new CreateBucketCommand({ Bucket: bucket }));
          this.logger.log(`created bucket ${bucket}`);
        } catch (error) {
          this.logger.error(`cannot ensure bucket ${bucket}: ${String(error)}`);
        }
      }
    }
  }

  presignUpload(bucket: string, key: string): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn: UPLOAD_URL_TTL_SECONDS },
    );
  }

  presignDownload(
    bucket: string,
    key: string,
    fileName: string,
    contentType?: string,
  ): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ResponseContentDisposition: `attachment; filename="${fileName.replace(/[^\w.\- ]/g, "_")}"`,
        ...(contentType ? { ResponseContentType: contentType } : {}),
      }),
      { expiresIn: DOWNLOAD_URL_TTL_SECONDS },
    );
  }

  async headSize(bucket: string, key: string): Promise<number | null> {
    try {
      const head = await this.client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: key }),
      );
      return head.ContentLength ?? null;
    } catch {
      return null;
    }
  }

  async getBuffer(bucket: string, key: string): Promise<Buffer> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    const bytes = await result.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }

  async copy(
    fromBucket: string,
    fromKey: string,
    toBucket: string,
    toKey: string,
  ): Promise<void> {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: toBucket,
        Key: toKey,
        CopySource: `/${fromBucket}/${encodeURIComponent(fromKey)}`,
      }),
    );
  }

  async delete(bucket: string, key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: key }),
    );
  }
}
