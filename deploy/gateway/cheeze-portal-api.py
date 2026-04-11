#!/usr/bin/env python3
"""
Public portal facade for on-demand service controls.

Responsibilities:
- Expose read-only service status to the public homepage
- Require a control action token for start/stop/wake operations
- Forward approved requests to the internal control API on localhost

The internal control API remains the only component that can wake the backend
host and dispatch service lifecycle commands.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


LISTEN_HOST = os.environ.get("CHEEZE_PORTAL_LISTEN_HOST", "127.0.0.1")
LISTEN_PORT = int(os.environ.get("CHEEZE_PORTAL_LISTEN_PORT", "11437"))
CONTROL_API_BASE = os.environ.get("CHEEZE_INTERNAL_CONTROL_BASE", "http://127.0.0.1:11436")
CONTROL_ACTION_TOKEN = os.environ.get("CHEEZE_PORTAL_CONTROL_TOKEN", "").strip()
CONTROL_ACTION_HEADER = os.environ.get("CHEEZE_PORTAL_CONTROL_HEADER", "X-Cheeze-Control-Token")
REQUEST_TIMEOUT = int(os.environ.get("CHEEZE_PORTAL_REQUEST_TIMEOUT", "210"))


def json_bytes(payload):
  return json.dumps(payload, ensure_ascii=False).encode("utf-8")


def forward_fetch(path, method="GET", payload=None, headers=None):
  url = f"{CONTROL_API_BASE.rstrip('/')}{path}"
  request_headers = {"Content-Type": "application/json"}
  if headers:
    request_headers.update(headers)

  request = urllib.request.Request(
    url,
    data=json_bytes(payload) if payload is not None else None,
    headers=request_headers,
    method=method,
  )
  try:
    with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT) as response:
      body = response.read()
      return response.getcode(), body
  except urllib.error.HTTPError as error:
    return error.code, error.read()


def action_token_configured():
  return bool(CONTROL_ACTION_TOKEN)


def authorize_action(headers):
  if not action_token_configured():
    return 503, {
      "error": "control_actions_unconfigured",
      "message": "control actions are disabled until a portal action token is configured",
    }

  supplied = headers.get(CONTROL_ACTION_HEADER, "").strip()
  if supplied != CONTROL_ACTION_TOKEN:
    return 401, {
      "error": "invalid_control_token",
      "message": "a valid control action token is required",
    }

  return None, None


def decode_json_body(body):
  if not body:
    return {"message": "empty response from internal control API"}

  text = body.decode("utf-8", errors="replace").strip()
  if not text:
    return {"message": "empty response from internal control API"}

  try:
    payload = json.loads(text)
    if isinstance(payload, dict):
      return payload
  except json.JSONDecodeError:
    pass

  return {
    "message": "internal control API returned a non-JSON response",
    "raw_body": text[:300],
  }


class Handler(BaseHTTPRequestHandler):
  server_version = "CHEEZE-Portal-Control/0.1"

  def do_GET(self):
    if self.path == "/healthz":
      self.respond_json(200, {
        "ok": True,
        "internal_control_base": CONTROL_API_BASE,
        "action_token_configured": action_token_configured(),
      })
      return

    if self.path == "/services":
      self.forward_or_error("/services")
      return

    if self.path.startswith("/services/"):
      service_id = self.path.split("/", 2)[2]
      self.forward_or_error(f"/services/{service_id}")
      return

    self.respond_json(404, {"error": "not_found"})

  def do_POST(self):
    if self.path == "/host/wake":
      self.require_auth_then_forward("/host/wake")
      return

    if self.path.startswith("/services/") and (
      self.path.endswith("/start") or self.path.endswith("/stop")
    ):
      service_id = self.path.split("/")[2]
      action = self.path.rsplit("/", 1)[1]
      self.require_auth_then_forward(f"/services/{service_id}/{action}", payload={})
      return

    self.respond_json(404, {"error": "not_found"})

  def require_auth_then_forward(self, path, payload=None):
    status_code, error_payload = authorize_action(self.headers)
    if status_code is not None:
      self.respond_json(status_code, error_payload)
      return

    self.forward_or_error(path, method="POST", payload=payload)

  def forward_or_error(self, path, method="GET", payload=None):
    try:
      status_code, body = forward_fetch(path, method=method, payload=payload)
      self.respond_raw(status_code, body)
    except Exception as error:
      self.respond_json(502, {
        "error": "internal_control_unreachable",
        "message": str(error),
      })

  def respond_json(self, status_code, payload):
    body = json_bytes(payload)
    self.send_response(status_code)
    self.send_header("Content-Type", "application/json; charset=utf-8")
    self.send_header("Content-Length", str(len(body)))
    self.end_headers()
    self.wfile.write(body)

  def respond_raw(self, status_code, body):
    if not body:
      payload = {"message": "empty response from internal control API"}
      self.respond_json(status_code, payload)
      return

    decoded = decode_json_body(body)
    response_body = json_bytes(decoded)
    self.send_response(status_code)
    self.send_header("Content-Type", "application/json; charset=utf-8")
    self.send_header("Content-Length", str(len(response_body)))
    self.end_headers()
    self.wfile.write(response_body)

  def log_message(self, fmt, *args):
    print("%s - - %s" % (self.client_address[0], fmt % args))


def main():
  server = ThreadingHTTPServer((LISTEN_HOST, LISTEN_PORT), Handler)
  print(f"CHEEZE portal control API listening on {LISTEN_HOST}:{LISTEN_PORT}")
  server.serve_forever()


if __name__ == "__main__":
  main()
