import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaService } from "../src/prisma/prisma.service";
import {
  FakeAIProvider,
  FakeMailer,
  createTestApp,
  resetDatabase,
  sessionCookie,
} from "./helpers";

const PASSWORD = "correct horse battery";

let app: INestApplication;
let mailer: FakeMailer;
let prisma: PrismaService;
let ai: FakeAIProvider;

beforeAll(async () => {
  ({ app, mailer, prisma, aiProvider: ai } = await createTestApp());
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetDatabase(prisma);
  mailer.sent.length = 0;
  ai.calls.length = 0;
  ai.responses.length = 0;
});

function http() {
  return request(app.getHttpServer());
}

/** User with profile, sensitive data, one experience, arabic native + German B1. */
async function makeUser(email = "aline@example.com") {
  await http().post("/api/v1/auth/register").send({ email, password: PASSWORD });
  const login = await http()
    .post("/api/v1/auth/login")
    .send({ email, password: PASSWORD });
  const cookie = sessionCookie(login.headers);
  await http().patch("/api/v1/profile").set("Cookie", cookie).send({
    firstName: "Aline",
    lastName: "Haddad",
    headline: "Junior Developer",
    city: "Beirut",
    countryCode: "LB",
  });
  await http().put("/api/v1/profile/sensitive").set("Cookie", cookie).send({
    dateOfBirth: "2007-03-14",
    nationality: "Lebanese",
    contactPhone: "+961 3 123456",
    contactAddress: "Hamra Street 12, Beirut",
  });
  await http().post("/api/v1/experiences").set("Cookie", cookie).send({
    companyName: "ACME Lebanon (fictional)",
    position: "Junior Developer",
    employmentType: "FULL_TIME",
    startDate: "2024-02-01",
  });
  await http()
    .post("/api/v1/languages")
    .set("Cookie", cookie)
    .send({ language: "ar", level: "NATIVE" });
  await http()
    .post("/api/v1/languages")
    .set("Cookie", cookie)
    .send({ language: "de", level: "B1" });
  return cookie;
}

async function makeLetter(cookie: string, language = "de") {
  const letter = (
    await http().post("/api/v1/cover-letters").set("Cookie", cookie).send({
      title: "Bewerbung",
      layoutTemplate: "classic",
      convention: "DE",
      language,
    })
  ).body;
  const body = letter.blocks.find((b: { type: string }) => b.type === "BODY");
  return { letter, bodyBlock: body };
}

describe("AI draft flow (§28)", () => {
  it("draft lands in draft_content only; adopt promotes it with origin AI_GENERATED", async () => {
    const cookie = await makeUser();
    const { letter, bodyBlock } = await makeLetter(cookie);
    ai.responses.push("Ich habe 2024 bei ACME Lebanon gearbeitet.");
    ai.responses.push("ترجمة الجملة الأولى.");

    const draft = await http()
      .post(`/api/v1/cover-letters/${letter.id}/blocks/${bodyBlock.id}/draft`)
      .set("Cookie", cookie)
      .send({ jobDescription: "Junior developer position in Berlin." });
    expect(draft.status).toBe(200);
    expect(draft.body.draft).toContain("ACME Lebanon");

    // content untouched, draft staged (§28).
    const stored = await prisma.coverLetterBlock.findUniqueOrThrow({
      where: { id: bodyBlock.id },
    });
    expect(stored.content).toBe("");
    expect(stored.draftContent).toContain("ACME Lebanon");
    expect(stored.origin).toBe("USER");

    const adopt = await http()
      .post(`/api/v1/cover-letters/${letter.id}/blocks/${bodyBlock.id}/adopt`)
      .set("Cookie", cookie);
    expect(adopt.status).toBe(200);
    expect(adopt.body.content).toContain("ACME Lebanon");
    expect(adopt.body.origin).toBe("AI_GENERATED");
    expect(adopt.body.draftContent).toBeNull();

    // Adopting twice fails — no dangling draft.
    expect(
      (
        await http()
          .post(`/api/v1/cover-letters/${letter.id}/blocks/${bodyBlock.id}/adopt`)
          .set("Cookie", cookie)
      ).status,
    ).toBe(409);
  });

  it("discard clears the draft without touching content", async () => {
    const cookie = await makeUser();
    const { letter, bodyBlock } = await makeLetter(cookie, "en");
    await http()
      .post(`/api/v1/cover-letters/${letter.id}/blocks/${bodyBlock.id}/draft`)
      .set("Cookie", cookie)
      .send({});
    const discard = await http()
      .post(`/api/v1/cover-letters/${letter.id}/blocks/${bodyBlock.id}/draft/discard`)
      .set("Cookie", cookie);
    expect(discard.body.draftContent).toBeNull();
    expect(discard.body.content).toBe("");
  });

  it("cross-tenant: foreign letters/blocks are not found", async () => {
    const cookieA = await makeUser("usera@example.com");
    const { letter, bodyBlock } = await makeLetter(cookieA);
    await http().post("/api/v1/auth/register").send({
      email: "userb@example.com",
      password: PASSWORD,
    });
    const cookieB = sessionCookie(
      (
        await http()
          .post("/api/v1/auth/login")
          .send({ email: "userb@example.com", password: PASSWORD })
      ).headers,
    );
    expect(
      (
        await http()
          .post(`/api/v1/cover-letters/${letter.id}/blocks/${bodyBlock.id}/draft`)
          .set("Cookie", cookieB)
          .send({})
      ).status,
    ).toBe(404);
  });
});

describe("LLM context boundary (§31)", () => {
  it("prompt contains career facts but never sensitive data, email or address", async () => {
    const cookie = await makeUser();
    const { letter, bodyBlock } = await makeLetter(cookie);
    await http()
      .post(`/api/v1/cover-letters/${letter.id}/blocks/${bodyBlock.id}/draft`)
      .set("Cookie", cookie)
      .send({ jobDescription: "Developer role." });

    expect(ai.calls.length).toBeGreaterThan(0);
    const sent = ai.calls.map((c) => `${c.system}\n${c.prompt}`).join("\n");
    // In: structured career data.
    expect(sent).toContain("ACME Lebanon (fictional)");
    expect(sent).toContain("Junior Developer");
    expect(sent).toContain("Developer role.");
    // Out by construction: §31 exclusions.
    expect(sent).not.toContain("2007-03-14");
    expect(sent).not.toContain("Lebanese");
    expect(sent).not.toContain("123456");
    expect(sent).not.toContain("Hamra");
    expect(sent).not.toContain("aline@example.com");
    expect(sent).not.toContain("Beirut");
  });
});

describe("entity validator (§29)", () => {
  it("flags years, levels and org names that are not in the profile — and only those", async () => {
    const cookie = await makeUser();
    const { letter, bodyBlock } = await makeLetter(cookie);
    ai.responses.push(
      "Seit 2024 arbeite ich bei ACME Lebanon. Zuvor war ich 2019 bei der Globex GmbH " +
        "und erreichte C2 in Deutsch sowie B1 in kurzer Zeit.",
    );
    ai.responses.push("ترجمة.");

    const draft = await http()
      .post(`/api/v1/cover-letters/${letter.id}/blocks/${bodyBlock.id}/draft`)
      .set("Cookie", cookie)
      .send({});
    const warnings = draft.body.warnings as Array<{
      type: string;
      value: string;
      labelKey: string;
    }>;
    const byType = (type: string) =>
      warnings.filter((w) => w.type === type).map((w) => w.value);

    expect(byType("YEAR")).toEqual(["2019"]); // 2024 is documented
    expect(byType("LANGUAGE_LEVEL")).toEqual(["C2"]); // B1 is documented
    expect(byType("ORGANIZATION").join(" ")).toContain("Globex GmbH");
    expect(warnings.every((w) => w.labelKey === "ai.notInProfile")).toBe(true);
    // ACME never appears in any warning.
    expect(JSON.stringify(warnings)).not.toContain("ACME");
  });
});

describe("back-translation (§30)", () => {
  it("letter above the documented level gets a sentence-wise back-translation into the main language", async () => {
    const cookie = await makeUser();
    const { letter, bodyBlock } = await makeLetter(cookie, "de"); // German B1 < C1
    ai.responses.push("Sehr komplexer deutscher Satz.");
    ai.responses.push("جملة ألمانية معقدة جدا.");

    const draft = await http()
      .post(`/api/v1/cover-letters/${letter.id}/blocks/${bodyBlock.id}/draft`)
      .set("Cookie", cookie)
      .send({});
    expect(draft.body.backTranslation).toBeDefined();
    expect(draft.body.backTranslation.language).toBe("ar");
    expect(draft.body.backTranslation.text).toContain("جملة");
    expect(draft.body.backTranslation.hintKey).toBe("ai.backTranslation.hint");
    expect(ai.calls).toHaveLength(2); // draft + translation
  });

  it("letter in the user's native language triggers no back-translation", async () => {
    const cookie = await makeUser();
    const { letter, bodyBlock } = await makeLetter(cookie, "ar");
    const draft = await http()
      .post(`/api/v1/cover-letters/${letter.id}/blocks/${bodyBlock.id}/draft`)
      .set("Cookie", cookie)
      .send({});
    expect(draft.body.backTranslation).toBeUndefined();
    expect(ai.calls).toHaveLength(1);
  });
});

describe("one-shot letter from a posting (§24/§27)", () => {
  const POSTING = [
    "Werkstudent Softwareentwicklung (m/w/d) bei Beispiel GmbH in Berlin.",
    "Wir suchen Unterstützung im Frontend-Team. Kenntnisse in TypeScript",
    "und React sind von Vorteil. Bewerbungen an Frau Meier.",
  ].join(" ");

  function queueGeneration(blocks: Record<string, string>) {
    ai.responses.push(
      JSON.stringify({
        position: "Werkstudent Softwareentwicklung",
        company: "Beispiel GmbH",
        recipient: "Frau Meier",
        language: "de",
      }),
    );
    ai.responses.push(JSON.stringify(blocks));
  }

  const FULL_BLOCKS = {
    RECIPIENT: "Beispiel GmbH\nFrau Meier\nBerlin",
    SUBJECT: "Bewerbung als Werkstudent Softwareentwicklung",
    SALUTATION: "Sehr geehrte Frau Meier,",
    OPENING: "mit großem Interesse habe ich Ihre Ausschreibung gelesen.",
    BODY: "Bei ACME Lebanon arbeite ich als Junior Developer.",
    CLOSING: "Über eine Einladung freue ich mich sehr.",
    SIGNATURE: "Aline Haddad",
  };

  it("turns a pasted posting into a complete AI_GENERATED letter", async () => {
    const cookie = await makeUser();
    queueGeneration(FULL_BLOCKS);
    ai.responses.push("الترجمة العكسية للنص.");

    const response = await http()
      .post("/api/v1/cover-letters/from-posting")
      .set("Cookie", cookie)
      .send({ posting: POSTING, positionType: "INTERNSHIP" });

    expect(response.status).toBe(201);
    // Language + convention are read out of the posting, not asked for.
    expect(response.body.analysis.language).toBe("de");
    expect(response.body.analysis.convention).toBe("DE");
    expect(response.body.letter.language).toBe("de");
    expect(response.body.letter.title).toContain("Beispiel GmbH");

    const blocks = response.body.letter.blocks as Array<{
      type: string;
      content: string;
      origin: string;
    }>;
    expect(blocks).toHaveLength(7);
    expect(blocks.every((b) => b.content.trim() !== "")).toBe(true);
    // §28: machine-written content stays labelled.
    expect(blocks.every((b) => b.origin === "AI_GENERATED")).toBe(true);
    expect(blocks.find((b) => b.type === "SUBJECT")?.content).toContain(
      "Werkstudent",
    );

    // §30: letter language above the documented level triggers the hint.
    expect(response.body.backTranslation.hintKey).toBe("ai.backTranslation.hint");
  });

  it("keeps sensitive data out of every prompt and flags unsupported claims", async () => {
    const cookie = await makeUser();
    queueGeneration({
      ...FULL_BLOCKS,
      BODY: "Ich habe 2011 an der Cedar University studiert und spreche C2.",
    });
    ai.responses.push("الترجمة العكسية.");

    const response = await http()
      .post("/api/v1/cover-letters/from-posting")
      .set("Cookie", cookie)
      .send({ posting: POSTING, positionType: "JOB" });
    expect(response.status).toBe(201);

    // §31: the AI boundary holds for the new flow too.
    const everythingSent = ai.calls
      .map((c) => `${c.system}\n${c.prompt}`)
      .join("\n");
    expect(everythingSent).not.toContain("2007-03-14");
    expect(everythingSent).not.toContain("Lebanese");
    expect(everythingSent).not.toContain("+961 3 123456");
    expect(everythingSent).not.toContain("Hamra Street");
    // The posting must be framed as data, never as instructions.
    expect(everythingSent).toContain("untrusted DATA");
    // A JOB posting is prompted differently from an internship.
    expect(everythingSent).toContain("JOB application");

    // §29: claims with no profile backing surface as warnings.
    const warnings = response.body.warnings as Array<{
      type: string;
      value: string;
    }>;
    expect(warnings.some((w) => w.type === "YEAR" && w.value === "2011")).toBe(true);
    expect(warnings.some((w) => w.type === "LANGUAGE_LEVEL")).toBe(true);
  });

  it("stores the posting on a linked application and survives chatty JSON", async () => {
    const cookie = await makeUser();
    const application = (
      await http()
        .post("/api/v1/applications")
        .set("Cookie", cookie)
        .send({ title: "Werkstudent", type: "JOB" })
    ).body;

    // Providers like to wrap JSON in fences and prose — that must not break us.
    ai.responses.push(
      'Sure! Here you go:\n```json\n{"position":"Werkstudent","company":null,"recipient":null,"language":"en"}\n```',
    );
    ai.responses.push("```json\n" + JSON.stringify(FULL_BLOCKS) + "\n```");

    const response = await http()
      .post("/api/v1/cover-letters/from-posting")
      .set("Cookie", cookie)
      .send({
        posting: POSTING,
        positionType: "JOB",
        applicationId: application.id,
      });
    expect(response.status).toBe(201);
    expect(response.body.analysis.convention).toBe("EN");

    const stored = await prisma.application.findUniqueOrThrow({
      where: { id: application.id },
    });
    expect(stored.jobDescription).toContain("Werkstudent");
  });

  it("fails honestly when the provider returns nothing usable", async () => {
    const cookie = await makeUser();
    ai.responses.push('{"position":"Dev","company":null,"recipient":null,"language":"en"}');
    ai.responses.push("I cannot help with that.");

    const response = await http()
      .post("/api/v1/cover-letters/from-posting")
      .set("Cookie", cookie)
      .send({ posting: POSTING, positionType: "JOB" });
    expect(response.status).toBe(503);
    expect(response.body.code).toBe("AI_UNUSABLE_RESPONSE");
    // No half-written letter is left behind.
    expect(await prisma.coverLetter.count()).toBe(0);
  });
});
