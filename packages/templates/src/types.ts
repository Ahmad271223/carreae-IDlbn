/**
 * CV template model (brief §18–§21): 10 templates are 10 CONFIGURATIONS of
 * one rendering engine — never 10 codebases. Every template must work in
 * Arabic (RTL), English and French, with and without photo, at any content
 * volume; that constraint lives in the engine, not in each template.
 */

export type TemplateKey =
  | "classic"
  | "classic-photo"
  | "modern"
  | "compact"
  | "academic"
  | "europass"
  | "sidebar"
  | "executive"
  | "creative"
  | "arabic-native";

export type CvSectionType =
  | "profile"
  | "experience"
  | "education"
  | "languages"
  | "skills"
  | "certificates"
  | "references";

export interface TemplateTypography {
  /** Font stacks only — actual font embedding happens in the PDF pipeline. */
  headingFamily: string;
  bodyFamily: string;
  baseSizePt: number;
}

export interface TemplateConfig {
  key: TemplateKey;
  /** Display name (proper noun — not translated). */
  name: string;
  columns: 1 | 2;
  photoSlot: "required" | "optional" | "none";
  /** §19: templates that automated systems cannot reliably parse are labeled
   * honestly in the UI (i18n key cv.atsUnsafe.label), never hidden. */
  atsSafe: boolean;
  primaryMarket: string;
  accentColor: string;
  typography: TemplateTypography;
  /** Two-column templates: which sections render in the side column. */
  sidebarSections?: CvSectionType[];
}

export interface CvEntry {
  id: string;
  title: string;
  subtitle?: string;
  dateRange?: string;
  description?: string;
  bullets?: string[];
  /**
   * Organization name when the underlying record is ISSUER_VERIFIED. Only
   * verified entries get a positive marker; unverified entries get NO marker
   * at all — absence, not a warning (§5 rule 2).
   */
  verifiedBy?: string;
}

export interface CvSection {
  type: CvSectionType;
  /** Localized by the caller — the engine never hardcodes copy (§53). */
  title: string;
  entries: CvEntry[];
  visible: boolean;
}

export interface CvDocument {
  locale: "ar" | "en" | "fr";
  fullName: string;
  headline?: string;
  contact: { email?: string; phone?: string; location?: string };
  /** Per-CV decision (§20), never per-user. */
  photoEnabled: boolean;
  /** Must be an embedded data URI — external URLs are ignored (§20). */
  photoDataUri?: string;
  summary?: string;
  /** In display order; hidden sections stay in the array with visible=false. */
  sections: CvSection[];
  /** Localized label templates supplied by the caller, e.g.
   * verifiedBy: "Verified by {org}". */
  labels: { verifiedBy: string };
}
