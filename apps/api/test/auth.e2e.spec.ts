import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaService } from "../src/prisma/prisma.service";
import {
  FakeMailer,
  createTestApp,
  extractToken,
  resetDatabase,
  sessionCookie,
} from "./helpers";

const EMAIL = "aline.demo@example.com";
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

async function register(email = EMAIL, password = PASSWORD) {
  return http().post("/api/v1/auth/register").send({ email, password });
}

async function login(email = EMAIL, password = PASSWORD) {
  return http().post("/api/v1/auth/login").send({ email, password });
}

describe("registration", () => {
  it("creates the user, stores an argon2id hash, sends a verification mail", async () => {
    const res = await register();
    expect(res.status).toBe(202);

    const user = await prisma.user.findUnique({ where: { email: EMAIL } });
    expect(user).not.toBeNull();
    expect(user!.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user!.passwordHash).not.toContain(PASSWORD);
    expect(user!.emailVerifiedAt).toBeNull();

    const mail = mailer.lastFor(EMAIL);
    expect(mail?.subject).toContain("verify");
  });

  it("is enumeration-safe: identical response for duplicate registration, no duplicate row", async () => {
    const first = await register();
    const second = await register();
    expect(second.status).toBe(first.status);
    expect(second.body).toEqual(first.body);
    expect(await prisma.user.count({ where: { email: EMAIL } })).toBe(1);
    // Existing account gets a notice, not a second verification mail.
    expect(mailer.sent.filter((m) => m.to === EMAIL)).toHaveLength(2);
    expect(mailer.sent[1]!.subject).toContain("already exists");
  });

  it("rejects weak passwords via shared schema validation", async () => {
    const res = await register(EMAIL, "short");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_FAILED");
  });
});

describe("email verification", () => {
  it("verifies with the mailed token; token is single-use; tampered tokens fail", async () => {
    await register();
    const token = extractToken(mailer.lastFor(EMAIL)!.text);

    const ok = await http().post("/api/v1/auth/verify-email").send({ token });
    expect(ok.status).toBe(200);
    const user = await prisma.user.findUnique({ where: { email: EMAIL } });
    expect(user!.emailVerifiedAt).not.toBeNull();

    const replay = await http().post("/api/v1/auth/verify-email").send({ token });
    expect(replay.status).toBe(400);

    const tampered = await http()
      .post("/api/v1/auth/verify-email")
      .send({ token: token.slice(0, -2) + "xx" });
    expect(tampered.status).toBe(400);
  });
});

describe("login & sessions", () => {
  it("valid login sets an httpOnly session cookie and /auth/me works", async () => {
    await register();
    const res = await login();
    expect(res.status).toBe(200);
    const rawCookie = (res.headers["set-cookie"] as unknown as string[])[0]!;
    expect(rawCookie).toContain("HttpOnly");

    const cookie = sessionCookie(res.headers);
    const me = await http().get("/api/v1/auth/me").set("Cookie", cookie);
    expect(me.status).toBe(200);
    expect(me.body.email).toBe(EMAIL);
    expect(me.body.emailVerified).toBe(false);
  });

  it("is enumeration-safe: unknown email and wrong password are indistinguishable", async () => {
    await register();
    const unknown = await login("nobody@example.com", PASSWORD);
    const wrongPassword = await login(EMAIL, "definitely-wrong-1");
    expect(unknown.status).toBe(401);
    expect(wrongPassword.status).toBe(401);
    expect(unknown.body).toEqual(wrongPassword.body);
  });

  it("session tokens are stored only as hashes", async () => {
    await register();
    const res = await login();
    const rawToken = sessionCookie(res.headers).split("=")[1]!;
    const sessions = await prisma.session.findMany();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.tokenHash).not.toBe(rawToken);
    expect(sessions[0]!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("logout revokes the session server-side", async () => {
    await register();
    const cookie = sessionCookie((await login()).headers);
    expect((await http().post("/api/v1/auth/logout").set("Cookie", cookie)).status).toBe(204);
    // Revocation is server-side, not just a deleted cookie (SECURITY.md).
    const me = await http().get("/api/v1/auth/me").set("Cookie", cookie);
    expect(me.status).toBe(401);
  });

  it("device management: list sessions, revoke another device, cannot revoke foreign sessions", async () => {
    await register();
    await register("karim.demo@example.com", PASSWORD);
    const cookieA1 = sessionCookie((await login()).headers);
    const cookieA2 = sessionCookie((await login()).headers);
    const cookieB = sessionCookie(
      (await login("karim.demo@example.com", PASSWORD)).headers,
    );

    const list = await http().get("/api/v1/auth/sessions").set("Cookie", cookieA1);
    expect(list.body.sessions).toHaveLength(2);
    const other = list.body.sessions.find((s: { current: boolean }) => !s.current);

    // User B may not revoke A's session — and gets no existence information.
    const foreign = await http()
      .delete(`/api/v1/auth/sessions/${other.id}`)
      .set("Cookie", cookieB);
    expect(foreign.status).toBe(403);

    const revoke = await http()
      .delete(`/api/v1/auth/sessions/${other.id}`)
      .set("Cookie", cookieA1);
    expect(revoke.status).toBe(204);
    expect((await http().get("/api/v1/auth/me").set("Cookie", cookieA2)).status).toBe(401);
    expect((await http().get("/api/v1/auth/me").set("Cookie", cookieA1)).status).toBe(200);
  });

  it("unauthenticated requests to protected routes get 401", async () => {
    expect((await http().get("/api/v1/auth/me")).status).toBe(401);
    expect((await http().get("/api/v1/auth/sessions")).status).toBe(401);
    const forged = await http()
      .get("/api/v1/auth/me")
      .set("Cookie", "cid.sid=forged-token-value-000000000000000000000000");
    expect(forged.status).toBe(401);
  });
});

describe("password reset", () => {
  it("full flow: forgot → mail token → reset → old password dead, all sessions revoked, token single-use", async () => {
    await register();
    const cookie = sessionCookie((await login()).headers);

    const forgot = await http()
      .post("/api/v1/auth/password/forgot")
      .send({ email: EMAIL });
    expect(forgot.status).toBe(202);
    const token = extractToken(mailer.lastFor(EMAIL)!.text);

    const newPassword = "brand new passphrase 9";
    const reset = await http()
      .post("/api/v1/auth/password/reset")
      .send({ token, newPassword });
    expect(reset.status).toBe(200);

    // Every pre-reset session is dead.
    expect((await http().get("/api/v1/auth/me").set("Cookie", cookie)).status).toBe(401);
    expect((await login(EMAIL, PASSWORD)).status).toBe(401);
    expect((await login(EMAIL, newPassword)).status).toBe(200);

    const replay = await http()
      .post("/api/v1/auth/password/reset")
      .send({ token, newPassword: "another pass phrase 22" });
    expect(replay.status).toBe(400);
  });

  it("is enumeration-safe: identical 202 for unknown accounts, and no mail goes out", async () => {
    const res = await http()
      .post("/api/v1/auth/password/forgot")
      .send({ email: "ghost@example.com" });
    expect(res.status).toBe(202);
    expect(mailer.sent).toHaveLength(0);
  });
});

describe("audit chain", () => {
  it("register/login/logout produce a verifiable hash chain", async () => {
    await register();
    const cookie = sessionCookie((await login()).headers);
    await http().post("/api/v1/auth/logout").set("Cookie", cookie);

    const { AuditService } = await import("../src/modules/audit/audit.service");
    const audit = app.get(AuditService);
    expect(await audit.verifyChain()).toBe(true);

    const events = await prisma.auditEvent.findMany({ orderBy: { sequence: "asc" } });
    const actions = events.map((e) => e.action);
    expect(actions).toEqual(
      expect.arrayContaining(["user.registered", "auth.login", "auth.logout"]),
    );

    // Tampering with any past event breaks verification.
    await prisma.auditEvent.update({
      where: { id: events[0]!.id },
      data: { action: "user.registered.tampered" },
    });
    expect(await audit.verifyChain()).toBe(false);
  });
});
