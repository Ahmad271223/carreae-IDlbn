# Roadmap — small, testable milestones

Cycle after **every** milestone: `BUILD → TYPECHECK → LINT → TEST → SECURITY CHECK → FIX
→ COMMIT`. No milestone starts before the previous one is green.

## Phase 0 — Analysis & foundation (this commit)
- **0.1** Analysis + 8 core documents ✅ (docs/)
- **0.2** Repository structure, tooling config, docker-compose dev stack, CI skeleton

## Phase 1 — Identity & career core ✅ (completed 2026-08-05)
- **1.1** ✅ Monorepo scaffolding builds: Next.js app, NestJS app, shared/branding/i18n
  packages, Prisma init, healthcheck endpoint, CI green
- **1.2** ✅ Database migrations for identity + career domains; seed framework
- **1.3** ✅ Auth: register/verify-email/login/logout/reset, Argon2id, sessions + devices;
  auth tests incl. enumeration & rate limits
- **1.4** ✅ MFA (TOTP) + SSO Google/Apple + suspicious-login notification
- **1.5** ✅ Profile (incl. sensitive split, slug, completion), education, experience,
  skills, languages CRUD + i18n ar/en/fr + RTL CI snapshots
- **1.6** ✅ Verification requests end-to-end (request→confirm/decline/expire/revoke,
  snapshot hash, auto-reset on edit) — first §65 test subset green

## Phase 2 — Documents & credentials
- **2.1** ✅ Storage abstraction + quarantine upload + presigned flows (MinIO dev)
- **2.2** ✅* Scan pipeline: ClamAV (clamd INSTREAM, fail-closed when unconfigured),
  magic-byte MIME sniffing, size limits, checksums, §65 upload-attack tests.
  *Open remainders: scan moves from sync-in-request onto the BullMQ worker when the
  render queue lands (3.4); wallet UI ships with the frontend milestone; object-level
  encryption rides on bucket encryption for now (app-layer envelope later)
- **2.3** ✅ Credential model: issue via org API (Idempotency-Key), offer/accept/decline,
  revoke/supersede with linked replacement, append-only status history, platform
  Ed25519 signing over canonical JSON + public verify endpoint (live status).
  Per-issuer signing keys (credential_issuers) deferred to Phase 4 org portal
- **2.4** ✅ §65 subset: document permissions, upload attacks, credential revocation
  (landed inside the 2.1–2.3 test suites)

## Phase 3 — CV, letters, applications, sharing
- **3.1** ✅ Template engine + 10 CV configs; ar/en/fr rendering incl. RTL; per-CV photo
  logic with country recommendation + discouraged-market warning (i18n keys)
- **3.2** ✅ CV items with overrides + verified-field locking (server-side; §65 test 14)
- **3.3** ✅ Cover letters: blocks, 5×4 layout/convention matrix
- **3.4** ✅ Server-side PDF pipeline (BullMQ queue → Playwright/Chromium → storage →
  wallet version chain); PDF regression tests assert real text layer, versioning,
  RTL and convention content per template × language
- **3.5** ✅ AI drafts: provider interface, draft/adopt flow, origin tracking, entity
  validator, back-translation
- **3.6** ✅ Applications composer
- **3.7** ✅ Share system: tokens, options, revoke, projection serializer, access log,
  QR, consent — §65 share/leakage tests green (tests 4,5,6,13)
- **3.8** ✅ Employer/university account-less viewer API (verified vs unverified per §5); viewer UI ships with the frontend milestone

## Phase 4 — Institutions & trust
- **4.1** ✅ Org registration + admin approval queue (trust portal basic)
- **4.2** ✅ Institution portal API: relationships (invite by handle/email); issue/revoke API since 2.3; dashboard UI ships with the frontend milestone
- **4.3** ✅ Org team roles (OWNER-gated grants, last-owner protection); §65 org tests (3, 11, 12) green
- **4.4** ✅ Notifications endpoints; audit hash-chain verification (admin endpoint)
- **4.5** ✅ Seed journey §67 as automated E2E. MVP DoD: backend criteria §60 all pass; open before launch review: web UI surfaces, account export/erase endpoints, §65 remaining infra items

## Phase 5 — Employers
- **5.1** ✅ Employer accounts (org type EMPLOYER since 4.1), in-app submissions:
  submit hands the employer a dedicated share package + consent (§38) resolved through
  the §65-tested projection; application inbox with pipeline states
  (RECEIVED→IN_REVIEW→SHORTLISTED→INTERVIEW→OFFER→HIRED/REJECTED, applicant-only
  WITHDRAWN), verification badges in the inbox view, role-gated per RBAC.md
  (OWNER/ADMIN/RECRUITER); user-visible status + withdraw. Team invites since 4.3

## Phase 6 — AI depth & integrations
- **6.1** Job matching (transparent rule-based scoring — no invented percentages)
- **6.2** Study matching **only if** curated dataset exists (no dataset → no feature)
- **6.3** External provider adapters (only with real endpoints/contracts)
- **6.4** Public org APIs + webhooks GA; usage metering; subscriptions/payments

## Continuous / pre-launch legal gate
Guardian-consent flow for minors (M2), privacy policy + deletion spec review (Lebanon
Law 81/2018 + GDPR), penetration test, PDF/A hardening, passkey UI.
