import importlib.util
import json
import unittest
from pathlib import Path
from unittest import mock


MODULE_PATH = Path(__file__).with_name("cheeze-portal-api.py")
SPEC = importlib.util.spec_from_file_location("cheeze_portal_api", MODULE_PATH)
portal_api = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(portal_api)
TEST_TMP_DIR = Path(__file__).with_name(".test-tmp")
TEST_TMP_DIR.mkdir(exist_ok=True)


class PortalApiAuthTests(unittest.TestCase):
  def test_authorize_action_requires_configured_token(self):
    headers = {portal_api.CONTROL_ACTION_HEADER: "anything"}

    with mock.patch.object(portal_api, "CONTROL_ACTION_TOKEN", ""), \
         mock.patch.object(portal_api, "token_registry_configured", return_value=False):
      status_code, payload, token_record = portal_api.authorize_action(headers, "minecraft-vanilla", "start")

    self.assertEqual(status_code, 503)
    self.assertEqual(payload["error"], "control_actions_unconfigured")
    self.assertIsNone(token_record)

  def test_authorize_action_accepts_legacy_env_token(self):
    headers = {portal_api.CONTROL_ACTION_HEADER: "correct-token"}

    with mock.patch.object(portal_api, "CONTROL_ACTION_TOKEN", "correct-token"):
      status_code, payload, token_record = portal_api.authorize_action(headers, "minecraft-vanilla", "start")

    self.assertIsNone(status_code)
    self.assertIsNone(payload)
    self.assertEqual(token_record["token_id"], "legacy-admin-env-token")

  def test_authorize_action_rejects_invalid_token(self):
    headers = {portal_api.CONTROL_ACTION_HEADER: "wrong-token"}

    with mock.patch.object(portal_api, "CONTROL_ACTION_TOKEN", ""), \
         mock.patch.object(portal_api, "find_token_record", return_value=None), \
         mock.patch.object(portal_api, "token_registry_configured", return_value=True):
      status_code, payload, token_record = portal_api.authorize_action(headers, "minecraft-vanilla", "start")

    self.assertEqual(status_code, 401)
    self.assertEqual(payload["error"], "invalid_control_token")
    self.assertIsNone(token_record)

  def test_authorize_action_rejects_expired_token(self):
    headers = {portal_api.CONTROL_ACTION_HEADER: "expired-token"}
    token_record = {
      "token_id": "friend-expired",
      "label": "Expired Friend Token",
      "role": "friend",
      "allowed_services": ["minecraft-vanilla"],
      "allowed_actions": ["start"],
      "expires_at": "2000-01-01T00:00:00+00:00",
      "revoked_at": None,
    }

    with mock.patch.object(portal_api, "CONTROL_ACTION_TOKEN", ""), \
         mock.patch.object(portal_api, "find_token_record", return_value=token_record), \
         mock.patch.object(portal_api, "token_registry_configured", return_value=True):
      status_code, payload, resolved_record = portal_api.authorize_action(headers, "minecraft-vanilla", "start")

    self.assertEqual(status_code, 403)
    self.assertEqual(payload["error"], "expired_control_token")
    self.assertEqual(resolved_record["token_id"], "friend-expired")

  def test_authorize_action_rejects_out_of_scope_token(self):
    headers = {portal_api.CONTROL_ACTION_HEADER: "friend-token"}
    token_record = {
      "token_id": "friend-start-only",
      "label": "Friend Start Token",
      "role": "friend",
      "allowed_services": ["minecraft-vanilla"],
      "allowed_actions": ["start"],
      "expires_at": None,
      "revoked_at": None,
    }

    with mock.patch.object(portal_api, "CONTROL_ACTION_TOKEN", ""), \
         mock.patch.object(portal_api, "find_token_record", return_value=token_record), \
         mock.patch.object(portal_api, "token_registry_configured", return_value=True):
      status_code, payload, resolved_record = portal_api.authorize_action(headers, "minecraft-vanilla", "stop")

    self.assertEqual(status_code, 403)
    self.assertEqual(payload["error"], "insufficient_control_scope")
    self.assertEqual(resolved_record["token_id"], "friend-start-only")

  def test_authorize_action_accepts_scoped_registry_token(self):
    headers = {portal_api.CONTROL_ACTION_HEADER: "friend-token"}
    token_record = {
      "token_id": "friend-minecraft-start",
      "label": "Friend Minecraft Token",
      "role": "friend",
      "allowed_services": ["minecraft-vanilla"],
      "allowed_actions": ["start"],
      "expires_at": None,
      "revoked_at": None,
    }

    with mock.patch.object(portal_api, "CONTROL_ACTION_TOKEN", ""), \
         mock.patch.object(portal_api, "find_token_record", return_value=token_record), \
         mock.patch.object(portal_api, "token_registry_configured", return_value=True):
      status_code, payload, resolved_record = portal_api.authorize_action(headers, "minecraft-vanilla", "start")

    self.assertIsNone(status_code)
    self.assertIsNone(payload)
    self.assertEqual(resolved_record["token_id"], "friend-minecraft-start")


class PortalApiRegistryTests(unittest.TestCase):
  def test_find_token_record_uses_sha256_hash_match(self):
    registry_path = TEST_TMP_DIR / "portal-token-registry-test.json"
    raw_token = "secret-token"
    registry = {
      "tokens": [
        {
          "token_id": "friend",
          "label": "Friend",
          "role": "friend",
          "token_hash": portal_api.sha256_hex(raw_token),
          "allowed_services": ["minecraft-vanilla"],
          "allowed_actions": ["start"],
        }
      ]
    }
    registry_path.write_text(json.dumps(registry), encoding="utf-8")

    with mock.patch.object(portal_api, "TOKEN_REGISTRY_PATH", registry_path):
      token_record = portal_api.find_token_record(raw_token)

    self.assertIsNotNone(token_record)
    self.assertEqual(token_record["token_id"], "friend")
    registry_path.unlink(missing_ok=True)


class PortalApiAuditTests(unittest.TestCase):
  def test_audit_log_appends_json_line(self):
    audit_path = TEST_TMP_DIR / "portal-audit-test.log"
    payload = {
      "timestamp": "2026-04-11T12:00:00+00:00",
      "service_id": "minecraft-vanilla",
      "action": "start",
      "result": "forwarded",
      "status_code": 202,
    }

    if audit_path.exists():
      audit_path.unlink()

    with mock.patch.object(portal_api, "AUDIT_LOG_PATH", audit_path):
      portal_api.audit_log(payload)

    lines = audit_path.read_text(encoding="utf-8").splitlines()

    self.assertEqual(len(lines), 1)
    self.assertEqual(json.loads(lines[0])["service_id"], "minecraft-vanilla")
    audit_path.unlink(missing_ok=True)


class PortalApiDecodeTests(unittest.TestCase):
  def test_decode_json_body_parses_json_dictionary(self):
    payload = portal_api.decode_json_body(b'{"ok": true, "message": "fine"}')

    self.assertEqual(payload["ok"], True)
    self.assertEqual(payload["message"], "fine")

  def test_decode_json_body_wraps_non_json_response(self):
    payload = portal_api.decode_json_body(b"<html>502 Bad Gateway</html>")

    self.assertEqual(payload["message"], "internal control API returned a non-JSON response")
    self.assertIn("502 Bad Gateway", payload["raw_body"])


if __name__ == "__main__":
  unittest.main()
