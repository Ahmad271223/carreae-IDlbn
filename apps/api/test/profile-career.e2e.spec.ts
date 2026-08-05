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

async function makeUser(email: string): Promise<string> {
  await http().post("/api/v1/auth/register").send({ email, password: PASSWORD });
  const res = await http()
    .post("/api/v1/auth/login")
    .send({ email, password: PASSWORD });
  return sessionCookie(res.headers);
}

describe("profile", () => {
  it("first save mints a non-sequential slug from the name", async () => {
    const cookie = await makeUser("aline@example.com");
    const res = await http()
      .patch("/api/v1/profile")
      .set("Cookie", cookie)
      .send({ firstName: "Aline", lastName: "Haddad", city: "Beirut", countryCode: "LB" });
    expect(res.status).toBe(200);
    expect(res.body.slug).toMatch(/^aline-haddad-[a-z2-9]{5}$/);
    expect(res.body.visibility).toBe("PRIVATE");
  });

  it("arabic-only names get a neutral slug base instead of an empty one", async () => {
    const cookie = await makeUser("karim@example.com");
    const res = await http()
      .patch("/api/v1/profile")
      .set("Cookie", cookie)
      .send({ firstName: "كريم", lastName: "حداد" });
    expect(res.status).toBe(200);
    expect(res.body.slug).toMatch(/^user-[a-z2-9]{5}$/);
  });

  it("slug regeneration changes the suffix, keeps the base", async () => {
    const cookie = await makeUser("aline@example.com");
    const first = (
      await http()
        .patch("/api/v1/profile")
        .set("Cookie", cookie)
        .send({ firstName: "Aline", lastName: "Haddad" })
    ).body.slug as string;
    const second = (
      await http().post("/api/v1/profile/slug").set("Cookie", cookie)
    ).body.slug as string;
    expect(second).not.toBe(first);
    expect(second.startsWith("aline-haddad-")).toBe(true);
  });

  it("sensitive fields live in their own table, encrypted at rest", async () => {
    const cookie = await makeUser("aline@example.com");
    const put = await http()
      .put("/api/v1/profile/sensitive")
      .set("Cookie", cookie)
      .send({
        dateOfBirth: "2007-03-14",
        nationality: "Lebanese",
        contactPhone: "+961 3 123456",
        contactAddress: "Hamra Street 12, Beirut",
      });
    expect(put.status).toBe(200);
    expect(put.body.contactPhone).toBe("+961 3 123456");

    const row = await prisma.profileSensitive.findFirstOrThrow();
    expect(row.contactPhoneEncrypted).toMatch(/^v1:/);
    expect(row.contactPhoneEncrypted).not.toContain("123456");
    expect(row.contactAddressEncrypted).not.toContain("Hamra");

    const get = await http()
      .get("/api/v1/profile/sensitive")
      .set("Cookie", cookie);
    expect(get.body.contactAddress).toBe("Hamra Street 12, Beirut");
    expect(get.body.dateOfBirth).toBe("2007-03-14");
  });

  it("completion score grows with the profile", async () => {
    const cookie = await makeUser("aline@example.com");
    const empty = await http()
      .get("/api/v1/profile/completion")
      .set("Cookie", cookie);
    expect(empty.body.score).toBe(0);

    await http()
      .patch("/api/v1/profile")
      .set("Cookie", cookie)
      .send({ firstName: "Aline", lastName: "Haddad", headline: "Graduate" });
    await http().post("/api/v1/languages").set("Cookie", cookie).send({
      language: "ar",
      level: "NATIVE",
    });
    const later = await http()
      .get("/api/v1/profile/completion")
      .set("Cookie", cookie);
    expect(later.body.score).toBe(40); // basics 20 + headline 10 + languages 10
    expect(later.body.sections.education).toBe(false);
  });
});

describe("career data CRUD", () => {
  it("education create/list/update/soft-delete round trip", async () => {
    const cookie = await makeUser("aline@example.com");
    const created = await http()
      .post("/api/v1/educations")
      .set("Cookie", cookie)
      .send({
        institutionName: "Example Secondary School",
        degreeType: "Lebanese Baccalaureate",
        countryCode: "LB",
        startDate: "2023-09-15",
        endDate: "2026-06-30",
      });
    expect(created.status).toBe(201);

    const patched = await http()
      .patch(`/api/v1/educations/${created.body.id}`)
      .set("Cookie", cookie)
      .send({ grade: "17/20" });
    expect(patched.body.grade).toBe("17/20");

    expect(
      (
        await http()
          .delete(`/api/v1/educations/${created.body.id}`)
          .set("Cookie", cookie)
      ).status,
    ).toBe(204);
    const list = await http().get("/api/v1/educations").set("Cookie", cookie);
    expect(list.body).toHaveLength(0);
    // Soft delete: the row still exists with deletedAt set.
    const raw = await prisma.education.findUnique({
      where: { id: created.body.id },
    });
    expect(raw?.deletedAt).not.toBeNull();
  });

  it("rejects invalid payloads: bad country, end before start, unknown level", async () => {
    const cookie = await makeUser("aline@example.com");
    const badCountry = await http()
      .post("/api/v1/educations")
      .set("Cookie", cookie)
      .send({
        institutionName: "X",
        degreeType: "Y",
        countryCode: "Lebanon",
        startDate: "2023-09-15",
      });
    expect(badCountry.status).toBe(400);

    const badRange = await http()
      .post("/api/v1/experiences")
      .set("Cookie", cookie)
      .send({
        companyName: "ACME",
        position: "Intern",
        employmentType: "INTERNSHIP",
        startDate: "2026-05-01",
        endDate: "2026-04-01",
      });
    expect(badRange.status).toBe(400);

    const badLevel = await http()
      .post("/api/v1/languages")
      .set("Cookie", cookie)
      .send({ language: "de", level: "B9" });
    expect(badLevel.status).toBe(400);
  });

  it("languages are always created SELF_DECLARED regardless of client input", async () => {
    const cookie = await makeUser("aline@example.com");
    const res = await http()
      .post("/api/v1/languages")
      .set("Cookie", cookie)
      .send({ language: "de", level: "B2", source: "CERTIFIED" });
    expect(res.status).toBe(201);
    expect(res.body.source).toBe("SELF_DECLARED");
  });

  it("cross-tenant access is indistinguishable from not-found (§65)", async () => {
    const cookieA = await makeUser("usera@example.com");
    const cookieB = await makeUser("userb@example.com");
    const created = await http()
      .post("/api/v1/experiences")
      .set("Cookie", cookieA)
      .send({
        companyName: "ACME",
        position: "Developer",
        employmentType: "FULL_TIME",
        startDate: "2026-01-01",
      });

    const foreignGet = await http()
      .get(`/api/v1/experiences/${created.body.id}`)
      .set("Cookie", cookieB);
    const foreignPatch = await http()
      .patch(`/api/v1/experiences/${created.body.id}`)
      .set("Cookie", cookieB)
      .send({ position: "CEO" });
    const foreignDelete = await http()
      .delete(`/api/v1/experiences/${created.body.id}`)
      .set("Cookie", cookieB);
    const missing = await http()
      .get(`/api/v1/experiences/0198aaaa-0000-7000-8000-000000000000`)
      .set("Cookie", cookieB);

    expect(foreignGet.status).toBe(404);
    expect(foreignPatch.status).toBe(404);
    expect(foreignDelete.status).toBe(404);
    expect(foreignGet.body).toEqual(missing.body);

    // Data untouched.
    const own = await http()
      .get(`/api/v1/experiences/${created.body.id}`)
      .set("Cookie", cookieA);
    expect(own.body.position).toBe("Developer");
  });

  it("everything under /profile and career routes requires a session", async () => {
    for (const path of [
      "/api/v1/profile",
      "/api/v1/educations",
      "/api/v1/experiences",
      "/api/v1/skills",
      "/api/v1/languages",
    ]) {
      expect((await http().get(path)).status).toBe(401);
    }
  });
});
