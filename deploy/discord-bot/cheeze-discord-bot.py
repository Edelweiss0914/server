#!/usr/bin/env python3
"""
Discord bot for CHEEZE game control.

Initial scope:
- Guild-scoped slash commands
- Multi-server status/start/stop across configured game servers
- Direct control via the public portal facade
"""

from __future__ import annotations

import asyncio
import json
import os
import socket
import urllib.error
import urllib.request
from dataclasses import dataclass

import discord
from discord import app_commands
from discord.ext import commands


def parse_id_set(raw: str) -> set[int]:
  values = set()
  for part in (raw or "").split(","):
    item = part.strip()
    if not item:
      continue
    values.add(int(item))
  return values


def parse_csv(raw: str) -> list[str]:
  return [item.strip() for item in (raw or "").split(",") if item.strip()]


DEFAULT_MANAGED_GAME_SERVERS = [
  "minecraft-vanilla",
  "minecraft-cobbleverse",
]


def parse_managed_servers(raw: str | None) -> list[str]:
  return parse_csv(raw or "") or DEFAULT_MANAGED_GAME_SERVERS.copy()


@dataclass
class BotConfig:
  bot_token: str
  application_id: int
  guild_id: int
  admin_role_ids: set[int]
  member_role_ids: set[int]
  portal_api_base: str
  control_token: str
  control_header: str
  request_timeout: int
  managed_servers: list[str]


def load_config() -> BotConfig:
  return BotConfig(
    bot_token=os.environ["DISCORD_BOT_TOKEN"].strip(),
    application_id=int(os.environ["DISCORD_APPLICATION_ID"]),
    guild_id=int(os.environ["DISCORD_GUILD_ID"]),
    admin_role_ids=parse_id_set(os.environ.get("DISCORD_ADMIN_ROLE_IDS", "")),
    member_role_ids=parse_id_set(os.environ.get("DISCORD_MEMBER_ROLE_IDS", "")),
    portal_api_base=os.environ.get("CHEEZE_PORTAL_API_BASE", "http://127.0.0.1:11437").strip(),
    control_token=os.environ["CHEEZE_BOT_CONTROL_TOKEN"].strip(),
    control_header=os.environ.get("CHEEZE_PORTAL_CONTROL_HEADER", "X-Cheeze-Control-Token").strip(),
    request_timeout=int(os.environ.get("CHEEZE_BOT_REQUEST_TIMEOUT", "30")),
    managed_servers=parse_managed_servers(os.environ.get("CHEEZE_MANAGED_GAME_SERVERS")),
  )


STATE_LABELS = {
  "offline": "꺼짐",
  "waking": "깨우는 중",
  "starting": "켜는 중",
  "running": "가동 중",
  "stopping": "종료 중",
  "error": "오류",
}


def state_label(state: str) -> str:
  return STATE_LABELS.get(state or "offline", state or "unknown")


def user_role_ids(member: discord.Member) -> set[int]:
  return {role.id for role in member.roles}


def is_admin(member: discord.Member, config: BotConfig) -> bool:
  return bool(user_role_ids(member) & config.admin_role_ids)


def can_start(member: discord.Member, config: BotConfig) -> bool:
  roles = user_role_ids(member)
  return bool(roles & (config.admin_role_ids | config.member_role_ids))


def can_stop(member: discord.Member, config: BotConfig) -> bool:
  return is_admin(member, config)


def service_allowed(service_id: str, config: BotConfig) -> bool:
  return service_id in config.managed_servers


def http_fetch(config: BotConfig, path: str, method: str = "GET", payload: dict | None = None) -> dict:
  url = f"{config.portal_api_base.rstrip('/')}{path}"
  headers = {"Content-Type": "application/json"}
  if method != "GET":
    headers[config.control_header] = config.control_token

  request = urllib.request.Request(
    url,
    data=json.dumps(payload or {}, ensure_ascii=False).encode("utf-8") if method != "GET" else None,
    headers=headers,
    method=method,
  )
  try:
    with urllib.request.urlopen(request, timeout=config.request_timeout) as response:
      body = response.read()
      return {
        "status_code": response.getcode(),
        "payload": json.loads(body.decode("utf-8")) if body else {},
      }
  except urllib.error.HTTPError as error:
    body = error.read()
    payload = json.loads(body.decode("utf-8")) if body else {}
    return {
      "status_code": error.code,
      "payload": payload,
    }
  except (urllib.error.URLError, TimeoutError, socket.timeout, OSError) as error:
    reason = getattr(error, "reason", error)
    message = str(reason or error).strip() or "request failed"
    return {
      "status_code": 599,
      "payload": {
        "error": "portal_unreachable",
        "message": message,
      },
    }


class CheezeDiscordBot(commands.Bot):
  def __init__(self, config: BotConfig):
    intents = discord.Intents.default()
    super().__init__(command_prefix="!", intents=intents, application_id=config.application_id)
    self.config = config
    self.guild_object = discord.Object(id=config.guild_id)

  async def setup_hook(self):
    await self.add_cog(GameControlCog(self))
    self.tree.copy_global_to(guild=self.guild_object)
    await self.tree.sync(guild=self.guild_object)


class GameControlCog(commands.Cog):
  def __init__(self, bot: CheezeDiscordBot):
    self.bot = bot

  async def interaction_member(self, interaction: discord.Interaction) -> discord.Member | None:
    if interaction.guild_id != self.bot.config.guild_id:
      return None
    if not isinstance(interaction.user, discord.Member):
      return None
    return interaction.user

  async def fetch_services(self) -> list[dict]:
    result = await asyncio.to_thread(http_fetch, self.bot.config, "/services", "GET", None)
    return result["payload"].get("services", [])

  async def fetch_service(self, service_id: str) -> dict | None:
    result = await asyncio.to_thread(http_fetch, self.bot.config, f"/services/{service_id}", "GET", None)
    if result["status_code"] == 404:
      return None
    return result["payload"]

  async def control_action(self, service_id: str, action: str) -> dict:
    return await asyncio.to_thread(
      http_fetch,
      self.bot.config,
      f"/services/{service_id}/{action}",
      "POST",
      {},
    )

  def result_message(self, result: dict, fallback: str) -> str:
    payload = result.get("payload", {})
    return payload.get("message") or payload.get("error") or fallback

  def configured_game_services(self, services: list[dict]) -> list[dict]:
    service_by_id = {
      service.get("id"): service
      for service in services
      if service.get("id")
    }
    return [
      service_by_id[service_id]
      for service_id in self.bot.config.managed_servers
      if service_id in service_by_id
    ]

  def format_service_line(self, service: dict) -> str:
    message = service.get("message", "")
    suffix = f" | {message}" if message else ""
    return f"- {service.get('display_name', service.get('id', 'unknown'))}: {state_label(service.get('state', 'offline'))}{suffix}"

  @app_commands.command(name="games", description="Show the current game server status")
  async def games(self, interaction: discord.Interaction):
    member = await self.interaction_member(interaction)
    if member is None:
      await interaction.response.send_message("This command can only be used in the configured guild.", ephemeral=True)
      return

    if not can_start(member, self.bot.config):
      await interaction.response.send_message("You do not have permission to view game server status.", ephemeral=True)
      return

    await interaction.response.defer(thinking=True)
    result = await asyncio.to_thread(http_fetch, self.bot.config, "/services", "GET", None)
    if not 200 <= result["status_code"] < 300:
      await interaction.followup.send(
        f"Game server status lookup failed: {self.result_message(result, 'Unable to reach the portal right now.')}",
        ephemeral=True,
      )
      return

    services = result["payload"].get("services", [])
    game_services = self.configured_game_services(services)
    if not game_services:
      await interaction.followup.send("No configured game servers are currently available.", ephemeral=True)
      return

    lines = ["Current game server status:"]
    lines.extend(self.format_service_line(service) for service in game_services)
    await interaction.followup.send("\n".join(lines), ephemeral=False)

  @app_commands.command(name="start", description="게임 서버를 시작합니다.")
  @app_commands.describe(server="시작할 게임 서버")
  async def start(self, interaction: discord.Interaction, server: str):
    member = await self.interaction_member(interaction)
    if member is None:
      await interaction.response.send_message("허용된 서버에서만 사용할 수 있습니다.", ephemeral=True)
      return

    if not can_start(member, self.bot.config):
      await interaction.response.send_message("게임 서버를 시작할 권한이 없습니다.", ephemeral=True)
      return

    if not service_allowed(server, self.bot.config):
      await interaction.response.send_message("이 서버는 현재 봇이 제어하지 않습니다.", ephemeral=True)
      return

    await interaction.response.defer(ephemeral=True, thinking=True)
    result = await self.control_action(server, "start")
    payload = result["payload"]
    if 200 <= result["status_code"] < 300:
      wake_message = payload.get("wake_result", {}).get("message", "")
      detail = f"\n기상 상태: {wake_message}" if wake_message else ""
      await interaction.followup.send(
        f"`{server}` 시작 요청을 전달했습니다.{detail}",
        ephemeral=True,
      )
      return

    message = payload.get("message") or payload.get("error") or "시작 요청에 실패했습니다."
    await interaction.followup.send(f"`{server}` 시작 실패: {message}", ephemeral=True)

  @app_commands.command(name="status", description="Check a specific game server status")
  @app_commands.describe(server="Game server to inspect")
  async def status(self, interaction: discord.Interaction, server: str):
    member = await self.interaction_member(interaction)
    if member is None:
      await interaction.response.send_message("This command can only be used in the configured guild.", ephemeral=True)
      return

    if not can_start(member, self.bot.config):
      await interaction.response.send_message("You do not have permission to view game server status.", ephemeral=True)
      return

    if not service_allowed(server, self.bot.config):
      await interaction.response.send_message("That server is not enabled for this bot.", ephemeral=True)
      return

    await interaction.response.defer(thinking=True)
    result = await asyncio.to_thread(http_fetch, self.bot.config, f"/services/{server}", "GET", None)
    if result["status_code"] == 404:
      await interaction.followup.send("That server could not be found.", ephemeral=True)
      return
    if not 200 <= result["status_code"] < 300:
      await interaction.followup.send(
        f"`{server}` status lookup failed: {self.result_message(result, 'Unable to reach the portal right now.')}",
        ephemeral=True,
      )
      return

    service = result["payload"]
    await interaction.followup.send(self.format_service_line(service), ephemeral=False)

  @app_commands.command(name="stop", description="게임 서버를 종료합니다. 관리자 전용입니다.")
  @app_commands.describe(server="종료할 게임 서버")
  async def stop(self, interaction: discord.Interaction, server: str):
    member = await self.interaction_member(interaction)
    if member is None:
      await interaction.response.send_message("허용된 서버에서만 사용할 수 있습니다.", ephemeral=True)
      return

    if not can_stop(member, self.bot.config):
      await interaction.response.send_message("관리자만 서버를 종료할 수 있습니다.", ephemeral=True)
      return

    if not service_allowed(server, self.bot.config):
      await interaction.response.send_message("이 서버는 현재 봇이 제어하지 않습니다.", ephemeral=True)
      return

    await interaction.response.defer(ephemeral=True, thinking=True)
    result = await self.control_action(server, "stop")
    payload = result["payload"]
    if 200 <= result["status_code"] < 300:
      await interaction.followup.send(f"`{server}` 종료 요청을 전달했습니다.", ephemeral=True)
      return

    message = payload.get("message") or payload.get("error") or "종료 요청에 실패했습니다."
    await interaction.followup.send(f"`{server}` 종료 실패: {message}", ephemeral=True)

  @start.autocomplete("server")
  @status.autocomplete("server")
  @stop.autocomplete("server")
  async def server_autocomplete(self, interaction: discord.Interaction, current: str):
    return [
      app_commands.Choice(name=server, value=server)
      for server in self.bot.config.managed_servers
      if current.lower() in server.lower()
    ][:25]


def main():
  config = load_config()
  bot = CheezeDiscordBot(config)
  bot.run(config.bot_token)


if __name__ == "__main__":
  main()
