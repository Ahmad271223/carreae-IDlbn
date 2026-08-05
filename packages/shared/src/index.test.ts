import { describe, expect, it } from "vitest";
import {
  CountryCodeSchema,
  CredentialStatus,
  EXTERNALLY_VISIBLE_VERIFICATION,
  LocaleSchema,
  VerificationStatus,
} from "./index";

describe("verification status model", () => {
  it("externally visible statuses contain VERIFIED and nothing else (§5 rule 1)", () => {
    expect(EXTERNALLY_VISIBLE_VERIFICATION).toEqual([VerificationStatus.VERIFIED]);
    expect(EXTERNALLY_VISIBLE_VERIFICATION).not.toContain(VerificationStatus.PENDING);
    expect(EXTERNALLY_VISIBLE_VERIFICATION).not.toContain(VerificationStatus.DECLINED);
  });

  it("credential lifecycle has no deleted state — credentials are never deleted (§6)", () => {
    expect(Object.values(CredentialStatus)).not.toContain("DELETED");
  });
});

describe("schemas", () => {
  it("accepts launch locales ar/en/fr only", () => {
    expect(LocaleSchema.safeParse("ar").success).toBe(true);
    expect(LocaleSchema.safeParse("fr").success).toBe(true);
    expect(LocaleSchema.safeParse("de").success).toBe(false);
  });

  it("country codes are ISO 3166-1 alpha-2 upper-case", () => {
    expect(CountryCodeSchema.safeParse("LB").success).toBe(true);
    expect(CountryCodeSchema.safeParse("lb").success).toBe(false);
    expect(CountryCodeSchema.safeParse("LBN").success).toBe(false);
  });
});
