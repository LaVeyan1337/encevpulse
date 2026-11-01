from __future__ import annotations

import hashlib
import json
import os
import re
import socket
import tempfile
import shutil
import mimetypes
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from pulse_paths import pulse_data_dir

APP_NAME = "PULSE"
def _read_app_version() -> str:
    try:
        value = Path(__file__).with_name("VERSION.txt").read_text(encoding="utf-8").strip()
        if value and all(part.isdigit() for part in value.split(".")):
            return value
    except OSError:
        pass
    return "2.7.0"

APP_VERSION = _read_app_version()
DEFAULT_SHARED_ROOT = r"\\192.168.1.55\Genel Evrak\.encev_sistem\eced_pulse"
DEFAULT_PETITION_FILE = r"\\192.168.1.55\Genel Evrak\______DİLEKÇELERİMİZ\2026 DİLEKÇELER\DİLEKÇELERİMİZ 2026.docx"
CONFIG_DIR = pulse_data_dir()
CONFIG_PATH = CONFIG_DIR / "config.json"


def _windows_user() -> str:
    # On Windows, prefer the identity returned by the current process token API
    # instead of trusting an editable USERNAME environment variable.
    if os.name == "nt":
        try:
            import ctypes
            buffer = ctypes.create_unicode_buffer(256)
            size = ctypes.c_ulong(len(buffer))
            if ctypes.windll.advapi32.GetUserNameW(buffer, ctypes.byref(size)):
                value = buffer.value.strip()
                if value:
                    return value
        except Exception:
            pass
    return (os.environ.get("USERNAME") or os.environ.get("USER") or "bilinmiyor").strip()


def _hostname() -> str:
    try:
        return socket.gethostname()
    except Exception:
        return os.environ.get("COMPUTERNAME", "bilinmiyor")


def default_config() -> dict[str, Any]:
    return {
        "app_name": APP_NAME,
        "theme": "dark_velvet",
        "shared_root": DEFAULT_SHARED_ROOT,
        "portal_url": "",
        "petition_file": DEFAULT_PETITION_FILE,
        "existing_enctakip_exe": "",
        "scan_interval_sec": 15,
        "stale_after_sec": 60,
        "claim_stale_after_sec": 180,
        "allowed_accounts": [],
        "admin_users": ["burak"],
        "collector_host": "127.0.0.1",
        "collector_port": 8765,
        "pair_token": uuid.uuid4().hex + uuid.uuid4().hex,
        "computer_name": _hostname(),
        "windows_user": _windows_user(),
        "browser_tracking_note": "Tarayıcı eklentisi gerekli; parola/çerez okunmaz.",
    }


def load_config(path: Path = CONFIG_PATH) -> dict[str, Any]:
    cfg = default_config()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists():
            loaded = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                cfg.update(loaded)
        # Branding is not user-editable; preserve old settings but show the new product name.
        cfg["app_name"] = APP_NAME
        if cfg.get("theme") not in {"light_sage", "dark_velvet"}:
            cfg["theme"] = "light_sage"
        # Clamp to safe ranges.
        cfg["scan_interval_sec"] = max(10, min(120, int(cfg.get("scan_interval_sec", 15))))
        cfg["stale_after_sec"] = max(30, min(600, int(cfg.get("stale_after_sec", 60))))
        cfg["claim_stale_after_sec"] = max(60, min(900, int(cfg.get("claim_stale_after_sec", 180))))
        cfg["collector_port"] = max(1024, min(65535, int(cfg.get("collector_port", 8765))))
        # Computer/user identity is always taken from the current Windows session.
        cfg["computer_name"] = _hostname()
        cfg["windows_user"] = _windows_user()
        if not isinstance(cfg.get("allowed_accounts"), list):
            cfg["allowed_accounts"] = []
        if not isinstance(cfg.get("admin_users"), list) or not cfg.get("admin_users"):
            cfg["admin_users"] = ["burak"]
        if not str(cfg.get("pair_token", "")).strip():
            cfg["pair_token"] = uuid.uuid4().hex + uuid.uuid4().hex
        if not path.exists():
            save_config(cfg, path)
    except Exception:
        # If corrupt, do not destroy it: return safe defaults for this run.
        pass
    return cfg


def save_config(cfg: dict[str, Any], path: Path = CONFIG_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix="config_", suffix=".tmp", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_name, path)
    finally:
        try:
            if os.path.exists(tmp_name):
                os.unlink(tmp_name)
        except OSError:
            pass


def safe_slug(value: Any, maximum: int = 48) -> str:
    raw = str(value or "unknown").strip()
    raw = re.sub(r"[^A-Za-z0-9_.-]+", "_", raw).strip("._-")
    if not raw:
        raw = "unknown"
    return raw[:maximum]


def normal_account(value: Any) -> str:
    return " ".join(str(value or "").strip().casefold().split())


def safe_url_parts(url: Any) -> tuple[str, str]:
    """Return origin and path only. Query strings/fragments are deliberately never persisted."""
    from urllib.parse import urlsplit
    try:
        p = urlsplit(str(url or ""))
        if p.scheme not in {"http", "https"} or not p.hostname:
            return "", ""
        default_port = 443 if p.scheme == "https" else 80
        port = f":{p.port}" if p.port and p.port != default_port else ""
        origin = f"{p.scheme}://{p.hostname}{port}"
        path = (p.path or "/")[:160]
        return origin, path
    except Exception:
        return "", ""


def sanitize_report(raw: dict[str, Any], computer: str, windows_user: str) -> dict[str, Any]:
    """Allow-list fields so credentials, cookies, DOM dumps and query strings cannot be stored."""
    origin, safe_path = safe_url_parts(raw.get("url", ""))
    if not origin:
        origin = str(raw.get("origin", ""))[:160] if str(raw.get("origin", "")).startswith(("http://", "https://")) else ""
        safe_path = str(raw.get("page_path", "/"))[:160].split("?", 1)[0].split("#", 1)[0]
    account = re.sub(r"[\x00-\x1f\x7f]", "", str(raw.get("account_name", ""))).strip()[:100]
    account_source = str(raw.get("account_source", "unknown"))
    if account_source not in {"portal", "manual", "unknown"}:
        account_source = "unknown"
    session_state = str(raw.get("session_state", "unknown"))
    if session_state not in {"active", "logged_out", "unknown"}:
        session_state = "unknown"
    # Do not accept form fields or raw body/page content; only explicitly named visible labels.
    title = re.sub(r"[\x00-\x1f\x7f]", "", str(raw.get("tab_title", ""))).strip()[:120]
    active_ui_tab = re.sub(r"[\x00-\x1f\x7f]", "", str(raw.get("active_ui_tab", ""))).strip()[:60]
    browser = safe_slug(raw.get("browser", "browser"), 20)
    tab_id = safe_slug(raw.get("tab_id", "0"), 16)
    now = time.time()
    try:
        stamp = float(raw.get("timestamp", now))
        if stamp < now - 3600 or stamp > now + 60:
            stamp = now
    except (TypeError, ValueError):
        stamp = now
    return {
        "report_id": hashlib.sha256(f"{computer}|{browser}|{raw.get('client_id', 'default')}|{tab_id}".encode("utf-8")).hexdigest()[:24],
        "computer": str(computer)[:80],
        "windows_user": str(windows_user)[:80],
        "browser": browser,
        "tab_id": tab_id,
        "tab_title": title,
        "origin": origin,
        "page_path": safe_path,
        "active_ui_tab": active_ui_tab,
        "account_name": account,
        "account_source": account_source,
        "session_state": session_state,
        "tab_active": bool(raw.get("tab_active", False)),
        "session_observed": session_state == "active" or (bool(account) and session_state != "logged_out"),
        "last_seen": stamp,
    }


class SharedStore:
    def __init__(self, root: str | Path):
        self.root = Path(str(root))
        self.reports_dir = self.root / "reports"
        self.accounts_dir = self.root / "accounts"
        self.agents_dir = self.root / "agents"
        self.messages_dir = self.root / "messages"
        self.attachments_dir = self.root / "attachments"
        self.message_reactions_dir = self.root / "message_reactions"
        self.message_receipts_dir = self.root / "message_receipts"
        self.events_dir = self.root / "events"
        self.claims_dir = self.root / "claims"

    def ensure(self) -> None:
        for folder in (self.reports_dir, self.accounts_dir, self.agents_dir, self.messages_dir, self.attachments_dir, self.message_reactions_dir, self.message_receipts_dir, self.events_dir, self.claims_dir):
            folder.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def atomic_json(path: Path, value: dict[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_name(path.name + f".{os.getpid()}.{uuid.uuid4().hex[:8]}.tmp")
        try:
            with tmp.open("w", encoding="utf-8") as f:
                json.dump(value, f, ensure_ascii=False, separators=(",", ":"))
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, path)
        finally:
            try:
                tmp.unlink(missing_ok=True)
            except OSError:
                pass

    def save_report(self, report: dict[str, Any]) -> None:
        self.ensure()
        path = self.reports_dir / f"{report['report_id']}.json"
        self.atomic_json(path, report)
        account = re.sub(r"\s+", " ", str(report.get("account_name", "") or "")).strip()
        key = normal_account(account)
        if key:
            account_key = hashlib.sha256(key.encode("utf-8")).hexdigest()[:32]
            account_path = self.accounts_dir / f"{account_key}.json"
            previous = {}
            try:
                previous = json.loads(account_path.read_text(encoding="utf-8"))
            except (OSError, ValueError, TypeError):
                previous = {}
            seen = float(report.get("last_seen", time.time()) or time.time())
            row = {
                "account_name": str(previous.get("account_name") or account)[:100],
                "normalized_key": key,
                "first_seen": min(float(previous.get("first_seen", seen) or seen), seen),
                "last_seen": max(float(previous.get("last_seen", seen) or seen), seen),
                "last_computer": str(report.get("computer", "") or "")[:80],
                "last_windows_user": str(report.get("windows_user", "") or "")[:80],
            }
            self.atomic_json(account_path, row)

    def save_agent(self, computer: str, windows_user: str, observer_port: int) -> None:
        self.ensure()
        key = hashlib.sha256(computer.casefold().encode("utf-8")).hexdigest()[:20]
        record = {
            "computer": str(computer)[:80],
            "windows_user": str(windows_user)[:80],
            "last_seen": time.time(),
            "observer_port": int(observer_port),
            "agent_version": APP_VERSION,
        }
        self.atomic_json(self.agents_dir / f"{key}.json", record)

    def send_message(self, sender: str, computer: str, message: str, recipient: str = "Tümü",
                     attachments: list[str] | None = None) -> dict[str, Any]:
        """Write a chat message and copy arbitrary selected files to the shared attachment area.

        All formats are accepted. To keep the shared server manageable, one message can
        carry at most 10 files and each file is capped at 100 MiB.
        """
        text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", str(message or "")).strip()
        source_files = [str(x) for x in (attachments or []) if str(x).strip()]
        if not text and not source_files:
            raise ValueError("Boş mesaj: bir metin yaz veya en az bir dosya ekle.")
        if len(text) > 2000:
            raise ValueError("Mesaj en fazla 2.000 karakter olabilir.")
        if len(source_files) > 10:
            raise ValueError("Bir mesaja en fazla 10 dosya ekleyebilirsin.")
        self.ensure()
        imported = []
        created_paths = []
        total = 0
        try:
            for raw_path in source_files:
                source = Path(raw_path).expanduser()
                if not source.is_file():
                    raise FileNotFoundError(f"Eklenti bulunamadı: {source.name or raw_path}")
                size = source.stat().st_size
                if size > 100 * 1024 * 1024:
                    raise ValueError(f"{source.name}: dosya başına üst sınır 100 MiB.")
                total += size
                if total > 250 * 1024 * 1024:
                    raise ValueError("Bir mesajdaki dosyaların toplamı 250 MiB sınırını aşıyor.")
                original_name = re.sub(r"[\x00-\x1f\x7f]", "", source.name).strip()[:180] or "dosya"
                suffix = Path(original_name).suffix[:16]
                stored_name = f"{uuid.uuid4().hex}{suffix}"
                target = self.attachments_dir / stored_name
                temp = target.with_name(target.name + ".tmp")
                digest = hashlib.sha256()
                with source.open("rb") as src, temp.open("wb") as dst:
                    while True:
                        chunk = src.read(1024 * 1024)
                        if not chunk:
                            break
                        digest.update(chunk)
                        dst.write(chunk)
                    dst.flush()
                    os.fsync(dst.fileno())
                os.replace(temp, target)
                created_paths.append(target)
                imported.append({"stored_name": stored_name, "original_name": original_name,
                                 "size": size, "sha256": digest.hexdigest(),
                                 "mime_type": mimetypes.guess_type(original_name)[0] or "application/octet-stream"})
            record = {
                "id": uuid.uuid4().hex,
                "created_at": time.time(),
                "sender": re.sub(r"[\x00-\x1f\x7f]", "", str(sender or ""))[:80],
                "computer": re.sub(r"[\x00-\x1f\x7f]", "", str(computer or ""))[:80],
                "recipient": re.sub(r"[\x00-\x1f\x7f]", "", str(recipient or "Tümü"))[:100],
                "message": text,
                "attachments": imported,
                "reactions": [],
            }
            stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
            self.atomic_json(self.messages_dir / f"{stamp}_{record['id'][:10]}.json", record)
            return record
        except Exception:
            for path in created_paths:
                try:
                    path.unlink(missing_ok=True)
                except OSError:
                    pass
            raise

    def react_to_message(self, message_id: str, username: str, emoji: str) -> dict[str, Any]:
        """Store one reaction per user/message. Clicking the same emoji toggles it off."""
        message_id = re.sub(r"[^A-Za-z0-9_-]", "", str(message_id or ""))[:64]
        username = re.sub(r"[\x00-\x1f\x7f]", "", str(username or "")).strip()[:80]
        allowed = {"👍", "❤️", "😂", "😮", "😢", "🎉", "🙏", "👏", "✅", "🔥"}
        emoji = str(emoji or "").strip()
        if not message_id or not username or emoji not in allowed:
            raise ValueError("Mesaj, kullanıcı ve geçerli bir emoji gerekli.")
        self.ensure()
        if not any(str(m.get("id", "")) == message_id for m in self._read_dir(self.messages_dir, 1000)):
            raise FileNotFoundError("Mesaj artık bulunamıyor; sohbeti yenile.")
        key = hashlib.sha256(username.casefold().encode("utf-8")).hexdigest()[:20]
        path = self.message_reactions_dir / f"{message_id}_{key}.json"
        previous = {}
        try:
            previous = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            pass
        if previous.get("emoji") == emoji:
            path.unlink(missing_ok=True)
            return {"message_id": message_id, "username": username, "emoji": ""}
        record = {"message_id": message_id, "username": username, "emoji": emoji, "updated_at": time.time()}
        self.atomic_json(path, record)
        return record

    def update_message_receipt(self, message_id: str, username: str, status: str) -> dict[str, Any]:
        """Record a receiver-side delivery/read acknowledgement without rewriting the message file."""
        message_id = re.sub(r"[^A-Za-z0-9_-]", "", str(message_id or ""))[:64]
        username = re.sub(r"[\x00-\x1f\x7f]", "", str(username or "")).strip()[:80]
        status = str(status or "").strip().casefold()
        if not message_id or not username or status not in {"delivered", "read"}:
            raise ValueError("Geçerli mesaj, kullanıcı ve teslim/okundu durumu gerekli.")
        self.ensure()
        # Message IDs are only file name suffixes; verify the full ID to avoid prefix collisions.
        found = False
        for path in self.messages_dir.glob(f"*_{message_id[:10]}.json"):
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
                if str(payload.get("id", "")) == message_id:
                    found = True
                    break
            except (OSError, ValueError, TypeError):
                continue
        if not found:
            raise FileNotFoundError("Mesaj bulunamadı.")
        user_key = hashlib.sha256(username.casefold().encode("utf-8")).hexdigest()[:20]
        path = self.message_receipts_dir / f"{message_id}_{user_key}.json"
        try:
            record = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError, TypeError):
            record = {"message_id": message_id, "username": username, "delivered_at": 0.0, "read_at": 0.0}
        now = time.time()
        changed = False
        if status == "delivered" and not float(record.get("delivered_at", 0) or 0):
            record["delivered_at"] = now
            changed = True
        if status == "read":
            if not float(record.get("delivered_at", 0) or 0):
                record["delivered_at"] = now
                changed = True
            if not float(record.get("read_at", 0) or 0):
                record["read_at"] = now
                changed = True
        record["username"] = username
        record["message_id"] = message_id
        if changed:
            self.atomic_json(path, record)
        return record

    def forget_account(self, account: str) -> bool:
        """Remove a manually pinned account from the shared saved-account/claim lists only."""
        key = normal_account(account)
        if not key:
            return False
        digest = hashlib.sha256(key.encode("utf-8")).hexdigest()[:32]
        self.ensure()
        removed = False
        account_path = self.accounts_dir / f"{digest}.json"
        if account_path.exists():
            account_path.unlink(missing_ok=True)
            removed = True
        # Old report JSON keeps the account visible even after its history is forgotten.
        # Delete only records for this normalized account; a live extension may re-create
        # an observation on its next normal heartbeat.
        for report_path in self.reports_dir.glob("*.json"):
            try:
                report = json.loads(report_path.read_text(encoding="utf-8"))
            except (OSError, ValueError, TypeError):
                continue
            if normal_account(report.get("account_name", "")) == key:
                try:
                    report_path.unlink(missing_ok=True)
                    removed = True
                except OSError:
                    pass
        claim_path = self._claim_path(account)
        if claim_path.exists():
            try:
                claim_path.unlink(missing_ok=True)
                removed = True
            except OSError:
                pass
        return removed

    def _claim_path(self, account: str) -> Path:
        key = hashlib.sha256(normal_account(account).encode("utf-8")).hexdigest()[:32]
        return self.claims_dir / f"{key}.json"

    def claim_account(self, account: str, computer: str, windows_user: str, stale_after: int = 180) -> tuple[bool, str, dict[str, Any] | None]:
        account = str(account or "").strip()[:100]
        if not account:
            return False, "Önce bir e-ÇED hesabı seç.", None
        self.ensure()
        path = self._claim_path(account)
        now = time.time()
        claimant = {"account": account, "computer": str(computer)[:80], "windows_user": str(windows_user)[:80], "created_at": now, "last_seen": now}
        try:
            if path.exists():
                try:
                    current = json.loads(path.read_text(encoding="utf-8"))
                    valid_record = isinstance(current, dict) and bool(current.get("computer")) and bool(current.get("windows_user"))
                    last_seen = float(current.get("last_seen", current.get("created_at", 0)) or 0) if valid_record else 0
                except Exception:
                    current = {}
                    valid_record = False
                    last_seen = 0
                if not valid_record:
                    # A fresh/incomplete record may be another PC creating its lock. Fail closed.
                    try:
                        file_age = now - path.stat().st_mtime
                    except OSError:
                        file_age = 0
                    if file_age <= stale_after:
                        return False, "Rezervasyon kaydı şu anda yazılıyor veya okunamıyor; birkaç saniye sonra tekrar dene.", None
                    try:
                        path.unlink(missing_ok=True)
                    except OSError:
                        return False, "Eski rezervasyon temizlenemedi; ağ izinlerini kontrol et.", None
                else:
                    same_owner = (str(current.get("computer", "")).casefold() == str(computer).casefold()
                                  and str(current.get("windows_user", "")).casefold() == str(windows_user).casefold())
                    age = now - last_seen
                    if same_owner:
                        claimant["created_at"] = float(current.get("created_at", now) or now)
                        self.atomic_json(path, claimant)
                        return True, "Rezervasyon bu bilgisayarda zaten sende.", claimant
                    if age <= stale_after:
                        return False, f"{account} şu anda {current.get('computer', 'başka bilgisayar')} / {current.get('windows_user', 'başka kullanıcı')} tarafından rezerve edilmiş.", current
                    # Stale reservation cleanup is limited to the one selected account.
                    try:
                        path.unlink(missing_ok=True)
                    except OSError:
                        return False, "Eski rezervasyon temizlenemedi; ağ izinlerini kontrol et.", current
            flags = os.O_CREAT | os.O_EXCL | os.O_WRONLY
            fd = os.open(str(path), flags)
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(claimant, f, ensure_ascii=False, separators=(",", ":"))
                f.flush()
                os.fsync(f.fileno())
            return True, f"{account} için rezervasyon alındı.", claimant
        except FileExistsError:
            try:
                current = json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                current = None
            return False, f"{account} için başka bir rezervasyon aynı anda alındı; durumu yenile.", current
        except OSError as exc:
            return False, f"Rezervasyon alınamadı: {str(exc)[:140]}", None

    def release_account(self, account: str, computer: str, windows_user: str) -> tuple[bool, str]:
        account = str(account or "").strip()[:100]
        if not account:
            return False, "Önce bir e-ÇED hesabı seç."
        path = self._claim_path(account)
        try:
            current = json.loads(path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return False, "Bu hesap için aktif rezervasyon yok."
        except Exception:
            return False, "Rezervasyon kaydı okunamadı."
        if (str(current.get("computer", "")).casefold() != str(computer).casefold()
                or str(current.get("windows_user", "")).casefold() != str(windows_user).casefold()):
            return False, f"Rezervasyon {current.get('computer', 'başka bilgisayar')} üzerinde. Onu yalnızca sahibi bırakabilir."
        try:
            path.unlink()
            return True, f"{account} rezervasyonu bırakıldı."
        except OSError as exc:
            return False, f"Rezervasyon bırakılamadı: {str(exc)[:140]}"

    def heartbeat_claims(self, computer: str, windows_user: str) -> None:
        """Refresh only claims owned by this desktop instance; all I/O stays in monitor thread."""
        try:
            paths = list(self.claims_dir.glob("*.json"))
        except OSError:
            return
        for path in paths[:500]:
            try:
                current = json.loads(path.read_text(encoding="utf-8"))
                if (str(current.get("computer", "")).casefold() == str(computer).casefold()
                        and str(current.get("windows_user", "")).casefold() == str(windows_user).casefold()):
                    current["last_seen"] = time.time()
                    self.atomic_json(path, current)
            except Exception:
                continue

    def _read_dir(self, folder: Path, cap: int = 2000) -> list[dict[str, Any]]:
        try:
            paths = sorted(folder.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)[:cap]
        except OSError:
            return []
        output = []
        for p in paths:
            try:
                value = json.loads(p.read_text(encoding="utf-8"))
                if isinstance(value, dict):
                    output.append(value)
            except (OSError, ValueError, UnicodeError):
                continue
        return output

    def snapshot(self) -> dict[str, Any]:
        self.ensure()
        reports = self._read_dir(self.reports_dir)
        agents = self._read_dir(self.agents_dir, 500)
        messages = self._read_dir(self.messages_dir, 400)
        claims = self._read_dir(self.claims_dir, 500)
        seen_accounts = self._read_dir(self.accounts_dir, 5000)
        reactions = self._read_dir(self.message_reactions_dir, 4000)
        receipts = self._read_dir(self.message_receipts_dir, 8000)
        receipts_by_message: dict[str, list[dict[str, Any]]] = {}
        for receipt in receipts:
            if receipt.get("message_id") and receipt.get("username"):
                receipts_by_message.setdefault(str(receipt["message_id"]), []).append(receipt)
        reactions_by_message: dict[str, list[dict[str, Any]]] = {}
        for reaction in reactions:
            if reaction.get("message_id") and reaction.get("emoji"):
                reactions_by_message.setdefault(str(reaction["message_id"]), []).append(reaction)
        for message in messages:
            message["reactions"] = reactions_by_message.get(str(message.get("id", "")), [])
            message["receipts"] = receipts_by_message.get(str(message.get("id", "")), [])
        reports.sort(key=lambda r: float(r.get("last_seen", 0) or 0), reverse=True)
        agents.sort(key=lambda r: float(r.get("last_seen", 0) or 0), reverse=True)
        messages.sort(key=lambda r: float(r.get("created_at", 0) or 0), reverse=True)
        claims.sort(key=lambda r: float(r.get("last_seen", 0) or 0), reverse=True)
        seen_accounts.sort(key=lambda r: float(r.get("last_seen", 0) or 0), reverse=True)
        # Bound GUI rendering and avoid unbounded scan overhead.
        now = time.time()
        claims = [c for c in claims if now - float(c.get("last_seen", c.get("created_at", 0)) or 0) <= 180]
        return {"reports": reports[:500], "agents": agents[:250], "messages": messages[:200], "claims": claims[:250],
                "seen_accounts": seen_accounts[:2000], "scan_time": now}


def petition_status(path_text: str) -> dict[str, Any]:
    path = Path(str(path_text or ""))
    try:
        if not path_text or not path.exists():
            return {"exists": False, "path": str(path_text or ""), "modified": None, "size": 0, "error": "Dosya bulunamadı veya ağ yolu erişilemiyor."}
        st = path.stat()
        owner = path.parent / f"~${path.name}"
        return {
            "exists": True,
            "path": str(path),
            "modified": st.st_mtime,
            "size": st.st_size,
            "word_lock_marker": owner.exists(),
            "error": "",
        }
    except OSError as exc:
        return {"exists": False, "path": str(path), "modified": None, "size": 0, "error": str(exc)[:180]}


def classify_reports(reports: list[dict[str, Any]], agents: list[dict[str, Any]], stale_after: int,
                     allowed_accounts: list[str] | None = None, now: float | None = None) -> dict[str, Any]:
    now = time.time() if now is None else now
    allowed = {normal_account(x) for x in (allowed_accounts or []) if normal_account(x)}
    fresh = []
    for raw in reports:
        row = dict(raw)
        seen = float(row.get("last_seen", 0) or 0)
        row["fresh"] = (now - seen) <= stale_after and seen <= now + 60
        # Legacy releases did not send a session_state field. An actual visible account
        # name from those clients implied an observed login; new clients send "unknown"
        # explicitly when they cannot verify the portal session.
        if "session_state" not in row or row.get("session_state") is None:
            row["session_state"] = "active" if str(row.get("account_name", "")).strip() else "unknown"
        else:
            row["session_state"] = str(row.get("session_state") or "unknown").casefold()
        if not row["fresh"]:
            row["status"] = "Çevrimdışı"
        elif row.get("session_state") == "logged_out":
            row["status"] = "Oturum kapalı"
        elif not str(row.get("account_name", "")).strip():
            row["status"] = "Oturum açık · ad okunamadı" if row.get("session_state") == "active" else "Hesap doğrulanamadı"
        else:
            row["status"] = "Oturum gözlendi · açık sekme" if row.get("tab_active") else "Oturum gözlendi · arka plan"
        acct = normal_account(row.get("account_name", ""))
        row["not_allowed"] = bool(row["fresh"] and row.get("session_state") == "active" and acct and allowed and acct not in allowed and not any(acct in x or x in acct for x in allowed))
        fresh.append(row)
    groups: dict[str, dict[str, Any]] = {}
    for row in fresh:
        if not row["fresh"] or row.get("session_state") != "active" or not str(row.get("account_name", "")).strip():
            continue
        key = normal_account(row.get("account_name"))
        bucket = groups.setdefault(key, {"account": row.get("account_name", ""), "computers": set(), "reports": []})
        bucket["computers"].add(str(row.get("computer", "")))
        bucket["reports"].append(row)
    conflicts = [
        {"account": v["account"], "computers": sorted(c for c in v["computers"] if c), "reports": v["reports"]}
        for v in groups.values() if len({c.casefold() for c in v["computers"] if c}) > 1
    ]
    fresh_agents = []
    for raw in agents:
        row = dict(raw)
        seen = float(row.get("last_seen", 0) or 0)
        row["fresh"] = (now - seen) <= stale_after * 2 and seen <= now + 60
        fresh_agents.append(row)
    return {"reports": fresh, "agents": fresh_agents, "conflicts": conflicts,
            "active_accounts": len({normal_account(r.get("account_name")) for r in fresh if r["fresh"] and r.get("session_state") == "active" and normal_account(r.get("account_name"))}),
            "tracked_computers": len({str(r.get("computer", "")).casefold() for r in fresh if r["fresh"] and r.get("computer")})}


def unique_account_status_rows(summary: dict[str, Any], fixed_accounts: list[str] | None = None,
                               claims: list[dict[str, Any]] | None = None, network_ok: bool = True,
                               now: float | None = None) -> list[dict[str, Any]]:
    """Return one dashboard row per normalized account, with near-linear grouping.

    `fixed_accounts` are previously observed accounts, not synthetic/allow-list rows.
    Statuses: busy (green), idle (red), unknown (neutral). A network failure never
    becomes an implicit green/available status.
    """
    now = time.time() if now is None else float(now)
    account_names: dict[str, str] = {}
    for name in fixed_accounts or []:
        display = re.sub(r"\s+", " ", str(name or "")).strip()
        key = normal_account(display)
        if key:
            account_names.setdefault(key, display)

    reports = [dict(r) for r in (summary.get("reports") or []) if isinstance(r, dict)]
    reports_by_key: dict[str, list[dict[str, Any]]] = {}
    for report in reports:
        display = re.sub(r"\s+", " ", str(report.get("account_name", "") or "")).strip()
        key = normal_account(display)
        if key:
            account_names.setdefault(key, display)
            reports_by_key.setdefault(key, []).append(report)

    clean_claims = [dict(c) for c in (claims or []) if isinstance(c, dict)]
    claims_by_key: dict[str, list[dict[str, Any]]] = {}
    for claim in clean_claims:
        key = normal_account(claim.get("account", ""))
        if not key:
            continue
        display = re.sub(r"\s+", " ", str(claim.get("account", "") or "")).strip()
        if display:
            account_names.setdefault(key, display)
        try:
            seen = float(claim.get("last_seen", claim.get("created_at", 0)) or 0)
        except (TypeError, ValueError):
            continue
        if now - seen <= 180 and seen <= now + 60:
            claims_by_key.setdefault(key, []).append(claim)

    rows = []
    exact_encev_names = {"en-çev", "en çev", "encev", "ençev", "en-çev hesabı", "en cev hesabı", "en çev hesabı", "ençev hesabı"}
    for key, name in account_names.items():
        relevant_reports = reports_by_key.get(key, [])
        latest = max(relevant_reports, key=lambda r: float(r.get("last_seen", 0) or 0), default={})
        relevant_claims = claims_by_key.get(key, [])
        claim = max(relevant_claims, key=lambda c: float(c.get("last_seen", c.get("created_at", 0)) or 0), default={})
        fresh_reports = [r for r in relevant_reports if bool(r.get("fresh"))]
        active_observation = any(str(r.get("session_state", "unknown")).casefold() == "active" for r in fresh_reports)
        logged_out_observation = any(str(r.get("session_state", "unknown")).casefold() == "logged_out" for r in fresh_reports)
        fresh_unknown_observation = any(
            str(r.get("session_state", "unknown")).casefold() not in {"active", "logged_out"}
            for r in fresh_reports
        )
        if not network_ok:
            code, label = "unknown", "Ağ doğrulanamadı"
        elif claim or active_observation:
            code, label = "busy", "Kullanımda"
        elif logged_out_observation:
            code, label = "idle", "Oturum kapalı"
        elif fresh_unknown_observation:
            code, label = "unknown", "Durum belirsiz"
        elif relevant_reports:
            # Red means no recent observation, not authoritative proof of logout.
            code, label = "idle", "Sinyal yok · oturum kapalı olabilir"
        else:
            code, label = "unknown", "Durum belirsiz"
        user = str(claim.get("windows_user", "") or "—") if claim else str(latest.get("windows_user", "") or "—")
        compact = key.replace(" ", "").replace("ç", "c").replace("ğ", "g").replace("ı", "i").replace("ö", "o").replace("ş", "s").replace("ü", "u")
        if key in exact_encev_names:
            priority = 0
        elif "encev" in compact or "en-cev" in compact or "en-çev" in key:
            priority = 1
        else:
            priority = 2
        rows.append({"account_name": name, "windows_user": user, "status_code": code, "status_label": label,
                     "latest_report": latest, "pinned": priority == 0, "priority": priority,
                     "fresh": bool(latest.get("fresh"))})
    rows.sort(key=lambda r: (r["priority"], r["account_name"].casefold()))
    return rows

def observed_account_on_other_computer(
    account: str,
    reports: list[dict[str, Any]],
    local_computer: str,
    stale_after: int = 60,
    now: float | None = None,
) -> list[dict[str, Any]]:
    """Return fresh observations of the same visible account on other PCs.

    This is a best-effort conflict guard based on explicitly observed browser
    labels, not server-authoritative proof of a portal session.
    """
    target = normal_account(account)
    if not target:
        return []
    now = time.time() if now is None else now
    local = str(local_computer or "").casefold()
    matches: dict[str, dict[str, Any]] = {}
    for raw in reports:
        try:
            seen = float(raw.get("last_seen", 0) or 0)
        except (TypeError, ValueError):
            continue
        if (now - seen) > max(1, int(stale_after)) or seen > now + 60:
            continue
        if normal_account(raw.get("account_name", "")) != target:
            continue
        computer = str(raw.get("computer", "")).strip()
        key = computer.casefold()
        if not computer or key == local:
            continue
        previous = matches.get(key)
        if previous is None or seen > float(previous.get("last_seen", 0) or 0):
            matches[key] = dict(raw)
    return sorted(matches.values(), key=lambda r: str(r.get("computer", "")).casefold())
