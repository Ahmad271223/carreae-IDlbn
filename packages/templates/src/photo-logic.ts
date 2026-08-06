/**
 * Photo recommendation by target country (brief §20). DE/FR traditionally
 * expect an application photo; US/UK/CA/AU discourage it for
 * anti-discrimination reasons — a photo there can get an application sorted
 * out. The user can always override; discouraged targets get a warning
 * (i18n key, never hardcoded copy).
 */
export type PhotoNorm = "expected" | "discouraged" | "neutral";

const PHOTO_NORMS: Record<string, PhotoNorm> = {
  // photo customary
  DE: "expected",
  AT: "expected",
  CH: "expected",
  FR: "expected",
  LB: "expected",
  JO: "expected",
  AE: "expected",
  SA: "expected",
  QA: "expected",
  KW: "expected",
  // photo can cause rejection
  US: "discouraged",
  GB: "discouraged",
  CA: "discouraged",
  AU: "discouraged",
  IE: "discouraged",
  NZ: "discouraged",
};

export interface PhotoRecommendation {
  /** Preselected value for the per-CV photoEnabled flag — always overridable. */
  photoDefault: boolean;
  norm: PhotoNorm;
  /** Set when the user should be warned before overriding (discouraged). */
  warningKey?: "cv.photo.discouragedWarning";
}

export function recommendPhoto(targetCountry?: string | null): PhotoRecommendation {
  const norm: PhotoNorm = targetCountry
    ? (PHOTO_NORMS[targetCountry.toUpperCase()] ?? "neutral")
    : "neutral";
  return {
    photoDefault: norm === "expected",
    norm,
    ...(norm === "discouraged"
      ? { warningKey: "cv.photo.discouragedWarning" as const }
      : {}),
  };
}
