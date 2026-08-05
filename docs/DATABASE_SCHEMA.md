# Database Schema (PostgreSQL + Prisma)

Conventions: UUID v7 primary keys (`id`), `created_at`/`updated_at` on every table,
soft delete (`deleted_at`) only where legally/technically sensible (marked ⌫), documents
stored as **metadata + storage keys, never BLOBs**. All enums are Postgres enums.
Multi-country columns (`country_code`, `education_system`, `credential_framework`,
`language`) appear wherever noted. Public identifiers are never sequential.

## 1. Identity & access

### users ⌫
`id, email (citext unique), email_verified_at, phone (unique, nullable), phone_verified_at,
password_hash (nullable — SSO-only users), status (ACTIVE|LOCKED|DEACTIVATED|ERASED),
mfa_enabled, locale, created_at, updated_at, deleted_at`

### identities
External IdPs. `id, user_id FK, provider (GOOGLE|APPLE|…), provider_subject, unique(provider, provider_subject)`

### auth_credentials
MFA/passkey-ready. `id, user_id FK, type (TOTP|WEBAUTHN), secret_encrypted, label,
last_used_at, revoked_at`

### sessions
`id, user_id FK, token_hash (unique), device_name, ip_created, user_agent, created_at,
last_seen_at, expires_at, revoked_at` — device management = listing + revoking sessions.

### profiles
1:1 user. `user_id PK/FK, slug (unique — normalized-name + CSPRNG suffix), first_name,
last_name, photo_document_id FK?, headline, summary, desired_role, city, country_code,
visibility (PRIVATE default)`.
**Sensitive split** → `profile_sensitive`: `user_id PK/FK, date_of_birth?, nationality?,
contact_phone?, contact_address?` — separate table, separate access path, never in AI
context, never in default projections.

## 2. Organizations

### organizations ⌫
`id, type (SCHOOL|UNIVERSITY|LANGUAGE_SCHOOL|TRAINING_PROVIDER|EMPLOYER),
name, legal_name, country_code, education_system?, website, industry?, size?,
verification_status (PENDING|VERIFIED|REJECTED|SUSPENDED), verified_at, verified_by FK(users),
signing_key_id?` — **credential issuing gated on verification_status = VERIFIED**.

### organization_members
`id, organization_id FK, user_id FK, role (OWNER|ADMIN|ISSUER|VIEWER|RECRUITER),
invited_by FK, joined_at, removed_at, unique(organization_id, user_id)`

### organization_relationships
The only lens an org has on a user. `id, organization_id FK, user_id FK,
type (STUDENT|ALUMNUS|EMPLOYEE|MEMBER), status (INVITED|ACTIVE|ENDED|DECLINED),
initiated_by (ORG|USER), unique(organization_id, user_id, type)`

## 3. Career data (all: `user_id FK`, ⌫)

### educations
`id, user_id, institution_name, organization_id FK? (when on platform), degree_type,
field_of_study, country_code, education_system, start_date, end_date?, grade?,
description, display_order`

### experiences
`id, user_id, company_name, organization_id FK?, position, employment_type
(FULL_TIME|PART_TIME|INTERNSHIP|VOLUNTEER|FREELANCE), location, country_code,
start_date, end_date?, description, display_order`

### skills
`id, user_id, name, category (TECHNICAL|SOCIAL|PROFESSIONAL|SOFTWARE), level?, display_order`

### user_languages
`id, user_id, language (ISO 639-1), level (NATIVE|A1…C2), framework (CEFR|OTHER),
source (SELF_DECLARED|CERTIFIED), credential_id FK? (when CERTIFIED), display_order`

## 4. Verification

### verification_requests
`id, user_id FK, subject_type (EDUCATION|EXPERIENCE|LANGUAGE), subject_id,
organization_id FK (verifier), status (NONE|PENDING|VERIFIED|DECLINED|EXPIRED|REVOKED),
field_snapshot JSONB (canonical), field_hash (SHA-256 of snapshot),
requested_at, responded_at, responded_by FK(users)?, expires_at (default +30d),
revoked_at, revoke_reason?`

Rules enforced in code + tests:
- Share projections may read only `status = VERIFIED` (checked live at view time).
- Any write to a field covered by `field_snapshot` of a VERIFIED request → status `NONE`
  (same transaction).
- Verifier UI receives `field_snapshot` only — never the profile.

## 5. Documents & credentials

### documents ⌫
`id, owner_user_id FK, category (CV|COVER_LETTER|CERTIFICATE|TRANSCRIPT|REFERENCE|PHOTO|OTHER),
origin (USER_UPLOADED|PLATFORM_GENERATED|INSTITUTION_ISSUED), file_name, mime_type
(sniffed), size_bytes, storage_key, checksum_sha256, scan_status
(PENDING|CLEAN|INFECTED|FAILED), encryption_key_ref, language?, version_of FK(documents)?,
version_number`

### credentials  — never deleted, no ⌫
`id (public: non-sequential), issuer_organization_id FK, subject_user_id FK,
credential_type (SCHOOL_LEAVING|DEGREE|TRANSCRIPT|ENROLLMENT|LANGUAGE|COURSE|CERTIFICATE|EMPLOYMENT),
payload JSONB (schema per type in packages/shared), country_code, education_system?,
credential_framework?, language?, issued_at, expires_at?, status
(OFFERED|ACTIVE|DECLINED_BY_SUBJECT|EXPIRED|REVOKED|SUPERSEDED), superseded_by FK(credentials)?,
verification_method, evidence JSONB?, document_id FK?, signature JSONB
(alg, key_id, sig over RFC 8785 canonical payload), accepted_at?`

### credential_status_history
Append-only. `id, credential_id FK, from_status, to_status, actor_user_id FK?,
reason?, created_at`

### credential_issuers
Issuing config per org. `id, organization_id FK, signing_key_id, allowed_types[],
daily_quota?`

## 6. References & portfolio

### references ⌫
`id, user_id FK, referee_name, referee_email_encrypted, referee_position, relationship,
status (REQUESTED|INVITED|SUBMITTED|DECLINED|WITHDRAWN), invite_token_hash, content_encrypted
(never sent to any LLM — enforced by exclusion from AI projection), submitted_at`

### portfolios ⌫
`id, user_id FK, type (PROJECT|LINK|RESEARCH|DESIGN|PUBLICATION|VIDEO|CERTIFICATE),
title, description, url?, document_id FK?, display_order`

## 7. CV & cover letters (⌫)

### cvs
`id, user_id FK, title, template_key (1 of 10), language, target_country_code?,
photo_enabled (per CV, not per user), section_order JSONB, created_at, updated_at`

### cv_items
`id, cv_id FK, source_type (EXPERIENCE|EDUCATION|CREDENTIAL|LANGUAGE|SKILL|CUSTOM),
source_id?, display_override JSONB (presentation only — server rejects override keys that
are locked while source is VERIFIED), order, visible`

### cover_letters / cover_letter_blocks
`cover_letters: id, user_id FK, application_id FK?, layout_template, convention
(DE|FR|EN|AR), language, created_at, updated_at`
`cover_letter_blocks: id, cover_letter_id FK, type (RECIPIENT|SUBJECT|SALUTATION|OPENING|
BODY|CLOSING|SIGNATURE), order, content TEXT, draft_content TEXT? (AI staging — never
auto-promoted), origin (USER|AI_GENERATED|AI_EDITED)`

### document_versions
Rendered outputs. `id, source_type (CV|COVER_LETTER), source_id, document_id FK,
rendered_at, template_key, language` — old versions immutable.

## 8. Applications & sharing

### applications ⌫
`id, user_id FK, title, type (JOB|UNIVERSITY|GENERAL), recipient_name?, job_description
TEXT? (deleted with the application — P4), status, created_at`

### application_items
`id, application_id FK, item_type (CV|COVER_LETTER|DOCUMENT|CREDENTIAL|REFERENCE|PORTFOLIO|
SECTION), item_id, order`

### share_packages
`id, user_id FK, application_id FK?, token_hash (unique — token itself ≥128-bit CSPRNG,
stored hashed), snapshot JSONB (data as-shared; verification badges resolved LIVE at view),
permissions JSONB, download_allowed, view_limit?, view_count, pin_hash?,
expires_at?, revoked_at?, created_at`

### share_access_logs
`id, share_package_id FK, accessed_at, sections_viewed JSONB, org_hint?, ip_coarse?
(country-level only — no fingerprinting)`

## 9. Consent, notifications, audit

### consents
`id, subject_user_id FK, recipient (org FK or descriptor), purpose, resources JSONB,
granted_at, expires_at?, revoked_at?` — individually revocable.

### notifications
`id, user_id FK, type, payload JSONB, channels[], read_at, created_at`

### audit_events  — append-only, hash-chained
`id, sequence BIGSERIAL, actor_type (USER|ORG_MEMBER|ADMIN|SYSTEM), actor_id?,
action, target_type, target_id, metadata JSONB (no PII beyond IDs), ip_coarse?,
prev_hash, hash, created_at` — app DB role has INSERT+SELECT only.

## 10. Platform

### subscriptions
`id, owner_type (USER|ORGANIZATION), owner_id, plan_key (config-defined — prices never in
code), status, current_period_end, metering JSONB`

### api_clients
`id, organization_id FK, name, key_hash, scopes[] (credential:issue, credential:read,
credential:revoke, user:lookup-limited), rate_limit_tier, webhook_url?, webhook_secret_ref,
revoked_at`

### webhook_deliveries
`id, api_client_id FK, event_type, payload JSONB, idempotency_key, attempts,
status (PENDING|DELIVERED|FAILED|DEAD_LETTER), next_retry_at`

## 11. Key constraints & indexes (selection)

- `unique(users.email)`, `unique(profiles.slug)`, `unique(share_packages.token_hash)`
- Partial index `verification_requests(subject_type, subject_id) WHERE status='VERIFIED'`
- FK `ON DELETE RESTRICT` for credentials (never cascade-deleted); account erasure
  anonymizes `subject_user_id` → tombstone user row (`status=ERASED`), preserving issuer
  audit integrity (documented in deletion spec).
- CHECK: `share_packages.view_limit > 0`, `credentials.status` transitions guarded by
  service layer + history append trigger.
- All lookups by owning user indexed `(user_id, display_order)`.
