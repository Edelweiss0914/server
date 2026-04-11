$ErrorActionPreference = "Stop"

$TS = Join-Path $env:ProgramFiles "Tailscale\tailscale.exe"

if (-not (Test-Path $TS)) {
    throw "tailscale.exe not found at $TS"
}

& $TS up --hostname backend-desktop
& $TS set --exit-node=
& $TS set --accept-routes=false
& $TS set --accept-dns=false

& $TS version
& $TS ip -4
& $TS status

Write-Host ""
Write-Host "Next checks:"
Write-Host "1. Confirm tray icon login completed."
Write-Host "2. Confirm Exit Node is None."
Write-Host "3. Record the Tailscale IPv4 for backend-desktop."
