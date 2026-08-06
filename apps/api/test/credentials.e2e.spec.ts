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

async function makeIssuerOrg(options?: {
  status?: "PENDING" | "VERIFIED";
  memberEmail?: string;
}) {
  const memberEmail = options?.memberEmail ?? "registrar@school.example.com";
  const memberCookie = await makeUser(memberEmail);
  const member = await prisma.user.findUniqueOrThrow({
    where: { email: memberEmail },
  });
  const org = await prisma.organization.create({
    data: {
      type: "LANGUAGE_SCHOOL",
      name: "Example Language Institute (fictional)",
      countryCode: "LB",
      verificationStatus: options?.status ?? "VERIFIED",
      members: { create: { userId: member.id, role: "ISSUER" } },
    },
  });
  return { org, memberCookie };
}

async function makeStudent() {
  const cookie = await makeUser("aline@example.com", ["Aline", "Haddad"]);
  const profile = await prisma.profile.findFirstOrThrow({
    where: { firstName: "Aline" },
  });
  return { cookie, slug: profile.slug };
}

const GERMAN_B2 = {
  credentialType: "LANGUAGE",
  payload: {
    language: "de",
    level: "B2",
    framework: "CEFR",
    result: "87/100",
    certificateNumber: "FICT-2026-0042",
  },
  countryCode: "LB",
  language: "de",
  issuedAt: "2026-07-20",
};

async function issue(
  memberCookie: string,
  orgId: string,
  slug: string,
  overrides: Record<string, unknown> = {},
  idempotencyKey?: string,
) {
  const req = http()
    .post(`/api/v1/org/${orgId}/credentials`)
    .set("Cookie", memberCookie)
    .send({ subjectSlug: slug, ...GERMAN_B2, ...overrides });
  if (idempotencyKey) req.set("Idempotency-Key", idempotencyKey);
  return req;
}

describe("credential lifecycle (§6)", () => {
  it("issue → OFFERED with signature + notification; accept → ACTIVE with history", async () => {
    const { org, memberCookie } = await makeIssuerOrg();
    const { cookie, slug } = await makeStudent();

    const issued = await issue(memberCookie, org.id, slug);
    expect(issued.status).toBe(201);
    expect(issued.body.status).toBe("OFFERED");
    expect(issued.body.signature.alg).toBe("Ed25519");
    expect(issued.body.signature.signature.length).toBeGreaterThan(40);

    // Subject is notified in-app and by mail (§56).
    expect(
      mailer.sent.some((m) => m.to === "aline@example.com" && m.subject.includes("credential")),
    ).toBe(true);
    expect(
      await prisma.notification.count({ where: { type: "credential.offered" } }),
    ).toBe(1);

    const wallet = await http().get("/api/v1/credentials").set("Cookie", cookie);
    expect(wallet.body).toHaveLength(1);
    expect(wallet.body[0].issuerName).toContain("Example Language Institute");

    const accepted = await http()
      .post(`/api/v1/credentials/${issued.body.id}/accept`)
      .set("Cookie", cookie);
    expect(accepted.body.status).toBe("ACTIVE");

    const detail = await http()
      .get(`/api/v1/credentials/${issued.body.id}`)
      .set("Cookie", cookie);
    expect(detail.body.statusHistory.map((h: { toStatus: string }) => h.toStatus)).toEqual([
      "OFFERED",
      "ACTIVE",
    ]);
  });

  it("public verify: valid signature + live status; DB tampering breaks validity", async () => {
    const { org, memberCookie } = await makeIssuerOrg();
    const { cookie, slug } = await makeStudent();
    const id = (await issue(memberCookie, org.id, slug)).body.id;
    await http().post(`/api/v1/credentials/${id}/accept`).set("Cookie", cookie);

    const ok = await http().get(`/api/v1/credentials/${id}/verify`);
    expect(ok.status).toBe(200);
    expect(ok.body.valid).toBe(true);
    expect(ok.body.status).toBe("ACTIVE");
    expect(ok.body.issuer.name).toContain("Example Language Institute");
    // No subject PII in the public response.
    expect(JSON.stringify(ok.body)).not.toContain("Aline");
    expect(JSON.stringify(ok.body)).not.toContain("aline@example.com");

    // Grade inflation via direct DB manipulation must invalidate the signature.
    await prisma.credential.update({
      where: { id },
      data: { payload: { ...GERMAN_B2.payload, level: "C2" } },
    });
    const tampered = await http().get(`/api/v1/credentials/${id}/verify`);
    expect(tampered.body.valid).toBe(false);
  });

  it("decline leaves the credential DECLINED_BY_SUBJECT; re-accept refused", async () => {
    const { org, memberCookie } = await makeIssuerOrg();
    const { cookie, slug } = await makeStudent();
    const id = (await issue(memberCookie, org.id, slug)).body.id;

    const declined = await http()
      .post(`/api/v1/credentials/${id}/decline`)
      .set("Cookie", cookie);
    expect(declined.body.status).toBe("DECLINED_BY_SUBJECT");
    expect(
      (await http().post(`/api/v1/credentials/${id}/accept`).set("Cookie", cookie)).status,
    ).toBe(409);
  });

  it("revocation is immediate, audited, notified — and visible on public verify", async () => {
    const { org, memberCookie } = await makeIssuerOrg();
    const { cookie, slug } = await makeStudent();
    const id = (await issue(memberCookie, org.id, slug)).body.id;
    await http().post(`/api/v1/credentials/${id}/accept`).set("Cookie", cookie);
    mailer.sent.length = 0;

    const revoked = await http()
      .post(`/api/v1/org/${org.id}/credentials/${id}/revoke`)
      .set("Cookie", memberCookie)
      .send({ reason: "administrative error" });
    expect(revoked.body.status).toBe("REVOKED");

    const verify = await http().get(`/api/v1/credentials/${id}/verify`);
    expect(verify.body.status).toBe("REVOKED");
    expect(verify.body.valid).toBe(true); // signature intact, status revoked
    expect(mailer.sent.some((m) => m.subject.includes("revoked"))).toBe(true);

    const history = await prisma.credentialStatusHistory.findMany({
      where: { credentialId: id },
      orderBy: { createdAt: "asc" },
    });
    expect(history.at(-1)?.reason).toBe("administrative error");
  });

  it("supersede links old → new; old is SUPERSEDED, replacement is a fresh OFFER", async () => {
    const { org, memberCookie } = await makeIssuerOrg();
    const { cookie, slug } = await makeStudent();
    const id = (await issue(memberCookie, org.id, slug)).body.id;
    await http().post(`/api/v1/credentials/${id}/accept`).set("Cookie", cookie);

    const superseded = await http()
      .post(`/api/v1/org/${org.id}/credentials/${id}/supersede`)
      .set("Cookie", memberCookie)
      .send({
        payload: { ...GERMAN_B2.payload, result: "78/100" },
        reason: "typo in result",
      });
    expect(superseded.status).toBe(201);
    expect(superseded.body.superseded.status).toBe("SUPERSEDED");
    expect(superseded.body.replacement.status).toBe("OFFERED");
    expect(superseded.body.superseded.supersededById).toBe(
      superseded.body.replacement.id,
    );

    const wallet = await http().get("/api/v1/credentials").set("Cookie", cookie);
    expect(wallet.body).toHaveLength(2);
  });

  it("idempotent issuing: same key → same credential, no duplicates", async () => {
    const { org, memberCookie } = await makeIssuerOrg();
    const { slug } = await makeStudent();
    const first = await issue(memberCookie, org.id, slug, {}, "issue-42");
    const second = await issue(memberCookie, org.id, slug, {}, "issue-42");
    expect(second.body.id).toBe(first.body.id);
    expect(await prisma.credential.count()).toBe(1);
  });

  it("expiry: ACTIVE credentials past expiresAt turn EXPIRED lazily with history", async () => {
    const { org, memberCookie } = await makeIssuerOrg();
    const { cookie, slug } = await makeStudent();
    const id = (await issue(memberCookie, org.id, slug)).body.id;
    await http().post(`/api/v1/credentials/${id}/accept`).set("Cookie", cookie);
    await prisma.credential.update({
      where: { id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const wallet = await http().get("/api/v1/credentials").set("Cookie", cookie);
    expect(wallet.body[0].status).toBe("EXPIRED");
    expect(
      wallet.body[0].statusHistory.map((h: { toStatus: string }) => h.toStatus),
    ).toContain("EXPIRED");
  });

  it("validation: LANGUAGE credentials require language and level in the payload", async () => {
    const { org, memberCookie } = await makeIssuerOrg();
    const { slug } = await makeStudent();
    const res = await issue(memberCookie, org.id, slug, {
      payload: { language: "de" },
    });
    expect(res.status).toBe(400);
  });
});

describe("credential authorization (§65)", () => {
  it("unverified organizations cannot issue (403 from guard)", async () => {
    const { org, memberCookie } = await makeIssuerOrg({ status: "PENDING" });
    const { slug } = await makeStudent();
    expect((await issue(memberCookie, org.id, slug)).status).toBe(403);
  });

  it("a foreign org's issuer cannot revoke another org's credential", async () => {
    const { org, memberCookie } = await makeIssuerOrg();
    const { memberCookie: foreignCookie } = await makeIssuerOrg({
      memberEmail: "registrar@other.example.com",
    });
    const { slug } = await makeStudent();
    const id = (await issue(memberCookie, org.id, slug)).body.id;

    // Via their own org context → not found; via the foreign org → 403.
    const otherOrg = await prisma.organization.findFirstOrThrow({
      where: { members: { some: { user: { email: "registrar@other.example.com" } } } },
    });
    const viaOwnOrg = await http()
      .post(`/api/v1/org/${otherOrg.id}/credentials/${id}/revoke`)
      .set("Cookie", foreignCookie)
      .send({ reason: "not mine" });
    expect(viaOwnOrg.status).toBe(404);
    const viaForeignOrg = await http()
      .post(`/api/v1/org/${org.id}/credentials/${id}/revoke`)
      .set("Cookie", foreignCookie)
      .send({ reason: "not mine" });
    expect(viaForeignOrg.status).toBe(403);
    expect(
      (await prisma.credential.findUniqueOrThrow({ where: { id } })).status,
    ).toBe("OFFERED");
  });

  it("only the subject can accept/see a credential; strangers get 404", async () => {
    const { org, memberCookie } = await makeIssuerOrg();
    const { slug } = await makeStudent();
    const strangerCookie = await makeUser("stranger@example.com");
    const id = (await issue(memberCookie, org.id, slug)).body.id;

    expect(
      (
        await http()
          .post(`/api/v1/credentials/${id}/accept`)
          .set("Cookie", strangerCookie)
      ).status,
    ).toBe(404);
    expect(
      (await http().get(`/api/v1/credentials/${id}`).set("Cookie", strangerCookie))
        .status,
    ).toBe(404);
  });

  it("public verify of an unknown id is 404; wallet requires auth", async () => {
    expect(
      (
        await http().get(
          "/api/v1/credentials/0198aaaa-0000-7000-8000-000000000000/verify",
        )
      ).status,
    ).toBe(404);
    expect((await http().get("/api/v1/credentials")).status).toBe(401);
  });
});
