/**
 * @careerid/shared — enums, status models and schemas shared by API and clients.
 *
 * These are the domain constants defined in docs/PRODUCT_REQUIREMENTS.md and
 * docs/DATABASE_SCHEMA.md. Statuses here are the single source of truth; the
 * Prisma schema and API DTOs must reference these values, never re-declare them.
 */
import { z } from "zod";

// ---------- Verification (PRODUCT_REQUIREMENTS §5) ----------

/** Lifecycle of a verification_request. The entry itself is always SELF_DECLARED. */
export const VerificationStatus = {
  NONE: "NONE",
  PENDING: "PENDING",
  VERIFIED: "VERIFIED",
  DECLINED: "DECLINED",
  EXPIRED: "EXPIRED",
  REVOKED: "REVOKED",
} as const;
export type VerificationStatus =
  (typeof VerificationStatus)[keyof typeof VerificationStatus];

/**
 * The ONLY verification status that may ever appear in an external share
 * projection. PENDING/DECLINED/EXPIRED/REVOKED must be structurally
 * unreachable outside the owner's own view (SECURITY.md test 13).
 */
export const EXTERNALLY_VISIBLE_VERIFICATION: readonly VerificationStatus[] = [
  VerificationStatus.VERIFIED,
];

/** Assurance levels, displayed honestly — no green checks below ISSUER_VERIFIED. */
export const AssuranceLevel = {
  SELF_DECLARED: "SELF_DECLARED",
  DOCUMENT_UPLOADED: "DOCUMENT_UPLOADED",
  PLATFORM_REVIEWED: "PLATFORM_REVIEWED",
  ISSUER_VERIFIED: "ISSUER_VERIFIED",
  CRYPTOGRAPHICALLY_VERIFIED: "CRYPTOGRAPHICALLY_VERIFIED",
} as const;
export type AssuranceLevel = (typeof AssuranceLevel)[keyof typeof AssuranceLevel];

// ---------- Credentials (PRODUCT_REQUIREMENTS §6) ----------

/** Credentials are never deleted; they only transition status. */
export const CredentialStatus = {
  OFFERED: "OFFERED",
  ACTIVE: "ACTIVE",
  DECLINED_BY_SUBJECT: "DECLINED_BY_SUBJECT",
  EXPIRED: "EXPIRED",
  REVOKED: "REVOKED",
  SUPERSEDED: "SUPERSEDED",
} as const;
export type CredentialStatus =
  (typeof CredentialStatus)[keyof typeof CredentialStatus];

export const CredentialType = {
  SCHOOL_LEAVING: "SCHOOL_LEAVING",
  DEGREE: "DEGREE",
  TRANSCRIPT: "TRANSCRIPT",
  ENROLLMENT: "ENROLLMENT",
  LANGUAGE: "LANGUAGE",
  COURSE: "COURSE",
  CERTIFICATE: "CERTIFICATE",
  EMPLOYMENT: "EMPLOYMENT",
} as const;
export type CredentialType = (typeof CredentialType)[keyof typeof CredentialType];

// ---------- Organizations ----------

export const OrganizationType = {
  SCHOOL: "SCHOOL",
  UNIVERSITY: "UNIVERSITY",
  LANGUAGE_SCHOOL: "LANGUAGE_SCHOOL",
  TRAINING_PROVIDER: "TRAINING_PROVIDER",
  EMPLOYER: "EMPLOYER",
} as const;
export type OrganizationType =
  (typeof OrganizationType)[keyof typeof OrganizationType];

/** Credential issuing is gated on VERIFIED (RBAC.md §2). */
export const OrgVerificationStatus = {
  PENDING: "PENDING",
  VERIFIED: "VERIFIED",
  REJECTED: "REJECTED",
  SUSPENDED: "SUSPENDED",
} as const;
export type OrgVerificationStatus =
  (typeof OrgVerificationStatus)[keyof typeof OrgVerificationStatus];

export const OrganizationRole = {
  OWNER: "OWNER",
  ADMIN: "ADMIN",
  ISSUER: "ISSUER",
  RECRUITER: "RECRUITER",
  VIEWER: "VIEWER",
} as const;
export type OrganizationRole =
  (typeof OrganizationRole)[keyof typeof OrganizationRole];

// ---------- Cover letters / AI (PRODUCT_REQUIREMENTS §7.8–7.9) ----------

export const CoverLetterConvention = {
  DE: "DE",
  FR: "FR",
  EN: "EN",
  AR: "AR",
} as const;
export type CoverLetterConvention =
  (typeof CoverLetterConvention)[keyof typeof CoverLetterConvention];

/** Every content block records who wrote it. AI output never lands in content directly. */
export const BlockOrigin = {
  USER: "USER",
  AI_GENERATED: "AI_GENERATED",
  AI_EDITED: "AI_EDITED",
} as const;
export type BlockOrigin = (typeof BlockOrigin)[keyof typeof BlockOrigin];

// ---------- Localization & country context ----------

export const SUPPORTED_LOCALES = ["ar", "en", "fr"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const LocaleSchema = z.enum(SUPPORTED_LOCALES);

/** ISO 3166-1 alpha-2, upper-case. Country context is data, never business logic. */
export const CountryCodeSchema = z
  .string()
  .length(2)
  .regex(/^[A-Z]{2}$/, "ISO 3166-1 alpha-2 expected");

export const CefrLevelSchema = z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]);

export const LanguageSourceSchema = z.enum(["SELF_DECLARED", "CERTIFIED"]);

// ---------- Auth DTOs (API_SPEC /auth) ----------

export const EmailSchema = z.string().trim().toLowerCase().email().max(320);

/** Minimum length only — strength estimation and breach checks live server-side. */
export const PasswordSchema = z.string().min(10).max(200);

export const RegisterSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  locale: LocaleSchema.optional(),
});
export type RegisterDto = z.infer<typeof RegisterSchema>;

export const LoginSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1).max(200),
});
export type LoginDto = z.infer<typeof LoginSchema>;

export const TokenSchema = z.string().min(20).max(200);

export const VerifyEmailSchema = z.object({ token: TokenSchema });
export type VerifyEmailDto = z.infer<typeof VerifyEmailSchema>;

export const ForgotPasswordSchema = z.object({ email: EmailSchema });
export type ForgotPasswordDto = z.infer<typeof ForgotPasswordSchema>;

export const ResetPasswordSchema = z.object({
  token: TokenSchema,
  newPassword: PasswordSchema,
});
export type ResetPasswordDto = z.infer<typeof ResetPasswordSchema>;

export const MfaCodeSchema = z.string().regex(/^\d{6}$/, "6-digit code expected");

export const MfaConfirmSchema = z.object({ code: MfaCodeSchema });
export type MfaConfirmDto = z.infer<typeof MfaConfirmSchema>;

export const MfaLoginSchema = z.object({
  challengeToken: TokenSchema,
  code: MfaCodeSchema,
});
export type MfaLoginDto = z.infer<typeof MfaLoginSchema>;

// ---------- Profile & career data DTOs ----------

const TrimmedString = (max: number) => z.string().trim().min(1).max(max);
/** ISO 8601 calendar date (YYYY-MM-DD); month/day precision is enough here. */
export const IsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const ProfileUpdateSchema = z
  .object({
    firstName: TrimmedString(100),
    lastName: TrimmedString(100),
    headline: z.string().trim().max(200).nullish(),
    summary: z.string().trim().max(2000).nullish(),
    desiredRole: z.string().trim().max(200).nullish(),
    city: z.string().trim().max(120).nullish(),
    countryCode: CountryCodeSchema.nullish(),
    /** Wallet document id (category PHOTO, scanned CLEAN) — validated server-side. */
    photoDocumentId: z.string().uuid().nullish(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "empty update" });
export type ProfileUpdateDto = z.infer<typeof ProfileUpdateSchema>;

export const SensitiveUpdateSchema = z
  .object({
    dateOfBirth: IsoDateSchema.nullish(),
    nationality: z.string().trim().max(120).nullish(),
    contactPhone: z.string().trim().max(40).nullish(),
    contactAddress: z.string().trim().max(500).nullish(),
  })
  .partial();
export type SensitiveUpdateDto = z.infer<typeof SensitiveUpdateSchema>;

const dateRange = { message: "endDate must not precede startDate" };

export const EducationCreateSchema = z
  .object({
    institutionName: TrimmedString(300),
    degreeType: TrimmedString(200),
    fieldOfStudy: z.string().trim().max(200).nullish(),
    countryCode: CountryCodeSchema,
    educationSystem: z.string().trim().max(100).nullish(),
    startDate: IsoDateSchema,
    endDate: IsoDateSchema.nullish(),
    grade: z.string().trim().max(50).nullish(),
    description: z.string().trim().max(2000).nullish(),
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, dateRange);
export type EducationCreateDto = z.infer<typeof EducationCreateSchema>;
export const EducationUpdateSchema = z
  .object({
    institutionName: TrimmedString(300),
    degreeType: TrimmedString(200),
    fieldOfStudy: z.string().trim().max(200).nullish(),
    countryCode: CountryCodeSchema,
    educationSystem: z.string().trim().max(100).nullish(),
    startDate: IsoDateSchema,
    endDate: IsoDateSchema.nullish(),
    grade: z.string().trim().max(50).nullish(),
    description: z.string().trim().max(2000).nullish(),
    displayOrder: z.number().int().min(0),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "empty update" });
export type EducationUpdateDto = z.infer<typeof EducationUpdateSchema>;

export const EmploymentTypeSchema = z.enum([
  "FULL_TIME",
  "PART_TIME",
  "INTERNSHIP",
  "VOLUNTEER",
  "FREELANCE",
]);

export const ExperienceCreateSchema = z
  .object({
    companyName: TrimmedString(300),
    position: TrimmedString(200),
    employmentType: EmploymentTypeSchema,
    location: z.string().trim().max(200).nullish(),
    countryCode: CountryCodeSchema.nullish(),
    startDate: IsoDateSchema,
    endDate: IsoDateSchema.nullish(),
    description: z.string().trim().max(4000).nullish(),
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, dateRange);
export type ExperienceCreateDto = z.infer<typeof ExperienceCreateSchema>;
export const ExperienceUpdateSchema = z
  .object({
    companyName: TrimmedString(300),
    position: TrimmedString(200),
    employmentType: EmploymentTypeSchema,
    location: z.string().trim().max(200).nullish(),
    countryCode: CountryCodeSchema.nullish(),
    startDate: IsoDateSchema,
    endDate: IsoDateSchema.nullish(),
    description: z.string().trim().max(4000).nullish(),
    displayOrder: z.number().int().min(0),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "empty update" });
export type ExperienceUpdateDto = z.infer<typeof ExperienceUpdateSchema>;

export const SkillCategorySchema = z.enum([
  "TECHNICAL",
  "SOCIAL",
  "PROFESSIONAL",
  "SOFTWARE",
]);

export const SkillCreateSchema = z.object({
  name: TrimmedString(120),
  category: SkillCategorySchema,
  level: z.string().trim().max(50).nullish(),
});
export type SkillCreateDto = z.infer<typeof SkillCreateSchema>;
export const SkillUpdateSchema = z
  .object({
    name: TrimmedString(120),
    category: SkillCategorySchema,
    level: z.string().trim().max(50).nullish(),
    displayOrder: z.number().int().min(0),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "empty update" });
export type SkillUpdateDto = z.infer<typeof SkillUpdateSchema>;

export const LanguageLevelSchema = z.enum([
  "NATIVE",
  "A1",
  "A2",
  "B1",
  "B2",
  "C1",
  "C2",
]);

/** ISO 639-1, lower-case. `source` is server-controlled: CERTIFIED only ever
 * results from a credential link, never from user input. */
export const LanguageCreateSchema = z.object({
  language: z
    .string()
    .length(2)
    .regex(/^[a-z]{2}$/, "ISO 639-1 expected"),
  level: LanguageLevelSchema,
});
export type LanguageCreateDto = z.infer<typeof LanguageCreateSchema>;
export const LanguageUpdateSchema = z
  .object({
    level: LanguageLevelSchema,
    displayOrder: z.number().int().min(0),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "empty update" });
export type LanguageUpdateDto = z.infer<typeof LanguageUpdateSchema>;

// ---------- Document wallet DTOs ----------

export const DocumentCategorySchema = z.enum([
  "CV",
  "COVER_LETTER",
  "CERTIFICATE",
  "TRANSCRIPT",
  "REFERENCE",
  "PHOTO",
  "OTHER",
]);

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export const UploadIntentSchema = z.object({
  /** Display name only — storage keys never derive from user input. */
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .refine((name) => !/[/\\]/.test(name), "no path separators"),
  category: DocumentCategorySchema,
});
export type UploadIntentDto = z.infer<typeof UploadIntentSchema>;

// ---------- CV DTOs (§18–§22) ----------

export const CvSectionTypeSchema = z.enum([
  "profile",
  "experience",
  "education",
  "languages",
  "skills",
  "certificates",
  "references",
]);

export const CvCreateSchema = z.object({
  title: z.string().trim().min(1).max(120),
  /** Validated against the template catalog server-side. */
  templateKey: z.string().trim().min(1).max(40),
  language: LocaleSchema,
  targetCountryCode: CountryCodeSchema.optional(),
});
export type CvCreateDto = z.infer<typeof CvCreateSchema>;

export const CvUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    templateKey: z.string().trim().min(1).max(40),
    language: LocaleSchema,
    targetCountryCode: CountryCodeSchema.nullable(),
    photoEnabled: z.boolean(),
    /** Sections are reordered/hidden, never deleted (§21). */
    sectionOrder: z.array(CvSectionTypeSchema).max(10),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "empty update" });
export type CvUpdateDto = z.infer<typeof CvUpdateSchema>;

export const CvItemSourceTypeSchema = z.enum([
  "EXPERIENCE",
  "EDUCATION",
  "CREDENTIAL",
  "LANGUAGE",
  "SKILL",
  "CUSTOM",
]);

/** Presentation-only override payload; allowed keys depend on source type and
 * verification state — enforced server-side (§22). */
export const CvItemOverrideSchema = z
  .record(
    z.string().min(1).max(40),
    z.union([
      z.string().max(2000),
      z.array(z.string().max(300)).max(20),
      z.null(),
    ]),
  )
  .refine((v) => Object.keys(v).length <= 20, "too many override keys");

export const CvItemSchema = z
  .object({
    sourceType: CvItemSourceTypeSchema,
    sourceId: z.string().uuid().optional(),
    displayOverride: CvItemOverrideSchema.optional(),
    order: z.number().int().min(0),
    visible: z.boolean().default(true),
  })
  .refine((v) => v.sourceType === "CUSTOM" || Boolean(v.sourceId), {
    message: "sourceId required for non-custom items",
  })
  .refine(
    (v) =>
      v.sourceType !== "CUSTOM" ||
      typeof v.displayOverride?.title === "string",
    { message: "CUSTOM items need displayOverride.title" },
  );

export const CvItemsPutSchema = z.object({
  items: z.array(CvItemSchema).max(100),
});
export type CvItemsPutDto = z.infer<typeof CvItemsPutSchema>;

// ---------- Cover letter DTOs (§23–§24) ----------

export const CoverLetterConventionSchema = z.enum(["DE", "FR", "EN", "AR"]);
export const LetterLayoutSchema = z.enum([
  "classic",
  "modern",
  "compact",
  "academic",
  "sidebar",
]);
export const CoverLetterBlockTypeSchema = z.enum([
  "RECIPIENT",
  "SUBJECT",
  "SALUTATION",
  "OPENING",
  "BODY",
  "CLOSING",
  "SIGNATURE",
]);

export const CoverLetterCreateSchema = z.object({
  title: z.string().trim().min(1).max(120),
  layoutTemplate: LetterLayoutSchema,
  convention: CoverLetterConventionSchema,
  /** Letter language may exceed platform locales (e.g. "de"). */
  language: z
    .string()
    .length(2)
    .regex(/^[a-z]{2}$/),
});
export type CoverLetterCreateDto = z.infer<typeof CoverLetterCreateSchema>;

export const CoverLetterUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    layoutTemplate: LetterLayoutSchema,
    convention: CoverLetterConventionSchema,
    language: z
      .string()
      .length(2)
      .regex(/^[a-z]{2}$/),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "empty update" });
export type CoverLetterUpdateDto = z.infer<typeof CoverLetterUpdateSchema>;

export const CoverLetterBlocksPutSchema = z.object({
  blocks: z
    .array(
      z.object({
        /** Existing block id — preserves origin tracking across edits (§28). */
        id: z.string().uuid().optional(),
        type: CoverLetterBlockTypeSchema,
        order: z.number().int().min(0),
        content: z.string().max(6000),
      }),
    )
    .max(30),
});
export type CoverLetterBlocksPutDto = z.infer<typeof CoverLetterBlocksPutSchema>;

// ---------- Credential DTOs (§6) ----------

export const CredentialTypeSchema = z.enum([
  "SCHOOL_LEAVING",
  "DEGREE",
  "TRANSCRIPT",
  "ENROLLMENT",
  "LANGUAGE",
  "COURSE",
  "CERTIFICATE",
  "EMPLOYMENT",
]);

/** Flat claim map; scalar values only, bounded size. Type-specific minimums
 * are enforced below — LANGUAGE credentials must state language and level. */
export const CredentialPayloadSchema = z
  .record(
    z.string().min(1).max(80),
    z.union([z.string().max(500), z.number(), z.boolean(), z.null()]),
  )
  .refine((payload) => Object.keys(payload).length <= 40, "too many fields");

const languagePayloadOk = (
  type: z.infer<typeof CredentialTypeSchema>,
  payload: Record<string, unknown>,
) =>
  type !== "LANGUAGE" ||
  (typeof payload.language === "string" && typeof payload.level === "string");

export const IssueCredentialSchema = z
  .object({
    /** The subject's Career ID handle — issuing never searches users (§39). */
    subjectSlug: z.string().trim().min(3).max(80),
    credentialType: CredentialTypeSchema,
    payload: CredentialPayloadSchema,
    countryCode: CountryCodeSchema.optional(),
    educationSystem: z.string().trim().max(100).optional(),
    credentialFramework: z.string().trim().max(100).optional(),
    language: z.string().length(2).optional(),
    issuedAt: IsoDateSchema.optional(),
    expiresAt: IsoDateSchema.optional(),
  })
  .refine((v) => languagePayloadOk(v.credentialType, v.payload), {
    message: "LANGUAGE credentials require payload.language and payload.level",
  });
export type IssueCredentialDto = z.infer<typeof IssueCredentialSchema>;

export const RevokeCredentialSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});
export type RevokeCredentialDto = z.infer<typeof RevokeCredentialSchema>;

export const SupersedeCredentialSchema = z.object({
  payload: CredentialPayloadSchema,
  reason: z.string().trim().max(500).optional(),
  countryCode: CountryCodeSchema.optional(),
  educationSystem: z.string().trim().max(100).optional(),
  credentialFramework: z.string().trim().max(100).optional(),
  language: z.string().length(2).optional(),
  issuedAt: IsoDateSchema.optional(),
  expiresAt: IsoDateSchema.optional(),
});
export type SupersedeCredentialDto = z.infer<typeof SupersedeCredentialSchema>;

// ---------- Verification DTOs (§5) ----------

export const VerificationSubjectTypeSchema = z.enum([
  "EDUCATION",
  "EXPERIENCE",
  "LANGUAGE",
]);

export const VerificationCreateSchema = z.object({
  subjectType: VerificationSubjectTypeSchema,
  subjectId: z.string().uuid(),
  organizationId: z.string().uuid(),
});
export type VerificationCreateDto = z.infer<typeof VerificationCreateSchema>;
