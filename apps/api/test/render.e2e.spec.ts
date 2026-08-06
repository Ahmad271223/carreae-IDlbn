import type { INestApplication } from "@nestjs/common";
import { PDFParse } from "pdf-parse";
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

async function makeUser(email: string, name: [string, string]) {
  await http().post("/api/v1/auth/register").send({ email, password: PASSWORD });
  const res = await http()
    .post("/api/v1/auth/login")
    .send({ email, password: PASSWORD });
  const cookie = sessionCookie(res.headers);
  await http()
    .patch("/api/v1/profile")
    .set("Cookie", cookie)
    .send({ firstName: name[0], lastName: name[1], city: "Beirut", countryCode: "LB" });
  return cookie;
}

async function pollJob(cookie: string, jobId: string): Promise<Record<string, unknown>> {
  for (let i = 0; i < 60; i++) {
    const res = await http().get(`/api/v1/render-jobs/${jobId}`).set("Cookie", cookie);
    if (res.body.status === "SUCCEEDED" || res.body.status === "FAILED") {
      return res.body;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("render job did not finish in time");
}

async function extractPdf(
  buffer: Buffer,
): Promise<{ text: string; pageCount: number }> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return { text: result.text, pageCount: result.pages.length };
  } finally {
    await parser.destroy();
  }
}

async function fetchPdf(cookie: string, documentId: string): Promise<Buffer> {
  const download = await http()
    .get(`/api/v1/documents/${documentId}/download`)
    .set("Cookie", cookie);
  expect(download.status).toBe(200);
  const res = await fetch(download.body.url);
  expect(res.status).toBe(200);
  return Buffer.from(await res.arrayBuffer());
}

async function setupCv(cookie: string): Promise<string> {
  const experience = (
    await http().post("/api/v1/experiences").set("Cookie", cookie).send({
      companyName: "ACME Lebanon (fictional)",
      position: "Junior Developer",
      employmentType: "FULL_TIME",
      startDate: "2024-02-01",
    })
  ).body;
  const cv = (
    await http().post("/api/v1/cvs").set("Cookie", cookie).send({
      title: "Germany Application",
      templateKey: "classic",
      language: "en",
      targetCountryCode: "DE",
    })
  ).body.cv;
  await http()
    .put(`/api/v1/cvs/${cv.id}/items`)
    .set("Cookie", cookie)
    .send({
      items: [
        { sourceType: "EXPERIENCE", sourceId: experience.id, order: 0, visible: true },
      ],
    });
  return cv.id;
}

describe("PDF render pipeline (§25/§26)", () => {
  it("CV render: queue → worker → wallet document with a real text layer", async () => {
    const cookie = await makeUser("aline@example.com", ["Aline", "Haddad"]);
    const cvId = await setupCv(cookie);

    const enqueue = await http()
      .post(`/api/v1/cvs/${cvId}/render`)
      .set("Cookie", cookie);
    expect(enqueue.status).toBe(202);

    const job = await pollJob(cookie, enqueue.body.jobId);
    expect(job.status).toBe("SUCCEEDED");

    const document = await prisma.document.findUniqueOrThrow({
      where: { id: job.documentId as string },
    });
    expect(document.category).toBe("CV");
    expect(document.origin).toBe("PLATFORM_GENERATED");
    expect(document.mimeType).toBe("application/pdf");

    const pdf = await fetchPdf(cookie, document.id);
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    // §25: searchable text layer, not an image dump.
    const { text } = await extractPdf(pdf);
    expect(text).toContain("Aline Haddad");
    expect(text).toContain("Junior Developer");
    expect(text).toContain("ACME Lebanon");

    const version = await prisma.documentVersion.findFirstOrThrow({
      where: { sourceType: "CV", sourceId: cvId },
    });
    expect(version.documentId).toBe(document.id);
    expect(version.templateKey).toBe("classic");
  });

  it("re-render creates version 2 linked to version 1; both stay downloadable (§26)", async () => {
    const cookie = await makeUser("aline@example.com", ["Aline", "Haddad"]);
    const cvId = await setupCv(cookie);

    const first = await pollJob(
      cookie,
      (await http().post(`/api/v1/cvs/${cvId}/render`).set("Cookie", cookie)).body.jobId,
    );
    const second = await pollJob(
      cookie,
      (await http().post(`/api/v1/cvs/${cvId}/render`).set("Cookie", cookie)).body.jobId,
    );

    const v2 = await prisma.document.findUniqueOrThrow({
      where: { id: second.documentId as string },
    });
    expect(v2.versionNumber).toBe(2);
    expect(v2.versionOfId).toBe(first.documentId);
    expect(
      await prisma.documentVersion.count({
        where: { sourceType: "CV", sourceId: cvId },
      }),
    ).toBe(2);
    await fetchPdf(cookie, first.documentId as string);
    await fetchPdf(cookie, second.documentId as string);
  });

  it("arabic CV renders RTL through the same pipeline", async () => {
    const cookie = await makeUser("karim@example.com", ["كريم", "حداد"]);
    const cv = (
      await http().post("/api/v1/cvs").set("Cookie", cookie).send({
        title: "طلب توظيف",
        templateKey: "arabic-native",
        language: "ar",
      })
    ).body.cv;
    await http()
      .put(`/api/v1/cvs/${cv.id}/items`)
      .set("Cookie", cookie)
      .send({
        items: [
          {
            sourceType: "CUSTOM",
            displayOverride: { title: "متطوع في مكتبة بيروت" },
            order: 0,
            visible: true,
          },
        ],
      });
    const job = await pollJob(
      cookie,
      (await http().post(`/api/v1/cvs/${cv.id}/render`).set("Cookie", cookie)).body.jobId,
    );
    expect(job.status).toBe("SUCCEEDED");
    const pdf = await fetchPdf(cookie, job.documentId as string);
    expect(pdf.length).toBeGreaterThan(2000);
    expect((await extractPdf(pdf)).pageCount).toBe(1);
  });

  it("cover letter render carries the convention (DE) into the PDF text", async () => {
    const cookie = await makeUser("aline@example.com", ["Aline", "Haddad"]);
    const letter = (
      await http().post("/api/v1/cover-letters").set("Cookie", cookie).send({
        title: "Anschreiben Beispiel GmbH",
        layoutTemplate: "classic",
        convention: "DE",
        language: "de",
      })
    ).body;
    const byType = Object.fromEntries(
      letter.blocks.map((b: { type: string; id: string }) => [b.type, b.id]),
    );
    await http()
      .put(`/api/v1/cover-letters/${letter.id}/blocks`)
      .set("Cookie", cookie)
      .send({
        blocks: [
          { id: byType.RECIPIENT, type: "RECIPIENT", order: 0, content: "Beispiel GmbH\nBerlin" },
          { id: byType.SUBJECT, type: "SUBJECT", order: 1, content: "Bewerbung als Junior Developer" },
          { id: byType.SALUTATION, type: "SALUTATION", order: 2, content: "Sehr geehrte Damen und Herren," },
          { id: byType.BODY, type: "BODY", order: 3, content: "hiermit bewerbe ich mich." },
          { id: byType.CLOSING, type: "CLOSING", order: 4, content: "Mit freundlichen Grüßen" },
          { id: byType.SIGNATURE, type: "SIGNATURE", order: 5, content: "Aline Haddad" },
        ],
      });

    const job = await pollJob(
      cookie,
      (
        await http()
          .post(`/api/v1/cover-letters/${letter.id}/render`)
          .set("Cookie", cookie)
      ).body.jobId,
    );
    expect(job.status).toBe("SUCCEEDED");
    const { text } = await extractPdf(await fetchPdf(cookie, job.documentId as string));
    expect(text).toContain("Bewerbung als Junior Developer");
    expect(text).toContain("Mit freundlichen Grüßen");
    const document = await prisma.document.findUniqueOrThrow({
      where: { id: job.documentId as string },
    });
    expect(document.category).toBe("COVER_LETTER");
  });

  it("authorization: foreign CVs cannot be rendered, foreign jobs are invisible", async () => {
    const cookieA = await makeUser("usera@example.com", ["A", "A"]);
    const cookieB = await makeUser("userb@example.com", ["B", "B"]);
    const cvId = await setupCv(cookieA);

    expect(
      (await http().post(`/api/v1/cvs/${cvId}/render`).set("Cookie", cookieB)).status,
    ).toBe(404);

    const job = (await http().post(`/api/v1/cvs/${cvId}/render`).set("Cookie", cookieA))
      .body;
    expect(
      (await http().get(`/api/v1/render-jobs/${job.jobId}`).set("Cookie", cookieB))
        .status,
    ).toBe(404);
    await pollJob(cookieA, job.jobId); // drain so the worker finishes cleanly
  });
});
