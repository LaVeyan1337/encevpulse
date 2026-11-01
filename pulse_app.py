from __future__ import annotations

import json
import os
import re
import queue
import socket
import subprocess
import shutil
import sys
import threading
import time
import traceback
import webbrowser
import zipfile
import uuid
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path
from typing import Any

try:
    from PySide6.QtCore import Qt, QTimer, QObject, Signal, Slot, QUrl, QSize, QDate, QRunnable, QThreadPool
    from PySide6.QtGui import QColor, QDesktopServices, QFont, QPixmap, QIcon, QTextCharFormat
    from PySide6.QtWidgets import (
        QApplication, QMainWindow, QWidget, QFrame, QLabel, QPushButton, QProgressBar, QPlainTextEdit, QDateEdit, QDateTimeEdit, QDoubleSpinBox, QAbstractScrollArea, QTabWidget, QToolButton,
        QVBoxLayout, QHBoxLayout, QGridLayout, QStackedWidget, QTableWidget,
        QTableWidgetItem, QHeaderView, QLineEdit, QTextEdit, QComboBox,
        QSpinBox, QMessageBox, QFileDialog, QDialog, QDialogButtonBox, QFormLayout, QGroupBox,
        QSplitter, QListWidget, QListWidgetItem, QAbstractItemView, QSizePolicy, QScrollArea, QCalendarWidget,
        QSystemTrayIcon, QMenu, QStyle, QCheckBox, QGraphicsDropShadowEffect
    )
except ImportError:
    print("PySide6 bulunamadı. Önce INSTALL.bat dosyasını çalıştırın.")
    input("Çıkmak için Enter...")
    raise

try:
    from PySide6.QtWebEngineWidgets import QWebEngineView
    from PySide6.QtWebChannel import QWebChannel
    from PySide6.QtWebEngineCore import QWebEngineSettings
    STITCH_WEBENGINE_AVAILABLE = True
except ImportError:
    QWebEngineView = None
    QWebChannel = None
    QWebEngineSettings = None
    STITCH_WEBENGINE_AVAILABLE = False

try:
    from PySide6.QtPdf import QPdfDocument
    from PySide6.QtPdfWidgets import QPdfView
except ImportError:
    QPdfDocument = None
    QPdfView = None

from pulse_core import (
    APP_NAME, CONFIG_PATH, DEFAULT_SHARED_ROOT, load_config, save_config,
    SharedStore, classify_reports, petition_status, observed_account_on_other_computer, unique_account_status_rows,
)
from pulse_collector import LocalCollectorServer
from pulse_workspace import WorkspaceStore, PrivateNotesStore, TASK_STATUSES, TASK_PRIORITIES
from pulse_petition import PulsePetitionService
from pulse_workspace_ui import WorkspaceUiMixin, InstitutionOpinionsDialog, circular_avatar_pixmap, avatar_initials
from pulse_dates import format_date_tr
from update_service import CURRENT_VERSION, find_update, copy_verified_package, validate_package
from pulse_notification_policy import NotificationLimiter
from pulse_theme import build_stylesheet, normalize_theme, theme_color
from pulse_calendar import collect_calendar_events, iso_date
from pulse_documents import scan_directory

APP_DIR = Path(sys.executable).resolve().parent if getattr(sys, "frozen", False) else Path(__file__).resolve().parent

STYLE = build_stylesheet("dark")


# PULSE unified visual foundation: glass surfaces with solid, high-contrast controls.
STYLE = STYLE



# PULSE premium glass system: one token system for every page and dialog.
STYLE = STYLE



def fmt_time(stamp: Any) -> str:
    try:
        return datetime.fromtimestamp(float(stamp)).strftime("%d.%m.%Y %H:%M:%S")
    except Exception:
        return "—"


def fmt_age(stamp: Any) -> str:
    try:
        sec = max(0, int(time.time() - float(stamp)))
        if sec < 60:
            return f"{sec} sn"
        if sec < 3600:
            return f"{sec // 60} dk"
        return f"{sec // 3600} sa"
    except Exception:
        return "—"


class UiBridge(QObject):
    snapshot_ready = Signal(object)
    collector_status = Signal(str)
    new_event = Signal(str, str)
    task_result = Signal(str, bool, str)
    petition_history_ready = Signal(object)
    petition_backups_ready = Signal(object)
    update_check_result = Signal(object)


class ChatMessagesList(QListWidget):
    """Chat timeline that reports viewport changes so message bubbles can reflow cleanly."""
    viewportResized = Signal()

    def resizeEvent(self, event):
        super().resizeEvent(event)
        self.viewportResized.emit()


class ChatComposer(QTextEdit):
    """Compact multi-line chat editor: Enter sends, Shift+Enter adds a line."""
    sendRequested = Signal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName("chatComposerInput")
        self.setAcceptRichText(False)
        self.setTabChangesFocus(False)
        self.setMinimumHeight(42)
        self.setMaximumHeight(108)
        self.setFixedHeight(42)
        self.setPlaceholderText("Mesaj yaz…")
        self.textChanged.connect(self._fit_to_content)

    def keyPressEvent(self, event):
        if event.key() in (Qt.Key_Return, Qt.Key_Enter):
            if event.modifiers() & Qt.ShiftModifier:
                super().keyPressEvent(event)
            else:
                self.sendRequested.emit()
                event.accept()
            return
        super().keyPressEvent(event)

    def insert(self, text: str):
        self.insertPlainText(str(text))

    def _fit_to_content(self):
        try:
            height = int(self.document().documentLayout().documentSize().height()) + 20
        except Exception:
            height = 42
        self.setFixedHeight(max(42, min(108, height)))


class MonitorWorker(threading.Thread):
    """All SMB/file I/O happens here; report pushes do not trigger full repeated scans."""
    def __init__(self, config_getter, incoming: queue.Queue, bridge: UiBridge, wake_event: threading.Event):
        super().__init__(name="PulseNetworkMonitor", daemon=True)
        self.config_getter = config_getter
        self.incoming = incoming
        self.bridge = bridge
        self.stop_event = threading.Event()
        self.wake_event = wake_event
        self.force_scan_event = threading.Event()
        self.last_good: dict[str, Any] = {"reports": [], "agents": [], "messages": [], "scan_time": time.time()}
        self._seen_messages: set[str] = set()
        self._known_conflicts: set[str] = set()
        self._known_sessions: set[str] = set()
        self._last_network_error = ""
        self._messages_bootstrapped = False
        self._receipt_cache: set[str] = set()
        self._workspace_snapshot_cache: dict[str, Any] | None = None
        self._workspace_next_scan = 0.0
        self._workspace_store = None
        self._workspace_store_root = ""
        self._petition_service: PulsePetitionService | None = None
        self._petition_service_key: tuple[str, str, str, str, str] | None = None
        self._petition_idle_session_key = ""
        self._petition_idle_last_notice_mono = 0.0

    def stop(self):
        self.stop_event.set()
        self.wake_event.set()

    def force_scan(self):
        self.force_scan_event.set()
        self.wake_event.set()

    def queue_message(self, message: dict[str, Any]) -> bool:
        """Return False when back-pressure prevents enqueueing; caller should retain draft/attachments."""
        try:
            self.incoming.put_nowait(("message", message))
            self.wake_event.set()
            return True
        except queue.Full:
            self.bridge.task_result.emit("Mesaj", False, "Gönderim kuyruğu dolu; mesaj ve ekler taslakta bırakıldı. Biraz sonra yeniden dene.")
            return False

    def queue_reaction(self, payload: dict[str, Any]):
        try:
            self.incoming.put_nowait(("reaction", payload))
            self.wake_event.set()
        except queue.Full:
            self.bridge.task_result.emit("Mesaj", False, "İşlem kuyruğu dolu; tekrar dene.")

    def queue_message_receipt(self, payload: dict[str, Any]):
        try:
            self.incoming.put_nowait(("message_receipt", payload))
            self.wake_event.set()
        except queue.Full:
            pass

    def queue_forget_account(self, account: str):
        try:
            self.incoming.put_nowait(("forget_account", {"account": str(account or "").strip()}))
            self.wake_event.set()
        except queue.Full:
            self.bridge.task_result.emit("Hesap", False, "İşlem kuyruğu dolu; tekrar dene.")

    def queue_claim(self, action: str, account: str):
        payload = {"account": str(account or "").strip(), "computer": str(self.config_getter().get("computer_name", "")), "windows_user": str(self.config_getter().get("windows_user", ""))}
        try:
            self.incoming.put_nowait((action, payload))
            self.wake_event.set()
        except queue.Full:
            self.bridge.task_result.emit("Rezervasyon", False, "İşlem kuyruğu dolu; rezervasyon yapılamadı.")

    def queue_petition_action(self, action: str):
        allowed = {"open", "close", "queue_join", "queue_leave", "history", "backups"}
        if action not in allowed:
            self.bridge.task_result.emit("Dilekçeler", False, "Bilinmeyen dilekçe işlemi.")
            return
        try:
            self.incoming.put_nowait(("petition_" + action, {}))
            self.wake_event.set()
        except queue.Full:
            self.bridge.task_result.emit("Dilekçeler", False, "İşlem kuyruğu dolu; tekrar dene.")

    def _get_petition_service(self, cfg: dict[str, Any]) -> PulsePetitionService:
        key = (
            str(cfg.get("petition_file", "") or "").strip(),
            str(cfg.get("shared_root", "") or "").strip(),
            str(cfg.get("windows_user", "") or "bilinmiyor").strip(),
            str(cfg.get("computer_name", "") or socket.gethostname()).strip(),
            str(cfg.get("petition_system_dir", "") or "").strip(),
        )
        if self._petition_service is None or key != self._petition_service_key:
            self._petition_service = PulsePetitionService(
                document_path=key[0], shared_root=key[1], windows_user=key[2], computer_name=key[3],
                system_dir=key[4],
            )
            self._petition_service_key = key
        return self._petition_service

    def queue_workspace(self, action: str, payload: dict[str, Any]):
        cfg = self.config_getter()
        enriched = dict(payload)
        enriched["actor"] = str(cfg.get("windows_user", ""))
        enriched["admin_users"] = list(cfg.get("admin_users", ["burak"]))
        try:
            self.incoming.put_nowait((action, enriched))
            self.wake_event.set()
        except queue.Full:
            self.bridge.task_result.emit("Çalışma alanı", False, "İşlem kuyruğu dolu; tekrar dene.")

    def run(self):
        next_scan = 0.0
        while not self.stop_event.is_set():
            cfg = self.config_getter()
            interval = max(10, min(120, int(cfg.get("scan_interval_sec", 15))))
            root = str(cfg.get("shared_root", "")).strip()
            store = SharedStore(root)
            petition_service = self._get_petition_service(cfg)
            petition_service.heartbeat()
            force_refresh = False
            workspace_dirty = False
            # Small batches keep local collector work bounded; a backlog drains across turns.
            for _ in range(100):
                try:
                    kind, payload = self.incoming.get_nowait()
                except queue.Empty:
                    break
                try:
                    if kind == "report":
                        store.save_report(payload)
                    elif kind == "message":
                        record = store.send_message(payload.get("sender", ""), payload.get("computer", ""), payload.get("message", ""), payload.get("recipient", "Tümü"), payload.get("attachments", []))
                        legacy_note = ""
                        try:
                            # Write the same opaque message id into ENCTakip's original
                            # JSONL schema so old and new clients see one shared message.
                            petition_service.publish_legacy_chat_message(record, payload)
                        except Exception as legacy_exc:
                            legacy_note = f" (eski ENCTakip sohbetine aktarılamadı: {str(legacy_exc)[:100]})"
                            self.bridge.new_event.emit("ENCTakip sohbet eşitlemesi", legacy_note.strip(" ()"))
                        force_refresh = True
                        self.bridge.task_result.emit("Mesaj", True, "Mesaj ve ekleri ortak alana kaydedildi." + legacy_note)
                    elif kind == "reaction":
                        store.react_to_message(payload.get("message_id", ""), payload.get("username", ""), payload.get("emoji", ""))
                        force_refresh = True
                    elif kind == "message_receipt":
                        rec = store.update_message_receipt(payload.get("message_id", ""), payload.get("username", ""), payload.get("status", "delivered"))
                        receipt_key = f"{rec.get('message_id')}|{str(rec.get('username', '')).casefold()}|{payload.get('status', 'delivered')}"
                        if receipt_key not in self._receipt_cache:
                            self._receipt_cache.add(receipt_key)
                        force_refresh = True
                    elif kind == "forget_account":
                        removed = store.forget_account(payload.get("account", ""))
                        force_refresh = True
                        self.bridge.task_result.emit("Hesap", True, "Hesap geçmiş listeden kaldırıldı." if removed else "Kayıtlı geçmiş hesap bulunamadı; izin listesi yine de güncellendi.")
                    elif kind == "claim":
                        ok, detail, _claim = store.claim_account(payload.get("account", ""), payload.get("computer", ""), payload.get("windows_user", ""), int(cfg.get("claim_stale_after_sec", 180)))
                        force_refresh = True
                        self.bridge.task_result.emit("Rezervasyon", ok, detail)
                    elif kind == "release":
                        ok, detail = store.release_account(payload.get("account", ""), payload.get("computer", ""), payload.get("windows_user", ""))
                        force_refresh = True
                        self.bridge.task_result.emit("Rezervasyon", ok, detail)
                    elif kind == "project_create":
                        ws = WorkspaceStore(root)
                        project = ws.create_project(payload.get("project", {}), payload.get("actor", ""), payload.get("admin_users", ["burak"]))
                        force_refresh = True
                        workspace_dirty = True
                        self.bridge.task_result.emit("Proje", True, f"{project.get('name')} · {project.get('code')} oluşturuldu.")
                    elif kind == "project_update":
                        ws = WorkspaceStore(root)
                        project = ws.update_project(payload.get("id", ""), payload.get("changes", {}), payload.get("actor", ""), payload.get("admin_users", ["burak"]), payload.get("expected_revision"))
                        force_refresh = True
                        workspace_dirty = True
                        self.bridge.task_result.emit("Proje", True, f"{project.get('code')} değişiklikleri kaydedildi.")
                    elif kind == "project_delete":
                        ws = WorkspaceStore(root)
                        deleted = ws.delete_project(payload.get("id", ""), payload.get("actor", ""), payload.get("admin_users", ["burak"]), payload.get("expected_revision"))
                        force_refresh = True
                        workspace_dirty = True
                        extra = " Bazı eski rehber bağlantıları için kontrol gerekebilir." if deleted.get("contact_cleanup_warning") else ""
                        self.bridge.task_result.emit("Proje", True, f"{deleted.get('code') or deleted.get('name') or 'Proje'} kaldırıldı; geri dönüş yedeği korundu.{extra}")
                    elif kind == "contact_hide":
                        ws = WorkspaceStore(root)
                        hidden = ws.hide_contact(payload.get("id", ""), payload.get("actor", ""), payload.get("admin_users", ["burak"]))
                        force_refresh = True
                        workspace_dirty = True
                        self.bridge.task_result.emit("Kurum Rehberi", True, "Uzman ortak kurum rehberinden kaldırıldı. Proje görüşleri ve kaynak notları korundu.")
                    elif kind == "profile_save":
                        ws = WorkspaceStore(root)
                        profile = ws.save_profile(payload.get("profile", {}), payload.get("actor", ""), payload.get("admin_users", ["burak"]))
                        force_refresh = True
                        workspace_dirty = True
                        self.bridge.task_result.emit("Profil", True, f"{profile.get('display_name')} profili kaydedildi.")
                    elif kind == "petition_history":
                        # Read the shared ENCTakip audit log on the monitor thread,
                        # never on the Qt GUI thread. Keep the modal view responsive.
                        self.bridge.petition_history_ready.emit(self._get_petition_service(cfg).access_history(limit=5000))
                    elif kind == "petition_backups":
                        self.bridge.petition_backups_ready.emit(self._get_petition_service(cfg).list_backups(limit=30))
                    elif kind in {"petition_open", "petition_close", "petition_queue_join", "petition_queue_leave"}:
                        service = self._get_petition_service(cfg)
                        if kind == "petition_open":
                            ok, detail = service.open_document()
                        elif kind == "petition_close":
                            ok, detail = service.close_document()
                        elif kind == "petition_queue_join":
                            ok, detail = service.join_queue()
                        else:
                            ok, detail = service.leave_queue()
                        force_refresh = True
                        self.bridge.task_result.emit("Dilekçeler", ok, detail)
                except Exception as exc:
                    result_title = "Dilekçeler" if kind.startswith("petition_") else ("Kurum Rehberi" if kind == "contact_hide" else ("Proje" if kind.startswith("project_") else ("Profil" if kind == "profile_save" else ("Rezervasyon" if kind in {"claim", "release"} else "Ağ işlemi"))))
                    self.bridge.task_result.emit(result_title, False, str(exc)[:200])
            now_mono = time.monotonic()
            forced = self.force_scan_event.is_set()
            if forced:
                self.force_scan_event.clear()
            due = now_mono >= next_scan
            # Browser pings are file writes only; they do not start a full directory scan.
            if due or forced or force_refresh:
                try:
                    store.save_agent(str(cfg.get("computer_name") or socket.gethostname()), str(cfg.get("windows_user") or "bilinmiyor"), int(cfg.get("collector_port", 8765)))
                    store.heartbeat_claims(str(cfg.get("computer_name") or socket.gethostname()), str(cfg.get("windows_user") or "bilinmiyor"))
                    snapshot = store.snapshot()
                    # Workspace files are much heavier than e-ÇED heartbeats. Reuse the
                    # store so its contact-backfill cache survives scans, and refresh shared
                    # project/profile/contact data every 30 seconds (or immediately after a
                    # project/profile write). SMB reads and backfill remain off the GUI thread.
                    workspace_due = (
                        self._workspace_snapshot_cache is None
                        or root != self._workspace_store_root
                        or time.monotonic() >= self._workspace_next_scan
                        or workspace_dirty
                    )
                    if workspace_due:
                        try:
                            if self._workspace_store is None or root != self._workspace_store_root:
                                self._workspace_store = WorkspaceStore(root)
                                self._workspace_store_root = root
                                self._workspace_snapshot_cache = None
                            workspace_store = self._workspace_store
                            workspace_store.ensure_profile(
                                str(cfg.get("windows_user", "bilinmiyor")),
                                str(cfg.get("windows_user", "bilinmiyor")),
                                cfg.get("admin_users", ["burak"]),
                            )
                            fresh_workspace = workspace_store.snapshot()
                            fresh_workspace.setdefault("workspace_ok", True)
                            self._workspace_snapshot_cache = fresh_workspace
                            self._workspace_next_scan = time.monotonic() + max(
                                15, min(120, int(cfg.get("workspace_scan_interval_sec", 30)))
                            )
                        except Exception as workspace_exc:
                            # Keep the last good workspace view during a temporary share outage.
                            if self._workspace_snapshot_cache is None:
                                self._workspace_snapshot_cache = {
                                    "workspace_ok": False,
                                    "workspace_error": str(workspace_exc)[:180],
                                    "projects": [], "profiles": [], "contacts": [], "workspace_events": [],
                                }
                            self._workspace_next_scan = time.monotonic() + 15
                    snapshot["workspace"] = self._workspace_snapshot_cache or {
                        "workspace_ok": False, "projects": [], "profiles": [], "contacts": [], "workspace_events": []
                    }
                    petition_service = self._get_petition_service(cfg)
                    petition_status = petition_service.status()
                    snapshot["petition"] = petition_status
                    snapshot["messages"] = self._merge_legacy_chat_messages(snapshot.get("messages", []), petition_service)
                    self._check_petition_idle(petition_status)
                    snapshot["network_ok"] = True
                    snapshot["network_error"] = ""
                    snapshot["collected_at"] = time.time()
                    self.last_good = snapshot
                    self._last_network_error = ""
                    self.bridge.snapshot_ready.emit(snapshot)
                    self._notice(snapshot, cfg)
                except Exception as exc:
                    self._last_network_error = str(exc)[:220]
                    stale = dict(self.last_good)
                    stale["network_ok"] = False
                    stale["network_error"] = self._last_network_error
                    try:
                        petition_service = self._get_petition_service(cfg)
                        stale["petition"] = petition_service.status()
                        stale["messages"] = self._merge_legacy_chat_messages(stale.get("messages", []), petition_service)
                    except Exception:
                        stale["petition"] = petition_status(str(cfg.get("petition_file", "")))
                    stale["collected_at"] = time.time()
                    self.bridge.snapshot_ready.emit(stale)
                next_scan = time.monotonic() + interval
            timeout = max(0.25, next_scan - time.monotonic()) if next_scan else 0.25
            self.wake_event.wait(timeout)
            self.wake_event.clear()

    @staticmethod
    def _merge_legacy_chat_messages(native_messages, petition_service: PulsePetitionService) -> list[dict[str, Any]]:
        """Merge old ENCTakip JSONL messages into Pulse chat by stable message ID."""
        native = [dict(m) for m in native_messages if isinstance(m, dict)] if isinstance(native_messages, list) else []
        room_names = {"enctakip · e-çed", "enctakip · dilekçeler"}
        for message in native:
            recipient = str(message.get("recipient", "")).strip().casefold()
            if recipient in room_names:
                message["legacy_room"] = True
        known = {str(m.get("id", "")) for m in native if str(m.get("id", ""))}
        try:
            for legacy in petition_service.legacy_chat_messages(limit=300):
                mid = str(legacy.get("id", ""))
                if mid and mid in known:
                    continue  # a Pulse message already mirrored to ENCTakip
                if mid:
                    known.add(mid)
                native.append(legacy)
        except Exception:
            # The old program may be offline or its legacy message file unavailable;
            # keep Pulse's own chat available.
            pass
        native.sort(key=lambda m: float(m.get("created_at", 0) or 0), reverse=True)
        return native[:200]

    def _check_petition_idle(self, status: dict[str, Any]) -> None:
        """Mirror ENCTakip's Word-marker inactivity warning without blocking Qt."""
        if not isinstance(status, dict) or status.get("status_code") != "ours":
            self._petition_idle_session_key = ""
            self._petition_idle_last_notice_mono = 0.0
            return
        try:
            idle = status.get("idle_seconds")
            idle_seconds = int(idle) if idle is not None else -1
        except (TypeError, ValueError, OverflowError):
            idle_seconds = -1
        if idle_seconds < 180:
            return
        opened = str(status.get("opened_at", ""))
        session_key = "|".join((str(status.get("owner", "")), str(status.get("computer", "")), opened))
        now = time.monotonic()
        if session_key != self._petition_idle_session_key:
            self._petition_idle_session_key = session_key
            self._petition_idle_last_notice_mono = 0.0
        if now - self._petition_idle_last_notice_mono < 15 * 60:
            return
        self._petition_idle_last_notice_mono = now
        self.bridge.new_event.emit(
            "Dilekçe dosyasında hareketsizlik",
            f"Word dosyasının sahiplik işaretçisi en az {idle_seconds // 60} dakikadır değişmemiş. Bu, ENCTakip'in kullandığı hareketsizlik tahminidir; Word içindeki her tuş vuruşunu ölçmez. Çalışıyorsan devam et; işin bittiyse Word'ü kapatıp Pulse'ta ‘Kapattım · kilidi bırak’ düğmesini kullan."
        )

    def _notice(self, snapshot, cfg):
        now = time.time()
        allowed = [str(x) for x in cfg.get("allowed_accounts", [])]
        summary = classify_reports(snapshot.get("reports", []), snapshot.get("agents", []), int(cfg.get("stale_after_sec", 60)), allowed, now)
        active_conflicts = set()
        for conflict in summary["conflicts"]:
            key = str(conflict["account"]).casefold() + "|" + "|".join(sorted(conflict["computers"]))
            active_conflicts.add(key)
            if key not in self._known_conflicts:
                self.bridge.new_event.emit("Hesap çakışması", f"{conflict['account']} birden fazla bilgisayarda gözlendi: {', '.join(conflict['computers'])}")
        self._known_conflicts = active_conflicts
        current_sessions = set()
        for report in summary["reports"]:
            account = str(report.get("account_name", "")).strip()
            computer = str(report.get("computer", "")).strip()
            if report.get("fresh") and account and computer:
                key = computer.casefold() + "|" + account.casefold()
                current_sessions.add(key)
                if key not in self._known_sessions:
                    self.bridge.new_event.emit("e-ÇED oturumu", f"{account} · {computer} · {report.get('active_ui_tab') or report.get('tab_title') or 'Portal açık'}")
        self._known_sessions = current_sessions
        message_rows = snapshot.get("messages", [])[:200]
        if not self._messages_bootstrapped:
            self._seen_messages.update(str(m.get("id", "")) for m in message_rows if m.get("id"))
            self._messages_bootstrapped = True
            return
        for msg in message_rows:
            mid = str(msg.get("id", ""))
            if mid and mid not in self._seen_messages:
                self._seen_messages.add(mid)
                if str(msg.get("sender", "")).casefold() != str(cfg.get("windows_user", "")).casefold():
                    recipient = str(msg.get("recipient", "Tümü"))
                    if recipient.casefold() in {"tümü", "tumü", "all", str(cfg.get("windows_user", "")).casefold(), str(cfg.get("computer_name", "")).casefold()} or msg.get("legacy_room"):
                        self.bridge.new_event.emit("Yeni mesaj", f"{msg.get('sender', 'Kullanıcı')}: {msg.get('message', '')[:180]}")


class MetricCard(QFrame):
    """Compact gradient metric tile inspired by the PULSE release dashboard."""
    def __init__(self, title: str, accent: str = "primary", icon: str = "•"):
        super().__init__()
        self.setObjectName("metricCard")
        self.setMinimumHeight(104)
        self.setProperty("metricTone", str(accent or "primary"))
        self.setStyleSheet(
            ""
        )
        layout = QHBoxLayout(self)
        layout.setContentsMargins(14, 13, 14, 13)
        layout.setSpacing(11)
        self.icon_bubble = QLabel(icon)
        self.icon_bubble.setObjectName("metricIcon")
        self.icon_bubble.setAlignment(Qt.AlignCenter)
        self.icon_bubble.setFixedSize(48, 48)
        self.icon_bubble.setStyleSheet(
            ""
        )
        layout.addWidget(self.icon_bubble, 0, Qt.AlignVCenter)
        body = QVBoxLayout()
        body.setContentsMargins(0, 0, 0, 0)
        body.setSpacing(3)
        self.label = QLabel(title)
        self.label.setObjectName("metricLabel")
        self.label.setWordWrap(True)
        body.addWidget(self.label)
        self.value = QLabel("—")
        self.value.setObjectName("metricValue")
        self.value.setMinimumWidth(0)
        body.addWidget(self.value)
        self.note = QLabel("Veri bekleniyor")
        self.note.setStyleSheet("")
        self.note.setWordWrap(True)
        self.note.setMaximumHeight(31)
        body.addWidget(self.note)
        layout.addLayout(body, 1)

    def set_data(self, value: str, note: str = ""):
        text = str(value)
        self.value.setText(text)
        # Long state labels are common for the petition tile; keep them inside the
        # tile rather than letting them collide with adjacent cards.
        font_size = 27 if len(text) <= 5 else (21 if len(text) <= 8 else 16)
        self.value.setStyleSheet("")
        self.value.setToolTip(text)
        self.note.setText(str(note))
        self.note.setToolTip(str(note))


class Card(QFrame):
    def __init__(self, title: str = "", hint: str = ""):
        super().__init__()
        self.setObjectName("card")
        shadow = QGraphicsDropShadowEffect(self)
        shadow.setBlurRadius(24)
        shadow.setOffset(0, 5)
        shadow.setColor(QColor(0, 0, 0, 42))
        self.setGraphicsEffect(shadow)
        self.layout_v = QVBoxLayout(self)
        self.layout_v.setContentsMargins(16, 14, 16, 14)
        self.layout_v.setSpacing(10)
        if title:
            row = QHBoxLayout()
            row.setContentsMargins(0, 0, 0, 2)
            t = QLabel(title)
            t.setObjectName("sectionTitle")
            t.setMinimumWidth(0)
            t.setWordWrap(True)
            row.addWidget(t, 1)
            self.layout_v.addLayout(row)


def _attachment_document_preview(path: Path, limit: int = 1800) -> str:
    """Extract a safe, bounded text preview from common office document containers."""
    suffix = path.suffix.casefold()
    try:
        if suffix in {".txt", ".csv", ".log", ".md", ".json", ".xml", ".yaml", ".yml", ".ini", ".html", ".rtf"}:
            with path.open("r", encoding="utf-8-sig", errors="replace") as stream:
                return stream.read(limit + 1).strip()[:limit]
        with zipfile.ZipFile(path) as archive:
            names = set(archive.namelist())
            xml_text = []
            if suffix == ".docx" and "word/document.xml" in names:
                roots = [ET.fromstring(archive.read("word/document.xml"))]
                xml_text = [el.text or "" for root in roots for el in root.iter() if el.tag.endswith("}t")]
            elif suffix == ".pptx":
                slides = sorted((n for n in names if n.startswith("ppt/slides/slide") and n.endswith(".xml")),
                                key=lambda n: int(re.search(r"slide(\d+)", n).group(1)) if re.search(r"slide(\d+)", n) else 9999)
                for name in slides[:4]:
                    root = ET.fromstring(archive.read(name))
                    line = " ".join(el.text or "" for el in root.iter() if el.tag.endswith("}t"))
                    if line.strip():
                        xml_text.append(line.strip())
            elif suffix == ".xlsx":
                shared = []
                if "xl/sharedStrings.xml" in names:
                    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
                    shared = ["".join((node.text or "") for node in el.iter() if node.tag.endswith("}t")) for el in root if el.tag.endswith("}si")]
                sheet_names = sorted((n for n in names if n.startswith("xl/worksheets/sheet") and n.endswith(".xml")),
                                     key=lambda n: int(re.search(r"sheet(\d+)", n).group(1)) if re.search(r"sheet(\d+)", n) else 9999)
                if sheet_names:
                    root = ET.fromstring(archive.read(sheet_names[0]))
                    for row in [el for el in root.iter() if el.tag.endswith("}row")][:15]:
                        values = []
                        for cell in [el for el in row if el.tag.endswith("}c")][:12]:
                            value = next((child.text or "" for child in cell if child.tag.endswith("}v")), "")
                            if cell.attrib.get("t") == "s":
                                try: value = shared[int(value)]
                                except (ValueError, IndexError): pass
                            if value: values.append(value)
                        if values: xml_text.append(" | ".join(values))
            elif suffix in {".odt", ".ods", ".odp"} and "content.xml" in names:
                root = ET.fromstring(archive.read("content.xml"))
                xml_text = [el.text or "" for el in root.iter() if el.tag.endswith("}p") or el.tag.endswith("}h")]
            return "\n".join(x for x in xml_text if x.strip()).strip()[:limit]
    except (OSError, ValueError, KeyError, zipfile.BadZipFile, ET.ParseError, RuntimeError):
        return ""
    return ""


class StitchWebBridge(QObject):
    """Narrow, JSON-based bridge between the local Stitch HTML screens and PULSE services."""
    def __init__(self, window, route: str, view):
        super().__init__(view)
        self.window = window
        self.route = route

    @Slot(str)
    def navigateRoute(self, route: str):
        self.window._stitch_navigate(route)

    @Slot()
    def createProject(self):
        self.window._stitch_create_project()

    @Slot()
    def createTask(self):
        self.window._stitch_create_task()

    @Slot(str)
    def setTheme(self, mode: str):
        self.window._stitch_set_theme(mode)

    @Slot(str)
    def updateTask(self, payload_json: str):
        self.window._stitch_update_task(payload_json)

    @Slot()
    def refreshData(self):
        self.window._push_stitch_data(self.route)

    @Slot(result=str)
    def requestData(self) -> str:
        return json.dumps(self.window._stitch_payload(), ensure_ascii=False, separators=(",", ":"))


class DirectoryScanSignals(QObject):
    completed = Signal(str, object, str)


class DirectoryScanJob(QRunnable):
    """List one directory off the UI thread; it never recursively walks a share."""
    def __init__(self, request_id: str, path: str):
        super().__init__()
        self.request_id = request_id
        self.path = path
        self.signals = DirectoryScanSignals()

    def run(self):
        rows, message = scan_directory(self.path, limit=1200)
        self.signals.completed.emit(self.request_id, rows, message)


class MainWindow(WorkspaceUiMixin, QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("ENÇEV PULSE 2.7.0 | Workspace")
        screen = QApplication.primaryScreen()
        area = screen.availableGeometry() if screen else None
        screen_w = area.width() if area else 1440
        screen_h = area.height() if area else 900
        min_width = max(760, min(1024, screen_w - 40))
        min_height = max(520, min(640, screen_h - 40))
        self.setMinimumSize(min_width, min_height)
        self.resize(max(min_width, min(1440, int(screen_w * 0.92))),
                    max(min_height, min(900, int(screen_h * 0.91))))
        self._config_lock = threading.RLock()
        self.config = load_config()
        # First launch of the redesigned workspace adopts the supplied Stitch dark shell.
        # This migration only changes the theme and its version marker; business data is untouched.
        if self.config.get("ui_design_version") != "bitrix_workspace_stitch_2026_10":
            self.config["theme"] = "dark_velvet"
            self.config["ui_design_version"] = "bitrix_workspace_stitch_2026_10"
            save_config(self.config)
        self.workspace_projects: list[dict[str, Any]] = []
        self.workspace_profiles: list[dict[str, Any]] = []
        self.workspace_events: list[dict[str, Any]] = []
        # Keep independent signatures: profile heartbeat timestamps must not force
        # large project/opinion/contact tables to be rebuilt on every polling cycle.
        self._workspace_signature = None  # retained as a combined diagnostic signature
        self._project_signature = None
        self._profile_signature = None
        self._contacts_signature = None
        self._dashboard_render_signature = None
        self._eced_table_render_signature = None
        self._dashboard_account_page = 0
        self._dashboard_accounts_total = 0
        self._institution_name_cache = []
        self._project_editor_active = False
        self._workspace_refresh_pending = False
        self.notes_store = PrivateNotesStore()
        self.snapshot: dict[str, Any] = {"reports": [], "agents": [], "messages": [], "network_ok": False, "network_error": "Henüz tarama yapılmadı.", "petition": {}, "workspace": {"projects": [], "profiles": [], "workspace_ok": False}}
        self.notifications: list[tuple[float, str, str]] = []
        self._notification_limiter = NotificationLimiter(max_per_window=3, window_seconds=60)
        self._workspace_events_bootstrapped = False
        self._seen_workspace_event_ids: set[str] = set()
        self.unread_messages = 0
        self._messages_signature = None
        self._chat_contacts_signature = None
        self._queued_message_receipts: set[str] = set()
        self._online_users: set[str] = set()
        self._notified_reminders: set[str] = set()
        self.current_page = "Genel Bakış"
        self._stitch_theme_mode = normalize_theme(self.config.get("theme", "dark_velvet"))
        self._dashboard_project_index = 0
        self._dashboard_active_project_id = ""
        self._open_portal_after_claim = False
        self.chat_current_target = "Tümü"
        self.pending_chat_attachments: list[str] = []
        self.workspace_contacts: list[dict[str, Any]] = []
        self._documents_scan_jobs: dict[str, DirectoryScanJob] = {}
        self._documents_current_rows: list[dict[str, Any]] = []
        self._documents_root = str(self.config.get("documents_root") or r"\\192.168.1.55\Genel Evrak")
        self.calendar_events: list[dict[str, str]] = []
        self._documents_scan_token = ""
        self.workspace_contact_index: list[dict[str, Any]] | None = None
        self._scan_in_progress = False
        self._application_started_at = time.time()
        self._seen_petition_queue_events: set[str] = set()
        self.incoming: queue.Queue = queue.Queue(maxsize=2000)
        self.wake_event = threading.Event()
        self.bridge = UiBridge()
        self.bridge.snapshot_ready.connect(self.apply_snapshot)
        self.bridge.collector_status.connect(self.set_collector_status)
        self.bridge.new_event.connect(self.add_notification)
        self.bridge.task_result.connect(self.show_task_result)
        self.bridge.task_result.connect(self._stitch_handle_task_result)
        self.bridge.petition_history_ready.connect(self.show_petition_history)
        self.bridge.petition_backups_ready.connect(self.show_petition_backups)
        self.bridge.update_check_result.connect(self.on_update_check_result)
        self.server = LocalCollectorServer(str(self.config.get("collector_host", "127.0.0.1")), int(self.config.get("collector_port", 8765)), str(self.config.get("pair_token", "")), self.incoming, self.wake_event, str(self.config.get("computer_name", socket.gethostname())), str(self.config.get("windows_user", os.environ.get("USERNAME", "bilinmiyor"))))
        self.collector_ok, self.collector_text = self.server.start()
        self.config["collector_port"] = self.server.port
        self.worker = MonitorWorker(self.get_config, self.incoming, self.bridge, self.wake_event)
        self.pages: dict[str, QWidget] = {}
        self.nav_buttons: dict[str, QPushButton] = {}
        self._building_ui()
        self.dashboard_project_timer = QTimer(self)
        self.dashboard_project_timer.setInterval(5000)
        self.dashboard_project_timer.timeout.connect(self._rotate_dashboard_project)
        self.dashboard_project_timer.start()
        self.worker.start()
        self._ui_timer = QTimer(self)
        self._ui_timer.timeout.connect(self.update_clock)
        self._ui_timer.start(1000)
        # Prevent the manual network scan button from staying disabled forever
        # if a shared network folder is slow or unreachable.
        self._scan_recovery_timer = QTimer(self)
        self._scan_recovery_timer.setSingleShot(True)
        self._scan_recovery_timer.timeout.connect(self._recover_scan_button)
        self._reminder_timer = QTimer(self)
        self._reminder_timer.timeout.connect(self.check_workspace_reminders)
        self._reminder_timer.start(60000)
        self._update_check_running = False
        self._update_scheduled_version = ""
        self._pending_update: dict[str, Any] | None = None
        self._update_timer = QTimer(self)
        self._update_timer.timeout.connect(self.check_for_updates_async)
        # The update manifest is on SMB; five-minute checks reduce network chatter.
        self._update_timer.start(300000)
        QTimer.singleShot(15000, self.check_for_updates_async)
        self.bridge.collector_status.emit(self.collector_text)
        self.navigate("Genel Bakış")
        if getattr(self, "_stitch_error", "") and not getattr(self, "_stitch_enabled", False):
            stitch_error = str(self._stitch_error)
            self.status_label.setText(stitch_error)
            QTimer.singleShot(350, lambda message=stitch_error: QMessageBox.warning(self, "Stitch arayüzü yüklenemedi", message))
        else:
            self.status_label.setText("Ağ taraması başlatılıyor…")
        self.check_workspace_reminders()

    def check_for_updates_async(self):
        # All SMB reads, package download and ZIP validation run outside the GUI thread.
        if self._update_check_running or self._update_scheduled_version or getattr(sys, "frozen", False):
            return
        self._update_check_running = True
        shared_root = str(self.get_config().get("shared_root", "")).strip()

        def check():
            update = None
            error = ""
            try:
                update = find_update(shared_root, CURRENT_VERSION) if shared_root else None
                if update:
                    local_package = copy_verified_package(update)
                    try:
                        validate_package(local_package, expected_version=str(update["version"]))
                    except Exception:
                        import shutil
                        shutil.rmtree(local_package.parent, ignore_errors=True)
                        raise
                    update["local_package"] = str(local_package)
            except Exception as exc:
                error = str(exc)
                # A broken or partially downloaded package must never be scheduled for installation.
                staged = str((update or {}).get("local_package", ""))
                if staged:
                    import shutil
                    shutil.rmtree(Path(staged).parent, ignore_errors=True)
                update = None
            self.bridge.update_check_result.emit({"update": update, "error": error})

        threading.Thread(target=check, name="PulseUpdateCheck", daemon=True).start()

    def on_update_check_result(self, result):
        self._update_check_running = False
        result = result or {}
        update = result.get("update")
        if not update:
            # Transient network failures are deliberately non-modal; do not block normal work.
            return
        version = str(update.get("version", ""))
        if not version or version == CURRENT_VERSION or version == self._update_scheduled_version:
            return

        # Never close a user's open forms on a timer. The verified update is installed
        # only after an explicit Yes; No defers it until the next application launch.
        self._update_scheduled_version = version
        self._pending_update = update
        self.add_notification(
            "Otomatik güncelleme",
            f"PULSE {version} indirildi ve doğrulandı. Kurulum yalnızca onay verirsen başlatılacak."
        )
        answer = QMessageBox.question(
            self,
            "PULSE güncellemesi hazır",
            f"PULSE {version} güncellemesi indirildi ve doğrulandı.\n\n"
            "Güncelleme uygulandığında PULSE kapanıp yeniden açılacak. "
            "Açık formlardaki değişikliklerini kaydettiysen şimdi yükleyebilirsin.\n\n"
            "Chrome/Edge eklenti dosyaları da güncellenecek. PULSE yeniden açıldıktan sonra Ayarlar bölümündeki eklenti yardımcısıyla uzantılar sayfasını açıp PULSE kartında Yenile'ye basın; ardından e-ÇED sekmesini yenileyin. Eklentiyi kaldırıp yeniden kurmanız gerekmez.\n\n"
            "Şimdi güncellensin mi? (Hayır: sonraki PULSE açılışında tekrar sorulur.)",
            QMessageBox.Yes | QMessageBox.No,
            QMessageBox.No,
        )
        pending = self._pending_update
        self._pending_update = None
        if answer == QMessageBox.Yes and pending is not None:
            self.apply_update(pending)
        else:
            import shutil
            package = Path(str(update.get("local_package", "")))
            if package.parent.exists():
                shutil.rmtree(package.parent, ignore_errors=True)
            self.status_label.setText(
                f"PULSE {version} güncellemesi hazır; bu oturumda ertelendi. Sonraki açılışta tekrar sorulacak."
            )

    def apply_update(self, update):
        package = Path(str(update.get("local_package", "")))
        try:
            if not package.is_file():
                raise FileNotFoundError("İndirilen güncelleme paketi bulunamadı. Ağ paylaşımını kontrol edin.")
            validate_package(package, expected_version=str(update.get("version", "")))
            updater = APP_DIR / "pulse_updater.py"
            if not updater.is_file():
                raise FileNotFoundError("pulse_updater.py bulunamadı. Bu güncelleme, kaynak klasörden çalışan kurulum içindir.")
            flags = 0
            if os.name == "nt":
                flags = getattr(subprocess, "DETACHED_PROCESS", 0x00000008) | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0x00000200)
            subprocess.Popen(
                [sys.executable, str(updater), "--pid", str(os.getpid()), "--package", str(package), "--target", str(APP_DIR), "--version", str(update.get("version", "")), "--launcher", "START_PULSE.bat"],
                cwd=str(APP_DIR), creationflags=flags, close_fds=(os.name != "nt"),
            )
            self.status_label.setText("Güncelleme uygulanıyor; uygulama güvenli biçimde yeniden başlatılacak…")
            QTimer.singleShot(250, self.close)
        except Exception as exc:
            self._update_scheduled_version = ""
            import shutil
            if package.parent.exists():
                shutil.rmtree(package.parent, ignore_errors=True)
            QMessageBox.critical(self, "Güncelleme uygulanamadı", f"{exc}\n\nMevcut sürüm çalışmaya devam ediyor.")

    def get_config(self):
        with self._config_lock:
            return dict(self.config)

    def set_config(self, new_cfg):
        with self._config_lock:
            self.config = dict(new_cfg)
            save_config(self.config)

    def _building_ui(self):
        root = QWidget()
        root.setObjectName("root")
        main = QHBoxLayout(root)
        main.setContentsMargins(0, 0, 0, 0)
        main.setSpacing(0)

        sidebar = QFrame()
        sidebar.setObjectName("sidebar")
        sidebar.setFixedWidth(256)
        side = QVBoxLayout(sidebar)
        side.setContentsMargins(14, 18, 14, 15)
        side.setSpacing(5)

        brand_box = QFrame()
        brand_box.setObjectName("sidebarBrandBox")
        brand_layout = QHBoxLayout(brand_box)
        brand_layout.setContentsMargins(3, 0, 3, 0)
        brand_layout.setSpacing(9)
        logo = QLabel()
        icon_path = APP_DIR / "assets" / "pulse_icon.png"
        if icon_path.is_file():
            logo.setPixmap(QPixmap(str(icon_path)).scaled(43, 43, Qt.KeepAspectRatio, Qt.SmoothTransformation))
        else:
            logo.setText("P")
            logo.setStyleSheet("")
        brand_layout.addWidget(logo, 0, Qt.AlignVCenter)
        brand_words = QVBoxLayout()
        brand_words.setSpacing(0)
        brand = QLabel("PULSE")
        brand.setObjectName("brand")
        brand_words.addWidget(brand)
        brand_sub = QLabel("PROJE YÖNETİMİ")
        brand_sub.setObjectName("brandSub")
        brand_words.addWidget(brand_sub)
        brand_layout.addLayout(brand_words, 1)
        side.addWidget(brand_box)
        side.addSpacing(28)

        nav_label = QLabel("WORKSPACE")
        nav_label.setObjectName("navLabel")
        side.addWidget(nav_label)
        navs = [
            ("Genel Bakış", "⌂   Genel Bakış"),
            ("Görevler & Süreç", "☷   Görevler & Süreç"),
            ("Takvim & Yasal Süreç", "▦   Takvim & Yasal Süreç"),
            ("Projeler", "▣   Projeler"),
            ("Ekibim", "♙   Ekip & İş Yükü"),
            ("Mesajlar", "◉   Mesajlar"),
            ("Kurum Rehberi", "▤   Kurum Rehberi"),
            ("Belgeler", "▧   Belgeler / Drive"),
            ("Dilekçeler", "▤   Dilekçe & e-ÇED Kilidi"),
            ("e-ÇED Canlı", "◉   Analiz & Telemetri"),
            ("Notlarım", "✎   Notlarım"),
            ("Bildirimler", "◌   Bildirimler"),
        ]
        nav_groups = {4: "EKİP VE İLETİŞİM", 8: "OPERASYON", 10: "KİŞİSEL ALAN"}
        for index, (key, text) in enumerate(navs):
            if index in nav_groups:
                group_label = QLabel(nav_groups[index])
                group_label.setObjectName("navLabel")
                side.addWidget(group_label)
            btn = QPushButton(text)
            btn.setObjectName("nav")
            btn.setCursor(Qt.PointingHandCursor)
            btn.setMinimumHeight(39)
            btn.clicked.connect(lambda _=False, k=key: self.navigate(k))
            side.addWidget(btn)
            self.nav_buttons[key] = btn
        side.addStretch(1)
        settings_btn = QPushButton("⚙   Ayarlar")
        settings_btn.setObjectName("nav")
        settings_btn.setMinimumHeight(39)
        settings_btn.clicked.connect(lambda: self.navigate("Ayarlar"))
        side.addWidget(settings_btn)
        self.nav_buttons["Ayarlar"] = settings_btn
        account_card = QFrame()
        account_card.setObjectName("accountStrip")
        account_layout = QHBoxLayout(account_card)
        account_layout.setContentsMargins(4, 7, 4, 7)
        account_layout.setSpacing(9)
        online_dot = QLabel("●")
        online_dot.setStyleSheet("")
        account_layout.addWidget(online_dot, 0, Qt.AlignTop)
        account_text = QVBoxLayout()
        account_text.setSpacing(2)
        account_caption = QLabel("AKTİF HESAP")
        account_caption.setStyleSheet("")
        account_text.addWidget(account_caption)
        account_value = QLabel(f"{_plain(self.config.get('windows_user'))}  ·  {_plain(self.config.get('computer_name'))}")
        account_value.setWordWrap(True)
        account_value.setStyleSheet("")
        account_text.addWidget(account_value)
        account_layout.addLayout(account_text, 1)
        side.addWidget(account_card)
        main.addWidget(sidebar)

        right = QWidget()
        right.setObjectName("applicationArea")
        rv = QVBoxLayout(right)
        rv.setContentsMargins(0, 0, 0, 0)
        rv.setSpacing(0)

        top_bar = QFrame()
        top_bar.setObjectName("topBar")
        top_bar.setFixedHeight(64)
        top_layout = QHBoxLayout(top_bar)
        top_layout.setContentsMargins(22, 9, 22, 9)
        top_layout.setSpacing(12)
        product = QLabel("PULSE")
        product.setObjectName("topBarBrand")
        product.setVisible(False)  # sidebar owns the persistent wordmark
        top_layout.addWidget(product)
        self.global_search = QLineEdit()
        self.global_search.setObjectName("globalSearch")
        self.global_search.setPlaceholderText("⌕   Proje, kurum, kişi veya sohbet ara…")
        self.global_search.setClearButtonEnabled(True)
        self.global_search.setMaximumWidth(570)
        self.global_search.returnPressed.connect(self._run_global_search)
        top_layout.addWidget(self.global_search, 1)
        self.global_search_status = QLabel("")
        self.global_search_status.setObjectName("topBarMeta")
        self.global_search_status.setVisible(False)
        top_layout.addWidget(self.global_search_status)
        self.toolbar_clock = QLabel(datetime.now().strftime("%H:%M"))
        self.toolbar_clock.setObjectName("topBarMeta")
        self.toolbar_clock.setStyleSheet("")
        top_layout.addWidget(self.toolbar_clock)
        self.toolbar_notifications = QPushButton("🔔")
        self.toolbar_notifications.setObjectName("toolbarIcon")
        self.toolbar_notifications.setCursor(Qt.PointingHandCursor)
        self.toolbar_notifications.setFixedSize(36, 36)
        self.toolbar_notifications.setToolTip("Bildirimler")
        self.toolbar_notifications.setAccessibleName("Bildirimler")
        self.toolbar_notifications.clicked.connect(lambda: self.navigate("Bildirimler"))
        top_layout.addWidget(self.toolbar_notifications)
        self.toolbar_theme = QPushButton("◐")
        self.toolbar_theme.setObjectName("toolbarIcon")
        self.toolbar_theme.setFixedSize(36, 36)
        self.toolbar_theme.setCursor(Qt.PointingHandCursor)
        self.toolbar_theme.setAccessibleName("Açık/koyu tema")
        self.toolbar_theme.setToolTip("Açık ve koyu tema arasında geçiş yap")
        self.toolbar_theme.clicked.connect(self._toggle_theme)
        top_layout.addWidget(self.toolbar_theme)
        profile_initials = "".join(part[0] for part in str(self.config.get("windows_user", "P")).replace(".", " ").replace("_", " ").split() if part)[:2].upper() or "P"
        self.toolbar_user = QPushButton(profile_initials)
        self.toolbar_user.setObjectName("userChip")
        self.toolbar_user.setCursor(Qt.PointingHandCursor)
        self.toolbar_user.setToolTip(f"Windows kullanıcısı: {self.config.get('windows_user', 'bilinmiyor')} · Ayarları aç")
        self.toolbar_user.clicked.connect(lambda: self.navigate("Ayarlar"))
        top_layout.addWidget(self.toolbar_user)
        rv.addWidget(top_bar)

        content = QWidget()
        content.setObjectName("contentArea")
        cv = QVBoxLayout(content)
        cv.setContentsMargins(22, 18, 22, 14)
        cv.setSpacing(12)
        self.page_header = QWidget()
        header = QHBoxLayout(self.page_header)
        header.setContentsMargins(0, 0, 0, 0)
        header.setSpacing(12)
        title_box = QVBoxLayout()
        title_box.setSpacing(3)
        self.page_title = QLabel("Ana Sayfa")
        self.page_title.setObjectName("pageTitle")
        self.page_hint = QLabel("")
        self.page_hint.setObjectName("pageHint")
        self.page_hint.setVisible(False)
        title_box.addWidget(self.page_title)
        header.addLayout(title_box, 1)
        self.clock_label = QLabel("--:--:--")
        self.clock_label.setObjectName("muted")
        self.clock_label.setVisible(False)  # The live clock is already in the top toolbar; avoid duplicate chrome.
        self.network_pill = QLabel("AĞ BEKLENİYOR")
        self.network_pill.setObjectName("statusPill")
        header.addWidget(self.network_pill)
        self.open_portal_btn = QPushButton("e-ÇED'i Aç  ↗")
        self.open_portal_btn.setObjectName("primary")
        self.open_portal_btn.clicked.connect(self.open_portal)
        header.addWidget(self.open_portal_btn)
        cv.addWidget(self.page_header)
        self.stack = QStackedWidget()
        self.stack.setObjectName("pageStack")
        # Avoid painting translucent page transitions over stale stack contents.
        # Each page now switches on an opaque, consistent canvas to prevent ghost silhouettes.
        self.stack.setStyleSheet("")
        self.stack.setAttribute(Qt.WA_StyledBackground, True)
        self.stack.setAutoFillBackground(False)
        cv.addWidget(self.stack, 1)
        footer = QHBoxLayout()
        self.status_label = QLabel("Hazırlanıyor…")
        self.status_label.setObjectName("muted")
        footer.addWidget(self.status_label, 1)
        self.footer_right = QLabel(f"PULSE  ·  {CURRENT_VERSION}")
        self.footer_right.setObjectName("muted")
        footer.addWidget(self.footer_right)
        cv.addLayout(footer)
        rv.addWidget(content, 1)
        main.addWidget(right, 1)

        self.native_root = root
        self.window_stack = QStackedWidget()
        self.window_stack.setObjectName("pulseWindowStack")
        self.window_stack.addWidget(root)
        self.setCentralWidget(self.window_stack)
        app_instance = QApplication.instance()
        if app_instance is not None:
            app_instance.setStyleSheet(STYLE)
        self.setStyleSheet("")
        self._make_dashboard()
        self._make_calendar_page()
        self._make_documents_page()
        self._make_projects_page()
        self._make_team_page()
        self._make_institution_contacts_page()
        self._make_notes_page()
        self._make_eced_page()
        self._make_petitions_page()
        self._make_messages_page()
        self._make_notifications_page()
        self._make_settings_page()
        self._install_stitch_screens()
        self._apply_consistent_design()
        icon_path = APP_DIR / "assets" / "pulse.ico"
        app_icon = QIcon(str(icon_path)) if icon_path.is_file() else self.style().standardIcon(QStyle.SP_ComputerIcon)
        self.setWindowIcon(app_icon)
        self.tray_icon = None
        try:
            if QSystemTrayIcon.isSystemTrayAvailable():
                self.tray_icon = QSystemTrayIcon(app_icon, self)
                tray_menu = QMenu()
                show_action = tray_menu.addAction("PULSE'u göster")
                show_action.triggered.connect(self.showNormal)
                tray_menu.addSeparator()
                exit_action = tray_menu.addAction("Çıkış")
                exit_action.triggered.connect(self.close)
                self.tray_icon.setContextMenu(tray_menu)
                self.tray_icon.setToolTip("PULSE · Proje ve e-ÇED Yönetimi")
                self.tray_icon.show()
        except Exception:
            self.tray_icon = None

    def _apply_consistent_design(self):
        """Normalize the controls on every page so local legacy styles cannot create mismatched boxes.

        Data, signals and business logic are untouched. Widget-specific color treatments remain
        on branded artwork, metrics and workflow-state markers; standard controls share one theme.
        """
        self.page_hint.hide()
        # Every standard input/table must inherit the single application stylesheet. Several old
        # dialogs and tables had their own partial stylesheets; those caused mismatched outlines,
        # opaque inner viewports and low-contrast editors.
        standard_controls = (
            QLineEdit, QTextEdit, QPlainTextEdit, QComboBox, QSpinBox, QDoubleSpinBox,
            QDateEdit, QDateTimeEdit, QTableWidget, QListWidget, QScrollArea,
            QTabWidget, QCheckBox, QPushButton, QToolButton,
        )
        for widget in self.findChildren(QWidget):
            try:
                # Remove per-widget QSS remnants. Central application QSS now owns all native pages,
                # transient menus, dialogs and editors; widget logic uses properties for state.
                if widget.styleSheet():
                    widget.setStyleSheet("")
                if isinstance(widget, standard_controls):
                    if widget.styleSheet():
                        widget.setStyleSheet("")
                if isinstance(widget, QAbstractScrollArea):
                    widget.setFrameShape(QFrame.NoFrame)
                    widget.setViewportMargins(0, 0, 0, 0)
                if isinstance(widget, QTableWidget):
                    widget.setFrameShape(QFrame.NoFrame)
                    widget.setShowGrid(False)
                    widget.setAlternatingRowColors(True)
                    widget.setCornerButtonEnabled(False)
                    widget.setMinimumWidth(0)
                    widget.setTextElideMode(Qt.ElideRight)
                    widget.horizontalHeader().setHighlightSections(False)
                    widget.horizontalHeader().setMinimumSectionSize(68)
                    widget.verticalHeader().setVisible(False)
                    widget.verticalHeader().setDefaultSectionSize(38)
                    widget.setVerticalScrollMode(QAbstractItemView.ScrollPerPixel)
                if isinstance(widget, QLineEdit):
                    widget.setMinimumWidth(0)
                if isinstance(widget, QLabel):
                    widget.setMinimumWidth(0)
                    text = widget.text() if hasattr(widget, "text") else ""
                    if len(text) > 42 and widget.objectName() not in {
                        "brand", "brandSub", "pageTitle", "chatHeaderName", "metricValue"
                    }:
                        widget.setWordWrap(True)
                if widget.objectName() == "card" and widget.styleSheet():
                    widget.setStyleSheet("")
            except RuntimeError:
                # Qt can delete transient viewport objects while their parent is being polished.
                continue
        # All large tables start without a decorative second frame. Project-specific widths are
        # installed by _make_projects_page; contacts keep their responsive column controller.
        for table_name in ("project_table", "project_opinion_table"):
            table = getattr(self, table_name, None)
            if table is not None:
                table.setFrameShape(QFrame.NoFrame)
                table.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        if hasattr(self, "project_detail_tabs"):
            self.project_detail_tabs.setDocumentMode(True)
        # Compact helper tags that duplicate the current page name or explain an obvious action.
        for name in ("contacts_hint", "contact_subtitle", "chat_composer_hint"):
            widget = getattr(self, name, None)
            if widget is not None:
                widget.setVisible(False)
        self._apply_theme(self._stitch_theme_mode, persist=False, push_web=False)

    def _apply_theme(self, mode: str, persist: bool = True, push_web: bool = True):
        mode = normalize_theme(mode)
        self._stitch_theme_mode = mode
        app = QApplication.instance()
        if app is not None:
            app.setStyle("Fusion")
            app.setStyleSheet(build_stylesheet(mode))
        if hasattr(self, "toolbar_theme"):
            self.toolbar_theme.setText("☀" if mode == "dark" else "☾")
            self.toolbar_theme.setToolTip("Açık temaya geç" if mode == "dark" else "Koyu temaya geç")
        combo = getattr(self, "theme_mode_combo", None)
        if combo is not None:
            target = "dark_velvet" if mode == "dark" else "light_sage"
            index = combo.findData(target)
            if index >= 0 and combo.currentIndex() != index:
                combo.blockSignals(True)
                combo.setCurrentIndex(index)
                combo.blockSignals(False)
        if persist:
            cfg = self.get_config()
            cfg["theme"] = "dark_velvet" if mode == "dark" else "light_sage"
            cfg["ui_design_version"] = "bitrix_workspace_stitch_2026_10"
            self.set_config(cfg)
        if hasattr(self, "calendar_widget"):
            self._refresh_calendar_events()
        if push_web:
            self._push_stitch_data()

    def _toggle_theme(self):
        self._apply_theme("light" if self._stitch_theme_mode == "dark" else "dark")

    def _run_global_search(self):
        query = self.global_search.text().strip()
        if not query:
            return
        q = query.casefold()
        self.global_search_status.setVisible(True)
        projects = getattr(self, "workspace_projects", [])
        match_project = next((p for p in projects if q in " ".join(str(p.get(k, "")) for k in ("name", "code", "client", "lead", "province", "district")).casefold()), None)
        if match_project:
            self.navigate("Projeler")
            self.project_search.setText(query)
            self.global_search_status.setText("Proje bulundu")
            return
        task_matches = []
        for project in projects:
            if not isinstance(project, dict) or project.get("archived"):
                continue
            for task in (project.get("tasks", []) or []):
                if not isinstance(task, dict):
                    continue
                haystack = " ".join(str(task.get(k, "")) for k in ("title", "assignee", "status", "priority", "note", "due_date")) + " " + str(project.get("name", "")) + " " + str(project.get("code", ""))
                if q in haystack.casefold():
                    task_matches.append(task)
        if task_matches:
            self.navigate("Görevler & Süreç")
            view = getattr(self, "stitch_views", {}).get("Görevler & Süreç")
            if view is not None:
                query_js = json.dumps(query, ensure_ascii=False)
                view.page().runJavaScript("const e=document.getElementById('task-search-input'); if(e){e.value=" + query_js + ";e.dispatchEvent(new Event('input',{bubbles:true}));} if(window.pulseToast)window.pulseToast('Görev araması uygulandı');")
            self.global_search_status.setText(f"Görev bulundu · {len(task_matches)} eşleşme")
            return
        contacts = getattr(self, "workspace_contacts", [])
        match_contact = next((c for c in contacts if q in " ".join([str(c.get("institution", "")), str(c.get("expert_name", "")), str(c.get("search_text", "")), str(c.get("phones", "")), str(c.get("emails", ""))]).casefold()), None)
        if match_contact:
            self.navigate("Kurum Rehberi")
            self.institution_contacts_search.setText(query)
            self.global_search_status.setText("Kurum rehberinde bulundu")
            return
        profiles = getattr(self, "workspace_profiles", [])
        match_profile = next((profile for profile in profiles if q in " ".join(str(profile.get(k, "")) for k in ("username", "display_name", "job_title", "expertise")).casefold()), None)
        if match_profile:
            self.navigate("Ekibim")
            if hasattr(self, "team_search"):
                self.team_search.setText(query)
            self.global_search_status.setText("Ekip üyesi bulundu")
            return
        agents = self.snapshot.get("agents", []) or []
        reports = self.snapshot.get("reports", []) or []
        match_account = next((r for r in reports if q in " ".join(str(r.get(k, "")) for k in ("account_name", "computer", "windows_user", "tab_title")).casefold()), None)
        if match_account:
            self.navigate("e-ÇED Canlı")
            self.eced_search.setText(query)
            self.global_search_status.setText("Canlı gözlemde bulundu")
            return
        match_message = next((m for m in self.snapshot.get("messages", []) or [] if q in " ".join(str(m.get(k, "")) for k in ("sender", "recipient", "message")).casefold()), None)
        if match_message:
            self.navigate("Mesajlar")
            if hasattr(self, "messages_search"):
                self.messages_search.setText(query)
            self.global_search_status.setText("Mesaj bulundu")
            return
        self.global_search_status.setText("Sonuç bulunamadı")
        QMessageBox.information(self, "PULSE arama", f"‘{query}’ için kayıt bulunamadı. Proje, kurum, ekip üyesi, e-ÇED hesabı ve mesaj kayıtları tarandı.")

    def _dashboard_quick_edit_opinions(self):
        """Open the institution-opinion editor and persist only the opinion rows."""
        actor = str(self.config.get("windows_user", "")).strip()
        project_id = str(getattr(self, "selected_project_id", "") or "")
        project = next((p for p in self.workspace_projects if str(p.get("id", "")) == project_id), None)
        available = [p for p in self.workspace_projects if isinstance(p, dict) and not p.get("archived")]
        if project is None:
            if len(available) == 1:
                project = available[0]
                project_id = str(project.get("id", ""))
            else:
                self.navigate("Projeler")
                QMessageBox.information(self, "Proje seçimi", "Kurum görüşünü düzenlemek için önce Projeler sayfasından ilgili projeyi seç. Ardından bu hızlı işlem, görüş düzenleme penceresini doğrudan açar.")
                return
        is_admin = bool(self._is_workspace_admin())
        team = {str(value).casefold() for value in project.get("team", []) if str(value).strip()} if isinstance(project.get("team", []), list) else set()
        is_assigned = actor.casefold() in team or actor.casefold() == str(project.get("lead", "")).casefold()
        if not (is_admin or is_assigned):
            QMessageBox.warning(self, "Yetki gerekli", "Bu projenin kurum görüşlerini değiştirmek için proje ekibinde, proje sorumlusu veya yönetici olmalısın.")
            return
        opinions = project.get("institution_opinions", [])
        if not isinstance(opinions, list):
            opinions = []
        dialog = InstitutionOpinionsDialog(self, opinions, self.workspace_profiles)
        dialog.setWindowTitle(f"Kurum görüşleri · {project.get('name') or project.get('code') or 'Proje'}")
        if dialog.exec() == QDialog.Accepted:
            self.worker.queue_workspace("project_update", {
                "id": project_id,
                "changes": {"institution_opinions": dialog.payload()},
                "expected_revision": int(project.get("revision", 1) or 1),
            })
            self.status_label.setText(f"{project.get('code') or project.get('name') or 'Proje'} kurum görüşleri ortak alana kaydediliyor…")


    def _make_calendar_page(self):
        """Live due-date calendar built from saved PULSE project/task/opinion records."""
        page = QWidget()
        page.setAttribute(Qt.WA_StyledBackground, True)
        page.setObjectName("pageSurface")
        root = QVBoxLayout(page)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(12)

        intro = QFrame()
        intro.setObjectName("heroBanner")
        intro_layout = QHBoxLayout(intro)
        intro_layout.setContentsMargins(18, 15, 18, 15)
        intro_layout.setSpacing(12)
        title_col = QVBoxLayout()
        title_col.setSpacing(3)
        title = QLabel("Takvim & Yasal Süreç")
        title.setObjectName("sectionTitle")
        subtitle = QLabel("Proje teslimleri, görev son tarihleri ve kurum görüşü tarihleri · ortak çalışma alanından canlı veri")
        subtitle.setObjectName("muted")
        subtitle.setWordWrap(True)
        title_col.addWidget(title)
        title_col.addWidget(subtitle)
        intro_layout.addLayout(title_col, 1)
        self.calendar_event_count = QLabel("0 tarihli kayıt")
        self.calendar_event_count.setObjectName("statusPill")
        intro_layout.addWidget(self.calendar_event_count, 0, Qt.AlignRight | Qt.AlignVCenter)
        refresh = QPushButton("↻ Yenile")
        refresh.setObjectName("secondary")
        refresh.clicked.connect(self._refresh_calendar_events)
        intro_layout.addWidget(refresh)
        root.addWidget(intro)

        splitter = QSplitter(Qt.Horizontal)
        splitter.setObjectName("calendarWorkspaceSplit")
        splitter.setChildrenCollapsible(False)
        splitter.setHandleWidth(1)

        calendar_card = Card("Tarih seç", "Noktalı günlerde kayıtlı iş veya yasal tarih bulunur")
        self.calendar_widget = QCalendarWidget()
        self.calendar_widget.setObjectName("workspaceCalendar")
        self.calendar_widget.setGridVisible(True)
        self.calendar_widget.setNavigationBarVisible(True)
        self.calendar_widget.setVerticalHeaderFormat(QCalendarWidget.NoVerticalHeader)
        self.calendar_widget.setMinimumWidth(310)
        self.calendar_widget.setMinimumHeight(370)
        self.calendar_widget.selectionChanged.connect(self._render_calendar_day)
        self.calendar_widget.currentPageChanged.connect(lambda _y, _m: self._refresh_calendar_events())
        calendar_card.layout_v.addWidget(self.calendar_widget, 1)
        splitter.addWidget(calendar_card)

        events_card = Card("Günün kayıtları", "Kayda çift tıklayarak ilgili PULSE modülünü aç")
        self.calendar_selected_date = QLabel("")
        self.calendar_selected_date.setObjectName("muted")
        events_card.layout_v.addWidget(self.calendar_selected_date)
        self.calendar_day_table = QTableWidget(0, 4)
        self.calendar_day_table.setHorizontalHeaderLabels(["TÜR", "KAYIT", "PROJE / AYRINTI", "TARİH"])
        self._setup_table(self.calendar_day_table)
        self.calendar_day_table.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeToContents)
        self.calendar_day_table.horizontalHeader().setSectionResizeMode(1, QHeaderView.Stretch)
        self.calendar_day_table.horizontalHeader().setSectionResizeMode(2, QHeaderView.Stretch)
        self.calendar_day_table.horizontalHeader().setSectionResizeMode(3, QHeaderView.ResizeToContents)
        self.calendar_day_table.setMinimumWidth(430)
        self.calendar_day_table.cellDoubleClicked.connect(self._open_calendar_row)
        events_card.layout_v.addWidget(self.calendar_day_table, 1)
        row = QHBoxLayout()
        row.addStretch(1)
        self.calendar_open_btn = QPushButton("İlgili kaydı aç  ↗")
        self.calendar_open_btn.setObjectName("primary")
        self.calendar_open_btn.clicked.connect(self._open_selected_calendar_row)
        row.addWidget(self.calendar_open_btn)
        events_card.layout_v.addLayout(row)
        splitter.addWidget(events_card)
        splitter.setStretchFactor(0, 1)
        splitter.setStretchFactor(1, 2)
        splitter.setSizes([420, 760])
        root.addWidget(splitter, 1)
        self.pages["Takvim & Yasal Süreç"] = page
        self.stack.addWidget(page)
        self.calendar_events = []
        self._calendar_marked_dates = set()

    def _refresh_calendar_events(self):
        calendar = getattr(self, "calendar_widget", None)
        if calendar is None:
            return
        self.calendar_events = collect_calendar_events(getattr(self, "workspace_projects", []))
        self.calendar_event_count.setText(f"{len(self.calendar_events)} tarihli kayıt")
        # Clear previous date formatting first; use current palette accent for event days.
        for day in getattr(self, "_calendar_marked_dates", set()):
            try:
                calendar.setDateTextFormat(QDate.fromString(day, "yyyy-MM-dd"), QTextCharFormat())
            except Exception:
                pass
        self._calendar_marked_dates = set()
        dark = getattr(self, "_stitch_theme_mode", "dark") == "dark"
        marker_color = QColor(theme_color(self._stitch_theme_mode, "accent"))
        for day in sorted({item["date"] for item in self.calendar_events}):
            qdate = QDate.fromString(day, "yyyy-MM-dd")
            if not qdate.isValid():
                continue
            fmt = QTextCharFormat()
            fmt.setForeground(QColor(theme_color(self._stitch_theme_mode, "accent_text")))
            fmt.setBackground(marker_color)
            fmt.setFontWeight(700)
            calendar.setDateTextFormat(qdate, fmt)
            self._calendar_marked_dates.add(day)
        self._render_calendar_day()

    def _render_calendar_day(self):
        table = getattr(self, "calendar_day_table", None)
        calendar = getattr(self, "calendar_widget", None)
        if table is None or calendar is None:
            return
        selected = calendar.selectedDate().toString("yyyy-MM-dd")
        try:
            self.calendar_selected_date.setText(calendar.selectedDate().toString("dddd, d MMMM yyyy"))
        except Exception:
            self.calendar_selected_date.setText(selected)
        rows = [event for event in self.calendar_events if event.get("date") == selected]
        table.setUpdatesEnabled(False)
        table.setRowCount(max(1, len(rows)))
        table.clearContents()
        if not rows:
            empty = QTableWidgetItem("Bu tarihte kayıtlı görev, proje teslimi veya kurum görüşü tarihi yok.")
            empty.setToolTip("Takvim yalnızca ortak çalışma alanında kayıtlı tarihleri gösterir.")
            table.setItem(0, 0, empty)
            table.setSpan(0, 0, 1, 4)
        else:
            for row, event in enumerate(rows):
                cells = (event.get("kind", "Kayıt"), event.get("title", "—"), event.get("detail", "—"), format_date_tr(event.get("date", "")))
                for col, value in enumerate(cells):
                    item = QTableWidgetItem(str(value))
                    item.setData(Qt.UserRole, dict(event))
                    item.setToolTip(str(value))
                    table.setItem(row, col, item)
        table.setUpdatesEnabled(True)
        table.viewport().update()
        if hasattr(self, "calendar_open_btn"):
            self.calendar_open_btn.setEnabled(bool(rows))

    def _open_calendar_row(self, row: int, _column: int = 0):
        table = getattr(self, "calendar_day_table", None)
        if table is None or row < 0 or row >= table.rowCount():
            return
        item = table.item(row, 0)
        event = item.data(Qt.UserRole) if item else None
        if not isinstance(event, dict):
            return
        project_id = str(event.get("project_id", ""))
        source = str(event.get("source", ""))
        if project_id:
            self.selected_project_id = project_id
        if source == "task":
            self.navigate("Görevler & Süreç")
        elif source == "opinion":
            self.navigate("Projeler")
            self.refresh_projects()
        else:
            self.navigate("Projeler")
            self.refresh_projects()

    def _open_selected_calendar_row(self):
        table = getattr(self, "calendar_day_table", None)
        if table is not None and table.currentRow() >= 0:
            self._open_calendar_row(table.currentRow(), 0)

    def _make_documents_page(self):
        """A Bitrix-Drive-like shallow browser over the configured existing file share."""
        page = QWidget()
        page.setAttribute(Qt.WA_StyledBackground, True)
        page.setObjectName("pageSurface")
        root = QVBoxLayout(page)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(12)

        intro = QFrame()
        intro.setObjectName("heroBanner")
        intro_layout = QHBoxLayout(intro)
        intro_layout.setContentsMargins(18, 14, 18, 14)
        title_col = QVBoxLayout()
        title_col.setSpacing(3)
        title = QLabel("Belgeler / Drive")
        title.setObjectName("sectionTitle")
        subtitle = QLabel("Var olan şirket klasörlerini güvenli biçimde görüntüle · alt klasörler taranmaz · dosyalar değiştirilmez")
        subtitle.setObjectName("muted")
        subtitle.setWordWrap(True)
        title_col.addWidget(title)
        title_col.addWidget(subtitle)
        intro_layout.addLayout(title_col, 1)
        open_explorer = QPushButton("Dosya Gezgini'nde aç ↗")
        open_explorer.setObjectName("secondary")
        open_explorer.clicked.connect(self._open_documents_folder_external)
        intro_layout.addWidget(open_explorer)
        root.addWidget(intro)

        browse_card = Card("Klasör içeriği", "Listeleme arka planda yapılır; ağ paylaşımı yavaşsa arayüz donmaz")
        path_row = QHBoxLayout()
        self.documents_browse_path = QLineEdit(str(self.config.get("documents_root") or r"\\192.168.1.55\Genel Evrak"))
        self.documents_browse_path.setPlaceholderText(r"\\sunucu\paylaşım\klasör")
        self.documents_browse_path.returnPressed.connect(self.scan_documents_directory)
        path_row.addWidget(self.documents_browse_path, 1)
        choose_btn = QPushButton("Gözat…")
        choose_btn.setObjectName("secondary")
        choose_btn.clicked.connect(self._choose_documents_browse_folder)
        path_row.addWidget(choose_btn)
        up_btn = QPushButton("Üst klasör ↑")
        up_btn.setObjectName("secondary")
        up_btn.clicked.connect(self._documents_parent_folder)
        path_row.addWidget(up_btn)
        scan_btn = QPushButton("Yenile")
        scan_btn.setObjectName("primary")
        scan_btn.clicked.connect(self.scan_documents_directory)
        path_row.addWidget(scan_btn)
        self.documents_scan_btn = scan_btn
        browse_card.layout_v.addLayout(path_row)

        filter_row = QHBoxLayout()
        self.documents_search = QLineEdit()
        self.documents_search.setPlaceholderText("Bu klasörde dosya veya klasör ara…")
        self.documents_search.setClearButtonEnabled(True)
        self.documents_search.textChanged.connect(self._filter_documents_rows)
        filter_row.addWidget(self.documents_search, 1)
        self.documents_count = QLabel("Henüz listelenmedi")
        self.documents_count.setObjectName("muted")
        filter_row.addWidget(self.documents_count)
        browse_card.layout_v.addLayout(filter_row)

        self.documents_table = QTableWidget(0, 4)
        self.documents_table.setHorizontalHeaderLabels(["TÜR", "AD", "DEĞİŞTİRİLME", "BOYUT"])
        self._setup_table(self.documents_table)
        self.documents_table.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeToContents)
        self.documents_table.horizontalHeader().setSectionResizeMode(1, QHeaderView.Stretch)
        self.documents_table.horizontalHeader().setSectionResizeMode(2, QHeaderView.ResizeToContents)
        self.documents_table.horizontalHeader().setSectionResizeMode(3, QHeaderView.ResizeToContents)
        self.documents_table.cellDoubleClicked.connect(self._open_documents_row)
        browse_card.layout_v.addWidget(self.documents_table, 1)
        self.documents_status = QLabel("Dosya listesi ilk açılışta arka planda yüklenir.")
        self.documents_status.setObjectName("muted")
        self.documents_status.setWordWrap(True)
        browse_card.layout_v.addWidget(self.documents_status)
        root.addWidget(browse_card, 1)
        self.pages["Belgeler"] = page
        self.stack.addWidget(page)
        self._documents_initial_scan_done = False

    def scan_documents_directory(self):
        path = self.documents_browse_path.text().strip() if hasattr(self, "documents_browse_path") else ""
        if not path:
            self.documents_status.setText("Önce geçerli bir klasör yolu gir veya Gözat düğmesini kullan.")
            return
        token = uuid.uuid4().hex
        self._documents_scan_token = token
        job = DirectoryScanJob(token, path)
        job.signals.completed.connect(self._documents_scan_finished)
        self._documents_scan_jobs[token] = job
        self.documents_scan_btn.setEnabled(False)
        self.documents_scan_btn.setText("Listeleniyor…")
        self.documents_status.setText("Klasör arka planda taranıyor; yalnızca bir seviye okunuyor…")
        QThreadPool.globalInstance().start(job)

    def _documents_scan_finished(self, request_id: str, rows: object, message: str):
        self._documents_scan_jobs.pop(str(request_id), None)
        if str(request_id) != getattr(self, "_documents_scan_token", ""):
            return
        self.documents_scan_btn.setEnabled(True)
        self.documents_scan_btn.setText("Yenile")
        self._documents_current_rows = list(rows) if isinstance(rows, (list, tuple)) else []
        self.documents_status.setText(str(message))
        self._filter_documents_rows()

    def _filter_documents_rows(self, *_):
        table = getattr(self, "documents_table", None)
        if table is None:
            return
        query = self.documents_search.text().strip().casefold() if hasattr(self, "documents_search") else ""
        rows = [row for row in self._documents_current_rows if not query or query in str(row.get("name", "")).casefold()]
        table.setUpdatesEnabled(False)
        table.setRowCount(max(1, len(rows)))
        table.clearContents()
        if not rows:
            item = QTableWidgetItem("Bu klasörde eşleşen öğe yok.")
            table.setItem(0, 0, item)
            table.setSpan(0, 0, 1, 4)
        else:
            for index, row in enumerate(rows):
                is_dir = bool(row.get("is_dir"))
                size = "Klasör" if is_dir else self._format_file_size(row.get("size", 0))
                values = ("📁 Klasör" if is_dir else (str(row.get("suffix", "")).lstrip(".").upper() or "DOSYA"),
                          str(row.get("name", "")), str(row.get("modified", "—")), size)
                for col, value in enumerate(values):
                    item = QTableWidgetItem(value)
                    item.setData(Qt.UserRole, str(row.get("path", "")))
                    item.setData(Qt.UserRole + 1, is_dir)
                    item.setToolTip(str(row.get("path", "")) if col == 1 else value)
                    table.setItem(index, col, item)
        table.setUpdatesEnabled(True)
        table.viewport().update()
        self.documents_count.setText(f"{len(rows)} öğe gösteriliyor")

    @staticmethod
    def _format_file_size(value: Any) -> str:
        try:
            size = max(0, int(value or 0))
        except (TypeError, ValueError):
            return "—"
        if size < 1024:
            return f"{size} B"
        if size < 1024 * 1024:
            return f"{size / 1024:.1f} KB"
        if size < 1024 * 1024 * 1024:
            return f"{size / (1024 * 1024):.1f} MB"
        return f"{size / (1024 * 1024 * 1024):.2f} GB"

    def _open_documents_row(self, row: int, _column: int = 0):
        table = getattr(self, "documents_table", None)
        if table is None or row < 0 or row >= table.rowCount():
            return
        item = table.item(row, 1) or table.item(row, 0)
        if item is None:
            return
        path = str(item.data(Qt.UserRole) or "")
        is_dir = bool(item.data(Qt.UserRole + 1))
        if not path:
            return
        if is_dir:
            self.documents_browse_path.setText(path)
            if hasattr(self, "documents_search"):
                self.documents_search.clear()
            self.scan_documents_directory()
            return
        try:
            if not QDesktopServices.openUrl(QUrl.fromLocalFile(path)):
                QMessageBox.warning(self, "Dosya açılamadı", f"Windows dosyayı açamadı:\n{path}")
        except Exception as exc:
            QMessageBox.warning(self, "Dosya açılamadı", f"{exc}\n{path}")

    def _documents_parent_folder(self):
        from pathlib import PureWindowsPath
        raw = self.documents_browse_path.text().strip()
        if not raw:
            return
        # PureWindowsPath also handles UNC roots correctly when this method is tested off Windows.
        path = PureWindowsPath(raw) if "\\" in raw else Path(raw)
        parent = str(path.parent)
        if parent and parent != raw:
            self.documents_browse_path.setText(parent)
            if hasattr(self, "documents_search"):
                self.documents_search.clear()
            self.scan_documents_directory()

    def _choose_documents_browse_folder(self):
        start = self.documents_browse_path.text().strip()
        chosen = QFileDialog.getExistingDirectory(self, "Belgeler klasörünü seç", start)
        if chosen:
            self.documents_browse_path.setText(chosen)
            self.scan_documents_directory()

    def _open_documents_folder_external(self):
        raw = self.documents_browse_path.text().strip()
        if not raw:
            return
        try:
            if not QDesktopServices.openUrl(QUrl.fromLocalFile(raw)):
                QMessageBox.warning(self, "Klasör açılamadı", f"Klasör Windows'ta açılamadı:\n{raw}")
        except Exception as exc:
            QMessageBox.warning(self, "Klasör açılamadı", str(exc))

    def choose_documents_root(self):
        start = self.documents_path_edit.text().strip() if hasattr(self, "documents_path_edit") else ""
        chosen = QFileDialog.getExistingDirectory(self, "Belgeler / Drive kök klasörünü seç", start)
        if chosen:
            self.documents_path_edit.setText(chosen)

    def _make_dashboard(self):
        page = QWidget()
        page.setAttribute(Qt.WA_StyledBackground, True)
        page.setObjectName("dashboardContent")
        content = QVBoxLayout(page)
        content.setContentsMargins(0, 0, 0, 0)
        content.setSpacing(14)

        # Greeting + live shared petition status — values are refreshed from the same
        # ENCTakip-compatible data source used on the Dilekçeler page.
        greeting_row = QHBoxLayout()
        greeting_row.setSpacing(18)
        greeting_text = QVBoxLayout()
        greeting_text.setSpacing(4)
        greeting = QLabel(f"Merhaba, {_plain(self.config.get('windows_user') or 'ekip')}")
        greeting.setStyleSheet("")
        greeting_text.addWidget(greeting)
        greeting_row.addLayout(greeting_text, 1)

        petition_card = QFrame()
        petition_card.setObjectName("dashboardPetitionCard")
        petition_card.setStyleSheet("")
        petition_card.setMinimumWidth(300)
        petition_card.setMaximumWidth(430)
        p_row = QHBoxLayout(petition_card)
        p_row.setContentsMargins(12, 10, 12, 10)
        p_row.setSpacing(10)
        p_icon = QLabel("▤")
        p_icon.setAlignment(Qt.AlignCenter)
        p_icon.setFixedSize(39, 39)
        p_icon.setStyleSheet("")
        p_row.addWidget(p_icon, 0, Qt.AlignVCenter)
        p_text = QVBoxLayout()
        p_text.setSpacing(3)
        p_head = QHBoxLayout()
        p_name = QLabel("Dilekçeler Dosyası")
        p_name.setStyleSheet("")
        p_head.addWidget(p_name)
        self.dashboard_petition_status = QLabel("Dilekçe dosyası: durum bekleniyor…")
        self.dashboard_petition_status.setObjectName("heroPetitionStatus")
        self.dashboard_petition_status.setWordWrap(True)
        self.dashboard_petition_status.setStyleSheet("")
        p_head.addWidget(self.dashboard_petition_status, 0, Qt.AlignVCenter)
        p_head.addStretch(1)
        p_text.addLayout(p_head)
        self.dashboard_petition_owner = QLabel("Kullanıcı ve son değişiklik bilgisi bekleniyor")
        self.dashboard_petition_owner.setStyleSheet("")
        self.dashboard_petition_owner.setWordWrap(True)
        p_text.addWidget(self.dashboard_petition_owner)
        p_row.addLayout(p_text, 1)
        hero_petition = QPushButton("Detaylar")
        hero_petition.setObjectName("secondary")
        hero_petition.setCursor(Qt.PointingHandCursor)
        hero_petition.clicked.connect(lambda: self.navigate("Dilekçeler"))
        p_row.addWidget(hero_petition)
        greeting_row.addWidget(petition_card, 0, Qt.AlignRight | Qt.AlignVCenter)
        content.addLayout(greeting_row)

        metrics = QGridLayout()
        metrics.setSpacing(10)
        self.metric_projects = MetricCard("Toplam Proje", "primary", "▤")
        self.metric_accounts = MetricCard("Aktif e-ÇED Hesabı", "green", "♙")
        self.metric_opinions = MetricCard("Bekleyen Kurum Görüşü", "primary", "▧")
        self.metric_petition = MetricCard("Dilekçe Dosyası", "warning", "➤")
        # Keep additional diagnostic counters alive for the live-monitoring page.
        self.metric_computers = MetricCard("Takipteki Bilgisayar", "primary", "▣")
        self.metric_revisions = MetricCard("Revizyonda", "warning", "↻")
        self.metric_risks = MetricCard("Risk / Engel", "red", "⚑")
        self.metric_conflicts = MetricCard("Hesap Çakışması", "red", "⚠")
        for i, card in enumerate([self.metric_projects, self.metric_accounts, self.metric_opinions, self.metric_petition]):
            metrics.addWidget(card, 0, i)
        content.addLayout(metrics)

        middle = QHBoxLayout()
        middle.setSpacing(12)
        recent_card = Card("Son Projeler", "En son güncellenen proje kayıtları")
        recent_head = recent_card.layout_v.itemAt(0).layout()
        recent_head.addStretch(1)
        show_all = QPushButton("Tümünü Gör  →")
        show_all.setObjectName("secondary")
        show_all.setCursor(Qt.PointingHandCursor)
        show_all.clicked.connect(lambda: self.navigate("Projeler"))
        recent_head.addWidget(show_all)
        self.dashboard_recent_table = QTableWidget(0, 4)
        self.dashboard_recent_table.setHorizontalHeaderLabels(["PROJE NO", "PROJE ADI", "DURUM", "SON GÜNCELLEME"])
        self._setup_table(self.dashboard_recent_table)
        self.dashboard_recent_table.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeToContents)
        self.dashboard_recent_table.horizontalHeader().setSectionResizeMode(1, QHeaderView.Stretch)
        self.dashboard_recent_table.horizontalHeader().setSectionResizeMode(2, QHeaderView.ResizeToContents)
        self.dashboard_recent_table.horizontalHeader().setSectionResizeMode(3, QHeaderView.ResizeToContents)
        self.dashboard_recent_table.verticalHeader().setDefaultSectionSize(34)
        self.dashboard_recent_table.setMinimumHeight(205)
        self.dashboard_recent_table.setMaximumHeight(255)
        self.dashboard_recent_table.cellDoubleClicked.connect(self._open_dashboard_recent_row)
        recent_card.layout_v.addWidget(self.dashboard_recent_table, 1)
        middle.addWidget(recent_card, 7)

        right_stack = QVBoxLayout()
        right_stack.setSpacing(10)
        quick_card = Card("Hızlı İşlemler", "Sık kullanılan işlemler")
        quick_grid = QGridLayout()
        quick_grid.setSpacing(7)
        quick_actions = [
            ("▣  Yeni Proje Ekle", lambda: self.create_project_dialog()),
            ("▤  Kurum Görüşü Düzenle", self._dashboard_quick_edit_opinions),
            ("▧  Dilekçe Oluştur", self._dashboard_create_petition),
            ("◉  e-ÇED Giriş", self.open_portal),
            ("◉  Sohbet aç", lambda: self.navigate("Mesajlar")),
            ("⌕  Kurum Rehberi", lambda: self.navigate("Kurum Rehberi")),
        ]
        for idx, (label, callback) in enumerate(quick_actions):
            button = QPushButton(label)
            button.setObjectName("quickAction")
            button.setCursor(Qt.PointingHandCursor)
            button.clicked.connect(callback)
            quick_grid.addWidget(button, idx // 2, idx % 2)
        quick_card.layout_v.addLayout(quick_grid)
        right_stack.addWidget(quick_card)

        activity_card = Card("Duyurular", "Son sistem ve ekip hareketleri")
        self.event_list = QListWidget()
        self.event_list.setMaximumHeight(145)
        self.event_list.setMinimumHeight(105)
        activity_card.layout_v.addWidget(self.event_list, 1)
        activity_footer = QHBoxLayout()
        activity_footer.addStretch(1)
        all_events = QPushButton("Tüm Bildirimler  →")
        all_events.setObjectName("secondary")
        all_events.clicked.connect(lambda: self.navigate("Bildirimler"))
        activity_footer.addWidget(all_events)
        activity_card.layout_v.addLayout(activity_footer)
        right_stack.addWidget(activity_card, 1)
        middle.addLayout(right_stack, 5)
        content.addLayout(middle)

        # The original live account table remains on the home page below the fold;
        # e-ÇED Canlı also offers the full set of account filters and diagnostics.
        live_card = Card("Canlı Hesap Gözlemi", "Son doğrulanmış tarayıcı sinyalleri · hesaplar yalnızca gerçek gözlemden listelenir")
        self.dashboard_table = QTableWidget(0, 3)
        self.dashboard_table.setHorizontalHeaderLabels(["", "e-ÇED HESABI", "KULLANICI"])
        self._setup_table(self.dashboard_table)
        self.dashboard_table.setEditTriggers(QAbstractItemView.NoEditTriggers)
        self.dashboard_table.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeToContents)
        self.dashboard_table.horizontalHeader().setSectionResizeMode(1, QHeaderView.Stretch)
        self.dashboard_table.horizontalHeader().setSectionResizeMode(2, QHeaderView.Stretch)
        self.dashboard_table.verticalHeader().setDefaultSectionSize(33)
        self.dashboard_table.setMinimumHeight(150)
        self.dashboard_table.setMaximumHeight(205)
        live_card.layout_v.addWidget(self.dashboard_table, 1)
        self._dashboard_account_page_size = 100
        self._dashboard_account_page = 0
        self._dashboard_accounts_total = 0
        account_pager = QHBoxLayout()
        self.dashboard_account_page_label = QLabel("0 hesap")
        self.dashboard_account_page_label.setObjectName("muted")
        self.dashboard_account_prev = QPushButton("Önceki")
        self.dashboard_account_prev.setObjectName("secondary")
        self.dashboard_account_prev.setMaximumWidth(88)
        self.dashboard_account_prev.clicked.connect(lambda: self._change_dashboard_account_page(-1))
        self.dashboard_account_next = QPushButton("Sonraki")
        self.dashboard_account_next.setObjectName("secondary")
        self.dashboard_account_next.setMaximumWidth(88)
        self.dashboard_account_next.clicked.connect(lambda: self._change_dashboard_account_page(1))
        account_pager.addWidget(self.dashboard_account_page_label, 1)
        account_pager.addWidget(self.dashboard_account_prev)
        account_pager.addWidget(self.dashboard_account_next)
        live_card.layout_v.addLayout(account_pager)
        content.addWidget(live_card)

        dashboard_scroll = QScrollArea()
        dashboard_scroll.setObjectName("dashboardScroll")
        dashboard_scroll.setStyleSheet("")
        dashboard_scroll.setWidgetResizable(True)
        dashboard_scroll.setFrameShape(QFrame.NoFrame)
        dashboard_scroll.setAttribute(Qt.WA_StyledBackground, True)
        dashboard_scroll.setAutoFillBackground(True)
        dashboard_scroll.setWidget(page)
        self.pages["Genel Bakış"] = dashboard_scroll
        self.stack.addWidget(dashboard_scroll)
        self._refresh_dashboard_projects()

    def _dashboard_create_petition(self):
        self.navigate("Dilekçeler")
        self.create_petition_draft()

    def _open_dashboard_recent_row(self, row: int, _column: int = 0):
        table = getattr(self, "dashboard_recent_table", None)
        if table is None or row < 0 or row >= table.rowCount():
            return
        item = table.item(row, 1)
        project_id = str(item.data(Qt.UserRole) or "") if item else ""
        if project_id:
            self._open_dashboard_project(project_id)

    def _dashboard_project_icon(self, project_type: str) -> tuple[str, str]:
        kind = str(project_type or "ÇED").upper()
        if "RES" in kind or "RÜZGAR" in kind:
            return "🌬", "#e7f4ff"
        if "GES" in kind or "GÜNEŞ" in kind or "GUNES" in kind:
            return "☀", "#fff4d8"
        if "ETL" in kind or "İLETİM" in kind or "ILETIM" in kind:
            return "⚡", "#fff0d9"
        if "MADEN" in kind:
            return "⛏", "#eee9ff"
        return "🌿", "#e4f5eb"

    def _profile_display_name(self, username: str) -> str:
        key = str(username or "").casefold()
        profile = next((p for p in self.workspace_profiles if str(p.get("username", "")).casefold() == key), None)
        return str((profile or {}).get("display_name") or username or "Atanmadı")

    def _rotate_dashboard_project(self):
        # The old rotating spotlight is now a stable recent-project table.
        # Keep the lightweight 5-second refresh for newly synced shared records.
        if str(getattr(self, "current_page", "")) != "Genel Bakış":
            return
        self._refresh_dashboard_projects()

    def _refresh_dashboard_projects(self):
        table = getattr(self, "dashboard_recent_table", None)
        if table is None:
            return
        # Do not destroy/recreate dashboard child widgets; update the table in place.
        projects = [p for p in getattr(self, "workspace_projects", []) if isinstance(p, dict) and not p.get("archived")]
        projects.sort(key=lambda p: float(p.get("updated_at", 0) or 0), reverse=True)
        shown = projects[:6]
        signature = tuple((str(p.get("id", "")), str(p.get("code", "")), str(p.get("name", "")), str(p.get("status", "")), str(p.get("stage", "")), float(p.get("updated_at", 0) or 0)) for p in shown)
        if signature == getattr(self, "_dashboard_recent_signature", None):
            return
        self._dashboard_recent_signature = signature
        old_signals = table.blockSignals(True)
        old_updates = table.updatesEnabled()
        table.setUpdatesEnabled(False)
        try:
            table.clearContents()
            table.setRowCount(max(1, len(shown)))
            if not shown:
                empty = QTableWidgetItem("Henüz proje kaydı yok. Yetkili kullanıcı ‘Yeni Proje Ekle’ ile başlayabilir.")
                empty.setForeground(QColor(theme_color(self._stitch_theme_mode, "dim")))
                table.setItem(0, 0, empty)
                table.setSpan(0, 0, 1, 4)
            else:
                status_colors = {"devam ediyor": theme_color(self._stitch_theme_mode, "green"), "incelemede": theme_color(self._stitch_theme_mode, "primary"), "tamamlandı": theme_color(self._stitch_theme_mode, "green"), "beklemede": theme_color(self._stitch_theme_mode, "warning"), "bekliyor": theme_color(self._stitch_theme_mode, "warning")}
                for row, project in enumerate(shown):
                    project_id = str(project.get("id", ""))
                    code = str(project.get("code", "")).strip() or "—"
                    name = str(project.get("name", "")).strip() or "İsimsiz proje"
                    status = str(project.get("status", "") or project.get("stage", "") or "Devam ediyor")
                    updated = project.get("updated_at", 0)
                    try:
                        updated_text = datetime.fromtimestamp(float(updated)).strftime("%d.%m.%Y %H:%M") if float(updated or 0) > 0 else "—"
                    except (TypeError, ValueError, OSError, OverflowError):
                        updated_text = "—"
                    item_code = QTableWidgetItem(code)
                    item_name = QTableWidgetItem(name)
                    item_name.setData(Qt.UserRole, project_id)
                    item_name.setToolTip("Çift tıklayarak projeyi aç")
                    item_status = QTableWidgetItem("●  " + status)
                    item_status.setForeground(QColor(status_colors.get(status.casefold(), "#526c87")))
                    item_time = QTableWidgetItem(updated_text)
                    item_time.setTextAlignment(Qt.AlignLeft | Qt.AlignVCenter)
                    for col, item in enumerate((item_code, item_name, item_status, item_time)):
                        item.setToolTip(name if col == 1 else item.text())
                        table.setItem(row, col, item)
        finally:
            table.setUpdatesEnabled(old_updates)
            table.blockSignals(old_signals)
            table.viewport().update()

    def _open_dashboard_project(self, project_id: str):
        self.selected_project_id = str(project_id or "")
        self.navigate("Projeler")
        self.refresh_projects()

    def _setup_table(self, table: QTableWidget):
        table.setAlternatingRowColors(True)
        table.setEditTriggers(QAbstractItemView.NoEditTriggers)
        table.setSelectionBehavior(QAbstractItemView.SelectRows)
        table.setSelectionMode(QAbstractItemView.SingleSelection)
        table.verticalHeader().setVisible(False)
        table.horizontalHeader().setSectionResizeMode(QHeaderView.Stretch)
        table.setShowGrid(False)
        table.verticalHeader().setDefaultSectionSize(38)

    def _make_eced_page(self):
        page = QWidget()
        page.setAttribute(Qt.WA_StyledBackground, True)
        page.setObjectName("pageSurface")
        l = QVBoxLayout(page)
        l.setContentsMargins(0, 0, 0, 0)
        l.setSpacing(12)
        card = Card("e-ÇED canlı izleme", "Bilgisayar, hesap ve sayfa")
        filters = QHBoxLayout()
        self.eced_search = QLineEdit()
        self.eced_search.setPlaceholderText("Hesap, bilgisayar veya kullanıcı ara…")
        self.eced_search.textChanged.connect(self.refresh_table)
        filters.addWidget(self.eced_search, 1)
        refresh = QPushButton("Ağı yeniden denetle")
        refresh.setObjectName("secondary")
        refresh.setToolTip("Ortak klasördeki e-ÇED raporlarını, hesap rezervasyonlarını ve proje kayıtlarını hemen yeniden okur. Portal sekmesinin kendisini tarayıcı eklentisi izler.")
        refresh.clicked.connect(self.request_scan)
        self.scan_button = refresh
        filters.addWidget(refresh)
        card.layout_v.addLayout(filters)
        reserve_row = QHBoxLayout()
        self.reserve_account_combo = QComboBox()
        self.reserve_account_combo.addItem("Hesap seç…", "")
        for account in sorted({str(x).strip() for x in self.config.get("allowed_accounts", []) if str(x).strip()}, key=str.casefold):
            self.reserve_account_combo.addItem(account, account)
        self.reserve_account_combo.setMinimumWidth(260)
        self.reserve_account_combo.currentIndexChanged.connect(self._update_reservation_status)
        self.reserve_status_label = QLabel("Rezervasyon seçilmedi")
        self.reserve_status_label.setObjectName("muted")
        claim_btn = QPushButton("Rezervasyon al")
        claim_btn.setObjectName("secondary")
        claim_btn.clicked.connect(self.reserve_selected_account)
        release_btn = QPushButton("Rezervasyonu bırak")
        release_btn.setObjectName("secondary")
        release_btn.clicked.connect(self.release_selected_account)
        reserve_row.addWidget(self.reserve_account_combo)
        reserve_row.addWidget(claim_btn)
        reserve_row.addWidget(release_btn)
        reserve_row.addWidget(self.reserve_status_label, 1)
        card.layout_v.addLayout(reserve_row)
        self.eced_table = QTableWidget(0, 8)
        self.eced_table.setHorizontalHeaderLabels(["DURUM", "e-ÇED HESABI", "BİLGİSAYAR", "KULLANICI", "TARAYICI", "PORTAL BÖLÜMÜ", "SAYFA", "SON SİNYAL"])
        self._setup_table(self.eced_table)
        eced_header = self.eced_table.horizontalHeader()
        eced_header.setSectionResizeMode(QHeaderView.Interactive)
        eced_header.setStretchLastSection(False)
        eced_header.setMinimumSectionSize(90)
        for column, width in enumerate([135, 175, 150, 165, 105, 145, 260, 130]):
            self.eced_table.setColumnWidth(column, width)
        self.eced_table.setHorizontalScrollBarPolicy(Qt.ScrollBarAsNeeded)
        card.layout_v.addWidget(self.eced_table, 1)
        l.addWidget(card, 1)
        self.pages["e-ÇED Canlı"] = page
        self.stack.addWidget(page)

    def _make_petitions_page(self):
        page = QWidget()
        page.setAttribute(Qt.WA_StyledBackground, True)
        page.setObjectName("pageSurface")
        page_layout = QVBoxLayout(page)
        page_layout.setContentsMargins(0, 0, 0, 0)
        page_layout.setSpacing(0)

        scroll = QScrollArea()
        scroll.setObjectName("petitionDashboardScroll")
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.NoFrame)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarAsNeeded)
        body = QWidget()
        body.setObjectName("petitionDashboardContent")
        body_layout = QVBoxLayout(body)
        body_layout.setContentsMargins(2, 2, 8, 16)
        body_layout.setSpacing(12)
        scroll.setWidget(body)
        page_layout.addWidget(scroll, 1)

        # Dashboard hero: high-signal state first, with the rest of the page kept
        # in the existing ENÇEV Pulse teal/blue palette.
        hero = QFrame()
        hero.setObjectName("petitionHero")
        hero.setMinimumHeight(142)
        hero.setStyleSheet(
            ""
        )
        hero_layout = QHBoxLayout(hero)
        hero_layout.setContentsMargins(22, 18, 22, 18)
        hero_layout.setSpacing(18)
        hero_text = QVBoxLayout()
        hero_text.setSpacing(5)
        eyebrow = QLabel("ORTAK WORD DOSYASI  ·  ENCTAKİP UYUMLU")
        eyebrow.setStyleSheet("")
        hero_title = QLabel("Dilekçe çalışma alanı")
        hero_title.setStyleSheet("")
        hero_subtitle = QLabel("Dosyanın müsaitliğini, kullanan kişiyi ve sırayı tek ekrandan takip et.")
        hero_subtitle.setWordWrap(True)
        hero_subtitle.setStyleSheet("")
        hero_text.addWidget(eyebrow)
        hero_text.addWidget(hero_title)
        hero_text.addWidget(hero_subtitle)
        hero_text.addStretch(1)
        hero_layout.addLayout(hero_text, 1)

        status_panel = QFrame()
        status_panel.setStyleSheet("")
        status_layout = QVBoxLayout(status_panel)
        status_layout.setContentsMargins(16, 12, 16, 12)
        status_layout.setSpacing(7)
        status_caption = QLabel("CANLI DOSYA DURUMU")
        status_caption.setStyleSheet("")
        self.petition_big = QLabel("●  DURUM BEKLENİYOR")
        self.petition_big.setObjectName("petitionHeroStatus")
        self.petition_big.setAlignment(Qt.AlignLeft | Qt.AlignVCenter)
        self.petition_big.setStyleSheet("")
        self.petition_path_label = QLabel("Ortak Word dosyasının yolu henüz doğrulanmadı.")
        self.petition_path_label.setWordWrap(True)
        self.petition_path_label.setStyleSheet("")
        status_layout.addWidget(status_caption)
        status_layout.addWidget(self.petition_big)
        status_layout.addWidget(self.petition_path_label)
        hero_layout.addWidget(status_panel, 0)
        body_layout.addWidget(hero)

        # Compact status metrics — these update without rebuilding the page.
        metrics = QGridLayout()
        metrics.setContentsMargins(0, 0, 0, 0)
        metrics.setHorizontalSpacing(10)
        metrics.setVerticalSpacing(10)

        def metric_card(title: str, value: str, hint: str, accent: str):
            frame = QFrame()
            frame.setObjectName("petitionMetricCard")
            frame.setStyleSheet(
                ""
            )
            frame.setMinimumHeight(92)
            v = QVBoxLayout(frame)
            v.setContentsMargins(13, 10, 12, 10)
            v.setSpacing(3)
            title_label = QLabel(title.upper())
            title_label.setStyleSheet("")
            value_label = QLabel(value)
            value_label.setMinimumWidth(0)
            value_label.setWordWrap(True)
            value_label.setStyleSheet("")
            hint_label = QLabel(hint)
            hint_label.setWordWrap(True)
            hint_label.setStyleSheet("")
            v.addWidget(title_label)
            v.addWidget(value_label)
            v.addWidget(hint_label)
            return frame, value_label, hint_label

        metric_defs = [
            ("Dosya", "Doğrulanıyor…", "Word / ağ kilidi", "#1c9b76"),
            ("Kullanan kişi", "—", "Kişi ve bilgisayar", "#3986bd"),
            ("Bekleme sırası", "0 kişi", "Sırandaki konum", "#d99b35"),
            ("Çevrimiçi ekip", "0 kişi", "ENCTakip uyumlu", "#7467d8"),
        ]
        metric_attrs = ["petition_metric_status_value", "petition_metric_owner_value", "petition_metric_queue_value", "petition_metric_online_value"]
        for idx, (title, value, hint, accent) in enumerate(metric_defs):
            frame, value_label, hint_label = metric_card(title, value, hint, accent)
            setattr(self, metric_attrs[idx], value_label)
            metrics.addWidget(frame, 0, idx)
        body_layout.addLayout(metrics)

        actions_card = Card("Hızlı işlemler", "Kilit yalnızca Word dosyası kapatıldıktan sonra bırakılmalıdır.")
        action_row = QHBoxLayout()
        action_row.setSpacing(8)
        open_btn = QPushButton("Word dosyasını aç")
        open_btn.setObjectName("primary")
        open_btn.setMinimumHeight(42)
        open_btn.clicked.connect(self.open_petition)
        self.petition_open_button = open_btn
        close_btn = QPushButton("Kapattım · kilidi bırak")
        close_btn.setObjectName("secondary")
        close_btn.setMinimumHeight(42)
        close_btn.setEnabled(False)
        close_btn.clicked.connect(self.close_petition_session)
        self.petition_close_button = close_btn
        queue_btn = QPushButton("Müsait Olunca Haber Ver")
        queue_btn.setObjectName("queueAction")
        queue_btn.setMinimumHeight(42)
        queue_btn.clicked.connect(self.toggle_petition_queue)
        self.petition_queue_button = queue_btn
        history_btn = QPushButton("Erişim geçmişi")
        history_btn.setObjectName("secondary")
        history_btn.clicked.connect(self.open_petition_history)
        self.petition_history_button = history_btn
        backups_btn = QPushButton("Yedek geçmişi")
        backups_btn.setObjectName("secondary")
        backups_btn.clicked.connect(self.open_petition_backups)
        self.petition_backups_button = backups_btn
        path_btn = QPushButton("Dosya yolunu seç")
        path_btn.setObjectName("secondary")
        path_btn.clicked.connect(self.choose_petition)
        for button in (open_btn, close_btn, queue_btn, history_btn, backups_btn, path_btn):
            action_row.addWidget(button)
        actions_card.layout_v.addLayout(action_row)
        body_layout.addWidget(actions_card)

        info_grid = QGridLayout()
        info_grid.setContentsMargins(0, 0, 0, 0)
        info_grid.setHorizontalSpacing(12)
        info_grid.setVerticalSpacing(12)
        file_card = Card("Dosya ve kullanım bilgileri", "Kayıtlı kilit ile Word belgesinin gerçek durumu ayrı ayrı doğrulanır.")
        self.petition_details = QLabel("Son değişiklik: —")
        self.petition_details.setObjectName("petitionDetailText")
        self.petition_details.setWordWrap(True)
        self.petition_details.setStyleSheet("")
        self.petition_lock = QLabel("Kim açtı: — · Bilgisayar: — · Açılış: —")
        self.petition_lock.setWordWrap(True)
        self.petition_lock.setStyleSheet("")
        file_card.layout_v.addWidget(self.petition_lock)
        file_card.layout_v.addWidget(self.petition_details)

        details_grid = QGridLayout()
        details_grid.setHorizontalSpacing(18)
        details_grid.setVerticalSpacing(9)
        def detail_value(label_text: str, attr: str, row: int, col: int):
            cell = QVBoxLayout()
            cell.setSpacing(2)
            label = QLabel(label_text.upper())
            label.setStyleSheet("")
            value = QLabel("—")
            value.setWordWrap(True)
            value.setTextInteractionFlags(Qt.TextSelectableByMouse)
            value.setStyleSheet("")
            cell.addWidget(label)
            cell.addWidget(value)
            details_grid.addLayout(cell, row, col)
            setattr(self, attr, value)
        detail_value("Son değiştiren", "petition_last_editor_value", 0, 0)
        detail_value("Son kayıt zamanı", "petition_modified_value", 0, 1)
        detail_value("Açık kalma süresi", "petition_elapsed_value", 1, 0)
        detail_value("Dosya boyutu", "petition_size_value", 1, 1)
        file_card.layout_v.addLayout(details_grid)

        queue_card = Card("Sıra ve ekip", "Kimin beklediği ve hangi kullanıcıların Pulse / ENCTakip üzerinde aktif olduğu.")
        self.petition_queue_label = QLabel("Bekleme sırası: —")
        self.petition_queue_label.setObjectName("petitionQueueLabel")
        self.petition_queue_label.setWordWrap(True)
        self.petition_queue_label.setStyleSheet("")
        self.petition_users_label = QLabel("Çevrimiçi: —")
        self.petition_users_label.setObjectName("petitionUsersLabel")
        self.petition_users_label.setWordWrap(True)
        self.petition_users_label.setStyleSheet("")
        self.petition_activity_label = QLabel("Son hareketler: —")
        self.petition_activity_label.setWordWrap(True)
        self.petition_activity_label.setStyleSheet("")
        queue_card.layout_v.addWidget(self.petition_queue_label)
        queue_card.layout_v.addWidget(self.petition_users_label)
        queue_card.layout_v.addWidget(self.petition_activity_label, 1)
        info_grid.addWidget(file_card, 0, 0)
        info_grid.addWidget(queue_card, 0, 1)
        info_grid.setColumnStretch(0, 3)
        info_grid.setColumnStretch(1, 2)
        body_layout.addLayout(info_grid)

        template_card = Card("Word şablonundan yeni taslak", "Dolu örnek Word belgesinin arka planı, logosu, görselleri ve sayfa düzeni kopyalanır; ortak dosyanın üzerine yazılmaz.")
        self.petition_template_path_label = QLabel(str(self.config.get("petition_template_file", "") or "Şablon seçilmedi"))
        self.petition_template_path_label.setWordWrap(True)
        self.petition_template_path_label.setObjectName("muted")
        template_card.layout_v.addWidget(self.petition_template_path_label)
        template_buttons = QHBoxLayout()
        template_download_btn = QPushButton("Örnek Word şablonunu indir")
        template_download_btn.setObjectName("secondary")
        template_download_btn.clicked.connect(self.download_petition_template)
        template_choose_btn = QPushButton("Şablon dosyasını seç")
        template_choose_btn.setObjectName("secondary")
        template_choose_btn.clicked.connect(self.choose_petition_template)
        template_create_btn = QPushButton("Yeni dilekçe taslağı oluştur")
        template_create_btn.setObjectName("primary")
        template_create_btn.clicked.connect(self.create_petition_draft)
        template_buttons.addWidget(template_download_btn)
        template_buttons.addWidget(template_choose_btn)
        template_buttons.addWidget(template_create_btn)
        template_buttons.addStretch(1)
        template_card.layout_v.addLayout(template_buttons)
        body_layout.addWidget(template_card)
        body_layout.addStretch(1)

        # Scoped, theme-consistent button styling for this page, including the queue action.
        page.setStyleSheet(
            ""
        )
        self.pages["Dilekçeler"] = page
        self.stack.addWidget(page)

    def _make_messages_page(self):
        """Build a modern two-pane chat workspace; all content stays inside one glass shell."""
        page = QWidget()
        page.setAttribute(Qt.WA_StyledBackground, True)
        page.setObjectName("pageSurface")
        outer = QVBoxLayout(page)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.setSpacing(0)

        shell = QFrame()
        shell.setObjectName("chatShell")
        shell.setAttribute(Qt.WA_StyledBackground, True)
        shadow = QGraphicsDropShadowEffect(shell)
        shadow.setBlurRadius(28)
        shadow.setOffset(0, 8)
        shadow.setColor(QColor(0, 0, 0, 48))
        shell.setGraphicsEffect(shadow)
        shell_layout = QHBoxLayout(shell)
        shell_layout.setContentsMargins(0, 0, 0, 0)
        shell_layout.setSpacing(0)

        split = QSplitter(Qt.Horizontal)
        split.setObjectName("chatWorkspaceSplit")
        split.setChildrenCollapsible(False)
        split.setHandleWidth(1)

        contacts_panel = QFrame()
        contacts_panel.setObjectName("chatContactPane")
        contacts_panel.setMinimumWidth(255)
        contacts_panel.setMaximumWidth(370)
        contacts_layout = QVBoxLayout(contacts_panel)
        contacts_layout.setContentsMargins(16, 18, 12, 14)
        contacts_layout.setSpacing(12)

        contact_heading = QHBoxLayout()
        contact_title_block = QVBoxLayout()
        contact_title_block.setSpacing(2)
        contacts_title = QLabel("Sohbetler")
        contacts_title.setObjectName("sectionTitle")
        contacts_title.setStyleSheet("")
        contact_title_block.addWidget(contacts_title)
        contact_heading.addLayout(contact_title_block, 1)
        self.chat_contact_count = QLabel("0 kişi")
        self.chat_contact_count.setObjectName("chatCountPill")
        self.chat_contact_count.setStyleSheet("")
        contact_heading.addWidget(self.chat_contact_count, 0, Qt.AlignTop)
        contacts_layout.addLayout(contact_heading)

        self.chat_contact_search = QLineEdit()
        self.chat_contact_search.setPlaceholderText("Kişi veya sohbet ara…")
        self.chat_contact_search.setClearButtonEnabled(True)
        self.chat_contact_search.setMinimumHeight(42)
        self.chat_contact_search.textChanged.connect(self._filter_chat_contacts)
        contacts_layout.addWidget(self.chat_contact_search)

        self.chat_contacts = QListWidget()
        self.chat_contacts.setObjectName("chatContacts")
        self.chat_contacts.setMinimumWidth(225)
        self.chat_contacts.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        self.chat_contacts.setUniformItemSizes(False)
        self.chat_contacts.setVerticalScrollMode(QAbstractItemView.ScrollPerPixel)
        self.chat_contacts.currentItemChanged.connect(self._chat_contact_changed)
        contacts_layout.addWidget(self.chat_contacts, 1)

        split.addWidget(contacts_panel)

        chat_panel = QFrame()
        chat_panel.setObjectName("chatMainPane")
        chat_panel.setMinimumWidth(390)
        chat_layout = QVBoxLayout(chat_panel)
        chat_layout.setContentsMargins(0, 0, 0, 0)
        chat_layout.setSpacing(0)

        header = QFrame()
        header.setObjectName("chatHeader")
        header_layout = QHBoxLayout(header)
        header_layout.setContentsMargins(20, 16, 20, 16)
        header_layout.setSpacing(12)
        self.chat_header_avatar = QLabel("TE")
        self.chat_header_avatar.setObjectName("chatAvatar")
        self.chat_header_avatar.setFixedSize(46, 46)
        self.chat_header_avatar.setAlignment(Qt.AlignCenter)
        self.chat_header_avatar.setStyleSheet("")
        header_layout.addWidget(self.chat_header_avatar)
        header_text = QVBoxLayout()
        header_text.setSpacing(4)
        self.chat_header_name = QLabel("Tüm ekip")
        self.chat_header_name.setObjectName("chatHeaderName")
        self.chat_header_name.setWordWrap(True)
        self.chat_header_hint = QLabel("Ortak ağ sohbeti")
        self.chat_header_hint.setObjectName("chatHeaderHint")
        self.chat_header_hint.setWordWrap(True)
        header_text.addWidget(self.chat_header_name)
        header_text.addWidget(self.chat_header_hint)
        header_layout.addLayout(header_text, 1)

        self.messages_search = QLineEdit()
        self.messages_search.setPlaceholderText("Bu sohbette ara…")
        self.messages_search.setClearButtonEnabled(True)
        self.messages_search.setMinimumWidth(135)
        self.messages_search.setMaximumWidth(250)
        self.messages_search.textChanged.connect(lambda _text: self._refresh_messages(self.snapshot.get("messages", [])))
        header_layout.addWidget(self.messages_search, 0)
        self.chat_latest_btn = QPushButton("↓ Son mesaj")
        self.chat_latest_btn.setObjectName("secondary")
        self.chat_latest_btn.setToolTip("Sohbetin son mesajına git")
        self.chat_latest_btn.clicked.connect(lambda: self.messages_list.scrollToBottom() if hasattr(self, "messages_list") else None)
        header_layout.addWidget(self.chat_latest_btn, 0, Qt.AlignVCenter)
        # Kept as a compatibility member for older callbacks; profiles never open in a surprise modal.
        self.chat_profile_btn = QPushButton("Profil")
        self.chat_profile_btn.setVisible(False)
        self.chat_header_name.setCursor(Qt.ArrowCursor)
        self.chat_header_avatar.setCursor(Qt.ArrowCursor)
        chat_layout.addWidget(header)

        self.messages_list = ChatMessagesList()
        self.messages_list.setObjectName("chatMessages")
        self._last_chat_viewport_size = (0, 0)
        self._chat_reflow_timer = QTimer(self)
        self._chat_reflow_timer.setSingleShot(True)
        self._chat_reflow_timer.setInterval(180)
        self._chat_reflow_timer.timeout.connect(lambda: self._refresh_messages(self.snapshot.get("messages", [])))
        self.messages_list.viewportResized.connect(self._schedule_chat_reflow)
        self.messages_list.setSpacing(10)
        self.messages_list.setUniformItemSizes(False)
        self.messages_list.setVerticalScrollMode(QAbstractItemView.ScrollPerPixel)
        self.messages_list.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        self.messages_list.setSelectionMode(QAbstractItemView.NoSelection)
        self.messages_list.setFrameShape(QFrame.NoFrame)
        self.messages_list.setContextMenuPolicy(Qt.CustomContextMenu)
        self.messages_list.customContextMenuRequested.connect(self._show_message_context_menu)
        chat_layout.addWidget(self.messages_list, 1)

        composer = QFrame()
        composer.setObjectName("chatComposer")
        composer_layout = QVBoxLayout(composer)
        composer_layout.setContentsMargins(18, 12, 18, 14)
        composer_layout.setSpacing(8)
        self.chat_attachment_preview_scroll = QScrollArea()
        self.chat_attachment_preview_scroll.setWidgetResizable(True)
        self.chat_attachment_preview_scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarAsNeeded)
        self.chat_attachment_preview_scroll.setVerticalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        self.chat_attachment_preview_scroll.setFrameShape(QFrame.NoFrame)
        self.chat_attachment_preview_scroll.setFixedHeight(88)
        self.chat_attachment_preview_scroll.setStyleSheet("")
        self.chat_attachment_preview_surface = QWidget()
        self.chat_attachment_preview_surface.setObjectName("attachmentPreviewSurface")
        self.chat_attachment_preview_layout = QHBoxLayout(self.chat_attachment_preview_surface)
        self.chat_attachment_preview_layout.setContentsMargins(2, 2, 2, 2)
        self.chat_attachment_preview_layout.setSpacing(8)
        self.chat_attachment_preview_layout.addStretch(1)
        self.chat_attachment_preview_scroll.setWidget(self.chat_attachment_preview_surface)
        self.chat_attachment_preview_scroll.setVisible(False)
        composer_layout.addWidget(self.chat_attachment_preview_scroll)

        composer_tools = QHBoxLayout()
        composer_tools.setSpacing(8)
        self.chat_attach_btn = QPushButton("＋ Dosya ekle")
        self.chat_attach_btn.setObjectName("secondary")
        self.chat_attach_btn.setMinimumHeight(34)
        self.chat_attach_btn.setToolTip("Sohbete en fazla 10 görsel veya dosya ekle")
        self.chat_attach_btn.clicked.connect(self._select_chat_attachments)
        composer_tools.addWidget(self.chat_attach_btn)
        self.chat_emoji_btn = QPushButton("☺ Emoji")
        self.chat_emoji_btn.setObjectName("secondary")
        self.chat_emoji_btn.setMinimumHeight(34)
        self.chat_emoji_btn.setToolTip("Mesaja emoji ekle")
        self.chat_emoji_btn.clicked.connect(self._show_chat_emoji_menu)
        composer_tools.addWidget(self.chat_emoji_btn)
        self.chat_attachment_summary = QLabel("")
        self.chat_attachment_summary.setObjectName("muted")
        self.chat_attachment_summary.setMinimumWidth(0)
        self.chat_attachment_summary.setStyleSheet("")
        composer_tools.addWidget(self.chat_attachment_summary, 1)
        self.chat_clear_attachments_btn = QPushButton("Ekleri temizle")
        self.chat_clear_attachments_btn.setObjectName("danger")
        self.chat_clear_attachments_btn.setMinimumHeight(32)
        self.chat_clear_attachments_btn.setToolTip("Eklenen tüm dosyaları kaldır")
        self.chat_clear_attachments_btn.clicked.connect(self._clear_chat_attachments)
        self.chat_clear_attachments_btn.setEnabled(False)
        self.chat_clear_attachments_btn.setVisible(False)
        composer_tools.addWidget(self.chat_clear_attachments_btn)
        composer_layout.addLayout(composer_tools)

        composer_row = QHBoxLayout()
        composer_row.setSpacing(10)
        self.message_recipient = QComboBox()
        self.message_recipient.addItem("Tümü", "Tümü")
        self.message_recipient.setVisible(False)
        self.message_input = ChatComposer()
        self.message_input.setMinimumHeight(50)
        self.message_input.setMaximumHeight(122)
        self.message_input.sendRequested.connect(self.send_message)
        self.message_input.textChanged.connect(self._update_chat_send_enabled)
        self.message_input.setToolTip("Enter: gönder · Shift+Enter: yeni satır")
        self.chat_send_btn = QPushButton("Gönder  ➤")
        self.chat_send_btn.setObjectName("primary")
        self.chat_send_btn.setMinimumWidth(118)
        self.chat_send_btn.setMinimumHeight(50)
        self.chat_send_btn.clicked.connect(self.send_message)
        composer_row.addWidget(self.message_input, 1)
        composer_row.addWidget(self.chat_send_btn, 0, Qt.AlignBottom)
        composer_layout.addLayout(composer_row)
        self.chat_composer_hint = QLabel("Enter: gönder · Shift+Enter: yeni satır · En fazla 10 dosya")
        self.chat_composer_hint.setObjectName("chatComposerHint")
        self.chat_composer_hint.setVisible(False)
        self.message_input.setToolTip("Enter: gönder · Shift+Enter: yeni satır · En fazla 10 dosya")
        chat_layout.addWidget(composer)
        split.addWidget(chat_panel)
        split.setStretchFactor(0, 0)
        split.setStretchFactor(1, 1)
        split.setSizes([305, 975])
        shell_layout.addWidget(split, 1)
        outer.addWidget(shell, 1)

        self.pages["Mesajlar"] = page
        self.stack.addWidget(page)
        self._refresh_chat_contacts(self.workspace_profiles, self.snapshot.get("messages", []))
        self._update_chat_send_enabled()
        self._update_chat_attachment_summary()

    def _profile_for_username(self, username: str) -> dict[str, Any]:
        key = str(username or "").casefold()
        return next((dict(p) for p in self.workspace_profiles if str(p.get("username", "")).casefold() == key), {})

    def _avatar_label(self, display_name: str, profile: dict[str, Any] | None = None, size: int = 40) -> QLabel:
        profile = profile or {}
        label = QLabel(avatar_initials(display_name))
        label.setObjectName("chatAvatar")
        label.setFixedSize(size, size)
        label.setAlignment(Qt.AlignCenter)
        label.setStyleSheet("")
        avatar_file = Path(str(profile.get("avatar_file", ""))).name
        if avatar_file:
            try:
                image_path = Path(str(self.config.get("shared_root", ""))) / "workspace" / "avatars" / avatar_file
                pixmap = QPixmap(str(image_path))
                if not pixmap.isNull():
                    label.setPixmap(circular_avatar_pixmap(pixmap, size))
                    label.setText("")
            except Exception:
                pass
        return label

    def _queue_message_receipts(self, messages):
        """Acknowledge messages seen on the shared workspace; reading requires the chat to be open."""
        username = str(self.config.get("windows_user", "")).strip()
        computer = str(self.config.get("computer_name", "")).strip()
        if not username:
            return
        target = str(getattr(self, "chat_current_target", "Tümü") or "Tümü").casefold()
        chat_open = getattr(self, "current_page", "") == "Mesajlar"
        user_key = username.casefold()
        pc_key = computer.casefold()
        for msg in messages:
            if not isinstance(msg, dict) or msg.get("legacy_enctakip"):
                continue
            mid = str(msg.get("id", "")).strip()
            sender = str(msg.get("sender", "")).strip()
            recipient = str(msg.get("recipient", "Tümü")).strip().casefold()
            if not mid or sender.casefold() == user_key:
                continue
            group = recipient in {"tümü", "tumü", "all"}
            addressed = group or recipient in {user_key, pc_key}
            if not addressed:
                continue
            receipts = [r for r in msg.get("receipts", []) if isinstance(r, dict) and str(r.get("username", "")).casefold() == user_key]
            latest_receipt = receipts[0] if receipts else {}
            if not float(latest_receipt.get("delivered_at", 0) or 0):
                key = f"{mid}|{user_key}|delivered"
                if key not in self._queued_message_receipts:
                    self._queued_message_receipts.add(key)
                    self.worker.queue_message_receipt({"message_id": mid, "username": username, "status": "delivered"})
            open_target = target in {"tümü", "tumü", "all"} if group else target == sender.casefold()
            if chat_open and open_target and not float(latest_receipt.get("read_at", 0) or 0):
                key = f"{mid}|{user_key}|read"
                if key not in self._queued_message_receipts:
                    self._queued_message_receipts.add(key)
                    self.worker.queue_message_receipt({"message_id": mid, "username": username, "status": "read"})

    def _refresh_chat_contacts(self, profiles=None, messages=None):
        if not hasattr(self, "chat_contacts"):
            return
        profiles = list(profiles if profiles is not None else self.workspace_profiles)
        messages = list(messages if messages is not None else self.snapshot.get("messages", []))
        target = str(getattr(self, "chat_current_target", "Tümü") or "Tümü")
        current_user = str(self.config.get("windows_user", "")).strip()
        rows: dict[str, dict[str, Any]] = {}
        for profile in profiles:
            username = str(profile.get("username", "")).strip()
            if username and username.casefold() != current_user.casefold():
                rows[username.casefold()] = {"username": username, **profile}
        for msg in messages:
            sender = str(msg.get("sender", "")).strip()
            recipient = str(msg.get("recipient", "")).strip()
            if sender and sender.casefold() not in {current_user.casefold(), "tümü", "all"}:
                rows.setdefault(sender.casefold(), {"username": sender, "display_name": sender})
            if recipient and recipient.casefold() not in {current_user.casefold(), "tümü", "tumü", "all", str(self.config.get("computer_name", "")).casefold()}:
                rows.setdefault(recipient.casefold(), {"username": recipient, "display_name": recipient})
        # Derive unread counts from the shared read receipts; do not infer from message age.
        unread_counts: dict[str, int] = {"tümü": 0}
        current_user_key = current_user.casefold()
        current_pc_key = str(self.config.get("computer_name", "")).casefold()
        for msg in messages:
            if not isinstance(msg, dict) or msg.get("legacy_enctakip"):
                continue
            sender_key = str(msg.get("sender", "")).strip().casefold()
            recipient_key = str(msg.get("recipient", "Tümü")).strip().casefold()
            if not sender_key or sender_key == current_user_key:
                continue
            receipts = [r for r in (msg.get("receipts", []) or []) if isinstance(r, dict)
                        and str(r.get("username", "")).strip().casefold() == current_user_key]
            already_read = any(float(r.get("read_at", 0) or 0) > 0 for r in receipts)
            if already_read:
                continue
            if msg.get("legacy_room"):
                count_key = recipient_key
            elif recipient_key in {"tümü", "tumü", "all"}:
                count_key = "tümü"
            elif recipient_key in {current_user_key, current_pc_key}:
                count_key = sender_key
            else:
                continue
            unread_counts[count_key] = unread_counts.get(count_key, 0) + 1

        # Keep the active chat if it still exists; otherwise fall back to the group.
        valid_keys = {k for k in rows}
        if target.casefold() != "tümü" and target.casefold() not in valid_keys:
            target = "Tümü"
        self.chat_current_target = target
        self.chat_contacts.blockSignals(True)
        self.chat_contacts.clear()
        all_item = QListWidgetItem()
        all_item.setData(Qt.UserRole, "Tümü")
        all_item.setSizeHint(QSize(max(180, self.chat_contacts.viewport().width() - 8), 74))
        self.chat_contacts.addItem(all_item)
        all_row = QFrame()
        all_row.setObjectName("chatContactRow")
        # The visual row is decoration; let clicks pass through to QListWidget selection.
        all_row.setAttribute(Qt.WA_TransparentForMouseEvents, True)
        all_row.setProperty("active", target.casefold() == "tümü")
        all_layout = QHBoxLayout(all_row); all_layout.setContentsMargins(10, 8, 10, 8); all_layout.setSpacing(10)
        all_avatar = QLabel("👥"); all_avatar.setFixedSize(38, 38); all_avatar.setAlignment(Qt.AlignCenter); all_avatar.setStyleSheet("")
        all_layout.addWidget(all_avatar)
        all_text = QVBoxLayout(); all_text.setSpacing(3)
        group_name = QLabel("Tüm ekip"); group_name.setObjectName("chatContactName")
        group_preview = QLabel("Genel duyurular ve ekip sohbeti"); group_preview.setObjectName("chatContactPreview")
        all_text.addWidget(group_name); all_text.addWidget(group_preview); all_layout.addLayout(all_text, 1)
        group_unread = unread_counts.get("tümü", 0)
        if group_unread:
            unread_badge = QLabel(str(group_unread if group_unread < 100 else "99+"))
            unread_badge.setObjectName("chatUnreadBadge")
            unread_badge.setAlignment(Qt.AlignCenter)
            all_layout.addWidget(unread_badge, 0, Qt.AlignVCenter)
        self.chat_contacts.setItemWidget(all_item, all_row)
        by_latest: dict[str, dict[str, Any]] = {}
        current_lower = current_user.casefold()
        for msg in messages:
            sender = str(msg.get("sender", "")).strip()
            recipient = str(msg.get("recipient", "")).strip()
            if msg.get("legacy_room") or recipient.casefold() in {"enctakip · e-çed", "enctakip · dilekçeler"}:
                key = recipient.casefold()
            elif sender.casefold() == current_lower and recipient.casefold() != "tümü":
                key = recipient.casefold()
            elif recipient.casefold() == current_lower:
                key = sender.casefold()
            else:
                key = sender.casefold() if sender.casefold() != current_lower else recipient.casefold()
            if key and key not in {current_lower, "tümü", "tumü", "all"}:
                if key not in by_latest or float(msg.get("created_at", 0) or 0) > float(by_latest[key].get("created_at", 0) or 0):
                    by_latest[key] = msg
        ordered = sorted(
            rows.values(),
            key=lambda profile: (
                -float(by_latest.get(str(profile.get("username", "")).casefold(), {}).get("created_at", 0) or 0),
                str(profile.get("display_name") or profile.get("username", "")).casefold(),
            ),
        )
        for profile in ordered:
            username = str(profile.get("username", "")).strip()
            display = str(profile.get("display_name") or username)
            key = username.casefold()
            latest = by_latest.get(key, {})
            preview = str(latest.get("message", "")).strip()[:54]
            if not preview and latest.get("attachments"):
                preview = "📎 " + str(latest["attachments"][0].get("original_name", "Dosya eki"))[:46]
            if not preview:
                preview = "Mesaj göndermek için seç"
            item = QListWidgetItem()
            item.setData(Qt.UserRole, username)
            item.setSizeHint(QSize(max(180, self.chat_contacts.viewport().width() - 8), 74))
            self.chat_contacts.addItem(item)
            row = QFrame(); row.setObjectName("chatContactRow"); row.setProperty("active", key == target.casefold())
            # Avoid child labels swallowing clicks: selecting a person opens the conversation directly.
            row.setAttribute(Qt.WA_TransparentForMouseEvents, True)
            row_layout = QHBoxLayout(row); row_layout.setContentsMargins(10, 8, 10, 8); row_layout.setSpacing(10)
            avatar = self._avatar_label(display, profile, 38)
            avatar.setCursor(Qt.ArrowCursor)
            avatar.setToolTip("")
            row_layout.addWidget(avatar)
            texts = QVBoxLayout(); texts.setSpacing(3)
            online = key in getattr(self, "_online_users", set())
            short_name = display if len(display) <= 24 else display[:22].rstrip() + "…"
            name = QLabel(short_name); name.setObjectName("chatContactName")
            name.setStyleSheet("")
            name.setToolTip(("Çevrimiçi" if online else "Çevrimdışı") + f" · {display}")
            name.setCursor(Qt.ArrowCursor)
            name.setMinimumWidth(0)
            name.setSizePolicy(QSizePolicy.Ignored, QSizePolicy.Fixed)
            small = QLabel(preview); small.setObjectName("chatContactPreview"); small.setWordWrap(False); small.setToolTip(preview)
            small.setMinimumWidth(0)
            small.setSizePolicy(QSizePolicy.Ignored, QSizePolicy.Fixed)
            texts.addWidget(name); texts.addWidget(small); row_layout.addLayout(texts, 1)
            unread = unread_counts.get(key, 0)
            if unread:
                unread_badge = QLabel(str(unread if unread < 100 else "99+"))
                unread_badge.setObjectName("chatUnreadBadge")
                unread_badge.setAlignment(Qt.AlignCenter)
                unread_badge.setMinimumWidth(20)
                row_layout.addWidget(unread_badge, 0, Qt.AlignVCenter)
            self.chat_contacts.setItemWidget(item, row)
        selected_row = 0
        for index in range(self.chat_contacts.count()):
            item = self.chat_contacts.item(index)
            if str(item.data(Qt.UserRole) or "Tümü").casefold() == target.casefold():
                selected_row = index
                break
        self.chat_contacts.setCurrentRow(selected_row)
        self.chat_contacts.blockSignals(False)
        online_count = sum(1 for p in ordered if str(p.get("username", "")).casefold() in self._online_users)
        self.chat_contact_count.setText(f"{len(ordered)} kişi · {online_count} çevrimiçi")
        self._update_chat_header()
        self._filter_chat_contacts(self.chat_contact_search.text() if hasattr(self, "chat_contact_search") else "")

    def _filter_chat_contacts(self, text: str):
        if not hasattr(self, "chat_contacts"):
            return
        query = str(text or "").casefold().strip()
        for index in range(self.chat_contacts.count()):
            item = self.chat_contacts.item(index)
            row = self.chat_contacts.itemWidget(item)
            visible_text = " ".join(label.text() for label in row.findChildren(QLabel)) if row else ""
            item.setHidden(bool(query) and query not in visible_text.casefold())

    def _schedule_chat_reflow(self):
        if not hasattr(self, "messages_list") or not hasattr(self, "_chat_reflow_timer"):
            return
        viewport = self.messages_list.viewport()
        size = (viewport.width(), viewport.height())
        previous = getattr(self, "_last_chat_viewport_size", (0, 0))
        changed = abs(size[0] - previous[0]) >= 55 or abs(size[1] - previous[1]) >= 80
        self._last_chat_viewport_size = size
        if changed and str(getattr(self, "current_page", "")) == "Mesajlar":
            self._chat_reflow_timer.start()

    def _chat_contact_changed(self, current, _previous=None):
        if current is None:
            return
        target = str(current.data(Qt.UserRole) or "Tümü")
        self.chat_current_target = target
        if hasattr(self, "message_recipient"):
            idx = self.message_recipient.findData(target)
            if idx < 0:
                self.message_recipient.addItem(target, target)
                idx = self.message_recipient.findData(target)
            if idx >= 0:
                self.message_recipient.setCurrentIndex(idx)
        self._update_chat_header()
        self._paint_chat_contact_rows()
        self._refresh_messages(self.snapshot.get("messages", []))
        if getattr(self, "current_page", "") == "Mesajlar":
            self._queue_message_receipts(self.snapshot.get("messages", []))

    def _paint_chat_contact_rows(self):
        if not hasattr(self, "chat_contacts"):
            return
        for index in range(self.chat_contacts.count()):
            item = self.chat_contacts.item(index)
            row = self.chat_contacts.itemWidget(item)
            if row is not None:
                active = str(item.data(Qt.UserRole) or "Tümü").casefold() == str(self.chat_current_target).casefold()
                row.setProperty("active", active)
                row.style().unpolish(row); row.style().polish(row); row.update()

    def _update_chat_header(self):
        if not hasattr(self, "chat_header_name"):
            return
        target = str(getattr(self, "chat_current_target", "Tümü") or "Tümü")
        if target.casefold() == "tümü":
            self.chat_header_name.setText("Tüm ekip")
            self.chat_header_hint.setText(f"{len(self.workspace_profiles)} profil · ortak ağ sohbeti")
            self.chat_header_avatar.setPixmap(QPixmap()); self.chat_header_avatar.setText("👥")
            self.chat_profile_btn.setEnabled(False)
            self.chat_profile_btn.setVisible(False)
        else:
            profile = self._profile_for_username(target)
            display = str(profile.get("display_name") or target)
            self.chat_header_name.setText(display)
            presence = "Çevrimiçi" if target.casefold() in getattr(self, "_online_users", set()) else "Çevrimdışı"
            self.chat_header_hint.setText(f"{profile.get('job_title') or profile.get('role') or 'Ekip üyesi'} · {presence}")
            avatar = self._avatar_label(display, profile, 42)
            avatar_pixmap = avatar.pixmap()
            if avatar_pixmap is not None and not avatar_pixmap.isNull():
                self.chat_header_avatar.setPixmap(avatar_pixmap)
                self.chat_header_avatar.setText("")
            else:
                self.chat_header_avatar.setPixmap(QPixmap())
                self.chat_header_avatar.setText(avatar_initials(display))
            self.chat_profile_btn.setEnabled(False)
            self.chat_profile_btn.setVisible(False)

    def _show_chat_profile_for(self, username: str):
        """Open the existing team directory for explicit profile inspection; never show a surprise modal."""
        target = str(username or "").strip()
        if not target:
            return
        self.chat_current_target = target
        self.navigate("Ekibim")
        if hasattr(self, "team_search"):
            self.team_search.setText(target)
        self.status_label.setText("Profil ayrıntıları Ekibim ekranında gösteriliyor.")

    def _show_chat_profile(self):
        """Compatibility action: profile details are shown in Ekibim, not a separate popup."""
        target = str(getattr(self, "chat_current_target", "Tümü") or "Tümü")
        if target.casefold() == "tümü":
            self.status_label.setText("Kişi ayrıntılarını görmek için soldan bir ekip üyesi seç.")
            return
        self._show_chat_profile_for(target)

    def _make_notifications_page(self):
        page = QWidget()
        page.setAttribute(Qt.WA_StyledBackground, True)
        page.setObjectName("pageSurface")
        l = QVBoxLayout(page)
        l.setContentsMargins(0, 0, 0, 0)
        card = Card("Bildirimler", "Hesap çakışmaları, yeni mesajlar ve bağlantı")
        self.notifications_list = QListWidget()
        card.layout_v.addWidget(self.notifications_list, 1)
        row = QHBoxLayout()
        clear = QPushButton("Yerel bildirimleri temizle")
        clear.setObjectName("secondary")
        clear.clicked.connect(self.clear_notifications)
        row.addWidget(clear)
        row.addStretch(1)
        card.layout_v.addLayout(row)
        l.addWidget(card, 1)
        self.pages["Bildirimler"] = page
        self.stack.addWidget(page)

    def _make_settings_page(self):
        page = QWidget()
        page.setAttribute(Qt.WA_StyledBackground, True)
        page.setObjectName("pageSurface")
        l = QVBoxLayout(page)
        l.setContentsMargins(0, 0, 0, 0)
        l.setSpacing(12)
        settings_scroll = QScrollArea()
        settings_scroll.setObjectName("settingsScroll")
        settings_scroll.setWidgetResizable(True)
        settings_scroll.setFrameShape(QFrame.NoFrame)
        settings_scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarAsNeeded)
        settings_scroll.setVerticalScrollBarPolicy(Qt.ScrollBarAsNeeded)
        settings_content = QWidget()
        settings_content.setObjectName("settingsContent")
        settings_content.setStyleSheet("")
        settings_root = QVBoxLayout(settings_content)
        settings_root.setContentsMargins(2, 2, 7, 8)
        settings_root.setSpacing(12)
        settings_card = Card("Bağlantı ve takip ayarları", "Bu bilgisayarda kaydedilir")
        form = QFormLayout()
        self.theme_mode_combo = QComboBox()
        self.theme_mode_combo.addItem("Koyu · Stitch / Workspace", "dark_velvet")
        self.theme_mode_combo.addItem("Açık · Workspace", "light_sage")
        theme_index = self.theme_mode_combo.findData(str(self.config.get("theme", "dark_velvet")))
        self.theme_mode_combo.setCurrentIndex(theme_index if theme_index >= 0 else 0)
        form.addRow("Arayüz teması", self.theme_mode_combo)
        self.shared_path_edit = QLineEdit(str(self.config.get("shared_root", DEFAULT_SHARED_ROOT)))
        form.addRow("Ortak izleme klasörü", self.shared_path_edit)
        self.documents_path_edit = QLineEdit(str(self.config.get("documents_root") or r"\\192.168.1.55\Genel Evrak"))
        documents_row = QHBoxLayout()
        documents_row.addWidget(self.documents_path_edit, 1)
        documents_browse = QPushButton("Klasör seç")
        documents_browse.setObjectName("secondary")
        documents_browse.clicked.connect(self.choose_documents_root)
        documents_row.addWidget(documents_browse)
        form.addRow("Belgeler / Drive kök klasörü", documents_row)
        self.portal_url_edit = QLineEdit(str(self.config.get("portal_url", "")))
        self.portal_url_edit.setPlaceholderText("https://portal-adresi/…")
        form.addRow("e-ÇED adresi", self.portal_url_edit)
        self.petition_file_edit = QLineEdit(str(self.config.get("petition_file", "")))
        petition_row = QHBoxLayout()
        petition_row.addWidget(self.petition_file_edit, 1)
        browse = QPushButton("Seç")
        browse.setObjectName("secondary")
        browse.clicked.connect(self.choose_petition)
        petition_row.addWidget(browse)
        form.addRow("Dilekçe dosyası", petition_row)
        self.interval_spin = QSpinBox()
        self.interval_spin.setRange(10, 120)
        self.interval_spin.setSuffix(" sn")
        self.interval_spin.setValue(int(self.config.get("scan_interval_sec", 15)))
        form.addRow("Ağ tarama aralığı", self.interval_spin)
        self.stale_spin = QSpinBox()
        self.stale_spin.setRange(30, 600)
        self.stale_spin.setSuffix(" sn")
        self.stale_spin.setValue(int(self.config.get("stale_after_sec", 60)))
        form.addRow("Sinyal zaman aşımı", self.stale_spin)
        self.allowed_edit = QTextEdit()
        self.allowed_edit.setPlaceholderText("İsteğe bağlı: izin verilen e-ÇED hesap adları/e-postaları, her satıra bir tane. Boş bırakılırsa liste kontrolü yapılmaz.")
        self.allowed_edit.setPlainText("\n".join(str(x) for x in self.config.get("allowed_accounts", [])))
        self.allowed_edit.setMaximumHeight(100)
        form.addRow("İzin verilen hesaplar", self.allowed_edit)
        self.forget_account_edit = QLineEdit()
        self.forget_account_edit.setPlaceholderText("Listede takılı kalan hesabı yaz (örn. burak@encev)")
        forget_row = QHBoxLayout()
        forget_row.addWidget(self.forget_account_edit, 1)
        forget_btn = QPushButton("Hesabı listeden kaldır")
        forget_btn.setObjectName("danger")
        forget_btn.clicked.connect(self.remove_saved_account)
        forget_row.addWidget(forget_btn)
        form.addRow("Hesap temizliği", forget_row)
        roles_hint = QLabel("Proje yetkisi Ekibim > Kişi ekle / rol düzenle bölümündeki ortak profile bağlıdır. İlk kurulum yöneticisi: burak. Yerel ayarlardan kendine yönetici yetkisi verilemez.")
        roles_hint.setWordWrap(True)
        roles_hint.setObjectName("muted")
        form.addRow("Rol yetkileri", roles_hint)
        settings_card.layout_v.addLayout(form)
        save_btn = QPushButton("Ayarları kaydet")
        save_btn.setObjectName("primary")
        save_btn.clicked.connect(self.save_settings)
        settings_card.layout_v.addWidget(save_btn, 0, Qt.AlignLeft)
        settings_root.addWidget(settings_card)
        pairing = Card("Tarayıcı eklentisi bağlantısı", "Her bilgisayarda ayrı anahtar")
        pairing_info = QLabel("Eklentiyi kalıcı PULSE klasöründen yükle. Her masaüstü güncellemesinden sonra Chrome/Edge uzantılar sayfasında Yenile düğmesine basıp e-ÇED sekmesini yenile. Parola ve çerez okunmaz.")
        pairing_info.setWordWrap(True)
        pairing_info.setObjectName("muted")
        pairing.layout_v.addWidget(pairing_info)
        token_row = QHBoxLayout()
        self.token_label = QLineEdit(str(self.config.get("pair_token", "")))
        self.token_label.setReadOnly(True)
        copy_btn = QPushButton("Anahtarı kopyala")
        copy_btn.setObjectName("secondary")
        copy_btn.clicked.connect(lambda: QApplication.clipboard().setText(self.token_label.text()))
        token_row.addWidget(self.token_label, 1)
        token_row.addWidget(copy_btn)
        pairing.layout_v.addLayout(token_row)
        self.collector_label = QLabel(self.collector_text)
        self.collector_label.setWordWrap(True)
        self.collector_label.setObjectName("muted")
        pairing.layout_v.addWidget(self.collector_label)
        ext_path = QLabel(f"Eklenti klasörü: {APP_DIR / 'browser_extension'}")
        ext_path.setWordWrap(True)
        ext_path.setObjectName("muted")
        pairing.layout_v.addWidget(ext_path)
        ext_help_btn = QPushButton("Eklenti klasörünü ve güncelleme sayfasını aç")
        ext_help_btn.setObjectName("secondary")
        ext_help_btn.setToolTip("İlk geçişte kalıcı klasörü seçin; sonraki sürümlerde eklenti için Yenile düğmesini kullanın.")
        ext_help_btn.clicked.connect(self.open_extension_setup_helper)
        pairing.layout_v.addWidget(ext_help_btn, 0, Qt.AlignLeft)
        autostart_row = QHBoxLayout()
        install_auto = QPushButton("Windows başlangıcına ekle")
        install_auto.setObjectName("secondary")
        install_auto.clicked.connect(self.install_autostart)
        remove_auto = QPushButton("Otomatik başlatmayı kaldır")
        remove_auto.setObjectName("secondary")
        remove_auto.clicked.connect(self.remove_autostart)
        autostart_row.addWidget(install_auto)
        autostart_row.addWidget(remove_auto)
        autostart_row.addStretch(1)
        pairing.layout_v.addLayout(autostart_row)
        settings_root.addWidget(pairing)
        settings_root.addStretch(1)
        settings_scroll.setWidget(settings_content)
        l.addWidget(settings_scroll, 1)
        self.pages["Ayarlar"] = page
        self.stack.addWidget(page)

    def _install_stitch_screens(self):
        """Install Stitch's actual HTML layouts inside the existing main window.

        The views are pages in the same root stack; they do not create a second window.
        Existing native pages remain intact and can be opened from the Stitch navigation.
        """
        self._stitch_enabled = False
        self.stitch_views = {}
        self._stitch_channels = []
        self._stitch_ready = set()
        self._stitch_error = ""
        if not STITCH_WEBENGINE_AVAILABLE:
            self._stitch_error = "Qt WebEngine bulunamadı. PySide6 kurulumunu onararak tekrar başlat."
            return
        asset_dir = APP_DIR / "assets"
        route_files = {
            "Genel Bakış": asset_dir / "stitch_overview.html",
            "Görevler & Süreç": asset_dir / "stitch_tasks.html",
        }
        missing = [str(path) for path in route_files.values() if not path.is_file()]
        if missing:
            self._stitch_error = "Stitch arayüz dosyaları bulunamadı: " + ", ".join(missing)
            return
        for route, path in route_files.items():
            view = QWebEngineView(self.window_stack)
            view.setObjectName("stitch" + ("Overview" if route == "Genel Bakış" else "TaskBoard"))
            view.setMinimumSize(0, 0)
            if QWebEngineSettings is not None:
                settings = view.settings()
                settings.setAttribute(QWebEngineSettings.JavascriptEnabled, True)
                settings.setAttribute(QWebEngineSettings.LocalContentCanAccessRemoteUrls, True)
                settings.setAttribute(QWebEngineSettings.LocalContentCanAccessFileUrls, True)
                settings.setAttribute(QWebEngineSettings.ScrollAnimatorEnabled, True)
            view.setStyleSheet("")
            channel = QWebChannel(view.page())
            bridge = StitchWebBridge(self, route, view)
            channel.registerObject("pulseHost", bridge)
            view.page().setWebChannel(channel)
            view.loadFinished.connect(lambda ok, r=route: self._stitch_page_loaded(r, ok))
            self.stitch_views[route] = view
            self._stitch_channels.append((channel, bridge))
            self.window_stack.addWidget(view)
            view.load(QUrl.fromLocalFile(str(path.resolve())))
        self._stitch_enabled = True

    def _stitch_page_loaded(self, route: str, ok: bool):
        if not ok:
            self._stitch_error = f"Stitch ekranı yüklenemedi: {route}"
            self.status_label.setText(self._stitch_error)
            return
        self._stitch_ready.add(route)
        self._push_stitch_data(route)

    def _stitch_payload(self) -> dict[str, Any]:
        projects = [dict(p) for p in getattr(self, "workspace_projects", []) if isinstance(p, dict)]
        profiles = [dict(p) for p in getattr(self, "workspace_profiles", []) if isinstance(p, dict)]
        current_user = str(self.config.get("windows_user") or os.environ.get("USERNAME") or "Kullanıcı")
        profile_map = {str(p.get("username", "")).casefold(): p for p in profiles if p.get("username")}
        all_tasks: list[dict[str, Any]] = []
        today = datetime.now().date()
        for project in projects:
            if project.get("archived"):
                continue
            tasks = project.get("tasks", [])
            if not isinstance(tasks, list):
                continue
            project_id = str(project.get("id", ""))
            try:
                project_revision = int(project.get("revision", 1) or 1)
            except (TypeError, ValueError):
                project_revision = 1
            project_stamp = project.get("updated_at")
            try:
                project_updated_text = datetime.fromtimestamp(float(project_stamp)).strftime("%d.%m.%Y %H:%M") if project_stamp else ""
            except (TypeError, ValueError, OSError, OverflowError):
                project_updated_text = ""
            for task in tasks:
                if not isinstance(task, dict) or not str(task.get("title", "")).strip():
                    continue
                assignee = str(task.get("assignee", "")).strip()
                assignee_profile = profile_map.get(assignee.casefold(), {})
                assignee_display = str(assignee_profile.get("display_name") or assignee or "Atanmamış")
                due_date = str(task.get("due_date", "") or "").strip()
                due_date_sort = None
                overdue = False
                days_until = None
                parsed_date = None
                for fmt in ("%d.%m.%Y", "%d/%m/%Y", "%Y-%m-%d"):
                    try:
                        parsed_date = datetime.strptime(due_date, fmt).date()
                        break
                    except (TypeError, ValueError):
                        continue
                if parsed_date:
                    due_date_sort = parsed_date.isoformat()
                    days_until = (parsed_date - today).days
                    overdue = parsed_date < today and str(task.get("status", "")) != "Tamamlandı"
                status = str(task.get("status", "Planlandı") or "Planlandı")
                lowered = status.casefold()
                board_status = "done" if lowered == "tamamlandı" else ("in-progress" if lowered == "devam ediyor" else ("review" if lowered in {"bekliyor", "revizyonda"} else "todo"))
                try:
                    estimate = round(float(task.get("estimate_hours", 0) or 0), 1)
                except (TypeError, ValueError):
                    estimate = 0.0
                all_tasks.append({
                    "id": str(task.get("id", "")), "projectId": project_id, "projectRevision": project_revision,
                    "projectCode": str(project.get("code", "")), "projectName": str(project.get("name", "")),
                    "projectStatus": str(project.get("status", "")), "projectStage": str(project.get("stage", "")),
                    "title": str(task.get("title", "")), "assignee": assignee, "assigneeDisplay": assignee_display,
                    "priority": str(task.get("priority", "Normal") or "Normal"), "status": status,
                    "boardStatus": board_status, "dueDate": due_date, "dueDateSort": due_date_sort,
                    "daysUntil": days_until, "overdue": overdue, "estimateHours": estimate,
                    "note": str(task.get("note", "") or ""), "updatedAtText": project_updated_text,
                    "lead": str(project.get("lead", "")), "team": list(project.get("team", []) or []),
                    "archived": False,
                })
        tasks_done = sum(1 for task in all_tasks if task.get("status") == "Tamamlandı")
        active_projects = [p for p in projects if not p.get("archived") and p.get("status") != "Tamamlandı"]
        summary = getattr(self, "_current_summary", {}) or {}
        petition = self.snapshot.get("petition", {}) or {}
        events = []
        for event in list(getattr(self, "workspace_events", []) or [])[:100]:
            if isinstance(event, dict):
                events.append({"id": str(event.get("id", "")), "at": event.get("at", 0), "actor": str(event.get("actor", "")), "kind": str(event.get("kind", "")), "detail": str(event.get("detail", "")), "projectId": str(event.get("project_id", ""))})
        return {
            "themeMode": str(getattr(self, "_stitch_theme_mode", "dark")),
            "currentUser": current_user,
            "computerName": str(self.config.get("computer_name") or socket.gethostname()),
            "profiles": profiles,
            "projects": projects,
            "tasks": all_tasks,
            "events": events,
            "summary": {
                "networkOk": bool(self.snapshot.get("network_ok")),
                "networkError": str(self.snapshot.get("network_error", "")),
                "activeAccounts": int(summary.get("active_accounts", 0) or 0),
                "conflicts": len(summary.get("conflicts", []) or []),
                "trackedComputers": int(summary.get("tracked_computers", 0) or 0),
                "notifications": len(getattr(self, "notifications", []) or []),
                "openProjects": len(active_projects),
                "allProjects": len([p for p in projects if not p.get("archived")]),
                "openTasks": len(all_tasks) - tasks_done,
                "totalTasks": len(all_tasks),
                "completedTasks": tasks_done,
                "overdueTasks": sum(1 for t in all_tasks if t.get("overdue")),
                "dueThisWeek": sum(1 for t in all_tasks if t.get("daysUntil") is not None and 0 <= t.get("daysUntil") <= 7 and t.get("status") != "Tamamlandı"),
                "waitingOpinions": sum(1 for p in active_projects for o in (p.get("institution_opinions", []) or []) if isinstance(o, dict) and o.get("status") == "Bekliyor"),
                "networkOk": bool(self.snapshot.get("network_ok")),
                "petitionStatus": str(petition.get("status", "Durum bilinmiyor") or "Durum bilinmiyor"),
                "petitionOwner": str(petition.get("owner", "") or ""),
                "petitionExists": bool(petition.get("exists")),
                "workspaceOk": bool((self.snapshot.get("workspace", {}) or {}).get("workspace_ok", True)),
            }
        }

    def _push_stitch_data(self, route: str | None = None):
        if not getattr(self, "_stitch_enabled", False):
            return
        try:
            payload = json.dumps(self._stitch_payload(), ensure_ascii=False, separators=(",", ":"))
            # Escape JavaScript line separators and close-tag sequences before inserting JSON into JS source.
            payload = payload.replace("</", "<\\/").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
        except Exception as exc:
            self.status_label.setText(f"Stitch verileri hazırlanamadı: {str(exc)[:120]}")
            return
        targets = [route] if route else list(self.stitch_views)
        script = f"if (window.pulseSetData) window.pulseSetData({payload});"
        for key in targets:
            view = self.stitch_views.get(key)
            if view is not None and key in self._stitch_ready:
                view.page().runJavaScript(script)

    def _stitch_set_theme(self, mode: str):
        if str(mode or "dark").strip().lower() not in {"dark", "light"}:
            return
        self._apply_theme(str(mode).strip().lower(), persist=True, push_web=True)

    def _stitch_navigate(self, route: str):
        path = str(route or "").strip().casefold()
        mapping = {
            "genel-bakis": "Genel Bakış", "gorevler-ve-surec": "Görevler & Süreç",
            "takvim-ve-yasal-surecler": "Takvim & Yasal Süreç", "projeler": "Projeler",
            "analiz-ve-telemetri": "e-ÇED Canlı", "ekip-ve-is-yuku": "Ekibim",
            "dilekce-ve-e-ced-kilit": "Dilekçeler", "ayarlar": "Ayarlar",
            "bildirimler": "Bildirimler", "mesajlar": "Mesajlar", "kurum-rehberi": "Kurum Rehberi", "notlarim": "Notlarım", "belgeler": "Belgeler", "eced-canli": "e-ÇED Canlı",
        }
        target = mapping.get(path)
        if target:
            self.navigate(target)

    def _stitch_create_project(self):
        # The existing project dialog and validation remain the source of truth.
        self.create_project_dialog()

    def _stitch_create_task(self, seed_title: str = "", seed_note: str = ""):
        projects = [p for p in self.workspace_projects if isinstance(p, dict) and not p.get("archived")]
        if not projects:
            QMessageBox.information(self, "Yeni görev", "Önce Projeler bölümünden bir proje oluşturmalısın.")
            self.navigate("Projeler")
            return
        if not self._is_workspace_admin():
            QMessageBox.warning(self, "Yetki gerekli", "Yeni görev eklemek veya görev tanımını değiştirmek için çalışma alanı yöneticisi yetkisi gerekir. Atandığın mevcut görevlerin durumunu ve notunu görev kartından değiştirebilirsin.")
            return
        dialog = QDialog(self)
        dialog.setWindowTitle("Yeni görev oluştur")
        dialog.setMinimumWidth(520)
        layout = QVBoxLayout(dialog)
        form = QFormLayout(); form.setSpacing(10)
        project_combo = QComboBox()
        for project in sorted(projects, key=lambda p: (str(p.get("code", "")), str(p.get("name", "")))):
            project_combo.addItem(f"{project.get('code','')} · {project.get('name','')}", str(project.get("id", "")))
        title_edit = QLineEdit(); title_edit.setPlaceholderText("Görev adı"); title_edit.setText(str(seed_title or "")[:100])
        assignee_combo = QComboBox(); assignee_combo.addItem("Atama yok", "")
        profile_names = []
        for profile in self.workspace_profiles:
            username = str(profile.get("username", "")).strip()
            if not username: continue
            display = str(profile.get("display_name") or username)
            assignee_combo.addItem(f"{display} ({username})", username)
            profile_names.append(username)
        priority_combo = QComboBox()
        for priority in TASK_PRIORITIES: priority_combo.addItem(priority)
        status_combo = QComboBox()
        for status in TASK_STATUSES: status_combo.addItem(status)
        due_edit = QLineEdit(); due_edit.setPlaceholderText("GG.AA.YYYY (isteğe bağlı)")
        hours_edit = QDoubleSpinBox(); hours_edit.setRange(0, 500); hours_edit.setDecimals(1); hours_edit.setSuffix(" saat")
        note_edit = QTextEdit(); note_edit.setPlaceholderText("Kısa takip notu (isteğe bağlı)"); note_edit.setMaximumHeight(150); note_edit.setPlainText(str(seed_note or "")[:4000])
        form.addRow("Proje", project_combo); form.addRow("Görev adı", title_edit); form.addRow("Sorumlu", assignee_combo); form.addRow("Öncelik", priority_combo); form.addRow("Durum", status_combo); form.addRow("Teslim tarihi", due_edit); form.addRow("Tahmini süre", hours_edit); form.addRow("Not", note_edit)
        layout.addLayout(form)
        buttons = QDialogButtonBox(QDialogButtonBox.Save | QDialogButtonBox.Cancel)
        buttons.button(QDialogButtonBox.Save).setText("Görevi ekle"); buttons.button(QDialogButtonBox.Cancel).setText("İptal")
        buttons.accepted.connect(dialog.accept); buttons.rejected.connect(dialog.reject); layout.addWidget(buttons)
        if dialog.exec() != QDialog.Accepted: return
        title = title_edit.text().strip()
        if not title:
            QMessageBox.warning(self, "Eksik bilgi", "Görev adı boş bırakılamaz."); return
        project_id = str(project_combo.currentData() or "")
        project = next((p for p in projects if str(p.get("id", "")) == project_id), None)
        if not project: return
        tasks = [dict(t) for t in project.get("tasks", []) if isinstance(t, dict)]
        task = {"id": uuid.uuid4().hex, "title": title, "assignee": str(assignee_combo.currentData() or ""), "priority": str(priority_combo.currentText()), "status": str(status_combo.currentText()), "estimate_hours": float(hours_edit.value()), "due_date": due_edit.text().strip(), "note": note_edit.toPlainText().strip()}
        tasks.append(task)
        self.worker.queue_workspace("project_update", {"id": project_id, "changes": {"tasks": tasks}, "expected_revision": int(project.get("revision", 1) or 1)})
        self.status_label.setText("Yeni görev ortak çalışma alanına kaydediliyor…")

    def _stitch_update_task(self, payload_json: str):
        try:
            payload = json.loads(str(payload_json or "{}"))
            project_id = str(payload.get("projectId", "")); task_id = str(payload.get("taskId", ""))
            project = next((p for p in self.workspace_projects if str(p.get("id", "")) == project_id), None)
            if not project: raise ValueError("Proje kaydı bulunamadı. Verileri yenileyip tekrar dene.")
            tasks = [dict(t) for t in project.get("tasks", []) if isinstance(t, dict)]
            target = next((t for t in tasks if str(t.get("id", "")) == task_id), None)
            if not target: raise ValueError("Görev kaydı bulunamadı. Pano yenilenecek.")
            allowed = {"Planlandı", "Devam ediyor", "Bekliyor", "Revizyonda", "Tamamlandı"}
            if "status" in payload:
                status = str(payload.get("status", ""))
                if status not in allowed: raise ValueError("Geçersiz görev durumu.")
                target["status"] = status
            if "note" in payload:
                target["note"] = str(payload.get("note", ""))[:500]
            changes = {"tasks": tasks}
            self.worker.queue_workspace("project_update", {"id": project_id, "changes": changes, "expected_revision": int(project.get("revision", 1) or 1)})
            self.status_label.setText("Görev güncellemesi ortak alana kaydediliyor…")
        except Exception as exc:
            QMessageBox.warning(self, "Görev güncellenemedi", str(exc)[:300])
            self._push_stitch_data()

    def _stitch_handle_task_result(self, title: str, ok: bool, message: str):
        if title not in {"Proje", "Çalışma alanı"}:
            return
        if getattr(self, "_stitch_enabled", False):
            payload = json.dumps({"ok": bool(ok), "message": str(message)[:240]}, ensure_ascii=False).replace("</", "<\\/")
            toast_text = ("✓ " if ok else "⚠ ") + str(message)[:240]
            script = f"if(window.pulseToast)window.pulseToast({json.dumps(toast_text, ensure_ascii=False)});"
            for view in getattr(self, "stitch_views", {}).values():
                if view is not None:
                    view.page().runJavaScript(script)

    def navigate(self, name: str):
        if name in {"Genel Bakış", "Görevler & Süreç"} and getattr(self, "_stitch_enabled", False):
            self.current_page = name
            route = "Genel Bakış" if name == "Genel Bakış" else "Görevler & Süreç"
            view = self.stitch_views.get(route)
            if view is not None:
                self.window_stack.setCurrentWidget(view)
                for key, button in self.nav_buttons.items():
                    button.setProperty("active", key == name)
                    button.style().unpolish(button); button.style().polish(button)
                self._push_stitch_data()
            return
        if name == "Görevler & Süreç" and not getattr(self, "_stitch_enabled", False):
            QMessageBox.warning(self, "Stitch arayüzü", getattr(self, "_stitch_error", "Stitch arayüzü kullanılamıyor."))
            name = "Projeler"
        if name not in self.pages:
            return
        self.current_page = name
        if getattr(self, "window_stack", None) is not None and getattr(self, "native_root", None) is not None:
            self.window_stack.setCurrentWidget(self.native_root)
        if hasattr(self, "page_header"):
            self.page_header.setVisible(name != "Genel Bakış")
        if name == "Genel Bakış" and hasattr(self, "_refresh_dashboard_projects"):
            self._refresh_dashboard_projects()
        if name == "Bildirimler" and hasattr(self, "notifications_list"):
            self.notifications_list.clear()
            for stamp, title, detail in self.notifications:
                try:
                    when = datetime.fromtimestamp(float(stamp)).strftime("%d.%m.%Y %H:%M:%S")
                except (ValueError, TypeError, OSError, OverflowError):
                    when = ""
                self.notifications_list.addItem(QListWidgetItem(f"{when}  ·  {title}\n{detail}"))
        if name == "Mesajlar":
            self.unread_messages = 0
            self._update_messages_badge()
            QTimer.singleShot(0, lambda: self._queue_message_receipts(self.snapshot.get("messages", [])))
            QTimer.singleShot(100, self._schedule_chat_reflow)
        self.page_title.setText("Ana Sayfa" if name == "Genel Bakış" else ("Sohbet" if name == "Mesajlar" else name))
        self.page_hint.setText("")
        self.page_hint.setVisible(False)
        self.stack.setCurrentWidget(self.pages[name])
        # Use an opaque immediate switch: opacity effects on a transparent QStackedWidget
        # caused the previous page to ghost through on some Windows graphics drivers.
        for k, b in self.nav_buttons.items():
            b.setProperty("active", k == name)
            b.style().unpolish(b)
            b.style().polish(b)
        if name == "e-ÇED Canlı":
            self.refresh_table()
        elif name == "Genel Bakış":
            summary = getattr(self, "_current_summary", None)
            if summary is not None:
                self._show_dashboard_events(summary)
        # Keep navigation responsive: entering one workspace screen must not rebuild
        # projects, team and private notes together. In particular, the projects page
        # contains the institution-opinion grid and should not wait for unrelated notes.
        if name in {"Projeler", "Ekibim", "Kurum Rehberi", "Notlarım", "Genel Bakış"}:
            self.refresh_active_workspace_page()

    def _update_messages_badge(self):
        btn = self.nav_buttons.get("Mesajlar") if hasattr(self, "nav_buttons") else None
        if btn:
            btn.setText(f"◉  Sohbet  · {self.unread_messages}" if self.unread_messages else "◉  Sohbet")

    def check_workspace_reminders(self):
        """Check cached in-memory data once per minute; performs no network I/O."""
        today = datetime.now().strftime("%Y-%m-%d")
        for note in self.notes_store.list()[:500]:
            if note.get("status") != "Açık" or not note.get("due_date") or str(note.get("due_date")) > today:
                continue
            key = f"note:{note.get('id')}:{today}"
            if key not in self._notified_reminders:
                self._notified_reminders.add(key)
                self.add_notification("Not hatırlatma", f"{note.get('title', 'Not')} · Tarih: {format_date_tr(note.get('due_date'))}")
        for project in self.workspace_projects[:1000]:
            if project.get("archived") or project.get("status") == "Tamamlandı" or not project.get("due_date") or str(project.get("due_date")) > today:
                continue
            key = f"project:{project.get('id')}:{today}"
            if key not in self._notified_reminders:
                self._notified_reminders.add(key)
                self.add_notification("Proje teslim hatırlatma", f"{project.get('name')} · {project.get('code')} · Hedef tarih: {format_date_tr(project.get('due_date'))}")
            for task in project.get("tasks", [])[:200]:
                if task.get("status") == "Tamamlandı" or not task.get("due_date") or str(task.get("due_date")) > today:
                    continue
                task_key = f"task:{task.get('id')}:{today}"
                if task_key not in self._notified_reminders:
                    self._notified_reminders.add(task_key)
                    self.add_notification("Görev hatırlatma", f"{project.get('name')} · {project.get('code')} · {task.get('title')} · Sorumlu: {task.get('assignee') or 'Atanmadı'} · Hedef: {format_date_tr(task.get('due_date'))}")

    def update_clock(self):
        now = datetime.now()
        self.clock_label.setText(now.strftime("%d.%m.%Y  %H:%M:%S"))
        if hasattr(self, "toolbar_clock"):
            self.toolbar_clock.setText(now.strftime("%H:%M"))

    def set_collector_status(self, text: str):
        self.collector_text = text
        if hasattr(self, "collector_label"):
            self.collector_label.setText(text)

    def apply_snapshot(self, snapshot: dict[str, Any]):
        self.snapshot = snapshot
        if getattr(self, "_scan_in_progress", False):
            self._scan_in_progress = False
            recovery_timer = getattr(self, "_scan_recovery_timer", None)
            if recovery_timer is not None:
                recovery_timer.stop()
            if hasattr(self, "scan_button"):
                self.scan_button.setEnabled(True)
                self.scan_button.setText("Ağı yeniden denetle")
        ok = bool(snapshot.get("network_ok"))
        if ok:
            self.network_pill.setText("AĞ BAĞLI")
            self.network_pill.setProperty("state", "success")
            self.network_pill.style().unpolish(self.network_pill); self.network_pill.style().polish(self.network_pill)
            self.status_label.setText(f"Son ağ taraması {fmt_time(snapshot.get('collected_at'))} · {len(snapshot.get('reports', []))} tarayıcı raporu")
        else:
            self.network_pill.setText("AĞ ERİŞİLEMİYOR")
            self.network_pill.setProperty("state", "error")
            self.network_pill.style().unpolish(self.network_pill); self.network_pill.style().polish(self.network_pill)
            self.status_label.setText("Ağ paylaşımı yanıt vermiyor; önceki raporlar güncel kabul edilmiyor.")
            if getattr(self, "_last_net_error_notified", None) != snapshot.get("network_error"):
                self._last_net_error_notified = snapshot.get("network_error")
                self.add_notification("Ağ erişimi", str(snapshot.get("network_error", "Ağ bağlantısı yok")))
        summary = classify_reports(snapshot.get("reports", []), snapshot.get("agents", []), int(self.config.get("stale_after_sec", 60)), self.config.get("allowed_accounts", []))
        if not ok:
            # Never present cached network data as currently active when SMB cannot be checked.
            for row in summary["reports"]:
                row["fresh"] = False
                row["status"] = "Ağ doğrulanamadı"
            for row in summary["agents"]:
                row["fresh"] = False
            summary["conflicts"] = []
            summary["active_accounts"] = 0
            summary["tracked_computers"] = 0
        self._current_summary = summary
        self._online_users = {str(a.get("windows_user", "")).strip().casefold() for a in summary.get("agents", []) if a.get("fresh") and str(a.get("windows_user", "")).strip()}
        fresh_people = sum(1 for a in summary.get("agents", []) if a.get("fresh"))
        self.metric_accounts.set_data(str(summary["active_accounts"]), f"Güncel hesap gözlemi · {fresh_people} cihaz sinyali")
        self.metric_computers.set_data(str(sum(1 for x in summary["agents"] if x.get("fresh"))), "Pulse bağlantısı güncel olan")
        self.metric_conflicts.set_data(str(len(summary["conflicts"])), "Aynı hesap farklı bilgisayarlarda" if not summary["conflicts"] else "Kontrol gerekli")
        petition = snapshot.get("petition", {}) or {}
        petition_state = str(petition.get("status", "DURUM BEKLENİYOR") or "DURUM BEKLENİYOR")
        petition_owner = str(petition.get("owner", "") or "").strip()
        petition_note = (f"Kullanan: {petition_owner}" if petition_owner else ("Ortak Word dosyası mevcut" if petition.get("exists") else "Dosya yolu/erişim kontrol edilmeli"))
        self.metric_petition.set_data(petition_state, petition_note)
        self._notify_petition_queue_from_snapshot(petition)
        # Only paint the currently visible live-data page. The previous code rebuilt
        # the dashboard and e-ÇED QTableWidget on every poll, twice per poll in some paths,
        # even while the user was editing a project or chat message.
        self._refresh_petition(petition)
        messages = snapshot.get("messages", [])
        msg_signature = tuple((str(m.get("id", "")), float(m.get("created_at", 0) or 0), str(m.get("recipient", "")), str(m.get("message", "")), repr(m.get("attachments", [])), repr(m.get("reactions", [])), repr(m.get("receipts", []))) for m in messages[:200])
        if msg_signature != self._messages_signature:
            self._messages_signature = msg_signature
            self._refresh_messages(messages)
        workspace = snapshot.get("workspace", {}) or {}
        self._refresh_recipients(snapshot.get("agents", []), workspace.get("profiles", []))
        self._refresh_reservation_accounts(snapshot.get("claims", []), summary)
        if hasattr(self, "metric_projects"):
            project_rows_for_count = [p for p in (workspace.get("projects", []) or []) if isinstance(p, dict) and not p.get("archived")]
            self.metric_projects.set_data(str(len(project_rows_for_count)), "Kayıtlı proje")
            self.metric_opinions.set_data(str(workspace.get("waiting_opinions", 0)), "Yanıtı beklenen görüş")
            self.metric_revisions.set_data(str(workspace.get("revision_projects", 0)), "Revizyon durumundaki proje")
            self.metric_risks.set_data(str(workspace.get("risk_projects", 0)), "Kontrol gerektiren proje")
        new_projects = [p for p in (workspace.get("projects", []) or []) if isinstance(p, dict)]
        new_profiles = [p for p in (workspace.get("profiles", []) or []) if isinstance(p, dict)]
        new_contacts = [c for c in (workspace.get("contacts", []) or []) if isinstance(c, dict)]

        # Project content changes are independent of presence/profile heartbeats.
        # Stable JSON signatures catch edited tasks/opinions too, rather than only stage/status.
        project_signature = tuple((
            str(p.get("id", "")), int(p.get("revision", 1) or 1),
            float(p.get("updated_at", 0) or 0), str(p.get("code", "")),
            str(p.get("name", "")), str(p.get("status", "")), str(p.get("stage", "")),
        ) for p in new_projects)
        profile_signature = tuple((
            str(p.get("username", "")).casefold(), str(p.get("display_name", "")),
            str(p.get("job_title", "")), str(p.get("role", "")), str(p.get("email", "")),
            str(p.get("phone", "")), tuple(str(x) for x in (p.get("expertise", []) or []) if str(x).strip()),
            str(p.get("availability", "")),
            str(p.get("username", "")).casefold() in self._online_users,
        ) for p in new_profiles)
        # Contacts have no heartbeat; sign only fields that affect the address book.
        contacts_signature = tuple((
            str(c.get("id", "")), float(c.get("updated_at", 0) or 0),
            str(c.get("institution", "")), str(c.get("expert_name", "")),
            tuple(str(x) for x in (c.get("phones", []) or [])),
            tuple(str(x) for x in (c.get("emails", []) or [])),
            tuple(str(x.get("id", "")) for x in (c.get("projects", []) or []) if isinstance(x, dict)),
        ) for c in new_contacts)
        projects_changed = project_signature != self._project_signature
        profiles_changed = profile_signature != self._profile_signature
        contacts_changed = contacts_signature != self._contacts_signature
        if projects_changed:
            # This is an autocomplete cache, not a complete institution inventory.
            # Keep GUI-thread work bounded; each project's saved rows remain available
            # in full and can be typed into the editable institution field.
            known = set()
            examined = 0
            for project in new_projects[:100]:
                opinions = project.get("institution_opinions", [])
                if not isinstance(opinions, list):
                    continue
                for opinion in opinions[:30]:
                    examined += 1
                    if isinstance(opinion, dict):
                        name = str(opinion.get("institution", "")).strip()
                        if name:
                            known.add(name)
                    if len(known) >= 100 or examined >= 2500:
                        break
                if len(known) >= 100 or examined >= 2500:
                    break
            self._institution_name_cache = sorted(known, key=str.casefold)[:100]
        self._project_signature = project_signature
        self._profile_signature = profile_signature
        self._contacts_signature = contacts_signature
        self._workspace_signature = (project_signature, profile_signature, contacts_signature)

        self.workspace_projects = new_projects
        self.workspace_profiles = new_profiles
        if hasattr(self, "calendar_widget") and projects_changed:
            self._refresh_calendar_events()
        if hasattr(self, "documents_path_edit") and not getattr(self, "_documents_initial_scan_done", False):
            self._documents_initial_scan_done = True
            self.scan_documents_directory()
        if hasattr(self, "_refresh_dashboard_projects") and str(getattr(self, "current_page", "")) == "Genel Bakış":
            self._refresh_dashboard_projects()
        self.workspace_contacts = new_contacts
        prepared_contact_index = workspace.get("contact_index")
        self.workspace_contact_index = prepared_contact_index if isinstance(prepared_contact_index, list) else None
        self.workspace_events = list(workspace.get("workspace_events", []))

        chat_contact_signature = (profile_signature, tuple(sorted(self._online_users)), tuple((
            str(m.get("id", "")), float(m.get("created_at", 0) or 0), str(m.get("sender", "")),
            str(m.get("recipient", "")), str(m.get("message", "")), len(m.get("attachments", []) or []),
            repr(m.get("receipts", []))
        ) for m in snapshot.get("messages", [])[:200]))
        if chat_contact_signature != self._chat_contacts_signature:
            self._chat_contacts_signature = chat_contact_signature
            self._refresh_chat_contacts(new_profiles, snapshot.get("messages", []))

        # Refresh only the table that consumes changed data. Do not repaint the
        # 6-column address book on unrelated profile heartbeats or project counters.
        self._queue_message_receipts(snapshot.get("messages", []))
        event_rows = self.workspace_events
        if not self._workspace_events_bootstrapped:
            self._seen_workspace_event_ids.update(str(e.get("id", "")) for e in event_rows if e.get("id"))
            self._workspace_events_bootstrapped = True
        else:
            current_user = str(self.config.get("windows_user", "")).casefold()
            for record in reversed(event_rows):
                event_id = str(record.get("id", ""))
                if not event_id or event_id in self._seen_workspace_event_ids:
                    continue
                self._seen_workspace_event_ids.add(event_id)
                if str(record.get("actor", "")).casefold() != current_user:
                    self.add_notification(str(record.get("kind", "Proje hareketi")), str(record.get("detail", "")))
            if len(self._seen_workspace_event_ids) > 2000:
                self._seen_workspace_event_ids = set(str(e.get("id", "")) for e in event_rows if e.get("id"))
        if not workspace.get("workspace_ok", True) and workspace.get("workspace_error"):
            self.status_label.setText("Proje alanı erişilemiyor: " + str(workspace.get("workspace_error"))[:120])
        page = str(getattr(self, "current_page", ""))
        if page == "Genel Bakış":
            self._show_dashboard_events(summary)
        elif page == "e-ÇED Canlı":
            self.refresh_table()
        self._push_stitch_data()
        if hasattr(self, "project_table"):
            page = str(getattr(self, "current_page", ""))
            should_refresh_visible = (
                (page == "Projeler" and (projects_changed or profiles_changed))
                or (page == "Ekibim" and (projects_changed or profiles_changed))
                or (page == "Kurum Rehberi" and contacts_changed)
                or (page == "Genel Bakış" and projects_changed)
            )
            if should_refresh_visible:
                if getattr(self, "_project_editor_active", False):
                    self._workspace_refresh_pending = True
                else:
                    self.refresh_active_workspace_page()

    def _display_rows(self, summary):
        rows = [dict(r) for r in summary["reports"]]
        fresh_report_computers = {str(r.get("computer", "")).casefold() for r in rows if r.get("fresh")}
        for agent in summary.get("agents", []):
            pc = str(agent.get("computer", ""))
            if agent.get("fresh") and pc and pc.casefold() not in fresh_report_computers:
                rows.append({
                    "computer": pc, "windows_user": agent.get("windows_user", "—"),
                    "browser": "—", "account_name": "", "active_ui_tab": "",
                    "tab_title": "", "page_path": "", "last_seen": agent.get("last_seen", 0),
                    "fresh": True, "status": "Eklenti/portal verisi yok", "not_allowed": False,
                    "placeholder": True,
                })
        rows.sort(key=lambda r: (not r.get("fresh"), bool(r.get("placeholder")), not bool(r.get("account_name")), -float(r.get("last_seen", 0) or 0)))
        return rows

    def _eced_status_display(self, row: dict[str, Any]) -> tuple[str, str]:
        """UI-only interpretation: green only with an explicit recent logged-out signal."""
        if not self.snapshot.get("network_ok"):
            return "● Ağ doğrulanamadı", theme_color(self._stitch_theme_mode, "dim")
        if row.get("placeholder"):
            return ("● Eklenti bekleniyor", theme_color(self._stitch_theme_mode, "warning")) if row.get("fresh") else ("● Sinyal yok", theme_color(self._stitch_theme_mode, "dim"))
        if not row.get("fresh"):
            return "● Sinyal eski", theme_color(self._stitch_theme_mode, "dim")
        account = str(row.get("account_name", "")).strip()
        claim = self._claim_status(account) if account else None
        if claim:
            return "● Kullanımda / rezerve", theme_color(self._stitch_theme_mode, "green")
        session_state = str(row.get("session_state", "unknown")).casefold()
        if session_state == "logged_out":
            return "● Oturum kapalı", theme_color(self._stitch_theme_mode, "red")
        if session_state == "active":
            return "● Kullanımda", theme_color(self._stitch_theme_mode, "green")
        return "● Durum belirsiz", theme_color(self._stitch_theme_mode, "warning")

    def _show_dashboard_events(self, summary):
        if not hasattr(self, "dashboard_table") or str(getattr(self, "current_page", "")) != "Genel Bakış":
            return
        # Dashboard rows come from actual saved observations. A configured allow-list
        # or synthetic EN-ÇEV account must never become a fake/sticky row.
        fixed_accounts = [
            str(row.get("account_name", ""))
            for row in (self.snapshot.get("seen_accounts", []) or [])
            if isinstance(row, dict) and str(row.get("account_name", "")).strip()
        ]
        accounts = unique_account_status_rows(
            summary, fixed_accounts, self.snapshot.get("claims", []), bool(self.snapshot.get("network_ok"))
        )
        all_accounts = accounts
        page_size = max(1, int(getattr(self, "_dashboard_account_page_size", 100)))
        page_count = max(1, (len(all_accounts) + page_size - 1) // page_size)
        self._dashboard_account_page = max(0, min(page_count - 1, int(getattr(self, "_dashboard_account_page", 0))))
        page_start = self._dashboard_account_page * page_size
        visible_accounts = all_accounts[page_start:page_start + page_size]
        self._dashboard_accounts_total = len(all_accounts)
        events = []
        if summary.get("conflicts"):
            for conflict in summary["conflicts"]:
                events.append(("⚠", str(conflict["account"]), "Birden fazla bilgisayarda"))
        for row in accounts:
            if row.get("status_code") == "busy":
                report = row.get("latest_report", {})
                computer = str(report.get("computer", "") or "")
                events.append(("●", row["account_name"], f"{computer or 'Aktif oturum'} · Kullanımda"))
        for stamp, title, detail in getattr(self, "notifications", [])[:6]:
            try:
                timestamp = datetime.fromtimestamp(float(stamp)).strftime("%H:%M")
            except (TypeError, ValueError, OSError, OverflowError):
                timestamp = ""
            events.append(("•", str(title), (f"{timestamp} · " if timestamp else "") + str(detail)[:115]))
        if not events:
            events.append(("○", "Henüz yeni hareket yok", "Sistem ve ekip bildirimleri geldiğinde burada görünür."))
        events = events[:8]
        signature = (
            self._dashboard_account_page,
            tuple((str(a.get("account_name", "")), str(a.get("status_code", "unknown")),
                   str(a.get("status_label", "")), str(a.get("windows_user", "—")),
                   str((a.get("latest_report") or {}).get("computer", "")) if isinstance(a.get("latest_report"), dict) else "")
                  for a in visible_accounts),
            tuple(events),
            tuple((round(float(stamp), 1), str(title), str(detail)[:115]) for stamp, title, detail in getattr(self, "notifications", [])[:6]),
        )
        if signature == getattr(self, "_dashboard_render_signature", None):
            self._update_dashboard_account_pager(page_start, len(visible_accounts), len(all_accounts), page_count)
            return
        self._dashboard_render_signature = signature

        table = self.dashboard_table
        old_signals = table.blockSignals(True)
        old_updates = table.updatesEnabled()
        table.setUpdatesEnabled(False)
        try:
            table.clearContents()
            table.clearSpans()
            table.setRowCount(max(1, len(visible_accounts)))
            if not visible_accounts:
                msg = QTableWidgetItem("Henüz kaydedilmiş hesap gözlemi yok.")
                msg.setForeground(QColor(theme_color(self._stitch_theme_mode, "dim")))
                table.setItem(0, 1, msg)
                table.setSpan(0, 1, 1, 2)
            else:
                palette = {"busy": "#12A36F", "idle": "#E54858", "unknown": "#D99A18"}
                for row_index, account in enumerate(visible_accounts):
                    status_code = str(account.get("status_code", "unknown"))
                    label = str(account.get("status_label") or {
                        "busy": "Kullanımda", "idle": "Kapalı / sinyal yok", "unknown": "Durum belirsiz"
                    }.get(status_code, "Durum belirsiz"))
                    color = palette.get(status_code, palette["unknown"])
                    indicator_cell = QWidget(table)
                    indicator_layout = QHBoxLayout(indicator_cell)
                    indicator_layout.setContentsMargins(0, 0, 0, 0)
                    indicator_layout.setAlignment(Qt.AlignCenter)
                    indicator = QFrame(indicator_cell)
                    indicator.setFixedSize(12, 12)
                    indicator.setToolTip(label)
                    indicator.setStyleSheet("")
                    indicator_cell.setToolTip(label)
                    indicator_cell.setProperty("statusCode", status_code)
                    indicator_layout.addWidget(indicator)
                    name = QTableWidgetItem(str(account["account_name"]))
                    name.setToolTip(f"{account['account_name']} · {label}")
                    user = QTableWidgetItem(str(account.get("windows_user") or "—"))
                    user.setToolTip(f"Kullanıcı: {user.text()} · {label}")
                    if status_code == "unknown":
                        name.setForeground(QColor(theme_color(self._stitch_theme_mode, "warning")))
                        user.setForeground(QColor(theme_color(self._stitch_theme_mode, "warning")))
                    table.setCellWidget(row_index, 0, indicator_cell)
                    table.setItem(row_index, 1, name)
                    table.setItem(row_index, 2, user)
        finally:
            table.setUpdatesEnabled(old_updates)
            table.blockSignals(old_signals)
            table.viewport().update()

        self._update_dashboard_account_pager(page_start, len(visible_accounts), len(all_accounts), page_count)
        event_list = getattr(self, "event_list", None)
        if event_list is not None:
            event_list.setUpdatesEnabled(False)
            try:
                event_list.clear()
                for icon, head, sub in events:
                    event_list.addItem(QListWidgetItem(f"{icon}  {head}\n      {sub}"))
            finally:
                event_list.setUpdatesEnabled(True)

    def _update_dashboard_account_pager(self, start: int, visible_count: int, total: int, page_count: int):
        label = getattr(self, "dashboard_account_page_label", None)
        if label is not None:
            left = start + 1 if visible_count else 0
            right = start + visible_count
            label.setText(f"{left}–{right} / {total} hesap · Sayfa {self._dashboard_account_page + 1}/{page_count}")
        prev = getattr(self, "dashboard_account_prev", None)
        nxt = getattr(self, "dashboard_account_next", None)
        if prev is not None:
            prev.setEnabled(self._dashboard_account_page > 0)
        if nxt is not None:
            nxt.setEnabled(self._dashboard_account_page + 1 < page_count)

    def _change_dashboard_account_page(self, delta: int):
        size = max(1, int(getattr(self, "_dashboard_account_page_size", 100)))
        total = max(0, int(getattr(self, "_dashboard_accounts_total", 0)))
        page_count = max(1, (total + size - 1) // size)
        self._dashboard_account_page = max(0, min(page_count - 1, int(getattr(self, "_dashboard_account_page", 0)) + int(delta)))
        summary = getattr(self, "_current_summary", None)
        if summary is not None and str(getattr(self, "current_page", "")) == "Genel Bakış":
            self._show_dashboard_events(summary)

    def refresh_table(self, *_):
        # This table is expensive to rebuild (multiple cells per computer/account).
        # Do not rebuild it while the user is on projects, chat, settings or dashboard.
        if not hasattr(self, "eced_table") or str(getattr(self, "current_page", "")) != "e-ÇED Canlı":
            return
        summary = getattr(self, "_current_summary", None) or classify_reports(
            self.snapshot.get("reports", []), self.snapshot.get("agents", []),
            int(self.config.get("stale_after_sec", 60)), self.config.get("allowed_accounts", [])
        )
        query = self.eced_search.text().strip().casefold() if hasattr(self, "eced_search") else ""
        filtered = []
        for row in self._display_rows(summary):
            hay = " ".join(str(row.get(k, "")) for k in (
                "account_name", "computer", "windows_user", "browser", "active_ui_tab", "tab_title", "origin"
            )).casefold()
            if query and query not in hay:
                continue
            status, status_color = self._eced_status_display(row)
            if row.get("not_allowed"):
                status, status_color = "● İzin listesi dışı", theme_color(self._stitch_theme_mode, "red")
            vals = [status, row.get("account_name") or "Hesap doğrulanamadı", row.get("computer", "—"),
                    row.get("windows_user", "—"), row.get("browser", "—"), row.get("active_ui_tab") or "—",
                    f"{row.get('tab_title','—')} · {row.get('page_path', '')}", fmt_age(row.get("last_seen"))]
            filtered.append((row, vals, status_color))

        # Age is the only field expected to change between otherwise identical polls.
        # Update that column in place, not all QTableWidgetItems and tooltips.
        content_signature = tuple(tuple(str(v) for v in vals[:-1]) for _row, vals, _color in filtered)
        if content_signature == getattr(self, "_eced_table_render_signature", None):
            if filtered and self.eced_table.rowCount() == len(filtered):
                for row_index, (_row, vals, _color) in enumerate(filtered):
                    age_item = self.eced_table.item(row_index, 7)
                    age_text = str(vals[7])
                    if age_item is not None and age_item.text() != age_text:
                        age_item.setText(age_text)
            return

        table = self.eced_table
        old_signals = table.blockSignals(True)
        old_updates = table.updatesEnabled()
        old_sorting = table.isSortingEnabled()
        table.setUpdatesEnabled(False)
        table.setSortingEnabled(False)
        try:
            table.clearContents()
            table.clearSpans()
            table.setRowCount(len(filtered) if filtered else 1)
            if not filtered:
                item = QTableWidgetItem("Henüz tarayıcı raporu yok. Her bilgisayarda Pulse ve eklenti çalışmalı.")
                table.setItem(0, 0, item)
                table.setSpan(0, 0, 1, 8)
            for row_index, (row, vals, status_color) in enumerate(filtered):
                for col_index, value in enumerate(vals):
                    item = QTableWidgetItem(str(value))
                    item.setToolTip(str(value))
                    if col_index == 0:
                        item.setForeground(QColor(status_color))
                    elif not row.get("fresh"):
                        item.setForeground(QColor("#8893a5"))
                    elif row.get("not_allowed"):
                        item.setForeground(QColor("#bd3c4d"))
                    table.setItem(row_index, col_index, item)
        finally:
            table.setSortingEnabled(old_sorting)
            table.setUpdatesEnabled(old_updates)
            table.blockSignals(old_signals)
            table.viewport().update()
        self._eced_table_render_signature = content_signature
        if hasattr(self, "metric_conflicts"):
            self.metric_conflicts.set_data(
                str(len(summary["conflicts"])),
                "Aynı hesap farklı bilgisayarlarda" if not summary["conflicts"] else "Kontrol gerekli"
            )

    @staticmethod
    def _petition_metric_presentation(p: dict[str, Any]) -> tuple[str, str]:
        """Short tile label plus truthful context, avoiding long labels overflowing the tile."""
        p = p if isinstance(p, dict) else {}
        code = str(p.get("status_code", "unknown") or "unknown")
        owner = str(p.get("owner", "") or "").strip()
        source = str(p.get("owner_source", "") or "").strip()
        detail = str(p.get("status_detail", "") or p.get("error", "") or "").strip()
        if code == "ours":
            return "SİZDE AÇIK", "Ortak Word dosyası açık"
        if code in {"busy", "busy_unknown"}:
            return "KULLANIMDA", (f"Kullanan: {owner}" if owner else "Açık dosya kilidi gözlendi") + (f" · {source}" if source and owner else "")
        if code == "available":
            return "MÜSAİT", "Ortak Word dosyası açık değil"
        if code == "missing":
            return "ERİŞİM YOK", detail or "Dosya yolu / ağ izni kontrol edilmeli"
        if code == "unconfigured":
            return "AYAR GEREKLİ", detail or "Ortak dilekçe dosyası ayarlanmalı"
        if code == "unknown":
            return "KONTROL", (f"Kullanıcı: {owner}" if owner else detail or "Durum güvenle doğrulanamadı")
        state = str(p.get("status", "DURUM BEKLENİYOR") or "DURUM BEKLENİYOR")
        return (state[:18], owner or detail or "Durum kontrol ediliyor")

    def _refresh_petition(self, p):
        if not hasattr(self, "petition_big"):
            return
        p = p if isinstance(p, dict) else {}
        state = str(p.get("status", "DURUM DOĞRULANAMADI") or "DURUM DOĞRULANAMADI")
        state_code = str(p.get("status_code", "unknown") or "unknown")
        if hasattr(self, "metric_petition"):
            metric_value, metric_note = self._petition_metric_presentation(p)
            self.metric_petition.set_data(metric_value, metric_note)
        self.petition_big.setText("●  " + state)
        petition_state = "success" if state_code == "available" else ("error" if state_code in {"busy", "busy_unknown", "missing"} else ("warning" if state_code in {"unknown", "unconfigured"} else "neutral"))
        self.petition_big.setProperty("state", petition_state)
        self.petition_big.style().unpolish(self.petition_big); self.petition_big.style().polish(self.petition_big)
        owner = str(p.get("owner", "") or "").strip()
        computer = str(p.get("computer", "") or "").strip()
        opened = str(p.get("opened_at", "") or "").strip()
        elapsed = str(p.get("elapsed_text", "") or "").strip()
        queue_users = p.get("queue_users", []) if isinstance(p.get("queue_users", []), list) else []
        online = p.get("online_users", []) if isinstance(p.get("online_users", []), list) else []
        backups = p.get("backups", []) if isinstance(p.get("backups", []), list) else []
        queue_position = int(p.get("queue_position", 0) or 0)
        status_detail = str(p.get("status_detail", "") or p.get("error", "") or "").strip()

        if hasattr(self, "dashboard_petition_status"):
            self.dashboard_petition_status.setProperty("state", petition_state)
            self.dashboard_petition_status.style().unpolish(self.dashboard_petition_status); self.dashboard_petition_status.style().polish(self.dashboard_petition_status)
            self.dashboard_petition_status.setText(state)
            self.dashboard_petition_status.setToolTip(status_detail or state)
            if state_code in {"ours", "busy", "busy_unknown", "unknown"} and owner:
                who = " · ".join(x for x in (owner, computer) if x)
                opened_part = f" · Açılış: {opened}" if opened else ""
                detail_line = f"Kullanan: {who}{opened_part}"
            elif state_code in {"available", "missing", "unconfigured"}:
                detail_line = "Dosya şu anda açık görünmüyor." if state_code == "available" else status_detail or "Ortak dosya ayarı gerekli."
            else:
                detail_line = status_detail or "Kullanıcı bilgisi doğrulanamadı."
            if hasattr(self, "dashboard_petition_owner"):
                source = str(p.get("owner_source", "") or "")
                self.dashboard_petition_owner.setText(detail_line + (f" · Kaynak: {source}" if source and owner else ""))
                self.dashboard_petition_owner.setToolTip(status_detail or detail_line)

        if hasattr(self, "petition_metric_status_value"):
            self.petition_metric_status_value.setText(state)
            self.petition_metric_status_value.setProperty("state", petition_state)
            self.petition_metric_status_value.style().unpolish(self.petition_metric_status_value); self.petition_metric_status_value.style().polish(self.petition_metric_status_value)
            self.petition_metric_status_value.setStyleSheet("")
        if hasattr(self, "petition_metric_owner_value"):
            self.petition_metric_owner_value.setText(owner or ("—" if state_code in {"available", "missing", "unconfigured"} else "Bilgi okunamadı"))
        if hasattr(self, "petition_metric_queue_value"):
            self.petition_metric_queue_value.setText(f"{len(queue_users)} kişi" + (f" · sıra {queue_position}" if queue_position else ""))
        if hasattr(self, "petition_metric_online_value"):
            self.petition_metric_online_value.setText(f"{len(online)} kişi")

        self.petition_path_label.setText(str(p.get("path", "") or "Ortak Word dosyası seçilmedi."))
        if p.get("exists"):
            try:
                modified_stamp = datetime.fromtimestamp(float(p.get("modified"))).strftime("%d.%m.%Y %H:%M:%S")
            except (TypeError, ValueError, OSError, OverflowError):
                modified_stamp = "—"
            try:
                size_bytes = int(p.get("size", 0) or 0)
                size_mb = size_bytes / (1024 * 1024)
                size_text = f"{size_mb:.2f} MB" if size_mb >= 1 else f"{max(1, size_bytes // 1024)} KB"
            except (TypeError, ValueError, OverflowError):
                size_text = "—"
            backup_count = int(p.get("backup_count", 0) or 0)
            last_backup = str(backups[0].get("modified", "") or "") if backups and isinstance(backups[0], dict) else ""
            idle_note = ""
            idle = p.get("idle_seconds")
            if state_code == "ours" and idle is not None:
                try:
                    idle_int = max(0, int(idle))
                    idle_note = f" · Word işaretçisi {idle_int // 60} dk hareketsiz"
                except (TypeError, ValueError, OverflowError):
                    pass
            self.petition_details.setText(
                f"Son dosya değişikliği: {modified_stamp}   ·   Boyut: {size_text}   ·   Yedek: {backup_count}"
                + (f"   ·   Son yedek: {last_backup}" if last_backup else "")
                + idle_note
            )
            elapsed_part = f" · Açık kalma: {elapsed}" if elapsed else ""
            owner_source = str(p.get("owner_source", "") or "").strip()
            self.petition_lock.setText(
                f"KULLANAN: {owner or ('Kullanıcı bilgisi okunamadı' if state_code not in {'available', 'missing', 'unconfigured'} else 'Dosya müsait')}   ·   BİLGİSAYAR: {computer or 'Kayıt yok'}   ·   AÇILIŞ: {opened or 'Kayıt yok'}{elapsed_part}"
            )
            self.petition_lock.setToolTip((status_detail + (f"\nKullanıcı kaynağı: {owner_source}" if owner_source else "")).strip())
            last_editor = str(p.get("last_modified_by", "") or "").strip()
            if not last_editor:
                events = p.get("events", []) if isinstance(p.get("events", []), list) else []
                for event in events:
                    if not isinstance(event, dict):
                        continue
                    ev_name = str(event.get("event", "")).strip().casefold()
                    if ev_name in {"kaydet", "saved", "değişiklik kaydedildi", "degisiklik kaydedildi", "document_modified"}:
                        last_editor = str(event.get("user", "") or "").strip()
                        if last_editor:
                            break
            if hasattr(self, "petition_last_editor_value"):
                self.petition_last_editor_value.setText(last_editor or "Word belgesinde kayıtlı bilgi yok")
            if hasattr(self, "petition_modified_value"):
                self.petition_modified_value.setText(modified_stamp)
            if hasattr(self, "petition_elapsed_value"):
                self.petition_elapsed_value.setText(elapsed or ("Açık değil" if state_code == "available" else "Doğrulanamadı"))
            if hasattr(self, "petition_size_value"):
                self.petition_size_value.setText(size_text)
            if hasattr(self, "petition_metric_owner_value"):
                self.petition_metric_owner_value.setToolTip(" · ".join(x for x in (owner, computer, opened, str(p.get("owner_source", "") or "")) if x))
            self.petition_queue_label.setText(
                f"BEKLEME SIRASI   ·   {len(queue_users)} kişi bekliyor"
                + (f"   ·   Senin sıran: {queue_position}" if queue_position else "   ·   Sırada değilsin")
            )
            online_text = "  •  ".join(
                f"{str(x.get('user', '')).strip()} ({str(x.get('computer', '')).strip()})"
                for x in online[:10] if isinstance(x, dict) and str(x.get("user", "")).strip()
            ) or "Şu an çevrimiçi ENCTakip / Pulse kullanıcısı raporlanmadı."
            self.petition_users_label.setText("ÇEVRİMİÇİ EKİP   ·   " + online_text)
            events = p.get("events", []) if isinstance(p.get("events", []), list) else []
            event_lines = []
            for event in events[:5]:
                if not isinstance(event, dict):
                    continue
                bits = [str(event.get("time", "") or "").strip(), str(event.get("user", "") or "").strip(), str(event.get("event", "") or "").strip()]
                line = "  ·  ".join(bit for bit in bits if bit)
                if line:
                    event_lines.append(line)
            self.petition_activity_label.setText("SON HAREKETLER\n" + ("\n".join(event_lines) if event_lines else "Henüz kaydedilmiş bir hareket yok."))
            if hasattr(self, "petition_metric_queue_value"):
                self.petition_metric_queue_value.setToolTip("\n".join(str(x) for x in queue_users) or "Bekleyen yok")
            if hasattr(self, "petition_metric_online_value"):
                self.petition_metric_online_value.setToolTip("\n".join(f"{x.get('user','')} · {x.get('computer','')}" for x in online if isinstance(x, dict)))
            if hasattr(self, "petition_open_button"):
                self.petition_open_button.setEnabled(state_code == "available")
            if hasattr(self, "petition_close_button"):
                self.petition_close_button.setEnabled(bool(p.get("owned_by_me")))
            if hasattr(self, "petition_queue_button"):
                self.petition_queue_button.setText("Sıradan Çık" if p.get("queued") else "Müsait Olunca Haber Ver")
                self.petition_queue_button.setEnabled(state_code not in {"available", "unconfigured", "missing"} or bool(p.get("queued")))
        else:
            self.petition_details.setText(status_detail or "Dosya bulunamadı veya yol henüz ayarlanmadı.")
            self.petition_lock.setText("KULLANAN: —   ·   BİLGİSAYAR: —   ·   AÇILIŞ: —")
            for attr in ("petition_last_editor_value", "petition_modified_value", "petition_elapsed_value", "petition_size_value"):
                label = getattr(self, attr, None)
                if label is not None:
                    label.setText("—")
            if hasattr(self, "petition_metric_owner_value"):
                self.petition_metric_owner_value.setText("—")
            if hasattr(self, "petition_metric_queue_value"):
                self.petition_metric_queue_value.setText(f"{len(queue_users)} kişi")
            if hasattr(self, "petition_metric_online_value"):
                self.petition_metric_online_value.setText(f"{len(online)} kişi")
            self.petition_queue_label.setText("BEKLEME SIRASI   ·   Durum doğrulanamadı")
            self.petition_users_label.setText("ÇEVRİMİÇİ EKİP   ·   Durum doğrulanamadı")
            self.petition_activity_label.setText("SON HAREKETLER\nDurum doğrulanamadı; ağ yolu ve dosya ayarını kontrol et.")
            if hasattr(self, "petition_open_button"):
                self.petition_open_button.setEnabled(False)
            if hasattr(self, "petition_close_button"):
                self.petition_close_button.setEnabled(False)
            if hasattr(self, "petition_queue_button"):
                self.petition_queue_button.setText("Müsait Olunca Haber Ver")
                self.petition_queue_button.setEnabled(False)

    def _refresh_reservation_accounts(self, claims, summary):
        if not hasattr(self, "reserve_account_combo"):
            return
        current = str(self.reserve_account_combo.currentData() or "")
        values = set(str(x).strip() for x in self.config.get("allowed_accounts", []) if str(x).strip())
        values.update(str(r.get("account_name", "")).strip() for r in summary.get("reports", []) if str(r.get("account_name", "")).strip())
        for claim in claims:
            if claim.get("account"):
                values.add(str(claim["account"]).strip())
        items = [("Hesap seç…", "")] + [(x, x) for x in sorted(values, key=str.casefold)]
        old = [(self.reserve_account_combo.itemText(i), self.reserve_account_combo.itemData(i)) for i in range(self.reserve_account_combo.count())]
        if old != items:
            self.reserve_account_combo.blockSignals(True)
            self.reserve_account_combo.clear()
            for label, data in items:
                self.reserve_account_combo.addItem(label, data)
            idx = self.reserve_account_combo.findData(current)
            self.reserve_account_combo.setCurrentIndex(idx if idx >= 0 else 0)
            self.reserve_account_combo.blockSignals(False)
        self._update_reservation_status()

    def _selected_reservation_account(self) -> str:
        if not hasattr(self, "reserve_account_combo"):
            return ""
        return str(self.reserve_account_combo.currentData() or "").strip()

    def _claim_status(self, account: str):
        if not account:
            return None
        for claim in self.snapshot.get("claims", []):
            if str(claim.get("account", "")).casefold() == account.casefold():
                return claim
        return None

    def _claim_owned(self, claim: dict[str, Any] | None) -> bool:
        if not claim:
            return False
        return (str(claim.get("computer", "")).casefold() == str(self.config.get("computer_name", "")).casefold()
                and str(claim.get("windows_user", "")).casefold() == str(self.config.get("windows_user", "")).casefold())

    def _update_reservation_status(self, *_args):
        if not hasattr(self, "reserve_status_label"):
            return
        account = self._selected_reservation_account()
        if not account:
            self.reserve_status_label.setText("Rezervasyon için hesap seç.")
            return
        if not self.snapshot.get("network_ok"):
            self.reserve_status_label.setText("Ağ doğrulanamıyor; rezervasyon güvenli değil.")
            return
        claim = self._claim_status(account)
        if not claim:
            self.reserve_status_label.setText("Rezervasyon boş")
            return
        if self._claim_owned(claim):
            self.reserve_status_label.setText("Rezervasyon sende")
            self.reserve_status_label.setProperty("state", "success")
        else:
            self.reserve_status_label.setText(f"Rezerve: {claim.get('computer', '—')} · {claim.get('windows_user', '—')}")
            self.reserve_status_label.setProperty("state", "warning")
        self.reserve_status_label.style().unpolish(self.reserve_status_label); self.reserve_status_label.style().polish(self.reserve_status_label)

    def reserve_selected_account(self):
        account = self._selected_reservation_account()
        if not account:
            QMessageBox.information(self, "e-ÇED rezervasyonu", "Önce listeden hesap seç. Hesap listesine Ayarlar bölümünden isim/e-posta ekleyebilirsin.")
            return
        if not self.snapshot.get("network_ok"):
            QMessageBox.warning(self, "e-ÇED rezervasyonu", "Ortak ağ erişilemiyor. Rezervasyon alınmadı.")
            return
        self.worker.queue_claim("claim", account)
        self.status_label.setText(f"{account} için rezervasyon kontrol ediliyor…")

    def release_selected_account(self):
        account = self._selected_reservation_account()
        if not account:
            return
        self.worker.queue_claim("release", account)
        self.status_label.setText(f"{account} rezervasyonu bırakılıyor…")

    def _refresh_recipients(self, agents, profiles=None):
        if not hasattr(self, "message_recipient"):
            return
        current = self.message_recipient.currentData() or "Tümü"
        choices = [
            ("Tümü", "Tümü"),
            ("ENCTakip · e-ÇED odası", "ENCTakip · e-ÇED"),
            ("ENCTakip · Dilekçeler odası", "ENCTakip · Dilekçeler"),
        ]
        users, computers = set(), set()
        for profile in profiles or []:
            username = str(profile.get("username", "")).strip()
            if username:
                users.add(username)
        for item in agents:
            if item.get("fresh"):
                user = str(item.get("windows_user", "")).strip()
                pc = str(item.get("computer", "")).strip()
                if user:
                    users.add(user)
                if pc:
                    computers.add(pc)
        for user in sorted(users, key=str.casefold):
            choices.append((f"Kullanıcı · {user}", user))
        for pc in sorted(computers, key=str.casefold):
            choices.append((f"Bilgisayar · {pc}", pc))
        if [(self.message_recipient.itemText(i), self.message_recipient.itemData(i)) for i in range(self.message_recipient.count())] != choices:
            self.message_recipient.blockSignals(True)
            self.message_recipient.clear()
            for label, data in choices:
                self.message_recipient.addItem(label, data)
            idx = self.message_recipient.findData(current)
            self.message_recipient.setCurrentIndex(idx if idx >= 0 else 0)
            self.message_recipient.blockSignals(False)

    def _refresh_messages(self, msgs):
        if not hasattr(self, "messages_list"):
            return
        scrollbar = self.messages_list.verticalScrollBar()
        previous_scroll = scrollbar.value()
        was_at_bottom = previous_scroll >= scrollbar.maximum() - 6
        query = self.messages_search.text().casefold().strip() if hasattr(self, "messages_search") else ""
        self.messages_list.clear()
        my_user = str(self.config.get("windows_user", "")).casefold()
        my_pc = str(self.config.get("computer_name", "")).casefold()
        target = str(getattr(self, "chat_current_target", "Tümü") or "Tümü").casefold()
        rows = sorted((dict(m) for m in msgs if isinstance(m, dict)), key=lambda m: float(m.get("created_at", 0) or 0))[-500:]
        selected = []
        for msg in rows:
            recipient = str(msg.get("recipient", "Tümü")).strip().casefold()
            sender = str(msg.get("sender", "")).strip().casefold()
            is_group = recipient in {"tümü", "tumü", "all"}
            is_legacy = bool(msg.get("legacy_enctakip"))
            if msg.get("legacy_room"):
                allowed = target == recipient
            elif target in {"tümü", "tumü", "all"}:
                allowed = is_group
            else:
                allowed = ((sender == my_user and recipient == target)
                           or (sender == target and recipient in {my_user, my_pc}))
            if not allowed:
                continue
            hay = " ".join(str(msg.get(k, "")) for k in ("sender", "computer", "recipient", "message")) + " " + " ".join(str(a.get("original_name", "")) for a in msg.get("attachments", []) if isinstance(a, dict))
            if query and query not in hay.casefold():
                continue
            selected.append(msg)

        if not selected:
            empty = QListWidgetItem("Henüz mesaj yok\n\nBu sohbetin ilk mesajını yaz veya bir dosya paylaş.")
            empty.setFlags(Qt.NoItemFlags)
            empty.setTextAlignment(Qt.AlignCenter)
            empty.setForeground(QColor(theme_color(self._stitch_theme_mode, "dim")))
            empty.setSizeHint(QSize(max(320, self.messages_list.viewport().width() - 20), max(170, self.messages_list.viewport().height() - 32)))
            self.messages_list.addItem(empty)
        for msg in selected:
            is_legacy = bool(msg.get("legacy_enctakip"))
            sender_name = str(msg.get("sender", "Kullanıcı") or "Kullanıcı")
            sender_lower = sender_name.casefold()
            outgoing = sender_lower == my_user
            profile = self._profile_for_username(sender_name)
            display_name = str(profile.get("display_name") or sender_name)
            computer = str(msg.get("computer", "")).strip()
            stamp = fmt_time(msg.get("created_at"))
            if stamp.endswith(":00"):
                stamp = stamp[:-3]
            row_widget = QWidget()
            row_widget.setStyleSheet("")
            row_layout = QHBoxLayout(row_widget)
            row_layout.setContentsMargins(0, 1, 0, 1)
            row_layout.setSpacing(7)
            bubble = QFrame()
            bubble.setObjectName("chatBubbleOutgoing" if outgoing else "chatBubbleIncoming")
            bubble_layout = QVBoxLayout(bubble)
            bubble_layout.setContentsMargins(14, 11, 14, 10)
            bubble_layout.setSpacing(7)
            meta = QLabel(("Sen" if outgoing else display_name) + (f" · {computer}" if computer and not outgoing else "") + f" · {stamp}")
            meta.setObjectName("chatMeta")
            meta.setWordWrap(True)
            bubble_layout.addWidget(meta)
            text_body = str(msg.get("message", ""))
            viewport_width = max(380, self.messages_list.viewport().width())
            available_width = max(320, viewport_width - 104)
            max_bubble = max(250, min(690, int(available_width * 0.70)))
            bubble.setMinimumWidth(min(210, max_bubble))
            bubble.setMaximumWidth(max_bubble)
            bubble.setSizePolicy(QSizePolicy.Maximum, QSizePolicy.Minimum)
            if text_body:
                body = QLabel(text_body)
                body.setObjectName("chatMessageText")
                body.setWordWrap(True)
                body.setTextInteractionFlags(Qt.TextSelectableByMouse)
                body.setMinimumWidth(min(190, max_bubble))
                body.setMaximumWidth(max_bubble)
                bubble_layout.addWidget(body)
            attachments = [a for a in msg.get("attachments", []) if isinstance(a, dict)]
            for attachment in attachments:
                original = str(attachment.get("original_name", "Dosya eki"))
                size = int(attachment.get("size", 0) or 0)
                if size >= 1024 * 1024:
                    size_text = f"{size / (1024 * 1024):.1f} MB"
                elif size >= 1024:
                    size_text = f"{size / 1024:.0f} KB"
                else:
                    size_text = f"{size} B"
                short_attachment_name = original if len(original) <= 52 else original[:49].rstrip() + "…"
                att_button = QPushButton(f"📎  {short_attachment_name}   ·   {size_text}")
                att_button.setObjectName("secondary")
                att_button.setCursor(Qt.PointingHandCursor)
                att_button.setToolTip(f"{original} · Dosyayı önizlemek/açmak için tıkla")
                att_button.setMinimumHeight(36)
                att_button.setMaximumWidth(max_bubble)
                att_button.clicked.connect(lambda _checked=False, a=dict(attachment): self._open_chat_attachment(a))
                bubble_layout.addWidget(att_button)
                # Embedded preview for image files. Text documents get a bounded plain-text snippet;
                # unknown formats stay downloadable/openable through their file card.
                shared_root = str(self.config.get("shared_root", "") or "")
                stored = str(attachment.get("stored_name", ""))
                file_path = Path(shared_root) / "attachments" / Path(stored).name if stored else Path()
                suffix = Path(original).suffix.casefold()
                if file_path.is_file() and suffix in {".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".tif", ".tiff"}:
                    pixmap = QPixmap(str(file_path))
                    if not pixmap.isNull():
                        image_preview = QLabel()
                        image_preview.setAlignment(Qt.AlignCenter)
                        image_preview.setStyleSheet("")
                        image_preview.setPixmap(pixmap.scaled(300, 190, Qt.KeepAspectRatio, Qt.SmoothTransformation))
                        image_preview.setCursor(Qt.PointingHandCursor)
                        image_preview.mousePressEvent = lambda event, a=dict(attachment): self._open_chat_attachment(a) if event.button() == Qt.LeftButton else None
                        bubble_layout.addWidget(image_preview, 0, Qt.AlignLeft)
                elif file_path.is_file() and suffix == ".pdf" and QPdfView is not None and QPdfDocument is not None:
                    try:
                        pdf_view = QPdfView()
                        pdf_view.setMinimumHeight(160)
                        pdf_view.setMaximumHeight(260)
                        pdf_doc = QPdfDocument(pdf_view)
                        pdf_doc.load(str(file_path))
                        pdf_view.setDocument(pdf_doc)
                        try:
                            pdf_view.setZoomMode(QPdfView.ZoomMode.FitToWidth)
                        except Exception:
                            pass
                        pdf_view.setToolTip("PDF önizleme · tam boyutlu açmak için dosya kartına tıkla")
                        bubble_layout.addWidget(pdf_view)
                    except Exception:
                        pass
                elif file_path.is_file():
                    snippet = _attachment_document_preview(file_path)
                    if snippet:
                        preview = QLabel(snippet + ("…" if len(snippet) >= 1800 else ""))
                        preview.setWordWrap(True)
                        preview.setTextInteractionFlags(Qt.TextSelectableByMouse)
                        preview.setMaximumWidth(max_bubble)
                        preview.setStyleSheet("")
                        bubble_layout.addWidget(preview)
            reactions = [r for r in msg.get("reactions", []) if isinstance(r, dict) and r.get("emoji")]
            reaction_counts = {}
            for reaction in reactions:
                reaction_counts[reaction.get("emoji", "")] = reaction_counts.get(reaction.get("emoji", ""), 0) + 1
            if reaction_counts:
                reaction_row = QHBoxLayout()
                for emoji, count in sorted(reaction_counts.items()):
                    reaction_btn = QPushButton(f"{emoji} {count}")
                    reaction_btn.setObjectName("secondary")
                    reaction_btn.setMaximumWidth(65)
                    reaction_btn.clicked.connect(lambda _checked=False, mid=str(msg.get("id", "")), em=emoji: self._queue_chat_reaction(mid, em))
                    reaction_row.addWidget(reaction_btn)
                reaction_row.addStretch(1)
                bubble_layout.addLayout(reaction_row)
            actions = QHBoxLayout()
            if not is_legacy:
                react_btn = QPushButton("☺")
                react_btn.setObjectName("secondary")
                react_btn.setMaximumSize(30, 25)
                react_btn.setToolTip("Tepki ekle")
                react_btn.clicked.connect(lambda _checked=False, mid=str(msg.get("id", "")), button=react_btn: self._show_reaction_menu(mid, button))
                actions.addWidget(react_btn)
            actions.addStretch(1)
            if outgoing and not is_legacy:
                receipts = [r for r in msg.get("receipts", []) if isinstance(r, dict)]
                delivered = sum(1 for r in receipts if float(r.get("delivered_at", 0) or 0))
                read = sum(1 for r in receipts if float(r.get("read_at", 0) or 0))
                recip = str(msg.get("recipient", "Tümü")).casefold()
                if recip in {"tümü", "tumü", "all"}:
                    receipt_text = f"Gönderildi · İletildi {delivered} · Görüldü {read}"
                else:
                    target_receipt = next((r for r in receipts if str(r.get("username", "")).casefold() == recip), {})
                    receipt_text = "Görüldü ✓✓" if float(target_receipt.get("read_at", 0) or 0) else ("İletildi ✓✓" if float(target_receipt.get("delivered_at", 0) or 0) else "Gönderildi ✓")
                receipt_label = QLabel(receipt_text)
                receipt_label.setObjectName("chatMeta")
                receipt_label.setToolTip("Paylaşımlı ağ üzerinde teslim/okundu teyitleri")
                actions.addWidget(receipt_label)
            bubble_layout.addLayout(actions)
            avatar = self._avatar_label(display_name, profile, 30)
            if outgoing:
                row_layout.addStretch(1)
                row_layout.addWidget(bubble, 0, Qt.AlignRight | Qt.AlignVCenter)
                row_layout.addWidget(avatar, 0, Qt.AlignBottom)
            else:
                row_layout.addWidget(avatar, 0, Qt.AlignBottom)
                row_layout.addWidget(bubble, 0, Qt.AlignLeft | Qt.AlignVCenter)
                row_layout.addStretch(1)
            row_widget.setMinimumWidth(max(300, self.messages_list.viewport().width() - 42))
            row_widget.setMaximumWidth(max(320, self.messages_list.viewport().width() - 18))
            row_widget.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Minimum)
            row_widget.ensurePolished()
            row_widget.adjustSize()
            layout = row_widget.layout()
            if layout is not None:
                layout.activate()
            item = QListWidgetItem()
            item.setData(Qt.UserRole, str(msg.get("id", "")))
            row_height = max(72, row_widget.sizeHint().height() + 8)
            item.setSizeHint(QSize(max(320, self.messages_list.viewport().width() - 12), row_height))
            self.messages_list.addItem(item)
            self.messages_list.setItemWidget(item, row_widget)
        if was_at_bottom:
            self.messages_list.scrollToBottom()
        else:
            self.messages_list.verticalScrollBar().setValue(previous_scroll)

    def _show_message_context_menu(self, position):
        """Offer practical message actions, including creating a real workspace task."""
        item = self.messages_list.itemAt(position) if hasattr(self, "messages_list") else None
        message_id = str(item.data(Qt.UserRole) or "") if item is not None else ""
        if not message_id:
            return
        message = next((m for m in self.snapshot.get("messages", [])
                        if isinstance(m, dict) and str(m.get("id", "")) == message_id), None)
        if not message:
            return
        menu = QMenu(self)
        copy_action = menu.addAction("Mesajı kopyala")
        create_task_action = menu.addAction("Bu mesajdan görev oluştur")
        chosen = menu.exec(self.messages_list.viewport().mapToGlobal(position))
        if chosen == copy_action:
            QApplication.clipboard().setText(str(message.get("message", "")))
        elif chosen == create_task_action:
            text = str(message.get("message", "")).strip()
            attachments = [str(a.get("original_name", "Dosya eki")) for a in message.get("attachments", []) if isinstance(a, dict)]
            title = next((line.strip() for line in text.splitlines() if line.strip()), "Sohbetten gelen görev")
            title = title[:100]
            detail_lines = [
                "Sohbet mesajından oluşturuldu.",
                f"Gönderen: {message.get('sender', 'Bilinmiyor')}",
                f"Tarih: {fmt_time(message.get('created_at'))}",
                "",
                text or "(Mesaj metni yok)",
            ]
            if attachments:
                detail_lines.extend(["", "Mesaj ekleri:", *[f"- {name}" for name in attachments]])
            self._stitch_create_task(seed_title=title, seed_note="\n".join(detail_lines))

    def _select_chat_attachments(self):
        files, _ = QFileDialog.getOpenFileNames(self, "Sohbete görsel veya dosya ekle", "", "Tüm dosyalar (*.*)")
        if not files:
            return
        combined = list(dict.fromkeys(list(self.pending_chat_attachments) + [str(p) for p in files]))
        if len(combined) > 10:
            QMessageBox.warning(self, "Ek sayısı", "Bir mesaja en fazla 10 dosya ekleyebilirsin.")
            combined = combined[:10]
        self.pending_chat_attachments = combined
        self._update_chat_attachment_summary()

    def _remove_chat_attachment(self, file_path: str):
        target = str(file_path)
        self.pending_chat_attachments = [p for p in self.pending_chat_attachments if str(p) != target]
        self._update_chat_attachment_summary()

    def _clear_chat_attachments(self):
        self.pending_chat_attachments = []
        self._update_chat_attachment_summary()

    def _update_chat_attachment_summary(self):
        count = len(self.pending_chat_attachments)
        if hasattr(self, "chat_attachment_summary"):
            self.chat_attachment_summary.setText(f"{count} ek" if count else "")
            self.chat_attachment_summary.setToolTip("\n".join(Path(p).name for p in self.pending_chat_attachments))
        if hasattr(self, "chat_clear_attachments_btn"):
            self.chat_clear_attachments_btn.setEnabled(bool(count))
            self.chat_clear_attachments_btn.setVisible(bool(count))
            self.chat_clear_attachments_btn.setVisible(bool(count))
        if not hasattr(self, "chat_attachment_preview_layout"):
            return
        while self.chat_attachment_preview_layout.count():
            item = self.chat_attachment_preview_layout.takeAt(0)
            widget = item.widget()
            if widget is not None:
                widget.deleteLater()
        for raw_path in self.pending_chat_attachments:
            path = Path(raw_path)
            card = QFrame()
            card.setObjectName("attachmentPreviewCard")
            card.setFixedSize(206, 78)
            card.setStyleSheet("")
            line = QHBoxLayout(card)
            line.setContentsMargins(7, 6, 5, 6)
            line.setSpacing(7)
            preview = QLabel()
            preview.setFixedSize(56, 54)
            preview.setAlignment(Qt.AlignCenter)
            suffix = path.suffix.casefold()
            pixmap = QPixmap(str(path)) if suffix in {".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".tif", ".tiff"} else QPixmap()
            if not pixmap.isNull():
                preview.setPixmap(pixmap.scaled(56, 54, Qt.KeepAspectRatio, Qt.SmoothTransformation))
                preview.setStyleSheet("")
            else:
                icon_text = "PDF" if suffix == ".pdf" else (suffix[1:].upper()[:5] if suffix else "DOSYA")
                preview.setText(icon_text)
                preview.setStyleSheet("")
            line.addWidget(preview)
            labels = QVBoxLayout(); labels.setSpacing(3)
            filename = QLabel(path.name)
            filename.setStyleSheet("")
            filename.setWordWrap(True)
            filename.setMaximumWidth(102)
            filename.setToolTip(str(path))
            try:
                size = path.stat().st_size
                size_label = QLabel(f"{size / 1024:.0f} KB" if size < 1024 * 1024 else f"{size / (1024 * 1024):.1f} MB")
            except OSError:
                size_label = QLabel("Dosya")
            size_label.setStyleSheet("")
            labels.addWidget(filename, 1); labels.addWidget(size_label)
            line.addLayout(labels, 1)
            remove = QPushButton("×")
            remove.setObjectName("danger")
            remove.setFixedSize(23, 23)
            remove.setStyleSheet("")
            remove.setToolTip(f"{path.name} ekini kaldır")
            remove.clicked.connect(lambda _=False, val=str(path): self._remove_chat_attachment(val))
            line.addWidget(remove, 0, Qt.AlignTop)
            self.chat_attachment_preview_layout.addWidget(card)
        self.chat_attachment_preview_layout.addStretch(1)
        self.chat_attachment_preview_scroll.setVisible(bool(count))
        if hasattr(self, "chat_attach_btn"):
            self.chat_attach_btn.setToolTip(f"Görsel veya dosya ekle ({count}/10)" if count else "Görsel veya dosya ekle")
        self._update_chat_send_enabled()

    def _show_chat_emoji_menu(self):
        menu = QMenu(self)
        for emoji in ("😀", "😃", "😂", "😊", "😉", "😍", "🤔", "😮", "😢", "🙏", "👍", "👏", "❤️", "🎉", "🔥", "✅"):
            action = menu.addAction(emoji)
            action.triggered.connect(lambda _checked=False, value=emoji: self.message_input.insert(value))
        menu.exec(self.chat_emoji_btn.mapToGlobal(self.chat_emoji_btn.rect().bottomLeft()))

    def _show_reaction_menu(self, message_id: str, button):
        menu = QMenu(self)
        for emoji in ("👍", "❤️", "😂", "😮", "😢", "🎉", "🙏", "👏", "✅", "🔥"):
            action = menu.addAction(emoji)
            action.triggered.connect(lambda _checked=False, mid=message_id, value=emoji: self._queue_chat_reaction(mid, value))
        menu.exec(button.mapToGlobal(button.rect().bottomLeft()))

    def _queue_chat_reaction(self, message_id: str, emoji: str):
        self.worker.queue_reaction({"message_id": message_id, "username": str(self.config.get("windows_user", "")), "emoji": emoji})

    def _open_chat_attachment(self, attachment: dict[str, Any]):
        stored_name = Path(str(attachment.get("stored_name", ""))).name
        if not stored_name:
            QMessageBox.warning(self, "Dosya eki", "Dosya yolu bulunamadı.")
            return
        path = Path(str(self.config.get("shared_root", ""))) / "attachments" / stored_name
        if not path.is_file():
            QMessageBox.warning(self, "Dosya eki", "Ortak ağdaki dosya bulunamadı. Ağ erişimini kontrol et.")
            return
        # Executable/script files may be shared but are not launched directly from a chat.
        if path.suffix.casefold() in {".exe", ".com", ".scr", ".msi", ".bat", ".cmd", ".ps1", ".vbs", ".js", ".reg"}:
            QMessageBox.warning(self, "Güvenlik uyarısı", "Bu dosya türü doğrudan çalıştırılmaz. Dosya ortak klasöre kaydedildi; açmadan önce kaynağını ve güvenliğini doğrula.")
            QDesktopServices.openUrl(QUrl.fromLocalFile(str(path.parent)))
            return
        # Use the Windows default handler for formats Qt cannot natively preview (legacy Office/etc.).
        if not QDesktopServices.openUrl(QUrl.fromLocalFile(str(path))):
            QMessageBox.warning(self, "Dosya eki", "Dosya açıcı başlatılamadı.")

    def add_notification(self, title: str, detail: str):
        if str(title) == "Yeni mesaj" and self.current_page != "Mesajlar":
            self.unread_messages += 1
            self._update_messages_badge()
        self.notifications.insert(0, (time.time(), str(title)[:80], str(detail)[:500]))
        self.notifications = self.notifications[:300]
        if hasattr(self, "notifications_list"):
            self.notifications_list.insertItem(0, QListWidgetItem(f"{datetime.now().strftime('%d.%m.%Y %H:%M:%S')}  ·  {title}\n{detail}"))
            while self.notifications_list.count() > 300:
                self.notifications_list.takeItem(self.notifications_list.count() - 1)
        # All events remain in PULSE's in-app history. Only a short allow-list of
        # actionable events may interrupt Windows, with duplicate and burst limits.
        limiter = getattr(self, "_notification_limiter", None)
        if (
            getattr(self, "tray_icon", None) is not None
            and limiter is not None
            and limiter.should_show(str(title), str(detail))
        ):
            try:
                self.tray_icon.showMessage(str(title)[:70], str(detail)[:240], QSystemTrayIcon.Information, 5000)
            except Exception:
                pass
        if self.current_page != "Bildirimler" and hasattr(self, "nav_buttons"):
            self.nav_buttons["Bildirimler"].setText("◌  Bildirimler  •")
        if hasattr(self, "event_list"):
            self.event_list.insertItem(0, QListWidgetItem(f"⚑  {title}\n    {detail[:140]}"))
            while self.event_list.count() > 15:
                self.event_list.takeItem(self.event_list.count() - 1)

    def clear_notifications(self):
        self.notifications.clear()
        if hasattr(self, "notifications_list"):
            self.notifications_list.clear()
        if hasattr(self, "event_list"):
            summary = getattr(self, "_current_summary", None)
            if summary is not None and str(getattr(self, "current_page", "")) == "Genel Bakış":
                self._dashboard_render_signature = None
                self._show_dashboard_events(summary)
        button = getattr(self, "nav_buttons", {}).get("Bildirimler")
        if button is not None:
            button.setText("◌  Bildirimler")
        self._update_messages_badge()

    def _recover_scan_button(self):
        if not getattr(self, "_scan_in_progress", False):
            return
        self._scan_in_progress = False
        if hasattr(self, "scan_button"):
            self.scan_button.setEnabled(True)
            self.scan_button.setText("Ağı yeniden denetle")
        self.status_label.setText("Ağ kontrolü 20 saniyede yanıt vermedi. Ağ paylaşımını kontrol edip yeniden deneyebilirsin; arka plan izleme devam ediyor.")

    def request_scan(self):
        if not hasattr(self, "worker") or not self.worker.is_alive():
            self.status_label.setText("Tarama başlatılamadı: izleme iş parçacığı çalışmıyor.")
            QMessageBox.warning(self, "Ağ taraması", "Arka plan izleyicisi çalışmıyor. Uygulamayı kapatıp yeniden açmayı dene.")
            return
        self._scan_in_progress = True
        if hasattr(self, "scan_button"):
            self.scan_button.setEnabled(False)
            self.scan_button.setText("Kontrol ediliyor…")
        self.status_label.setText("Ortak ağ verileri yeniden okunuyor; bu işlem ağ yavaşsa biraz sürebilir…")
        recovery_timer = getattr(self, "_scan_recovery_timer", None)
        if recovery_timer is not None:
            recovery_timer.start(20000)
        self.worker.force_scan()

    def open_portal(self):
        url = str(self.config.get("portal_url", "")).strip()
        if not url.startswith(("https://", "http://")):
            QMessageBox.information(self, "e-ÇED adresi", "Ayarlar bölümünde e-ÇED portal adresini gir.")
            self.navigate("Ayarlar")
            self.portal_url_edit.setFocus()
            return
        account = self._selected_reservation_account()
        if account:
            if not self.snapshot.get("network_ok"):
                QMessageBox.warning(self, "e-ÇED", "Ağ durumu doğrulanamıyor. Hesap rezervasyonu yapılamadığı için portal açılmadı.")
                return
            # A user may have bypassed the reservation button and signed in directly.
            # Stop a second launch when a fresh browser observation sees this account
            # on a different PC. This is a best-effort browser observation, not a
            # server-authoritative session API; reports arrive on the next extension ping.
            summary = getattr(self, "_current_summary", {}) or {}
            observed_elsewhere = observed_account_on_other_computer(
                account,
                summary.get("reports", []),
                str(self.config.get("computer_name", "")),
                int(self.config.get("stale_after_sec", 60)),
            )
            if observed_elsewhere:
                other = observed_elsewhere[0]
                detail = (
                    f"{account} başka bir bilgisayarda gözleniyor: "
                    f"{other.get('computer', 'bilinmiyor')} / "
                    f"{other.get('windows_user', 'bilinmiyor')}. "
                    "Güvenlik için portal açılışı durduruldu. Gözlem görünür portal etiketine dayanır; "
                    "oturumun sunucu tarafından doğrulanmış kanıtı değildir."
                )
                self.add_notification("e-ÇED hesabı başka bilgisayarda", detail)
                QMessageBox.warning(self, "e-ÇED hesabı kullanımda olabilir", detail)
                self.navigate("e-ÇED Canlı")
                return
            claim = self._claim_status(account)
            if self._claim_owned(claim):
                self._launch_portal_url()
                return
            if claim and not self._claim_owned(claim):
                QMessageBox.warning(self, "e-ÇED hesabı kullanımda", f"{account} şu anda {claim.get('computer', 'başka bilgisayar')} / {claim.get('windows_user', 'başka kullanıcı')} üzerinde rezerve. Portal açılmadı.")
                self.navigate("e-ÇED Canlı")
                return
            self._open_portal_after_claim = True
            self.worker.queue_claim("claim", account)
            self.status_label.setText(f"{account} için rezervasyon alınıyor; sonuç bekleniyor…")
            return
        answer = QMessageBox.question(self, "Hesap seçilmedi", "Rezervasyon hesabı seçmedin. Portal yine açılacak; eklenti hesabı görünürse ağ izleme devreye girer. Devam edilsin?", QMessageBox.Yes | QMessageBox.No, QMessageBox.Yes)
        if answer == QMessageBox.Yes:
            self._launch_portal_url()

    def _launch_portal_url(self):
        url = str(self.config.get("portal_url", "")).strip()
        if not url.startswith(("https://", "http://")):
            return
        QDesktopServices.openUrl(QUrl(url))
        self.add_notification("Portal açıldı", "e-ÇED tarayıcıda açıldı. Hesap gözlemi eklenti raporundan gelir.")

    def _notify_petition_queue_from_snapshot(self, petition: dict[str, Any]):
        """Turn the ENCTakip-compatible queue message into a Pulse notification."""
        current_user = str(self.config.get("windows_user", "") or "").strip().casefold()
        if not current_user:
            return
        events = petition.get("events", []) if isinstance(petition, dict) else []
        for event in events:
            if not isinstance(event, dict) or str(event.get("event", "")) != "SIRA_BILDIRILDI":
                continue
            detail = str(event.get("detail", ""))
            when = str(event.get("time", ""))
            key = f"{when}|{detail}"
            if key in self._seen_petition_queue_events:
                continue
            self._seen_petition_queue_events.add(key)
            try:
                event_dt = datetime.strptime(when, "%d.%m.%Y %H:%M:%S")
                if event_dt.timestamp() < self._application_started_at - 2:
                    continue
            except (TypeError, ValueError, OverflowError):
                continue
            # Legacy event detail: "Sıradaki kullanıcıya haber verildi: <username>".
            target = detail.rsplit(":", 1)[-1].strip().casefold()
            if target == current_user:
                self.add_notification("Dilekçe sırası sende", "Ortak Word dosyası için sıra sana geldi. Dilekçeler bölümünden dosyayı açabilirsin.")

    def open_petition_history(self):
        self.worker.queue_petition_action("history")

    def show_petition_history(self, rows):
        """Display ENCTakip's shared access log in Pulse with Excel export."""
        records = [dict(x) for x in rows if isinstance(x, dict)] if isinstance(rows, list) else []
        dlg = QDialog(self)
        dlg.setWindowTitle("Dilekçeler · Erişim geçmişi")
        dlg.resize(1050, 650)
        dlg.setMinimumSize(760, 450)
        root = QVBoxLayout(dlg)
        root.setContentsMargins(18, 16, 18, 16)
        root.setSpacing(10)
        intro = QLabel("ENCTakip ve Pulse tarafından ortak ağ klasörüne yazılan dosya erişim kayıtları")
        intro.setObjectName("muted")
        root.addWidget(intro)
        search = QLineEdit()
        search.setPlaceholderText("Kullanıcı, bilgisayar, olay veya ayrıntı ara…")
        root.addWidget(search)
        table = QTableWidget(0, 5)
        table.setHorizontalHeaderLabels(["ZAMAN", "KULLANICI", "BİLGİSAYAR", "OLAY", "AYRINTI"])
        table.setSelectionBehavior(QAbstractItemView.SelectRows)
        table.setSelectionMode(QAbstractItemView.SingleSelection)
        table.setEditTriggers(QAbstractItemView.NoEditTriggers)
        table.verticalHeader().setVisible(False)
        table.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeToContents)
        table.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeToContents)
        table.horizontalHeader().setSectionResizeMode(2, QHeaderView.ResizeToContents)
        table.horizontalHeader().setSectionResizeMode(3, QHeaderView.ResizeToContents)
        table.horizontalHeader().setSectionResizeMode(4, QHeaderView.Stretch)
        root.addWidget(table, 1)
        normalized = []
        for rec in reversed(records):
            values = [str(rec.get("zaman", "")), str(rec.get("kullanici", "")), str(rec.get("bilgisayar", "")), str(rec.get("olay", "")), str(rec.get("detay", ""))]
            normalized.append(values)
        table.setUpdatesEnabled(False)
        try:
            table.setRowCount(len(normalized))
            for row_index, values in enumerate(normalized):
                for col, value in enumerate(values):
                    table.setItem(row_index, col, QTableWidgetItem(value))
                table.setRowHeight(row_index, 30)
        finally:
            table.setUpdatesEnabled(True)
        table._history_values = normalized

        def filter_rows(text):
            q = str(text or "").casefold().strip()
            for ri, values in enumerate(normalized):
                table.setRowHidden(ri, bool(q) and q not in " ".join(values).casefold())
        search.textChanged.connect(filter_rows)
        footer = QHBoxLayout()
        count_label = QLabel(f"{len(normalized)} kayıt")
        count_label.setObjectName("muted")
        footer.addWidget(count_label)
        footer.addStretch(1)
        export_btn = QPushButton("Excel'e aktar")
        export_btn.setObjectName("primary")
        close_btn = QPushButton("Kapat")
        close_btn.setObjectName("secondary")
        footer.addWidget(export_btn)
        footer.addWidget(close_btn)
        root.addLayout(footer)

        def export_excel():
            file_path, _ = QFileDialog.getSaveFileName(dlg, "Dilekçe erişim geçmişini Excel'e aktar", str(Path.home() / "Dilekce_Erisim_Gecmisi.xlsx"), "Excel çalışma kitabı (*.xlsx)")
            if not file_path:
                return
            target = Path(file_path)
            if target.suffix.casefold() != ".xlsx":
                target = target.with_suffix(".xlsx")
            try:
                from openpyxl import Workbook
                from openpyxl.styles import Font, PatternFill, Alignment
                wb = Workbook()
                ws = wb.active
                ws.title = "Erişim Geçmişi"
                ws.append(["Zaman", "Kullanıcı", "Bilgisayar", "Olay", "Ayrıntı"])
                for cell in ws[1]:
                    cell.font = Font(bold=True, color="FFFFFF")
                    cell.fill = PatternFill("solid", fgColor="176B59")
                    cell.alignment = Alignment(vertical="center")
                for ri, values in enumerate(normalized, start=2):
                    if table.isRowHidden(ri - 2):
                        continue
                    ws.append(values)
                for col, width in enumerate((22, 22, 26, 24, 80), start=1):
                    ws.column_dimensions[chr(64 + col)].width = width
                ws.freeze_panes = "A2"
                ws.auto_filter.ref = ws.dimensions
                wb.save(target)
                self.add_notification("Erişim geçmişi", f"Excel raporu kaydedildi: {target}")
                QMessageBox.information(dlg, "Excel hazır", f"Erişim geçmişi Excel'e aktarıldı.\n\n{target}")
            except Exception as exc:
                QMessageBox.critical(dlg, "Excel dışa aktarma", f"Rapor oluşturulamadı: {exc}")
        export_btn.clicked.connect(export_excel)
        close_btn.clicked.connect(dlg.accept)
        dlg.exec()

    def open_petition_backups(self):
        self.worker.queue_petition_action("backups")

    def show_petition_backups(self, rows):
        records = [dict(row) for row in rows if isinstance(row, dict)] if isinstance(rows, list) else []
        dlg = QDialog(self)
        dlg.setWindowTitle("Dilekçeler · Word yedek geçmişi")
        dlg.resize(900, 520)
        dlg.setMinimumSize(650, 360)
        root = QVBoxLayout(dlg)
        intro = QLabel("ENCTakip ile aynı ortak yedek klasöründeki sürümler. Bir yedeği dışa aktarmak özgün ortak belgeyi değiştirmez.")
        intro.setWordWrap(True)
        intro.setObjectName("muted")
        root.addWidget(intro)
        table = QTableWidget(0, 3)
        table.setHorizontalHeaderLabels(["YEDEK DOSYASI", "YEDEK ZAMANI", "BOYUT"])
        table.setSelectionBehavior(QAbstractItemView.SelectRows)
        table.setSelectionMode(QAbstractItemView.SingleSelection)
        table.setEditTriggers(QAbstractItemView.NoEditTriggers)
        table.verticalHeader().setVisible(False)
        table.horizontalHeader().setSectionResizeMode(0, QHeaderView.Stretch)
        table.horizontalHeader().setSectionResizeMode(1, QHeaderView.ResizeToContents)
        table.horizontalHeader().setSectionResizeMode(2, QHeaderView.ResizeToContents)
        table.setRowCount(len(records))
        for idx, record in enumerate(records):
            table.setItem(idx, 0, QTableWidgetItem(str(record.get("name", ""))))
            table.setItem(idx, 1, QTableWidgetItem(str(record.get("modified", ""))))
            size = max(0, int(record.get("size", 0) or 0))
            table.setItem(idx, 2, QTableWidgetItem(f"{size / (1024 * 1024):.2f} MB"))
            table.setRowHeight(idx, 32)
        root.addWidget(table, 1)
        footer = QHBoxLayout()
        count = QLabel(f"{len(records)} yedek")
        count.setObjectName("muted")
        footer.addWidget(count)
        footer.addStretch(1)
        copy_btn = QPushButton("Seçili yedeği dışa aktar…")
        copy_btn.setObjectName("primary")
        copy_btn.setEnabled(bool(records))
        close_btn = QPushButton("Kapat")
        close_btn.setObjectName("secondary")
        footer.addWidget(copy_btn)
        footer.addWidget(close_btn)
        root.addLayout(footer)

        def export_selected():
            current = table.currentRow()
            if current < 0 or current >= len(records):
                QMessageBox.information(dlg, "Yedek seçilmedi", "Dışa aktarmak istediğin yedeği seç.")
                return
            source = Path(str(records[current].get("path", "")))
            if not source.is_file():
                QMessageBox.warning(dlg, "Yedek bulunamadı", "Seçilen yedek artık ortak klasörde bulunmuyor.")
                return
            target, _ = QFileDialog.getSaveFileName(
                dlg, "Yedek kopyasını kaydet", str(Path.home() / source.name),
                "Word belgesi (*.docx);;Tüm dosyalar (*.*)",
            )
            if not target:
                return
            destination = Path(target)
            if destination.suffix.casefold() != ".docx":
                destination = destination.with_suffix(".docx")
            try:
                shutil.copy2(source, destination)
                self.add_notification("Dilekçe yedeği", f"Yedek kopyası kaydedildi: {destination}")
                QMessageBox.information(dlg, "Yedek kopyalandı", f"Özgün ortak belge değiştirilmedi.\n\n{destination}")
            except OSError as exc:
                QMessageBox.critical(dlg, "Yedek kopyalanamadı", str(exc))

        copy_btn.clicked.connect(export_selected)
        close_btn.clicked.connect(dlg.accept)
        dlg.exec()

    def open_petition(self):
        """Open the shared Word document only after acquiring ENCTakip's common lock."""
        if not str(self.config.get("petition_file", "")).strip():
            QMessageBox.information(self, "Dilekçeler", "Önce ortak Word dosyasının yolunu seç.")
            return
        self.petition_big.setText("●  Dilekçe kilidi alınıyor…")
        self.petition_open_button.setEnabled(False)
        self.worker.queue_petition_action("open")

    def close_petition_session(self):
        self.worker.queue_petition_action("close")

    def toggle_petition_queue(self):
        p = self.snapshot.get("petition", {}) or {}
        action = "queue_leave" if p.get("queued") else "queue_join"
        self.worker.queue_petition_action(action)

    def choose_petition(self):
        path, _ = QFileDialog.getOpenFileName(self, "Ortak dilekçe dosyasını seç", str(Path.home()), "Word belgeleri (*.docx);;Tüm dosyalar (*.*)")
        if path:
            self.petition_file_edit.setText(path)
            # If choosing from settings page, keep entry in that field.
            cfg = self.get_config()
            cfg["petition_file"] = path
            self.set_config(cfg)
            if hasattr(self, "petition_path_label"):
                self.petition_path_label.setText(path)

    def download_petition_template(self):
        """Download the public sample DOCX unchanged, verify it, then save its path."""
        url = "https://raw.githubusercontent.com/LaVeyan1337/12312/main/000D%C4%B0LEK%C3%87ELER%C4%B0M%C4%B0Z%202026.docx"
        target_dir = CONFIG_PATH.parent / "templates"
        target = target_dir / "000DILEKCELERIMIZ_2026.docx"
        temp = target.with_suffix(target.suffix + ".download")
        try:
            target_dir.mkdir(parents=True, exist_ok=True)
            request = Request(url, headers={"User-Agent": f"PULSE/{CURRENT_VERSION} template-downloader"})
            total = 0
            with urlopen(request, timeout=25) as response, temp.open("wb") as output:
                while True:
                    chunk = response.read(256 * 1024)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > 20 * 1024 * 1024:
                        raise ValueError("Şablon beklenenden büyük; indirme durduruldu.")
                    output.write(chunk)
                output.flush()
                os.fsync(output.fileno())
            if total < 1024 or not zipfile.is_zipfile(temp):
                raise ValueError("İndirilen dosya geçerli bir Word DOCX paketi değil.")
            with zipfile.ZipFile(temp, "r") as document:
                bad = document.testzip()
                if bad:
                    raise ValueError(f"Word belgesinin {bad} bölümü doğrulanamadı.")
            os.replace(temp, target)
            cfg = self.get_config()
            cfg["petition_template_file"] = str(target)
            self.set_config(cfg)
            self.petition_template_path_label.setText(str(target))
            self.add_notification("Word şablonu", "Örnek dilekçe indirildi; özgün Word düzeni korunuyor.")
            QMessageBox.information(
                self, "Şablon hazır",
                "Dolu örnek dilekçe indirildi. Yeni taslaklar bu Word dosyasının kopyası olarak oluşturulacak; arka plan, logo, görseller ve sayfa düzeni korunacak.",
            )
        except Exception as exc:
            try:
                temp.unlink(missing_ok=True)
            except OSError:
                pass
            QMessageBox.warning(
                self, "Word şablonu indirilemedi",
                f"GitHub'dan otomatik indirme başarısız: {exc}\n\nİnternete erişimi kontrol et veya örnek DOCX dosyasını indirip ‘Word şablonunu seç’ ile göster.",
            )

    def choose_petition_template(self):
        current = str(self.config.get("petition_template_file", "") or "").strip()
        start = current if current and Path(current).exists() else str(Path.home())
        path, _ = QFileDialog.getOpenFileName(
            self, "Word dilekçe şablonunu seç", start,
            "Word belgeleri (*.docx);;Tüm dosyalar (*.*)",
        )
        if not path:
            return
        if not zipfile.is_zipfile(path):
            QMessageBox.warning(self, "Word şablonu", "Seçilen dosya geçerli bir DOCX paketi gibi görünmüyor.")
            return
        cfg = self.get_config()
        cfg["petition_template_file"] = path
        self.set_config(cfg)
        self.petition_template_path_label.setText(path)
        self.add_notification("Word şablonu", "Dilekçe şablonu kaydedildi.")

    def create_petition_draft(self):
        template = str(self.get_config().get("petition_template_file", "") or "").strip()
        if not template or not Path(template).is_file():
            QMessageBox.information(
                self, "Word şablonu gerekli",
                "Önce ‘Örnek dilekçeyi indir’ düğmesiyle dolu Word örneğini indir veya elindeki DOCX dosyasını ‘Word şablonunu seç’ düğmesiyle göster.",
            )
            self.choose_petition_template()
            template = str(self.get_config().get("petition_template_file", "") or "").strip()
        source = Path(template) if template else None
        if source is None or not source.is_file():
            return
        if not zipfile.is_zipfile(source):
            QMessageBox.warning(self, "Word şablonu", "Şablon dosyası okunabilir bir DOCX değil. Lütfen Word belgesini yeniden seç.")
            return
        project = next((p for p in self.workspace_projects if str(p.get("id", "")) == str(getattr(self, "selected_project_id", ""))), None)
        project_name = str((project or {}).get("name", "")).strip()
        project_code = str((project or {}).get("code", "")).strip()
        base_bits = ["Dilekce", project_code, project_name, datetime.now().strftime("%Y%m%d_%H%M")]
        suggested = re.sub(r"[^A-Za-z0-9ÇĞİÖŞÜçğıöşü._ -]+", "", "_".join(x for x in base_bits if x)).strip(" ._") + ".docx"
        path, _ = QFileDialog.getSaveFileName(
            self, "Yeni dilekçe taslağını kaydet", str(Path.home() / suggested),
            "Word belgeleri (*.docx)",
        )
        if not path:
            return
        target = Path(path)
        if target.suffix.casefold() != ".docx":
            target = target.with_suffix(".docx")
        try:
            if target.resolve() == source.resolve():
                QMessageBox.warning(self, "Şablon korunmalı", "Şablon dosyasının üzerine yazılamaz. Farklı bir dosya adı seç.")
                return
            shutil.copy2(source, target)
            # Validate the copied package before launching Word.
            with zipfile.ZipFile(target, "r") as document:
                bad = document.testzip()
                if bad:
                    raise ValueError(f"DOCX içindeki bir bölüm doğrulanamadı: {bad}")
        except Exception as exc:
            QMessageBox.critical(self, "Dilekçe taslağı", f"Word taslağı oluşturulamadı: {exc}")
            return
        try:
            if os.name == "nt":
                os.startfile(str(target))
            else:
                QDesktopServices.openUrl(QUrl.fromLocalFile(str(target)))
        except Exception as exc:
            QMessageBox.information(self, "Taslak oluşturuldu", f"Dosya kaydedildi fakat Word otomatik açılamadı.\n\n{target}\n\n{exc}")
            return
        QMessageBox.information(
            self, "Taslak hazır",
            "Yeni Word taslağı oluşturuldu. Örnek belgenin yerleşimi, arka planı, başlık/altbilgileri ve görselleri aynen kopyalandı.\n\nDilekçeye özgü alanları Word içinde güncelle; şablon dosyası değişmedi.",
        )

    def remove_saved_account(self):
        account = self.forget_account_edit.text().strip()
        if not account:
            QMessageBox.information(self, "Hesap temizliği", "Kaldırılacak hesabın adını gir.")
            return
        answer = QMessageBox.question(self, "Hesabı kaldır", f"'{account}' izin listesinden ve kaydedilmiş hesap geçmişinden kaldırılacak. Gerçek e-ÇED oturumu açıksa sonraki taramada yeniden görünür. Devam edilsin?", QMessageBox.Yes | QMessageBox.No, QMessageBox.No)
        if answer != QMessageBox.Yes:
            return
        existing = [x.strip() for x in self.allowed_edit.toPlainText().splitlines() if x.strip()]
        self.allowed_edit.setPlainText("\n".join(x for x in existing if x.casefold() != account.casefold()))
        cfg = self.get_config()
        cfg["allowed_accounts"] = [x for x in existing if x.casefold() != account.casefold()]
        self.set_config(cfg)
        self.worker.queue_forget_account(account)
        self.forget_account_edit.clear()
        self.worker.force_scan()
        self.add_notification("Hesap listesi", f"{account} kaldırma isteği gönderildi.")

    def save_settings(self):
        cfg = self.get_config()
        cfg["shared_root"] = self.shared_path_edit.text().strip()
        cfg["documents_root"] = self.documents_path_edit.text().strip() if hasattr(self, "documents_path_edit") else str(cfg.get("documents_root", r"\\192.168.1.55\Genel Evrak"))
        cfg["portal_url"] = self.portal_url_edit.text().strip()
        cfg["petition_file"] = self.petition_file_edit.text().strip()
        cfg["scan_interval_sec"] = int(self.interval_spin.value())
        cfg["stale_after_sec"] = int(self.stale_spin.value())
        cfg["allowed_accounts"] = [x.strip() for x in self.allowed_edit.toPlainText().splitlines() if x.strip()]
        selected_theme = str(self.theme_mode_combo.currentData() or "dark_velvet")
        cfg["theme"] = selected_theme if selected_theme in {"dark_velvet", "light_sage"} else "dark_velvet"
        cfg["ui_design_version"] = "bitrix_workspace_stitch_2026_10"
        try:
            if cfg["portal_url"] and not cfg["portal_url"].startswith(("https://", "http://")):
                QMessageBox.warning(self, "Ayarlar", "Portal adresi http:// veya https:// ile başlamalı.")
                return
            if not cfg["shared_root"]:
                QMessageBox.warning(self, "Ayarlar", "Ortak izleme klasörü boş olamaz.")
                return
            self.set_config(cfg)
            self._documents_root = str(cfg.get("documents_root") or r"\\192.168.1.55\Genel Evrak")
            if hasattr(self, "documents_path_edit"):
                self.documents_path_edit.setText(self._documents_root)
                self.scan_documents_directory()
            self._apply_theme("dark" if cfg["theme"] == "dark_velvet" else "light", persist=False, push_web=True)
            self.worker.force_scan()
            QMessageBox.information(self, "Ayarlar", "Ayarlar kaydedildi.")
            self.add_notification("Ayarlar", "Bağlantı ayarları güncellendi.")
        except Exception as exc:
            QMessageBox.critical(self, "Ayarlar", f"Kaydedilemedi: {exc}")

    def open_extension_setup_helper(self):
        helper = APP_DIR / "PULSE_EKLENTI_KURULUM.bat"
        if not helper.is_file():
            QMessageBox.warning(
                self, "Tarayıcı eklentisi",
                "Eklenti yardımcısı bulunamadı.\nPULSE'un güncel kaynak kurulumunu kullanın; tek dosyalı EXE dağıtımı bu akışı içermeyebilir."
            )
            return
        try:
            if os.name == "nt" and hasattr(os, "startfile"):
                os.startfile(str(helper))
            else:
                QMessageBox.information(self, "Tarayıcı eklentisi", f"Yardımcı dosya: {helper}")
        except Exception as exc:
            QMessageBox.warning(self, "Tarayıcı eklentisi", f"Yardımcı açılmadı: {exc}\nDosya: {helper}")

    def _update_chat_send_enabled(self):
        button = getattr(self, "chat_send_btn", None)
        if button is None:
            return
        body = self.message_input.toPlainText().strip() if hasattr(self, "message_input") else ""
        attachments = bool(getattr(self, "pending_chat_attachments", []))
        button.setEnabled(bool(body or attachments))

    def send_message(self):
        text = self.message_input.toPlainText().strip()
        attachments = list(self.pending_chat_attachments)
        if not text and not attachments:
            return
        if len(text) > 2000:
            QMessageBox.warning(self, "Mesaj uzun", "Mesaj en fazla 2.000 karakter olabilir.")
            return
        recipient = str(self.message_recipient.currentData() or "Tümü")
        payload = {"sender": str(self.config.get("windows_user", "")), "computer": str(self.config.get("computer_name", "")),
                   "message": text, "recipient": recipient, "attachments": attachments}
        accepted = self.worker.queue_message(payload)
        if accepted is False:
            return
        self.message_input.clear()
        self._clear_chat_attachments()

    def show_task_result(self, title: str, ok: bool, message: str):
        self.status_label.setText(message)
        if title in {"Proje", "Profil", "Kurum Rehberi"}:
            if ok:
                self.add_notification(title, message)
                self.request_scan()
            else:
                self.add_notification(title + " hatası", message)
                QMessageBox.warning(self, title, message)
        elif title == "Rezervasyon" and self._open_portal_after_claim:
            self._open_portal_after_claim = False
            if ok:
                self._launch_portal_url()
            else:
                self.add_notification("Rezervasyon alınamadı", message)
                QMessageBox.warning(self, "e-ÇED rezervasyonu", message)
        elif not ok:
            self.add_notification(title, message)
        if title == "Rezervasyon":
            self.request_scan()

    def install_autostart(self):
        if os.name != "nt":
            QMessageBox.information(self, "Otomatik başlatma", "Bu işlem Windows içindir.")
            return
        try:
            startup = Path(os.environ.get("APPDATA", str(Path.home()))) / r"Microsoft\Windows\Start Menu\Programs\Startup"
            startup.mkdir(parents=True, exist_ok=True)
            # Remove only known former product launcher names, then register PULSE.
            for old_name in ("ENCEV_PULSE.cmd", "ENCTakipPulse.cmd", "ENCTakip.cmd", "ENÇEV PULSE.cmd"):
                try:
                    (startup / old_name).unlink(missing_ok=True)
                except OSError:
                    pass
            target = startup / "PULSE.cmd"
            launch_ps1 = APP_DIR / "Launch-Pulse.ps1"
            command = f'start "" powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{launch_ps1}"'
            target.write_text(f'@echo off\r\n{command}\r\n', encoding="utf-8")
            QMessageBox.information(self, "Otomatik başlatma", "PULSE Windows başlangıcına eklendi.")
        except Exception as exc:
            QMessageBox.warning(self, "Otomatik başlatma", str(exc))

    def remove_autostart(self):
        if os.name != "nt":
            return
        try:
            startup = Path(os.environ.get("APPDATA", str(Path.home()))) / r"Microsoft\Windows\Start Menu\Programs\Startup"
            for old_name in ("PULSE.cmd", "ENCEV_PULSE.cmd", "ENCTakipPulse.cmd", "ENCTakip.cmd", "ENÇEV PULSE.cmd", "PULSE.lnk"):
                try:
                    (startup / old_name).unlink(missing_ok=True)
                except OSError:
                    pass
            QMessageBox.information(self, "Otomatik başlatma", "PULSE otomatik başlatması kaldırıldı.")
        except Exception as exc:
            QMessageBox.warning(self, "Otomatik başlatma", str(exc))

    def closeEvent(self, event):
        try:
            self.worker.stop()
            self.server.stop()
        except Exception:
            pass
        event.accept()


def _plain(value: Any) -> str:
    return str(value or "—").replace("\n", " ")[:40]


# PULSE 2.5.0 — responsive card editors and consistent, accessible controls.
STYLE = STYLE



# PULSE 2.5.0 — final consistency pass: readable surfaces and visible interactive state.
STYLE = STYLE


# PULSE 2.6.0 — single final design system.
# This is deliberately last in the stylesheet so older page-specific rules cannot
# reintroduce low-contrast controls, oversized buttons, or the rainbow canvas.
STYLE = STYLE


def main():
    if os.name == "nt":
        try:
            import ctypes
            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("ENCEV.PULSE.Desktop")
        except Exception:
            pass
    # Use Qt-owned dialogs so QFileDialog/QMessageBox inherit the same workspace theme.
    try:
        QApplication.setAttribute(Qt.AA_DontUseNativeDialogs, True)
    except (AttributeError, TypeError):
        pass
    app = QApplication(sys.argv)
    app.setApplicationName(APP_NAME)
    app.setApplicationDisplayName("PULSE")
    app.setOrganizationName("ENÇEV")
    app.setFont(QFont("Segoe UI", 10))
    app.setStyle("Fusion")
    win = MainWindow()
    win.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    try:
        main()
    except Exception:
        traceback.print_exc()
        input("Başlatma hatası. Çıkmak için Enter...")

