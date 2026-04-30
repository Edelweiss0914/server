# Hardcore Auto-start

Updated: 2026-04-29

## Summary

- `minecraft-hardcore` now starts automatically at `20:00 KST`.
- The schedule runs on Gateway LXC inside `cheeze-control-api`.
- When the backend PC is asleep, the scheduler uses the existing `WOL -> backend start` chain.
- The hardcore server still has a `00:00 KST` backend-side time restriction stop.
- The previous `20 minute empty server` auto-stop is disabled for hardcore.

## Control Plane

Source of truth for the schedule:

- [deploy/orchestrator/service-registry.example.json](/D:/Project/deploy/orchestrator/service-registry.example.json)

Relevant runtime:

- [deploy/gateway/cheeze-control-api.py](/D:/Project/deploy/gateway/cheeze-control-api.py)

## Registry Shape

```json
{
  "id": "minecraft-hardcore",
  "auto_start": {
    "enabled": true,
    "time": "20:00",
    "grace_minutes": 15,
    "weekdays_only": false
  }
}
```

## Environment Variables

- `CHEEZE_CONTROL_AUTOSTART_POLL_SECONDS`
- `CHEEZE_CONTROL_AUTOSTART_GRACE_MINUTES`

## Backend Config

The backend agent keeps hardcore time-restriction handling, but no longer requires
an idle timeout for the service. That allows:

- scheduled auto-start at `20:00`
- forced stop at `00:00`
- no 20-minute empty-server shutdown
