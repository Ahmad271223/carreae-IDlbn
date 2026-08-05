# Architecture

## 1. Shape: modular monolith

One deployable backend, one database, hard internal domain boundaries. No microservices
in the MVP. Modules communicate via in-process domain events or explicit public module
APIs — never by reaching into another module's repositories.

Extraction candidates (later, unchanged contracts): credential verification, document
processing, notifications, AI, search.

```
┌────────────────────────── apps/web (Next.js) ──────────────────────────┐
│  (user)   (institution)   (employer)   (admin)   (share/<token> public)│
└──────────────────────────────┬─────────────────────────────────────────┘
                               │ REST /api/v1 (OpenAPI)
┌──────────────────────────────▼──────────────── apps/api (NestJS) ──────┐
│ auth │ users │ profile │ education │ experience │ skills │ languages   │
│ verification │ documents │ credentials │ organizations │ institutions  │
│ employers │ cv │ cover-letter │ applications │ shares │ consent        │
│ notifications │ audit │ ai │ admin │ integrations                      │
│           BullMQ workers: scan · pdf-render · email · webhooks         │
└───────┬───────────────┬────────────────┬───────────────────────────────┘
   PostgreSQL         Redis          S3-compatible storage (private)
   (Prisma)      (cache + queues)    MinIO dev / cloud prod
```

## 2. Backend decision: NestJS + TypeScript (over FastAPI + Python)

Chosen: **NestJS**. Rationale:

1. **One language across the whole product** (Next.js web, Expo mobile, backend, shared
   packages). Credential payload schemas, validation, i18n keys and API DTOs live once in
   `packages/shared` (Zod) and are consumed by client and server — schema drift between
   frontend and backend is a real fraud/security surface here (verified-field locking,
   share projections) and dual-language duplication would multiply it.
2. **Module system fits the modular monolith**: NestJS modules + DI give us enforceable
   domain boundaries (backed by ESLint `import/no-restricted-paths` rules), which is the
   main structural risk (T4).
3. **Prisma** delivers migrations + typed queries against the schema in DATABASE_SCHEMA.md.
4. **First-class OpenAPI** generation from the same DTOs that validate requests.
5. **PDF rendering** uses headless Chromium executing the *same React template components*
   as the on-screen preview — only feasible in a TS stack; this kills an entire class of
   "preview ≠ PDF" bugs, critical for RTL (risk T1).
6. Hiring/bus-factor: one stack, and the Lebanese market has a deep JS/TS pool.

FastAPI would win for ML-heavy workloads; our AI layer is API-orchestration
(provider-agnostic `AIProvider` interface), not model hosting — no Python advantage.

## 3. Repository structure (pnpm workspaces + Turborepo)

```
careerid/
├── apps/
│   ├── web/                  # Next.js App Router; route groups: (user) (institution)
│   │                         # (employer) (admin) (public share viewer). RBAC enforced
│   │                         # server-side per request — surface is authz context.
│   ├── api/                  # NestJS modular monolith (src/modules/<domain>/…)
│   └── mobile/               # Expo (Phase ≥5; placeholder only)
├── packages/
│   ├── branding/             # THE name/logo/domain config. Nothing else defines the brand.
│   ├── shared/               # Zod schemas, DTO types, enums (statuses, CEFR, ISO codes),
│   │                         # credential payload schemas, error codes
│   ├── ui/                   # design tokens + shadcn-based components (logical CSS props only)
│   ├── i18n/                 # message catalogs ar/en/fr; RTL utilities
│   └── templates/            # CV + cover-letter template configurations & React renderers
├── infra/
│   ├── docker/               # docker-compose.dev.yml: postgres, redis, minio, clamav, mailpit
│   └── ci/                   # pipeline definitions
├── docs/                     # this documentation set
└── tooling/                  # eslint config (incl. module-boundary rules), tsconfig bases
```

## 4. Core domain mechanics

### 4.1 Verification (see PRODUCT_REQUIREMENTS §5)
- `verification_request` snapshots the target entry's verifiable fields as canonical JSON
  + SHA-256 hash at request time. Confirmation signs off on that hash — atomicity for free.
- Entity services updating a verified-covered field revert status to `NONE` inside the
  same DB transaction. Enforced in the service layer + integration tests (§65).
- Share serialization is an **allow-list projection**: a badge is emitted only when
  status `VERIFIED` *and* re-checked live at view time. `PENDING/DECLINED/EXPIRED/REVOKED`
  are structurally unreachable in the projection type.

### 4.2 Credentials
- Offers: issuance creates `credential` in `OFFERED` sub-state of ACTIVE binding flow;
  subject accepts → appears in wallet/profile; declines → visible only to issuer.
- Never deleted. Status transitions append to `credential_status_history`.
- Signatures: platform Ed25519 over canonical (RFC 8785 JCS) credential JSON; public
  verification endpoint `GET /api/v1/credentials/{id}/verify`. Schema kept compatible
  with a later W3C-VC alignment.

### 4.3 Documents
Upload pipeline (all async post-quarantine): client → presigned upload to quarantine
bucket → queue: ClamAV scan → MIME sniffing (magic bytes, never extension) → size limits →
metadata extraction → classification → move to encrypted private bucket → ready.
Serving: short-lived signed URLs only; no public objects, ever.

### 4.4 CV / cover-letter rendering
- Templates = configuration (layout grid, typography tokens, color, photo slot), consumed
  by **one** React rendering engine in `packages/templates`.
- `cv_item.displayOverride` is presentation-only; locked fields for `VERIFIED` sources
  validated server-side against the source entry's locked-field list.
- Cover letters: 5 layouts × 4 conventions (DE DIN 5008 / FR / EN / AR RTL) over the same
  renderer; block structure with per-block `origin`.
- Rendering: `POST /cvs/{id}/render` → BullMQ job → Playwright/Chromium → PDF (embedded
  Noto Naskh Arabic + Latin serif/sans, real text layer) → object storage → signed URL →
  wallet version entry. No client-side PDF. No tokens/internal IDs in PDF metadata.

### 4.5 AI layer
- `AIProvider` interface (generate, refine; provider-agnostic; default Anthropic adapter).
- `AIContextBuilder` builds prompts **only** from a typed allow-listed projection of
  structured profile data + the job description. Excluded by construction: wallet
  contents, references, DOB, nationality, phone, address.
- Output → `draft_content`; user adopts per block; entity validator diffs draft against
  profile entities and flags unknown claims; back-translation job when target language
  level in profile < C1.

### 4.6 Audit
Append-only `audit_events` with hash chaining (`hash = SHA256(prev_hash ‖ canonical_event)`),
no UPDATE/DELETE grants for the app role on that table; periodic anchor checkpoints.

## 5. Cross-cutting

- **i18n**: all strings in `packages/i18n` catalogs (ar/en/fr); logical CSS properties
  only (`margin-inline-start`); icon mirroring where semantic; RTL snapshot tests in CI.
- **Multi-country**: `countryCode`, `educationSystem`, `credentialFramework`, `language`
  on every relevant object; country-specific behavior via config tables, not `if (LB)`.
- **API**: versioned REST `/api/v1`, OpenAPI-generated docs, RFC 7807 errors, cursor
  pagination, Idempotency-Key on mutating endpoints that external parties call.
- **Queue**: BullMQ on Redis for scan/render/email/webhooks; interface kept thin so a
  managed MQ can replace it later.
- **Webhooks (integration framework)**: HMAC-signed, retries with backoff, idempotency
  keys, dead-letter queue prepared. Scopes like `credential:issue`, `credential:read`.
- **Config**: 12-factor; `.env` never committed; secrets via environment/secret manager;
  prices, plan limits, branding all configuration.
- **Observability**: structured logging (pino), request IDs, error tracking hook points;
  no PII in logs.

## 6. Deployment (MVP)

Docker images for `web` and `api(+workers)`; docker-compose for local dev
(postgres/redis/minio/clamav/mailpit); CI: build → typecheck → lint → test → security
checks (dependency audit, secret scan) per §62. Production target: any container platform
+ managed Postgres/Redis/S3 — no cloud-vendor lock-in in code.
