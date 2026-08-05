# API Specification — /api/v1

Versioned REST, OpenAPI 3.1 generated from NestJS DTOs (single source of truth in
`packages/shared` Zod schemas). This document defines conventions + endpoint inventory;
the generated OpenAPI file is the contract.

## 1. Conventions

- **Auth**: browser = httpOnly session cookie + CSRF token; API clients = `Authorization:
  Bearer <key>` with scopes; share viewer = capability token in path, nothing else.
- **Errors**: RFC 7807 `application/problem+json` with stable `code` (enum in
  `packages/shared`); no user enumeration, no stack traces.
- **Pagination**: cursor-based (`?cursor=&limit=`), `X-Next-Cursor` response header.
- **Idempotency**: `Idempotency-Key` header honored on POSTs invoked by external systems
  (credential issuing, webhooks test, renders).
- **Rate limits**: per-IP and per-principal tiers; `429` + `Retry-After`; stricter on
  `/auth/*` and `/share/*`.
- **I18n**: `Accept-Language` (ar/en/fr) for localized enums/messages.
- IDs are UUIDv7 strings; timestamps ISO 8601 UTC.

## 2. Endpoint inventory (MVP)

### Auth & sessions `/auth`
```
POST   /auth/register              email+password (+locale, countryCode)
POST   /auth/verify-email          token
POST   /auth/login                 password (+ MFA step-up: POST /auth/mfa/verify)
POST   /auth/logout
POST   /auth/password/forgot       always 202
POST   /auth/password/reset        single-use token
GET    /auth/sessions              device list
DELETE /auth/sessions/{id}         revoke device
POST   /auth/mfa/totp              enroll · DELETE disable (step-up required)
GET    /auth/oauth/{provider}/start|callback   google|apple
```

### Profile & career data
```
GET/PATCH /profile                 own profile (sensitive fields via /profile/sensitive)
GET/PUT   /profile/sensitive       separate path, separate audit
GET       /profile/completion      dashboard completion score
CRUD      /educations · /experiences · /skills · /languages
                                   (POST, GET list, GET/{id}, PATCH/{id}, DELETE/{id};
                                    PATCH on verified-covered fields → verification reset,
                                    response flags `verificationReset: true`)
POST      /profile/slug            regenerate handle
```

### Verification
```
POST   /verifications              {subjectType, subjectId, organizationId} → PENDING,
                                   snapshot+hash captured server-side
GET    /verifications              own requests (user sees DECLINED etc. — internal only)
POST   /verifications/{id}/revoke  user withdraws request
# org side (org-scoped):
GET    /org/{orgId}/verifications                    pending queue (snapshots only)
POST   /org/{orgId}/verifications/{id}/confirm       atomic — no payload accepted
POST   /org/{orgId}/verifications/{id}/decline
```

### Documents `/documents`
```
POST   /documents/upload-intent    → presigned quarantine upload + documentId
POST   /documents/{id}/complete    triggers scan pipeline
GET    /documents                  wallet list (+versions)
GET    /documents/{id}             metadata; GET /documents/{id}/download → signed URL (≤5 min)
DELETE /documents/{id}             (soft; blocked while referenced by active share)
```

### Credentials `/credentials`
```
GET    /credentials                own wallet (all statuses + history)
GET    /credentials/{id}           detail incl. status history
POST   /credentials/{id}/accept    accept offer
POST   /credentials/{id}/decline
GET    /credentials/{id}/verify    PUBLIC — signature + current status check (no PII
                                   beyond credential content already shared)
# issuing (org-scoped, org must be VERIFIED):
POST   /org/{orgId}/credentials              issue (Idempotency-Key)
POST   /org/{orgId}/credentials/{id}/revoke  reason required
POST   /org/{orgId}/credentials/{id}/supersede
GET    /org/{orgId}/credentials              issued list (own issuance only)
```

### CVs & cover letters
```
CRUD   /cvs                        (template_key, language, targetCountry, photoEnabled)
PUT    /cvs/{id}/items             order/visibility/overrides — server validates locked
                                   fields of VERIFIED sources; violation → 409 + choice
                                   flow handled client-side (drop verification = separate
                                   explicit POST /verifications/{id}/revoke)
POST   /cvs/{id}/render            → 202 {jobId}; GET /render-jobs/{jobId} → signed URL +
                                   wallet version on success
CRUD   /cover-letters              + /cover-letters/{id}/blocks (order, content)
POST   /cover-letters/{id}/blocks/{blockId}/draft    AI draft → draft_content only
POST   /cover-letters/{id}/blocks/{blockId}/adopt    promote draft (sets origin)
POST   /cover-letters/{id}/render  as CV render
GET    /cover-letters/{id}/backtranslation           when target level < C1
```

### Applications & sharing
```
CRUD   /applications               + PUT /applications/{id}/items (compose package)
POST   /applications/{id}/share    → share package {url, qr, expiresAt, options}
GET    /shares                     own share packages + access logs
POST   /shares/{id}/revoke         immediate, server-side
GET    /shares/{id}/access-log
# public viewer (anonymous, token-authorized, rate-limited):
GET    /share/{token}              projection (live verification status; PIN via
                                   POST /share/{token}/unlock when set)
GET    /share/{token}/documents/{docId}   signed URL if downloadAllowed
```

### Organizations & portals
```
POST   /organizations              register (type, country, docs) → PENDING
GET/PATCH /org/{orgId}             settings (role-gated)
CRUD   /org/{orgId}/members        invites, roles (OWNER/ADMIN rules per RBAC.md)
POST   /org/{orgId}/relationships/invite   student/employee by handle or email
GET    /org/{orgId}/relationships          own relationships only
CRUD   /org/{orgId}/api-clients            keys, scopes, webhook config
GET    /org/{orgId}/audit                  org-scoped audit
```

### Admin & trust `/admin` (separate auth policy)
```
GET    /admin/organizations?status=PENDING
POST   /admin/organizations/{id}/verify|reject|suspend
GET    /admin/users · POST /admin/users/{id}/lock|unlock
GET    /admin/audit · GET /admin/security-events · GET /admin/health
```

### Consents & notifications
```
GET    /consents · POST /consents/{id}/revoke
GET    /notifications · POST /notifications/{id}/read · PUT /notification-settings
```

### Account
```
GET    /account/export             → async job → downloadable archive (JSON + files)
POST   /account/erase              step-up auth; executes documented deletion spec
```

## 3. Webhooks (org API clients)

Events: `credential.accepted` · `credential.revoked` · `verification.completed`.
Delivery: HMAC-SHA256 signature header (`X-Signature`, timestamped), retries with
exponential backoff, `Idempotency-Key`, dead-letter after N attempts (inspectable via
`GET /org/{orgId}/api-clients/{id}/deliveries`).

## 4. Non-goals of v1

No public user search endpoints, no bulk profile reads, no admin bypass endpoints,
no unversioned routes. Breaking changes → `/api/v2`.
