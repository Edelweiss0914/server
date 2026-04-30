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
    backend_agent._last_running_seen.clear()
    backend_agent._last_player_count.clear()
    backend_agent._shutdown_warnings_sent.clear()
    backend_agent._last_auto_save.clear()
    backend_agent._time_restriction_warnings_sent.clear()
    backend_agent._last_time_restriction_remaining.clear()
    backend_agent._time_restriction_stop_dispatched.clear()

  def test_check_hibernate_conditions_blocks_when_inhibit_active(self) -> None:
    config = hibernate_ready_config()
    backend_agent._hibernate_inhibit_until = time.time() + 120

    with mock.patch.object(backend_agent, "_no_sleep_flag_path", return_value=Path(__file__).with_name("missing-no-sleep.flag")), \
         mock.patch.object(backend_agent.shutil, "disk_usage", return_value=DiskUsage(100, 10, 90)):
      self.assertFalse(backend_agent._check_hibernate_conditions(config))

  def test_check_hibernate_conditions_allows_when_no_sleep_flag_absent(self) -> None:
    config = hibernate_ready_config()

    with mock.patch.object(backend_agent, "_no_sleep_flag_path", return_value=Path(__file__).with_name("missing-no-sleep.flag")), \
         mock.patch.object(backend_agent.shutil, "disk_usage", return_value=DiskUsage(100, 10, 90 * (1024 ** 3))):
      self.assertTrue(backend_agent._check_hibernate_conditions(config))

  def test_check_hibernate_conditions_blocks_when_no_sleep_flag_present(self) -> None:
    config = hibernate_ready_config()

    with mock.patch.object(backend_agent, "_no_sleep_flag_path", return_value=Path(__file__)), \
         mock.patch.object(backend_agent.shutil, "disk_usage", return_value=DiskUsage(100, 10, 90 * (1024 ** 3))):
      self.assertFalse(backend_agent._check_hibernate_conditions(config))

  def test_watchdog_tick_arms_inhibit_after_resume_gap(self) -> None:
    config = hibernate_ready_config()
    backend_agent._last_watchdog_wallclock = time.time() - 600

    with mock.patch.object(backend_agent, "load_config", return_value=config), \
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

  def test_watchdog_tick_keeps_time_restriction_checks_without_idle_timeout(self) -> None:
    config = {
      "hibernate_policy": {
        "enabled": False,
        "check_interval_seconds": 60,
      },
      "services": [
        {
          "id": "minecraft-hardcore",
          "enabled": True,
          "idle_policy": {
            "enabled": True,
            "player_check": {
              "enabled": True,
              "type": "minecraft",
              "host": "127.0.0.1",
              "port": 25567,
            },
          },
        }
      ],
    }

    with mock.patch.object(backend_agent, "_check_self_update"), \
         mock.patch.object(backend_agent, "load_config", return_value=config), \
         mock.patch.object(backend_agent, "service_status", return_value={"state": "running"}), \
         mock.patch.object(backend_agent, "maybe_enforce_time_restriction_stop", return_value=False), \
         mock.patch.object(backend_agent, "send_time_restriction_warning") as mock_time_warning, \
         mock.patch.object(backend_agent, "minecraft_player_count", return_value=0), \
         mock.patch.object(backend_agent, "maybe_auto_save"), \
         mock.patch.object(backend_agent, "stop_service") as mock_stop_service:
      backend_agent._watchdog_tick()

    mock_time_warning.assert_called_once()
    mock_stop_service.assert_not_called()


class StopServiceTests(unittest.TestCase):
  def test_stop_service_uses_tracked_pid_fallback_when_stop_command_leaves_service_running(self) -> None:
    service = {
      "id": "minecraft-hardcore",
      "working_dir": r"D:\Servers\Minecraft\Hardcore",
      "stop_command": r"powershell -ExecutionPolicy Bypass -File D:\Servers\Control\minecraft-hardcore\stop.ps1",
      "process_name": "java.exe",
      "metadata": {
        "control_dir": r"D:\Servers\Control\minecraft-hardcore",
      },
    }

    completed = mock.Mock(returncode=0, stdout="timed out waiting", stderr="")
    states = [
      {"state": "running"},
      {"state": "offline"},
    ]

    with mock.patch.object(backend_agent.subprocess, "run", return_value=completed) as mock_run, \
         mock.patch.object(backend_agent, "service_status", side_effect=states), \
         mock.patch.object(backend_agent, "active_tracked_pids", return_value=[18936]):
      status_code, payload = backend_agent.stop_service(service)

    self.assertEqual(status_code, 202)
    self.assertIn("tracked PID fallback", payload["message"])
    self.assertEqual(mock_run.call_args_list[1].args[0], ["taskkill", "/PID", "18936", "/T", "/F"])

  def test_stop_service_reports_failure_when_service_stays_running(self) -> None:
    service = {
      "id": "minecraft-hardcore",
      "working_dir": r"D:\Servers\Minecraft\Hardcore",
      "stop_command": r"powershell -ExecutionPolicy Bypass -File D:\Servers\Control\minecraft-hardcore\stop.ps1",
      "process_name": "java.exe",
      "metadata": {
        "control_dir": r"D:\Servers\Control\minecraft-hardcore",
      },
    }

    completed = mock.Mock(returncode=0, stdout="still running", stderr="")
    states = [
      {"state": "running"},
      {"state": "running"},
      {"state": "running"},
    ]

    with mock.patch.object(backend_agent.subprocess, "run", return_value=completed), \
         mock.patch.object(backend_agent, "service_status", side_effect=states), \
         mock.patch.object(backend_agent, "active_tracked_pids", return_value=[18936]):
      status_code, payload = backend_agent.stop_service(service)

    self.assertEqual(status_code, 500)
    self.assertEqual(payload["error"], "stop_command_failed")
    self.assertIn("still running", payload["stdout"])


class TimeRestrictionGraceTests(unittest.TestCase):
  def setUp(self) -> None:
    backend_agent._hibernate_inhibit_until = 0.0
    backend_agent._last_watchdog_wallclock = None
    backend_agent._last_running_seen.clear()
    backend_agent._last_player_count.clear()
    backend_agent._shutdown_warnings_sent.clear()
    backend_agent._last_auto_save.clear()
    backend_agent._time_restriction_warnings_sent.clear()
    backend_agent._last_time_restriction_remaining.clear()
    backend_agent._time_restriction_stop_dispatched.clear()

  def test_watchdog_tick_uses_extended_time_restriction_grace_window(self) -> None:
    config = {
      "hibernate_policy": {
        "enabled": False,
        "check_interval_seconds": 30,
      },
      "services": [
        {
          "id": "minecraft-hardcore",
          "enabled": True,
          "idle_policy": {
            "enabled": False,
          },
        }
      ],
    }

    with mock.patch.object(backend_agent, "_check_self_update"), \
         mock.patch.object(backend_agent, "load_config", return_value=config), \
         mock.patch.object(backend_agent, "service_status", return_value={"state": "running"}), \
         mock.patch.object(backend_agent, "maybe_enforce_time_restriction_stop", return_value=False) as mock_stop, \
         mock.patch.object(backend_agent, "send_time_restriction_warning"), \
         mock.patch.object(backend_agent, "maybe_auto_save"):
      backend_agent._watchdog_tick()

    self.assertEqual(mock_stop.call_args.args[1], backend_agent.TIME_RESTRICTION_STOP_GRACE_SECONDS)

  def test_time_restriction_stop_retries_when_stop_service_reports_failure(self) -> None:
    service = {
      "id": "minecraft-hardcore",
      "time_restriction": {
        "enabled": True,
        "end": "16:00",
        "weekdays_only": False,
      },
    }

    with mock.patch.object(backend_agent, "_seconds_since_most_recent_time", return_value=30), \
         mock.patch.object(backend_agent.datetime, "datetime", wraps=backend_agent.datetime.datetime) as mock_datetime, \
         mock.patch.object(backend_agent, "stop_service", return_value=(500, {"error": "stop_command_failed"})):
      mock_datetime.now.return_value = backend_agent.datetime.datetime(2026, 4, 30, 16, 0, 30)
      result = backend_agent.maybe_enforce_time_restriction_stop(service, 600)

    self.assertFalse(result)
    self.assertNotIn("minecraft-hardcore", backend_agent._time_restriction_stop_dispatched)


if __name__ == "__main__":
  unittest.main()
