# RBAC & Permissions

Principle: **deny by default**, permissions checked server-side per request, surface
switching (user ↔ institution ↔ employer ↔ admin) is an authorization context change,
never a frontend state. Organization access to user data additionally requires an
ACTIVE `organization_relationship` — role alone is never sufficient for subject data.

## 1. Principals

| Principal | Description |
|---|---|
| `USER` | every registered person; owns exactly one Career ID |
| Org member roles | scoped to one organization via `organization_members.role` |
| `PLATFORM_ADMIN` | operator staff; separate auth policy (MFA mandatory) |
| `TRUST_AGENT` | operator staff subset: org verification, fraud, abuse |
| `SUPPORT` | operator staff subset: read-limited assistance, no credential powers |
| Anonymous | share-link viewer; authorized **only** by valid share token |
| `API_CLIENT` | machine principal; authorized by key + scopes |

## 2. Organization roles

| Role | Institutions (school/university/language) | Employers |
|---|---|---|
| `OWNER` | everything below + billing, delete org, transfer ownership, manage roles | same |
| `ADMIN` | manage members (≤ ADMIN), settings, templates, API clients | same + pipeline config |
| `ISSUER` | issue/supersede/revoke credentials, respond to verification requests | respond to verification requests |
| `RECRUITER` | — | view received applications, notes, set pipeline status |
| `VIEWER` | read-only dashboard, no subject data beyond aggregates | read-only |

Role changes: only `OWNER` grants/revokes `OWNER`/`ADMIN`; all changes audited.
Org in `PENDING`/`REJECTED`/`SUSPENDED`: **no issuing, no verification responses, no API**.

## 3. Permission matrix (MVP core; ✓ = allowed with ownership/relationship scoping)

| Action | USER (own data) | Org ISSUER | Org ADMIN | Org OWNER | TRUST_AGENT | PLATFORM_ADMIN | Anonymous+token |
|---|---|---|---|---|---|---|---|
| CRUD profile/education/experience/skills/languages | ✓ | — | — | — | — | — | — |
| Upload/manage own documents | ✓ | — | — | — | — | — | — |
| Create/revoke share packages & consents | ✓ | — | — | — | — | — | — |
| View share package content | ✓ (own) | — | — | — | — | — | ✓ (valid token only) |
| Request verification | ✓ | — | — | — | — | — | — |
| Respond to verification request (atomic confirm/decline) | — | ✓ | ✓ | ✓ | — | — | — |
| Invite student/employee (by handle/email) | — | ✓ | ✓ | ✓ | — | — | — |
| Issue / supersede / revoke credential | — | ✓ | ✓ | ✓ | — | — | — |
| Accept/decline credential offer | ✓ | — | — | — | — | — | — |
| Manage org members | — | — | ✓ (≤ADMIN) | ✓ | — | — | — |
| Manage org API clients & webhooks | — | — | ✓ | ✓ | — | — | — |
| Verify/reject/suspend organizations | — | — | — | — | ✓ | ✓ | — |
| View fraud/abuse reports, security events | — | — | — | — | ✓ | ✓ | — |
| User management (lock, unlock, erase) | — | — | — | — | — | ✓ | — |
| Read audit log (org-scoped) | — | — | ✓ | ✓ | — | — | — |
| Read audit log (global) | — | — | — | — | ✓ | ✓ | — |

Hard limits that no role overrides:
- No org role ever reads a user's full Career ID — only relationship-scoped data and
  verification-request snapshots.
- Nobody edits an issued credential; corrections go through supersede + new issuance.
- Nobody (including PLATFORM_ADMIN) writes to `audit_events` history or reads
  `profile_sensitive` without an audited, purpose-bound support flow.
- Verification confirmation cannot modify fields (atomicity — enforced by API shape:
  the endpoint accepts only `confirm | decline`, no payload).

## 4. API client scopes

`credential:issue` · `credential:read` · `credential:revoke` · `user:lookup-limited`
(handle→exists+display name only, rate-limited, consent-gated). Scopes are additive,
org-bound, and never grant more than the org's own relationship allows.

## 5. Enforcement architecture

- NestJS guards: `AuthGuard` → `PermissionGuard(permission)` → `RelationshipGuard` where
  subject data is touched; route handlers receive pre-authorized context objects.
- Share viewer: token → hashed lookup → validity checks (expiry, revocation, view limit,
  PIN) → **projection serializer** (allow-list; live verification status) → response.
- Every guard denial and every admin/org mutation → `audit_events`.
- Authorization test suite runs the full §65 catalog against seeded multi-tenant data in CI.
