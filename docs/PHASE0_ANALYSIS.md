# Phase 0 — Product & Risk Analysis

Working title: **Career ID Lebanon** (name is configuration, never hardcoded — see `packages/branding`).

This document records the analysis required before any code is written: technical risks,
missing requirements, privacy/security risks, problematic assumptions, and MVP cuts.
Decisions derived from this analysis live in `ARCHITECTURE.md`, `SECURITY.md`, `MVP_SCOPE.md`.

---

## 1. Technical risks

| # | Risk | Impact | Mitigation |
|---|------|--------|------------|
| T1 | **RTL + trilingual PDF rendering** is the hardest purely technical problem in the MVP. Arabic bidi, font shaping and page breaks differ across engines. | Broken CVs = broken core promise | Server-side rendering only (headless Chromium via Playwright), embedded Noto fonts, golden-file PDF regression tests per template × language (§64) |
| T2 | **Verification-state leakage**: `PENDING`/`DECLINED` reaching a share package is a product-destroying bug, not a cosmetic one. | User harm, trust loss | Share projection built from an allow-list serializer (only `VERIFIED` badges pass), never from entity spreads; dedicated security tests that must fail (§65) |
| T3 | **Verified-field drift**: user edits a verified field after confirmation. | Fraud vector ("Junior"→"Senior") | Verification stores a canonical hash of the exact verified fields; any write to a covered field auto-reverts status to `NONE` in the same transaction |
| T4 | Modular monolith degrading into a big ball of mud. | Velocity collapse | Enforced module boundaries (NestJS modules + ESLint boundary rules), domain events instead of cross-module service calls where possible |
| T5 | Queue/worker complexity (virus scan, PDF, notifications) on day one. | Over-engineering | Single BullMQ/Redis setup shared by all async jobs; no separate infrastructure per job type in MVP |
| T6 | External certificate providers (IELTS, Goethe…) have **no public verification APIs** in most cases. | Fake integrations | Adapter framework only (§12); no adapter is shipped as "working" without a real endpoint. MVP ships zero live provider adapters. |

## 2. Missing / underspecified requirements (resolved here)

| # | Gap | Decision |
|---|-----|----------|
| M1 | Which backend variant (NestJS vs FastAPI)? | **NestJS + TypeScript** — rationale in `ARCHITECTURE.md` §2 |
| M2 | Minimum age / minors: schools imply users under 18. | MVP: self-registration requires 15+ (declared), no guardian flows yet; data minimization for minors; guardian-consent flow is a legal TODO before public launch, tracked in `ROADMAP.md` |
| M3 | Legal basis: Lebanon has Law 81/2018 (e-transactions & personal data); EU recipients imply GDPR exposure once packages are shared into the EU. | Build to GDPR-level standards from day one (export, deletion, consent records) — stricter regime wins |
| M4 | What exactly does an institution see when confirming a verification request? | Only the fields of the request itself (entry snapshot), never the profile. Confirmation UI renders the request payload, nothing else |
| M5 | Account recovery when phone+email both lost. | Out of MVP; support-assisted manual process, documented as such (no half-built self-service flow) |
| M6 | Name collisions in public handles (`ahmad-fakih-x82k9`). | Slug = normalized name + 5-char base32 suffix from CSPRNG; collision retry loop; slug is *not* an authorization token — the page shows nothing without a share token anyway |
| M7 | How does a school find a student to issue to? | Issuing requires the student's Career ID handle or invite email; **no search over the user base** (§39). Student must accept the school relationship before the credential binds |
| M8 | Credential acceptance: can an institution push data onto a profile? | No. Issued credentials land as **offers**; the user accepts (then it appears in wallet/profile) or declines. Institution sees accept/decline status of its own issuance only |

## 3. Privacy risks

- **P1 — Aggregation risk**: the platform concentrates a person's entire education/work history. Mitigations: default-private profiles, per-purpose share tokens, field-level share composition, no public search, no analytics profiling on credential data (§39).
- **P2 — Negative-signal risk**: rejection/decline visibility. Mitigated by the two non-negotiable rules of §5 (externally only *verified* or *no statement*).
- **P3 — LLM data exposure**: documents, third-party reference texts, DOB, nationality, phone, address are **never** sent to LLM providers (§31). Enforced by a typed `AIContextBuilder` that can only read an allow-listed projection.
- **P4 — Job-description retention**: pasted job ads may contain third-party personal data; stored only for the lifetime of the linked application and included in the deletion scope.
- **P5 — Access-log overreach**: log *that* and *what section* was viewed, not device fingerprints (§36).

## 4. Security risks (top of the threat model — full model in SECURITY.md)

1. Cross-tenant access (school reads foreign student, employer reads unshared credential) — IDOR class.
2. Share-token brute force / leak / replay after revocation.
3. Malicious uploads (polyglot files, macro documents, zip bombs).
4. Institution impersonation ("American University X") — organization verification is a *trust* function with human review (§44).
5. Privilege escalation user → org member → org owner → platform admin.
6. Audit-log tampering by a compromised admin — append-only + hash chaining (§41).

## 5. Problematic assumptions in the brief — and how we handle them

| Assumption | Problem | Handling |
|---|---|---|
| "Integrations to IELTS/TOEFL/Goethe are architecturally possible" | Most have no partner API without contracts | Adapter interface + `MANUAL_REVIEW` fallback path; no fake adapters (§12, coding rule "no invented API integrations") |
| Study Matching from "reliable sources" | No such structured source exists for free | Feature stays Phase 6 and ships **only** with a curated, versioned requirements dataset maintained by the trust team. No dataset → no feature (§33) |
| Cryptographic credential level (`CRYPTOGRAPHICALLY_VERIFIED`) in early phases | Full W3C VC stack is heavy | MVP: platform-side Ed25519 signatures over canonical credential JSON (verifiable via public endpoint). W3C VC/OpenBadges alignment deferred; schema kept compatible |
| PDF/A strict compliance from headless Chromium | True PDF/A-2b needs post-processing | MVP ships PDF 1.7 with embedded fonts + text layer; PDF/A conversion step (veraPDF-validated) is a Phase 3 hardening milestone, not silently claimed |

## 6. MVP cuts confirmed (beyond §59)

- Passkeys: **prepared** (WebAuthn tables + auth abstraction), not shipped in MVP UI.
- Phone auth: schema + provider abstraction; OTP delivery behind a feature flag (SMS costs/vendor selection).
- Mobile app (Expo): Phase ≥5. The web app is mobile-first; nothing in the API is web-only.
- OCR of uploaded documents: metadata extraction + MIME/virus pipeline yes, OCR later.
- Bulk issuing UI: CSV import lands with Institution Portal hardening, not first cut.

## 7. Non-obvious design consequences adopted

1. **Two-state external model** (§5) means the share serializer is a security boundary, and is tested like one.
2. **Atomic confirmation** (§5) requires the verification request to carry an immutable snapshot + hash of the fields at request time.
3. **CV inline edits are overrides** (§22): `cv_item.displayOverride` never writes back; verified-locked fields are enforced server-side by comparing override keys against the locked-field list of the source entry.
4. **Credentials are never deleted** (§6): user "deletion" of an accepted credential detaches it from profile visibility; the issuer record and status history persist (revocation/audit integrity). Full account erasure anonymizes the subject reference instead of deleting issuer-side issuance records — documented in the privacy policy and deletion spec.
