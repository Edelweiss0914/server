<#
.SYNOPSIS
  Keeps cheeze-backend-agent.py running.
  On any exit (crash, kill, update), restarts the agent after a short delay.
  This script is run by the "CHEEZE Backend Agent" scheduled task.
#>

$AgentPath = Join-Path $PSScriptRoot "cheeze-backend-agent.py"

while ($true) {
    & python $AgentPath
    $code = $LASTEXITCODE
    Write-Output "[$(Get-Date -Format 'HH:mm:ss')] Agent exited (code $code). Restarting in 5s..."
    Start-Sleep -Seconds 5
}
