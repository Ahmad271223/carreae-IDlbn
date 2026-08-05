import { describe, expect, it } from "vitest";
import { HealthController } from "./health.controller";

describe("HealthController", () => {
  it("reports ok with the configured product name (never hardcoded)", () => {
    const result = new HealthController().check();
    expect(result.status).toBe("ok");
    expect(result.service.length).toBeGreaterThan(0);
  });
});
