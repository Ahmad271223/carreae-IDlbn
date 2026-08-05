import type { INestApplication } from "@nestjs/common";
import { generateSync } from "otplib";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaService } from "../src/prisma/prisma.service";
import {
  FakeMailer,
  createTestApp,
  resetDatabase,
  sessionCookie,
} from "./helpers";

const EMAIL = "mfa.demo@example.com";
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

async function registerAndLogin(): Promise<string> {
  await http().post("/api/v1/auth/register").send({ email: EMAIL, password: PASSWORD });
  const res = await http()
    .post("/api/v1/auth/login")
    .send({ email: EMAIL, password: PASSWORD });
  return sessionCookie(res.headers);
}

async function enrollAndConfirm(cookie: string): Promise<string> {
  const enroll = await http().post("/api/v1/auth/mfa/totp").set("Cookie", cookie);
  expect(enroll.status).toBe(200);
  const { secret, otpauthUri } = enroll.body;
  expect(otpauthUri).toMatch(/^otpauth:\/\/totp\//);
  const confirm = await http()
    .post("/api/v1/auth/mfa/totp/confirm")
    .set("Cookie", cookie)
    .send({ code: generateSync({ secret }) });
  expect(confirm.status).toBe(200);
  return secret;
}

describe("TOTP enrollment", () => {
  it("enroll + confirm enables MFA; the secret is stored encrypted, never plaintext", async () => {
    const cookie = await registerAndLogin();
    const secret = await enrollAndConfirm(cookie);

    const me = await http().get("/api/v1/auth/me").set("Cookie", cookie);
    expect(me.body.mfaEnabled).toBe(true);

    const credential = await prisma.authCredential.findFirstOrThrow({
      where: { type: "TOTP" },
    });
    expect(credential.secretEncrypted).not.toContain(secret);
    expect(credential.secretEncrypted).toMatch(/^v1:/);
    expect(credential.confirmedAt).not.toBeNull();
  });

  it("confirm with a wrong code fails and MFA stays off", async () => {
    const cookie = await registerAndLogin();
    await http().post("/api/v1/auth/mfa/totp").set("Cookie", cookie);
    const confirm = await http()
      .post("/api/v1/auth/mfa/totp/confirm")
      .set("Cookie", cookie)
      .send({ code: "000000" });
    expect(confirm.status).toBe(400);
    const me = await http().get("/api/v1/auth/me").set("Cookie", cookie);
    expect(me.body.mfaEnabled).toBe(false);
  });
});

describe("MFA login", () => {
  it("password alone yields a challenge, not a session; code completes login", async () => {
    const cookie = await registerAndLogin();
    const secret = await enrollAndConfirm(cookie);

    const step1 = await http()
      .post("/api/v1/auth/login")
      .send({ email: EMAIL, password: PASSWORD });
    expect(step1.status).toBe(200);
    expect(step1.body.mfaRequired).toBe(true);
    expect(step1.headers["set-cookie"]).toBeUndefined();

    const wrong = await http()
      .post("/api/v1/auth/mfa/verify")
      .send({ challengeToken: step1.body.challengeToken, code: "000000" });
    expect(wrong.status).toBe(401);

    const right = await http()
      .post("/api/v1/auth/mfa/verify")
      .send({
        challengeToken: step1.body.challengeToken,
        code: generateSync({ secret }),
      });
    expect(right.status).toBe(200);
    const mfaCookie = sessionCookie(right.headers);
    const me = await http().get("/api/v1/auth/me").set("Cookie", mfaCookie);
    expect(me.status).toBe(200);

    // Challenge tokens are single-use.
    const replay = await http()
      .post("/api/v1/auth/mfa/verify")
      .send({
        challengeToken: step1.body.challengeToken,
        code: generateSync({ secret }),
      });
    expect(replay.status).toBe(401);
  });

  it("disable requires a valid current code; afterwards login is single-step again", async () => {
    const cookie = await registerAndLogin();
    const secret = await enrollAndConfirm(cookie);

    const bad = await http()
      .post("/api/v1/auth/mfa/totp/disable")
      .set("Cookie", cookie)
      .send({ code: "000000" });
    expect(bad.status).toBe(401);

    const good = await http()
      .post("/api/v1/auth/mfa/totp/disable")
      .set("Cookie", cookie)
      .send({ code: generateSync({ secret }) });
    expect(good.status).toBe(200);

    const login = await http()
      .post("/api/v1/auth/login")
      .send({ email: EMAIL, password: PASSWORD });
    expect(login.body.mfaRequired).toBeUndefined();
    expect(sessionCookie(login.headers)).toBeTruthy();
  });
});

describe("new-device notification", () => {
  it("a login from an unseen device triggers mail + notification; known devices stay silent", async () => {
    await http()
      .post("/api/v1/auth/register")
      .send({ email: EMAIL, password: PASSWORD });
    const uaA = "TestBrowser/1.0 (Device A)";
    const uaB = "OtherBrowser/9.9 (Device B)";

    await http()
      .post("/api/v1/auth/login")
      .set("User-Agent", uaA)
      .send({ email: EMAIL, password: PASSWORD });
    // Second login, same device: no alert.
    await http()
      .post("/api/v1/auth/login")
      .set("User-Agent", uaA)
      .send({ email: EMAIL, password: PASSWORD });
    expect(
      mailer.sent.filter((m) => m.subject.includes("new login")),
    ).toHaveLength(0);

    await http()
      .post("/api/v1/auth/login")
      .set("User-Agent", uaB)
      .send({ email: EMAIL, password: PASSWORD });
    expect(
      mailer.sent.filter((m) => m.subject.includes("new login")),
    ).toHaveLength(1);
    const notifications = await prisma.notification.findMany({
      where: { type: "security.new_device_login" },
    });
    expect(notifications).toHaveLength(1);
  });
});

describe("encryption helper", () => {
  it("round-trips and rejects tampered payloads", async () => {
    const { encrypt, decrypt } = await import("../src/common/encryption");
    const value = "JBSWY3DPEHPK3PXP";
    const encrypted = encrypt(value);
    expect(encrypted).not.toContain(value);
    expect(decrypt(encrypted)).toBe(value);

    const [v, iv, ct, tag] = encrypted.split(":");
    const flipped = ct![0] === "A" ? "B" + ct!.slice(1) : "A" + ct!.slice(1);
    expect(() => decrypt(`${v}:${iv}:${flipped}:${tag}`)).toThrow();
  });
});
