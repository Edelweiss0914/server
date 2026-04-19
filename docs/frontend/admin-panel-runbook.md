# Admin Panel Runbook

> Last updated: 2026-04-20
> Scope: `/admin` Next.js admin page, service panel behavior, gateway deployment path, and recent troubleshooting history

## Purpose

This document is the normalized record for the admin page.

It captures:

- the implementation and deployment workflow
- the current request path for the service panel
- the root causes found during the recent troubleshooting cycle
- the fixes that were applied
- the commands required to verify or redeploy the admin page safely

Use this document together with:

- [`admin-implementation-notes.md`](./admin-implementation-notes.md)
- [`../operations/troubleshooting.md`](../operations/troubleshooting.md)
- [`../services/cheeze-control-api.md`](../services/cheeze-control-api.md)

## Request Flow

### Service Panel

The service cards load through this chain:

1. Browser requests `/admin`
2. `web/src/components/admin/ServiceStatusGrid.tsx` fetches `/api/admin/status`
3. `web/src/app/api/admin/status/route.ts` proxies to `portal-api /admin/status`
4. `deploy/gateway/cheeze-portal-api.py` calls:
   - `control-api /services`
   - `control-api /healthz`
5. `deploy/gateway/cheeze-control-api.py` either:
   - proxies to `backend-agent /services`, or
   - returns offline fallback cards from the gateway registry

### Source of Truth

This distinction matters:

- The admin service cards are **not** sourced directly from the backend-agent config
- Offline fallback cards come from `deploy/orchestrator/service-registry.example.json`
- If a service exists in the backend-agent config but not in the gateway registry, it can disappear from the admin page whenever the backend is asleep or unreachable

## Key Files

| Path | Role |
|---|---|
| `web/src/app/admin/page.tsx` | Admin page tab container |
| `web/src/components/admin/ServiceStatusGrid.tsx` | Service card loading, polling, fallback behavior |
| `web/src/app/api/admin/status/route.ts` | Admin status proxy and payload validation |
| `web/src/app/api/control/services/route.ts` | Public service-status fallback route |
| `deploy/gateway/cheeze-portal-api.py` | `/admin/status` aggregator |
| `deploy/gateway/cheeze-control-api.py` | `/services` proxy, offline fallback, registry loading |
| `deploy/docker/docker-compose.yml` | Runtime wiring for `web` and `control-api` |
| `deploy/orchestrator/service-registry.example.json` | Gateway registry used for offline cards |
| `deploy/backend/cheeze-backend-agent-config.example.json` | Backend agent service definitions |

## Implementation Workflow

### Local Development

When modifying the admin page:

1. change the relevant `web/src/components/admin/*` or `web/src/app/api/admin/*` file
2. if the issue touches fallback cards, inspect both:
   - `deploy/orchestrator/service-registry.example.json`
   - `deploy/backend/cheeze-backend-agent-config.example.json`
3. run targeted lint against the changed web files

Example:

```bash
cd D:\Project\web
npx eslint src/components/admin/ServiceStatusGrid.tsx src/app/api/admin/status/route.ts src/app/api/control/services/route.ts
```

### Commit Strategy

Use small, isolated commits for admin-page fixes.

Recent commits from this troubleshooting cycle:

- `7a11952` `Surface admin service-panel fetch failures explicitly`
- `2b39bea` `Keep admin service cards usable when status route degrades`
- `7e82cd5` `Expose service registry to control-api containers`
- `1e150be` `Restore hardcore server to gateway service registry`

### Gateway Deployment

For admin frontend changes:

```bash
cd /var/www/home
git pull origin main

cd /var/www/home/deploy/docker
docker compose build web
docker compose up -d --force-recreate --no-deps web
```

For control-plane or registry changes:

```bash
cd /var/www/home
git pull origin main

cd /var/www/home/deploy/docker
docker compose up -d --force-recreate --no-deps control-api
```

### Browser Refresh

After redeploying `web`, use `Ctrl+Shift+R` in the browser before assuming the new JS bundle is active.

## Troubleshooting Record

## Incident A: Service panel hid the real failure

### Symptom

- service tab was slow
- sometimes it never loaded
- UI remained in an ambiguous loading state

### Root Cause

`portal-api /admin/status` could return `200 OK` with `services = null`.

That prevented the web layer from distinguishing:

- a valid empty list
- a malformed upstream payload
- a hidden control-plane failure

### Fix

- `web/src/app/api/admin/status/route.ts` now treats invalid `services` payloads as an upstream failure
- `web/src/components/admin/ServiceStatusGrid.tsx` now separates:
  - initial loading
  - empty list
  - error state

## Incident B: Stricter validation made the whole panel disappear

### Symptom

After stricter validation, the service panel could show a full error banner instead of cards.

### Root Cause

`/api/admin/status` was degraded, but `/api/control/services` was still capable of returning usable offline cards.

### Fix

`ServiceStatusGrid.tsx` now:

- tries `/api/admin/status` first
- falls back to `/api/control/services`
- keeps cards visible when fallback data exists
- shows warnings instead of removing the whole grid

## Incident C: `services` stayed empty even when APIs were alive

### Symptom

Observed payload:

```json
{
  "services": [],
  "control_api": {
    "ok": true,
    "service_count": 0,
    "internal_secret_configured": true,
    "reachable": true
  }
}
```

### Root Cause

The `control-api` container did not have access to the service registry file.

The runtime fix was:

- mount `../orchestrator/service-registry.example.json` into the container
- set `CHEEZE_SERVICE_REGISTRY=/app/service-registry.example.json`

### Verification

```bash
cd /var/www/home/deploy/docker
docker compose exec -T control-api sh -lc 'echo "$CHEEZE_SERVICE_REGISTRY"; ls -l /app/service-registry.example.json'
```

Expected:

- path is `/app/service-registry.example.json`
- file exists inside the container

## Incident D: `minecraft-hardcore` did not appear

### Symptom

- backend-agent config contained `minecraft-hardcore`
- admin service cards did not

### Root Cause

`deploy/orchestrator/service-registry.example.json` was missing the `minecraft-hardcore` entry.

Because offline fallback cards depend on the gateway registry, the service was invisible whenever the backend was asleep or unreachable.

### Fix

- rebuilt `deploy/orchestrator/service-registry.example.json` as valid JSON
- added the `minecraft-hardcore` service entry

### Rule

When adding or renaming a backend-managed service, update both:

- `deploy/backend/cheeze-backend-agent-config.example.json`
- `deploy/orchestrator/service-registry.example.json`

## Incident E: Gateway `git pull` was blocked by local edits

### Symptom

On the gateway:

```text
error: Your local changes to the following files would be overwritten by merge:
deploy/orchestrator/service-registry.example.json
```

### Root Cause

The gateway working tree had local modifications to the registry file.

### Safe Recovery

Avoid a broad `git reset --hard` unless you intend to discard all local work.

Safer file-scoped recovery:

```bash
cp deploy/orchestrator/service-registry.example.json /tmp/service-registry.example.json.bak
git checkout -- deploy/orchestrator/service-registry.example.json
git pull origin main
```

or:

```bash
mv deploy/orchestrator/service-registry.example.json /tmp/service-registry.example.json.local
git pull origin main
```

## Known Separate Issues

These were observed during the same debugging session but are not the direct cause of missing service cards:

- `GET /admin/no-sleep` returned `404`
- `GET /admin/hibernate/debug` returned `502`

These belong to the sleep-management path, not the service-panel path.

## Verification Commands

### Service API Checks

```bash
curl -s http://127.0.0.1:3000/api/control/services | python3 -m json.tool
curl -s http://127.0.0.1:3000/api/admin/status | python3 -m json.tool
```

Expected when backend is asleep:

- `services` is still non-empty
- services are marked `offline`
- `backend_reachable` is `false`

### Container Registry Checks

```bash
cd /var/www/home/deploy/docker

docker compose exec -T control-api sh -lc 'grep -n "minecraft-hardcore" /app/service-registry.example.json'
docker compose exec -T control-api sh -lc 'python3 - <<'"'"'PY'"'"'
import json
with open("/app/service-registry.example.json", "r", encoding="utf-8") as f:
    data = json.load(f)
print([s["id"] for s in data["services"] if s.get("enabled", True)])
PY'
```

### Web Checks

```bash
cd /var/www/home/deploy/docker
docker compose logs --tail 100 web
docker compose build --no-cache web
docker compose up -d --force-recreate --no-deps web
```

## Closeout Checklist

Before closing an admin-page incident, verify all of the following:

- required commits are actually on `origin/main`
- gateway can `git pull origin main` cleanly
- `control-api` sees the registry file inside the container
- `api/control/services` returns non-empty cards
- `api/admin/status` returns the same non-empty cards
- browser hard refresh shows the same services as the API output

## Lessons Learned

- The admin service panel is a multi-hop chain; do not debug it only from the browser
- The gateway registry is runtime data, not disposable example data
- Partial degradation should prefer usable fallback cards over blank panels
- Gateway deployment failures are often working-tree issues, not code issues
- Service inventory must stay synchronized between gateway registry and backend-agent config
