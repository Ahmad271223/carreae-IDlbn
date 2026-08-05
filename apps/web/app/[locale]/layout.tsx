import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { branding } from "@careerid/branding";
import { SUPPORTED_LOCALES, direction, type Locale } from "@careerid/i18n";

export const metadata: Metadata = {
  title: branding.productName,
  description: branding.tagline.en,
};

export function generateStaticParams(): Array<{ locale: Locale }> {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

/**
 * Locale-scoped root layout: lang/dir always derive from @careerid/i18n —
 * Arabic renders the whole document RTL (brief §53). Layout code uses logical
 * CSS properties only, so no per-direction stylesheets exist.
 */
export default async function RootLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!(SUPPORTED_LOCALES as readonly string[]).includes(locale)) {
    notFound();
  }
  return (
    <html lang={locale} dir={direction(locale)}>
      <body>{children}</body>
    </html>
  );
}
