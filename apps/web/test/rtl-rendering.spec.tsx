/**
 * RTL rendering guard (brief §53): the document shell must carry the correct
 * lang/dir for every launch locale. Renders the real root layout server-side.
 */
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import RootLayout from "../app/[locale]/layout";

async function renderShell(locale: string): Promise<string> {
  const element = await RootLayout({
    children: null,
    params: Promise.resolve({ locale }),
  });
  return renderToString(element);
}

describe("document shell direction", () => {
  it("arabic renders RTL", async () => {
    const html = await renderShell("ar");
    expect(html).toContain('lang="ar"');
    expect(html).toContain('dir="rtl"');
  });

  it("english and french render LTR", async () => {
    for (const locale of ["en", "fr"]) {
      const html = await renderShell(locale);
      expect(html).toContain(`lang="${locale}"`);
      expect(html).toContain('dir="ltr"');
    }
  });
});
