from __future__ import annotations

import hmac
import json
import queue
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from pulse_core import APP_VERSION, sanitize_report


class LocalCollectorServer:
    """Authenticated, loopback-only report receiver for the browser extension."""
    def __init__(self, host: str, port: int, token: str, incoming: queue.Queue,
                 wake_event: threading.Event, computer: str, windows_user: str):
        if host not in {"127.0.0.1", "localhost", "::1"}:
            raise ValueError("Collector must bind to loopback only")
        self.host, self.port, self.token = host, int(port), str(token)
        self.incoming, self.wake_event = incoming, wake_event
        self.computer, self.windows_user = str(computer), str(windows_user)
        self.httpd = None
        self.thread = None
        outer = self

        class Handler(BaseHTTPRequestHandler):
            server_version = f"ENCEVPulse/{APP_VERSION}"

            def log_message(self, *_args):
                return

            def send_error(self, code, message=None, explain=None):
                # Include CORS headers on errors so the extension can distinguish a bad key.
                text = str(message or self.responses.get(code, ("Error",))[0])
                body = (text[:300]).encode("utf-8", errors="replace")
                try:
                    self.send_response(code)
                    self._cors()
                    self.send_header("Content-Type", "text/plain; charset=utf-8")
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
                except (BrokenPipeError, ConnectionResetError, OSError):
                    pass

            def _cors(self):
                origin = self.headers.get("Origin", "")
                if origin.startswith("chrome-extension://") or origin.startswith("moz-extension://"):
                    self.send_header("Access-Control-Allow-Origin", origin)
                    self.send_header("Vary", "Origin")
                    self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS, GET")
                    self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Pulse-Token")
                    self.send_header("Access-Control-Max-Age", "600")

            def do_OPTIONS(self):
                self.send_response(204)
                self._cors()
                self.end_headers()

            def do_GET(self):
                if self.path != "/health":
                    self.send_error(404)
                    return
                # When the extension supplies a pairing token, verify it. Requests without
                # a token can still check whether the local receiver process is alive.
                supplied_token = self.headers.get("X-Pulse-Token", "")
                if supplied_token and not hmac.compare_digest(str(supplied_token), outer.token):
                    self.send_error(403, "Pairing token mismatch")
                    return
                body = json.dumps({"ok": True, "paired": bool(supplied_token), "service": "PULSE", "version": APP_VERSION}).encode("utf-8")
                self.send_response(200)
                self._cors()
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def do_POST(self):
                if self.path != "/report":
                    self.send_error(404)
                    return
                received_token = self.headers.get("X-Pulse-Token", "")
                if not hmac.compare_digest(str(received_token), outer.token):
                    self.send_error(403)
                    return
                try:
                    n = int(self.headers.get("Content-Length", "0"))
                    if n < 2 or n > 16384:
                        self.send_error(413)
                        return
                    raw = json.loads(self.rfile.read(n).decode("utf-8"))
                    if not isinstance(raw, dict):
                        raise ValueError("JSON object required")
                    report = sanitize_report(raw, outer.computer, outer.windows_user)
                    if not report.get("origin"):
                        self.send_error(400, "Portal origin missing")
                        return
                    try:
                        outer.incoming.put_nowait(("report", report))
                    except queue.Full:
                        self.send_error(429)
                        return
                    outer.wake_event.set()
                    body = b'{"queued":true}'
                    self.send_response(202)
                    self._cors()
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
                except Exception:
                    self.send_error(400, "Report could not be read")

        self.Handler = Handler

    def start(self) -> tuple[bool, str]:
        try:
            self.httpd = ThreadingHTTPServer((self.host, self.port), self.Handler)
            self.httpd.daemon_threads = True
            self.port = int(self.httpd.server_address[1])
            self.thread = threading.Thread(target=self.httpd.serve_forever, name="PulseLocalCollector", daemon=True)
            self.thread.start()
            return True, f"Yerel takip alıcısı açık: {self.host}:{self.port}"
        except OSError as exc:
            return False, f"Yerel takip alıcısı açılamadı: {exc}"

    def stop(self):
        try:
            if self.httpd:
                self.httpd.shutdown()
                self.httpd.server_close()
        except Exception:
            pass
