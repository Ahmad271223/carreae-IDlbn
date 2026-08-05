import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaService } from "../src/prisma/prisma.service";
import { createTestApp, resetDatabase } from "./helpers";

// Separate file: needs its own app instance with a low limit, and its own
// throttler storage so other tests never trip 429s.
process.env.AUTH_THROTTLE_LIMIT = "3";

let app: INestApplication;
let prisma: PrismaService;

beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
  await resetDatabase(prisma);
});

afterAll(async () => {
  await app.close();
});

describe("login rate limiting", () => {
  it("throttles brute-force attempts with 429 after the limit", async () => {
    const attempt = () =>
      request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: "target@example.com", password: "guess-attempt-x" });

    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) statuses.push((await attempt()).status);

    expect(statuses.slice(0, 3)).toEqual([401, 401, 401]);
    expect(statuses.slice(3)).toEqual([429, 429]);
  });
});
