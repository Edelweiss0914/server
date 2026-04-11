#!/usr/bin/env python3
"""
Helper for generating portal control token hashes and example registry entries.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import secrets


def sha256_hex(value: str) -> str:
  return hashlib.sha256(value.encode("utf-8")).hexdigest()


def parse_csv(value: str) -> list[str]:
  items = [item.strip() for item in value.split(",")]
  return [item for item in items if item]


def main():
  parser = argparse.ArgumentParser(description="Generate a CHEEZE portal control token hash.")
  parser.add_argument("--token", help="Plaintext token. If omitted, a random token is generated.")
  parser.add_argument("--token-id", default="generated-token")
  parser.add_argument("--label", default="Generated Token")
  parser.add_argument("--role", default="friend")
  parser.add_argument("--services", default="minecraft-vanilla", help="Comma-separated allowed services")
  parser.add_argument("--actions", default="start", help="Comma-separated allowed actions")
  parser.add_argument("--expires-at", default=None, help="Optional ISO8601 timestamp")
  parser.add_argument("--generate-length", type=int, default=32, help="Length for generated tokens")
  args = parser.parse_args()

  token = args.token or secrets.token_urlsafe(args.generate_length)[:args.generate_length]
  record = {
    "token_id": args.token_id,
    "label": args.label,
    "role": args.role,
    "token_hash": sha256_hex(token),
    "allowed_services": parse_csv(args.services) or ["*"],
    "allowed_actions": parse_csv(args.actions) or ["*"],
    "expires_at": args.expires_at,
    "revoked_at": None,
  }

  print("Plain token:")
  print(token)
  print()
  print("SHA-256:")
  print(record["token_hash"])
  print()
  print("Registry entry:")
  print(json.dumps(record, ensure_ascii=False, indent=2))


if __name__ == "__main__":
  main()
