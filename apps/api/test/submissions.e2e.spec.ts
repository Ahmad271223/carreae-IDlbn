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

async function makeEmployer(options?: {
  memberEmail?: string;
  role?: "RECRUITER" | "VIEWER" | "OWNER";
  name?: string;
}) {
  const memberEmail = options?.memberEmail ?? "hr@acme.example.com";
  const memberCookie = await makeUser(memberEmail);
  const member = await prisma.user.findUniqueOrThrow({
    where: { email: memberEmail },
  });
  const org = await prisma.organization.create({
    data: {
      type: "EMPLOYER",
      name: options?.name ?? "Acme Industries (fictional)",
      countryCode: "LB",
      verificationStatus: "VERIFIED",
      members: { create: { userId: member.id, role: options?.role ?? "RECRUITER" } },
    },
  });
  return { org, memberCookie };
}

/** Applicant with profile, one experience and an application over sections. */
async function makeApplicant() {
  const cookie = await makeUser("aline@example.com", ["Aline", "Haddad"]);
  await http().post("/api/v1/experiences").set("Cookie", cookie).send({
    companyName: "Beirut Web Co",
    position: "Developer",
    employmentType: "FULL_TIME",
    startDate: "2022-01-10",
  });
  const application = (
    await http()
      .post("/api/v1/applications")
      .set("Cookie", cookie)
      .send({ title: "Backend role", type: "JOB" })
  ).body;
  await http()
    .put(`/api/v1/applications/${application.id}/items`)
    .set("Cookie", cookie)
    .send({
      items: [
        { itemType: "SECTION", itemId: "experience", order: 0 },
        { itemType: "SECTION", itemId: "skills", order: 1 },
      ],
    });
  return { cookie, application };
}

describe("submitting to an employer", () => {
  it("lists only VERIFIED employers and creates submission + consent", async () => {
    const { org } = await makeEmployer();
    await prisma.organization.create({
      data: {
        type: "EMPLOYER",
        name: "Pending Corp (fictional)",
        countryCode: "LB",
        verificationStatus: "PENDING",
      },
    });
    const { cookie, application } = await makeApplicant();

    const employers = await http().get("/api/v1/employers").set("Cookie", cookie);
    expect(employers.status).toBe(200);
    expect(employers.body).toHaveLength(1);
    expect(employers.body[0].id).toBe(org.id);

    const submit = await http()
      .post(`/api/v1/applications/${application.id}/submit`)
      .set("Cookie", cookie)
      .send({ organizationId: org.id });
    expect(submit.status).toBe(201);
    expect(submit.body.status).toBe("RECEIVED");

    // Consent names the employer; application flips to SENT.
    const consent = await prisma.consent.findFirstOrThrow({
      where: { purpose: "application_submission" },
    });
    expect(consent.recipient).toContain("Acme");
    const app_ = await prisma.application.findUniqueOrThrow({
      where: { id: application.id },
    });
    expect(app_.status).toBe("SENT");

    // Duplicate submit → 409.
    const again = await http()
      .post(`/api/v1/applications/${application.id}/submit`)
      .set("Cookie", cookie)
      .send({ organizationId: org.id });
    expect(again.status).toBe(409);
  });
});

describe("employer inbox", () => {
  it("shows the submission, resolves the projection, logs the org", async () => {
    const { org, memberCookie } = await makeEmployer();
    const { cookie, application } = await makeApplicant();
    const submit = await http()
      .post(`/api/v1/applications/${application.id}/submit`)
      .set("Cookie", cookie)
      .send({ organizationId: org.id });

    const inbox = await http()
      .get(`/api/v1/org/${org.id}/submissions`)
      .set("Cookie", memberCookie);
    expect(inbox.status).toBe(200);
    expect(inbox.body).toHaveLength(1);
    expect(inbox.body[0].applicantName).toBe("Aline Haddad");
    expect(inbox.body[0].applicationTitle).toBe("Backend role");

    const view = await http()
      .get(`/api/v1/org/${org.id}/submissions/${submit.body.id}/view`)
      .set("Cookie", memberCookie);
    expect(view.status).toBe(200);
    expect(view.body.applicant.name).toBe("Aline Haddad");
    expect(view.body.sections.experience).toHaveLength(1);
    // §5/§65: unverified entries carry NO status marker of any kind.
    expect(view.body.sections.experience[0].badge).toBeUndefined();

    const log = await prisma.shareAccessLog.findFirstOrThrow();
    expect(log.orgHint).toContain("Acme");
  });

  it("enforces roles and cross-tenant 404-equality", async () => {
    const { org, memberCookie } = await makeEmployer();
    const viewerOrg = await makeEmployer({
      memberEmail: "viewer@acme.example.com",
      role: "VIEWER",
      name: "Viewer Corp (fictional)",
    });
    const foreign = await makeEmployer({
      memberEmail: "hr@other.example.com",
      name: "Other GmbH (fictional)",
    });
    const { cookie, application } = await makeApplicant();
    const submit = await http()
      .post(`/api/v1/applications/${application.id}/submit`)
      .set("Cookie", cookie)
      .send({ organizationId: org.id });

    // VIEWER role: guard admits the member, service refuses the inbox.
    const viewerInbox = await http()
      .get(`/api/v1/org/${viewerOrg.org.id}/submissions`)
      .set("Cookie", viewerOrg.memberCookie);
    expect(viewerInbox.status).toBe(403);

    // Foreign org: empty inbox, and the concrete id 404s like nothing.
    const foreignInbox = await http()
      .get(`/api/v1/org/${foreign.org.id}/submissions`)
      .set("Cookie", foreign.memberCookie);
    expect(foreignInbox.body).toHaveLength(0);
    const foreignView = await http()
      .get(`/api/v1/org/${foreign.org.id}/submissions/${submit.body.id}/view`)
      .set("Cookie", foreign.memberCookie);
    expect(foreignView.status).toBe(404);

    // Status update notifies the applicant.
    const statusRes = await http()
      .post(`/api/v1/org/${org.id}/submissions/${submit.body.id}/status`)
      .set("Cookie", memberCookie)
      .send({ status: "IN_REVIEW" });
    expect(statusRes.status).toBe(200);
    const applicant = await prisma.user.findUniqueOrThrow({
      where: { email: "aline@example.com" },
    });
    const notification = await prisma.notification.findFirst({
      where: { userId: applicant.id, type: "submission.status" },
    });
    expect(notification).not.toBeNull();
  });

  it("withdrawal revokes employer access", async () => {
    const { org, memberCookie } = await makeEmployer();
    const { cookie, application } = await makeApplicant();
    const submit = await http()
      .post(`/api/v1/applications/${application.id}/submit`)
      .set("Cookie", cookie)
      .send({ organizationId: org.id });

    const withdraw = await http()
      .post(`/api/v1/submissions/${submit.body.id}/withdraw`)
      .set("Cookie", cookie);
    expect(withdraw.status).toBe(200);
    expect(withdraw.body.status).toBe("WITHDRAWN");

    const view = await http()
      .get(`/api/v1/org/${org.id}/submissions/${submit.body.id}/view`)
      .set("Cookie", memberCookie);
    expect(view.status).toBe(404);

    // Employer can no longer move a withdrawn application.
    const statusRes = await http()
      .post(`/api/v1/org/${org.id}/submissions/${submit.body.id}/status`)
      .set("Cookie", memberCookie)
      .send({ status: "IN_REVIEW" });
    expect(statusRes.status).toBe(409);
  });
});
