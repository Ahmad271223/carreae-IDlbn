import Link from "next/link";
import { branding } from "@careerid/branding";
import { SUPPORTED_LOCALES, t, type Locale } from "@careerid/i18n";

function BrandMark() {
  return (
    <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-b from-brand-tint to-brand text-white shadow-[0_8px_20px_-8px_rgba(20,36,61,0.6)]">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 2 4 5v6c0 5 3.4 8.3 8 11 4.6-2.7 8-6 8-11V5l-8-3Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          d="m9 12 2 2 4-4"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safe: Locale = (SUPPORTED_LOCALES as readonly string[]).includes(locale)
    ? (locale as Locale)
    : "en";

  const pillars = [
    { key: "credentials", accent: false },
    { key: "cvs", accent: false },
    { key: "applications", accent: false },
  ] as const;

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="grain-overlay" />

      <header className="relative z-10 mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <BrandMark />
          <span className="font-display text-lg font-bold tracking-tight text-brand">
            {branding.productName}
          </span>
        </div>
        <nav className="flex items-center gap-1 rounded-full border border-line bg-white/70 p-1 text-xs font-semibold backdrop-blur">
          {SUPPORTED_LOCALES.map((l) => (
            <Link
              key={l}
              href={`/${l}`}
              className={`rounded-full px-3 py-1.5 uppercase tracking-wide transition-colors ${
                l === safe
                  ? "bg-brand text-white"
                  : "text-muted hover:text-brand"
              }`}
            >
              {l}
            </Link>
          ))}
        </nav>
      </header>

      <main className="relative z-10 mx-auto flex max-w-5xl flex-col items-start px-6 pb-24 pt-10 sm:pt-20">
        <span className="animate-rise inline-flex items-center gap-2 rounded-full border border-verified/20 bg-verified/10 px-3 py-1.5 text-xs font-semibold text-verified">
          <span className="h-1.5 w-1.5 rounded-full bg-verified" />
          Lebanon · العربية · English · Français
        </span>

        <h1
          className="animate-rise mt-6 max-w-3xl text-start text-5xl font-extrabold leading-[1.05] text-brand sm:text-6xl"
          style={{ animationDelay: "80ms" }}
        >
          {branding.tagline[safe] ?? branding.tagline.en}
        </h1>

        <p
          className="animate-rise mt-5 max-w-xl text-start text-lg leading-relaxed text-muted"
          style={{ animationDelay: "160ms" }}
        >
          {branding.productName} — {t(safe, "auth.register")} · {t(safe, "nav.credentials")} ·{" "}
          {t(safe, "nav.cvs")}
        </p>

        <div
          className="animate-rise mt-9 flex flex-wrap items-center gap-3"
          style={{ animationDelay: "240ms" }}
        >
          <Link
            href={`/${safe}/register`}
            className="btn-primary inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white"
          >
            {t(safe, "auth.register")}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M5 12h14m-6-6 6 6-6 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="ltr:block rtl:hidden"
              />
              <path
                d="M19 12H5m6 6-6-6 6-6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="ltr:hidden rtl:block"
              />
            </svg>
          </Link>
          <Link
            href={`/${safe}/login`}
            className="inline-flex items-center rounded-xl border border-line bg-white/80 px-6 py-3 text-sm font-semibold text-brand backdrop-blur transition-colors hover:bg-brand-soft"
          >
            {t(safe, "auth.login")}
          </Link>
        </div>

        <div
          className="animate-rise mt-16 grid w-full gap-4 sm:grid-cols-3"
          style={{ animationDelay: "320ms" }}
        >
          {pillars.map(({ key }, i) => (
            <div
              key={key}
              className="surface-card rounded-2xl p-5"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft font-display text-sm font-bold text-brand-tint">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-4 text-base font-bold text-brand">
                {t(safe, `nav.${key}`)}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                {branding.tagline[safe] ?? branding.tagline.en}
              </p>
            </div>
          ))}
        </div>
      </main>

      <footer className="relative z-10 mx-auto max-w-5xl px-6 pb-10 text-xs text-muted">
        © {new Date().getFullYear()} {branding.legalName}
      </footer>
    </div>
  );
}
