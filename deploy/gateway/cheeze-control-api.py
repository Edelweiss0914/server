#!/usr/bin/env python3
"""
Minimal gateway control plane for on-demand backend services.

Responsibilities:
- Return host/service status summaries to the portal
- Send Wake-on-LAN packets to the backend PC
- Forward start/stop/status requests to the backend agent over Tailscale/LAN

This is the generic control-plane sibling to the existing AI queue gateway.
"""

from __future__ import annotations

import hmac
import json
import os
import shlex
import shutil
import subprocess
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


LISTEN_HOST = os.environ.get("CHEEZE_CONTROL_LISTEN_HOST", "127.0.0.1")
LISTEN_PORT = int(os.environ.get("CHEEZE_CONTROL_LISTEN_PORT", "11436"))
BACKEND_AGENT_BASE = os.environ.get("CHEEZE_BACKEND_AGENT_BASE", "http://100.86.252.21:5010")
WOL_MAC = os.environ.get("CHEEZE_BACKEND_MAC", "9C-6B-00-57-73-3A")
REGISTRY_PATH = Path(os.environ.get(
  "CHEEZE_SERVICE_REGISTRY",
  "/var/www/home/deploy/orchestrator/service-registry.example.json",
))
BACKEND_TIMEOUT = int(os.environ.get("CHEEZE_BACKEND_TIMEOUT", "8"))
BACKEND_WAKE_TIMEOUT = int(os.environ.get("CHEEZE_BACKEND_WAKE_TIMEOUT", "150"))
BACKEND_WAKE_POLL = int(os.environ.get("CHEEZE_BACKEND_WAKE_POLL", "3"))
BACKEND_UNREACHABLE_MESSAGE = "backend agent unreachable; host may be asleep"
WOL_COMMAND = os.environ.get("CHEEZE_WOL_COMMAND", "").strip()
WOL_BINARY = os.environ.get("CHEEZE_WOL_BINARY", "wakeonlan")
WOL_TARGET_IP = os.environ.get("CHEEZE_WOL_TARGET_IP", "").strip()
WOL_TARGET_PORT = int(os.environ.get("CHEEZE_WOL_TARGET_PORT", "9"))
CHEEZE_INTERNAL_SECRET = os.environ.get("CHEEZE_INTERNAL_SECRET", "").strip()


def normalized_wol_mac():
  return WOL_MAC.replace("-", ":").strip()


def load_registry():
  if not REGISTRY_PATH.exists():
    return {"host": {}, "services": []}
  return json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))


def find_registry_service(service_id):
  registry = load_registry()
  for service in registry.get("services", []):
    if service.get("id") == service_id:
      return service
  return None


def json_bytes(payload):
  return json.dumps(payload, ensure_ascii=False).encode("utf-8")


def backend_fetch(path, method="GET", payload=None):
  url = f"{BACKEND_AGENT_BASE.rstrip('/')}{path}"
  request = urllib.request.Request(
    url,
    data=json_bytes(payload) if payload is not None else None,
    headers={"Content-Type": "application/json"},
    method=method,
  )
  try:
    with urllib.request.urlopen(request, timeout=BACKEND_TIMEOUT) as response:
      body = response.read()
      return response.getcode(), body
  except urllib.error.HTTPError as error:
    return error.code, error.read()


def offline_service_payload(service):
  return {
    "id": service["id"],
    "display_name": service.get("display_name", service["id"]),
    "state": "offline",
    "process_running": False,
    "ready": False,
    "stop_pending": False,
    "backend_reachable": False,
    "message": BACKEND_UNREACHABLE_MESSAGE,
  }


def offline_services_payload():
  registry = load_registry()
  services = [
    offline_service_payload(service)
    for service in registry.get("services", [])
    if service.get("enabled", True)
  ]
  return {
    "services": services,
    "backend_reachable": False,
    "message": BACKEND_UNREACHABLE_MESSAGE,
  }


def backend_health():
  status_code, _ = backend_fetch("/healthz")
  return status_code == 200


def decode_backend_payload(body, *, fallback_message):
  if not body:
    return {"message": fallback_message}

  text = body.decode("utf-8", errors="replace").strip()
  if not text:
    return {"message": fallback_message}

  try:
    payload = json.loads(text)
  except json.JSONDecodeError:
    return {
      "message": fallback_message,
      "raw_body": text[:300],
    }

  if isinstance(payload, dict):
    return payload

  return {
    "message": fallback_message,
    "raw_body": text[:300],
  }


def collect_gateway_cpu():
  """Read /proc/stat twice with 0.1s interval to calculate CPU usage."""
  def read_stat():
    with open('/proc/stat', 'r') as f:
      line = f.readline()
    parts = line.split()
    # user, nice, system, idle, iowait, irq, softirq, steal, guest, guest_nice
    vals = [int(x) for x in parts[1:]]
    idle = vals[3] + vals[4]  # idle + iowait
    total = sum(vals)
    return idle, total

  idle1, total1 = read_stat()
  time.sleep(0.1)
  idle2, total2 = read_stat()

  delta_total = total2 - total1
  delta_idle = idle2 - idle1
  if delta_total == 0:
    return 0.0
  return round((1 - delta_idle / delta_total) * 100, 1)


def collect_gateway_memory():
  """Parse /proc/meminfo for memory stats."""
  info = {}
  with open('/proc/meminfo', 'r') as f:
    for line in f:
      key, _, val = line.partition(':')
      info[key.strip()] = int(val.strip().split()[0])  # kB

  total_kb = info.get('MemTotal', 0)
  available_kb = info.get('MemAvailable', 0)
  used_kb = total_kb - available_kb
  total_gb = round(total_kb / 1024 / 1024, 1)
  used_gb = round(used_kb / 1024 / 1024, 1)
  percent = round(used_kb / total_kb * 100, 1) if total_kb > 0 else 0.0
  return {'total_gb': total_gb, 'used_gb': used_gb, 'percent': percent}


def collect_gateway_disk():
  """Collect disk usage for root partition."""
  usage = shutil.disk_usage('/')
  total_gb = round(usage.total / 1024**3, 1)
  used_gb = round(usage.used / 1024**3, 1)
  free_gb = round(usage.free / 1024**3, 1)
  percent = round(usage.used / usage.total * 100, 1)
  return [{'drive': '/', 'total_gb': total_gb, 'used_gb': used_gb, 'free_gb': free_gb, 'percent': percent}]


def build_wol_command():
  if WOL_COMMAND:
    return shlex.split(WOL_COMMAND)

  command = [WOL_BINARY]
  if WOL_TARGET_IP:
    command.extend(["-i", WOL_TARGET_IP])
  if WOL_TARGET_PORT > 0:
    command.extend(["-p", str(WOL_TARGET_PORT)])
  command.append(normalized_wol_mac())
  return command


def run_wol():
  command = build_wol_command()
  try:
    result = subprocess.run(
      command,
      text=True,
      capture_output=True,
      check=False,
    )
    return {
      "returncode": result.returncode,
      "stdout": result.stdout,
      "stderr": result.stderr,
      "mac": WOL_MAC,
      "command": command,
      "target_ip": WOL_TARGET_IP or None,
      "target_port": WOL_TARGET_PORT,
    }
  except FileNotFoundError as error:
    return {
      "returncode": 127,
      "stdout": "",
      "stderr": str(error),
      "mac": WOL_MAC,
      "command": command,
      "target_ip": WOL_TARGET_IP or None,
      "target_port": WOL_TARGET_PORT,
      "error": "wol_command_not_found",
    }
  except OSError as error:
    return {
      "returncode": 1,
      "stdout": "",
      "stderr": str(error),
      "mac": WOL_MAC,
      "command": command,
      "target_ip": WOL_TARGET_IP or None,
      "target_port": WOL_TARGET_PORT,
      "error": "wol_command_failed",
    }


def ensure_backend_online():
  try:
    if backend_health():
      return {
        "woke": False,
        "ready": True,
        "message": "backend agent already online",
      }
  except Exception:
    pass

  wol_result = run_wol()
  if wol_result["returncode"] != 0:
    return {
      "woke": False,
      "ready": False,
      "message": "wake-on-lan command failed",
      "wol": wol_result,
    }

  deadline = time.time() + BACKEND_WAKE_TIMEOUT
  last_error = None

  while time.time() < deadline:
    try:
      if backend_health():
        return {
          "woke": True,
          "ready": True,
          "message": "backend agent became reachable after wake",
          "wol": wol_result,
        }
    except Exception as error:
      last_error = str(error)

    time.sleep(BACKEND_WAKE_POLL)

  return {
    "woke": True,
    "ready": False,
    "message": (
      "backend agent did not become reachable before timeout; "
      "verify LAN broadcast target and NIC wake settings"
    ),
    "wol": wol_result,
    "last_error": last_error,
  }


class Handler(BaseHTTPRequestHandler):
  server_version = "CHEEZE-Control/0.1"

  def check_internal_auth(self):
    if not CHEEZE_INTERNAL_SECRET:
      return True  # not configured = open (backward compat)
    supplied = self.headers.get("X-Cheeze-Internal-Token", "").strip()
    return hmac.compare_digest(supplied, CHEEZE_INTERNAL_SECRET)

  def do_GET(self):
    if not self.check_internal_auth():
      self.respond_json(401, {"error": "unauthorized"})
      return

    if self.path == "/healthz":
      registry = load_registry()
      self.respond_json(200, {
        "ok": True,
        "service_count": len(registry.get("services", [])),
        "internal_secret_configured": bool(CHEEZE_INTERNAL_SECRET),
      })
      return

    if self.path == "/registry":
      self.respond_json(200, load_registry())
      return

    if self.path == "/services":
      try:
        status_code, body = backend_fetch("/services")
        self.respond_raw(status_code, body)
      except Exception:
        self.respond_json(200, offline_services_payload())
      return

    if self.path.startswith("/services/") and "/console" in self.path:
      parts = self.path.split("?", 1)
      query = parts[1] if len(parts) > 1 else ""
      backend_path = parts[0] + (f"?{query}" if query else "")
      try:
        status_code, body = backend_fetch(backend_path)
        self.respond_raw(status_code, body)
      except Exception as error:
        self.respond_json(502, {"error": "backend_unreachable", "message": str(error)})
      return

    if self.path.startswith("/services/"):
      service_id = self.path.split("/", 2)[2]
      try:
        status_code, body = backend_fetch(f"/services/{service_id}")
        self.respond_raw(status_code, body)
      except Exception:
        service = find_registry_service(service_id)
        if service is None:
          self.respond_json(404, {"error": "not_found"})
          return
        self.respond_json(200, offline_service_payload(service))
      return

    if self.path == "/idle/status":
      try:
        status_code, body = backend_fetch("/idle/status")
        self.respond_raw(status_code, body)
      except Exception:
        self.respond_json(502, {"error": "backend_unreachable", "message": BACKEND_UNREACHABLE_MESSAGE})
      return

    if self.path == "/hibernate/debug":
      try:
        status_code, body = backend_fetch("/hibernate/debug")
        self.respond_raw(status_code, body)
      except Exception:
        self.respond_json(502, {"error": "backend_unreachable", "message": BACKEND_UNREACHABLE_MESSAGE})
      return

    if self.path == "/no-sleep":
      try:
        status_code, body = backend_fetch("/no-sleep")
        self.respond_raw(status_code, body)
      except Exception:
        self.respond_json(502, {"error": "backend_unreachable", "message": BACKEND_UNREACHABLE_MESSAGE})
      return

    if self.path == "/system/resources":
      try:
        status_code, body = backend_fetch("/system/resources")
        self.respond_raw(status_code, body)
      except Exception:
        self.respond_json(502, {"error": "backend_unreachable", "message": BACKEND_UNREACHABLE_MESSAGE})
      return

    if self.path == "/gateway/resources":
      try:
        cpu_percent = collect_gateway_cpu()
        memory = collect_gateway_memory()
        disk = collect_gateway_disk()
        self.respond_json(200, {
          "cpu": {"percent": cpu_percent},
          "memory": memory,
          "disk": disk,
        })
      except Exception as error:
        self.respond_json(500, {"error": "failed to collect gateway resources", "message": str(error)})
      return

    self.respond_json(404, {"error": "not_found"})

  def do_POST(self):
    if not self.check_internal_auth():
      self.respond_json(401, {"error": "unauthorized"})
      return

    if self.path == "/host/wake":
      result = run_wol()
      status_code = 202 if result["returncode"] == 0 else 500
      self.respond_json(status_code, result)
      return

    if self.path.startswith("/services/") and self.path.endswith("/start"):
      service_id = self.path.split("/")[2]
      try:
        wake_result = ensure_backend_online()
        if not wake_result["ready"]:
          self.respond_json(504, {
            "error": "backend_not_ready",
            "service": service_id,
            "message": wake_result["message"],
            "wake_result": wake_result,
          })
          return

        status_code, body = backend_fetch(f"/services/{service_id}/start", method="POST", payload={})
        payload = decode_backend_payload(body, fallback_message="backend start request completed")
        payload["wake_result"] = wake_result
        self.respond_json(status_code, payload)
      except Exception as error:
        self.respond_json(502, {"error": "backend_unreachable", "message": str(error)})
      return

    if self.path.startswith("/services/") and self.path.endswith("/stop"):
      service_id = self.path.split("/")[2]
      try:
        status_code, body = backend_fetch(f"/services/{service_id}/stop", method="POST", payload={})
        self.respond_raw(status_code, body)
      except Exception as error:
        self.respond_json(502, {"error": "backend_unreachable", "message": str(error)})
      return

    if self.path.startswith("/services/") and self.path.endswith("/console"):
      service_id = self.path.split("/")[2]
      content_length = int(self.headers.get("Content-Length", 0))
      payload = json.loads(self.rfile.read(content_length)) if content_length > 0 else {}
      try:
        status_code, body = backend_fetch(f"/services/{service_id}/console", method="POST", payload=payload)
        self.respond_raw(status_code, body)
      except Exception as error:
        self.respond_json(502, {"error": "backend_unreachable", "message": str(error)})
      return

    if self.path == "/no-sleep":
      try:
        status_code, body = backend_fetch("/no-sleep", method="POST")
        self.respond_raw(status_code, body)
      except Exception:
        self.respond_json(502, {"error": "backend_unreachable", "message": BACKEND_UNREACHABLE_MESSAGE})
      return

    self.respond_json(404, {"error": "not_found"})

  def do_DELETE(self):
    if not self.check_internal_auth():
      self.respond_json(401, {"error": "unauthorized"})
      return

    if self.path == "/no-sleep":
      try:
        status_code, body = backend_fetch("/no-sleep", method="DELETE")
        self.respond_raw(status_code, body)
      except Exception:
        self.respond_json(502, {"error": "backend_unreachable", "message": BACKEND_UNREACHABLE_MESSAGE})
      return

    self.respond_json(404, {"error": "not_found"})

  def respond_json(self, status_code, payload):
    body = json_bytes(payload)
    self.send_response(status_code)
    self.send_header("Content-Type", "application/json; charset=utf-8")
    self.send_header("Content-Length", str(len(body)))
    self.end_headers()
    self.wfile.write(body)

  def respond_raw(self, status_code, body):
    self.send_response(status_code)
    self.send_header("Content-Type", "application/json; charset=utf-8")
    self.send_header("Content-Length", str(len(body)))
    self.end_headers()
    self.wfile.write(body)

  def log_message(self, fmt, *args):
    print("%s - - %s" % (self.client_address[0], fmt % args))


def main():
  server = ThreadingHTTPServer((LISTEN_HOST, LISTEN_PORT), Handler)
  print(f"CHEEZE control API listening on {LISTEN_HOST}:{LISTEN_PORT}")
  server.serve_forever()


if __name__ == "__main__":
  main()
