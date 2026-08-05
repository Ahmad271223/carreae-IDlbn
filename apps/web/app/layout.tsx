import type { Metadata } from "next";
import type { ReactNode } from "react";
import { branding } from "@careerid/branding";

export const metadata: Metadata = {
  title: branding.productName,
  description: branding.tagline.en,
};

// Locale routing (ar/en/fr with RTL) lands in Milestone 1.5; until then the
// shell defaults to English/LTR. Direction always comes from @careerid/i18n.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" dir="ltr">
      <body>{children}</body>
    </html>
  );
}
