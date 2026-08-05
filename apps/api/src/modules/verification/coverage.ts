import type { Education, Experience, UserLanguage } from "@prisma/client";

/**
 * The exact fields a verification covers per subject type. Free-text
 * description fields are deliberately NOT covered — they stay editable even
 * on verified entries (brief §22); everything factual is locked.
 */
export const COVERED_FIELDS = {
  EDUCATION: [
    "institutionName",
    "degreeType",
    "fieldOfStudy",
    "countryCode",
    "educationSystem",
    "startDate",
    "endDate",
    "grade",
  ],
  EXPERIENCE: [
    "companyName",
    "position",
    "employmentType",
    "location",
    "countryCode",
    "startDate",
    "endDate",
  ],
  LANGUAGE: ["language", "level", "framework"],
} as const;

export type VerifiableSubjectType = keyof typeof COVERED_FIELDS;

function isoDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

/**
 * Builds the snapshot an organization sees and confirms. `subjectName` is part
 * of the verified statement ("this person holds this entry") — it is the only
 * profile-derived value; the verifier never sees anything else (M4).
 */
export function buildSnapshot(
  subjectType: VerifiableSubjectType,
  entity: Education | Experience | UserLanguage,
  subjectName: string,
): Record<string, unknown> {
  switch (subjectType) {
    case "EDUCATION": {
      const e = entity as Education;
      return {
        subjectName,
        institutionName: e.institutionName,
        degreeType: e.degreeType,
        fieldOfStudy: e.fieldOfStudy,
        countryCode: e.countryCode,
        educationSystem: e.educationSystem,
        startDate: isoDate(e.startDate),
        endDate: isoDate(e.endDate),
        grade: e.grade,
      };
    }
    case "EXPERIENCE": {
      const e = entity as Experience;
      return {
        subjectName,
        companyName: e.companyName,
        position: e.position,
        employmentType: e.employmentType,
        location: e.location,
        countryCode: e.countryCode,
        startDate: isoDate(e.startDate),
        endDate: isoDate(e.endDate),
      };
    }
    case "LANGUAGE": {
      const l = entity as UserLanguage;
      return {
        subjectName,
        language: l.language,
        level: l.level,
        framework: l.framework,
      };
    }
  }
}
