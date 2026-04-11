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
        status_code, body = backend_fetch(f"/services/{service_id}/start", method="POST", payload={})
        self.respond_raw(status_code, body)
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
