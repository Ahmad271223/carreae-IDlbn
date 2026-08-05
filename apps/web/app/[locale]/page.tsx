import { branding } from "@careerid/branding";
import { SUPPORTED_LOCALES, type Locale } from "@careerid/i18n";

// Milestone 1.5 shell — real surfaces are built in their own milestones.
export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale: Locale = (SUPPORTED_LOCALES as readonly string[]).includes(
    locale,
  )
    ? (locale as Locale)
    : "en";
  return (
    <main style={{ padding: "4rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>{branding.productName}</h1>
      <p>{branding.tagline[safeLocale] ?? branding.tagline.en}</p>
    </main>
  );
}
