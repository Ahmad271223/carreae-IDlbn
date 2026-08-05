import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/prisma/prisma.service";
import { Mailer } from "../src/modules/mail/mailer";
import {
  OIDC_CLIENTS,
  OidcClient,
  type OidcProfile,
} from "../src/modules/auth/oauth/oidc-client";
import { FakeMailer, resetDatabase, sessionCookie } from "./helpers";

/** Deterministic OIDC double: code "code-for:<subject>:<email>:<verified>". */
class FakeOidcClient extends OidcClient {
  authorizationUrl(state: string, redirectUri: string): string {
    return `https://fake-idp.example/authorize?state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  }

  async exchangeCode(code: string): Promise<OidcProfile> {
    const [prefix, subject, email, verified] = code.split(":");
    if (prefix !== "code-for" || !subject || !email) {
      throw new Error("invalid fake code");
    }
    return { subject, email, emailVerified: verified === "true" };
  }
}

let app: INestApplication;
let prisma: PrismaService;
let mailer: FakeMailer;

beforeAll(async () => {
  const { AppModule } = await import("../src/app.module");
  mailer = new FakeMailer();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Mailer)
    .useValue(mailer)
    .overrideProvider(OIDC_CLIENTS)
    .useValue({ google: new FakeOidcClient() })
    .compile();
  app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  prisma = app.get(PrismaService);
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

async function startAndGetState(): Promise<string> {
  const res = await http().get("/api/v1/auth/oauth/google/start");
  expect(res.status).toBe(302);
  const url = new URL(res.headers.location!);
  return url.searchParams.get("state")!;
}

describe("SSO login (google, faked IdP)", () => {
  it("start redirects to the IdP with a state bound server-side", async () => {
    const state = await startAndGetState();
    expect(state.length).toBeGreaterThan(20);
    expect(await prisma.oauthState.count()).toBe(1);
  });

  it("callback with valid state creates a user + identity and opens a session", async () => {
    const state = await startAndGetState();
    const res = await http().get(
      `/api/v1/auth/oauth/google/callback?code=code-for:sub-1:sso.user@example.com:true&state=${state}`,
    );
    expect(res.status).toBe(302);
    const cookie = sessionCookie(res.headers);

    const me = await http().get("/api/v1/auth/me").set("Cookie", cookie);
    expect(me.body.email).toBe("sso.user@example.com");
    expect(me.body.emailVerified).toBe(true);

    const identity = await prisma.identity.findFirstOrThrow();
    expect(identity.provider).toBe("GOOGLE");
    expect(identity.providerSubject).toBe("sub-1");
  });

  it("second login with the same subject reuses the account", async () => {
    const s1 = await startAndGetState();
    await http().get(
      `/api/v1/auth/oauth/google/callback?code=code-for:sub-1:sso.user@example.com:true&state=${s1}`,
    );
    const s2 = await startAndGetState();
    await http().get(
      `/api/v1/auth/oauth/google/callback?code=code-for:sub-1:sso.user@example.com:true&state=${s2}`,
    );
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.identity.count()).toBe(1);
  });

  it("rejects unknown, replayed and foreign states", async () => {
    const bogus = await http().get(
      "/api/v1/auth/oauth/google/callback?code=code-for:x:x@example.com:true&state=not-a-real-state-token-000",
    );
    expect(bogus.status).toBe(400);

    const state = await startAndGetState();
    await http().get(
      `/api/v1/auth/oauth/google/callback?code=code-for:sub-1:a@example.com:true&state=${state}`,
    );
    const replay = await http().get(
      `/api/v1/auth/oauth/google/callback?code=code-for:sub-1:a@example.com:true&state=${state}`,
    );
    expect(replay.status).toBe(400);
  });

  it("never silently links onto an existing email account", async () => {
    await http()
      .post("/api/v1/auth/register")
      .send({ email: "taken@example.com", password: "some long password" });

    const state = await startAndGetState();
    const res = await http().get(
      `/api/v1/auth/oauth/google/callback?code=code-for:sub-9:taken@example.com:true&state=${state}`,
    );
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("error=sso_account_exists");
    expect(res.headers["set-cookie"]).toBeUndefined();
    expect(await prisma.identity.count()).toBe(0);
    expect(await prisma.user.count()).toBe(1);
  });

  it("explicit linking from an authenticated session works and enables SSO login", async () => {
    await http()
      .post("/api/v1/auth/register")
      .send({ email: "linker@example.com", password: "some long password" });
    const login = await http()
      .post("/api/v1/auth/login")
      .send({ email: "linker@example.com", password: "some long password" });
    const cookie = sessionCookie(login.headers);

    const link = await http()
      .post("/api/v1/auth/oauth/google/link")
      .set("Cookie", cookie);
    expect(link.status).toBe(201);
    const state = new URL(link.body.url).searchParams.get("state")!;

    const cb = await http().get(
      `/api/v1/auth/oauth/google/callback?code=code-for:sub-42:linker@example.com:true&state=${state}`,
    );
    expect(cb.status).toBe(302);
    expect(cb.headers.location).toContain("linked=google");
    expect(await prisma.identity.count()).toBe(1);

    // From now on plain SSO login lands in the same account.
    const s2 = await startAndGetState();
    const sso = await http().get(
      `/api/v1/auth/oauth/google/callback?code=code-for:sub-42:whatever@example.com:true&state=${s2}`,
    );
    const ssoCookie = sessionCookie(sso.headers);
    const me = await http().get("/api/v1/auth/me").set("Cookie", ssoCookie);
    expect(me.body.email).toBe("linker@example.com");
    expect(await prisma.user.count()).toBe(1);
  });

  it("unconfigured provider answers 503, unknown provider 404", async () => {
    expect((await http().get("/api/v1/auth/oauth/apple/start")).status).toBe(503);
    expect((await http().get("/api/v1/auth/oauth/github/start")).status).toBe(404);
  });
});
