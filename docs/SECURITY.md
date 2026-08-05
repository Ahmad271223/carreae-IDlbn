# Security Architecture

Scope: this platform stores school records, degrees, certificates and references of real
people. Security, privacy and data integrity outrank features. Every control below is
server-side; nothing security-relevant lives only in the frontend.

## 1. Threat model (STRIDE-condensed)

| Threat | Primary vector | Controls |
|---|---|---|
| Cross-tenant data access (IDOR) | guessing/enumerating IDs; org reading foreign users | UUIDv7 non-sequential IDs, every query scoped by authenticated principal + ownership check in service layer, org access only via `organization_relationships`, mandatory authz tests (§5 below) |
| Share-token attack | brute force, leaked link, replay after revoke | ≥128-bit CSPRNG tokens stored **hashed**, constant-time compare, expiry/view-limit/PIN options, revocation checked server-side on every request, rate limiting per IP on `/share/*` |
| Malicious upload | polyglots, macros, zip bombs, MIME spoofing | quarantine bucket → ClamAV → magic-byte MIME sniffing (extension ignored) → size caps → re-encode images → encrypted private bucket; signed URLs (short TTL) for all reads |
| Institution impersonation | fake "American University X" | organization verification with human review (documents, domain proof, callback), `PENDING` orgs cannot issue; suspension kills issuing + API keys instantly |
| Privilege escalation | user→org admin→platform admin | RBAC checks in guards per endpoint, org role changes audited + require OWNER, admin surface on separate auth policy (MFA mandatory, IP allowlist prepared, every action audited) |
| Verification-state leakage | PENDING/DECLINED visible externally | allow-list share projection (type-level unreachable), dedicated red-team tests in CI |
| Verified-data tampering | edit-after-verify, CV override | field-hash snapshot; write to covered field reverts to NONE transactionally; CV `displayOverride` keys validated against locked-field list server-side |
| Audit tampering | malicious admin | append-only table (INSERT/SELECT-only role), SHA-256 hash chaining, periodic external anchor |
| Session attacks | fixation, theft, CSRF | httpOnly+Secure+SameSite cookies, rotating session tokens (hashed at rest), CSRF tokens on state-changing browser routes, suspicious-login heuristics (new device/geo → notify + step-up) |
| Injection / XSS | user text everywhere (profiles, letters) | parameterized queries only (Prisma), output encoding by default (React), strict CSP (no inline script), sanitization of any rich text, no `dangerouslySetInnerHTML` without sanitizer |
| Secrets exposure | repo, logs, PDFs | no secrets in repo (CI secret scan), env/secret manager, key rotation procedure, structured logs with PII scrubbing, PDF metadata contains no tokens/internal IDs |

## 2. Authentication

- Passwords: Argon2id (memory-hard params documented in code), breach-list check on set.
- Email + phone verification; MFA via TOTP (WebAuthn/passkeys schema-ready).
- SSO: Google/Apple via OIDC; account linking only after verified email match + explicit
  user confirmation.
- Password reset: single-use tokens (hashed, 30 min TTL), no user enumeration in responses.
- Sessions: server-side records, revocable per device; absolute + idle timeouts.
- Admin: separate policy — MFA mandatory, shorter sessions, IP-restriction ready.

## 3. Authorization

RBAC + relationship-based checks (see RBAC.md). Deny-by-default guards; every route
declares required permission; org-scoped routes additionally verify membership **and**
the org↔user relationship for subject data. No client-supplied org/user IDs are trusted.

## 4. Data protection

- TLS everywhere (HSTS); encryption at rest for DB + object storage; sensitive columns
  (`profile_sensitive`, reference content, referee contacts, TOTP secrets) additionally
  application-layer encrypted (AES-256-GCM, keys in KMS/secret manager, key rotation).
- Deletion & export are real features: JSON+files export; erasure anonymizes credential
  subject references (issuer audit integrity) and hard-deletes everything else in scope,
  including job descriptions of deleted applications.
- Backups: encrypted, tested restores, retention documented; backup access audited.
- Access logs for shares: coarse only (timestamp, org hint, sections, country-level IP) —
  explicitly **no** device fingerprinting, canvas tricks, or IP history beyond abuse needs.
- LLM boundary: typed context builder excludes documents, third-party references, DOB,
  nationality, phone, address. Reference texts never reach an LLM (also enforced by
  storing them encrypted outside the AI-readable projection).

## 5. Security test cases — all must FAIL (CI-blocking)

From the brief (§65), implemented as automated tests from Phase 1 onward:

1. User A accesses User B's document
2. Employer accesses a non-shared credential
3. School accesses a student without an ACTIVE relationship
4. Revoked share link still works
5. Expired share link still works
6. Tampered share token accepted
7. ID enumeration (sequential probing yields hits)
8. Malicious file upload reaches the clean bucket
9. Stored XSS via profile fields
10. SQL injection on any endpoint
11. Privilege escalation user → org admin / org → platform admin
12. Organization takeover (foreign member invites/role changes)
13. `DECLINED` or `PENDING` status appears in a share package
14. Verified field altered via CV `displayOverride`

## 6. Platform hardening checklist

TLS/HSTS · CSP (default-src 'self', no inline) · X-Content-Type-Options · frame-ancestors
'none' (except share viewer: 'none' too) · Referrer-Policy strict-origin-when-cross-origin ·
rate limiting (per-IP + per-account, stricter on auth & share endpoints) · request size
limits · dependency audit + lockfile pinning in CI · secret scanning in CI · Prisma
migration review gate · signed webhooks (HMAC + timestamp + idempotency) · ClamAV
signature auto-update · signed URLs ≤ 5 min TTL · audit events for: login, password/MFA
change, credential issue/revoke, document access, share create/revoke, org changes,
admin actions.

## 7. Incident readiness (MVP-level)

Structured audit + app logs with request IDs; kill switches: revoke all sessions of a
user, suspend org (stops issuing + API), disable share package globally; documented
runbook stub in `docs/runbooks/` grows with each phase.
