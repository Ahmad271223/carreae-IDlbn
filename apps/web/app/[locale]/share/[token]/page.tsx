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

function ShieldMark({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-brand-tint">
      <span className="h-px w-6 bg-brand-tint/30" />
      {children}
    </h2>
  );
}

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

  return (
    <div className="relative min-h-screen">
      <div className="grain-overlay" />

      {/* Brand + provenance bar — signals this page is issued by the platform. */}
      <div className="relative z-10 border-b border-line bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-b from-brand-tint to-brand text-white shadow-[0_8px_20px_-8px_rgba(20,36,61,0.6)]">
              <ShieldMark />
            </span>
            <span className="font-display font-bold tracking-tight text-brand">
              {branding.productName}
            </span>
          </div>
          <VerifiedChip>{tr("viewer.applicationTitle")}</VerifiedChip>
        </div>
      </div>

      <main className="relative z-10 mx-auto max-w-3xl space-y-8 px-6 pb-20 pt-8">
        {/* Applicant hero */}
        <header className="surface-card animate-rise overflow-hidden rounded-3xl">
          <div className="h-20 bg-gradient-to-r from-brand via-brand-tint to-brand" />
          <div className="flex flex-wrap items-end gap-5 px-7 pb-7">
            <span className="-mt-10 flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-white bg-brand-soft font-display text-2xl font-extrabold text-brand shadow-lg">
              {initials || "•"}
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="text-3xl font-extrabold tracking-tight text-brand">
                {view.applicant.name}
              </h1>
              {view.applicant.headline && (
                <p className="mt-1 text-muted">{view.applicant.headline}</p>
              )}
            </div>
          </div>
        </header>

        {/* Trust banner — explains what verification means here. */}
        <div className="animate-rise flex items-start gap-3 rounded-2xl border border-verified/20 bg-verified/5 p-4">
          <span className="mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-verified/10 text-verified">
            <ShieldMark />
          </span>
          <p className="text-sm leading-relaxed text-ink/80">
            {tr("verification.trust") !== "verification.trust"
              ? tr("verification.trust")
              : `${branding.tagline[safe] ?? branding.tagline.en} — ${tr("viewer.credentials")}.`}
          </p>
        </div>

        {view.credentials.length > 0 && (
          <section className="animate-rise">
            <SectionHeading>{tr("viewer.credentials")}</SectionHeading>
            <ul className="space-y-3">
              {view.credentials.map((credential, index) => (
                <li
                  key={index}
                  className="surface-card rounded-2xl p-4 transition-transform hover:-translate-y-0.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-display text-base font-bold text-brand">
                      {String(credential.payload.title ?? credential.credentialType)}
                    </span>
                    <VerifiedChip>
                      {tr("verification.verifiedBy", { org: credential.issuer })}
                    </VerifiedChip>
                  </div>
                  <p className="mt-1.5 text-xs text-muted">
                    {tr("viewer.issuedBy")} {credential.issuer} · {credential.issuedAt}
                    {credential.status !== "ACTIVE" && (
                      <span className="ms-2 font-semibold text-red-700">
                        {credential.status}
                      </span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {Object.entries(view.sections).map(([key, entries]) =>
          entries && entries.length > 0 ? (
            <section key={key} className="animate-rise">
              <SectionHeading>{sectionTitles[key] ?? key}</SectionHeading>
              <ul className="space-y-3">
                {entries.map((entry, index) => (
                  <li key={index} className="surface-card rounded-2xl p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-ink">{entry.title}</span>
                      {/* §5: badge or silence — never a negative marker. */}
                      {entry.badge && (
                        <VerifiedChip>
                          {tr("verification.verifiedBy", { org: entry.badge.verifiedBy })} ·{" "}
                          {entry.badge.verifiedAt}
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
          ) : null,
        )}

        {view.coverLetters.map((letter, index) => (
          <section key={index} className="animate-rise">
            <SectionHeading>{letter.title}</SectionHeading>
            <div className="surface-card space-y-3 rounded-2xl p-6 text-sm leading-relaxed text-ink/80">
              {letter.paragraphs.map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
            </div>
          </section>
        ))}

        {view.documents.length > 0 && (
          <section className="animate-rise">
            <SectionHeading>{tr("viewer.documents")}</SectionHeading>
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

        <footer className="flex items-center justify-center gap-2 pt-4 text-xs text-muted">
          <ShieldMark className="text-brand-tint" />
          {branding.productName} · {branding.tagline[safe] ?? branding.tagline.en}
        </footer>
      </main>
    </div>
  );
}
