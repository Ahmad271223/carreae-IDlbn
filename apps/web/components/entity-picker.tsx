"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../lib/i18n-client";

export interface PickerOption {
  /** Shown as the row label and written into the field when picked. */
  name: string;
  /** Optional grouping key — rendered as a chip and drives the filter. */
  tag?: string;
}

/**
 * Shared dropdown for "pick a known entity, or type your own": click to
 * open, type to search, optionally filter by tag, choose from an
 * alphabetical list. Whatever is typed can always be used verbatim — our
 * catalogue must never be the reason a career entry cannot be recorded.
 */
export function EntityPicker({
  value,
  onChange,
  onPick,
  load,
  placeholder,
  searchPlaceholder,
  allTagsLabel,
  tagLabel = (tag) => tag,
  emptyLabel,
}: {
  value: string;
  onChange: (name: string) => void;
  /** Fired only when a catalogued option is chosen (not on free text). */
  onPick?: (option: PickerOption) => void;
  /** Called once on first open — lazy so big catalogues stay out of the bundle. */
  load: () => Promise<readonly PickerOption[]>;
  placeholder?: string;
  searchPlaceholder?: string;
  allTagsLabel?: string;
  tagLabel?: (tag: string) => string;
  emptyLabel?: string;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const [options, setOptions] = useState<readonly PickerOption[] | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || options) return;
    let cancelled = false;
    void load().then((rows) => {
      if (!cancelled) setOptions(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [open, options, load]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const tags = useMemo(() => {
    if (!options) return [];
    return Array.from(
      new Set(options.map((o) => o.tag).filter((x): x is string => !!x)),
    ).sort();
  }, [options]);

  const results = useMemo(() => {
    if (!options) return [];
    const needle = query.trim().toLowerCase();
    return options
      .filter((o) => {
        if (tag && o.tag !== tag) return false;
        return !needle || o.name.toLowerCase().includes(needle);
      })
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 200);
  }, [options, query, tag]);

  function choose(option: PickerOption, catalogued: boolean) {
    onChange(option.name);
    if (catalogued) onPick?.(option);
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
        <svg className="flex-none text-muted" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
              placeholder={searchPlaceholder ?? t("uni.search")}
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-brand-tint focus:outline-none"
            />
            {tags.length > 1 && (
              <select
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm focus:border-brand-tint focus:outline-none"
              >
                <option value="">{allTagsLabel ?? t("uni.allCountries")}</option>
                {tags.map((value_) => (
                  <option key={value_} value={value_}>
                    {tagLabel(value_)}
                  </option>
                ))}
              </select>
            )}
          </div>

          <ul className="max-h-64 overflow-y-auto py-1">
            {!options && (
              <li className="px-3 py-2 text-sm text-muted">{t("common.loading")}</li>
            )}
            {options && results.length === 0 && (
              <li className="px-3 py-2 text-sm text-muted">
                {emptyLabel ?? t("uni.noMatch")}
              </li>
            )}
            {results.map((option) => (
              <li key={`${option.name}|${option.tag ?? ""}`}>
                <button
                  type="button"
                  onClick={() => choose(option, true)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-start text-sm transition-colors hover:bg-brand-soft"
                >
                  <span className="truncate text-ink">{option.name}</span>
                  {option.tag && (
                    <span className="flex-none rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand-tint">
                      {option.tag}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>

          {query.trim() && (
            <button
              type="button"
              onClick={() => choose({ name: query.trim(), tag }, false)}
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
export function countryLabel(code: string): string {
  try {
    const display = new Intl.DisplayNames(undefined, { type: "region" });
    return `${display.of(code) ?? code} (${code})`;
  } catch {
    return code;
  }
}
