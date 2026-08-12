"use client";
import { useCallback } from "react";
import { api } from "../lib/api";
import { useT } from "../lib/i18n-client";
import { EntityPicker, countryLabel, type PickerOption } from "./entity-picker";

/**
 * Institution picker over the bundled catalogue (~1.5k entries, world list
 * plus full Lebanese coverage), lazily imported on first open.
 */
export function UniversityPicker({
  value,
  onChange,
  onCountryChange,
  placeholder,
}: {
  value: string;
  onChange: (name: string) => void;
  /** Fired when a catalogued institution is picked, so the form can prefill it. */
  onCountryChange?: (country: string) => void;
  placeholder?: string;
}) {
  const { t } = useT();

  const load = useCallback(async (): Promise<PickerOption[]> => {
    const { UNIVERSITIES } = await import("../lib/universities");
    return UNIVERSITIES.map(([name, country]) => ({ name, tag: country }));
  }, []);

  return (
    <EntityPicker
      value={value}
      onChange={onChange}
      onPick={(option) => option.tag && onCountryChange?.(option.tag)}
      load={load}
      placeholder={placeholder ?? t("uni.choose")}
      searchPlaceholder={t("uni.search")}
      allTagsLabel={t("uni.allCountries")}
      tagLabel={countryLabel}
      emptyLabel={t("uni.noMatch")}
    />
  );
}

/**
 * Employer picker. Suggestions are the VERIFIED employer organizations on
 * the platform — picking one of those is what later makes a verification
 * request possible. Every other employer is plain typed text.
 */
export function EmployerPicker({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (name: string) => void;
  placeholder?: string;
}) {
  const { t } = useT();

  const load = useCallback(async (): Promise<PickerOption[]> => {
    const rows = await api<Array<{ id: string; name: string }>>("/employers").catch(
      () => [],
    );
    return rows.map((row) => ({ name: row.name }));
  }, []);

  return (
    <EntityPicker
      value={value}
      onChange={onChange}
      load={load}
      placeholder={placeholder ?? t("employer.choose")}
      searchPlaceholder={t("employer.search")}
      emptyLabel={t("employer.noMatch")}
    />
  );
}
