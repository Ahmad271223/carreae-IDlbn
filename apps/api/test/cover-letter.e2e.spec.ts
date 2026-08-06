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

async function makeUser(email: string) {
  await http().post("/api/v1/auth/register").send({ email, password: PASSWORD });
  const res = await http()
    .post("/api/v1/auth/login")
    .send({ email, password: PASSWORD });
  return sessionCookie(res.headers);
}

async function makeLetter(cookie: string) {
  return (
    await http().post("/api/v1/cover-letters").set("Cookie", cookie).send({
      title: "Application Germany",
      layoutTemplate: "classic",
      convention: "DE",
      language: "de",
    })
  ).body;
}

describe("cover letters (§23–§24, §28)", () => {
  it("create builds the §24 block skeleton; convention/layout validated", async () => {
    const cookie = await makeUser("aline@example.com");
    const letter = await makeLetter(cookie);
    expect(letter.blocks.map((b: { type: string }) => b.type)).toEqual([
      "RECIPIENT",
      "SUBJECT",
      "SALUTATION",
      "OPENING",
      "BODY",
      "CLOSING",
      "SIGNATURE",
    ]);
    expect(letter.blocks.every((b: { origin: string }) => b.origin === "USER")).toBe(true);

    const badLayout = await http()
      .post("/api/v1/cover-letters")
      .set("Cookie", cookie)
      .send({ title: "X", layoutTemplate: "creative", convention: "DE", language: "de" });
    expect(badLayout.status).toBe(400); // creative is a CV template, not a letter layout

    const badConvention = await http()
      .post("/api/v1/cover-letters")
      .set("Cookie", cookie)
      .send({ title: "X", layoutTemplate: "classic", convention: "IT", language: "it" });
    expect(badConvention.status).toBe(400);
  });

  it("blocks can be written, reordered and extended (second BODY paragraph)", async () => {
    const cookie = await makeUser("aline@example.com");
    const letter = await makeLetter(cookie);
    const byType = Object.fromEntries(
      letter.blocks.map((b: { type: string; id: string }) => [b.type, b.id]),
    );

    const put = await http()
      .put(`/api/v1/cover-letters/${letter.id}/blocks`)
      .set("Cookie", cookie)
      .send({
        blocks: [
          { id: byType.RECIPIENT, type: "RECIPIENT", order: 0, content: "Beispiel GmbH\nBerlin" },
          { id: byType.SUBJECT, type: "SUBJECT", order: 1, content: "Bewerbung als Junior Developer" },
          { id: byType.SALUTATION, type: "SALUTATION", order: 2, content: "Sehr geehrte Damen und Herren," },
          { id: byType.OPENING, type: "OPENING", order: 3, content: "mit großem Interesse…" },
          { id: byType.BODY, type: "BODY", order: 4, content: "Absatz eins." },
          { type: "BODY", order: 5, content: "Absatz zwei." },
          { id: byType.CLOSING, type: "CLOSING", order: 6, content: "Mit freundlichen Grüßen" },
          { id: byType.SIGNATURE, type: "SIGNATURE", order: 7, content: "Aline Haddad" },
        ],
      });
    expect(put.status).toBe(200);
    expect(put.body).toHaveLength(8);
    expect(put.body.filter((b: { type: string }) => b.type === "BODY")).toHaveLength(2);
  });

  it("origin tracking (§28): AI_GENERATED → AI_EDITED on user edit, stable otherwise", async () => {
    const cookie = await makeUser("aline@example.com");
    const letter = await makeLetter(cookie);
    const body = letter.blocks.find((b: { type: string }) => b.type === "BODY");

    // Simulate a 3.5-adopted AI block directly in the DB.
    await prisma.coverLetterBlock.update({
      where: { id: body.id },
      data: { content: "KI-generierter Absatz.", origin: "AI_GENERATED" },
    });

    // Untouched content keeps AI_GENERATED.
    const keep = await http()
      .put(`/api/v1/cover-letters/${letter.id}/blocks`)
      .set("Cookie", cookie)
      .send({
        blocks: [
          { id: body.id, type: "BODY", order: 0, content: "KI-generierter Absatz." },
        ],
      });
    expect(keep.body[0].origin).toBe("AI_GENERATED");

    // User edit demotes to AI_EDITED — and stays there on further edits.
    const edited = await http()
      .put(`/api/v1/cover-letters/${letter.id}/blocks`)
      .set("Cookie", cookie)
      .send({
        blocks: [
          {
            id: keep.body[0].id,
            type: "BODY",
            order: 0,
            content: "KI-generierter Absatz, von mir angepasst.",
          },
        ],
      });
    expect(edited.body[0].origin).toBe("AI_EDITED");

    // A brand-new block is USER.
    const fresh = await http()
      .put(`/api/v1/cover-letters/${letter.id}/blocks`)
      .set("Cookie", cookie)
      .send({
        blocks: [
          { id: edited.body[0].id, type: "BODY", order: 0, content: "KI-generierter Absatz, von mir angepasst." },
          { type: "BODY", order: 1, content: "Selbst geschrieben." },
        ],
      });
    expect(fresh.body[1].origin).toBe("USER");
  });

  it("cross-tenant: foreign letters are not found; auth required", async () => {
    const cookieA = await makeUser("usera@example.com");
    const cookieB = await makeUser("userb@example.com");
    const letter = await makeLetter(cookieA);

    expect(
      (
        await http()
          .get(`/api/v1/cover-letters/${letter.id}`)
          .set("Cookie", cookieB)
      ).status,
    ).toBe(404);
    expect(
      (
        await http()
          .put(`/api/v1/cover-letters/${letter.id}/blocks`)
          .set("Cookie", cookieB)
          .send({ blocks: [{ type: "BODY", order: 0, content: "hijack" }] })
      ).status,
    ).toBe(404);
    expect((await http().get("/api/v1/cover-letters")).status).toBe(401);
  });

  it("soft delete hides the letter; convention can be switched later (§23)", async () => {
    const cookie = await makeUser("aline@example.com");
    const letter = await makeLetter(cookie);

    const switched = await http()
      .patch(`/api/v1/cover-letters/${letter.id}`)
      .set("Cookie", cookie)
      .send({ convention: "FR", language: "fr" });
    expect(switched.body.convention).toBe("FR");

    await http()
      .delete(`/api/v1/cover-letters/${letter.id}`)
      .set("Cookie", cookie);
    const list = await http().get("/api/v1/cover-letters").set("Cookie", cookie);
    expect(list.body).toHaveLength(0);
  });
});
