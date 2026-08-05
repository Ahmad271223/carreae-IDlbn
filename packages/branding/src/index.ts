/**
 * The single source of truth for product branding.
 *
 * "Career ID" is a working title. Nothing outside this package may hardcode the
 * product name, domain, or brand assets — components, emails, PDF metadata and
 * share URLs must all read from here so the brand can be swapped in one place.
 */
export interface BrandingConfig {
  /** Product display name, e.g. shown in headers, emails, PDF metadata. */
  productName: string;
  /** Short name for tight UI spots (badges, app icon label). */
  shortName: string;
  /** Legal entity name used in footers and policies. */
  legalName: string;
  /** Canonical web origin, no trailing slash. */
  baseUrl: string;
  /** Path prefix for public share links: `${baseUrl}${sharePath}/<token>`. */
  sharePath: string;
  /** Default sender for transactional email. */
  emailFrom: string;
  /** Localized product taglines keyed by ISO 639-1 code. */
  tagline: Record<string, string>;
}

export const branding: BrandingConfig = {
  productName: "Career ID",
  shortName: "Career ID",
  legalName: "Career ID (working title)",
  baseUrl: process.env.APP_BASE_URL ?? "http://localhost:3000",
  sharePath: "/share",
  emailFrom: process.env.MAIL_FROM ?? "noreply@localhost",
  tagline: {
    en: "Verify once. Use everywhere.",
    ar: "وثّق مرة واحدة. استخدمه في كل مكان.",
    fr: "Vérifiez une fois. Utilisez partout.",
  },
};
