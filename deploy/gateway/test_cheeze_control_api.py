import importlib.util
import unittest
from pathlib import Path
from unittest import mock


MODULE_PATH = Path(__file__).with_name("cheeze-control-api.py")
SPEC = importlib.util.spec_from_file_location("cheeze_control_api", MODULE_PATH)
control_api = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(control_api)


class ControlApiOfflineFallbackTests(unittest.TestCase):
  def with_registry(self, registry):
    return mock.patch.object(control_api, "load_registry", return_value=registry)

  def test_find_registry_service_returns_known_service(self):
    registry = {
      "services": [
        {
          "id": "minecraft-vanilla",
          "display_name": "Minecraft Vanilla",
          "enabled": True,
        }
      ]
    }

    with self.with_registry(registry):
      service = control_api.find_registry_service("minecraft-vanilla")

    self.assertIsNotNone(service)
    self.assertEqual(service["display_name"], "Minecraft Vanilla")

  def test_offline_service_payload_marks_backend_unreachable_as_offline(self):
    registry = {
      "services": [
        {
          "id": "minecraft-vanilla",
          "display_name": "Minecraft Vanilla",
          "enabled": True,
        }
      ]
    }

    with self.with_registry(registry):
      service = control_api.find_registry_service("minecraft-vanilla")
      payload = control_api.offline_service_payload(service)

    self.assertEqual(payload["id"], "minecraft-vanilla")
    self.assertEqual(payload["state"], "offline")
    self.assertFalse(payload["backend_reachable"])
    self.assertIn("backend agent unreachable", payload["message"])

  def test_offline_services_payload_skips_disabled_services(self):
    registry = {
      "services": [
        {
          "id": "minecraft-vanilla",
          "display_name": "Minecraft Vanilla",
          "enabled": True,
        },
        {
          "id": "disabled-service",
          "display_name": "Disabled Service",
          "enabled": False,
        },
      ]
    }

    with self.with_registry(registry):
      payload = control_api.offline_services_payload()

    self.assertFalse(payload["backend_reachable"])
    self.assertEqual(len(payload["services"]), 1)
    self.assertEqual(payload["services"][0]["id"], "minecraft-vanilla")


class ControlApiWakeTests(unittest.TestCase):
  def test_build_wol_command_uses_configured_target(self):
    with mock.patch.object(control_api, "WOL_COMMAND", ""), \
         mock.patch.object(control_api, "WOL_BINARY", "wakeonlan"), \
         mock.patch.object(control_api, "WOL_TARGET_IP", "192.168.50.255"), \
         mock.patch.object(control_api, "WOL_TARGET_PORT", 9), \
         mock.patch.object(control_api, "WOL_MAC", "9C-6B-00-57-73-3A"):
      command = control_api.build_wol_command()

    self.assertEqual(
      command,
      ["wakeonlan", "-i", "192.168.50.255", "-p", "9", "9C-6B-00-57-73-3A"],
    )

  def test_decode_backend_payload_keeps_non_json_body_as_raw_excerpt(self):
    payload = control_api.decode_backend_payload(
      b"<html><body>502 Bad Gateway</body></html>",
      fallback_message="backend start request completed",
    )

    self.assertEqual(payload["message"], "backend start request completed")
    self.assertIn("502 Bad Gateway", payload["raw_body"])

  def test_run_wol_reports_missing_binary(self):
    with mock.patch.object(control_api, "build_wol_command", return_value=["wakeonlan", "aa:bb:cc:dd:ee:ff"]), \
         mock.patch.object(control_api.subprocess, "run", side_effect=FileNotFoundError("wakeonlan not found")):
      result = control_api.run_wol()

    self.assertEqual(result["returncode"], 127)
    self.assertEqual(result["error"], "wol_command_not_found")


if __name__ == "__main__":
  unittest.main()
