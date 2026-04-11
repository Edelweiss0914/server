# Backend Agent Scaffold

This directory contains the first scaffold for a generic `homepc` backend agent.

Files:

- `cheeze-backend-agent.py`
  - Simple HTTP control agent for Windows.
- `cheeze-backend-agent-config.example.json`
  - Example registry/config for `ollama`, `minecraft-vanilla`, and a modpack template.

Current limitations:

- Hibernate automation is not implemented yet.
- Minecraft start/stop commands are placeholders and must be filled in.
- Authentication/authorization is intentionally not implemented in this first scaffold.

Recommended next steps:

1. Fill in the real `minecraft-vanilla` start and stop commands.
2. Decide whether `friends` can call start/stop directly or only through approved invite tokens later.
3. Install the backend agent as a Windows background service or scheduled task.
4. Add hibernate guard logic after service start/stop flows are stable.

Additional helper:

- `install-backend-agent.ps1.example`
  - Example scheduled-task based installation for the backend agent.
