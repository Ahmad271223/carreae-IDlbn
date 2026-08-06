import Link from "next/link";
import { branding } from "@careerid/branding";
import { SUPPORTED_LOCALES, t, type Locale } from "@careerid/i18n";

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safe: Locale = (SUPPORTED_LOCALES as readonly string[]).includes(locale)
    ? (locale as Locale)
    : "en";
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-bold text-brand">{branding.productName}</h1>
      <p className="text-lg text-gray-600">
        {branding.tagline[safe] ?? branding.tagline.en}
      </p>
      <div className="flex gap-3">
        <Link
          href={`/${safe}/login`}
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white"
        >
          {t(safe, "auth.login")}
        </Link>
        <Link
          href={`/${safe}/register`}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium"
        >
          {t(safe, "auth.register")}
        </Link>
      </div>
      <nav className="flex gap-2 text-xs text-gray-500">
        {SUPPORTED_LOCALES.map((l) => (
          <Link key={l} href={`/${l}`} className="underline">
            {l}
          </Link>
        ))}
      </nav>
    </main>
  );
}
