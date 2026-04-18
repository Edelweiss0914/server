#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"
LEGACY_SERVICES=(
  cheeze-portal-api
  cheeze-control-api
  cheeze-ai-queue
  cheeze-nextjs
)

echo "==> Stopping legacy systemd services that conflict with Docker ports"
for svc in "${LEGACY_SERVICES[@]}"; do
  if systemctl list-unit-files "${svc}.service" >/dev/null 2>&1; then
    systemctl stop "${svc}" || true
    systemctl disable "${svc}" || true
    echo "  - ${svc}: stopped/disabled"
  fi
done

echo "==> Building Gateway application images"
docker compose -f "$COMPOSE_FILE" build portal-api control-api ai-queue web nginx

echo "==> Starting Docker Compose services"
docker compose -f "$COMPOSE_FILE" up -d \
  control-api \
  portal-api \
  ai-queue \
  pterodactyl-db \
  pterodactyl-cache \
  pterodactyl-panel \
  web \
  nginx

echo "==> Service status"
docker compose -f "$COMPOSE_FILE" ps

echo "==> Verifying local health endpoints"
curl -fsS http://127.0.0.1:11436/healthz >/dev/null
curl -fsS http://127.0.0.1:11437/healthz >/dev/null
curl -fsS http://127.0.0.1:11435/healthz >/dev/null
curl -fsSI http://127.0.0.1:3000 >/dev/null

echo "Migration complete. cloudflared remains native; Gateway app services are now Compose-managed."
