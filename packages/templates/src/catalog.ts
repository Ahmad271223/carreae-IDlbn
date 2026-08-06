import type { TemplateConfig, TemplateKey } from "./types";

const SERIF = "'Source Serif 4', 'Noto Naskh Arabic', serif";
const SANS = "'Inter', 'Noto Naskh Arabic', sans-serif";

/** The 10-template catalog from brief §19 — configuration, not code. */
export const TEMPLATE_CATALOG: Record<TemplateKey, TemplateConfig> = {
  classic: {
    key: "classic",
    name: "Classic",
    columns: 1,
    photoSlot: "optional",
    atsSafe: true,
    primaryMarket: "international",
    accentColor: "#1e3a5f",
    typography: { headingFamily: SERIF, bodyFamily: SERIF, baseSizePt: 10.5 },
  },
  "classic-photo": {
    key: "classic-photo",
    name: "Classic Photo",
    columns: 1,
    photoSlot: "required",
    atsSafe: true,
    primaryMarket: "DE / FR / LB",
    accentColor: "#1e3a5f",
    typography: { headingFamily: SERIF, bodyFamily: SERIF, baseSizePt: 10.5 },
  },
  modern: {
    key: "modern",
    name: "Modern",
    columns: 1,
    photoSlot: "optional",
    atsSafe: true,
    primaryMarket: "international",
    accentColor: "#0f766e",
    typography: { headingFamily: SANS, bodyFamily: SANS, baseSizePt: 10 },
  },
  compact: {
    key: "compact",
    name: "Compact",
    columns: 1,
    photoSlot: "none",
    atsSafe: true,
    primaryMarket: "international",
    accentColor: "#374151",
    typography: { headingFamily: SANS, bodyFamily: SANS, baseSizePt: 9.5 },
  },
  academic: {
    key: "academic",
    name: "Academic",
    columns: 1,
    photoSlot: "none",
    atsSafe: true,
    primaryMarket: "university applications",
    accentColor: "#1f2937",
    typography: { headingFamily: SERIF, bodyFamily: SERIF, baseSizePt: 11 },
  },
  europass: {
    key: "europass",
    name: "Europass-Style",
    columns: 1,
    photoSlot: "optional",
    atsSafe: true,
    primaryMarket: "EU",
    accentColor: "#003399",
    typography: { headingFamily: SANS, bodyFamily: SANS, baseSizePt: 10 },
  },
  sidebar: {
    key: "sidebar",
    name: "Sidebar",
    columns: 2,
    photoSlot: "required",
    atsSafe: false,
    primaryMarket: "direct applications",
    accentColor: "#0e7490",
    typography: { headingFamily: SANS, bodyFamily: SANS, baseSizePt: 10 },
    sidebarSections: ["languages", "skills", "certificates"],
  },
  executive: {
    key: "executive",
    name: "Executive",
    columns: 2,
    photoSlot: "optional",
    atsSafe: false,
    primaryMarket: "senior positions",
    accentColor: "#111827",
    typography: { headingFamily: SERIF, bodyFamily: SANS, baseSizePt: 10.5 },
    sidebarSections: ["skills", "languages"],
  },
  creative: {
    key: "creative",
    name: "Creative",
    columns: 2,
    photoSlot: "required",
    atsSafe: false,
    primaryMarket: "design / portfolio",
    accentColor: "#7c3aed",
    typography: { headingFamily: SANS, bodyFamily: SANS, baseSizePt: 10 },
    sidebarSections: ["skills", "languages", "certificates"],
  },
  "arabic-native": {
    key: "arabic-native",
    name: "Arabic Native",
    columns: 1,
    photoSlot: "optional",
    atsSafe: true,
    primaryMarket: "LB / Gulf (RTL-optimized)",
    accentColor: "#166534",
    typography: {
      headingFamily: "'Noto Naskh Arabic', 'Source Serif 4', serif",
      bodyFamily: "'Noto Naskh Arabic', 'Source Serif 4', serif",
      baseSizePt: 11,
    },
  },
};

export const TEMPLATE_KEYS = Object.keys(TEMPLATE_CATALOG) as TemplateKey[];

export function getTemplate(key: string): TemplateConfig | null {
  return (TEMPLATE_CATALOG as Record<string, TemplateConfig>)[key] ?? null;
}
