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
      <main className="mx-auto max-w-2xl p-8">
        <h1 className="text-xl font-semibold text-gray-700">
          {branding.productName}
        </h1>
        <p className="mt-4 text-sm text-gray-600">{tr("auth.verifyFailed")}</p>
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

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <header className="border-b border-gray-200 pb-4">
        <p className="text-xs uppercase tracking-wide text-gray-400">
          {branding.productName} · {tr("viewer.applicationTitle")}
        </p>
        <h1 className="mt-1 text-3xl font-bold text-brand">{view.applicant.name}</h1>
        {view.applicant.headline && (
          <p className="mt-1 text-gray-600">{view.applicant.headline}</p>
        )}
      </header>

      {view.credentials.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-brand">
            {tr("viewer.credentials")}
          </h2>
          <ul className="space-y-2">
            {view.credentials.map((credential, index) => (
              <li
                key={index}
                className="rounded-lg border border-gray-200 bg-white p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {String(credential.payload.title ?? credential.credentialType)}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-verified/10 px-2 py-0.5 text-xs font-medium text-verified">
                    ✓ {tr("verification.verifiedBy", { org: credential.issuer })}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-500">
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
          <section key={key}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-brand">
              {sectionTitles[key] ?? key}
            </h2>
            <ul className="space-y-2">
              {entries.map((entry, index) => (
                <li
                  key={index}
                  className="rounded-lg border border-gray-200 bg-white p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{entry.title}</span>
                    {/* §5: badge or silence — never a negative marker. */}
                    {entry.badge && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-verified/10 px-2 py-0.5 text-xs font-medium text-verified">
                        ✓{" "}
                        {tr("verification.verifiedBy", {
                          org: entry.badge.verifiedBy,
                        })}{" "}
                        · {entry.badge.verifiedAt}
                      </span>
                    )}
                  </div>
                  {(entry.subtitle || entry.dateRange) && (
                    <p className="mt-1 text-sm text-gray-600">
                      {[entry.subtitle, entry.dateRange].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  {entry.description && (
                    <p className="mt-1 text-sm text-gray-500">{entry.description}</p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ) : null,
      )}

      {view.coverLetters.map((letter, index) => (
        <section key={index}>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-brand">
            {letter.title}
          </h2>
          <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-4 text-sm leading-relaxed">
            {letter.paragraphs.map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
          </div>
        </section>
      ))}

      {view.documents.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-brand">
            {tr("viewer.documents")}
          </h2>
          <ul className="space-y-1">
            {view.documents.map((document) => (
              <li
                key={document.id}
                className="flex items-center justify-between gap-2 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm"
              >
                <span>
                  {document.fileName}
                  <span className="ms-2 text-xs text-gray-400">
                    {document.category}
                  </span>
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
    </main>
  );
}
