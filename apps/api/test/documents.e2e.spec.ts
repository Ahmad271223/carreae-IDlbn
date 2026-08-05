import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaService } from "../src/prisma/prisma.service";
import { sha256Hex } from "../src/common/crypto";
import {
  FakeMailer,
  createTestApp,
  resetDatabase,
  sessionCookie,
} from "./helpers";

const PASSWORD = "correct horse battery";
const PDF_BYTES = Buffer.from(
  "%PDF-1.7\n1 0 obj <</Type /Catalog>> endobj\ntrailer <<>>\n%%EOF\n",
  "latin1",
);
const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 7),
]);
const EXE_BYTES = Buffer.concat([
  Buffer.from("MZ", "latin1"),
  Buffer.alloc(64, 1),
]);
const EICAR_BYTES = Buffer.from("%PDF-1.7\nEICAR-TEST-CONTENT\n", "latin1");

let app: INestApplication;
let mailer: FakeMailer;
let prisma: PrismaService;

beforeAll(async () => {
  ({ app, mailer, prisma } = await createTestApp());
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetDatabase(prisma);
  mailer.sent.length = 0;
});

function http() {
  return request(app.getHttpServer());
}

async function makeUser(email: string): Promise<string> {
  await http().post("/api/v1/auth/register").send({ email, password: PASSWORD });
  const res = await http()
    .post("/api/v1/auth/login")
    .send({ email, password: PASSWORD });
  return sessionCookie(res.headers);
}

async function upload(
  cookie: string,
  bytes: Buffer,
  fileName = "certificate.pdf",
  category = "CERTIFICATE",
): Promise<{ documentId: string; completeRes: request.Response }> {
  const intent = await http()
    .post("/api/v1/documents/upload-intent")
    .set("Cookie", cookie)
    .send({ fileName, category });
  expect(intent.status).toBe(201);
  expect(intent.body.uploadUrl).toContain("careerid-test-quarantine");

  const put = await fetch(intent.body.uploadUrl, {
    method: "PUT",
    body: new Uint8Array(bytes),
  });
  expect(put.ok).toBe(true);

  const completeRes = await http()
    .post(`/api/v1/documents/${intent.body.documentId}/complete`)
    .set("Cookie", cookie);
  return { documentId: intent.body.documentId, completeRes };
}

describe("document wallet pipeline", () => {
  it("intent → presigned PUT → complete: sniffed type, checksum, moved out of quarantine, downloadable", async () => {
    const cookie = await makeUser("aline@example.com");
    const { documentId, completeRes } = await upload(cookie, PDF_BYTES);

    expect(completeRes.status).toBe(200);
    expect(completeRes.body.scanStatus).toBe("CLEAN");
    expect(completeRes.body.mimeType).toBe("application/pdf");
    expect(completeRes.body.sizeBytes).toBe(PDF_BYTES.length);
    expect(completeRes.body.checksumSha256).toBe(sha256Hex(PDF_BYTES));
    expect(completeRes.body.storageKey).toMatch(/^u\//);

    const download = await http()
      .get(`/api/v1/documents/${documentId}/download`)
      .set("Cookie", cookie);
    expect(download.status).toBe(200);
    const fetched = await fetch(download.body.url);
    expect(fetched.status).toBe(200);
    const body = Buffer.from(await fetched.arrayBuffer());
    expect(body.equals(PDF_BYTES)).toBe(true);
    expect(fetched.headers.get("content-disposition")).toContain("attachment");
  });

  it("extension is ignored — a PNG uploaded as .pdf is recorded as image/png", async () => {
    const cookie = await makeUser("aline@example.com");
    const { completeRes } = await upload(cookie, PNG_BYTES, "sneaky.pdf");
    expect(completeRes.status).toBe(200);
    expect(completeRes.body.mimeType).toBe("image/png");
  });

  it("rejects unsupported file types and removes the quarantine object (§65 upload attack)", async () => {
    const cookie = await makeUser("aline@example.com");
    const { documentId, completeRes } = await upload(cookie, EXE_BYTES, "app.pdf");
    expect(completeRes.status).toBe(422);
    expect(completeRes.body.code).toBe("UNSUPPORTED_FILE_TYPE");

    const row = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(row.scanStatus).toBe("FAILED");
    const download = await http()
      .get(`/api/v1/documents/${documentId}/download`)
      .set("Cookie", cookie);
    expect(download.status).toBe(409);
  });

  it("infected uploads are blocked, marked and never downloadable", async () => {
    const cookie = await makeUser("aline@example.com");
    const { documentId, completeRes } = await upload(cookie, EICAR_BYTES);
    expect(completeRes.status).toBe(422);
    expect(completeRes.body.code).toBe("MALWARE_DETECTED");

    const row = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(row.scanStatus).toBe("INFECTED");
    expect(
      (
        await http()
          .get(`/api/v1/documents/${documentId}/download`)
          .set("Cookie", cookie)
      ).status,
    ).toBe(409);
  });

  it("photos must be images", async () => {
    const cookie = await makeUser("aline@example.com");
    const { completeRes } = await upload(cookie, PDF_BYTES, "photo.png", "PHOTO");
    expect(completeRes.status).toBe(422);
    expect(completeRes.body.code).toBe("PHOTO_MUST_BE_IMAGE");
  });

  it("complete without an uploaded object fails cleanly; double-complete is refused", async () => {
    const cookie = await makeUser("aline@example.com");
    const intent = await http()
      .post("/api/v1/documents/upload-intent")
      .set("Cookie", cookie)
      .send({ fileName: "x.pdf", category: "OTHER" });
    const missing = await http()
      .post(`/api/v1/documents/${intent.body.documentId}/complete`)
      .set("Cookie", cookie);
    expect(missing.status).toBe(409);
    expect(missing.body.code).toBe("UPLOAD_MISSING");

    const { documentId } = await upload(cookie, PDF_BYTES);
    const again = await http()
      .post(`/api/v1/documents/${documentId}/complete`)
      .set("Cookie", cookie);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("ALREADY_PROCESSED");
  });

  it("cross-tenant document access is indistinguishable from not-found (§65 test 1)", async () => {
    const cookieA = await makeUser("usera@example.com");
    const cookieB = await makeUser("userb@example.com");
    const { documentId } = await upload(cookieA, PDF_BYTES);

    const foreignGet = await http()
      .get(`/api/v1/documents/${documentId}`)
      .set("Cookie", cookieB);
    const foreignDownload = await http()
      .get(`/api/v1/documents/${documentId}/download`)
      .set("Cookie", cookieB);
    const foreignDelete = await http()
      .delete(`/api/v1/documents/${documentId}`)
      .set("Cookie", cookieB);
    const missing = await http()
      .get(`/api/v1/documents/0198aaaa-0000-7000-8000-000000000000`)
      .set("Cookie", cookieB);

    expect(foreignGet.status).toBe(404);
    expect(foreignDownload.status).toBe(404);
    expect(foreignDelete.status).toBe(404);
    expect(foreignGet.body).toEqual(missing.body);
    expect((await http().get("/api/v1/documents")).status).toBe(401);
  });

  it("path separators in file names are rejected at validation", async () => {
    const cookie = await makeUser("aline@example.com");
    const res = await http()
      .post("/api/v1/documents/upload-intent")
      .set("Cookie", cookie)
      .send({ fileName: "../../etc/passwd", category: "OTHER" });
    expect(res.status).toBe(400);
  });

  it("soft delete hides the document from the wallet", async () => {
    const cookie = await makeUser("aline@example.com");
    const { documentId } = await upload(cookie, PDF_BYTES);
    await http().delete(`/api/v1/documents/${documentId}`).set("Cookie", cookie);
    const list = await http().get("/api/v1/documents").set("Cookie", cookie);
    expect(list.body).toHaveLength(0);
  });
});
