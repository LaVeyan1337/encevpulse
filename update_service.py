from __future__ import annotations

import hashlib
import json
import re
import shutil
import tempfile
import zipfile
from pathlib import Path, PurePosixPath
from typing import Any


def _read_current_version() -> str:
    try:
        value = Path(__file__).with_name("VERSION.txt").read_text(encoding="utf-8").strip()
        if re.fullmatch(r"\d+(?:\.\d+){1,3}", value):
            return value
    except OSError:
        pass
    return "2.7.0"


CURRENT_VERSION = _read_current_version()
MANIFEST_NAME = "latest.json"
UPDATES_DIR_NAME = "updates"
REQUIRED_FILES = {"pulse_app.py", "pulse_core.py", "pulse_collector.py", "pulse_workspace.py", "pulse_workspace_ui.py", "pulse_petition.py", "VERSION.txt", "requirements.txt", "START_PULSE.bat", "INSTALL.bat", "PULSE_SETUP.bat", "RUN_TESTS.bat", "update_service.py", "pulse_updater.py", "pulse_dates.py", "pulse_paths.py", "pulse_notification_policy.py", "pulse_theme.py", "pulse_theme_tokens.py", "pulse_calendar.py", "pulse_documents.py", "assets/stitch_overview.html", "assets/stitch_tasks.html", "assets/stitch_design.css", "assets/stitch_app.js", "migrate_shortcuts.py", "migrate_shortcuts.ps1", "Launch-Pulse.ps1", "README.txt", "CHANGELOG.txt", "assets/pulse.ico", "assets/pulse_icon.png", "assets/pulse_logo_white.png", "browser_extension/manifest.json", "browser_extension/background.js", "browser_extension/content.js", "browser_extension/popup.html", "browser_extension/popup.js", "browser_extension/popup.css", "browser_extension/icons/pulse16.png", "browser_extension/icons/pulse32.png", "browser_extension/icons/pulse48.png", "browser_extension/icons/pulse128.png", "PULSE_EKLENTI_KURULUM.bat", "PULSE_EKLENTI_GUNCELLEME_REHBERI.txt"}


def version_tuple(value: str) -> tuple[int, ...]:
    text = str(value).strip()
    if not re.fullmatch(r"\d+(?:\.\d+){1,3}", text):
        return ()
    return tuple(int(part) for part in text.split("."))


def is_newer(remote: str, current: str = CURRENT_VERSION) -> bool:
    remote_v, current_v = version_tuple(remote), version_tuple(current)
    if not remote_v or not current_v:
        return False
    length = max(len(remote_v), len(current_v))
    return remote_v + (0,) * (length - len(remote_v)) > current_v + (0,) * (length - len(current_v))


def read_manifest(shared_root: str | Path) -> dict[str, Any] | None:
    path = Path(shared_root) / UPDATES_DIR_NAME / MANIFEST_NAME
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            return None
        version = str(payload.get("version", "")).strip()
        package = str(payload.get("package", "")).strip()
        sha256 = str(payload.get("sha256", "")).strip().lower()
        # A plain filename only: separators are forbidden on both Windows and POSIX.
        if not version_tuple(version) or not package or "/" in package or "\\" in package or package in {".", ".."} or not package.lower().endswith(".zip"):
            return None
        if len(sha256) != 64 or any(c not in "0123456789abcdef" for c in sha256):
            return None
        return {"version": version, "package": package, "sha256": sha256, "notes": str(payload.get("notes", ""))[:4000]}
    except (OSError, ValueError, TypeError):
        return None


def find_update(shared_root: str | Path, current: str = CURRENT_VERSION) -> dict[str, Any] | None:
    manifest = read_manifest(shared_root)
    if not manifest or not is_newer(manifest["version"], current):
        return None
    package_path = Path(shared_root) / UPDATES_DIR_NAME / manifest["package"]
    try:
        if not package_path.is_file():
            return None
        return {**manifest, "package_path": str(package_path)}
    except OSError:
        return None


def copy_verified_package(update: dict[str, Any]) -> Path:
    """Copy while hashing the exact bytes written locally, avoiding a share-read/copy race."""
    source = Path(str(update["package_path"]))
    expected = str(update["sha256"]).lower()
    temp_dir = Path(tempfile.mkdtemp(prefix="PULSE_update_"))
    target = temp_dir / source.name
    digest = hashlib.sha256()
    try:
        with source.open("rb") as src, target.open("wb") as dst:
            for chunk in iter(lambda: src.read(1024 * 1024), b""):
                digest.update(chunk)
                dst.write(chunk)
            dst.flush()
        if digest.hexdigest().lower() != expected:
            raise ValueError("Güncelleme dosyasının SHA-256 doğrulaması başarısız. Paket yayınını yeniden yapın.")
        return target
    except Exception:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise


def _safe_member_name(name: str) -> bool:
    # Normalize both separator types before checking (tests may run on POSIX, clients on Windows).
    normalized = str(name).replace("\\", "/")
    p = PurePosixPath(normalized)
    has_windows_drive = len(normalized) >= 2 and normalized[0].isalpha() and normalized[1] == ":"
    return bool(normalized) and not p.is_absolute() and not has_windows_drive and not normalized.startswith("//") and ".." not in p.parts and not normalized.startswith("/")


def validate_package(package: Path, expected_version: str | None = None) -> None:
    with zipfile.ZipFile(package) as archive:
        names = archive.namelist()
        if not names:
            raise ValueError("Güncelleme paketi boş.")
        seen_names: set[str] = set()
        for info in archive.infolist():
            if not _safe_member_name(info.filename):
                raise ValueError("Güncelleme paketinde güvenli olmayan dosya yolu var.")
            normalized = str(PurePosixPath(info.filename.replace("\\", "/")))
            if normalized in seen_names:
                raise ValueError("Güncelleme paketinde yinelenen dosya yolu var.")
            seen_names.add(normalized)
        files = {str(PurePosixPath(name.replace("\\", "/"))) for name in names if not name.endswith(("/", "\\"))}
        missing = REQUIRED_FILES - files
        if missing:
            raise ValueError("Güncelleme paketi eksik dosya içeriyor: " + ", ".join(sorted(missing)))
        if expected_version:
            archived_version = archive.read("VERSION.txt").decode("utf-8-sig").strip()
            if archived_version != expected_version:
                raise ValueError(f"Yayın sürümü ({expected_version}) ile paket içindeki VERSION.txt ({archived_version}) uyuşmuyor.")
