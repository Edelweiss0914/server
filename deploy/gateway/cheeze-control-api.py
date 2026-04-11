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

import json
import os
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
BACKEND_WAKE_TIMEOUT = int(os.environ.get("CHEEZE_BACKEND_WAKE_TIMEOUT", "90"))
BACKEND_WAKE_POLL = int(os.environ.get("CHEEZE_BACKEND_WAKE_POLL", "3"))


def load_registry():
  if not REGISTRY_PATH.exists():
    return {"host": {}, "services": []}
  return json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))


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
  with urllib.request.urlopen(request, timeout=BACKEND_TIMEOUT) as response:
    body = response.read()
    return response.getcode(), body


def backend_health():
  status_code, _ = backend_fetch("/healthz")
  return status_code == 200


def run_wol():
  result = subprocess.run(
    ["wakeonlan", WOL_MAC],
    text=True,
    capture_output=True,
    check=False,
  )
  return {
    "returncode": result.returncode,
    "stdout": result.stdout,
    "stderr": result.stderr,
    "mac": WOL_MAC,
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
    "message": "backend agent did not become reachable before timeout",
    "wol": wol_result,
    "last_error": last_error,
  }


class Handler(BaseHTTPRequestHandler):
  server_version = "CHEEZE-Control/0.1"

  def do_GET(self):
    if self.path == "/healthz":
      registry = load_registry()
      self.respond_json(200, {
        "ok": True,
        "backend_agent_base": BACKEND_AGENT_BASE,
        "wol_mac": WOL_MAC,
        "service_count": len(registry.get("services", [])),
      })
      return

    if self.path == "/registry":
      self.respond_json(200, load_registry())
      return

    if self.path == "/services":
      try:
        status_code, body = backend_fetch("/services")
        self.respond_raw(status_code, body)
      except Exception as error:
        self.respond_json(502, {"error": "backend_unreachable", "message": str(error)})
      return

    if self.path.startswith("/services/"):
      service_id = self.path.split("/", 2)[2]
      try:
        status_code, body = backend_fetch(f"/services/{service_id}")
        self.respond_raw(status_code, body)
      except Exception as error:
        self.respond_json(502, {"error": "backend_unreachable", "message": str(error)})
      return

    self.respond_json(404, {"error": "not_found"})

  def do_POST(self):
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
            "wake_result": wake_result,
          })
          return

        status_code, body = backend_fetch(f"/services/{service_id}/start", method="POST", payload={})
        payload = json.loads(body.decode("utf-8"))
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
