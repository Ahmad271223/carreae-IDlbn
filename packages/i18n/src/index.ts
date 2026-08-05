/**
 * @careerid/i18n — locale catalogs (ar/en/fr) and RTL utilities.
 *
 * All user-facing strings live in the JSON catalogs; components never hardcode
 * copy (brief §53). Arabic requires full RTL — layout code must use logical CSS
 * properties; this package only answers the direction question.
 */
import ar from "./catalogs/ar.json";
import en from "./catalogs/en.json";
import fr from "./catalogs/fr.json";

export const SUPPORTED_LOCALES = ["ar", "en", "fr"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const catalogs: Record<Locale, Record<string, string>> = { ar, en, fr };

const RTL_LOCALES: ReadonlySet<string> = new Set(["ar"]);

export function isRtl(locale: string): boolean {
  return RTL_LOCALES.has(locale);
}

export function direction(locale: string): "rtl" | "ltr" {
  return isRtl(locale) ? "rtl" : "ltr";
}

/** Minimal message lookup with {placeholder} interpolation; falls back to English. */
export function t(
  locale: Locale,
  key: string,
  params?: Record<string, string>,
): string {
  const message = catalogs[locale][key] ?? catalogs.en[key] ?? key;
  if (!params) return message;
  return message.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? params[name]! : match,
  );
}
