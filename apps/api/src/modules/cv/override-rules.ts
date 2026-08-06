import type { CvItemSourceType } from "@prisma/client";

/**
 * Override policy per §22: a CV edit is a presentation-layer override, never
 * a write to the source. For entries whose source is VERIFIED, factual keys
 * are locked; free-text presentation stays editable.
 */

/** Keys a CV may override at all, per source type. */
const ALLOWED: Record<CvItemSourceType, readonly string[]> = {
  EXPERIENCE: ["description", "bullets", "companyName", "position", "dateRange", "location"],
  EDUCATION: ["description", "bullets", "institutionName", "degreeType", "dateRange", "grade"],
  LANGUAGE: ["label", "level"],
  // Credential content is issuer-signed — no field of it is overridable.
  CREDENTIAL: [],
  SKILL: ["title", "subtitle", "description"],
  CUSTOM: ["title", "subtitle", "dateRange", "description", "bullets"],
};

/** Subset of ALLOWED that locks when the source entry is VERIFIED (§22). */
const LOCKED_WHEN_VERIFIED: Record<CvItemSourceType, readonly string[]> = {
  EXPERIENCE: ["companyName", "position", "dateRange", "location"],
  EDUCATION: ["institutionName", "degreeType", "dateRange", "grade"],
  LANGUAGE: ["label", "level"],
  CREDENTIAL: [],
  SKILL: [],
  CUSTOM: [],
};

export function disallowedKeys(
  sourceType: CvItemSourceType,
  overrideKeys: string[],
): string[] {
  const allowed = ALLOWED[sourceType];
  return overrideKeys.filter((key) => !allowed.includes(key));
}

export function lockedKeys(
  sourceType: CvItemSourceType,
  overrideKeys: string[],
): string[] {
  const locked = LOCKED_WHEN_VERIFIED[sourceType];
  return overrideKeys.filter((key) => locked.includes(key));
}
