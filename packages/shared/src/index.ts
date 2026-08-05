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
