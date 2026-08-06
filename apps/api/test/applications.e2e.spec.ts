import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaService } from "../src/prisma/prisma.service";
import {
  FakeMailer,
  createTestApp,
  resetDatabase,
  sessionCookie,
} from "./helpers";

const PASSWORD = "correct horse battery";
const PDF_BYTES = Buffer.from("%PDF-1.7\nminimal\n%%EOF\n", "latin1");

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

async function makeUser(email = "aline@example.com") {
  await http().post("/api/v1/auth/register").send({ email, password: PASSWORD });
  const login = await http()
    .post("/api/v1/auth/login")
    .send({ email, password: PASSWORD });
  const cookie = sessionCookie(login.headers);
  await http()
    .patch("/api/v1/profile")
    .set("Cookie", cookie)
    .send({ firstName: "Aline", lastName: "Haddad" });
  return cookie;
}

async function makeArtifacts(cookie: string) {
  const cv = (
    await http().post("/api/v1/cvs").set("Cookie", cookie).send({
      title: "CV Germany",
      templateKey: "classic",
      language: "en",
    })
  ).body.cv;
  const letter = (
    await http().post("/api/v1/cover-letters").set("Cookie", cookie).send({
      title: "Anschreiben",
      layoutTemplate: "classic",
      convention: "DE",
      language: "de",
    })
  ).body;

  const intent = await http()
    .post("/api/v1/documents/upload-intent")
    .set("Cookie", cookie)
    .send({ fileName: "certificate.pdf", category: "CERTIFICATE" });
  await fetch(intent.body.uploadUrl, {
    method: "PUT",
    body: new Uint8Array(PDF_BYTES),
  });
  const document = (
    await http()
      .post(`/api/v1/documents/${intent.body.documentId}/complete`)
      .set("Cookie", cookie)
  ).body;

  return { cv, letter, document };
}

async function makeApplication(cookie: string) {
  return (
    await http().post("/api/v1/applications").set("Cookie", cookie).send({
      title: "Bewerbung Beispiel GmbH",
      type: "JOB",
      recipientName: "Beispiel GmbH",
      jobDescription: "Junior developer, Berlin. Contact: hr@beispiel.example",
    })
  ).body;
}

describe("applications composer (§7.10)", () => {
  it("create, compose a package of CV/letter/document/section, read back ordered", async () => {
    const cookie = await makeUser();
    const { cv, letter, document } = await makeArtifacts(cookie);
    const application = await makeApplication(cookie);
    expect(application.status).toBe("DRAFT");

    const put = await http()
      .put(`/api/v1/applications/${application.id}/items`)
      .set("Cookie", cookie)
      .send({
        items: [
          { itemType: "CV", itemId: cv.id, order: 0 },
          { itemType: "COVER_LETTER", itemId: letter.id, order: 1 },
          { itemType: "DOCUMENT", itemId: document.id, order: 2 },
          { itemType: "SECTION", itemId: "languages", order: 3 },
        ],
      });
    expect(put.status).toBe(200);
    expect(put.body).toHaveLength(4);

    const got = await http()
      .get(`/api/v1/applications/${application.id}`)
      .set("Cookie", cookie);
    expect(got.body.items.map((i: { itemType: string }) => i.itemType)).toEqual([
      "CV",
      "COVER_LETTER",
      "DOCUMENT",
      "SECTION",
    ]);
    const patched = await http()
      .patch(`/api/v1/applications/${application.id}`)
      .set("Cookie", cookie)
      .send({ status: "SENT" });
    expect(patched.body.status).toBe("SENT");
  });

  it("refuses foreign, unclean or unimplemented items", async () => {
    const cookieA = await makeUser("usera@example.com");
    const cookieB = await makeUser("userb@example.com");
    const { cv } = await makeArtifacts(cookieA);
    const application = await makeApplication(cookieB);

    // Foreign CV → not found.
    expect(
      (
        await http()
          .put(`/api/v1/applications/${application.id}/items`)
          .set("Cookie", cookieB)
          .send({ items: [{ itemType: "CV", itemId: cv.id, order: 0 }] })
      ).status,
    ).toBe(404);

    // Unclean document (upload never completed) → not found.
    const intent = await http()
      .post("/api/v1/documents/upload-intent")
      .set("Cookie", cookieB)
      .send({ fileName: "pending.pdf", category: "OTHER" });
    expect(
      (
        await http()
          .put(`/api/v1/applications/${application.id}/items`)
          .set("Cookie", cookieB)
          .send({
            items: [
              { itemType: "DOCUMENT", itemId: intent.body.documentId, order: 0 },
            ],
          })
      ).status,
    ).toBe(404);

    // Unknown section key → 400.
    const badSection = await http()
      .put(`/api/v1/applications/${application.id}/items`)
      .set("Cookie", cookieB)
      .send({ items: [{ itemType: "SECTION", itemId: "salary", order: 0 }] });
    expect(badSection.status).toBe(400);
    expect(badSection.body.code).toBe("UNKNOWN_SECTION");

    // References ship in their own milestone — honest refusal, no dead refs.
    const notImplemented = await http()
      .put(`/api/v1/applications/${application.id}/items`)
      .set("Cookie", cookieB)
      .send({
        items: [
          {
            itemType: "REFERENCE",
            itemId: "0198aaaa-0000-7000-8000-000000000000",
            order: 0,
          },
        ],
      });
    expect(notImplemented.status).toBe(400);
    expect(notImplemented.body.code).toBe("ITEM_TYPE_NOT_IMPLEMENTED");
  });

  it("P4: deleting an application hard-nulls the job description", async () => {
    const cookie = await makeUser();
    const application = await makeApplication(cookie);
    expect(
      (
        await prisma.application.findUniqueOrThrow({
          where: { id: application.id },
        })
      ).jobDescription,
    ).toContain("hr@beispiel.example");

    await http()
      .delete(`/api/v1/applications/${application.id}`)
      .set("Cookie", cookie);

    const row = await prisma.application.findUniqueOrThrow({
      where: { id: application.id },
    });
    expect(row.deletedAt).not.toBeNull();
    expect(row.jobDescription).toBeNull();
    const list = await http().get("/api/v1/applications").set("Cookie", cookie);
    expect(list.body).toHaveLength(0);
  });

  it("cross-tenant access is not-found; auth required", async () => {
    const cookieA = await makeUser("usera@example.com");
    const cookieB = await makeUser("userb@example.com");
    const application = await makeApplication(cookieA);
    expect(
      (
        await http()
          .get(`/api/v1/applications/${application.id}`)
          .set("Cookie", cookieB)
      ).status,
    ).toBe(404);
    expect((await http().get("/api/v1/applications")).status).toBe(401);
  });
});
