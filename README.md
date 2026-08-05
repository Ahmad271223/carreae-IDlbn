# Career ID (working title)

A user-owned digital identity for education, qualifications and career.
**Verify once. Use everywhere.** Launch market: Lebanon (ar/en/fr, full RTL) —
architected multi-country from day one.

> The product name is configuration: see [`packages/branding`](packages/branding).
> No component, template or email may hardcode a product name.

## Documentation (start here)

| Doc | Contents |
|---|---|
| [PHASE0_ANALYSIS](docs/PHASE0_ANALYSIS.md) | risks, gaps, resolved assumptions |
| [PRODUCT_REQUIREMENTS](docs/PRODUCT_REQUIREMENTS.md) | vision, rules, modules |
| [ARCHITECTURE](docs/ARCHITECTURE.md) | modular monolith, stack decision, repo layout |
| [DATABASE_SCHEMA](docs/DATABASE_SCHEMA.md) | full PostgreSQL domain model |
| [SECURITY](docs/SECURITY.md) | threat model, controls, failing-test catalog |
| [RBAC](docs/RBAC.md) | roles, permission matrix, enforcement |
| [API_SPEC](docs/API_SPEC.md) | /api/v1 conventions + endpoint inventory |
| [MVP_SCOPE](docs/MVP_SCOPE.md) | in / prepared / out, Definition of Done |
| [ROADMAP](docs/ROADMAP.md) | milestones, phase gates |

## Stack

Next.js + TypeScript + Tailwind + shadcn/ui · NestJS (modular monolith) · PostgreSQL +
Prisma · Redis + BullMQ · S3-compatible storage (MinIO dev) · Playwright PDF rendering ·
pnpm workspaces + Turborepo. Rationale: [ARCHITECTURE.md §2](docs/ARCHITECTURE.md).

## Repository layout

```
apps/web         Next.js — user app, institution/employer/admin portals, share viewer
apps/api         NestJS API + workers (scan, pdf-render, email, webhooks)
apps/mobile      Expo (Phase ≥5 — placeholder)
packages/branding  product name/domain/logo configuration (the only source of brand)
packages/shared    Zod schemas, DTOs, enums, error codes
packages/ui        design tokens + components (logical CSS properties only — RTL)
packages/i18n      ar/en/fr message catalogs
packages/templates CV & cover-letter template configs + React renderers
infra/docker       local dev stack (postgres, redis, minio, clamav, mailpit)
docs               documentation set
tooling            shared eslint/tsconfig incl. module-boundary rules
```

## Local development

Prerequisites: Node 22+, pnpm 9+, Docker.

```bash
docker compose -f infra/docker/docker-compose.dev.yml up -d
pnpm install
pnpm dev
```

> Status: Phase 0 complete (docs + structure). App scaffolding lands in Milestone 1.1 —
> `pnpm dev` is not functional yet. See [ROADMAP.md](docs/ROADMAP.md).

## Non-negotiables (enforced, not aspirational)

- `PENDING`/`DECLINED` verification states never leave the system (share projections are
  allow-lists; CI contains attack tests that must fail).
- Unverified data is never styled as a defect.
- Verified data is immutable; edits reset verification transactionally.
- No secrets in the repo. All authorization server-side. Reference texts never reach an LLM.
