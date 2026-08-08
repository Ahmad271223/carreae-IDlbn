"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../lib/i18n-client";
import type { UniversityTuple } from "../lib/universities";

/**
 * Institution picker: click to open, type to search, filter by country, pick
 * from an alphabetical list. The dataset is a convenience only — the field
 * stays free text so an institution that is not listed is never a dead end
 * (§ the platform must not gate a career entry on our own catalogue).
 *
 * The ~1.5k-row dataset is imported lazily on first open so it never lands
 * in the initial bundle.
 */
export function UniversityPicker({
  value,
  onChange,
  onCountryChange,
  placeholder,
}: {
  value: string;
  onChange: (name: string) => void;
  /** Fired when a listed institution is picked, so the form can prefill it. */
  onCountryChange?: (country: string) => void;
  placeholder?: string;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("");
  const [rows, setRows] = useState<readonly UniversityTuple[] | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // Lazy-load the catalogue the first time the picker is opened.
  useEffect(() => {
    if (!open || rows) return;
    let cancelled = false;
    void import("../lib/universities").then((module) => {
      if (!cancelled) setRows(module.UNIVERSITIES);
    });
    return () => {
      cancelled = true;
    };
  }, [open, rows]);

  // Click-outside closes the dropdown.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const countries = useMemo(() => {
    if (!rows) return [];
    return Array.from(new Set(rows.map(([, c]) => c))).sort();
  }, [rows]);

  const results = useMemo(() => {
    if (!rows) return [];
    const needle = query.trim().toLowerCase();
    return rows
      .filter(([name, c]) => {
        if (country && c !== country) return false;
        return !needle || name.toLowerCase().includes(needle);
      })
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(0, 200);
  }, [rows, query, country]);

  function pick(name: string, pickedCountry: string) {
    onChange(name);
    onCountryChange?.(pickedCountry);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-line bg-white px-3.5 py-2.5 text-start text-sm shadow-sm transition-colors hover:border-brand-tint/50 focus:border-brand-tint focus:outline-none"
      >
        <span className={value ? "truncate text-ink" : "truncate text-muted"}>
          {value || placeholder || t("uni.choose")}
        </span>
        <svg
          className="flex-none text-muted"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-line bg-white shadow-xl">
          <div className="space-y-2 border-b border-line p-3">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("uni.search")}
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-brand-tint focus:outline-none"
            />
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-brand-tint focus:outline-none"
            >
              <option value="">{t("uni.allCountries")}</option>
              {countries.map((c) => (
                <option key={c} value={c}>
                  {countryLabel(c)}
                </option>
              ))}
            </select>
          </div>

          <ul className="max-h-64 overflow-y-auto py-1">
            {!rows && (
              <li className="px-3 py-2 text-sm text-muted">{t("common.loading")}</li>
            )}
            {rows && results.length === 0 && (
              <li className="px-3 py-2 text-sm text-muted">{t("uni.noMatch")}</li>
            )}
            {results.map(([name, c]) => (
              <li key={`${name}|${c}`}>
                <button
                  type="button"
                  onClick={() => pick(name, c)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-start text-sm transition-colors hover:bg-brand-soft"
                >
                  <span className="truncate text-ink">{name}</span>
                  <span className="flex-none rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand-tint">
                    {c}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {/* Free text stays possible: not every institution is catalogued. */}
          {query.trim() && (
            <button
              type="button"
              onClick={() => pick(query.trim(), country)}
              className="w-full border-t border-line px-3 py-2 text-start text-sm text-brand transition-colors hover:bg-brand-soft"
            >
              {t("uni.useTyped", { name: query.trim() })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Region names where the browser supports it; the ISO code otherwise. */
function countryLabel(code: string): string {
  try {
    const display = new Intl.DisplayNames(undefined, { type: "region" });
    return `${display.of(code) ?? code} (${code})`;
  } catch {
    return code;
  }
}
