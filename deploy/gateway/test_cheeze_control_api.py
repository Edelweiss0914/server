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


if __name__ == "__main__":
  unittest.main()
