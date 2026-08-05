import { describe, expect, it } from "vitest";
import { catalogs, direction, SUPPORTED_LOCALES, t } from "./index";

describe("i18n catalogs", () => {
  it("every locale has exactly the same key set (no missing translations)", () => {
    const englishKeys = Object.keys(catalogs.en).sort();
    for (const locale of SUPPORTED_LOCALES) {
      expect(Object.keys(catalogs[locale]).sort()).toEqual(englishKeys);
    }
  });

  it("no catalog value is empty", () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const [key, value] of Object.entries(catalogs[locale])) {
        expect(value.trim(), `${locale}:${key}`).not.toHaveLength(0);
      }
    }
  });

  it("arabic is RTL, english and french are LTR", () => {
    expect(direction("ar")).toBe("rtl");
    expect(direction("en")).toBe("ltr");
    expect(direction("fr")).toBe("ltr");
  });

  it("interpolates placeholders", () => {
    expect(t("en", "verification.verifiedBy", { org: "Example School" })).toBe(
      "Verified by Example School",
    );
    expect(t("ar", "verification.verifiedBy", { org: "مدرسة" })).toContain("مدرسة");
  });
});
