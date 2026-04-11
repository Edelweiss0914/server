# Tailscale Phase 2 Assets

This directory contains ready-to-use assets for Phase 2.

Files:

- `gateway-lxc-rocky9.sh`
  Run inside `gateway-lxc` to install and bring up Tailscale.
- `windows-backend-tailscale.ps1`
  Run on the Windows backend desktop to enable Tailscale with split-tunnel-safe settings.
- `unprivileged-lxc-host-snippet.conf`
  Host-side LXC config snippet for a future unprivileged gateway container.

Related gateway asset:

- `../gateway/ollama.conf.example`
  Nginx reverse proxy skeleton for `ollama.edelweiss0297.cloud`.

Recommended execution order:

1. Run `gateway-lxc-rocky9.sh` inside CT 200.
2. Run `windows-backend-tailscale.ps1` on the desktop.
3. Record both `100.x.x.x` Tailscale IPv4 addresses.
4. Test:
   - `tailscale ping <peer-ts-ip>`
   - `ping <peer-ts-ip>`
5. Start Ollama on Windows and verify:
   - `curl http://127.0.0.1:11434/api/tags` on Windows
   - `curl http://<desktop-ts-ip>:11434/api/tags` from `gateway-lxc`
6. Copy `../gateway/ollama.conf.example` to `/etc/nginx/conf.d/ollama.conf`.
7. Replace:
   - `100.90.40.50` with the real desktop Tailscale IP
   - `ollama.edelweiss0297.cloud` with the final hostname if needed
8. Validate and reload nginx:
   - `nginx -t`
   - `systemctl reload nginx`

Note:

- Current environment is `privileged` CT 200.
- The `unprivileged-lxc-host-snippet.conf` file is for the future hardening path, not the current live container.
