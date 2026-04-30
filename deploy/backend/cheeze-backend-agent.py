#!/usr/bin/env python3
"""
Backend agent for on-demand service orchestration on homepc.

Capabilities:
- report service status
- start services from a registry
- stop services from a registry
- auto-idle detection with player count checks (Minecraft)
- Windows hibernate when all services are idle and conditions are met

This initial scaffold is intentionally conservative. It supports:
- HTTP readiness checks
- TCP readiness checks
- simple command execution
- process-name based best-effort stop fallback
- IdleWatchdog background thread for auto-stop and hibernate
- /hibernate/debug endpoint for per-condition sleep diagnostics
"""

from __future__ import annotations

import concurrent.futures
import ctypes
import datetime
import hashlib
import json
import os
import shutil
import socket
import struct
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from ctypes import wintypes
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


LISTEN_HOST = os.environ.get("CHEEZE_BACKEND_LISTEN_HOST", "0.0.0.0")
LISTEN_PORT = int(os.environ.get("CHEEZE_BACKEND_LISTEN_PORT", "5010"))

DEFAULT_CONFIG_CANDIDATES = [
  Path(__file__).with_name("config.json"),
  Path(__file__).with_name("cheeze-backend-agent-config.json"),
  Path(__file__).with_name("cheeze-backend-agent-config.example.json"),
]

CONFIG_PATH = Path(os.environ["CHEEZE_BACKEND_CONFIG"]) if "CHEEZE_BACKEND_CONFIG" in os.environ else None
REQUEST_TIMEOUT = int(os.environ.get("CHEEZE_BACKEND_REQUEST_TIMEOUT", "5"))
STOP_COMMAND_TIMEOUT = int(os.environ.get("CHEEZE_BACKEND_STOP_TIMEOUT", "150"))
TIME_RESTRICTION_STOP_GRACE_SECONDS = int(os.environ.get("CHEEZE_BACKEND_TIME_RESTRICTION_GRACE_SECONDS", "600"))

CREATE_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)
DETACHED_PROCESS = getattr(subprocess, "DETACHED_PROCESS", 0)
CREATE_NEW_PROCESS_GROUP = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
STARTF_USESHOWWINDOW = getattr(subprocess, "STARTF_USESHOWWINDOW", 0)
SW_HIDE = 0


class _Tee:
  """Write to multiple streams simultaneously (console + log file)."""
  def __init__(self, *streams):
    self._streams = streams

  def write(self, data):
    for s in self._streams:
      try:
        s.write(data)
        s.flush()
      except Exception:
        pass

  def flush(self):
    for s in self._streams:
      try:
        s.flush()
      except Exception:
        pass


def _compute_script_hash() -> str:
  try:
    return hashlib.md5(Path(__file__).read_bytes()).hexdigest()
  except Exception:
    return ""


_startup_script_hash: str = _compute_script_hash()


def _background_creationflags(*extra_flags: int) -> int:
  flags = CREATE_NO_WINDOW
  for flag in extra_flags:
    flags |= flag
  return flags


def _background_subprocess_kwargs(*extra_flags: int) -> dict:
  kwargs = {"creationflags": _background_creationflags(*extra_flags)}
  if hasattr(subprocess, "STARTUPINFO"):
    startupinfo = subprocess.STARTUPINFO()
    startupinfo.dwFlags |= STARTF_USESHOWWINDOW
    startupinfo.wShowWindow = SW_HIDE
    kwargs["startupinfo"] = startupinfo
  return kwargs


def _check_self_update() -> None:
  """Restart the agent process if the script file changed since startup."""
  current_hash = _compute_script_hash()
  if not current_hash or current_hash == _startup_script_hash:
    return
  print(f"[UPDATE] Script changed ({_startup_script_hash[:8]} → {current_hash[:8]}), restarting...")
  subprocess.Popen(
    [sys.executable] + sys.argv,
    close_fds=True,
    **_background_subprocess_kwargs(DETACHED_PROCESS, CREATE_NEW_PROCESS_GROUP),
  )
  time.sleep(2)  # Let the new process initialize before releasing the port
  os._exit(0)


def _setup_file_logging(config: dict) -> None:
  log_path_str = config.get("log_file", "")
  log_path = Path(log_path_str) if log_path_str else Path(__file__).with_name("agent.log")
  try:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    fh = log_path.open("a", encoding="utf-8", buffering=1)
    tee = _Tee(sys.__stdout__, fh)
    sys.stdout = tee
    sys.stderr = tee
    print(f"[LOG] file logging started → {log_path}")
  except Exception as exc:
    print(f"[LOG] failed to open log file {log_path}: {exc}")


def load_config():
  config_path = CONFIG_PATH
  if config_path is None:
    config_path = next((candidate for candidate in DEFAULT_CONFIG_CANDIDATES if candidate.exists()), None)

  if config_path is None:
    raise FileNotFoundError("No backend agent config file found.")

  return json.loads(config_path.read_text(encoding="utf-8-sig"))


def json_bytes(payload):
  return json.dumps(payload, ensure_ascii=False).encode("utf-8")


TH32CS_SNAPPROCESS = 0x00000002
INVALID_HANDLE_VALUE = ctypes.c_void_p(-1).value


class PROCESSENTRY32W(ctypes.Structure):
  _fields_ = [
    ("dwSize", wintypes.DWORD),
    ("cntUsage", wintypes.DWORD),
    ("th32ProcessID", wintypes.DWORD),
    ("th32DefaultHeapID", ctypes.c_size_t),
    ("th32ModuleID", wintypes.DWORD),
    ("cntThreads", wintypes.DWORD),
    ("th32ParentProcessID", wintypes.DWORD),
    ("pcPriClassBase", ctypes.c_long),
    ("dwFlags", wintypes.DWORD),
    ("szExeFile", wintypes.WCHAR * 260),
  ]


def _list_process_entries() -> list[tuple[int, str]]:
  snapshot = ctypes.windll.kernel32.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)
  if snapshot == INVALID_HANDLE_VALUE:
    return []

  entries = []
  entry = PROCESSENTRY32W()
  entry.dwSize = ctypes.sizeof(PROCESSENTRY32W)
  try:
    has_entry = ctypes.windll.kernel32.Process32FirstW(snapshot, ctypes.byref(entry))
    while has_entry:
      entries.append((int(entry.th32ProcessID), entry.szExeFile))
      has_entry = ctypes.windll.kernel32.Process32NextW(snapshot, ctypes.byref(entry))
  finally:
    ctypes.windll.kernel32.CloseHandle(snapshot)
  return entries


def is_process_running(process_name):
  if not process_name:
    return False

  expected = process_name.lower()
  return any(exe_name.lower() == expected for _, exe_name in _list_process_entries())


def tracked_pid_running(pid_path):
  if not pid_path.exists():
    return False

  try:
    tracked_pid = pid_path.read_text(encoding="utf-8").strip().splitlines()[0]
  except Exception:
    return False

  if not tracked_pid:
    return False

  try:
    target_pid = int(tracked_pid)
  except ValueError:
    return False

  return any(pid == target_pid for pid, _ in _list_process_entries())


def read_tracked_pid(pid_path: Path) -> int | None:
  if not pid_path.exists():
    return None

  try:
    tracked_pid = pid_path.read_text(encoding="utf-8").strip().splitlines()[0]
  except Exception:
    return None

  if not tracked_pid:
    return None

  try:
    return int(tracked_pid)
  except ValueError:
    return None


def control_dir_pid_paths(control_dir: str) -> list[Path]:
  return [
    Path(control_dir, "minecraft.pid"),
    Path(control_dir, "wrapper.pid"),
  ]


def active_tracked_pids(control_dir: str) -> list[int]:
  active_process_ids = {pid for pid, _ in _list_process_entries()}
  pids: list[int] = []
  for pid_path in control_dir_pid_paths(control_dir):
    tracked_pid = read_tracked_pid(pid_path)
    if tracked_pid is None or tracked_pid not in active_process_ids:
      continue
    pids.append(tracked_pid)
  return pids


def control_dir_process_running(control_dir):
  return any(tracked_pid_running(pid_path) for pid_path in control_dir_pid_paths(control_dir))


def http_ready(url):
  try:
    with urllib.request.urlopen(url, timeout=REQUEST_TIMEOUT) as response:
      return 200 <= response.getcode() < 500
  except Exception:
    return False


def tcp_ready(host, port):
  sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
  sock.settimeout(REQUEST_TIMEOUT)
  try:
    sock.connect((host, port))
    return True
  except Exception:
    return False
  finally:
    sock.close()


def service_status(service):
  ready = False
  ready_check = service.get("ready_check", {})
  ready_type = ready_check.get("type")
  metadata = service.get("metadata", {})
  control_dir = metadata.get("control_dir")
  stop_flag_exists = False

  if control_dir:
    stop_flag_exists = Path(control_dir, "stop.flag").exists()

  if ready_type == "http":
    ready = http_ready(ready_check["url"])
  elif ready_type == "tcp":
    ready = tcp_ready(ready_check["host"], int(ready_check["port"]))

  if control_dir:
    process_running = control_dir_process_running(control_dir)
  else:
    process_running = is_process_running(service.get("process_name"))

  if stop_flag_exists:
    state = "stopping"
  elif ready:
    state = "running"
  elif process_running:
    state = "starting"
  else:
    state = "offline"

  return {
    "id": service["id"],
    "display_name": service.get("display_name", service["id"]),
    "state": state,
    "process_running": process_running,
    "ready": ready,
    "stop_pending": stop_flag_exists,
  }


def find_service(config, service_id):
  for service in config.get("services", []):
    if service["id"] == service_id:
      return service
  return None


def start_service(service):
  command = service.get("start_command")
  if not command or command == "__FILL_ME__":
    return 400, {
      "error": "missing_start_command",
      "message": f"Service {service['id']} has no executable start command yet.",
    }

  subprocess.Popen(
    command,
    cwd=service.get("working_dir") or None,
    shell=True,
    **_background_subprocess_kwargs(CREATE_NEW_PROCESS_GROUP),
  )
  return 202, {
    "accepted": True,
    "service": service["id"],
    "message": "Start command dispatched.",
  }


def stop_service(service):
  rcon = service.get("rcon")
  if rcon:
    _rcon_broadcast(
      rcon["host"],
      int(rcon["port"]),
      rcon.get("password", ""),
      "서버: 종료합니다...",
    )

  stop_command = service.get("stop_command")
  metadata = service.get("metadata", {})
  control_dir = metadata.get("control_dir")
  if stop_command and stop_command != "__FILL_ME__":
    try:
      result = subprocess.run(
        stop_command,
        cwd=service.get("working_dir") or None,
        shell=True,
        text=True,
        capture_output=True,
        timeout=STOP_COMMAND_TIMEOUT,
        check=False,
        **_background_subprocess_kwargs(CREATE_NEW_PROCESS_GROUP),
      )
    except subprocess.TimeoutExpired as exc:
      print(f"[STOP] {service['id']} stop command timed out after {STOP_COMMAND_TIMEOUT}s")
      result = exc

    status = service_status(service)
    if status["state"] == "offline":
      return 202, {
        "accepted": True,
        "service": service["id"],
        "message": "Stop command completed and service is offline.",
      }

    if control_dir:
      tracked_pids = active_tracked_pids(control_dir)
      for tracked_pid in tracked_pids:
        subprocess.run(
          ["taskkill", "/PID", str(tracked_pid), "/T", "/F"],
          text=True,
          capture_output=True,
          **_background_subprocess_kwargs(),
          check=False,
        )

      status = service_status(service)
      if status["state"] == "offline":
        return 202, {
          "accepted": True,
          "service": service["id"],
          "message": "Stop command required tracked PID fallback; service is now offline.",
        }

    process_name = service.get("process_name")
    if process_name:
      subprocess.run(
        ["taskkill", "/IM", process_name, "/F"],
        text=True,
        capture_output=True,
        **_background_subprocess_kwargs(),
        check=False,
      )
      status = service_status(service)
      if status["state"] == "offline":
        return 202, {
          "accepted": True,
          "service": service["id"],
          "message": "Stop command required process-name fallback; service is now offline.",
        }

    details = {}
    if isinstance(result, subprocess.TimeoutExpired):
      details["message"] = f"Stop command timed out after {STOP_COMMAND_TIMEOUT}s and service is still running."
    else:
      if result.stdout.strip():
        details["stdout"] = result.stdout[-500:]
      if result.stderr.strip():
        details["stderr"] = result.stderr[-500:]
      details["returncode"] = result.returncode
      details["message"] = "Stop command returned but service is still running."
    return 500, {
      "error": "stop_command_failed",
      "service": service["id"],
      **details,
    }

  process_name = service.get("process_name")
  if process_name:
    subprocess.run(
      ["taskkill", "/IM", process_name, "/F"],
      text=True,
      capture_output=True,
      **_background_subprocess_kwargs(),
      check=False,
    )
    return 202, {
      "accepted": True,
      "service": service["id"],
      "message": "Best-effort process stop dispatched.",
    }

  return 400, {
    "error": "missing_stop_command",
    "message": f"Service {service['id']} has no stop action configured.",
  }


# ---------------------------------------------------------------------------
# Minecraft server list ping (modern Handshake + Status Request protocol)
# ---------------------------------------------------------------------------

def encode_varint(n: int) -> bytes:
  """Encode a non-negative integer as a Minecraft-protocol varint."""
  buf = bytearray()
  while True:
    part = n & 0x7F
    n >>= 7
    if n:
      buf.append(part | 0x80)
    else:
      buf.append(part)
      break
  return bytes(buf)


def read_varint(sock: socket.socket) -> int:
  """Read a varint from a socket, returning the decoded integer."""
  result = 0
  shift = 0
  while True:
    raw = sock.recv(1)
    if not raw:
      raise EOFError("Socket closed while reading varint")
    byte = raw[0]
    result |= (byte & 0x7F) << shift
    if not (byte & 0x80):
      break
    shift += 7
    if shift >= 35:
      raise ValueError("Varint too long")
  return result


def encode_string(s: str) -> bytes:
  """Encode a UTF-8 string as varint-length-prefixed bytes."""
  encoded = s.encode("utf-8")
  return encode_varint(len(encoded)) + encoded


def build_handshake_packet(host: str, port: int) -> bytes:
  """Build the Minecraft handshake packet (packet id 0x00, next state 1)."""
  payload = (
    encode_varint(0x00)          # packet id
    + encode_varint(0)           # protocol version (0 = ping-only)
    + encode_string(host)        # server address
    + struct.pack(">H", port)    # server port (unsigned short big-endian)
    + encode_varint(1)           # next state: status
  )
  return encode_varint(len(payload)) + payload


def build_status_request_packet() -> bytes:
  """Build the Minecraft status request packet (packet id 0x00, no payload)."""
  payload = encode_varint(0x00)
  return encode_varint(len(payload)) + payload


def minecraft_player_count(host: str, port: int, timeout: int = 3) -> int | None:
  """
  Query a Minecraft server for its current online player count via server
  list ping (modern protocol).  Returns None on any error.
  """
  sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
  sock.settimeout(timeout)
  try:
    sock.connect((host, port))
    sock.sendall(build_handshake_packet(host, port))
    sock.sendall(build_status_request_packet())

    # Read response packet length, then packet id, then string length + data
    _packet_len = read_varint(sock)  # noqa: ignored, we read until JSON complete
    _packet_id = read_varint(sock)
    json_len = read_varint(sock)

    # Read exactly json_len bytes (may require multiple recv calls)
    data = bytearray()
    while len(data) < json_len:
      chunk = sock.recv(json_len - len(data))
      if not chunk:
        raise EOFError("Socket closed while reading status JSON")
      data.extend(chunk)

    status = json.loads(data.decode("utf-8"))
    return int(status["players"]["online"])
  except Exception:
    return None
  finally:
    sock.close()


def ollama_active_model_count(url: str, timeout: int = 3) -> int | None:
  """
  Query Ollama /api/ps for number of currently loaded models.
  Returns None on any error, 0 if no models are loaded.
  """
  try:
    with urllib.request.urlopen(url, timeout=timeout) as resp:
      data = json.loads(resp.read())
      return len(data.get("models", []))
  except Exception:
    return None


# ---------------------------------------------------------------------------
# Idle watchdog shared state
# ---------------------------------------------------------------------------

_watchdog_lock = threading.Lock()
# Maps service_id -> unix timestamp of last time state == "running" was seen
_last_running_seen: dict[str, float] = {}
# Maps service_id -> last known player count (None if not checked / not applicable)
_last_player_count: dict[str, int | None] = {}
# Maps service_id -> set of warning thresholds (seconds-remaining) already sent
_shutdown_warnings_sent: dict[str, set] = {}
# Maps service_id -> timestamp of last auto-save
_last_auto_save: dict[str, float] = {}
# Maps service_id -> set of warning thresholds (seconds-remaining) already sent for time restriction
_time_restriction_warnings_sent: dict[str, set] = {}
# Maps service_id -> previous seconds-remaining snapshot for time restriction
_last_time_restriction_remaining: dict[str, float] = {}
# Maps service_id -> whether time restriction stop was already dispatched in the current window
_time_restriction_stop_dispatched: set[str] = set()
_hibernate_inhibit_until = 0.0
_last_watchdog_wallclock: float | None = None
_watchdog_running = False

# ── RCON ────────────────────────────────────────────────────────────────────

SHUTDOWN_WARNING_THRESHOLDS = [
  (1800, "30분"),
  (1200, "20분"),
  (600,  "10분"),
  (300,  "5분"),
  (60,   "잠시"),
]

def _current_warning_threshold(remaining: float) -> tuple[int, str] | None:
  """Return the current warning band for the remaining seconds."""
  for threshold, label in reversed(SHUTDOWN_WARNING_THRESHOLDS):
    if remaining <= threshold:
      return threshold, label
  return None


def _rcon_send(host: str, port: int, password: str, command: str, timeout: float = 5.0) -> bool:
  """Send a single RCON command silently. Returns True on success."""
  try:
    rcon_command(host, port, password, command, int(timeout))
    return True
  except Exception as exc:
    print(f"[RCON] {exc}")
    return False


def _rcon_broadcast(host: str, port: int, password: str, message: str, color: str = "gold") -> bool:
  """Broadcast a colored tellraw message to all players."""
  safe_message = message.replace("\\", "\\\\").replace('"', '\\"')
  command = f'tellraw @a {{"text":"{safe_message}","color":"{color}"}}'
  return _rcon_send(host, port, password, command)


def _save_before_shutdown(service: dict, reason: str) -> None:
  """Persist world/player state once when the shutdown window reaches 5 minutes."""
  rcon = service.get("rcon")
  if not rcon:
    return
  host = rcon["host"]
  port = int(rcon["port"])
  password = rcon.get("password", "")
  if _rcon_send(host, port, password, "save-all flush") or _rcon_send(host, port, password, "save-all"):
    _rcon_broadcast(host, port, password, "서버: 월드가 저장되었습니다.")
    print(f"[RCON] {service['id']}: pre-shutdown save complete ({reason})")


def send_shutdown_warning(service: dict, idle_elapsed: float, idle_timeout: float) -> None:
  """Send RCON shutdown warnings at configured thresholds."""
  rcon = service.get("rcon")
  if not rcon:
    return
  service_id = service["id"]
  remaining = idle_timeout - idle_elapsed
  with _watchdog_lock:
    if service_id not in _shutdown_warnings_sent:
      _shutdown_warnings_sent[service_id] = set()
  current = _current_warning_threshold(remaining)
  if not current:
    return
  threshold, label = current
  with _watchdog_lock:
    already_sent = threshold in _shutdown_warnings_sent[service_id]
  if already_sent:
    return
  msg = (
      "서버: 잠시 후 서버가 자동 종료됩니다."
      if label == "잠시"
      else f"서버: {label} 후 서버가 자동 종료됩니다."
    )
  if threshold == 300:
    _save_before_shutdown(service, "idle_timeout")
  if _rcon_broadcast(rcon["host"], int(rcon["port"]), rcon.get("password", ""), msg):
    with _watchdog_lock:
      _shutdown_warnings_sent[service_id].add(threshold)
    print(f"[RCON] {service_id}: {label} shutdown warning sent")


def send_time_restriction_warning(service: dict) -> None:
  """Send RCON warnings before a configured time_restriction end time."""
  rcon = service.get("rcon")
  time_restriction = service.get("time_restriction", {})
  end_time = time_restriction.get("end")
  if not rcon or not time_restriction.get("enabled", True) or not end_time:
    return
  # weekdays_only=True(기본값)이면 주말(토/일)에는 시간 제한 경고 미발송
  if time_restriction.get("weekdays_only", True) and datetime.datetime.now().weekday() in (5, 6):
    return

  remaining = _seconds_until_time(end_time)
  if remaining is None:
    return

  service_id = service["id"]
  max_threshold = SHUTDOWN_WARNING_THRESHOLDS[0][0]
  with _watchdog_lock:
    if service_id not in _time_restriction_warnings_sent:
      _time_restriction_warnings_sent[service_id] = set()
    if remaining > max_threshold:
      _time_restriction_warnings_sent[service_id].clear()
    last_remaining = _last_time_restriction_remaining.get(service_id)
    _last_time_restriction_remaining[service_id] = remaining

  current = _current_warning_threshold(remaining)
  if not current:
    return
  threshold, label = current
  if last_remaining is None or last_remaining <= threshold:
    return
  with _watchdog_lock:
    already_sent = threshold in _time_restriction_warnings_sent[service_id]
  if already_sent:
    return
  msg = (
      f"서버: 운영 시간 종료가 가까워졌습니다. {end_time}에 자동 종료됩니다."
      if threshold == 60
      else f"서버: 운영 시간 종료 {label} 전입니다. {end_time}에 자동 종료됩니다."
    )
  if threshold == 300:
    _save_before_shutdown(service, "time_restriction")
  if _rcon_broadcast(rcon["host"], int(rcon["port"]), rcon.get("password", ""), msg):
    with _watchdog_lock:
      _time_restriction_warnings_sent[service_id].add(threshold)
    print(f"[RCON] {service_id}: {label} time restriction warning sent")


def maybe_auto_save(service: dict) -> None:
  """Send RCON save-all based on scheduled_minutes or interval_minutes."""
  rcon = service.get("rcon")
  auto_save = service.get("auto_save", {})
  if not rcon or not auto_save.get("enabled", False):
    return
  service_id = service["id"]

  scheduled_minutes = auto_save.get("scheduled_minutes")
  now_ts = time.time()

  if scheduled_minutes is not None:
    # Clock-aligned mode: save when current minute matches one of scheduled_minutes.
    # Use epoch-minutes as a unique window to prevent duplicate saves within the same minute.
    current_window = int(now_ts // 60)
    if datetime.datetime.now().minute not in scheduled_minutes:
      return
    with _watchdog_lock:
      last_window = int(_last_auto_save.get(service_id, 0.0))
    if current_window == last_window:
      return
    save_window = current_window
  else:
    # Interval mode: save when enough time has elapsed since last save.
    interval = auto_save.get("interval_minutes", 30) * 60
    with _watchdog_lock:
      last = _last_auto_save.get(service_id, 0.0)
    if now_ts - last < interval:
      return
    save_window = now_ts

  host, port, pw = rcon["host"], int(rcon["port"]), rcon.get("password", "")
  if _rcon_send(host, port, pw, "save-all"):
    _rcon_broadcast(host, port, pw, "서버: 월드가 저장되었습니다.")
    with _watchdog_lock:
      _last_auto_save[service_id] = float(save_window)
    print(f"[RCON] {service_id}: auto-save complete")


def _time_in_inhibit_range(now: datetime.time, start_str: str, end_str: str) -> bool:
  """Return True if now falls within [start, end) inhibit window.

  Handles overnight ranges (e.g. 19:00 – 01:00) where start > end.
  """
  start = datetime.time.fromisoformat(start_str)
  end = datetime.time.fromisoformat(end_str)
  if start <= end:
    return start <= now < end
  # Overnight: in range if now >= start OR now < end
  return now >= start or now < end


def _seconds_until_time(time_str: str) -> float | None:
  """Return seconds until the next occurrence of time_str (HH:MM)."""
  try:
    now = datetime.datetime.now()
    target = datetime.time.fromisoformat(time_str)
    target_dt = datetime.datetime.combine(now.date(), target)
    if target_dt <= now:
      target_dt += datetime.timedelta(days=1)
    return (target_dt - now).total_seconds()
  except Exception:
    return None


def _seconds_since_most_recent_time(time_str: str) -> float | None:
  """Return seconds since the most recent occurrence of time_str (HH:MM)."""
  try:
    now = datetime.datetime.now()
    target = datetime.time.fromisoformat(time_str)
    target_dt = datetime.datetime.combine(now.date(), target)
    if target_dt > now:
      target_dt -= datetime.timedelta(days=1)
    return (now - target_dt).total_seconds()
  except Exception:
    return None


def maybe_enforce_time_restriction_stop(service: dict, grace_seconds: int) -> bool:
  """Stop a running service if it has just crossed its time restriction end."""
  time_restriction = service.get("time_restriction", {})
  end_time = time_restriction.get("end")
  if not time_restriction.get("enabled", True) or not end_time:
    return False
  # 주말(토/일)에는 시간 제한 미적용
  if datetime.datetime.now().weekday() in (5, 6):  # 5=토, 6=일
    return False

  service_id = service["id"]
  seconds_since = _seconds_since_most_recent_time(end_time)
  if seconds_since is None or seconds_since < 0 or seconds_since > grace_seconds:
    return False

  with _watchdog_lock:
    if service_id in _time_restriction_stop_dispatched:
      return False
    _time_restriction_stop_dispatched.add(service_id)

  print(f"[TIME] auto-stopping {service_id} at restricted end time {end_time}")
  try:
    status_code, payload = stop_service(service)
    if status_code < 400:
      return True
    with _watchdog_lock:
      _time_restriction_stop_dispatched.discard(service_id)
    print(f"[TIME] stop_service({service_id}) failed: {payload}")
    return False
  except Exception as exc:
    with _watchdog_lock:
      _time_restriction_stop_dispatched.discard(service_id)
    print(f"[TIME] stop_service({service_id}) failed: {exc}")
    return False


def _no_sleep_flag_path(hibernate_policy: dict) -> Path:
  raw = hibernate_policy.get("no_sleep_flag_path", "")
  if raw:
    return Path(raw)
  return Path(__file__).with_name("no-sleep.flag")


def _get_hibernate_grace_seconds(hibernate_policy: dict, key: str, default: int) -> int:
  raw = hibernate_policy.get(key, default)
  try:
    return max(0, int(raw))
  except (TypeError, ValueError):
    return default


def _extend_hibernate_inhibit(seconds: int, reason: str) -> None:
  if seconds <= 0:
    return

  global _hibernate_inhibit_until
  deadline = time.time() + seconds
  with _watchdog_lock:
    if deadline <= _hibernate_inhibit_until:
      return
    _hibernate_inhibit_until = deadline
  print(f"[HIBERNATE] inhibit armed for {seconds}s ({reason})")


def _hibernate_inhibit_active() -> bool:
  with _watchdog_lock:
    return time.time() < _hibernate_inhibit_until


def _arm_service_start_hibernate_inhibit(config: dict, service_id: str) -> None:
  _extend_hibernate_inhibit(
    _get_hibernate_grace_seconds(
      config.get("hibernate_policy", {}),
      "start_request_grace_seconds",
      600,
    ),
    f"service_start:{service_id}",
  )


def _check_hibernate_conditions(config: dict) -> bool:
  """Return True if all hibernate conditions are satisfied."""
  hibernate_policy = config.get("hibernate_policy", {})
  if not hibernate_policy.get("enabled", False):
    return False

  if _hibernate_inhibit_active():
    return False

  services = [s for s in config.get("services", []) if s.get("enabled", True)]

  # 1. All services must be offline
  active_states = {"running", "starting", "waking", "stopping"}
  for service in services:
    try:
      status = service_status(service)
      if status["state"] in active_states:
        return False
    except Exception:
      pass

  # 2. Not within inhibit schedule
  now_time = datetime.datetime.now().time()
  for window in hibernate_policy.get("inhibit_schedule", []):
    try:
      if _time_in_inhibit_range(now_time, window["start"], window["end"]):
        return False
    except Exception:
      pass

  # 3. Free space on check_drive >= min_free_space_gb
  check_drive = hibernate_policy.get("check_drive", "C:\\")
  min_free_gb = hibernate_policy.get("min_free_space_gb", 20)
  try:
    usage = shutil.disk_usage(check_drive)
    free_gb = usage.free / (1024 ** 3)
    if free_gb < min_free_gb:
      return False
  except Exception:
    pass

  # 4. No no-sleep.flag file
  flag_path = _no_sleep_flag_path(hibernate_policy)
  if flag_path.exists():
    return False

  return True


def _get_system_resources() -> dict:
  """Gather CPU, memory, and disk usage using Windows-native APIs."""
  import ctypes
  import ctypes.wintypes

  result: dict = {}

  # --- Memory (GlobalMemoryStatusEx) ---
  try:
    class MEMORYSTATUSEX(ctypes.Structure):
      _fields_ = [
        ("dwLength", ctypes.wintypes.DWORD),
        ("dwMemoryLoad", ctypes.wintypes.DWORD),
        ("ullTotalPhys", ctypes.c_uint64),
        ("ullAvailPhys", ctypes.c_uint64),
        ("ullTotalPageFile", ctypes.c_uint64),
        ("ullAvailPageFile", ctypes.c_uint64),
        ("ullTotalVirtual", ctypes.c_uint64),
        ("ullAvailVirtual", ctypes.c_uint64),
        ("ullAvailExtendedVirtual", ctypes.c_uint64),
      ]
    mem = MEMORYSTATUSEX()
    mem.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
    ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(mem))
    total_gb = round(mem.ullTotalPhys / (1024 ** 3), 2)
    used_gb = round((mem.ullTotalPhys - mem.ullAvailPhys) / (1024 ** 3), 2)
    result["memory"] = {
      "total_gb": total_gb,
      "used_gb": used_gb,
      "percent": mem.dwMemoryLoad,
    }
  except Exception as exc:
    result["memory"] = {"error": str(exc)}

  # --- CPU (PowerShell) ---
  try:
    out = subprocess.check_output(
      ["powershell", "-NoProfile", "-Command",
       "(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average"],
      timeout=5, text=True, **_background_subprocess_kwargs(),
    )
    result["cpu"] = {"percent": int(out.strip())}
  except Exception as exc:
    result["cpu"] = {"error": str(exc)}

  # --- Disk (GetDiskFreeSpaceExW) ---
  try:
    drives = []
    bitmask = ctypes.windll.kernel32.GetLogicalDrives()
    for i in range(26):
      if bitmask & (1 << i):
        letter = chr(65 + i) + ":\\"
        drive_type = ctypes.windll.kernel32.GetDriveTypeW(letter)
        if drive_type != 3:  # DRIVE_FIXED only
          continue
        free = ctypes.c_uint64(0)
        total = ctypes.c_uint64(0)
        ctypes.windll.kernel32.GetDiskFreeSpaceExW(
          letter, None, ctypes.byref(total), ctypes.byref(free)
        )
        total_gb = round(total.value / (1024 ** 3), 2)
        free_gb = round(free.value / (1024 ** 3), 2)
        used_gb = round(total_gb - free_gb, 2)
        percent = round((used_gb / total_gb) * 100, 1) if total_gb > 0 else 0
        drives.append({
          "drive": letter.rstrip("\\"),
          "total_gb": total_gb,
          "used_gb": used_gb,
          "free_gb": free_gb,
          "percent": percent,
        })
    result["disk"] = drives
  except Exception as exc:
    result["disk"] = {"error": str(exc)}

  return result


def _hibernate_debug_info(config: dict) -> dict:
  """Evaluate each hibernate condition individually and return pass/fail details."""
  hibernate_policy = config.get("hibernate_policy", {})
  conditions = {}

  # policy enabled
  enabled = hibernate_policy.get("enabled", False)
  conditions["policy_enabled"] = {"pass": enabled}

  # inhibit timer
  with _watchdog_lock:
    inhibit_until = _hibernate_inhibit_until
  inhibit_active = time.time() < inhibit_until
  conditions["inhibit_timer"] = {
    "pass": not inhibit_active,
    "inhibit_until": datetime.datetime.fromtimestamp(inhibit_until).strftime("%Y-%m-%dT%H:%M:%S") if inhibit_active else None,
    "remaining_seconds": max(0, int(inhibit_until - time.time())) if inhibit_active else 0,
  }

  # all services offline — run checks in parallel to avoid sequential timeout accumulation
  services = [s for s in config.get("services", []) if s.get("enabled", True)]
  active_states = {"running", "starting", "waking", "stopping"}
  services_detail = {}
  all_offline = True

  def _check_one(svc):
    try:
      st = service_status(svc)
      state = st["state"]
      offline = state not in active_states
      return svc["id"], {"state": state, "pass": offline}
    except Exception as exc:
      return svc["id"], {"state": "check_error", "error": str(exc), "pass": True}

  with concurrent.futures.ThreadPoolExecutor(max_workers=len(services) or 1) as pool:
    for svc_id, detail in pool.map(_check_one, services):
      services_detail[svc_id] = detail
      if not detail["pass"]:
        all_offline = False
  conditions["all_services_offline"] = {"pass": all_offline, "services": services_detail}

  # not in inhibit schedule
  now_time = datetime.datetime.now().time()
  in_schedule = False
  matched_window = None
  for window in hibernate_policy.get("inhibit_schedule", []):
    try:
      if _time_in_inhibit_range(now_time, window["start"], window["end"]):
        in_schedule = True
        matched_window = window
        break
    except Exception:
      pass
  conditions["not_in_inhibit_schedule"] = {
    "pass": not in_schedule,
    "current_time": now_time.strftime("%H:%M"),
    "matched_window": matched_window,
  }

  # disk space
  check_drive = hibernate_policy.get("check_drive", "C:\\")
  min_free_gb = hibernate_policy.get("min_free_space_gb", 20)
  try:
    usage = shutil.disk_usage(check_drive)
    free_gb = round(usage.free / (1024 ** 3), 2)
    conditions["disk_space"] = {"pass": free_gb >= min_free_gb, "free_gb": free_gb, "required_gb": min_free_gb}
  except Exception as exc:
    conditions["disk_space"] = {"pass": False, "error": str(exc)}

  # no-sleep flag
  flag_path = _no_sleep_flag_path(hibernate_policy)
  conditions["no_sleep_flag_absent"] = {"pass": not flag_path.exists(), "flag_path": str(flag_path)}

  would_hibernate = all(v.get("pass", False) for v in conditions.values())
  failing = [k for k, v in conditions.items() if not v.get("pass", False)]
  return {"would_hibernate": would_hibernate, "failing_conditions": failing, "conditions": conditions}


def _watchdog_tick():
  """Single tick of the idle watchdog: check each service and possibly hibernate."""
  _check_self_update()

  try:
    config = load_config()
  except Exception as exc:
    print(f"[WATCHDOG] Failed to load config: {exc}")
    return

  services = [s for s in config.get("services", []) if s.get("enabled", True)]
  any_auto_stopped = False
  hibernate_policy = config.get("hibernate_policy", {})
  check_interval_seconds = hibernate_policy.get("check_interval_seconds", 60)
  now_ts = time.time()

  global _last_watchdog_wallclock
  with _watchdog_lock:
    previous_tick_ts = _last_watchdog_wallclock
    _last_watchdog_wallclock = now_ts

  resume_gap_threshold = max(check_interval_seconds * 2, 30)
  if previous_tick_ts is not None:
    wallclock_gap = now_ts - previous_tick_ts
    if wallclock_gap > resume_gap_threshold:
      _extend_hibernate_inhibit(
        _get_hibernate_grace_seconds(hibernate_policy, "resume_grace_seconds", 180),
        f"watchdog_resume_gap:{int(wallclock_gap)}s",
      )

  for service in services:
    service_id = service["id"]
    idle_policy = service.get("idle_policy", {})

    try:
      status = service_status(service)
    except Exception as exc:
      print(f"[WATCHDOG] service_status({service_id}) failed: {exc}")
      continue

    state = status["state"]

    if state == "running":
      time_restriction_grace_seconds = max(check_interval_seconds + 30, TIME_RESTRICTION_STOP_GRACE_SECONDS)
      if maybe_enforce_time_restriction_stop(service, time_restriction_grace_seconds):
        any_auto_stopped = True
        continue
      send_time_restriction_warning(service)

      if not idle_policy.get("enabled", False):
        maybe_auto_save(service)
        continue

      # Player count check
      player_check = idle_policy.get("player_check", {})
      if player_check.get("enabled", False) and player_check.get("type") == "minecraft":
        # Initialize idle clock on first detection
        with _watchdog_lock:
          if service_id not in _last_running_seen:
            _last_running_seen[service_id] = time.time()

        host = player_check.get("host", "127.0.0.1")
        port = int(player_check.get("port", 25565))
        count = minecraft_player_count(host, port)
        with _watchdog_lock:
          _last_player_count[service_id] = count

        if count is not None and count > 0:
          # Players present: reset idle clock and warning state
          with _watchdog_lock:
            _last_running_seen[service_id] = time.time()
            _shutdown_warnings_sent.pop(service_id, None)
          maybe_auto_save(service)
          continue

        # count == 0 or None: fall through to idle timeout check
        # Do NOT update last_running_seen here — let the idle clock accumulate

      elif player_check.get("enabled", False) and player_check.get("type") == "ollama":
        # Initialize idle clock on first detection
        with _watchdog_lock:
          if service_id not in _last_running_seen:
            _last_running_seen[service_id] = time.time()

        ps_url = player_check.get("url", "http://127.0.0.1:11434/api/ps")
        count = ollama_active_model_count(ps_url)
        with _watchdog_lock:
          _last_player_count[service_id] = count

        if count is not None and count > 0:
          # Model active: reset idle clock
          with _watchdog_lock:
            _last_running_seen[service_id] = time.time()
          continue

        # count == 0 or None: fall through to idle timeout check

      else:
        # No player check configured: keep clock fresh (never auto-idles while running)
        with _watchdog_lock:
          _last_running_seen[service_id] = time.time()
        continue

      # Check idle timeout
      idle_timeout_minutes = idle_policy.get("idle_timeout_minutes")
      if idle_timeout_minutes is None:
        maybe_auto_save(service)
        continue

      idle_timeout_seconds = idle_timeout_minutes * 60
      if idle_timeout_seconds <= 0:
        maybe_auto_save(service)
        continue

      with _watchdog_lock:
        last_seen = _last_running_seen.get(service_id, time.time())

      idle_elapsed = time.time() - last_seen
      maybe_auto_save(service)
      send_shutdown_warning(service, idle_elapsed, idle_timeout_seconds)

      if idle_elapsed >= idle_timeout_seconds:
        with _watchdog_lock:
          _shutdown_warnings_sent.pop(service_id, None)
        print(f"[IDLE] auto-stopping {service_id}")
        try:
          stop_service(service)
          any_auto_stopped = True
        except Exception as exc:
          print(f"[IDLE] stop_service({service_id}) failed: {exc}")

    else:
      # Service not running: clear idle tracking so clock resets on next start
      with _watchdog_lock:
        _last_running_seen.pop(service_id, None)
        _last_player_count.pop(service_id, None)
        _shutdown_warnings_sent.pop(service_id, None)
        _last_auto_save.pop(service_id, None)
        _time_restriction_warnings_sent.pop(service_id, None)
        _last_time_restriction_remaining.pop(service_id, None)
        _time_restriction_stop_dispatched.discard(service_id)

  # Hibernate check — only evaluate after potential auto-stops
  if any_auto_stopped or True:  # always check each tick; harmless extra check
    if hibernate_policy.get("enabled", False):
      if _check_hibernate_conditions(config):
        print("[HIBERNATE] all conditions met, triggering Windows hibernate")
        subprocess.run(["shutdown", "/h", "/f"], check=False)


def _watchdog_loop(check_interval_seconds: int):
  global _watchdog_running
  _watchdog_running = True
  print(f"[WATCHDOG] started (interval={check_interval_seconds}s)")
  while True:
    try:
      _watchdog_tick()
    except Exception as exc:
      print(f"[WATCHDOG] unhandled error in tick: {exc}")
    time.sleep(check_interval_seconds)


def start_watchdog(config: dict):
  """Start the IdleWatchdog daemon thread if warranted by the config."""
  services = [s for s in config.get("services", []) if s.get("enabled", True)]
  needs_watchdog = any(
    s.get("idle_policy", {}).get("enabled", False) for s in services
  ) or config.get("hibernate_policy", {}).get("enabled", False)

  if not needs_watchdog:
    return

  hibernate_policy = config.get("hibernate_policy", {})
  _extend_hibernate_inhibit(
    _get_hibernate_grace_seconds(hibernate_policy, "startup_grace_seconds", 180),
    "agent_startup",
  )
  check_interval = hibernate_policy.get("check_interval_seconds", 60)

  thread = threading.Thread(
    target=_watchdog_loop,
    args=(check_interval,),
    daemon=True,
    name="IdleWatchdog",
  )
  thread.start()


# ---------------------------------------------------------------------------
# RCON client (Minecraft Remote Console)
# ---------------------------------------------------------------------------

def rcon_command(host: str, port: int, password: str, command: str, timeout: int = 5) -> str:
  import struct

  def _pack(req_id, pkt_type, payload):
    data = payload.encode("utf-8") + b"\x00\x00"
    return struct.pack("<iii", len(data) + 8, req_id, pkt_type) + data

  def _recv_exact(sock, n):
    buf = b""
    while len(buf) < n:
      chunk = sock.recv(n - len(buf))
      if not chunk:
        raise ConnectionError("RCON connection closed")
      buf += chunk
    return buf

  def _read_packet(sock):
    header = _recv_exact(sock, 12)
    length, req_id, pkt_type = struct.unpack("<iii", header)
    payload = _recv_exact(sock, length - 8)
    return req_id, pkt_type, payload[:-2].decode("utf-8", errors="replace")

  with socket.create_connection((host, port), timeout=timeout) as sock:
    sock.sendall(_pack(1, 3, password))
    auth_id, _, _ = _read_packet(sock)
    if auth_id == -1:
      raise PermissionError("RCON authentication failed — wrong password")
    sock.sendall(_pack(2, 2, command))
    _, _, response = _read_packet(sock)

  return response


# ---------------------------------------------------------------------------
# HTTP handler
# ---------------------------------------------------------------------------

class Handler(BaseHTTPRequestHandler):
  server_version = "CHEEZE-Backend-Agent/0.1"

  def do_GET(self):
    config = load_config()

    if self.path == "/healthz":
      self.respond_json(200, {
        "ok": True,
        "service_count": len(config.get("services", [])),
      })
      return

    if self.path == "/services":
      statuses = []
      with _watchdog_lock:
        lpc = dict(_last_player_count)
      for service in config.get("services", []):
        if not service.get("enabled", True):
          continue
        status = service_status(service)
        status["player_count"] = lpc.get(service["id"])
        statuses.append(status)
      self.respond_json(200, {"services": statuses})
      return

    if self.path.startswith("/services/") and self.path.split("?", 1)[0].endswith("/console"):
      path_no_qs = self.path.split("?", 1)[0]
      parts = path_no_qs.split("/")
      if len(parts) >= 4:
        service_id = parts[2]
        service = find_service(config, service_id)
        if not service:
          self.respond_json(404, {"error": "not_found"})
          return
        offset = None
        tail = None
        if "?" in self.path:
          for param in self.path.split("?", 1)[1].split("&"):
            if param.startswith("offset="):
              try: offset = max(0, int(param[7:]))
              except ValueError: pass
            elif param.startswith("tail="):
              try: tail = max(1, min(1000, int(param[5:])))
              except ValueError: pass
        log_file = (service.get("metadata") or {}).get("log_file") or str(
          Path(service.get("working_dir", ".")) / "logs" / "latest.log"
        )
        log_path = Path(log_file)
        if not log_path.exists():
          self.respond_json(200, {"lines": [], "total_lines": 0, "log_file": log_file, "exists": False})
          return
        try:
          with log_path.open("r", encoding="utf-8", errors="replace") as fh:
            all_lines = fh.read().splitlines()
          total = len(all_lines)
          if tail is not None:
            lines = all_lines[max(0, total - tail):]
          elif offset is not None:
            lines = all_lines[min(offset, total):]
          else:
            lines = all_lines[max(0, total - 300):]
          self.respond_json(200, {"lines": lines, "total_lines": total, "log_file": log_file, "exists": True})
        except Exception as exc:
          self.respond_json(500, {"error": str(exc)})
        return

    if self.path.startswith("/services/"):
      service_id = self.path.split("/")[2]
      service = find_service(config, service_id)
      if not service:
        self.respond_json(404, {"error": "not_found"})
        return
      status = service_status(service)
      with _watchdog_lock:
        status["player_count"] = _last_player_count.get(service_id)
      self.respond_json(200, status)
      return

    if self.path == "/idle/status":
      self.respond_json(200, self._build_idle_status(config))
      return

    if self.path == "/hibernate/debug":
      self.respond_json(200, _hibernate_debug_info(config))
      return

    if self.path == "/no-sleep":
      flag_path = _no_sleep_flag_path(config.get("hibernate_policy", {}))
      self.respond_json(200, {"active": flag_path.exists(), "flag_path": str(flag_path)})
      return

    if self.path == "/system/resources":
      self.respond_json(200, _get_system_resources())
      return

    self.respond_json(404, {"error": "not_found"})

  def do_POST(self):
    config = load_config()

    if self.path == "/no-sleep":
      flag_path = _no_sleep_flag_path(config.get("hibernate_policy", {}))
      try:
        flag_path.touch()
      except Exception as exc:
        self.respond_json(500, {"error": str(exc)})
        return
      self.respond_json(200, {"active": True})
      return

    if self.path.startswith("/services/") and self.path.endswith("/start"):
      service_id = self.path.split("/")[2]
      service = find_service(config, service_id)
      if not service:
        self.respond_json(404, {"error": "not_found"})
        return
      status_code, payload = start_service(service)
      if status_code < 400 and payload.get("accepted"):
        _arm_service_start_hibernate_inhibit(config, service_id)
      self.respond_json(status_code, payload)
      return

    if self.path.startswith("/services/") and self.path.endswith("/stop"):
      service_id = self.path.split("/")[2]
      service = find_service(config, service_id)
      if not service:
        self.respond_json(404, {"error": "not_found"})
        return
      status_code, payload = stop_service(service)
      self.respond_json(status_code, payload)
      return

    if self.path.startswith("/services/") and self.path.endswith("/console"):
      service_id = self.path.split("/")[2]
      service = find_service(config, service_id)
      if not service:
        self.respond_json(404, {"error": "not_found"})
        return
      rcon_cfg = service.get("rcon") or {}
      if not rcon_cfg.get("password"):
        self.respond_json(400, {"error": "rcon_not_configured", "message": "RCON is not configured for this service"})
        return
      content_length = int(self.headers.get("Content-Length", 0))
      raw_body = self.rfile.read(content_length) if content_length else b"{}"
      try:
        body = json.loads(raw_body)
      except Exception:
        self.respond_json(400, {"error": "invalid_json"})
        return
      command = str(body.get("command", "")).strip()
      if not command:
        self.respond_json(400, {"error": "command_required"})
        return
      try:
        response = rcon_command(
          rcon_cfg.get("host", "127.0.0.1"),
          int(rcon_cfg.get("port", 25575)),
          rcon_cfg.get("password", ""),
          command,
        )
        self.respond_json(200, {"success": True, "command": command, "response": response})
      except PermissionError as exc:
        self.respond_json(403, {"error": "rcon_auth_failed", "message": str(exc)})
      except Exception as exc:
        self.respond_json(502, {"error": "rcon_error", "message": str(exc)})
      return

    self.respond_json(404, {"error": "not_found"})

  def do_DELETE(self):
    config = load_config()

    if self.path == "/no-sleep":
      flag_path = _no_sleep_flag_path(config.get("hibernate_policy", {}))
      try:
        flag_path.unlink(missing_ok=True)
      except Exception as exc:
        self.respond_json(500, {"error": str(exc)})
        return
      self.respond_json(200, {"active": False})
      return

    self.respond_json(404, {"error": "not_found"})

  def _build_idle_status(self, config: dict) -> dict:
    services_out = {}
    now = time.time()
    with _watchdog_lock:
      lrs_snapshot = dict(_last_running_seen)
      lpc_snapshot = dict(_last_player_count)

    enabled_services = [s for s in config.get("services", []) if s.get("enabled", True)]
    for service in enabled_services:
      sid = service["id"]
      last_ts = lrs_snapshot.get(sid)
      last_ts_iso = (
        datetime.datetime.utcfromtimestamp(last_ts).strftime("%Y-%m-%dT%H:%M:%SZ")
        if last_ts is not None else None
      )
      idle_seconds = int(now - last_ts) if last_ts is not None else None
      services_out[sid] = {
        "last_running_seen": last_ts_iso,
        "last_player_count": lpc_snapshot.get(sid),
        "idle_seconds": idle_seconds,
      }

    return {
      "watchdog_running": _watchdog_running,
      "services": services_out,
      "hibernate_policy_enabled": config.get("hibernate_policy", {}).get("enabled", False),
      "hibernate_inhibit_active": _hibernate_inhibit_active(),
    }

  def respond_json(self, status_code, payload):
    body = json_bytes(payload)
    self.send_response(status_code)
    self.send_header("Content-Type", "application/json; charset=utf-8")
    self.send_header("Content-Length", str(len(body)))
    self.end_headers()
    self.wfile.write(body)

  def log_message(self, fmt, *args):
    print("%s - - %s" % (self.client_address[0], fmt % args))


def main():
  config = load_config()
  _setup_file_logging(config)
  start_watchdog(config)

  server = ThreadingHTTPServer((LISTEN_HOST, LISTEN_PORT), Handler)
  print(f"CHEEZE backend agent listening on {LISTEN_HOST}:{LISTEN_PORT}")
  server.serve_forever()


if __name__ == "__main__":
  main()
