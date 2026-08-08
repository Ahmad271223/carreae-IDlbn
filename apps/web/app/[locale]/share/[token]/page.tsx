import Link from "next/link";
import { SUPPORTED_LOCALES, t, type Locale } from "@careerid/i18n";
import { branding } from "@careerid/branding";
import { DocumentLink } from "./document-link";

/**
 * Account-less viewer (§7.5/3.8): server-rendered from the share API. The
 * §5 rules are visual law here — a verified fact carries the positive badge,
 * an unverified fact carries NOTHING (neutral, never a warning).
 */
interface ViewerEntry {
  title: string;
  subtitle?: string;
  dateRange?: string;
  description?: string;
  badge?: { verifiedBy: string; verifiedAt: string };
}
interface ViewerPayload {
  applicant: { name: string; headline?: string };
  meta?: {
    applicationTitle: string;
    sharedAt: string;
    expiresAt: string | null;
    viewCount: number;
  };
  sections: Partial<Record<string, ViewerEntry[]>>;
  credentials: Array<{
    credentialType: string;
    issuer: string;
    issuedAt: string;
    status: string;
    payload: Record<string, unknown>;
  }>;
  documents: Array<{
    id: string;
    fileName: string;
    category: string;
    downloadable: boolean;
  }>;
  coverLetters: Array<{ title: string; paragraphs: string[] }>;
}

const SERVER_API_BASE =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:3001";

function ShieldMark({ className = "", size = 20 }: { className?: string; size?: number }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2 4 5v6c0 5 3.4 8.3 8 11 4.6-2.7 8-6 8-11V5l-8-3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function VerifiedChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-verified/10 px-2.5 py-1 text-xs font-semibold text-verified ring-1 ring-inset ring-verified/20">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {children}
    </span>
  );
}

const NAV_ICONS: Record<string, React.ReactNode> = {
  overview: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1V10Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  ),
  education: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m12 4 10 5-10 5L2 9l10-5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  ),
  experience: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="7" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  ),
  languages: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9S14.5 18.5 12 21c-2.5-2.5-3.5-5.5-3.5-9S9.5 5.5 12 3Z" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  ),
  skills: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m8 6-5 6 5 6M16 6l5 6-5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  credentials: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="9" r="5" stroke="currentColor" strokeWidth="1.7" />
      <path d="m8.5 13-1.5 8 5-3 5 3-1.5-8" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  ),
  documents: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  ),
  letters: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="m4 7 8 6 8-6" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  ),
};

export default async function ShareViewerPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  const safe: Locale = (SUPPORTED_LOCALES as readonly string[]).includes(locale)
    ? (locale as Locale)
    : "en";
  const tr = (key: string, values?: Record<string, string>) => t(safe, key, values);

  const response = await fetch(`${SERVER_API_BASE}/api/v1/share/${token}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-8 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-b from-brand-tint to-brand text-white">
          <ShieldMark />
        </span>
        <h1 className="font-display text-xl font-bold text-brand">
          {branding.productName}
        </h1>
        <p className="text-sm text-muted">{tr("auth.verifyFailed")}</p>
      </main>
    );
  }
  const view = (await response.json()) as ViewerPayload;

  const sectionTitles: Record<string, string> = {
    experience: tr("cv.section.experience"),
    education: tr("cv.section.education"),
    languages: tr("cv.section.languages"),
    skills: tr("cv.section.skills"),
  };

  const initials = view.applicant.name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  const sectionEntries = Object.entries(view.sections).filter(
    (pair): pair is [string, ViewerEntry[]] => !!pair[1] && pair[1].length > 0,
  );

  const navItems: Array<{ id: string; icon: string; label: string; count?: number }> = [
    { id: "overview", icon: "overview", label: tr("viewer.overview") },
    ...sectionEntries.map(([key, entries]) => ({
      id: key,
      icon: key,
      label: sectionTitles[key] ?? key,
      count: entries.length,
    })),
    ...(view.credentials.length
      ? [{ id: "credentials", icon: "credentials", label: tr("viewer.credentials"), count: view.credentials.length }]
      : []),
    ...(view.coverLetters.length
      ? [{ id: "letters", icon: "letters", label: tr("viewer.letters"), count: view.coverLetters.length }]
      : []),
    ...(view.documents.length
      ? [{ id: "documents", icon: "documents", label: tr("viewer.documents"), count: view.documents.length }]
      : []),
  ];

  const verifiedCount =
    sectionEntries.reduce(
      (sum, [, entries]) => sum + entries.filter((e) => e.badge).length,
      0,
    ) + view.credentials.length;

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
      {/* ── Dark provenance sidebar ─────────────────────────────────── */}
      <aside className="flex flex-col bg-gradient-to-b from-brand to-[#0d1830] text-white lg:sticky lg:top-0 lg:h-screen">
        <div className="flex items-center gap-2.5 border-b border-white/10 px-6 py-5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 ring-1 ring-inset ring-white/20">
            <ShieldMark />
          </span>
          <span className="font-display text-lg font-bold tracking-tight">
            {branding.productName}
          </span>
        </div>

        <div className="border-b border-white/10 px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-verified/20 text-verified ring-1 ring-inset ring-verified/30">
              <ShieldMark />
            </span>
            <p className="font-display text-base font-bold leading-tight">
              {tr("viewer.verifiedApplication")}
            </p>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-white/60">
            {tr("viewer.sharedByOn", {
              name: view.applicant.name,
              date: view.meta?.sharedAt ?? "",
            })}
          </p>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
          {navItems.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <span className="text-white/50">{NAV_ICONS[item.icon]}</span>
              <span className="flex-1">{item.label}</span>
              {item.count !== undefined && (
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/60">
                  {item.count}
                </span>
              )}
            </a>
          ))}
        </nav>

        <div className="m-4 rounded-2xl bg-white/5 p-4 ring-1 ring-inset ring-white/10">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.7" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.7" />
            </svg>
            {tr("viewer.secureAccess")}
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-white/55">
            {tr("viewer.secureAccessBody")}
          </p>
        </div>
      </aside>

      {/* ── Content column ──────────────────────────────────────────── */}
      <div className="relative">
        <div className="grain-overlay" />

        {/* Top bar: application title + locale switch */}
        <div className="relative z-10 border-b border-line bg-white/80 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-4">
            <p className="text-sm text-muted">
              {tr("viewer.applicationFor")}{" "}
              <span className="font-display text-base font-bold text-brand">
                {view.meta?.applicationTitle ?? tr("viewer.applicationTitle")}
              </span>
            </p>
            <div className="flex items-center gap-1 text-xs">
              {(SUPPORTED_LOCALES as readonly string[]).map((l) => (
                <Link
                  key={l}
                  href={`/${l}/share/${token}`}
                  className={`rounded-lg px-2.5 py-1.5 uppercase transition-colors ${
                    l === safe
                      ? "bg-brand font-bold text-white"
                      : "text-muted hover:bg-brand-soft hover:text-brand"
                  }`}
                >
                  {l}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="relative z-10 mx-auto grid max-w-6xl gap-8 px-6 pb-16 pt-8 xl:grid-cols-[minmax(0,1fr)_300px]">
          <main className="min-w-0 space-y-8">
            {/* Applicant hero */}
            <header id="overview" className="surface-card animate-rise scroll-mt-6 overflow-hidden rounded-3xl">
              <div className="h-24 bg-gradient-to-r from-brand via-brand-tint to-verified/70" />
              <div className="px-7 pb-6">
                <div className="flex flex-wrap items-end gap-5">
                  <span className="-mt-10 flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-white bg-brand-soft font-display text-2xl font-extrabold text-brand shadow-lg">
                    {initials || "•"}
                  </span>
                  <div className="min-w-0 flex-1 pb-1">
                    <h1 className="text-3xl font-extrabold tracking-tight text-brand">
                      {view.applicant.name}
                    </h1>
                    {view.applicant.headline && (
                      <p className="mt-0.5 text-muted">{view.applicant.headline}</p>
                    )}
                  </div>
                  {verifiedCount > 0 && (
                    <div className="pb-1">
                      <VerifiedChip>
                        {tr("viewer.verifiedCount", { count: String(verifiedCount) })}
                      </VerifiedChip>
                    </div>
                  )}
                </div>

                {/* Provenance strip */}
                {view.meta && (
                  <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-line sm:grid-cols-4">
                    {[
                      [tr("viewer.meta.package"), view.meta.applicationTitle],
                      [tr("viewer.meta.shared"), view.meta.sharedAt],
                      [
                        tr("viewer.meta.expires"),
                        view.meta.expiresAt ?? tr("viewer.meta.noExpiry"),
                      ],
                      [tr("viewer.meta.views"), String(view.meta.viewCount)],
                    ].map(([label, value]) => (
                      <div key={label} className="bg-white px-4 py-3">
                        <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                          {label}
                        </dt>
                        <dd className="mt-0.5 truncate text-sm font-semibold text-ink">
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            </header>

            {/* Trust banner */}
            <div className="animate-rise flex items-start gap-3 rounded-2xl border border-verified/20 bg-verified/5 p-4">
              <span className="mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-verified/10 text-verified">
                <ShieldMark />
              </span>
              <div className="text-sm leading-relaxed text-ink/80">
                <p className="font-semibold text-verified">{tr("viewer.verifiedInfoTitle")}</p>
                <p>{tr("viewer.verifiedInfo")}</p>
              </div>
            </div>

            {sectionEntries.map(([key, entries]) => (
              <section key={key} id={key} className="animate-rise scroll-mt-6">
                <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-brand-tint">
                  <span className="text-brand-tint/70">{NAV_ICONS[key]}</span>
                  {sectionTitles[key] ?? key}
                </h2>
                <ul className="space-y-3">
                  {entries.map((entry, index) => (
                    <li key={index} className="surface-card rounded-2xl p-5 transition-transform hover:-translate-y-0.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-ink">{entry.title}</span>
                        {/* §5: badge or silence — never a negative marker. */}
                        {entry.badge && (
                          <VerifiedChip>
                            {tr("verification.verifiedBy", { org: entry.badge.verifiedBy })}
                          </VerifiedChip>
                        )}
                      </div>
                      {(entry.subtitle || entry.dateRange) && (
                        <p className="mt-1 text-sm text-muted">
                          {[entry.subtitle, entry.dateRange].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      {entry.description && (
                        <p className="mt-2 text-sm leading-relaxed text-ink/70">
                          {entry.description}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}

            {view.credentials.length > 0 && (
              <section id="credentials" className="animate-rise scroll-mt-6">
                <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-brand-tint">
                  <span className="text-brand-tint/70">{NAV_ICONS.credentials}</span>
                  {tr("viewer.credentials")}
                </h2>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {view.credentials.map((credential, index) => (
                    <li key={index} className="surface-card rounded-2xl p-5 transition-transform hover:-translate-y-0.5">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-display text-base font-bold leading-snug text-brand">
                          {String(
                            credential.payload.degree ??
                              credential.payload.course ??
                              credential.payload.position ??
                              credential.payload.exam ??
                              tr(`credentials.type.${credential.credentialType}`),
                          )}
                        </span>
                        {credential.status === "ACTIVE" ? (
                          <VerifiedChip>{tr("credentials.status.ACTIVE")}</VerifiedChip>
                        ) : (
                          <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-100">
                            {credential.status}
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 text-xs text-muted">
                        {tr("viewer.issuedBy")} <span className="font-medium text-ink/80">{credential.issuer}</span>
                        <span className="mx-1">·</span>
                        {credential.issuedAt}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {view.coverLetters.length > 0 && (
              <section id="letters" className="animate-rise scroll-mt-6 space-y-4">
                {view.coverLetters.map((letter, index) => (
                  <div key={index}>
                    <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-brand-tint">
                      <span className="text-brand-tint/70">{NAV_ICONS.letters}</span>
                      {letter.title}
                    </h2>
                    <div className="surface-card space-y-3 rounded-2xl p-6 text-sm leading-relaxed text-ink/80">
                      {letter.paragraphs.map((paragraph, i) => (
                        <p key={i} className="whitespace-pre-wrap">{paragraph}</p>
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            )}

            {view.documents.length > 0 && (
              <section id="documents" className="animate-rise scroll-mt-6">
                <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-brand-tint">
                  <span className="text-brand-tint/70">{NAV_ICONS.documents}</span>
                  {tr("viewer.documents")}
                </h2>
                <ul className="space-y-2">
                  {view.documents.map((document) => (
                    <li
                      key={document.id}
                      className="surface-card flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm"
                    >
                      <span className="flex items-center gap-2.5 truncate">
                        <svg className="flex-none text-brand-tint" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                          <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                        </svg>
                        <span className="truncate font-medium text-ink">{document.fileName}</span>
                        <span className="flex-none text-xs text-muted">{document.category}</span>
                      </span>
                      {document.downloadable && (
                        <DocumentLink
                          token={token}
                          documentId={document.id}
                          label={tr("viewer.download")}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-5 text-xs text-muted">
              <span>
                © {new Date().getFullYear()} {branding.productName}
              </span>
              <span className="flex items-center gap-1.5">
                <ShieldMark size={13} className="text-verified" />
                {tr("viewer.footerTrust")}
              </span>
            </footer>
          </main>

          {/* ── Right rail ─────────────────────────────────────────── */}
          <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start">
            <div className="surface-card animate-rise rounded-2xl p-5">
              <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-brand-tint">
                {tr("viewer.contents")}
              </h3>
              <ul className="mt-3 space-y-1">
                {navItems
                  .filter((item) => item.id !== "overview")
                  .map((item) => (
                    <li key={item.id}>
                      <a
                        href={`#${item.id}`}
                        className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm text-ink/80 transition-colors hover:bg-brand-soft hover:text-brand"
                      >
                        <span className="flex items-center gap-2">
                          <span className="text-brand-tint/70">{NAV_ICONS[item.icon]}</span>
                          {item.label}
                        </span>
                        <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand-tint">
                          {item.count}
                        </span>
                      </a>
                    </li>
                  ))}
              </ul>
            </div>

            <div className="animate-rise rounded-2xl border border-brand-tint/20 bg-brand-soft/60 p-5">
              <h3 className="font-display text-sm font-bold text-brand">
                {tr("viewer.aboutTitle")}
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-ink/70">
                {tr("viewer.aboutBody", {
                  name: view.applicant.name,
                  product: branding.productName,
                })}
              </p>
            </div>

            <div className="animate-rise rounded-2xl border border-verified/20 bg-verified/5 p-5">
              <h3 className="font-display text-sm font-bold text-verified">
                {tr("viewer.verifyTitle")}
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-ink/70">
                {tr("viewer.verifyBody")}
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
