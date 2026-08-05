# Product Requirements — Career ID (working title)

> The product name is a **branding configuration** (`packages/branding`). No component,
> email template, or PDF may hardcode "Career ID Lebanon".

## 1. Vision

One persistent, user-owned digital identity for education, qualifications and career:
school → language course → degree → university → certificates → internships → jobs →
applications abroad. **Verify once. Use everywhere.**

Not a social network: no feed, no followers, no public people search, no reach mechanics.

## 2. Ownership rule (non-negotiable)

The Career ID belongs to the user. Institutions issue and manage **their own** credentials
only; they never own, browse, or export the user's profile. The user decides what is
shared, with whom, for how long, and can revoke at any time.

## 3. Market & internationalization

- Launch market: Lebanon. Languages: Arabic (full RTL), English, French.
- Lebanon is the launch market, **not a system boundary**. Every relevant object carries
  `countryCode` (ISO 3166-1 alpha-2), `educationSystem`, `credentialFramework`,
  `language` (ISO 639-1). No business logic keyed on `countryCode === 'LB'`.
- Expansion path without re-architecture: LB → JO → AE → SA → DE → FR → …

## 4. Surfaces

| Surface | Audience | MVP |
|---|---|---|
| User App | students, graduates, employees, applicants | full |
| Institution Portal | schools, universities, language schools, training providers | basic (register, verify, issue, revoke) |
| Employer Portal | companies, recruiters | viewer-only via share links (accounts Phase 5) |
| Admin & Trust Portal | platform operator | institution approval, audit, user management |

Surface switching is never a frontend state; it is an authorization context (RBAC.md).

## 5. Verification model (core design decision)

An entry is always fully usable **without** verification. Verification is optional and
additive; it never blocks anything.

- Entry itself is always `SELF_DECLARED`. A separate `verification_request` object has its
  own lifecycle: `NONE · PENDING · VERIFIED · DECLINED · EXPIRED (30d default) · REVOKED`.
- **Rule 1:** `PENDING` and `DECLINED` never appear in any share package. Externally there
  are exactly two states: *verified* or *no statement*. Internally the user sees declines.
- **Rule 2:** Unverified must never look like a defect. Neutral gray, no red labels, no
  warning icons. Only verified entries get positive marking.
- Confirmation is **atomic**: the confirmer verifies the exact field snapshot in full or
  not at all — no edits, no additions, no comments.
- Editing any verified field reverts the verification to `NONE` automatically (hash of
  verified fields stored at confirmation time).

Assurance levels (displayed honestly, no misleading green checks):
`SELF_DECLARED → DOCUMENT_UPLOADED → PLATFORM_REVIEWED → ISSUER_VERIFIED → CRYPTOGRAPHICALLY_VERIFIED`

Badge: `✓ Verified by <Org> · <date>` — clickable → verifying org (incl. the org's own
verification status), timestamp, exact fields, method.

## 6. Document vs. Credential

- **Document** = file in the wallet (metadata + storage key). Never a claim by itself.
- **Credential** = structured issued record (issuer, subject, type, payload, evidence,
  signature data, status). Never deleted; lifecycle `ACTIVE · EXPIRED · REVOKED · SUPERSEDED`
  with visible history and always-current status for verifiers.
- Issued credentials arrive as **offers**; the user accepts or declines (M8 in PHASE0_ANALYSIS).

## 7. Functional modules

### 7.1 Identity & auth
Email + phone registration, Google/Apple SSO, email/phone verification, MFA (TOTP),
passkey-ready, password reset, session & device management, suspicious-login detection.
Internal UUIDs; public identifiers never sequential.

### 7.2 Career ID & profile
Public URL `-/​<slug>` shows **nothing** by default (`PRIVATE`). Purpose-bound share tokens
per application. Profile sections: personal (sensitive fields separated), career,
education, skills, languages (`SELF_DECLARED` vs `CERTIFIED` always distinguished).

### 7.3 School / Language school / University modules
Verified institutions get a dashboard: invite students (by handle/email only — no user
search), issue credentials & transcripts, correct errors via supersede, revoke, digital
signature. An institution sees **only its own relationship** with a student, never the
full Career ID. Language credentials store: language, level, framework (CEFR where
applicable), exam date, result, certificate number, institution, issue/expiry dates,
verification status.

### 7.4 External certificate providers
Generic `CredentialProviderAdapter` (verify / fetchCredential / validateSignature /
refreshStatus / revoke). No adapter ships without a real endpoint. Zero live adapters in MVP.

### 7.5 Study Abroad
"University Application Package": user composes school credential, grades, language
certificate, CV, motivation letter, references, documents → secure view. Foreign
universities need **no account**: `…/share/<token>` shows applicant, education, languages,
credentials, documents, verification status — verified items clearly marked.

### 7.6 Employment & references
Experience entries (company, position, dates, type, location, description, skills) with
optional additive verification per §5. References: request → secure invite → identity
validation → submission → notification. Reference texts are **never** passed to an LLM.
User decides per application whether a reference is attached.

### 7.7 Portfolio
Projects, links, research, publications, media, certificates; attachable per application.

### 7.8 CV & cover letter builder
See ARCHITECTURE.md §6. One rendering engine, 10 CV templates as configuration, 5 letter
layouts × 4 country conventions (DE/FR/EN/AR). Per-CV photo logic with target-country
recommendation and US/UK/CA/AU anti-discrimination warning. Section reordering only (no
free canvas). Inline edits are presentation-layer overrides; verified fields locked unless
the user explicitly drops verification. Server-side PDF with embedded fonts and text
layer; wallet versioning; a generated CV is **never** a credential.

### 7.9 AI layer
May: improve wording, grammar, structure, tailor to a job description.
May never: invent degrees/certificates/employers, change grades, alter or "verify"
verified data. AI output goes to `draft_content`, adopted block-wise by the user; every
block carries `origin: USER | AI_GENERATED | AI_EDITED`. Post-generation entity validator
flags claims not present in the profile. Back-translation shown when the target language
exceeds the user's profile level (< C1). Context excludes wallet contents, third-party
references, DOB, nationality, phone, address.

### 7.10 Sharing, consent, access log
Share packages with snapshot semantics but **live verification status at view time**.
Token ≥128-bit entropy, expiry, view limit, optional PIN, download toggle, server-side
revocation with immediate effect. Access log: viewed-at, org if known, sections opened —
no fingerprinting. Optional QR code pointing only to the share URL. Real consent objects
(subject, recipient, purpose, resources, granted/expires/revoked), individually revocable.

### 7.11 Notifications
In-app + email (push/SMS later): credential received/revoked, application viewed, status
changed, reference received, security login, institution request.

### 7.12 Subscriptions (modular, no hardcoded prices)
User `FREE/PLUS`; Institution & Employer `STARTER/PROFESSIONAL|BUSINESS/ENTERPRISE`.
Core Career ID stays low-barrier. Long-term revenue is B2B (SaaS, credential/verification
APIs, integrations). Usage metering supported architecturally from day one.

## 8. Success criteria

The 16 end-to-end criteria of the brief (§60) plus the seed journey (§67) must pass
against a running system with realistic, fully fictional demo data covering: student,
school, language school, university, Lebanese employer, foreign employer.

## 9. Out of scope (MVP)

Full job board, social features, chat, recruiter marketplace, AI career coaches,
blockchain, microservices, full ATS, mass integrations, automatic degree recognition —
architecture prepared where cheap, features not built. Details: MVP_SCOPE.md.
