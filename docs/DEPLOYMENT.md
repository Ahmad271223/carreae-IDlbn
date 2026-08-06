# Deployment

Single-host Docker deployment of the full stack: API (+ render worker,
Chromium), web, PostgreSQL, Redis, MinIO, ClamAV. TLS and domains are handled
by a reverse proxy in front — any of Caddy, Traefik or nginx.

## 1. Prerequisites

- Linux host with Docker Engine + Compose plugin (2 CPU / 4 GB RAM minimum;
  ClamAV alone wants ~1.5 GB).
- Two DNS names pointing at the host, e.g. `app.example.com` (web) and
  `api.example.com` (API), plus a TLS-terminating reverse proxy.
- An SMTP relay (transactional mail: verification, resets, notifications).

## 2. Secrets

```bash
cp .env.production.example .env.production

# POSTGRES_PASSWORD / S3_SECRET_KEY
openssl rand -base64 24

# ENCRYPTION_KEY (32 bytes, base64)
openssl rand -base64 32

# CREDENTIAL_SIGNING_KEY (Ed25519, PKCS#8 PEM, newlines escaped as \n)
openssl genpkey -algorithm ed25519 | awk 'BEGIN{ORS="\\n"}1'
```

Fill `.env.production`. The file is git-ignored; treat it like the key safe
it is. Key rotation: `ENCRYPTION_KEY` payloads are versioned (`v1:`);
`CREDENTIAL_SIGNING_KEY` rotation changes the keyId embedded in new
signatures — old credentials stay verifiable via the public verify endpoint.

## 3. First start

```bash
docker compose -f infra/docker/docker-compose.prod.yml --env-file .env.production up -d --build
```

Boot order is handled by health checks; the API container runs
`prisma migrate deploy` before starting, so schema migrations are part of
every deploy. First ClamAV start downloads signatures (~300 MB) — until its
health check passes, uploads fail CLOSED by design (§42).

Smoke check:

```bash
curl -fsS http://localhost:3001/api/v1/health
```

## 4. Bootstrap the first platform admin

Platform roles are never self-assignable (§47). Register a normal account
through the app, then promote it once via the database:

```bash
docker compose -f infra/docker/docker-compose.prod.yml exec postgres \
  psql -U careerid -d careerid \
  -c "UPDATE users SET platform_role='ADMIN' WHERE email='you@example.com';"
```

That account can now approve organizations under `/api/v1/admin/*`.

## 5. Reverse proxy

Point the proxy at `web:3000` and `api:3001`. Requirements:

- Forward `X-Forwarded-For` / `X-Forwarded-Proto` (the API runs with
  `TRUST_PROXY=1` and needs them for rate limiting, access logs and secure
  cookies).
- HSTS + TLS only; HTTP → HTTPS redirect.
- Body size limit ≥ 16 MB API-side is unnecessary — uploads go directly to
  object storage via presigned URLs; if MinIO is proxied too, allow 16 MB
  there.

Caddy example:

```
app.example.com { reverse_proxy localhost:3000 }
api.example.com { reverse_proxy localhost:3001 }
```

## 6. Updates & operations

```bash
git pull
docker compose -f infra/docker/docker-compose.prod.yml --env-file .env.production up -d --build
```

- **Backups**: `postgres-data` and `minio-data` volumes; standard tooling
  (`pg_dump`, `mc mirror`). Test restores — encrypted backups per SECURITY.md.
- **Logs**: `docker compose ... logs -f api` (structured, request-scoped).
- **Audit chain**: `GET /api/v1/admin/audit/verify` as admin — must return
  `{"valid":true}`.
- **Kill switches**: suspend an organization via the admin API (stops issuing
  and portal instantly); revoke shares/consents via user or support flows.

## 7. Managed-cloud variant

Nothing binds to the compose stack: point `DATABASE_URL`, `REDIS_URL`,
`S3_*` (any S3 API), `SMTP_URL` and `CLAMAV_HOST` at managed services and run
only the two app images. The images are self-contained (Chromium included in
the API image for PDF rendering).

## 8. Honest limitations (pre-launch gate, ROADMAP.md)

The deployable surface today is the API plus the localized web shell — the
portal UIs ship with the frontend milestones. Before public launch, the
continuous gate applies: guardian consent for minors, privacy-policy review,
penetration test, PDF/A hardening, account export/erase endpoints.
