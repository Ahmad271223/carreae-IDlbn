import { describe, expect, it } from "vitest";
import {
  CONVENTION_KEYS,
  LETTER_LAYOUT_KEYS,
  renderCoverLetterHtml,
  type LetterDocument,
} from "./letter";

function bodyOf(html: string): string {
  return html.slice(html.indexOf("<body>"));
}

function sampleLetter(overrides: Partial<LetterDocument> = {}): LetterDocument {
  return {
    language: "de",
    senderLines: ["Aline Haddad", "Hamra Street 12", "Beirut, Lebanon"],
    dateLine: "Beirut, 06.08.2026",
    blocks: [
      { type: "RECIPIENT", content: "Beispiel GmbH\nPersonalabteilung\nBerlin" },
      { type: "SUBJECT", content: "Bewerbung als Junior Developer" },
      { type: "SALUTATION", content: "Sehr geehrte Damen und Herren," },
      { type: "OPENING", content: "mit großem Interesse habe ich Ihre Anzeige gelesen." },
      { type: "BODY", content: "In meiner Ausbildung habe ich Erfahrung gesammelt." },
      { type: "BODY", content: "Besonders reizt mich die internationale Ausrichtung." },
      { type: "CLOSING", content: "Mit freundlichen Grüßen" },
      { type: "SIGNATURE", content: "Aline Haddad" },
    ],
    ...overrides,
  };
}

describe("cover letter matrix (§23)", () => {
  it("all 5 layouts × 4 conventions render through one renderer", () => {
    for (const layout of LETTER_LAYOUT_KEYS) {
      for (const convention of CONVENTION_KEYS) {
        const html = renderCoverLetterHtml(sampleLetter(), layout, convention);
        expect(html).toContain("Bewerbung als Junior Developer");
        expect(html).toContain("letter-signature");
      }
    }
    expect(LETTER_LAYOUT_KEYS.length * CONVENTION_KEYS.length).toBe(20);
  });

  it("DE (DIN 5008): date after recipient, end-aligned; bold subject, no prefix", () => {
    const body = bodyOf(renderCoverLetterHtml(sampleLetter(), "classic", "DE"));
    expect(body.indexOf("Beispiel GmbH")).toBeLessThan(body.indexOf("06.08.2026"));
    expect(body).toContain("text-align:end");
    expect(body).toContain("font-weight:700");
    expect(body).not.toContain("Betreff");
  });

  it("FR: recipient end-aligned and the norm's own 'Objet :' prefix", () => {
    const body = bodyOf(renderCoverLetterHtml(sampleLetter(), "classic", "FR"));
    expect(body).toContain("Objet : Bewerbung als Junior Developer");
    const recipientIdx = body.indexOf("letter-recipient");
    expect(body.slice(recipientIdx, recipientIdx + 80)).toContain("text-align:end");
  });

  it("EN: date before the recipient block, start-aligned, no prefix", () => {
    const body = bodyOf(renderCoverLetterHtml(sampleLetter(), "modern", "EN"));
    expect(body.indexOf("06.08.2026")).toBeLessThan(body.indexOf("Beispiel GmbH"));
    expect(body).not.toContain("Objet");
  });

  it("AR: full RTL document", () => {
    const html = renderCoverLetterHtml(
      sampleLetter({
        language: "ar",
        dateLine: "بيروت، ٦ آب ٢٠٢٦",
        blocks: [
          { type: "RECIPIENT", content: "شركة المثال" },
          { type: "SUBJECT", content: "طلب توظيف" },
          { type: "SALUTATION", content: "السادة الكرام،" },
          { type: "BODY", content: "أتقدم بطلبي هذا." },
          { type: "CLOSING", content: "مع فائق الاحترام" },
          { type: "SIGNATURE", content: "ألين حداد" },
        ],
      }),
      "classic",
      "AR",
    );
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('lang="ar"');
    expect(html).toContain("طلب توظيف");
  });

  it("empty blocks are skipped; multiple bodies render in order", () => {
    const body = bodyOf(renderCoverLetterHtml(sampleLetter(), "compact", "DE"));
    expect(body.match(/letter-paragraph/g)?.length).toBe(3); // opening + 2 bodies
    expect(body.indexOf("Anzeige gelesen")).toBeLessThan(
      body.indexOf("internationale Ausrichtung"),
    );
  });
});
