# MVP Scope

## 1. In scope (must build)

| Area | Contents |
|---|---|
| Auth | email registration/verification, login, password reset, TOTP MFA, sessions/devices, Google+Apple SSO, suspicious-login notify |
| Profile & Career ID | profile incl. sensitive-field separation, slug, default-private, completion score |
| Career data | education, experience, skills, languages (SELF_DECLARED/CERTIFIED) |
| Verification | full optional-additive model (§5): request/confirm/decline/expire/revoke, atomicity, auto-reset on edit, external two-state rule |
| Document wallet | upload pipeline (quarantine→scan→sniff→encrypt), versions, signed URLs, categories |
| Credentials | data model, offer/accept, issue/supersede/revoke, status history, Ed25519 signing, public verify endpoint |
| CV builder | 10 templates as config, 1 render engine, AR/EN/FR incl. RTL, per-CV photo logic + country recommendation, section reorder, override model with verified-field locking |
| Cover letters | 5 layouts × 4 conventions (DE/FR/EN/AR), block structure, origin tracking |
| PDF | server-side queue rendering, embedded fonts, text layer, wallet versioning |
| AI (minimal but honest) | provider-agnostic interface, block drafts to `draft_content`, adopt flow, entity validator (yellow flags), back-translation < C1 |
| Applications | compose package (CV, letter, documents, credentials, references, sections) |
| Sharing | secure token links, expiry/view-limit/PIN/download toggle, server-side revoke, snapshot + live verification status, QR, access log |
| Consent | consent objects, individual revocation |
| Notifications | in-app + email for the §56 event list (MVP subset) |
| Institution portal (basic) | org registration → admin approval, dashboard, invite by handle/email, issue/revoke credentials, respond to verifications, team roles |
| Admin & trust (basic) | org approval queue, user lock/unlock, audit view, health |
| Employer viewer | account-less share viewing with verified/unverified distinction |
| i18n | ar/en/fr complete, RTL CI tests |
| Security | full SECURITY.md fundamentals + §65 failing-test catalog |
| Data lifecycle | export + erasure as real features |
| Demo | seed data (fictional) + §67 end-to-end seed journey as automated E2E test |

## 2. Prepared but not built (architecture hooks only)

Passkeys (tables + abstraction) · phone OTP (flagged) · external provider adapters
(interface only, zero live adapters) · talent search ("open to opportunities" flag
model only) · employer accounts/pipeline (Phase 5) · subscriptions (plan config +
metering hooks, no payments) · push/SMS channels · W3C VC alignment · PDF/A conversion ·
bulk issuing CSV · mobile app (Expo workspace placeholder) · Study/Job matching.

## 3. Explicitly out (do not touch in MVP)

Job board, feed/social anything, chat, recruiter marketplace, AI career coaches,
blockchain, microservices, full ATS, 100 integrations, automatic degree recognition,
public people search, analytics profiling of credential data.

## 4. Definition of Done (MVP)

All 16 §60 criteria pass as automated E2E tests; §67 seed journey green; §65 security
catalog green (i.e., every attack test fails to succeed); `BUILD → TYPECHECK → LINT →
TEST → SECURITY CHECK` green in CI; docs current.
