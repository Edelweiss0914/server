#!/bin/bash
# Docker CE installation script for Rocky Linux 9.x (LXC with nesting)
# Run as root on the Gateway LXC
#
# Prerequisites:
#   - Proxmox: enable nesting for this LXC
#     pct set <CTID> -features nesting=1
#   - Reboot the LXC after enabling nesting
#
# Usage:
#   chmod +x setup-docker-rocky.sh
#   ./setup-docker-rocky.sh

set -euo pipefail

echo "=== Docker CE Setup for Rocky Linux 9 (LXC) ==="

# 1. Remove old Docker packages if present
echo "[1/5] Removing old Docker packages..."
dnf remove -y docker docker-client docker-client-latest docker-common \
  docker-latest docker-latest-logrotate docker-logrotate docker-engine 2>/dev/null || true

# 2. Add Docker CE repository
echo "[2/5] Adding Docker CE repository..."
dnf install -y dnf-plugins-core
dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo

# 3. Install Docker CE + Compose plugin
echo "[3/5] Installing Docker CE + Compose plugin..."
dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 4. Enable and start Docker
echo "[4/5] Starting Docker..."
systemctl enable --now docker

# 5. Verify
echo "[5/5] Verifying installation..."
docker --version
docker compose version

echo ""
echo "=== Docker installation complete ==="
echo ""
echo "Next steps:"
echo "  1. Copy .env.example to .env and fill in secrets"
echo "  2. Run: docker compose up -d"
echo "  3. Verify: docker compose ps"
