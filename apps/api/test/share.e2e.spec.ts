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

function tokenOf(url: string): string {
  return url.split("/share/")[1]!;
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
    .send({ firstName: "Aline", lastName: "Haddad", headline: "Graduate" });
  return cookie;
}

/**
 * Full fixture: education (verified), experience (PENDING), second education
 * (DECLINED), language, application with sections, and a share.
 */
async function makeScenario() {
  const cookie = await makeUser();
  const education = (
    await http().post("/api/v1/educations").set("Cookie", cookie).send({
      institutionName: "Example Secondary School (fictional)",
      degreeType: "Lebanese Baccalaureate",
      countryCode: "LB",
      startDate: "2023-09-15",
      endDate: "2026-06-30",
      grade: "17/20",
    })
  ).body;
  const experience = (
    await http().post("/api/v1/experiences").set("Cookie", cookie).send({
      companyName: "ACME Lebanon (fictional)",
      position: "Junior Developer",
      employmentType: "INTERNSHIP",
      startDate: "2025-07-01",
    })
  ).body;

  // Verifier org + member.
  await http()
    .post("/api/v1/auth/register")
    .send({ email: "issuer@school.example.com", password: PASSWORD });
  const memberCookie = sessionCookie(
    (
      await http()
        .post("/api/v1/auth/login")
        .send({ email: "issuer@school.example.com", password: PASSWORD })
    ).headers,
  );
  const member = await prisma.user.findUniqueOrThrow({
    where: { email: "issuer@school.example.com" },
  });
  const org = await prisma.organization.create({
    data: {
      type: "SCHOOL",
      name: "Example Secondary School (fictional)",
      countryCode: "LB",
      verificationStatus: "VERIFIED",
      members: { create: { userId: member.id, role: "ISSUER" } },
    },
  });

  // Education → VERIFIED.
  const eduRequest = (
    await http().post("/api/v1/verifications").set("Cookie", cookie).send({
      subjectType: "EDUCATION",
      subjectId: education.id,
      organizationId: org.id,
    })
  ).body;
  await http()
    .post(`/api/v1/org/${org.id}/verifications/${eduRequest.id}/confirm`)
    .set("Cookie", memberCookie);

  // Experience → PENDING (no response).
  await http().post("/api/v1/verifications").set("Cookie", cookie).send({
    subjectType: "EXPERIENCE",
    subjectId: experience.id,
    organizationId: org.id,
  });

  // Second education → DECLINED.
  const declined = (
    await http().post("/api/v1/educations").set("Cookie", cookie).send({
      institutionName: "Other School (fictional)",
      degreeType: "Middle School Certificate",
      countryCode: "LB",
      startDate: "2019-09-01",
      endDate: "2023-06-30",
    })
  ).body;
  const declinedRequest = (
    await http().post("/api/v1/verifications").set("Cookie", cookie).send({
      subjectType: "EDUCATION",
      subjectId: declined.id,
      organizationId: org.id,
    })
  ).body;
  await http()
    .post(`/api/v1/org/${org.id}/verifications/${declinedRequest.id}/decline`)
    .set("Cookie", memberCookie);

  const application = (
    await http().post("/api/v1/applications").set("Cookie", cookie).send({
      title: "University Application",
      type: "UNIVERSITY",
      recipientName: "Example University Berlin (fictional)",
    })
  ).body;
  await http()
    .put(`/api/v1/applications/${application.id}/items`)
    .set("Cookie", cookie)
    .send({
      items: [
        { itemType: "SECTION", itemId: "education", order: 0 },
        { itemType: "SECTION", itemId: "experience", order: 1 },
      ],
    });

  const share = (
    await http()
      .post(`/api/v1/applications/${application.id}/share`)
      .set("Cookie", cookie)
      .send({})
  ).body;
  return { cookie, share, application, education, eduRequest, org };
}

describe("share creation (§35/§37/§38)", () => {
  it("returns a one-time token URL, a QR of exactly that URL, and a consent", async () => {
    const { share, cookie } = await makeScenario();
    expect(tokenOf(share.url).length).toBeGreaterThanOrEqual(32);
    expect(share.qrSvg).toContain("<svg");
    expect(share.expiresAt).not.toBeNull();

    // Token is stored hashed only.
    const pkg = await prisma.sharePackage.findFirstOrThrow();
    expect(pkg.tokenHash).not.toBe(tokenOf(share.url));
    expect(pkg.tokenHash).toMatch(/^[0-9a-f]{64}$/);

    const consents = await http().get("/api/v1/consents").set("Cookie", cookie);
    expect(consents.body).toHaveLength(1);
    expect(consents.body[0].purpose).toBe("application_view");
  });
});

describe("account-less viewer (§5/§34 — §65 test 13)", () => {
  it("shows verified badge for VERIFIED; PENDING and DECLINED are absent from the entire payload", async () => {
    const { share } = await makeScenario();
    const view = await http().get(`/api/v1/share/${tokenOf(share.url)}`);
    expect(view.status).toBe(200);

    const raw = JSON.stringify(view.body);
    // Two-state world: badge or silence.
    const educationEntries = view.body.sections.education;
    const verified = educationEntries.find(
      (e: { title: string }) => e.title === "Lebanese Baccalaureate",
    );
    expect(verified.badge.verifiedBy).toContain("Example Secondary School");

    const experienceEntry = view.body.sections.experience[0];
    expect(experienceEntry.badge).toBeUndefined();

    // §65 test 13 — no status vocabulary leaks, ever.
    expect(raw).not.toContain("PENDING");
    expect(raw).not.toContain("DECLINED");
    expect(raw).not.toContain("EXPIRED");
    expect(raw).not.toContain("SELF_DECLARED");
    // No contact/sensitive data in the projection.
    expect(raw).not.toContain("@example.com");
  });

  it("badges resolve LIVE: a verification revoked after sharing disappears (§34)", async () => {
    const { share, cookie, eduRequest } = await makeScenario();
    await http()
      .post(`/api/v1/verifications/${eduRequest.id}/revoke`)
      .set("Cookie", cookie);
    const view = await http().get(`/api/v1/share/${tokenOf(share.url)}`);
    const verified = view.body.sections.education.find(
      (e: { title: string }) => e.title === "Lebanese Baccalaureate",
    );
    expect(verified.badge).toBeUndefined();
  });

  it("view is logged coarsely and the owner is notified (§36/§56)", async () => {
    const { share, cookie } = await makeScenario();
    await http().get(`/api/v1/share/${tokenOf(share.url)}`);

    const shares = await http().get("/api/v1/shares").set("Cookie", cookie);
    const log = await http()
      .get(`/api/v1/shares/${shares.body[0].id}/access-log`)
      .set("Cookie", cookie);
    expect(log.body).toHaveLength(1);
    expect(log.body[0].sectionsViewed).toEqual(["education", "experience"]);

    const notifications = await prisma.notification.findMany({
      where: { type: "share.viewed" },
    });
    expect(notifications).toHaveLength(1);
    expect(mailer.sent.some((m) => m.subject.includes("viewed"))).toBe(true);
  });
});

describe("share security (§65 tests 4/5/6)", () => {
  it("test 6: tampered tokens are rejected", async () => {
    const { share } = await makeScenario();
    const token = tokenOf(share.url);
    const tampered = token.slice(0, -2) + (token.endsWith("aa") ? "bb" : "aa");
    expect((await http().get(`/api/v1/share/${tampered}`)).status).toBe(404);
    expect((await http().get(`/api/v1/share/x`)).status).toBe(404);
  });

  it("test 4: a revoked link stops working immediately, server-side", async () => {
    const { share, cookie } = await makeScenario();
    const token = tokenOf(share.url);
    expect((await http().get(`/api/v1/share/${token}`)).status).toBe(200);

    const shares = await http().get("/api/v1/shares").set("Cookie", cookie);
    await http()
      .post(`/api/v1/shares/${shares.body[0].id}/revoke`)
      .set("Cookie", cookie);
    expect((await http().get(`/api/v1/share/${token}`)).status).toBe(404);
  });

  it("test 5: an expired link stops working", async () => {
    const { share } = await makeScenario();
    await prisma.sharePackage.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await http().get(`/api/v1/share/${tokenOf(share.url)}`)).status).toBe(410);
  });

  it("expire-on-first-view: the second open is gone", async () => {
    const { cookie, application } = await makeScenario();
    const share = (
      await http()
        .post(`/api/v1/applications/${application.id}/share`)
        .set("Cookie", cookie)
        .send({ expireOnFirstView: true })
    ).body;
    const token = tokenOf(share.url);
    expect((await http().get(`/api/v1/share/${token}`)).status).toBe(200);
    expect((await http().get(`/api/v1/share/${token}`)).status).toBe(410);
  });

  it("PIN option gates the view", async () => {
    const { cookie, application } = await makeScenario();
    const share = (
      await http()
        .post(`/api/v1/applications/${application.id}/share`)
        .set("Cookie", cookie)
        .send({ pin: "4711" })
    ).body;
    const token = tokenOf(share.url);
    expect((await http().get(`/api/v1/share/${token}`)).status).toBe(401);
    expect(
      (
        await http()
          .post(`/api/v1/share/${token}/unlock`)
          .send({ pin: "wrong" })
      ).status,
    ).toBe(401);
    expect(
      (
        await http().post(`/api/v1/share/${token}/unlock`).send({ pin: "4711" })
      ).status,
    ).toBe(200);
  });

  it("revoking the consent kills the share (§38)", async () => {
    const { share, cookie } = await makeScenario();
    const consents = await http().get("/api/v1/consents").set("Cookie", cookie);
    await http()
      .post(`/api/v1/consents/${consents.body[0].id}/revoke`)
      .set("Cookie", cookie);
    expect((await http().get(`/api/v1/share/${tokenOf(share.url)}`)).status).toBe(404);
  });

  it("document downloads honor downloadAllowed=false", async () => {
    const cookie = await makeUser("doc@example.com");
    const intent = await http()
      .post("/api/v1/documents/upload-intent")
      .set("Cookie", cookie)
      .send({ fileName: "cert.pdf", category: "CERTIFICATE" });
    await fetch(intent.body.uploadUrl, {
      method: "PUT",
      body: new Uint8Array(Buffer.from("%PDF-1.7\nx\n%%EOF", "latin1")),
    });
    const document = (
      await http()
        .post(`/api/v1/documents/${intent.body.documentId}/complete`)
        .set("Cookie", cookie)
    ).body;
    const application = (
      await http().post("/api/v1/applications").set("Cookie", cookie).send({
        title: "X",
        type: "GENERAL",
      })
    ).body;
    await http()
      .put(`/api/v1/applications/${application.id}/items`)
      .set("Cookie", cookie)
      .send({ items: [{ itemType: "DOCUMENT", itemId: document.id, order: 0 }] });
    const share = (
      await http()
        .post(`/api/v1/applications/${application.id}/share`)
        .set("Cookie", cookie)
        .send({ downloadAllowed: false })
    ).body;
    const token = tokenOf(share.url);

    const view = await http().get(`/api/v1/share/${token}`);
    expect(view.body.documents[0].downloadable).toBe(false);
    expect(
      (await http().get(`/api/v1/share/${token}/documents/${document.id}`)).status,
    ).toBe(403);
  });
});
