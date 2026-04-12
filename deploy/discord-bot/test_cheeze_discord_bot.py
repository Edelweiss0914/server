import asyncio
import importlib.util
import os
import sys
import types
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock


def install_discord_stub():
  discord_module = types.ModuleType("discord")

  class Member:
    pass

  class Interaction:
    pass

  class Object:
    def __init__(self, id):
      self.id = id

  class Intents:
    @staticmethod
    def default():
      return Intents()

  discord_module.Member = Member
  discord_module.Interaction = Interaction
  discord_module.Object = Object
  discord_module.Intents = Intents

  app_commands_module = types.ModuleType("discord.app_commands")

  class Choice:
    def __init__(self, name, value):
      self.name = name
      self.value = value

  def command(*args, **kwargs):
    def decorator(func):
      def autocomplete(_name):
        def inner(callback):
          return callback
        return inner

      func.autocomplete = autocomplete
      return func
    return decorator

  def describe(**kwargs):
    def decorator(func):
      return func
    return decorator

  app_commands_module.Choice = Choice
  app_commands_module.command = command
  app_commands_module.describe = describe
  discord_module.app_commands = app_commands_module

  ext_module = types.ModuleType("discord.ext")
  commands_module = types.ModuleType("discord.ext.commands")

  class Bot:
    def __init__(self, *args, **kwargs):
      self.tree = SimpleNamespace(
        copy_global_to=lambda guild=None: None,
        sync=_async_noop,
      )

    async def add_cog(self, cog):
      return None

  class Cog:
    pass

  commands_module.Bot = Bot
  commands_module.Cog = Cog
  ext_module.commands = commands_module

  sys.modules["discord"] = discord_module
  sys.modules["discord.app_commands"] = app_commands_module
  sys.modules["discord.ext"] = ext_module
  sys.modules["discord.ext.commands"] = commands_module


async def _async_noop(*args, **kwargs):
  return None


install_discord_stub()

MODULE_PATH = Path(__file__).with_name("cheeze-discord-bot.py")
SPEC = importlib.util.spec_from_file_location("cheeze_discord_bot", MODULE_PATH)
discord_bot = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(discord_bot)


class DiscordBotConfigTests(unittest.TestCase):
  def test_load_config_defaults_to_multi_server_and_split_tokens(self):
    env = {
      "DISCORD_BOT_TOKEN": "discord-token",
      "DISCORD_APPLICATION_ID": "123",
      "DISCORD_GUILD_ID": "456",
      "DISCORD_ADMIN_ROLE_IDS": "1",
      "DISCORD_MEMBER_ROLE_IDS": "2",
      "CHEEZE_BOT_START_CONTROL_TOKEN": "start-token",
      "CHEEZE_BOT_STOP_CONTROL_TOKEN": "stop-token",
    }

    with mock.patch.dict(os.environ, env, clear=True):
      config = discord_bot.load_config()

    self.assertEqual(config.managed_servers, ["minecraft-vanilla", "minecraft-cobbleverse"])
    self.assertEqual(config.start_control_token, "start-token")
    self.assertEqual(config.stop_control_token, "stop-token")

  def test_load_config_accepts_legacy_single_control_token(self):
    env = {
      "DISCORD_BOT_TOKEN": "discord-token",
      "DISCORD_APPLICATION_ID": "123",
      "DISCORD_GUILD_ID": "456",
      "CHEEZE_BOT_CONTROL_TOKEN": "legacy-token",
    }

    with mock.patch.dict(os.environ, env, clear=True):
      config = discord_bot.load_config()

    self.assertEqual(config.start_control_token, "legacy-token")
    self.assertEqual(config.stop_control_token, "legacy-token")


class DiscordBotPermissionTests(unittest.TestCase):
  def setUp(self):
    self.config = discord_bot.BotConfig(
      bot_token="discord-token",
      application_id=123,
      guild_id=456,
      admin_role_ids={10},
      member_role_ids={20},
      portal_api_base="http://127.0.0.1:11437",
      start_control_token="start-token",
      stop_control_token="stop-token",
      control_header="X-Cheeze-Control-Token",
      request_timeout=30,
      managed_servers=["minecraft-vanilla", "minecraft-cobbleverse"],
    )

  def member(self, *role_ids):
    return SimpleNamespace(roles=[SimpleNamespace(id=role_id) for role_id in role_ids])

  def test_members_can_start_but_cannot_stop(self):
    member = self.member(20)

    self.assertTrue(discord_bot.can_start(member, self.config))
    self.assertFalse(discord_bot.can_stop(member, self.config))

  def test_admins_can_start_and_stop(self):
    admin = self.member(10)

    self.assertTrue(discord_bot.can_start(admin, self.config))
    self.assertTrue(discord_bot.can_stop(admin, self.config))

  def test_service_allowed_uses_multi_server_scope(self):
    self.assertTrue(discord_bot.service_allowed("minecraft-vanilla", self.config))
    self.assertTrue(discord_bot.service_allowed("minecraft-cobbleverse", self.config))
    self.assertFalse(discord_bot.service_allowed("ollama", self.config))


class DiscordBotActionTokenTests(unittest.TestCase):
  def setUp(self):
    self.config = discord_bot.BotConfig(
      bot_token="discord-token",
      application_id=123,
      guild_id=456,
      admin_role_ids={10},
      member_role_ids={20},
      portal_api_base="http://127.0.0.1:11437",
      start_control_token="start-token",
      stop_control_token="stop-token",
      control_header="X-Cheeze-Control-Token",
      request_timeout=30,
      managed_servers=["minecraft-vanilla", "minecraft-cobbleverse"],
    )
    self.bot = SimpleNamespace(config=self.config)
    self.cog = discord_bot.GameControlCog(self.bot)

  def test_control_token_for_action_uses_scoped_tokens(self):
    self.assertEqual(discord_bot.control_token_for_action("start", self.config), "start-token")
    self.assertEqual(discord_bot.control_token_for_action("stop", self.config), "stop-token")

  def test_control_action_uses_stop_token_for_stop_requests(self):
    async def fake_to_thread(func, *args):
      return func(*args)

    with mock.patch.object(discord_bot.asyncio, "to_thread", side_effect=fake_to_thread), \
         mock.patch.object(discord_bot, "http_fetch", return_value={"status_code": 202, "payload": {}}) as mocked_fetch:
      result = asyncio.run(self.cog.control_action("minecraft-cobbleverse", "stop"))

    self.assertEqual(result["status_code"], 202)
    mocked_fetch.assert_called_once_with(
      self.config,
      "/services/minecraft-cobbleverse/stop",
      "POST",
      {},
      "stop-token",
    )


if __name__ == "__main__":
  unittest.main()
