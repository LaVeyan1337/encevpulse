"""Pulse bridge for the existing ENCTakip shared petition workflow.

It deliberately uses ENCTakip's existing shared-file formats so the old and new
clients observe the same lock.json, wait queue, presence and activity log. All
network/file operations are intended to run on Pulse's MonitorWorker thread.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import socket
import time
import uuid
import ctypes
import csv
import io
import locale
import subprocess
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Callable

LOCK_STALE_SECONDS = 90
HEARTBEAT_SECONDS = 20
ONLINE_SECONDS = 90
RESERVATION_SECONDS = 20
PRESENCE_HEARTBEAT_SECONDS = 25
IDLE_WARNING_SECONDS = 180
BACKUP_LIMIT = 30


def infer_legacy_system_dir(shared_root: str | Path, explicit: str | Path = "") -> Path:
    """Resolve the common .encev_sistem directory shared with ENCTakip.

    The normal Pulse root is ``<share>/.encev_sistem/eced_pulse``; its parent is
    exactly where ENCTakip stores kilit.json, gunluk.jsonl and queue files.
    An explicit override is supported for custom installations.
    """
    if str(explicit or "").strip():
        return Path(str(explicit).strip())
    root = Path(str(shared_root or "").strip())
    if root.name.casefold() in {"eced_pulse", "pulse"} and root.parent.name.casefold() == ".encev_sistem":
        return root.parent
    for parent in (root, *root.parents):
        if parent.name.casefold() == ".encev_sistem":
            return parent
    # Do not place ENCTakip state inside Pulse's e-ÇED subfolder by default.
    return root.parent / ".encev_sistem" if str(root) else Path.home() / ".encev_sistem"


def _parse_time(value: Any) -> datetime | None:
    try:
        if isinstance(value, (int, float)) and value > 0:
            return datetime.fromtimestamp(float(value))
        dt = datetime.fromisoformat(str(value or ""))
        if dt.tzinfo is not None:
            return dt.astimezone().replace(tzinfo=None)
        return dt
    except (TypeError, ValueError, OverflowError):
        return None


def _fmt_time(value: Any) -> str:
    dt = _parse_time(value)
    return dt.strftime("%d.%m.%Y %H:%M:%S") if dt else ""


def _duration(seconds: Any) -> str:
    try:
        s = max(0, int(float(seconds or 0)))
    except (TypeError, ValueError, OverflowError):
        s = 0
    days, rest = divmod(s, 86400)
    hours, rest = divmod(rest, 3600)
    minutes, secs = divmod(rest, 60)
    if days:
        return f"{days} gün {hours} sa"
    if hours:
        return f"{hours} sa {minutes} dk"
    if minutes:
        return f"{minutes} dk {secs} sn"
    return f"{secs} sn"


def _read_jsonl_tail(path: Path, max_lines: int = 2000, max_bytes: int = 512 * 1024) -> list[dict[str, Any]]:
    try:
        if not path.is_file():
            return []
        with path.open("rb") as f:
            size = f.seek(0, os.SEEK_END)
            f.seek(max(0, size - max_bytes))
            data = f.read(max_bytes)
        lines = data.decode("utf-8", errors="replace").splitlines()[-max_lines:]
        out = []
        for line in lines:
            try:
                obj = json.loads(line)
                if isinstance(obj, dict):
                    out.append(obj)
            except json.JSONDecodeError:
                continue
        return out
    except OSError:
        return []


class PulsePetitionService:
    """A small compatible client for ENCTakip's shared Word locking workflow."""

    def __init__(self, document_path: str, shared_root: str, windows_user: str,
                 computer_name: str, system_dir: str | Path = "",
                 physical_lock_probe: Callable[[Path], bool | None] | None = None,
                 opener: Callable[[Path], None] | None = None):
        self.document = Path(str(document_path or "").strip()) if str(document_path or "").strip() else Path()
        self.user = str(windows_user or os.environ.get("USERNAME") or os.environ.get("USER") or "bilinmiyor").strip() or "bilinmiyor"
        self.computer = str(computer_name or socket.gethostname()).strip() or "bilinmiyor"
        self.system_dir = infer_legacy_system_dir(shared_root, system_dir)
        self.lock_path = self.system_dir / "kilit.json"
        self.queue_path = self.system_dir / "bekleme_sirasi.jsonl"
        self.messages_path = self.system_dir / "mesajlar.jsonl"
        self.log_path = self.system_dir / "gunluk.jsonl"
        self.presence_dir = self.system_dir / "varlik"
        self.backups_dir = self.system_dir / "yedekler"
        self._physical_lock_probe = physical_lock_probe or self._physical_lock_state
        self._opener = opener or self._open_file
        self._owned_opened_at = ""
        self._last_heartbeat_mono = 0.0
        self._last_presence_mono = 0.0
        self._last_document_signature: tuple[int, int] | None = None
        self._last_backup_signature: tuple[int, int] | None = None
        self._docx_meta_signature: tuple[int, int] | None = None
        self._docx_last_modified_by = ""
        self._last_backup_error = ""
        self._legacy_owner_cache_until = 0.0
        self._legacy_owner_cache: tuple[str, str, str] = ("", "", "")

    def _open_file(self, path: Path) -> None:
        if os.name != "nt" or not hasattr(os, "startfile"):
            raise OSError("Kilitli Word açma işlemi yalnızca Windows üzerinde desteklenir.")
        os.startfile(str(path))  # type: ignore[attr-defined]

    @staticmethod
    def _physical_lock_state(path: Path) -> bool | None:
        """True=sharing violation, False=openable, None=unable to verify."""
        if os.name != "nt":
            return None
        invalid = ctypes.c_void_p(-1).value
        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        create = kernel32.CreateFileW
        create.argtypes = [ctypes.c_wchar_p, ctypes.c_uint32, ctypes.c_uint32,
                           ctypes.c_void_p, ctypes.c_uint32, ctypes.c_uint32, ctypes.c_void_p]
        create.restype = ctypes.c_void_p
        close = kernel32.CloseHandle
        close.argtypes = [ctypes.c_void_p]
        close.restype = ctypes.c_int
        handle = create(str(path), 0x80000000, 0, None, 3, 0x80, None)
        if handle != invalid:
            close(handle)
            return False
        error = ctypes.get_last_error()
        if error == 32:  # ERROR_SHARING_VIOLATION
            return True
        if error in (2, 3):  # FILE_NOT_FOUND / PATH_NOT_FOUND
            return False
        # Access denied is not proof of a lock; avoid claiming the file is free.
        return None

    def _backup_signature(self, stat_result) -> tuple[int, int]:
        return int(stat_result.st_size), int(getattr(stat_result, "st_mtime_ns", int(stat_result.st_mtime * 1e9)))

    def _read_docx_last_modified_by(self, stat_result) -> str:
        """Read Word's visible LastSavedBy property, caching it by file signature.

        The DOCX core-properties XML is tiny compared with the embedded images in
        the document. It is read only when size/mtime changes, never on every UI
        redraw, and metadata failure does not affect lock status.
        """
        signature = self._backup_signature(stat_result)
        if signature == self._docx_meta_signature:
            return self._docx_last_modified_by
        self._docx_meta_signature = signature
        self._docx_last_modified_by = ""
        try:
            with zipfile.ZipFile(self.document, "r") as doc:
                raw = doc.read("docProps/core.xml")
            root = ET.fromstring(raw)
            for element in root.iter():
                if element.tag.rsplit("}", 1)[-1] == "lastModifiedBy":
                    self._docx_last_modified_by = str(element.text or "").strip()[:120]
                    break
        except (OSError, KeyError, ValueError, zipfile.BadZipFile, ET.ParseError):
            self._docx_last_modified_by = ""
        return self._docx_last_modified_by

    def _observe_document_backup(self, stat_result) -> None:
        """Create version copies after DOCX changes, using ENCTakip's backup layout."""
        signature = self._backup_signature(stat_result)
        if self._last_document_signature is None:
            self._last_document_signature = signature
            # Do not create a duplicate backup on every fresh Pulse launch.
            self._last_backup_signature = signature
            return
        changed = signature != self._last_document_signature
        self._last_document_signature = signature
        if not changed and signature == self._last_backup_signature:
            return
        try:
            self.backups_dir.mkdir(parents=True, exist_ok=True)
            stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            target = self.backups_dir / f"{self.document.stem}__{stamp}{self.document.suffix}"
            suffix = 2
            while target.exists():
                target = self.backups_dir / f"{self.document.stem}__{stamp}_{suffix}{self.document.suffix}"
                suffix += 1
            shutil.copy2(self.document, target)
            self._last_backup_signature = signature
            self._last_backup_error = ""
            for old in self.list_backups()[BACKUP_LIMIT:]:
                try:
                    Path(old["path"]).unlink()
                except OSError:
                    pass
        except OSError as exc:
            # Retry on the next poll while this file revision remains un-backed-up.
            self._last_backup_error = str(exc)[:180]

    def list_backups(self, limit: int = BACKUP_LIMIT) -> list[dict[str, Any]]:
        if not self.document.name:
            return []
        try:
            files = sorted(
                self.backups_dir.glob(f"{self.document.stem}__*{self.document.suffix}"),
                key=lambda path: path.stat().st_mtime,
                reverse=True,
            )
        except OSError:
            return []
        rows = []
        for path in files[:max(1, min(200, int(limit)) )]:
            try:
                stat = path.stat()
                rows.append({
                    "name": path.name, "path": str(path), "size": int(stat.st_size),
                    "modified": _fmt_time(datetime.fromtimestamp(stat.st_mtime).isoformat()),
                    "mtime": stat.st_mtime,
                })
            except OSError:
                continue
        return rows

    def idle_seconds(self) -> int | None:
        """Return seconds since the legacy Word owner-marker last changed."""
        if not self.document.name:
            return None
        marker = self.document.parent / f"~${self.document.name}"
        try:
            return max(0, int(time.time() - marker.stat().st_mtime))
        except OSError:
            # Word's ~$ file is the activity signal used by the original ENCTakip.
            return None

    def _publish_presence(self, force: bool = False) -> None:
        """Publish Pulse's presence in ENCTakip's exact varlik/<user>.json format.

        Legacy ENCTakip clients can therefore see Pulse users online, rather than
        showing only users running the old standalone application.
        """
        now_mono = time.monotonic()
        if not force and now_mono - self._last_presence_mono < PRESENCE_HEARTBEAT_SECONDS:
            return
        safe_user = re.sub(r"[^a-zA-Z0-9_\-]", "_", self.user) or "bilinmiyor"
        target = self.presence_dir / f"{safe_user}.json"
        payload = {
            "kullanici": self.user,
            "bilgisayar": self.computer,
            "son_gorulme": datetime.now().isoformat(timespec="seconds"),
        }
        temp = target.with_name(target.name + f".{uuid.uuid4().hex[:8]}.tmp")
        try:
            self.presence_dir.mkdir(parents=True, exist_ok=True)
            temp.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
            os.replace(temp, target)
            self._last_presence_mono = now_mono
        except OSError:
            try:
                temp.unlink(missing_ok=True)
            except OSError:
                pass

    def access_history(self, limit: int = 5000) -> list[dict[str, Any]]:
        """Return recent ENCTakip-compatible access/audit rows for the Pulse UI."""
        count = max(1, min(20000, int(limit)))
        return _read_jsonl_tail(self.log_path, max_lines=count, max_bytes=4 * 1024 * 1024)[-count:]

    @staticmethod
    def _legacy_target_to_pulse(target: Any) -> tuple[str, bool]:
        value = str(target or "GENEL").strip()
        normalized = value.casefold()
        if normalized in {"genel", "tümü", "tumü", "all"}:
            return "Tümü", False
        if normalized == "oda_eced":
            return "ENCTakip · e-ÇED", True
        if normalized == "oda_dilek":
            return "ENCTakip · Dilekçeler", True
        return value, False

    @staticmethod
    def _pulse_target_to_legacy(target: Any) -> str:
        value = str(target or "Tümü").strip()
        normalized = value.casefold()
        if normalized in {"tümü", "tumü", "all", "genel"}:
            return "GENEL"
        if normalized in {"enç takip · e-çed", "enctakip · e-çed", "e-çed odası", "eced room"}:
            return "ODA_ECED"
        if normalized in {"enctakip · dilekçeler", "dilekçeler odası", "petition room"}:
            return "ODA_DILEK"
        return value

    def legacy_chat_messages(self, limit: int = 300) -> list[dict[str, Any]]:
        """Adapt ENCTakip's JSONL chat to Pulse's existing message model."""
        rows = _read_jsonl_tail(self.messages_path, max_lines=max(1, min(1000, int(limit))), max_bytes=2 * 1024 * 1024)
        if not rows:
            return []
        pc_by_user = {}
        for user in self._online_users():
            pc_by_user[str(user.get("user", "")).casefold()] = str(user.get("computer", ""))
        result = []
        for row in rows:
            sender = str(row.get("gonderen", "")).strip()
            target_raw = str(row.get("hedef", "GENEL")).strip()
            message_text = str(row.get("metin", ""))
            if not sender or not message_text:
                continue
            target, is_room = self._legacy_target_to_pulse(target_raw)
            when = _parse_time(row.get("zaman"))
            created = when.timestamp() if when else 0.0
            legacy_id = str(row.get("id", "")).strip() or uuid.uuid4().hex[:12]
            result.append({
                "id": legacy_id,
                "created_at": created,
                "sender": sender,
                "computer": pc_by_user.get(sender.casefold(), "ENCTakip"),
                "recipient": target,
                "message": message_text,
                "attachments": [],
                "reactions": [],
                "receipts": [],
                "legacy_enctakip": True,
                "legacy_room": is_room,
            })
        return result

    def publish_legacy_chat_message(self, record: dict[str, Any], original_payload: dict[str, Any]) -> None:
        """Mirror a Pulse text message into the old client's JSONL format.

        The same message id lets Pulse deduplicate the mirrored copy. Old ENCTakip
        messages don't have file-attachment metadata, so only attachment names are
        described in the text while the actual attachments stay in Pulse storage.
        """
        if not isinstance(record, dict):
            return
        sender = str(record.get("sender", self.user)).strip() or self.user
        target = self._pulse_target_to_legacy(record.get("recipient", original_payload.get("recipient", "Tümü")))
        message_text = str(record.get("message", ""))
        attachments = record.get("attachments", []) if isinstance(record.get("attachments", []), list) else []
        names = [str(x.get("original_name", "dosya")) for x in attachments if isinstance(x, dict)]
        if names:
            annex = "Ek dosyalar (Pulse): " + ", ".join(names[:10])
            message_text = (message_text + "\n" + annex).strip()
        if not message_text:
            return
        self._append_jsonl(self.messages_path, {
            # Legacy Mesaj schema is intentionally preserved; old clients treat IDs as opaque.
            "id": str(record.get("id", "") or uuid.uuid4().hex[:12]),
            "zaman": datetime.now().isoformat(timespec="seconds"),
            "gonderen": sender,
            "hedef": target,
            "metin": message_text[:4000],
        })

    def _read_lock(self) -> dict[str, Any] | None:
        """Read ENCTakip's shared kilit.json, accepting old/new field spellings.

        Missing heartbeats never count as a live reservation. Identity fields are
        retained for diagnostics, but freshness is always independently checked.
        """
        try:
            value = json.loads(self.lock_path.read_text(encoding="utf-8-sig"))
            if not isinstance(value, dict):
                return None
            def first(*keys):
                for key in keys:
                    candidate = value.get(key)
                    if candidate not in (None, ""):
                        return candidate
                return None
            username = first("kullanici", "kullanıcı", "user", "username", "owner", "kilit_sahibi", "kullanici_adi")
            computer = first("bilgisayar", "bilgisayar_adi", "computer", "pc", "hostname", "makine")
            opened_raw = first("acilis", "açılış", "opened_at", "baslangic", "başlangıç", "start_time", "acilis_zamani")
            heartbeat_raw = first("son_heartbeat", "heartbeat", "last_heartbeat", "updated_at", "son_sinyal", "heartbeat_at", "last_seen")
            opened = _parse_time(opened_raw)
            heartbeat = _parse_time(heartbeat_raw)
            if not username and not computer and not opened and not heartbeat:
                return None
            now = datetime.now()
            value["kullanici"] = str(username or "").strip()
            value["bilgisayar"] = str(computer or "").strip()
            value["acilis"] = opened.isoformat(timespec="seconds") if opened else ""
            value["son_heartbeat"] = heartbeat.isoformat(timespec="seconds") if heartbeat else ""
            value["_opened_dt"] = opened
            value["_heartbeat_dt"] = heartbeat
            value["_heartbeat_age"] = max(0.0, (now - heartbeat).total_seconds()) if heartbeat else float("inf")
            value["_opened_age"] = max(0.0, (now - opened).total_seconds()) if opened else float("inf")
            value["_unverified"] = heartbeat is None
            return value
        except (OSError, json.JSONDecodeError, TypeError, ValueError):
            return None

    def _write_event(self, event: str, detail: str = "", duration: int = 0) -> None:
        row = {
            "zaman": datetime.now().isoformat(timespec="seconds"),
            "kullanici": self.user,
            "bilgisayar": self.computer,
            "olay": str(event)[:80],
            "detay": str(detail)[:400],
            "sure_sn": max(0, int(duration or 0)),
        }
        self._append_jsonl(self.log_path, row)

    @staticmethod
    def _append_jsonl(path: Path, value: dict[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = (json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
        flags = os.O_CREAT | os.O_APPEND | os.O_WRONLY
        fd = os.open(str(path), flags, 0o600)
        try:
            os.write(fd, payload)
        finally:
            os.close(fd)

    def _active_queue(self) -> list[str]:
        active: dict[str, bool] = {}
        ordered: list[str] = []
        for event in _read_jsonl_tail(self.queue_path, 2000):
            username = str(event.get("kullanici", "")).strip()
            kind = str(event.get("tip", "")).strip()
            if not username:
                continue
            if kind == "katil" and username not in active:
                active[username] = True
                ordered.append(username)
            elif kind in {"ayril", "bildirildi"}:
                active.pop(username, None)
                if username in ordered:
                    ordered.remove(username)
        return ordered

    def _online_users(self) -> list[dict[str, str]]:
        result: list[dict[str, str]] = []
        now = datetime.now()
        try:
            paths = list(self.presence_dir.glob("*.json"))[:1000]
        except OSError:
            return result
        for path in paths:
            try:
                obj = json.loads(path.read_text(encoding="utf-8-sig"))
                seen = _parse_time(obj.get("son_gorulme"))
                username = str(obj.get("kullanici", "")).strip()
                computer = str(obj.get("bilgisayar", "")).strip()
                if username and seen and (now - seen).total_seconds() <= ONLINE_SECONDS:
                    result.append({"user": username, "computer": computer, "last_seen": _fmt_time(seen.isoformat())})
            except (OSError, json.JSONDecodeError, TypeError, ValueError):
                continue
        result.sort(key=lambda x: (x["user"].casefold() != self.user.casefold(), x["user"].casefold()))
        return result

    def _recent_events(self) -> list[dict[str, str]]:
        items = []
        for row in reversed(_read_jsonl_tail(self.log_path, 100, 256 * 1024)):
            when = _fmt_time(row.get("zaman"))
            event = str(row.get("olay", "")).strip()
            user = str(row.get("kullanici", "")).strip()
            detail = str(row.get("detay", "")).strip()
            if event:
                items.append({"time": when, "event": event, "user": user, "detail": detail})
            if len(items) >= 6:
                break
        return items

    @staticmethod
    def _clean_owner(value: Any) -> str:
        text = re.sub(r"[\x00\r\n\t]+", " ", str(value or ""))
        text = re.sub(r"\s+", " ", text).strip(" .;,:|\"'")
        if not 2 <= len(text) <= 80:
            return ""
        if not any(char.isalpha() for char in text):
            return ""
        if not re.fullmatch(r"[A-Za-zĞÜŞİÖÇğüşıöç0-9_.\\\- @]+", text):
            return ""
        if text.casefold() in {"system", "admin", "administrator", "everyone", "guest", "unknown", "bilinmiyor"}:
            return ""
        return text

    def _word_owner_marker(self) -> Path | None:
        """Find Word's ~$ owner marker by exact name, then stem (legacy fallback)."""
        if not self.document.name:
            return None
        folder = self.document.parent
        candidates = [folder / f"~${self.document.name}"]
        # Some Office builds truncate or vary the extension in the owner filename.
        candidates.extend([folder / f"~${self.document.stem}{suffix}" for suffix in ("", self.document.suffix)])
        for marker in candidates:
            try:
                if marker.is_file():
                    return marker
            except OSError:
                continue
        try:
            target_stem = self.document.stem.casefold()
            target_tail = target_stem[-8:]
            for marker in folder.glob("~$*"):
                try:
                    if not marker.is_file():
                        continue
                    marker_name = marker.name[2:] if marker.name.startswith("~$") else marker.name
                    stem = Path(marker_name).stem.casefold()
                    if stem == target_stem or (len(target_tail) == 8 and len(stem) >= 8 and stem.endswith(target_tail)):
                        return marker
                except OSError:
                    continue
        except OSError:
            pass
        return None

    def _word_owner_fallback(self) -> str:
        """Read the username out of Word's temporary ~$ owner file (read-only)."""
        marker = self._word_owner_marker()
        if marker is None:
            return ""
        try:
            data = marker.read_bytes()
        except OSError:
            return ""
        if len(data) < 2:
            return ""
        # This is the same byte layout used by the shipped ENCTakip owner reader:
        # byte 54 is the character count and byte 56 starts UTF-16LE username text.
        if len(data) >= 56:
            count = data[54]
            if 1 <= count <= 80 and len(data) >= 56 + count * 2:
                try:
                    candidate = self._clean_owner(data[56:56 + count * 2].decode("utf-16le", errors="strict"))
                    if candidate:
                        return candidate
                except UnicodeDecodeError:
                    pass
        # Office versions differ slightly; try nearby known offsets without
        # interpreting arbitrary binary as an unchecked display name.
        for offset in (56, 58, 60, 0x100):
            if offset >= len(data) - 4:
                continue
            try:
                raw = data[offset:offset + 240].decode("utf-16le", errors="ignore")
                candidate = self._clean_owner(raw.split("\x00\x00", 1)[0].replace("\x00", " "))
                if candidate:
                    return candidate
            except (UnicodeDecodeError, ValueError):
                continue
        # Older Office / non-UTF-16 fallback.
        try:
            count = data[0]
            if 1 <= count <= 80 and len(data) >= 1 + count:
                for encoding in ("cp1254", "cp1252", "latin-1"):
                    candidate = self._clean_owner(data[1:1 + count].decode(encoding, errors="strict"))
                    if candidate:
                        return candidate
        except (UnicodeDecodeError, IndexError):
            pass
        return ""

    def _network_owner_from_server(self) -> str:
        """Ask the Windows SMB server which account has the document open.

        This mirrors the source ENCTakip uses (NetFileEnum). On NAS or non-Windows
        SMB servers Windows may not expose this API; callers then try openfiles and
        the Word owner marker, so failure here is deliberately non-fatal.
        """
        if os.name != "nt" or not self.document.name:
            return ""
        full = str(self.document)
        match = re.match(r"^\\\\([^\\]+)\\(.+)$", full)
        if not match:
            return ""
        server_name = "\\\\" + match.group(1)
        server_relative = "\\" + match.group(2)
        target_full = full.casefold()
        target_name = self.document.name.casefold()

        class FILE_INFO_3(ctypes.Structure):
            _fields_ = [
                ("fi3_id", ctypes.c_uint32), ("fi3_permissions", ctypes.c_uint32),
                ("fi3_num_locks", ctypes.c_uint32), ("fi3_pathname", ctypes.c_wchar_p),
                ("fi3_username", ctypes.c_wchar_p),
            ]

        try:
            netapi = ctypes.WinDLL("Netapi32.dll")
            enum_files = netapi.NetFileEnum
            enum_files.argtypes = [
                ctypes.c_wchar_p, ctypes.c_wchar_p, ctypes.c_wchar_p, ctypes.c_uint32,
                ctypes.POINTER(ctypes.c_void_p), ctypes.c_uint32,
                ctypes.POINTER(ctypes.c_uint32), ctypes.POINTER(ctypes.c_uint32),
                ctypes.POINTER(ctypes.c_uint32),
            ]
            enum_files.restype = ctypes.c_uint32
            free_buffer = netapi.NetApiBufferFree
            free_buffer.argtypes = [ctypes.c_void_p]
            free_buffer.restype = ctypes.c_uint32
            for basepath in (server_relative, None):
                buffer = ctypes.c_void_p()
                read = ctypes.c_uint32()
                total = ctypes.c_uint32()
                resume = ctypes.c_uint32(0)
                try:
                    code = enum_files(server_name, basepath, None, 3, ctypes.byref(buffer), 0xFFFFFFFF,
                                      ctypes.byref(read), ctypes.byref(total), ctypes.byref(resume))
                    if code not in (0, 234) or not buffer.value:
                        continue
                    rows = ctypes.cast(buffer, ctypes.POINTER(FILE_INFO_3))
                    for index in range(min(int(read.value), 50000)):
                        row = rows[index]
                        path = str(row.fi3_pathname or "").strip()
                        user = self._clean_owner(row.fi3_username or "")
                        if not path or not user:
                            continue
                        folded = path.casefold()
                        if (target_full in folded or folded.endswith(server_relative.casefold())
                                or Path(path).name.casefold() == target_name):
                            return user
                except Exception:
                    continue
                finally:
                    if buffer.value:
                        try:
                            free_buffer(buffer)
                        except Exception:
                            pass
        except Exception:
            return ""
        return ""

    def _openfiles_owner_from_server(self) -> str:
        """Fallback to the Windows openfiles query used by legacy ENCTakip."""
        if os.name != "nt" or not self.document.name:
            return ""
        match = re.match(r"^\\\\([^\\]+)\\", str(self.document))
        if not match:
            return ""
        server = "\\\\" + match.group(1)
        try:
            result = subprocess.run(
                ["openfiles.exe", "/query", "/s", server, "/fo", "csv", "/nh"],
                capture_output=True, text=True, encoding=locale.getpreferredencoding(False) or "utf-8",
                errors="replace", timeout=5,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
            rows = csv.reader(io.StringIO(result.stdout or ""))
            target = self.document.name.casefold()
            for row in rows:
                cells = [str(cell).strip() for cell in row]
                if not cells or not any(target in cell.casefold() for cell in cells):
                    continue
                # openfiles CSV format normally puts the owning account in column 2.
                candidate_indices = [1, 0, 2]
                for index in candidate_indices:
                    if index < len(cells):
                        user = self._clean_owner(cells[index])
                        if user and target not in user.casefold():
                            return user
        except (OSError, subprocess.SubprocessError, ValueError):
            pass
        return ""

    def _resolve_legacy_owner(self) -> tuple[str, str, str]:
        """Resolve (owner, source, computer) with short caching around slow OS calls."""
        now = time.monotonic()
        if now < self._legacy_owner_cache_until:
            return self._legacy_owner_cache
        result = ("", "", "")
        owner = self._network_owner_from_server()
        if owner:
            result = (owner, "Windows ağ paylaşımı", "Ağ sunucusu")
        if not owner:
            owner = self._openfiles_owner_from_server()
            if owner:
                result = (owner, "Windows openfiles", "Ağ paylaşımı")
        if not owner:
            owner = self._word_owner_fallback()
            if owner:
                result = (owner, "Word ~$ kilit dosyası", "Word / ağ paylaşımı")
        self._legacy_owner_cache = result
        self._legacy_owner_cache_until = now + 20.0
        return result

    def status(self) -> dict[str, Any]:
        path_text = str(self.document) if self.document.name else ""
        if not path_text:
            return {"exists": False, "path": "", "status": "AYAR GEREKLİ", "status_code": "unconfigured", "error": "Dilekçe dosya yolu ayarlanmamış.", "online_users": self._online_users(), "queue_users": self._active_queue(), "events": self._recent_events(), "backups": [], "backup_count": 0, "last_backup_error": self._last_backup_error}
        try:
            st = self.document.stat()
            if not self.document.is_file():
                raise FileNotFoundError(path_text)
        except OSError as exc:
            return {"exists": False, "path": path_text, "status": "ERİŞİLEMİYOR", "status_code": "missing", "error": str(exc)[:180], "online_users": self._online_users(), "queue_users": self._active_queue(), "events": self._recent_events(), "backups": self.list_backups(), "backup_count": len(self.list_backups()), "last_backup_error": self._last_backup_error}

        self._observe_document_backup(st)
        backup_rows = self.list_backups()
        lock = self._read_lock()
        physical = self._physical_lock_probe(self.document)
        active_record = bool(lock and lock.get("_heartbeat_age", float("inf")) <= LOCK_STALE_SECONDS)
        lock_is_ours = bool(active_record and lock and str(lock.get("kullanici", "")).casefold() == self.user.casefold() and str(lock.get("bilgisayar", "")).casefold() == self.computer.casefold())
        owner = ""
        computer = ""
        opened_at = ""
        elapsed_seconds = 0
        owner_source = ""
        status_code = "available"
        status = "MÜSAİT"
        description = "Dosya şu anda ENCTakip / Word kilidiyle kullanımda görünmüyor."
        # A fresh ENCTakip lock record is authoritative and is read first so both
        # clients agree on the person and start time without guessing.
        if active_record and lock:
            owner = str(lock.get("kullanici", "") or "").strip()
            computer = str(lock.get("bilgisayar", "") or "").strip()
            opened_at = _fmt_time(lock.get("acilis"))
            elapsed_seconds = int(lock.get("_opened_age", 0)) if lock.get("_opened_age", float("inf")) != float("inf") else 0
            owner_source = "ENCTakip kilit.json"
            if lock_is_ours:
                status_code, status = "ours", "SİZDE AÇIK"
                description = "ENCTakip ortak kilit kaydı bu kullanıcı/bilgisayar oturumuna ait. Word'u kapattıktan sonra ‘Kapattım · kilidi bırak’ ile serbest bırak."
            else:
                status_code, status = "busy", "KULLANIMDA"
                description = f"{owner or 'Kullanıcı adı kayıtlı değil'} · {computer or 'Bilgisayar adı kayıtlı değil'} tarafından kullanımda (ENCTakip ortak kilit kaydı)."
        elif physical is False:
            status_code, status = "available", "MÜSAİT"
            if lock:
                description = "Dosya müsait. Eski kilit kaydı güncel heartbeat taşımıyor; eski kayıt etkin kilit olarak kullanılmadı."
        else:
            # The original ENCTakip implementation checks the SMB server first,
            # then openfiles.exe, then decodes Word's ~$ marker. The previous Pulse
            # code only inspected one exact marker name; that failed for valid Office
            # variants and caused 'Kullanıcı belirlenemedi' while ENCTakip showed Sibel.
            resolved_owner, resolved_source, resolved_computer = self._resolve_legacy_owner()
            owner = resolved_owner
            owner_source = resolved_source
            computer = resolved_computer
            if physical is True or (resolved_owner and resolved_source in {"Windows ağ paylaşımı", "Windows openfiles"}):
                status_code, status = "busy_unknown", "KULLANIMDA"
                description = (f"Word / ağ kilidi gözlendi; kullanıcı: {owner} ({owner_source}). ENCTakip açılış zamanı kaydı bulunamadı." if owner
                               else "Word / Windows dosya kilidi gözlendi; kullanıcı adı işletim sistemi veya Word kaydından okunamadı.")
            else:
                status_code, status = "unknown", "DURUM DOĞRULANAMADI"
                description = (f"Kullanıcı {owner} olarak görüldü ({owner_source}); fiziksel dosya kilidi kesin doğrulanamadı." if owner
                               else "Windows dosya paylaşım kilidi doğrulanamadı; müsait olduğu varsayılmadı.")

        queue_users = self._active_queue()
        queue_position = next((i + 1 for i, name in enumerate(queue_users) if name.casefold() == self.user.casefold()), 0)
        last_modified_by = self._read_docx_last_modified_by(st)
        return {
            "exists": True, "path": path_text, "modified": st.st_mtime, "size": st.st_size,
            "last_modified_by": last_modified_by,
            "owner_source": owner_source,
            "word_lock_marker": self._word_owner_marker() is not None,
            "status": status, "status_code": status_code, "status_detail": description,
            "owner": owner, "computer": computer, "opened_at": opened_at,
            "elapsed_seconds": elapsed_seconds, "elapsed_text": _duration(elapsed_seconds),
            "owned_by_me": lock_is_ours, "queued": queue_position > 0,
            "queue_users": queue_users, "queue_count": len(queue_users),
            "queue_position": queue_position, "online_users": self._online_users(),
            "events": self._recent_events(), "error": "",
            "idle_seconds": self.idle_seconds() if lock_is_ours else None,
            "backups": backup_rows, "backup_count": len(backup_rows),
            "last_backup_error": self._last_backup_error,
        }

    def _clean_stale_lock(self) -> None:
        lock = self._read_lock()
        if not lock or lock.get("_heartbeat_age", 0) <= LOCK_STALE_SECONDS:
            return
        physical = self._physical_lock_probe(self.document)
        if physical is not False:
            return
        # Re-read before unlinking: a live ENCTakip client may have heartbeated meanwhile.
        latest = self._read_lock()
        if latest and latest.get("_heartbeat_age", 0) > LOCK_STALE_SECONDS:
            try:
                self.lock_path.unlink()
            except OSError:
                pass

    def open_document(self) -> tuple[bool, str]:
        if not self.document.name or not self.document.is_file():
            return False, "Ortak dilekçe dosyası bulunamadı. Ayarlardaki dosya yolunu kontrol et."
        physical = self._physical_lock_probe(self.document)
        if physical is None:
            return False, "Word dosyasının Windows paylaşım kilidi doğrulanamadı; güvenlik için açma işlemi yapılmadı."
        if physical:
            p = self.status()
            owner = p.get("owner") or "kullanıcısı doğrulanamayan başka bir işlem"
            return False, f"Dilekçe dosyası kullanımda: {owner}. Dosya kapanınca tekrar dene veya sıraya gir."
        self._clean_stale_lock()
        opened = datetime.now().isoformat(timespec="microseconds")
        record = {"kullanici": self.user, "bilgisayar": self.computer, "acilis": opened, "son_heartbeat": opened}
        try:
            self.system_dir.mkdir(parents=True, exist_ok=True)
            fd = os.open(str(self.lock_path), os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            with os.fdopen(fd, "w", encoding="utf-8") as fp:
                json.dump(record, fp, ensure_ascii=False)
                fp.flush()
                os.fsync(fp.fileno())
        except FileExistsError:
            current = self._read_lock()
            label = str(current.get("kullanici", "başka kullanıcı")) if current else "başka bir kullanıcı"
            pc = str(current.get("bilgisayar", "")) if current else ""
            return False, f"Dilekçe kilidi başka bir oturum tarafından alınmış ({label}{' · ' + pc if pc else ''})."
        except OSError as exc:
            return False, f"Ortak ENCTakip kilidi alınamadı: {exc}"
        physical_after = self._physical_lock_probe(self.document)
        if physical_after is not False:
            self._remove_own_lock(opened)
            if physical_after is True:
                return False, "Kilidi alırken dosyanın başka bir Word oturumu tarafından açıldığı anlaşıldı."
            return False, "Kilidi aldıktan sonra dosya durumu doğrulanamadı; kilit geri bırakıldı."
        try:
            self._opener(self.document)
        except Exception as exc:
            self._remove_own_lock(opened)
            return False, f"Kilit alındı ancak Word açılamadı: {exc}"
        self._owned_opened_at = opened
        self._last_heartbeat_mono = time.monotonic()
        self._publish_presence(force=True)
        self._write_event("ACILDI", "Pulse üzerinden ortak dilekçe dosyası açıldı")
        return True, "Dilekçe dosyası kilit alınarak açıldı. İşin bitince ‘Kapattım’ düğmesine bas."

    def _remove_own_lock(self, opened_at: str = "") -> bool:
        lock = self._read_lock()
        if not lock:
            return False
        if str(lock.get("kullanici", "")).casefold() != self.user.casefold() or str(lock.get("bilgisayar", "")).casefold() != self.computer.casefold():
            return False
        if opened_at and str(lock.get("acilis", "")) != opened_at:
            return False
        try:
            self.lock_path.unlink()
            return True
        except OSError:
            return False

    def heartbeat(self) -> None:
        # Publish Pulse's presence to ENCTakip even when no Word file is open.
        self._publish_presence()
        # If Pulse restarts while this same Windows user/computer still owns a
        # fresh ENCTakip-compatible lock, resume its heartbeat instead of allowing
        # the lease to expire merely because the UI process was restarted.
        if not self._owned_opened_at:
            existing = self._read_lock()
            if (
                existing
                and existing.get("_heartbeat_age", LOCK_STALE_SECONDS + 1) <= LOCK_STALE_SECONDS
                and str(existing.get("kullanici", "")).casefold() == self.user.casefold()
                and str(existing.get("bilgisayar", "")).casefold() == self.computer.casefold()
            ):
                self._owned_opened_at = str(existing.get("acilis", ""))
                self._last_heartbeat_mono = time.monotonic() - HEARTBEAT_SECONDS
        if not self._owned_opened_at or time.monotonic() - self._last_heartbeat_mono < HEARTBEAT_SECONDS:
            return
        lock = self._read_lock()
        if not lock or str(lock.get("kullanici", "")).casefold() != self.user.casefold() or str(lock.get("bilgisayar", "")).casefold() != self.computer.casefold() or str(lock.get("acilis", "")) != self._owned_opened_at:
            self._owned_opened_at = ""
            return
        lock.pop("_opened_dt", None); lock.pop("_heartbeat_dt", None); lock.pop("_heartbeat_age", None); lock.pop("_opened_age", None)
        lock["son_heartbeat"] = datetime.now().isoformat(timespec="seconds")
        temp = self.lock_path.with_name(self.lock_path.name + f".{uuid.uuid4().hex[:8]}.tmp")
        try:
            temp.write_text(json.dumps(lock, ensure_ascii=False), encoding="utf-8")
            os.replace(temp, self.lock_path)
            self._last_heartbeat_mono = time.monotonic()
        except OSError:
            try: temp.unlink(missing_ok=True)
            except OSError: pass

    def close_document(self) -> tuple[bool, str]:
        lock = self._read_lock()
        if not lock:
            self._owned_opened_at = ""
            return False, "Bu oturuma ait aktif kilit bulunamadı."
        if str(lock.get("kullanici", "")).casefold() != self.user.casefold() or str(lock.get("bilgisayar", "")).casefold() != self.computer.casefold():
            return False, f"Kilit {lock.get('kullanici', 'başka kullanıcı')} · {lock.get('bilgisayar', 'başka bilgisayar')} oturumuna ait; kaldırılamaz."
        physical = self._physical_lock_probe(self.document)
        if physical is True:
            return False, "Word dosyası hâlâ açık görünüyor. Önce Word belgesini kapat, sonra tekrar ‘Kapattım’ de."
        if physical is None:
            return False, "Word dosyasının kapanışı doğrulanamadı; kilit güvenlik için tutuldu."
        opened = str(lock.get("acilis", ""))
        opened_dt = _parse_time(opened)
        elapsed = int((datetime.now() - opened_dt).total_seconds()) if opened_dt else 0
        if not self._remove_own_lock(opened):
            return False, "Kilit kaydı değişmiş; başka oturumun kilidi silinmedi."
        self._owned_opened_at = ""
        self._write_event("KAPATILDI", f"{_duration(elapsed)} açık kaldı", elapsed)
        self._notify_next_in_queue()
        return True, f"Kilit bırakıldı. Açık kalma süresi: {_duration(elapsed)}."

    def join_queue(self) -> tuple[bool, str]:
        status = self.status()
        if status.get("status_code") == "available":
            return False, "Dosya şu anda müsait; sıraya girmeden açabilirsin."
        queue = self._active_queue()
        if any(x.casefold() == self.user.casefold() for x in queue):
            pos = next(i + 1 for i, x in enumerate(queue) if x.casefold() == self.user.casefold())
            return True, f"Zaten sıradasın. Sıra numaran: {pos}."
        try:
            self._append_jsonl(self.queue_path, {"tip": "katil", "kullanici": self.user, "zaman": datetime.now().isoformat(timespec="seconds")})
            self._write_event("SIRAYA_GIRDI", "Dilekçe dosyası için bekleme sırasına katıldı")
            return True, f"Sıraya eklendin. Sıra numaran: {len(queue) + 1}."
        except OSError as exc:
            return False, f"Bekleme sırasına eklenemedi: {exc}"

    def leave_queue(self) -> tuple[bool, str]:
        if not any(x.casefold() == self.user.casefold() for x in self._active_queue()):
            return True, "Aktif bekleme sıran yok."
        try:
            self._append_jsonl(self.queue_path, {"tip": "ayril", "kullanici": self.user, "zaman": datetime.now().isoformat(timespec="seconds")})
            self._write_event("SIRADAN_CIKTI", "Dilekçe bekleme sırasından ayrıldı")
            return True, "Bekleme sırasından çıkarıldın."
        except OSError as exc:
            return False, f"Bekleme sırasından çıkılamadı: {exc}"

    def _notify_next_in_queue(self) -> None:
        queue = self._active_queue()
        if not queue:
            return
        first = queue[0]
        try:
            self._append_jsonl(self.queue_path, {"tip": "bildirildi", "kullanici": first, "zaman": datetime.now().isoformat(timespec="seconds")})
            # Use ENCTakip's actual legacy message schema so old clients can show the notice.
            self._append_jsonl(self.messages_path, {"id": uuid.uuid4().hex[:12], "zaman": datetime.now().isoformat(timespec="seconds"), "gonderen": "SİSTEM", "hedef": first, "metin": "🔔 Dosya kapandı, sıra sizde — şimdi açabilirsiniz."})
            self._write_event("SIRA_BILDIRILDI", f"Sıradaki kullanıcıya haber verildi: {first}")
        except OSError:
            pass
