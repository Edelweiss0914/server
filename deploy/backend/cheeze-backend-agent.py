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
"""

from __future__ import annotations

import datetime
import json
import os
import shutil
import socket
import struct
import subprocess
import threading
import time
import urllib.error
import urllib.request
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


def load_config():
  config_path = CONFIG_PATH
  if config_path is None:
    config_path = next((candidate for candidate in DEFAULT_CONFIG_CANDIDATES if candidate.exists()), None)

  if config_path is None:
    raise FileNotFoundError("No backend agent config file found.")

  return json.loads(config_path.read_text(encoding="utf-8-sig"))


def json_bytes(payload):
  return json.dumps(payload, ensure_ascii=False).encode("utf-8")


def is_process_running(process_name):
  if not process_name:
    return False

  result = subprocess.run(
    ["tasklist", "/FI", f"IMAGENAME eq {process_name}"],
    text=True,
    capture_output=True,
    check=False,
  )
  return process_name.lower() in result.stdout.lower()


def tracked_pid_running(pid_path):
  if not pid_path.exists():
    return False

  try:
    tracked_pid = pid_path.read_text(encoding="utf-8").strip().splitlines()[0]
  except Exception:
    return False

  if not tracked_pid:
    return False

  result = subprocess.run(
    ["tasklist", "/FI", f"PID eq {tracked_pid}"],
    text=True,
    capture_output=True,
    check=False,
  )
  return tracked_pid in result.stdout


def control_dir_process_running(control_dir):
  pid_candidates = [
    Path(control_dir, "minecraft.pid"),
    Path(control_dir, "wrapper.pid"),
  ]
  return any(tracked_pid_running(pid_path) for pid_path in pid_candidates)


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
    creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
  )
  return 202, {
    "accepted": True,
    "service": service["id"],
    "message": "Start command dispatched.",
  }


def stop_service(service):
  stop_command = service.get("stop_command")
  if stop_command and stop_command != "__FILL_ME__":
    subprocess.Popen(
      stop_command,
      cwd=service.get("working_dir") or None,
      shell=True,
      creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
    )
    return 202, {
      "accepted": True,
      "service": service["id"],
      "message": "Stop command dispatched.",
    }

  process_name = service.get("process_name")
  if process_name:
    subprocess.run(
      ["taskkill", "/IM", process_name, "/F"],
      text=True,
      capture_output=True,
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
_watchdog_running = False


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


def _no_sleep_flag_path(hibernate_policy: dict) -> Path:
  raw = hibernate_policy.get("no_sleep_flag_path", "")
  if raw:
    return Path(raw)
  return Path(__file__).with_name("no-sleep.flag")


def _check_hibernate_conditions(config: dict) -> bool:
  """Return True if all hibernate conditions are satisfied."""
  hibernate_policy = config.get("hibernate_policy", {})
  if not hibernate_policy.get("enabled", False):
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

  # 2. No active console/RDP sessions
  try:
    result = subprocess.run(
      ["query", "session"],
      text=True,
      capture_output=True,
      check=False,
    )
    if "Active" in result.stdout:
      return False
  except Exception:
    pass  # Skip check if query session is unavailable

  # 3. Not within inhibit schedule
  now_time = datetime.datetime.now().time()
  for window in hibernate_policy.get("inhibit_schedule", []):
    try:
      if _time_in_inhibit_range(now_time, window["start"], window["end"]):
        return False
    except Exception:
      pass

  # 4. Free space on check_drive >= min_free_space_gb
  check_drive = hibernate_policy.get("check_drive", "C:\\")
  min_free_gb = hibernate_policy.get("min_free_space_gb", 20)
  try:
    usage = shutil.disk_usage(check_drive)
    free_gb = usage.free / (1024 ** 3)
    if free_gb < min_free_gb:
      return False
  except Exception:
    pass

  # 5. No no-sleep.flag file
  flag_path = _no_sleep_flag_path(hibernate_policy)
  if flag_path.exists():
    return False

  return True


def _watchdog_tick():
  """Single tick of the idle watchdog: check each service and possibly hibernate."""
  try:
    config = load_config()
  except Exception as exc:
    print(f"[WATCHDOG] Failed to load config: {exc}")
    return

  services = [s for s in config.get("services", []) if s.get("enabled", True)]
  any_auto_stopped = False

  for service in services:
    service_id = service["id"]
    idle_policy = service.get("idle_policy", {})

    if not idle_policy.get("enabled", False):
      continue

    try:
      status = service_status(service)
    except Exception as exc:
      print(f"[WATCHDOG] service_status({service_id}) failed: {exc}")
      continue

    state = status["state"]

    if state == "running":
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
          # Players present: reset idle clock
          with _watchdog_lock:
            _last_running_seen[service_id] = time.time()
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
      idle_timeout_seconds = idle_policy.get("idle_timeout_minutes", 30) * 60
      with _watchdog_lock:
        last_seen = _last_running_seen.get(service_id, time.time())

      if time.time() - last_seen >= idle_timeout_seconds:
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

  # Hibernate check — only evaluate after potential auto-stops
  if any_auto_stopped or True:  # always check each tick; harmless extra check
    hibernate_policy = config.get("hibernate_policy", {})
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

  check_interval = config.get("hibernate_policy", {}).get("check_interval_seconds", 60)

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
      statuses = [service_status(service) for service in config.get("services", []) if service.get("enabled", True)]
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
      self.respond_json(200, service_status(service))
      return

    if self.path == "/idle/status":
      self.respond_json(200, self._build_idle_status(config))
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
  start_watchdog(config)

  server = ThreadingHTTPServer((LISTEN_HOST, LISTEN_PORT), Handler)
  print(f"CHEEZE backend agent listening on {LISTEN_HOST}:{LISTEN_PORT}")
  server.serve_forever()


if __name__ == "__main__":
  main()
