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
  const login = await http()
    .post("/api/v1/auth/login")
    .send({ email, password: PASSWORD });
  const cookie = sessionCookie(login.headers);
  if (name) {
    await http()
      .patch("/api/v1/profile")
      .set("Cookie", cookie)
      .send({ firstName: name[0], lastName: name[1] });
  }
  return cookie;
}

async function makeAdmin(email = "admin@platform.example.com") {
  const cookie = await makeUser(email);
  await prisma.user.update({
    where: { email },
    data: { platformRole: "ADMIN" },
  });
  return cookie;
}

async function registerOrg(cookie: string, name = "Example School (fictional)") {
  return (
    await http().post("/api/v1/organizations").set("Cookie", cookie).send({
      type: "SCHOOL",
      name,
      countryCode: "LB",
    })
  ).body;
}

describe("organization registration & admin approval (§44/§47)", () => {
  it("registration lands PENDING with the creator as OWNER; issuing is locked until approval", async () => {
    const ownerCookie = await makeUser("owner@school.example.com");
    const org = await registerOrg(ownerCookie);
    expect(org.verificationStatus).toBe("PENDING");

    const mine = await http()
      .get("/api/v1/organizations/mine")
      .set("Cookie", ownerCookie);
    expect(mine.body[0].role).toBe("OWNER");

    // PENDING org: portal routes are locked (guard requires VERIFIED).
    expect(
      (
        await http()
          .get(`/api/v1/org/${org.id}/members`)
          .set("Cookie", ownerCookie)
      ).status,
    ).toBe(403);
  });

  it("admin approval flow: queue → verify → portal unlocked → suspend cuts off again", async () => {
    const ownerCookie = await makeUser("owner@school.example.com");
    const org = await registerOrg(ownerCookie);
    const adminCookie = await makeAdmin();

    const queue = await http()
      .get("/api/v1/admin/organizations?status=PENDING")
      .set("Cookie", adminCookie);
    expect(queue.body.map((o: { id: string }) => o.id)).toContain(org.id);

    const verified = await http()
      .post(`/api/v1/admin/organizations/${org.id}/verify`)
      .set("Cookie", adminCookie);
    expect(verified.body.verificationStatus).toBe("VERIFIED");

    // Owner notified, portal open.
    const notifications = await prisma.notification.findMany({
      where: { type: "organization.verify" },
    });
    expect(notifications).toHaveLength(1);
    expect(
      (
        await http()
          .get(`/api/v1/org/${org.id}/members`)
          .set("Cookie", ownerCookie)
      ).status,
    ).toBe(200);

    await http()
      .post(`/api/v1/admin/organizations/${org.id}/suspend`)
      .set("Cookie", adminCookie);
    expect(
      (
        await http()
          .get(`/api/v1/org/${org.id}/members`)
          .set("Cookie", ownerCookie)
      ).status,
    ).toBe(403);
  });

  it("admin surface denies non-admins; audit chain endpoint verifies", async () => {
    const cookie = await makeUser("pleb@example.com");
    expect(
      (await http().get("/api/v1/admin/organizations").set("Cookie", cookie)).status,
    ).toBe(403);
    const adminCookie = await makeAdmin();
    const chain = await http()
      .get("/api/v1/admin/audit/verify")
      .set("Cookie", adminCookie);
    expect(chain.body.valid).toBe(true);
  });
});

describe("relationships (§7.3 / M7)", () => {
  it("invite by handle → user accepts → org sees only its own relationships", async () => {
    const ownerCookie = await makeUser("owner@school.example.com");
    const org = await registerOrg(ownerCookie);
    const adminCookie = await makeAdmin();
    await http()
      .post(`/api/v1/admin/organizations/${org.id}/verify`)
      .set("Cookie", adminCookie);

    const studentCookie = await makeUser("student@example.com", ["Aline", "Haddad"]);
    const profile = await prisma.profile.findFirstOrThrow({
      where: { firstName: "Aline" },
    });

    const invite = await http()
      .post(`/api/v1/org/${org.id}/relationships/invite`)
      .set("Cookie", ownerCookie)
      .send({ handle: profile.slug, type: "STUDENT" });
    expect(invite.status).toBe(201);
    expect(invite.body.status).toBe("INVITED");

    const own = await http()
      .get("/api/v1/relationships")
      .set("Cookie", studentCookie);
    expect(own.body[0].organizationName).toContain("Example School");
    await http()
      .post(`/api/v1/relationships/${own.body[0].id}/accept`)
      .set("Cookie", studentCookie);

    const list = await http()
      .get(`/api/v1/org/${org.id}/relationships`)
      .set("Cookie", ownerCookie);
    expect(list.body[0].status).toBe("ACTIVE");

    // Unknown handle → 404, no user enumeration beyond the handle itself.
    expect(
      (
        await http()
          .post(`/api/v1/org/${org.id}/relationships/invite`)
          .set("Cookie", ownerCookie)
          .send({ handle: "ghost-user-xxxxx", type: "STUDENT" })
      ).status,
    ).toBe(404);
  });
});

describe("team roles (§65 tests 11/12)", () => {
  async function verifiedOrgWithOwner() {
    const ownerCookie = await makeUser("owner@school.example.com");
    const org = await registerOrg(ownerCookie);
    const adminCookie = await makeAdmin();
    await http()
      .post(`/api/v1/admin/organizations/${org.id}/verify`)
      .set("Cookie", adminCookie);
    return { ownerCookie, org };
  }

  it("OWNER adds members; ISSUER cannot manage the team (privilege escalation dies)", async () => {
    const { ownerCookie, org } = await verifiedOrgWithOwner();
    await makeUser("issuer@school.example.com");
    await makeUser("third@school.example.com");

    const added = await http()
      .post(`/api/v1/org/${org.id}/members`)
      .set("Cookie", ownerCookie)
      .send({ email: "issuer@school.example.com", role: "ISSUER" });
    expect(added.status).toBe(201);

    const issuerCookie = sessionCookie(
      (
        await http()
          .post("/api/v1/auth/login")
          .send({ email: "issuer@school.example.com", password: PASSWORD })
      ).headers,
    );
    // §65 test 11: ISSUER must not manage members at all.
    expect(
      (
        await http()
          .post(`/api/v1/org/${org.id}/members`)
          .set("Cookie", issuerCookie)
          .send({ email: "third@school.example.com", role: "ADMIN" })
      ).status,
    ).toBe(403);
  });

  it("granting ADMIN requires OWNER; last OWNER cannot be removed", async () => {
    const { ownerCookie, org } = await verifiedOrgWithOwner();
    await makeUser("admin2@school.example.com");
    await makeUser("target@school.example.com");
    await http()
      .post(`/api/v1/org/${org.id}/members`)
      .set("Cookie", ownerCookie)
      .send({ email: "admin2@school.example.com", role: "ADMIN" });

    const adminCookie = sessionCookie(
      (
        await http()
          .post("/api/v1/auth/login")
          .send({ email: "admin2@school.example.com", password: PASSWORD })
      ).headers,
    );
    // ADMIN may add ISSUER but not ADMIN/OWNER (RBAC §2).
    expect(
      (
        await http()
          .post(`/api/v1/org/${org.id}/members`)
          .set("Cookie", adminCookie)
          .send({ email: "target@school.example.com", role: "ISSUER" })
      ).status,
    ).toBe(201);
    expect(
      (
        await http()
          .post(`/api/v1/org/${org.id}/members`)
          .set("Cookie", adminCookie)
          .send({ email: "target@school.example.com", role: "OWNER" })
      ).status,
    ).toBe(403);

    const members = await http()
      .get(`/api/v1/org/${org.id}/members`)
      .set("Cookie", ownerCookie);
    const owner = members.body.find((m: { role: string }) => m.role === "OWNER");
    expect(
      (
        await http()
          .delete(`/api/v1/org/${org.id}/members/${owner.id}`)
          .set("Cookie", ownerCookie)
      ).status,
    ).toBe(400); // LAST_OWNER
  });

  it("§65 test 12: a member of another org cannot touch this org (takeover dies)", async () => {
    const { org } = await verifiedOrgWithOwner();
    const foreignOwner = await makeUser("owner@other.example.com");
    const foreignOrg = await registerOrg(foreignOwner, "Other School (fictional)");
    const adminCookie = await makeAdmin("admin2@platform.example.com");
    await http()
      .post(`/api/v1/admin/organizations/${foreignOrg.id}/verify`)
      .set("Cookie", adminCookie);

    expect(
      (
        await http()
          .get(`/api/v1/org/${org.id}/members`)
          .set("Cookie", foreignOwner)
      ).status,
    ).toBe(403);
    expect(
      (
        await http()
          .post(`/api/v1/org/${org.id}/members`)
          .set("Cookie", foreignOwner)
          .send({ email: "owner@other.example.com", role: "OWNER" })
      ).status,
    ).toBe(403);
  });
});

describe("notifications endpoints (§56)", () => {
  it("list + mark read, owner-scoped", async () => {
    const cookie = await makeUser("notify@example.com");
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: "notify@example.com" },
    });
    await prisma.notification.create({
      data: {
        userId: user.id,
        type: "test.event",
        payload: {},
        channels: ["IN_APP"],
      },
    });
    const list = await http().get("/api/v1/notifications").set("Cookie", cookie);
    expect(list.body).toHaveLength(1);
    const read = await http()
      .post(`/api/v1/notifications/${list.body[0].id}/read`)
      .set("Cookie", cookie);
    expect(read.body.readAt).not.toBeNull();

    const strangerCookie = await makeUser("stranger@example.com");
    expect(
      (
        await http()
          .post(`/api/v1/notifications/${list.body[0].id}/read`)
          .set("Cookie", strangerCookie)
      ).status,
    ).toBe(404);
  });
});
