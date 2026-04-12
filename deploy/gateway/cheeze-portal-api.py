#!/usr/bin/env python3
"""
Public portal facade for on-demand service controls.

Responsibilities:
- Expose read-only service status to the public homepage
- Require scoped control tokens for start/stop/wake operations
- Forward approved requests to the internal control API on localhost
- Emit simple audit logs for control attempts

The internal control API remains the only component that can wake the backend
host and dispatch service lifecycle commands.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


LISTEN_HOST = os.environ.get("CHEEZE_PORTAL_LISTEN_HOST", "127.0.0.1")
LISTEN_PORT = int(os.environ.get("CHEEZE_PORTAL_LISTEN_PORT", "11437"))
CONTROL_API_BASE = os.environ.get("CHEEZE_INTERNAL_CONTROL_BASE", "http://127.0.0.1:11436")
CONTROL_ACTION_TOKEN = os.environ.get("CHEEZE_PORTAL_CONTROL_TOKEN", "").strip()
CONTROL_ACTION_HEADER = os.environ.get("CHEEZE_PORTAL_CONTROL_HEADER", "X-Cheeze-Control-Token")
REQUEST_TIMEOUT = int(os.environ.get("CHEEZE_PORTAL_REQUEST_TIMEOUT", "210"))
TOKEN_REGISTRY_PATH = Path(os.environ.get(
  "CHEEZE_PORTAL_TOKEN_REGISTRY",
  "/opt/cheeze-control/portal-control-tokens.example.json",
))
AUDIT_LOG_PATH = Path(os.environ.get(
  "CHEEZE_PORTAL_AUDIT_LOG",
  "/opt/cheeze-control/portal-control-audit.log",
))
CHEEZE_INTERNAL_SECRET = os.environ.get("CHEEZE_INTERNAL_SECRET", "").strip()


def now_utc():
  return datetime.now(timezone.utc)


def utc_timestamp():
  return now_utc().isoformat()


def json_bytes(payload):
  return json.dumps(payload, ensure_ascii=False).encode("utf-8")


def sha256_hex(value):
  return hashlib.sha256(value.encode("utf-8")).hexdigest()


def parse_datetime(value):
  if not value:
    return None

  normalized = value.replace("Z", "+00:00")
  return datetime.fromisoformat(normalized)


def forward_fetch(path, method="GET", payload=None, headers=None):
  url = f"{CONTROL_API_BASE.rstrip('/')}{path}"
  request_headers = {"Content-Type": "application/json"}
  if headers:
    request_headers.update(headers)
  if CHEEZE_INTERNAL_SECRET:
    request_headers["X-Cheeze-Internal-Token"] = CHEEZE_INTERNAL_SECRET

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


def load_token_registry():
  if not TOKEN_REGISTRY_PATH.exists():
    return []

  payload = json.loads(TOKEN_REGISTRY_PATH.read_text(encoding="utf-8"))
  tokens = payload.get("tokens", [])
  return tokens if isinstance(tokens, list) else []


def token_registry_configured():
  return bool(load_token_registry())


def action_token_configured():
  return bool(CONTROL_ACTION_TOKEN) or token_registry_configured()


SERVICE_ID_PATTERN = re.compile(r'^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$')


def valid_service_id(service_id):
  return bool(SERVICE_ID_PATTERN.match(service_id))


def token_matches_record(raw_token, token_record):
  expected_hash = token_record.get("token_hash", "").strip().lower()
  if not expected_hash:
    return False

  return hmac.compare_digest(sha256_hex(raw_token).lower(), expected_hash)


def token_expired(token_record):
  expires_at = token_record.get("expires_at")
  if not expires_at:
    return False

  return now_utc() >= parse_datetime(expires_at)


def token_revoked(token_record):
  return bool(token_record.get("revoked_at"))


def scope_matches(value, patterns):
  if not patterns:
    return False

  for pattern in patterns:
    if pattern == "*":
      return True
    if pattern == value:
      return True
    if pattern.endswith("/*") and value.startswith(pattern[:-1]):
      return True

  return False


def token_allows(token_record, service_id, action):
  allowed_actions = token_record.get("allowed_actions") or ["*"]
  allowed_services = token_record.get("allowed_services") or ["*"]
  return scope_matches(action, allowed_actions) and scope_matches(service_id, allowed_services)


def find_token_record(raw_token):
  for token_record in load_token_registry():
    if token_matches_record(raw_token, token_record):
      return token_record
  return None


def audit_log(payload):
  AUDIT_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
  with AUDIT_LOG_PATH.open("a", encoding="utf-8") as handle:
    handle.write(json.dumps(payload, ensure_ascii=False) + "\n")


def authorize_admin(headers):
  """Returns (error_status, error_payload) or (None, None) if admin."""
  supplied = headers.get(CONTROL_ACTION_HEADER, "").strip()
  if not supplied:
    return 401, {"error": "unauthorized", "message": "admin token required"}
  # Check legacy env token
  if CONTROL_ACTION_TOKEN and hmac.compare_digest(supplied, CONTROL_ACTION_TOKEN):
    return None, None
  # Check registry for admin role
  token_record = find_token_record(supplied)
  if token_record is None:
    return 401, {"error": "unauthorized", "message": "invalid token"}
  if token_revoked(token_record) or token_expired(token_record):
    return 403, {"error": "forbidden", "message": "token revoked or expired"}
  if token_record.get("role") != "admin":
    return 403, {"error": "forbidden", "message": "admin role required"}
  return None, None


def authorize_action(headers, service_id, action):
  supplied = headers.get(CONTROL_ACTION_HEADER, "").strip()
  if not CONTROL_ACTION_TOKEN and not token_registry_configured():
    return 503, {
      "error": "control_actions_unconfigured",
      "message": "control actions are disabled until a portal action token is configured",
    }, None

  if not supplied:
    return 401, {
      "error": "invalid_control_token",
      "message": "a valid control action token is required",
    }, None

  if CONTROL_ACTION_TOKEN and hmac.compare_digest(supplied, CONTROL_ACTION_TOKEN):
    return None, None, {
      "token_id": "legacy-admin-env-token",
      "label": "Legacy Admin Env Token",
      "role": "admin",
      "allowed_actions": ["*"],
      "allowed_services": ["*"],
      "source": "legacy_env",
    }

  token_record = find_token_record(supplied)
  if token_record is None:
    return 401, {
      "error": "invalid_control_token",
      "message": "a valid control action token is required",
    }, None

  if token_revoked(token_record):
    return 403, {
      "error": "revoked_control_token",
      "message": "the supplied control token has been revoked",
    }, token_record

  if token_expired(token_record):
    return 403, {
      "error": "expired_control_token",
      "message": "the supplied control token has expired",
    }, token_record

  if not token_allows(token_record, service_id, action):
    return 403, {
      "error": "insufficient_control_scope",
      "message": f"the supplied control token is not allowed to {action} {service_id}",
    }, token_record

  return None, None, token_record


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
  server_version = "CHEEZE-Portal-Control/0.2"

  def do_GET(self):
    if self.path == "/healthz":
      self.respond_json(200, {
        "ok": True,
        "action_token_configured": action_token_configured(),
        "token_registry_configured": token_registry_configured(),
        "internal_secret_configured": bool(CHEEZE_INTERNAL_SECRET),
      })
      return

    if self.path == "/services":
      self.forward_or_error("/services")
      return

    if self.path.startswith("/services/"):
      service_id = self.path.split("/", 2)[2]
      if not valid_service_id(service_id):
        self.respond_json(400, {"error": "invalid_service_id"})
        return
      self.forward_or_error(f"/services/{service_id}")
      return

    if self.path == "/admin/status":
      self.handle_admin_status()
      return

    if self.path.startswith("/admin/audit"):
      self.handle_admin_audit()
      return

    self.respond_json(404, {"error": "not_found"})

  def do_POST(self):
    if self.path == "/host/wake":
      self.require_auth_then_forward("/host/wake", service_id="host", action="wake")
      return

    if self.path.startswith("/services/") and (
      self.path.endswith("/start") or self.path.endswith("/stop")
    ):
      service_id = self.path.split("/")[2]
      action = self.path.rsplit("/", 1)[1]
      if not valid_service_id(service_id):
        self.respond_json(400, {"error": "invalid_service_id"})
        return
      self.require_auth_then_forward(
        f"/services/{service_id}/{action}",
        payload={},
        service_id=service_id,
        action=action,
      )
      return

    self.respond_json(404, {"error": "not_found"})

  def handle_admin_status(self):
    error_status, error_payload = authorize_admin(self.headers)
    if error_status is not None:
      self.respond_json(error_status, error_payload)
      return

    # Fetch /services from control API
    services = None
    try:
      status_code, body = forward_fetch("/services")
      parsed = decode_json_body(body)
      services = parsed.get("services", parsed) if isinstance(parsed, dict) else parsed
    except Exception:
      services = None

    # Fetch /healthz from control API
    control_api_info = {"reachable": False}
    try:
      status_code, body = forward_fetch("/healthz")
      if status_code == 200:
        parsed = decode_json_body(body)
        parsed["reachable"] = True
        control_api_info = parsed
      else:
        control_api_info = {"reachable": False, "status_code": status_code}
    except Exception as error:
      control_api_info = {"reachable": False, "error": str(error)}

    self.respond_json(200, {
      "services": services,
      "control_api": control_api_info,
      "portal": {
        "action_token_configured": action_token_configured(),
        "token_registry_configured": token_registry_configured(),
      },
    })

  def handle_admin_audit(self):
    error_status, error_payload = authorize_admin(self.headers)
    if error_status is not None:
      self.respond_json(error_status, error_payload)
      return

    # Parse query params
    query = ""
    if "?" in self.path:
      query = self.path.split("?", 1)[1]

    params = {}
    for part in query.split("&"):
      if "=" in part:
        k, v = part.split("=", 1)
        params[k] = v

    try:
      limit = min(int(params.get("limit", "100")), 500)
    except (ValueError, TypeError):
      limit = 100
    try:
      offset = max(int(params.get("offset", "0")), 0)
    except (ValueError, TypeError):
      offset = 0

    if not AUDIT_LOG_PATH.exists():
      self.respond_json(200, {"entries": [], "total": 0, "limit": limit, "offset": offset})
      return

    entries = []
    with AUDIT_LOG_PATH.open("r", encoding="utf-8") as handle:
      for line in handle:
        line = line.strip()
        if not line:
          continue
        try:
          entries.append(json.loads(line))
        except json.JSONDecodeError:
          pass

    total = len(entries)
    # Return last `limit` entries starting from `offset` (from end)
    start = max(total - offset - limit, 0)
    end = total - offset
    if end <= 0:
      page = []
    else:
      page = entries[start:end]

    self.respond_json(200, {
      "entries": page,
      "total": total,
      "limit": limit,
      "offset": offset,
    })

  def require_auth_then_forward(self, path, *, service_id, action, payload=None):
    status_code, error_payload, token_record = authorize_action(self.headers, service_id, action)
    if status_code is not None:
      self.record_audit(
        service_id=service_id,
        action=action,
        result="rejected",
        status_code=status_code,
        token_record=token_record,
        error=error_payload.get("error"),
      )
      self.respond_json(status_code, error_payload)
      return

    self.forward_or_error(path, method="POST", payload=payload, service_id=service_id, action=action, token_record=token_record)

  def forward_or_error(self, path, method="GET", payload=None, service_id=None, action=None, token_record=None):
    try:
      status_code, body = forward_fetch(path, method=method, payload=payload)
      if method != "GET" and service_id and action:
        self.record_audit(
          service_id=service_id,
          action=action,
          result="forwarded" if 200 <= status_code < 500 else "failed",
          status_code=status_code,
          token_record=token_record,
        )
      self.respond_raw(status_code, body)
    except Exception as error:
      if method != "GET" and service_id and action:
        self.record_audit(
          service_id=service_id,
          action=action,
          result="error",
          status_code=502,
          token_record=token_record,
          error=str(error),
        )
      self.respond_json(502, {
        "error": "internal_control_unreachable",
        "message": str(error),
      })

  def record_audit(self, *, service_id, action, result, status_code, token_record=None, error=None):
    audit_log({
      "timestamp": utc_timestamp(),
      "service_id": service_id,
      "action": action,
      "result": result,
      "status_code": status_code,
      "token_id": token_record.get("token_id") if token_record else None,
      "token_label": token_record.get("label") if token_record else None,
      "token_role": token_record.get("role") if token_record else None,
      "remote_ip": self.client_address[0] if self.client_address else None,
      "user_agent": self.headers.get("User-Agent", ""),
      "error": error,
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
