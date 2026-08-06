import type { KnownEntities } from "./ai-context";

/**
 * Post-generation fact check (§29): prompting alone does not guarantee §27,
 * so the draft is scanned for concrete claims — years, CEFR levels and
 * organization-shaped names — that do not appear in the profile. Findings are
 * WARNINGS (yellow), never blockers: it is the user's letter; the platform
 * just refuses to stay silent. Deliberately high-precision heuristics: an
 * org candidate must carry a legal/institutional suffix, so ordinary prose
 * (including German noun capitalization) produces no noise.
 */
export interface DraftWarning {
  type: "YEAR" | "LANGUAGE_LEVEL" | "ORGANIZATION";
  value: string;
  labelKey: "ai.notInProfile";
}

const ORG_SUFFIXES = [
  "GmbH",
  "AG",
  "Inc",
  "Corp",
  "Ltd",
  "LLC",
  "SARL",
  "SAL",
  "University",
  "Université",
  "Universität",
  "Institute",
  "Institut",
  "College",
  "School",
  "Schule",
  "École",
  "جامعة",
  "معهد",
  "مدرسة",
];

const ORG_PATTERN = new RegExp(
  // up to three capitalized words directly before a suffix, or suffix-first
  // forms (e.g. "Université Saint-Joseph", "جامعة بيروت").
  `(?:(?:[\\p{Lu}][\\p{L}&.-]*\\s+){0,3}(?:${ORG_SUFFIXES.join("|")})(?:\\s+[\\p{Lu}\\p{Script=Arabic}][\\p{L}\\p{Script=Arabic}.-]*){0,3})`,
  "gu",
);

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export function validateDraft(
  draft: string,
  entities: KnownEntities,
): DraftWarning[] {
  const warnings: DraftWarning[] = [];
  const seen = new Set<string>();
  const push = (type: DraftWarning["type"], value: string) => {
    const key = `${type}:${normalize(value)}`;
    if (seen.has(key)) return;
    seen.add(key);
    warnings.push({ type, value, labelKey: "ai.notInProfile" });
  };

  for (const match of draft.matchAll(/\b(19|20)\d{2}\b/g)) {
    const year = Number(match[0]);
    if (!entities.years.has(year)) push("YEAR", match[0]);
  }

  for (const match of draft.matchAll(/\b([ABC][12])\b/g)) {
    if (!entities.levels.has(match[1]!)) push("LANGUAGE_LEVEL", match[1]!);
  }

  const knownOrgs = entities.organizations.map(normalize);
  for (const match of draft.matchAll(ORG_PATTERN)) {
    const candidate = normalize(match[0]);
    if (candidate.split(" ").length < 2) continue;
    const known = knownOrgs.some(
      (org) => org.includes(candidate) || candidate.includes(org),
    );
    if (!known) push("ORGANIZATION", match[0].trim());
  }

  return warnings.slice(0, 20);
}
