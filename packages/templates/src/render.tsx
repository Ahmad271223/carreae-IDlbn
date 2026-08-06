import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CvDocument, CvEntry, CvSection, TemplateConfig } from "./types";

/**
 * The single rendering engine (§18). Semantic HTML with a real text flow —
 * the same component tree drives the on-screen preview and the server-side
 * PDF renderer, which kills the whole "preview ≠ PDF" bug class. Layout uses
 * logical CSS properties exclusively, so RTL needs no per-direction styles.
 */

function direction(locale: CvDocument["locale"]): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}

function interpolate(template: string, params: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? params[name]! : match,
  );
}

function usablePhoto(doc: CvDocument, template: TemplateConfig): string | null {
  if (template.photoSlot === "none") return null;
  if (!doc.photoEnabled) return null;
  // §20: photos are embedded, never referenced externally.
  if (!doc.photoDataUri?.startsWith("data:image/")) return null;
  return doc.photoDataUri;
}

function EntryView({ entry, doc }: { entry: CvEntry; doc: CvDocument }) {
  return (
    <article className="cv-entry">
      <header className="cv-entry-head">
        <span className="cv-entry-title">{entry.title}</span>
        {entry.dateRange ? (
          <span className="cv-entry-dates">{entry.dateRange}</span>
        ) : null}
      </header>
      {entry.subtitle ? <p className="cv-entry-subtitle">{entry.subtitle}</p> : null}
      {entry.verifiedBy ? (
        // Positive marker for verified entries only; unverified entries get
        // no marker of any kind (§5 rule 2).
        <p className="cv-badge-verified">
          ✓ {interpolate(doc.labels.verifiedBy, { org: entry.verifiedBy })}
        </p>
      ) : null}
      {entry.description ? (
        <p className="cv-entry-description">{entry.description}</p>
      ) : null}
      {entry.bullets?.length ? (
        <ul className="cv-entry-bullets">
          {entry.bullets.map((bullet, index) => (
            <li key={index}>{bullet}</li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

function SectionView({ section, doc }: { section: CvSection; doc: CvDocument }) {
  if (!section.visible || section.entries.length === 0) return null;
  return (
    <section className="cv-section" data-section={section.type}>
      <h2 className="cv-section-title">{section.title}</h2>
      {section.entries.map((entry) => (
        <EntryView key={entry.id} entry={entry} doc={doc} />
      ))}
    </section>
  );
}

export function CvView({
  doc,
  template,
}: {
  doc: CvDocument;
  template: TemplateConfig;
}): ReactElement {
  const photo = usablePhoto(doc, template);
  const sidebarTypes = new Set(template.sidebarSections ?? []);
  const mainSections =
    template.columns === 2
      ? doc.sections.filter((s) => !sidebarTypes.has(s.type))
      : doc.sections;
  const sideSections =
    template.columns === 2 ? doc.sections.filter((s) => sidebarTypes.has(s.type)) : [];

  return (
    <div
      className={`cv-root cv-template-${template.key} cv-columns-${template.columns}`}
      dir={direction(doc.locale)}
      lang={doc.locale}
    >
      <header className="cv-header">
        {photo ? (
          <img className="cv-photo" src={photo} alt="" />
        ) : null}
        <div className="cv-identity">
          <h1 className="cv-name">{doc.fullName}</h1>
          {doc.headline ? <p className="cv-headline">{doc.headline}</p> : null}
          <p className="cv-contact">
            {[doc.contact.email, doc.contact.phone, doc.contact.location]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </header>
      {doc.summary ? <p className="cv-summary">{doc.summary}</p> : null}
      <div className="cv-body">
        <main className="cv-main">
          {mainSections.map((section) => (
            <SectionView key={section.type} section={section} doc={doc} />
          ))}
        </main>
        {sideSections.length > 0 ? (
          <aside className="cv-aside">
            {sideSections.map((section) => (
              <SectionView key={section.type} section={section} doc={doc} />
            ))}
          </aside>
        ) : null}
      </div>
    </div>
  );
}

/** Deterministic per-template stylesheet — config in, CSS out. */
export function buildCss(template: TemplateConfig): string {
  const { accentColor, typography } = template;
  return `
:root { color-scheme: light; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #ffffff; }
.cv-root {
  font-family: ${typography.bodyFamily};
  font-size: ${typography.baseSizePt}pt;
  color: #1f2937;
  line-height: 1.45;
  max-inline-size: 190mm;
  margin-inline: auto;
  padding: 14mm 12mm;
}
.cv-header { display: flex; gap: 8mm; align-items: flex-start; }
.cv-photo {
  inline-size: 30mm; block-size: 38mm; object-fit: cover;
  border-radius: 2mm; flex: none;
}
.cv-name {
  font-family: ${typography.headingFamily};
  font-size: ${typography.baseSizePt * 2.1}pt;
  color: ${accentColor};
}
.cv-headline { font-size: ${typography.baseSizePt * 1.15}pt; margin-block-start: 1mm; }
.cv-contact { color: #4b5563; margin-block-start: 1.5mm; }
.cv-summary { margin-block-start: 5mm; }
.cv-body { margin-block-start: 6mm; }
.cv-columns-2 .cv-body {
  display: grid; grid-template-columns: 1fr 62mm; gap: 8mm;
}
.cv-aside {
  border-inline-start: 0.6mm solid ${accentColor};
  padding-inline-start: 5mm;
}
.cv-section { margin-block-end: 5mm; break-inside: avoid-column; }
.cv-section-title {
  font-family: ${typography.headingFamily};
  font-size: ${typography.baseSizePt * 1.2}pt;
  color: ${accentColor};
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-block-end: 0.4mm solid ${accentColor};
  padding-block-end: 1mm;
  margin-block-end: 2.5mm;
}
.cv-entry { margin-block-end: 3.5mm; break-inside: avoid; }
.cv-entry-head { display: flex; justify-content: space-between; gap: 4mm; }
.cv-entry-title { font-weight: 600; }
.cv-entry-dates { color: #6b7280; white-space: nowrap; }
.cv-entry-subtitle { color: #374151; }
.cv-badge-verified { color: ${accentColor}; font-size: ${typography.baseSizePt * 0.85}pt; }
.cv-entry-description { margin-block-start: 1mm; }
.cv-entry-bullets { margin-block-start: 1mm; padding-inline-start: 5mm; }
@page { size: A4; margin: 0; }
`.trim();
}

/**
 * Full standalone HTML document — consumed by the web preview iframe and by
 * the headless-Chromium PDF job (3.4). Metadata carries title and language
 * only; never tokens or internal ids (§25).
 */
export function renderCvHtml(doc: CvDocument, template: TemplateConfig): string {
  const markup = renderToStaticMarkup(<CvView doc={doc} template={template} />);
  return [
    "<!doctype html>",
    `<html lang="${doc.locale}" dir="${direction(doc.locale)}">`,
    `<head><meta charset="utf-8"/><title>${escapeHtml(doc.fullName)}</title>`,
    `<style>${buildCss(template)}</style></head>`,
    `<body>${markup}</body></html>`,
  ].join("");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
