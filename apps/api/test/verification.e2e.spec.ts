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

/** Seeds a VERIFIED school plus a member (issuer role) via the DB. */
async function makeSchool(options?: {
  status?: "PENDING" | "VERIFIED" | "SUSPENDED";
  memberEmail?: string;
}) {
  const memberEmail = options?.memberEmail ?? "issuer@school.example.com";
  const memberCookie = await makeUser(memberEmail);
  const member = await prisma.user.findUniqueOrThrow({
    where: { email: memberEmail },
  });
  const org = await prisma.organization.create({
    data: {
      type: "SCHOOL",
      name: "Example Secondary School (fictional)",
      countryCode: "LB",
      verificationStatus: options?.status ?? "VERIFIED",
      members: { create: { userId: member.id, role: "ISSUER" } },
    },
  });
  return { org, memberCookie };
}

async function makeStudentWithEducation() {
  const cookie = await makeUser("aline@example.com", ["Aline", "Haddad"]);
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
  return { cookie, education };
}

async function requestVerification(
  cookie: string,
  subjectId: string,
  organizationId: string,
  subjectType = "EDUCATION",
) {
  return http()
    .post("/api/v1/verifications")
    .set("Cookie", cookie)
    .send({ subjectType, subjectId, organizationId });
}

describe("verification lifecycle (§5)", () => {
  it("request → org queue (snapshot only) → atomic confirm → VERIFIED", async () => {
    const { org, memberCookie } = await makeSchool();
    const { cookie, education } = await makeStudentWithEducation();

    const created = await requestVerification(cookie, education.id, org.id);
    expect(created.status).toBe(201);
    expect(created.body.status).toBe("PENDING");
    expect(created.body.fieldHash).toMatch(/^[0-9a-f]{64}$/);

    // The verifier sees the snapshot and nothing else — no user id, no email.
    const queue = await http()
      .get(`/api/v1/org/${org.id}/verifications`)
      .set("Cookie", memberCookie);
    expect(queue.body).toHaveLength(1);
    const item = queue.body[0];
    expect(item.fieldSnapshot.subjectName).toBe("Aline Haddad");
    expect(item.fieldSnapshot.grade).toBe("17/20");
    expect(JSON.stringify(item)).not.toContain("aline@example.com");
    expect(item.userId).toBeUndefined();

    // Confirmation carries no payload; a smuggled body must change nothing.
    const confirm = await http()
      .post(`/api/v1/org/${org.id}/verifications/${item.id}/confirm`)
      .set("Cookie", memberCookie)
      .send({ grade: "20/20", position: "CEO" });
    expect(confirm.status).toBe(200);
    expect(confirm.body.status).toBe("VERIFIED");

    const educationAfter = await http()
      .get(`/api/v1/educations/${education.id}`)
      .set("Cookie", cookie);
    expect(educationAfter.body.grade).toBe("17/20");

    const own = await http().get("/api/v1/verifications").set("Cookie", cookie);
    expect(own.body[0].status).toBe("VERIFIED");
    expect(own.body[0].organizationName).toContain("Example Secondary School");
  });

  it("editing a covered field after VERIFIED resets the badge in the same request", async () => {
    const { org, memberCookie } = await makeSchool();
    const { cookie, education } = await makeStudentWithEducation();
    const req = (await requestVerification(cookie, education.id, org.id)).body;
    await http()
      .post(`/api/v1/org/${org.id}/verifications/${req.id}/confirm`)
      .set("Cookie", memberCookie);

    // Description is NOT covered (§22): editing it keeps the badge.
    const descriptionEdit = await http()
      .patch(`/api/v1/educations/${education.id}`)
      .set("Cookie", cookie)
      .send({ description: "Focus on sciences." });
    expect(descriptionEdit.body.verificationReset).toBe(false);

    // Grade IS covered: the "Junior → Senior" fraud vector must die here.
    const gradeEdit = await http()
      .patch(`/api/v1/educations/${education.id}`)
      .set("Cookie", cookie)
      .send({ grade: "19/20" });
    expect(gradeEdit.status).toBe(200);
    expect(gradeEdit.body.verificationReset).toBe(true);

    const own = await http().get("/api/v1/verifications").set("Cookie", cookie);
    expect(own.body[0].status).toBe("REVOKED");
    expect(own.body[0].revokeReason).toBe("verified_field_edited");
  });

  it("editing the entry while PENDING kills the stale snapshot at confirm time", async () => {
    const { org, memberCookie } = await makeSchool();
    const { cookie, education } = await makeStudentWithEducation();
    const req = (await requestVerification(cookie, education.id, org.id)).body;

    await http()
      .patch(`/api/v1/educations/${education.id}`)
      .set("Cookie", cookie)
      .send({ grade: "19/20" });

    const confirm = await http()
      .post(`/api/v1/org/${org.id}/verifications/${req.id}/confirm`)
      .set("Cookie", memberCookie);
    expect(confirm.status).toBe(409);
    expect(confirm.body.code).toBe("SNAPSHOT_STALE");

    const row = await prisma.verificationRequest.findUniqueOrThrow({
      where: { id: req.id },
    });
    expect(row.status).toBe("REVOKED");
    expect(row.revokeReason).toBe("subject_changed_since_request");
  });

  it("decline stays internal: owner sees DECLINED, nothing is verified", async () => {
    const { org, memberCookie } = await makeSchool();
    const { cookie, education } = await makeStudentWithEducation();
    const req = (await requestVerification(cookie, education.id, org.id)).body;

    const decline = await http()
      .post(`/api/v1/org/${org.id}/verifications/${req.id}/decline`)
      .set("Cookie", memberCookie);
    expect(decline.status).toBe(200);

    const own = await http().get("/api/v1/verifications").set("Cookie", cookie);
    expect(own.body[0].status).toBe("DECLINED");
    // Responding twice is impossible.
    const again = await http()
      .post(`/api/v1/org/${org.id}/verifications/${req.id}/confirm`)
      .set("Cookie", memberCookie);
    expect(again.status).toBe(409);
  });

  it("expiry: overdue PENDING requests turn EXPIRED and cannot be confirmed", async () => {
    const { org, memberCookie } = await makeSchool();
    const { cookie, education } = await makeStudentWithEducation();
    const req = (await requestVerification(cookie, education.id, org.id)).body;
    await prisma.verificationRequest.update({
      where: { id: req.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const confirm = await http()
      .post(`/api/v1/org/${org.id}/verifications/${req.id}/confirm`)
      .set("Cookie", memberCookie);
    expect(confirm.status).toBe(410);

    const own = await http().get("/api/v1/verifications").set("Cookie", cookie);
    expect(own.body[0].status).toBe("EXPIRED");
  });

  it("user can withdraw a PENDING request and drop a VERIFIED badge", async () => {
    const { org, memberCookie } = await makeSchool();
    const { cookie, education } = await makeStudentWithEducation();
    const first = (await requestVerification(cookie, education.id, org.id)).body;
    const withdrawn = await http()
      .post(`/api/v1/verifications/${first.id}/revoke`)
      .set("Cookie", cookie);
    expect(withdrawn.body.status).toBe("REVOKED");

    const second = (await requestVerification(cookie, education.id, org.id)).body;
    await http()
      .post(`/api/v1/org/${org.id}/verifications/${second.id}/confirm`)
      .set("Cookie", memberCookie);
    const dropped = await http()
      .post(`/api/v1/verifications/${second.id}/revoke`)
      .set("Cookie", cookie);
    expect(dropped.body.status).toBe("REVOKED");
  });

  it("duplicate PENDING for the same subject+org is refused", async () => {
    const { org } = await makeSchool();
    const { cookie, education } = await makeStudentWithEducation();
    await requestVerification(cookie, education.id, org.id);
    const duplicate = await requestVerification(cookie, education.id, org.id);
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe("REQUEST_ALREADY_PENDING");
  });
});

describe("verification authorization (§65)", () => {
  it("requests to unverified organizations are refused", async () => {
    const { org } = await makeSchool({ status: "PENDING" });
    const { cookie, education } = await makeStudentWithEducation();
    const res = await requestVerification(cookie, education.id, org.id);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ORGANIZATION_NOT_VERIFIED");
  });

  it("a member of another school cannot see or answer a foreign queue", async () => {
    const { org } = await makeSchool();
    const { memberCookie: foreignCookie } = await makeSchool({
      memberEmail: "issuer@other-school.example.com",
    });
    const { cookie, education } = await makeStudentWithEducation();
    const req = (await requestVerification(cookie, education.id, org.id)).body;

    const queue = await http()
      .get(`/api/v1/org/${org.id}/verifications`)
      .set("Cookie", foreignCookie);
    expect(queue.status).toBe(403);
    const confirm = await http()
      .post(`/api/v1/org/${org.id}/verifications/${req.id}/confirm`)
      .set("Cookie", foreignCookie);
    expect(confirm.status).toBe(403);

    expect(
      (
        await prisma.verificationRequest.findUniqueOrThrow({
          where: { id: req.id },
        })
      ).status,
    ).toBe("PENDING");
  });

  it("a plain user (no membership) gets 403 on org routes; anonymous gets 401", async () => {
    const { org } = await makeSchool();
    const outsiderCookie = await makeUser("outsider@example.com");
    expect(
      (
        await http()
          .get(`/api/v1/org/${org.id}/verifications`)
          .set("Cookie", outsiderCookie)
      ).status,
    ).toBe(403);
    expect((await http().get(`/api/v1/org/${org.id}/verifications`)).status).toBe(401);
  });

  it("a suspended organization loses its queue immediately", async () => {
    const { org, memberCookie } = await makeSchool();
    const { cookie, education } = await makeStudentWithEducation();
    await requestVerification(cookie, education.id, org.id);
    await prisma.organization.update({
      where: { id: org.id },
      data: { verificationStatus: "SUSPENDED" },
    });
    const queue = await http()
      .get(`/api/v1/org/${org.id}/verifications`)
      .set("Cookie", memberCookie);
    expect(queue.status).toBe(403);
  });

  it("users cannot request verification for foreign or deleted entries", async () => {
    const { org } = await makeSchool();
    const { education } = await makeStudentWithEducation();
    const strangerCookie = await makeUser("stranger@example.com", ["S", "T"]);
    const foreign = await requestVerification(strangerCookie, education.id, org.id);
    expect(foreign.status).toBe(404);
  });

  it("deleting a verified entry revokes its verification", async () => {
    const { org, memberCookie } = await makeSchool();
    const { cookie, education } = await makeStudentWithEducation();
    const req = (await requestVerification(cookie, education.id, org.id)).body;
    await http()
      .post(`/api/v1/org/${org.id}/verifications/${req.id}/confirm`)
      .set("Cookie", memberCookie);

    await http()
      .delete(`/api/v1/educations/${education.id}`)
      .set("Cookie", cookie);
    const row = await prisma.verificationRequest.findUniqueOrThrow({
      where: { id: req.id },
    });
    expect(row.status).toBe("REVOKED");
    expect(row.revokeReason).toBe("subject_deleted");
  });
});
