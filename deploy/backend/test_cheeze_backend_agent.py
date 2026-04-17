import importlib.util
import time
import unittest
from collections import namedtuple
from pathlib import Path
from unittest import mock


MODULE_PATH = Path(__file__).with_name("cheeze-backend-agent.py")
SPEC = importlib.util.spec_from_file_location("cheeze_backend_agent", MODULE_PATH)
backend_agent = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(backend_agent)
DiskUsage = namedtuple("DiskUsage", ["total", "used", "free"])


def hibernate_ready_config() -> dict:
  return {
    "host": {
      "user_activity_guard": {
        "enabled": True,
        "input_idle_minutes": 20,
      }
    },
    "hibernate_policy": {
      "enabled": True,
      "check_interval_seconds": 60,
      "resume_grace_seconds": 180,
      "start_request_grace_seconds": 600,
    },
    "services": [],
  }


class HibernateGraceTests(unittest.TestCase):
  def setUp(self) -> None:
    backend_agent._hibernate_inhibit_until = 0.0
    backend_agent._last_watchdog_wallclock = None

  def test_check_hibernate_conditions_blocks_when_inhibit_active(self) -> None:
    config = hibernate_ready_config()
    backend_agent._hibernate_inhibit_until = time.time() + 120

    with mock.patch.object(backend_agent, "get_user_idle_seconds", return_value=3600), \
         mock.patch.object(backend_agent, "has_active_user_session", return_value=False), \
         mock.patch.object(backend_agent, "_no_sleep_flag_path", return_value=Path(__file__).with_name("missing-no-sleep.flag")), \
         mock.patch.object(backend_agent.shutil, "disk_usage", return_value=DiskUsage(100, 10, 90)):
      self.assertFalse(backend_agent._check_hibernate_conditions(config))

  def test_watchdog_tick_arms_inhibit_after_resume_gap(self) -> None:
    config = hibernate_ready_config()
    backend_agent._last_watchdog_wallclock = time.time() - 600

    with mock.patch.object(backend_agent, "load_config", return_value=config), \
         mock.patch.object(backend_agent, "get_user_idle_seconds", return_value=3600), \
         mock.patch.object(backend_agent, "has_active_user_session", return_value=False), \
         mock.patch.object(backend_agent, "_no_sleep_flag_path", return_value=Path(__file__).with_name("missing-no-sleep.flag")), \
         mock.patch.object(backend_agent.shutil, "disk_usage", return_value=DiskUsage(100, 10, 90)), \
         mock.patch.object(backend_agent.subprocess, "run") as mock_run:
      backend_agent._watchdog_tick()

    self.assertGreater(backend_agent._hibernate_inhibit_until, time.time())
    mock_run.assert_not_called()

  def test_service_start_inhibit_uses_configured_grace(self) -> None:
    config = hibernate_ready_config()
    start = time.time()

    backend_agent._arm_service_start_hibernate_inhibit(config, "minecraft-cobbleverse")

    self.assertGreaterEqual(backend_agent._hibernate_inhibit_until, start + 590)


if __name__ == "__main__":
  unittest.main()
