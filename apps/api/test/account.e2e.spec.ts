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

async function makeUser(email = "rana@example.com") {
  await http().post("/api/v1/auth/register").send({ email, password: PASSWORD });
  const login = await http()
    .post("/api/v1/auth/login")
    .send({ email, password: PASSWORD });
  const cookie = sessionCookie(login.headers);
  await http()
    .patch("/api/v1/profile")
    .set("Cookie", cookie)
    .send({ firstName: "Rana", lastName: "Khalil" });
  await http().post("/api/v1/educations").set("Cookie", cookie).send({
    institutionName: "LAU",
    degreeType: "BSc",
    countryCode: "LB",
    startDate: "2019-10-01",
  });
  return cookie;
}

describe("account export", () => {
  it("returns a faithful aggregate of the user's own data", async () => {
    const cookie = await makeUser();
    const response = await http()
      .get("/api/v1/account/export")
      .set("Cookie", cookie);
    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe("rana@example.com");
    expect(response.body.profile.firstName).toBe("Rana");
    expect(response.body.educations).toHaveLength(1);
    expect(response.body.educations[0].institutionName).toBe("LAU");
    // The share token is a live secret — it must never appear in an export.
    expect(JSON.stringify(response.body)).not.toContain('"token"');
  });

  it("requires a session", async () => {
    const response = await http().get("/api/v1/account/export");
    expect(response.status).toBe(401);
  });
});

describe("account erasure", () => {
  it("refuses without correct re-authentication", async () => {
    const cookie = await makeUser();
    const wrong = await http()
      .post("/api/v1/account/erase")
      .set("Cookie", cookie)
      .send({ password: "not the password" });
    expect(wrong.status).toBe(403);
    expect(wrong.body.code).toBe("REAUTH_REQUIRED");
    const missing = await http()
      .post("/api/v1/account/erase")
      .set("Cookie", cookie)
      .send({});
    expect(missing.status).toBe(403);
  });

  it("erases data, anonymizes the shell and kills sessions & login", async () => {
    const cookie = await makeUser();
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: "rana@example.com" },
    });

    const response = await http()
      .post("/api/v1/account/erase")
      .set("Cookie", cookie)
      .send({ password: PASSWORD });
    expect(response.status).toBe(200);
    expect(response.body.erased).toBe(true);

    // Career data hard-deleted, shell anonymized (SECURITY.md §4).
    expect(await prisma.profile.findUnique({ where: { userId: user.id } })).toBeNull();
    expect(await prisma.education.count({ where: { userId: user.id } })).toBe(0);
    const shell = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(shell.status).toBe("ERASED");
    expect(shell.email).toBe(`erased-${user.id}@erased.invalid`);
    expect(shell.passwordHash).toBeNull();
    expect(shell.deletedAt).not.toBeNull();

    // Session is dead; login with the old identity impossible.
    const me = await http().get("/api/v1/auth/me").set("Cookie", cookie);
    expect(me.status).toBe(401);
    const login = await http()
      .post("/api/v1/auth/login")
      .send({ email: "rana@example.com", password: PASSWORD });
    expect(login.status).toBe(401);
  });
});
