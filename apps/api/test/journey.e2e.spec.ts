/**
 * §67 seed journey, end to end — the MVP's definition of done (§60).
 * Every step is the real API; fictional data throughout (§66).
 */
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

async function login(email: string): Promise<string> {
  return sessionCookie(
    (await http().post("/api/v1/auth/login").send({ email, password: PASSWORD }))
      .headers,
  );
}

async function register(email: string): Promise<string> {
  await http().post("/api/v1/auth/register").send({ email, password: PASSWORD });
  return login(email);
}

describe("§67 seed journey", () => {
  it("Lebanese student → school credential → language credential → CV+letter → German university views without account → later employer verification", async () => {
    // ── Platform admin (operator staff, seeded out-of-band) ──
    const adminCookie = await register("admin@platform.example.com");
    await prisma.user.update({
      where: { email: "admin@platform.example.com" },
      data: { platformRole: "ADMIN" },
    });

    // ── 1. Student creates an account + profile (§60 #1–#4) ──
    const student = await register("karim.student@example.com");
    await http().patch("/api/v1/profile").set("Cookie", student).send({
      firstName: "Karim",
      lastName: "Haddad",
      headline: "Baccalaureate graduate",
      city: "Tripoli",
      countryCode: "LB",
    });
    const education = (
      await http().post("/api/v1/educations").set("Cookie", student).send({
        institutionName: "Example Secondary School (fictional)",
        degreeType: "Lebanese Baccalaureate — Life Sciences",
        countryCode: "LB",
        educationSystem: "lebanese-baccalaureate",
        startDate: "2023-09-15",
        endDate: "2026-06-30",
        grade: "16/20",
      })
    ).body;
    await http()
      .post("/api/v1/languages")
      .set("Cookie", student)
      .send({ language: "ar", level: "NATIVE" });
    await http()
      .post("/api/v1/languages")
      .set("Cookie", student)
      .send({ language: "de", level: "B2" });
    const profile = await prisma.profile.findFirstOrThrow({
      where: { firstName: "Karim" },
    });

    // ── 2. School registers, is approved, invites the student, issues the
    //       school-leaving credential (§60 #15) ──
    const school = await register("registrar@school.example.com");
    const schoolOrg = (
      await http().post("/api/v1/organizations").set("Cookie", school).send({
        type: "SCHOOL",
        name: "Example Secondary School (fictional)",
        countryCode: "LB",
      })
    ).body;
    await http()
      .post(`/api/v1/admin/organizations/${schoolOrg.id}/verify`)
      .set("Cookie", adminCookie);
    await http()
      .post(`/api/v1/org/${schoolOrg.id}/relationships/invite`)
      .set("Cookie", school)
      .send({ handle: profile.slug, type: "STUDENT" });
    const invitations = await http()
      .get("/api/v1/relationships")
      .set("Cookie", student);
    await http()
      .post(`/api/v1/relationships/${invitations.body[0].id}/accept`)
      .set("Cookie", student);

    const schoolCredential = (
      await http()
        .post(`/api/v1/org/${schoolOrg.id}/credentials`)
        .set("Cookie", school)
        .send({
          subjectSlug: profile.slug,
          credentialType: "SCHOOL_LEAVING",
          payload: {
            title: "Lebanese Baccalaureate — Life Sciences",
            grade: "16/20",
            year: 2026,
          },
        })
    ).body;
    // §60 #16: the student receives it automatically (offer + notification)…
    const offerNotifications = await prisma.notification.findMany({
      where: { userId: profile.userId, type: "credential.offered" },
    });
    expect(offerNotifications.length).toBeGreaterThan(0);
    // …and accepts it into the wallet.
    await http()
      .post(`/api/v1/credentials/${schoolCredential.id}/accept`)
      .set("Cookie", student);

    // ── 3. Language school issues "German B2" ──
    const languageSchool = await register("office@sprachinstitut.example.com");
    const languageOrg = (
      await http()
        .post("/api/v1/organizations")
        .set("Cookie", languageSchool)
        .send({
          type: "LANGUAGE_SCHOOL",
          name: "Example Language Institute (fictional)",
          countryCode: "LB",
        })
    ).body;
    await http()
      .post(`/api/v1/admin/organizations/${languageOrg.id}/verify`)
      .set("Cookie", adminCookie);
    const germanCredential = (
      await http()
        .post(`/api/v1/org/${languageOrg.id}/credentials`)
        .set("Cookie", languageSchool)
        .send({
          subjectSlug: profile.slug,
          credentialType: "LANGUAGE",
          payload: { language: "de", level: "B2", framework: "CEFR" },
        })
    ).body;
    await http()
      .post(`/api/v1/credentials/${germanCredential.id}/accept`)
      .set("Cookie", student);

    // ── 4. Student uploads a further certificate (§60 #5) ──
    const intent = await http()
      .post("/api/v1/documents/upload-intent")
      .set("Cookie", student)
      .send({ fileName: "first-aid-certificate.pdf", category: "CERTIFICATE" });
    await fetch(intent.body.uploadUrl, {
      method: "PUT",
      body: new Uint8Array(
        Buffer.from("%PDF-1.7\nFirst Aid Course (fictional)\n%%EOF", "latin1"),
      ),
    });
    const certificate = (
      await http()
        .post(`/api/v1/documents/${intent.body.documentId}/complete`)
        .set("Cookie", student)
    ).body;
    expect(certificate.scanStatus).toBe("CLEAN");

    // ── 5. CV "Classic Photo" for Germany (§60 #6) ──
    const cv = (
      await http().post("/api/v1/cvs").set("Cookie", student).send({
        title: "CV Karim Haddad",
        templateKey: "classic-photo",
        language: "en",
        targetCountryCode: "DE",
      })
    ).body.cv;
    expect(cv.photoEnabled).toBe(true); // DE expects a photo (§20)
    await http()
      .put(`/api/v1/cvs/${cv.id}/items`)
      .set("Cookie", student)
      .send({
        items: [
          { sourceType: "EDUCATION", sourceId: education.id, order: 0, visible: true },
          { sourceType: "CREDENTIAL", sourceId: germanCredential.id, order: 1, visible: true },
        ],
      });
    const renderJob = (
      await http().post(`/api/v1/cvs/${cv.id}/render`).set("Cookie", student)
    ).body;
    let rendered: Record<string, unknown> = {};
    for (let i = 0; i < 60; i++) {
      rendered = (
        await http()
          .get(`/api/v1/render-jobs/${renderJob.jobId}`)
          .set("Cookie", student)
      ).body;
      if (rendered.status === "SUCCEEDED" || rendered.status === "FAILED") break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    expect(rendered.status).toBe("SUCCEEDED");

    // ── 6. Cover letter (DE convention) with AI draft + back-translation
    //       check (§60 #7, §30 — German B2 < C1) ──
    const letter = (
      await http().post("/api/v1/cover-letters").set("Cookie", student).send({
        title: "Motivationsschreiben Universität",
        layoutTemplate: "classic",
        convention: "DE",
        language: "de",
      })
    ).body;
    const bodyBlock = letter.blocks.find(
      (b: { type: string }) => b.type === "BODY",
    );
    ai.responses.push(
      "Ich habe 2026 mein Baccalauréat an der Example Secondary School abgeschlossen.",
    );
    ai.responses.push("أنهيت البكالوريا عام ٢٠٢٦ في مدرسة المثال الثانوية.");
    const draft = await http()
      .post(`/api/v1/cover-letters/${letter.id}/blocks/${bodyBlock.id}/draft`)
      .set("Cookie", student)
      .send({ jobDescription: "Bachelor Biology, Example University Berlin." });
    expect(draft.body.backTranslation.language).toBe("ar");
    await http()
      .post(`/api/v1/cover-letters/${letter.id}/blocks/${bodyBlock.id}/adopt`)
      .set("Cookie", student);

    // ── 7. Application for the German university (§60 #8–#9) ──
    const application = (
      await http().post("/api/v1/applications").set("Cookie", student).send({
        title: "Application Example University Berlin",
        type: "UNIVERSITY",
        recipientName: "Example University Berlin (fictional)",
      })
    ).body;
    await http()
      .put(`/api/v1/applications/${application.id}/items`)
      .set("Cookie", student)
      .send({
        items: [
          { itemType: "CV", itemId: cv.id, order: 0 },
          { itemType: "COVER_LETTER", itemId: letter.id, order: 1 },
          { itemType: "CREDENTIAL", itemId: schoolCredential.id, order: 2 },
          { itemType: "CREDENTIAL", itemId: germanCredential.id, order: 3 },
          { itemType: "DOCUMENT", itemId: certificate.id, order: 4 },
          { itemType: "SECTION", itemId: "education", order: 5 },
          { itemType: "SECTION", itemId: "languages", order: 6 },
        ],
      });

    // ── 8. Secure link (§60 #10–#11) ──
    const share = (
      await http()
        .post(`/api/v1/applications/${application.id}/share`)
        .set("Cookie", student)
        .send({})
    ).body;
    const token = share.url.split("/share/")[1]!;

    // ── 9. University opens WITHOUT an account (§60 #12–#13) ──
    const view = await http().get(`/api/v1/share/${token}`);
    expect(view.status).toBe(200);
    expect(view.body.applicant.name).toBe("Karim Haddad");
    // Verified school credential clearly marked…
    const issued = view.body.credentials.map(
      (c: { issuer: string; status: string }) => c,
    );
    expect(issued).toHaveLength(2);
    expect(issued.every((c: { status: string }) => c.status === "ACTIVE")).toBe(true);
    // …self-declared education entry is present WITHOUT any negative marker.
    const educationEntry = view.body.sections.education[0];
    expect(educationEntry.title).toContain("Baccalaureate");
    expect(educationEntry.badge).toBeUndefined();
    expect(JSON.stringify(view.body)).not.toMatch(/PENDING|DECLINED|SELF_DECLARED/);
    // Documents (rendered CV + certificate) are downloadable.
    expect(view.body.documents.length).toBeGreaterThanOrEqual(2);
    const download = await http().get(
      `/api/v1/share/${token}/documents/${certificate.id}`,
    );
    expect(download.status).toBe(200);

    // ── 10. Student is notified of the view (§67) ──
    const viewNotifications = await prisma.notification.findMany({
      where: { userId: profile.userId, type: "share.viewed" },
    });
    expect(viewNotifications).toHaveLength(1);

    // ── 11. Later: an employer confirms a work experience — additive,
    //        nothing was ever blocked before (§5/§67) ──
    const experience = (
      await http().post("/api/v1/experiences").set("Cookie", student).send({
        companyName: "ACME Lebanon (fictional)",
        position: "Summer Intern",
        employmentType: "INTERNSHIP",
        startDate: "2025-07-01",
        endDate: "2025-09-01",
      })
    ).body;
    const employer = await register("hr@acme.example.com");
    const employerOrg = (
      await http().post("/api/v1/organizations").set("Cookie", employer).send({
        type: "EMPLOYER",
        name: "ACME Lebanon (fictional)",
        countryCode: "LB",
      })
    ).body;
    await http()
      .post(`/api/v1/admin/organizations/${employerOrg.id}/verify`)
      .set("Cookie", adminCookie);
    const verification = (
      await http().post("/api/v1/verifications").set("Cookie", student).send({
        subjectType: "EXPERIENCE",
        subjectId: experience.id,
        organizationId: employerOrg.id,
      })
    ).body;
    await http()
      .post(`/api/v1/org/${employerOrg.id}/verifications/${verification.id}/confirm`)
      .set("Cookie", employer);

    // The share now shows the badge — live, and §60 #14: revocation works.
    await http()
      .put(`/api/v1/applications/${application.id}/items`)
      .set("Cookie", student)
      .send({
        items: [
          { itemType: "SECTION", itemId: "experience", order: 0 },
          { itemType: "SECTION", itemId: "education", order: 1 },
        ],
      });
    const secondView = await http().get(`/api/v1/share/${token}`);
    const experienceEntry = secondView.body.sections.experience[0];
    expect(experienceEntry.badge.verifiedBy).toBe("ACME Lebanon (fictional)");

    const shares = await http().get("/api/v1/shares").set("Cookie", student);
    await http()
      .post(`/api/v1/shares/${shares.body[0].id}/revoke`)
      .set("Cookie", student);
    expect((await http().get(`/api/v1/share/${token}`)).status).toBe(404);
  }, 120_000);
});
