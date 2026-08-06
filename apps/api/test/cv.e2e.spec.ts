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

async function makeUser(email: string, name?: [string, string]) {
  await http().post("/api/v1/auth/register").send({ email, password: PASSWORD });
  const res = await http()
    .post("/api/v1/auth/login")
    .send({ email, password: PASSWORD });
  const cookie = sessionCookie(res.headers);
  if (name) {
    await http()
      .patch("/api/v1/profile")
      .set("Cookie", cookie)
      .send({ firstName: name[0], lastName: name[1] });
  }
  return cookie;
}

async function makeExperience(cookie: string) {
  return (
    await http().post("/api/v1/experiences").set("Cookie", cookie).send({
      companyName: "ACME Lebanon (fictional)",
      position: "Junior Developer",
      employmentType: "FULL_TIME",
      startDate: "2024-02-01",
    })
  ).body;
}

async function makeCv(cookie: string, overrides: Record<string, unknown> = {}) {
  return (
    await http().post("/api/v1/cvs").set("Cookie", cookie).send({
      title: "Application Germany",
      templateKey: "classic-photo",
      language: "en",
      targetCountryCode: "DE",
      ...overrides,
    })
  ).body;
}

/** Seeds a VERIFIED org + issuer and confirms a verification on the subject. */
async function verifyExperience(subjectCookie: string, experienceId: string) {
  const memberCookie = await makeUser("issuer@school.example.com");
  const member = await prisma.user.findUniqueOrThrow({
    where: { email: "issuer@school.example.com" },
  });
  const org = await prisma.organization.create({
    data: {
      type: "EMPLOYER",
      name: "ACME Lebanon (fictional)",
      countryCode: "LB",
      verificationStatus: "VERIFIED",
      members: { create: { userId: member.id, role: "ISSUER" } },
    },
  });
  const req = (
    await http().post("/api/v1/verifications").set("Cookie", subjectCookie).send({
      subjectType: "EXPERIENCE",
      subjectId: experienceId,
      organizationId: org.id,
    })
  ).body;
  await http()
    .post(`/api/v1/org/${org.id}/verifications/${req.id}/confirm`)
    .set("Cookie", memberCookie);
  return req.id as string;
}

describe("CV management (§18–§21)", () => {
  it("create applies photo recommendation: DE preselects, US warns and disables", async () => {
    const cookie = await makeUser("aline@example.com", ["Aline", "Haddad"]);
    const de = await makeCv(cookie);
    expect(de.cv.photoEnabled).toBe(true);
    expect(de.photoRecommendation.warningKey).toBeUndefined();
    expect(de.cv.sectionOrder[0]).toBe("profile");

    const us = await makeCv(cookie, { targetCountryCode: "US", title: "US CV" });
    expect(us.cv.photoEnabled).toBe(false);
    expect(us.photoRecommendation.warningKey).toBe("cv.photo.discouragedWarning");

    // Template without a photo slot never enables the photo.
    const compact = await makeCv(cookie, { templateKey: "compact", title: "C" });
    expect(compact.cv.photoEnabled).toBe(false);
  });

  it("rejects unknown templates; catalog endpoint exposes honest ATS flags", async () => {
    const cookie = await makeUser("aline@example.com");
    const bad = await http().post("/api/v1/cvs").set("Cookie", cookie).send({
      title: "X",
      templateKey: "not-a-template",
      language: "en",
    });
    expect(bad.status).toBe(400);

    const catalog = await http().get("/api/v1/cvs/templates").set("Cookie", cookie);
    expect(catalog.body).toHaveLength(10);
    const sidebar = catalog.body.find((t: { key: string }) => t.key === "sidebar");
    expect(sidebar.atsSafe).toBe(false);
  });

  it("items: section order stays, overrides for presentation are accepted", async () => {
    const cookie = await makeUser("aline@example.com", ["Aline", "Haddad"]);
    const experience = await makeExperience(cookie);
    const cv = (await makeCv(cookie)).cv;

    const put = await http()
      .put(`/api/v1/cvs/${cv.id}/items`)
      .set("Cookie", cookie)
      .send({
        items: [
          {
            sourceType: "EXPERIENCE",
            sourceId: experience.id,
            displayOverride: {
              description: "Built internal tooling for logistics.",
              bullets: ["Shipped X", "Automated Y"],
            },
            order: 0,
            visible: true,
          },
          {
            sourceType: "CUSTOM",
            displayOverride: { title: "Volunteering — Beirut Marathon" },
            order: 1,
            visible: true,
          },
        ],
      });
    expect(put.status).toBe(200);
    expect(put.body).toHaveLength(2);

    // Source record untouched — overrides are presentation-only (§22).
    const source = await http()
      .get(`/api/v1/experiences/${experience.id}`)
      .set("Cookie", cookie);
    expect(source.body.description).toBeNull();

    const patched = await http()
      .patch(`/api/v1/cvs/${cv.id}`)
      .set("Cookie", cookie)
      .send({ sectionOrder: ["experience", "profile", "languages"] });
    expect(patched.body.sectionOrder).toEqual(["experience", "profile", "languages"]);
  });

  it("§65 test 14: verified fields cannot be altered via CV override", async () => {
    const cookie = await makeUser("aline@example.com", ["Aline", "Haddad"]);
    const experience = await makeExperience(cookie);
    const verificationId = await verifyExperience(cookie, experience.id);
    const cv = (await makeCv(cookie)).cv;

    // "Junior Developer" → "Senior Developer" through the CV must die.
    const fraud = await http()
      .put(`/api/v1/cvs/${cv.id}/items`)
      .set("Cookie", cookie)
      .send({
        items: [
          {
            sourceType: "EXPERIENCE",
            sourceId: experience.id,
            displayOverride: { position: "Senior Developer" },
            order: 0,
            visible: true,
          },
        ],
      });
    expect(fraud.status).toBe(409);
    expect(fraud.body.code).toBe("VERIFIED_FIELD_LOCKED");
    expect(fraud.body.keys).toEqual(["position"]);
    expect(await prisma.cvItem.count()).toBe(0);

    // Free text stays editable on verified entries (§22 table).
    const ok = await http()
      .put(`/api/v1/cvs/${cv.id}/items`)
      .set("Cookie", cookie)
      .send({
        items: [
          {
            sourceType: "EXPERIENCE",
            sourceId: experience.id,
            displayOverride: { description: "Tailored description." },
            order: 0,
            visible: true,
          },
        ],
      });
    expect(ok.status).toBe(200);

    // Explicitly dropping the verification unlocks the fields — the choice
    // dialog's second option, never an implicit side effect.
    await http()
      .post(`/api/v1/verifications/${verificationId}/revoke`)
      .set("Cookie", cookie);
    const afterDrop = await http()
      .put(`/api/v1/cvs/${cv.id}/items`)
      .set("Cookie", cookie)
      .send({
        items: [
          {
            sourceType: "EXPERIENCE",
            sourceId: experience.id,
            displayOverride: { position: "Senior Developer" },
            order: 0,
            visible: true,
          },
        ],
      });
    expect(afterDrop.status).toBe(200);
  });

  it("credential items are never overridable and must be ACTIVE and own", async () => {
    const cookie = await makeUser("aline@example.com", ["Aline", "Haddad"]);
    const cv = (await makeCv(cookie)).cv;

    const memberCookie = await makeUser("registrar@inst.example.com");
    const member = await prisma.user.findUniqueOrThrow({
      where: { email: "registrar@inst.example.com" },
    });
    const org = await prisma.organization.create({
      data: {
        type: "LANGUAGE_SCHOOL",
        name: "Example Language Institute (fictional)",
        countryCode: "LB",
        verificationStatus: "VERIFIED",
        members: { create: { userId: member.id, role: "ISSUER" } },
      },
    });
    const profile = await prisma.profile.findFirstOrThrow({
      where: { firstName: "Aline" },
    });
    const credential = (
      await http()
        .post(`/api/v1/org/${org.id}/credentials`)
        .set("Cookie", memberCookie)
        .send({
          subjectSlug: profile.slug,
          credentialType: "LANGUAGE",
          payload: { language: "de", level: "B2" },
        })
    ).body;

    // OFFERED (not yet accepted) → cannot be placed on a CV.
    const offered = await http()
      .put(`/api/v1/cvs/${cv.id}/items`)
      .set("Cookie", cookie)
      .send({
        items: [
          { sourceType: "CREDENTIAL", sourceId: credential.id, order: 0, visible: true },
        ],
      });
    expect(offered.status).toBe(404);

    await http()
      .post(`/api/v1/credentials/${credential.id}/accept`)
      .set("Cookie", cookie);
    const active = await http()
      .put(`/api/v1/cvs/${cv.id}/items`)
      .set("Cookie", cookie)
      .send({
        items: [
          { sourceType: "CREDENTIAL", sourceId: credential.id, order: 0, visible: true },
        ],
      });
    expect(active.status).toBe(200);

    // No credential field is overridable — issuer-signed content (§26).
    const tampered = await http()
      .put(`/api/v1/cvs/${cv.id}/items`)
      .set("Cookie", cookie)
      .send({
        items: [
          {
            sourceType: "CREDENTIAL",
            sourceId: credential.id,
            displayOverride: { level: "C2" },
            order: 0,
            visible: true,
          },
        ],
      });
    expect(tampered.status).toBe(400);
    expect(tampered.body.code).toBe("OVERRIDE_KEY_NOT_ALLOWED");
  });

  it("cross-tenant: foreign CVs and foreign sources are not found", async () => {
    const cookieA = await makeUser("usera@example.com", ["A", "A"]);
    const cookieB = await makeUser("userb@example.com", ["B", "B"]);
    const experienceA = await makeExperience(cookieA);
    const cvA = (await makeCv(cookieA)).cv;

    expect(
      (await http().get(`/api/v1/cvs/${cvA.id}`).set("Cookie", cookieB)).status,
    ).toBe(404);

    const cvB = (await makeCv(cookieB)).cv;
    const stolenSource = await http()
      .put(`/api/v1/cvs/${cvB.id}/items`)
      .set("Cookie", cookieB)
      .send({
        items: [
          { sourceType: "EXPERIENCE", sourceId: experienceA.id, order: 0, visible: true },
        ],
      });
    expect(stolenSource.status).toBe(404);
  });

  it("validation: CUSTOM without title and non-custom without sourceId fail", async () => {
    const cookie = await makeUser("aline@example.com");
    const cv = (await makeCv(cookie)).cv;
    const noTitle = await http()
      .put(`/api/v1/cvs/${cv.id}/items`)
      .set("Cookie", cookie)
      .send({ items: [{ sourceType: "CUSTOM", order: 0, visible: true }] });
    expect(noTitle.status).toBe(400);
    const noSource = await http()
      .put(`/api/v1/cvs/${cv.id}/items`)
      .set("Cookie", cookie)
      .send({ items: [{ sourceType: "EXPERIENCE", order: 0, visible: true }] });
    expect(noSource.status).toBe(400);
  });
});
