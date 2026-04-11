#!/usr/bin/env bash
set -euo pipefail

# Run inside gateway-lxc (CT 200, Rocky Linux 9.x).
# This script installs Tailscale and brings the node online.
#
# Usage:
#   bash gateway-lxc-rocky9.sh
#
# After running "tailscale up", open the login URL in a browser.

curl -fsSL https://tailscale.com/install.sh | sh
systemctl enable --now tailscaled
systemctl status tailscaled --no-pager

tailscale up \
  --hostname=gateway-lxc \
  --accept-routes=false

tailscale version
tailscale ip -4
tailscale status
