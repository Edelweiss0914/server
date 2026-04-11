#!/usr/bin/env python3
"""
Backend agent for on-demand service orchestration on homepc.

Capabilities:
- report service status
- start services from a registry
- stop services from a registry

This initial scaffold is intentionally conservative. It supports:
- HTTP readiness checks
- TCP readiness checks
- simple command execution
- process-name based best-effort stop fallback

Hibernate policy enforcement is documented but not yet automated in this first scaffold.
"""

from __future__ import annotations

import json
import os
import socket
import subprocess
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

  return json.loads(config_path.read_text(encoding="utf-8"))


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

    if self.path.startswith("/services/"):
      service_id = self.path.split("/")[2]
      service = find_service(config, service_id)
      if not service:
        self.respond_json(404, {"error": "not_found"})
        return
      self.respond_json(200, service_status(service))
      return

    self.respond_json(404, {"error": "not_found"})

  def do_POST(self):
    config = load_config()

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

    self.respond_json(404, {"error": "not_found"})

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
  server = ThreadingHTTPServer((LISTEN_HOST, LISTEN_PORT), Handler)
  print(f"CHEEZE backend agent listening on {LISTEN_HOST}:{LISTEN_PORT}")
  server.serve_forever()


if __name__ == "__main__":
  main()
