# Hardcore Deathban Plugin

A minimal Paper plugin for the hardcore server.

Behavior:
- When a player dies, they are kicked from the server immediately.
- The player cannot reconnect until the cooldown expires.
- The default cooldown is 120 minutes.
- Cooldown data survives server restarts.

Design goals:
- Keep the behavior close to vanilla hardcore tension.
- Add the smallest amount of server-side state possible.
- Avoid external dependencies and network-based builds.

Project layout:
- `src/main/java` - plugin source
- `src/main/resources/plugin.yml` - Paper plugin metadata
- `src/main/resources/config.yml` - default settings
- `build.ps1` - local build script using the installed Minecraft Launcher JDK

Build:

```powershell
powershell -ExecutionPolicy Bypass -File .\build.ps1
```

Output:
- `build\libs\hardcore-deathban-1.0.0.jar`

Install:
1. Build the jar.
2. Copy the jar into `D:\Servers\Minecraft\Hardcore\plugins\`.
3. Restart the server.

Runtime files:
- `plugins\HardcoreDeathban\config.yml`
- `plugins\HardcoreDeathban\death-bans.yml`
