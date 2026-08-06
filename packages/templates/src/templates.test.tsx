import { describe, expect, it } from "vitest";
import { TEMPLATE_CATALOG, TEMPLATE_KEYS, getTemplate } from "./catalog";
import { recommendPhoto } from "./photo-logic";
import { renderCvHtml } from "./render";
import type { CvDocument } from "./types";

/** Markup only — class names also appear in the stylesheet. */
function bodyOf(html: string): string {
  return html.slice(html.indexOf("<body>"));
}

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function sampleDoc(overrides: Partial<CvDocument> = {}): CvDocument {
  return {
    locale: "en",
    fullName: "Aline Haddad",
    headline: "Software Developer",
    contact: { email: "aline@example.com", phone: "+961 3 000000", location: "Beirut" },
    photoEnabled: true,
    photoDataUri: TINY_PNG,
    summary: "Fictional demo person for template tests.",
    labels: { verifiedBy: "Verified by {org}" },
    sections: [
      {
        type: "experience",
        title: "Experience",
        visible: true,
        entries: [
          {
            id: "e1",
            title: "Junior Developer",
            subtitle: "ACME Lebanon (fictional)",
            dateRange: "2024 – 2026",
            description: "Built internal tools.",
            bullets: ["Shipped feature X", "Maintained service Y"],
            verifiedBy: "ACME Lebanon (fictional)",
          },
        ],
      },
      {
        type: "education",
        title: "Education",
        visible: true,
        entries: [
          {
            id: "ed1",
            title: "Lebanese Baccalaureate",
            subtitle: "Example Secondary School (fictional)",
            dateRange: "2023 – 2026",
          },
        ],
      },
      {
        type: "languages",
        title: "Languages",
        visible: true,
        entries: [
          { id: "l1", title: "Arabic — Native" },
          { id: "l2", title: "German — B2", verifiedBy: "Example Language Institute" },
        ],
      },
      {
        type: "skills",
        title: "Skills",
        visible: false,
        entries: [{ id: "s1", title: "TypeScript" }],
      },
    ],
    ...overrides,
  };
}

describe("template catalog (§19)", () => {
  it("contains exactly the 10 templates with the specified properties", () => {
    expect(TEMPLATE_KEYS).toHaveLength(10);
    expect(TEMPLATE_CATALOG["classic-photo"].photoSlot).toBe("required");
    expect(TEMPLATE_CATALOG.compact.photoSlot).toBe("none");
    expect(TEMPLATE_CATALOG.academic.photoSlot).toBe("none");
    const atsUnsafe = TEMPLATE_KEYS.filter((k) => !TEMPLATE_CATALOG[k].atsSafe);
    expect(atsUnsafe.sort()).toEqual(["creative", "executive", "sidebar"]);
    for (const key of TEMPLATE_KEYS) {
      const t = TEMPLATE_CATALOG[key];
      expect(t.key).toBe(key);
      if (t.columns === 2) expect(t.sidebarSections?.length).toBeGreaterThan(0);
      else expect(t.sidebarSections).toBeUndefined();
    }
    expect(getTemplate("does-not-exist")).toBeNull();
  });
});

describe("render engine (§18)", () => {
  it("renders every template in ar, en and fr with correct direction and full text layer", () => {
    for (const key of TEMPLATE_KEYS) {
      for (const locale of ["ar", "en", "fr"] as const) {
        const html = renderCvHtml(
          sampleDoc({ locale, fullName: locale === "ar" ? "ألين حداد" : "Aline Haddad" }),
          TEMPLATE_CATALOG[key],
        );
        expect(html).toContain(`dir="${locale === "ar" ? "rtl" : "ltr"}"`);
        expect(html).toContain(locale === "ar" ? "ألين حداد" : "Aline Haddad");
        // Real text flow, not images: entry content must be present as text.
        expect(html).toContain("Junior Developer");
        expect(html).toContain("Lebanese Baccalaureate");
      }
    }
  });

  it("verified entries get the positive badge; unverified entries get NO marker (§5)", () => {
    const body = bodyOf(renderCvHtml(sampleDoc(), TEMPLATE_CATALOG.classic));
    expect(body).toContain("✓ Verified by ACME Lebanon (fictional)");
    // Exactly two verified entries in the fixture → exactly two badges.
    expect(body.match(/cv-badge-verified/g)).toHaveLength(2);
    expect(body).not.toMatch(/not verified|unverified/i);
  });

  it("photo logic: per-CV flag, slot config, and embedded-only sources", () => {
    const withPhoto = bodyOf(
      renderCvHtml(sampleDoc(), TEMPLATE_CATALOG["classic-photo"]),
    );
    expect(withPhoto).toContain("cv-photo");

    const disabled = bodyOf(
      renderCvHtml(sampleDoc({ photoEnabled: false }), TEMPLATE_CATALOG["classic-photo"]),
    );
    expect(disabled).not.toContain("cv-photo");

    // Template without a slot ignores the flag entirely.
    const noSlot = bodyOf(renderCvHtml(sampleDoc(), TEMPLATE_CATALOG.compact));
    expect(noSlot).not.toContain("cv-photo");

    // External URLs are never embedded (§20).
    const external = bodyOf(
      renderCvHtml(
        sampleDoc({ photoDataUri: "https://example.com/photo.jpg" }),
        TEMPLATE_CATALOG["classic-photo"],
      ),
    );
    expect(external).not.toContain("cv-photo");
    expect(external).not.toContain("example.com/photo.jpg");
  });

  it("hidden sections are omitted from output but stay in the document model", () => {
    const doc = sampleDoc();
    const html = renderCvHtml(doc, TEMPLATE_CATALOG.classic);
    expect(html).not.toContain("TypeScript");
    expect(doc.sections.some((s) => s.type === "skills")).toBe(true);
  });

  it("two-column templates split configured sections into the aside", () => {
    const body = bodyOf(renderCvHtml(sampleDoc(), TEMPLATE_CATALOG.sidebar));
    const asidePart = body.slice(body.indexOf("cv-aside"));
    expect(asidePart).toContain("German — B2");
    expect(asidePart).not.toContain("Junior Developer");
  });

  it("escapes user content — no script injection through CV fields", () => {
    const html = renderCvHtml(
      sampleDoc({
        fullName: '<script>alert("x")</script>',
        summary: '<img src=x onerror=alert(1)>',
      }),
      TEMPLATE_CATALOG.classic,
    );
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("photo recommendation (§20)", () => {
  it("expected markets preselect a photo; discouraged markets warn", () => {
    expect(recommendPhoto("DE")).toEqual({ photoDefault: true, norm: "expected" });
    expect(recommendPhoto("LB").photoDefault).toBe(true);
    const us = recommendPhoto("US");
    expect(us.photoDefault).toBe(false);
    expect(us.warningKey).toBe("cv.photo.discouragedWarning");
    expect(recommendPhoto("JP")).toEqual({ photoDefault: false, norm: "neutral" });
    expect(recommendPhoto(undefined).norm).toBe("neutral");
    expect(recommendPhoto("de").photoDefault).toBe(true);
  });
});
