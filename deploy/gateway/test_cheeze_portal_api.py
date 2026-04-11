import importlib.util
import unittest
from pathlib import Path
from unittest import mock


MODULE_PATH = Path(__file__).with_name("cheeze-portal-api.py")
SPEC = importlib.util.spec_from_file_location("cheeze_portal_api", MODULE_PATH)
portal_api = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(portal_api)


class PortalApiAuthTests(unittest.TestCase):
  def test_authorize_action_requires_configured_token(self):
    headers = {portal_api.CONTROL_ACTION_HEADER: "anything"}

    with mock.patch.object(portal_api, "CONTROL_ACTION_TOKEN", ""):
      status_code, payload = portal_api.authorize_action(headers)

    self.assertEqual(status_code, 503)
    self.assertEqual(payload["error"], "control_actions_unconfigured")

  def test_authorize_action_rejects_invalid_token(self):
    headers = {portal_api.CONTROL_ACTION_HEADER: "wrong-token"}

    with mock.patch.object(portal_api, "CONTROL_ACTION_TOKEN", "correct-token"):
      status_code, payload = portal_api.authorize_action(headers)

    self.assertEqual(status_code, 401)
    self.assertEqual(payload["error"], "invalid_control_token")

  def test_authorize_action_accepts_matching_token(self):
    headers = {portal_api.CONTROL_ACTION_HEADER: "correct-token"}

    with mock.patch.object(portal_api, "CONTROL_ACTION_TOKEN", "correct-token"):
      status_code, payload = portal_api.authorize_action(headers)

    self.assertIsNone(status_code)
    self.assertIsNone(payload)


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
