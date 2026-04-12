#!/usr/bin/env python3
"""
Lightweight serialized AI gateway for Ollama.

- Accepts HTTP requests on the gateway.
- Processes one upstream AI request at a time.
- Holds a small bounded queue for waiting requests.
- Returns JSON errors when the queue is full.

Designed for the CHEEZE homepage /ai endpoint.
"""

from __future__ import annotations

import json
import os
import queue
import signal
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Dict, Optional


LISTEN_HOST = os.environ.get("CHEEZE_AI_LISTEN_HOST", "127.0.0.1")
LISTEN_PORT = int(os.environ.get("CHEEZE_AI_LISTEN_PORT", "11435"))
UPSTREAM_BASE = os.environ.get("CHEEZE_AI_UPSTREAM", "http://100.86.252.21:11434")
MAX_QUEUE_SIZE = int(os.environ.get("CHEEZE_AI_MAX_QUEUE", "2"))
REQUEST_TIMEOUT = int(os.environ.get("CHEEZE_AI_TIMEOUT", "360"))
BACKEND_BASE = os.environ.get("CHEEZE_AI_BACKEND_BASE", "http://127.0.0.1:11436")
INTERNAL_SECRET = os.environ.get("CHEEZE_INTERNAL_SECRET", "")
OLLAMA_START_TIMEOUT = int(os.environ.get("CHEEZE_AI_OLLAMA_START_TIMEOUT", "120"))
OLLAMA_POLL_INTERVAL = float(os.environ.get("CHEEZE_AI_OLLAMA_POLL_INTERVAL", "3"))

ALLOWED_METHODS = {"GET", "POST"}
ALLOWED_PATHS = {
    "/api/generate",
    "/api/tags",
    "/api/version",
}


@dataclass
class QueuedRequest:
  method: str
  path: str
  body: bytes
  headers: Dict[str, str]
  client_ip: str
  event: threading.Event = field(default_factory=threading.Event)
  status_code: int = 500
  response_body: bytes = b""
  response_headers: Dict[str, str] = field(default_factory=dict)


request_queue: "queue.Queue[QueuedRequest]" = queue.Queue(maxsize=MAX_QUEUE_SIZE)
worker_should_stop = threading.Event()
current_request_lock = threading.Lock()
current_request: Optional[QueuedRequest] = None


def json_bytes(payload: Dict[str, object]) -> bytes:
  return json.dumps(payload, ensure_ascii=False).encode("utf-8")


def _ollama_alive() -> bool:
  try:
    req = urllib.request.Request(f"{UPSTREAM_BASE.rstrip('/')}/api/version", method="GET")
    with urllib.request.urlopen(req, timeout=3) as resp:
      return resp.getcode() == 200
  except Exception:
    return False


def ensure_ollama_running() -> bool:
  """Ollama가 꺼져 있으면 backend agent에 start 명령 후 준비될 때까지 폴링. 준비되면 True 반환."""
  if _ollama_alive():
    return True

  print("[ollama-autostart] Ollama offline — triggering start via backend agent")
  try:
    headers: Dict[str, str] = {"Content-Type": "application/json"}
    if INTERNAL_SECRET:
      headers["X-Cheeze-Internal-Secret"] = INTERNAL_SECRET
    start_req = urllib.request.Request(
      f"{BACKEND_BASE.rstrip('/')}/services/ollama/start",
      data=b"{}",
      headers=headers,
      method="POST",
    )
    urllib.request.urlopen(start_req, timeout=10)
  except Exception as err:
    print(f"[ollama-autostart] Start request failed: {err}")
    return False

  deadline = time.time() + OLLAMA_START_TIMEOUT
  while time.time() < deadline and not worker_should_stop.is_set():
    time.sleep(OLLAMA_POLL_INTERVAL)
    if _ollama_alive():
      print("[ollama-autostart] Ollama is ready")
      return True

  print("[ollama-autostart] Timed out waiting for Ollama")
  return False


def sanitize_headers(source_headers: Dict[str, str]) -> Dict[str, str]:
  allowed = {}
  for key, value in source_headers.items():
    key_lower = key.lower()
    if key_lower in {"host", "content-length", "connection"}:
      continue
    allowed[key] = value
  allowed.setdefault("Content-Type", "application/json")
  return allowed


def queue_status_payload() -> Dict[str, object]:
  with current_request_lock:
    busy = current_request is not None
  return {
    "busy": busy,
    "queue_depth": request_queue.qsize(),
    "queue_limit": MAX_QUEUE_SIZE,
    "upstream": UPSTREAM_BASE,
  }


def process_request(item: QueuedRequest) -> None:
  global current_request

  with current_request_lock:
    current_request = item

  try:
    if item.method == "POST" and item.path == "/api/generate":
      if not ensure_ollama_running():
        item.status_code = 503
        item.response_body = json_bytes({
          "error": "ollama_unavailable",
          "message": "Ollama을 시작하지 못했습니다. 잠시 후 다시 시도해주세요.",
        })
        item.response_headers = {"Content-Type": "application/json; charset=utf-8"}
        return

    upstream_url = f"{UPSTREAM_BASE.rstrip('/')}{item.path}"
    upstream_request = urllib.request.Request(
      upstream_url,
      data=item.body if item.method in {"POST", "PUT", "PATCH"} else None,
      headers=sanitize_headers(item.headers),
      method=item.method,
    )

    with urllib.request.urlopen(upstream_request, timeout=REQUEST_TIMEOUT) as response:
      item.status_code = response.getcode()
      item.response_body = response.read()
      item.response_headers = {
        "Content-Type": response.headers.get("Content-Type", "application/json"),
      }
  except urllib.error.HTTPError as error:
    item.status_code = error.code
    item.response_body = error.read()
    item.response_headers = {
      "Content-Type": error.headers.get("Content-Type", "application/json"),
    }
  except Exception as error:  # pragma: no cover - operational fallback
    item.status_code = 502
    item.response_body = json_bytes({
      "error": "upstream_unavailable",
      "message": f"AI upstream request failed: {error}",
    })
    item.response_headers = {"Content-Type": "application/json; charset=utf-8"}
  finally:
    with current_request_lock:
      current_request = None
    item.event.set()


def worker_loop() -> None:
  while not worker_should_stop.is_set():
    try:
      item = request_queue.get(timeout=0.5)
    except queue.Empty:
      continue

    try:
      process_request(item)
    finally:
      request_queue.task_done()


class AiQueueHandler(BaseHTTPRequestHandler):
  server_version = "CHEEZE-AI-Queue/1.0"

  def do_GET(self) -> None:
    self.handle_request()

  def do_POST(self) -> None:
    self.handle_request()

  def handle_request(self) -> None:
    if self.command not in ALLOWED_METHODS:
      self.respond_json(405, {
        "error": "method_not_allowed",
        "message": f"{self.command} is not allowed",
      })
      return

    if self.path == "/healthz":
      self.respond_json(200, queue_status_payload())
      return

    if self.path not in ALLOWED_PATHS:
      self.respond_json(404, {
        "error": "not_found",
        "message": f"{self.path} is not exposed by the AI gateway",
      })
      return

    content_length = int(self.headers.get("Content-Length", "0"))
    body = self.rfile.read(content_length) if content_length > 0 else b""

    item = QueuedRequest(
      method=self.command,
      path=self.path,
      body=body,
      headers={key: value for key, value in self.headers.items()},
      client_ip=self.client_address[0],
    )

    try:
      request_queue.put_nowait(item)
    except queue.Full:
      self.respond_json(429, {
        "error": "queue_full",
        "message": "AI is busy right now. Please retry shortly.",
        "queue_limit": MAX_QUEUE_SIZE,
      })
      return

    item.event.wait(timeout=REQUEST_TIMEOUT + 5)
    if not item.event.is_set():
      self.respond_json(504, {
        "error": "gateway_timeout",
        "message": "The queued AI request timed out before a response was produced.",
      })
      return

    self.send_response(item.status_code)
    for key, value in item.response_headers.items():
      self.send_header(key, value)
    self.send_header("X-Cheeze-AI-Queue-Depth", str(request_queue.qsize()))
    self.end_headers()
    self.wfile.write(item.response_body)

  def respond_json(self, status_code: int, payload: Dict[str, object]) -> None:
    body = json_bytes(payload)
    self.send_response(status_code)
    self.send_header("Content-Type", "application/json; charset=utf-8")
    self.send_header("Content-Length", str(len(body)))
    self.end_headers()
    self.wfile.write(body)

  def log_message(self, fmt: str, *args: object) -> None:
    message = "%s - - [%s] %s\n" % (
      self.client_address[0],
      time.strftime("%d/%b/%Y %H:%M:%S"),
      fmt % args,
    )
    print(message, end="")


def main() -> None:
  worker = threading.Thread(target=worker_loop, daemon=True)
  worker.start()

  server = ThreadingHTTPServer((LISTEN_HOST, LISTEN_PORT), AiQueueHandler)

  def shutdown_handler(signum, frame) -> None:  # pragma: no cover - signal path
    worker_should_stop.set()
    server.shutdown()

  signal.signal(signal.SIGTERM, shutdown_handler)
  signal.signal(signal.SIGINT, shutdown_handler)

  print(
    f"CHEEZE AI queue listening on {LISTEN_HOST}:{LISTEN_PORT}, "
    f"upstream={UPSTREAM_BASE}, max_queue={MAX_QUEUE_SIZE}"
  )
  server.serve_forever()


if __name__ == "__main__":
  main()
