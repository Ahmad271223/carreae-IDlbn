"use client";
import { useParams } from "next/navigation";
import { SUPPORTED_LOCALES, t, type Locale } from "@careerid/i18n";

export function useT() {
  const params = useParams<{ locale?: string }>();
  const locale: Locale = (SUPPORTED_LOCALES as readonly string[]).includes(
    params.locale ?? "",
  )
    ? (params.locale as Locale)
    : "en";
  return {
    locale,
    t: (key: string, values?: Record<string, string>) => t(locale, key, values),
  };
}
