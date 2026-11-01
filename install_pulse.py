from __future__ import annotations

import os
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

from pulse_paths import pulse_data_dir

EXCLUDE = shutil.ignore_patterns(
    "__pycache__", ".pytest_cache", ".git", "tests", "build", "dist", "build_pulse", "dist_pulse",
    ".pulse-update-stage-*", ".pulse-update-backup-*", "*.pyc", "*.pyo",
)


def _run(command: list[str], *, cwd: Path | None = None) -> None:
    subprocess.run(command, cwd=str(cwd) if cwd else None, check=True)


def install() -> Path:
    if os.name != "nt":
        raise RuntimeError("Bu kurulum paketi Windows içindir.")
    py = shutil.which("py")
    if not py:
        raise RuntimeError("Python Launcher (py.exe) bulunamadı. Python 3 kurulmalı.")
    source = Path(__file__).resolve().parent
    local = Path(os.environ.get("LOCALAPPDATA") or Path.home())
    target = local / "Programs" / "PULSE"
    target.parent.mkdir(parents=True, exist_ok=True)

    # Move existing installation to a dated backup before replacing files. No user or
    # shared data lives here; local settings/notes are in %LOCALAPPDATA%\PULSE.
    same_directory = source == target.resolve()
    backup: Path | None = None
    if not same_directory:
        if target.exists():
            stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup = target.with_name(f"PULSE.backup_{stamp}")
            shutil.move(str(target), str(backup))
        try:
            shutil.copytree(source, target, ignore=EXCLUDE)
        except Exception:
            if target.exists():
                shutil.rmtree(target, ignore_errors=True)
            if backup and backup.exists() and not target.exists():
                shutil.move(str(backup), str(target))
            raise

    requirements = target / "requirements.txt"
    if not requirements.is_file():
        raise FileNotFoundError(f"requirements.txt bulunamadı: {requirements}")
    _run([py, "-3", "-m", "pip", "install", "-r", str(requirements)], cwd=target)

    # Copy/migrate settings and private notes conservatively; the source directory is
    # kept untouched and missing files only are migrated.
    pulse_data_dir()
    migration = target / "migrate_shortcuts.py"
    _run([py, "-3", str(migration), "--app-dir", str(target), "--force"], cwd=target)
    if backup:
        # Keep only the newest three installation backups; no user data is touched.
        backups = sorted(target.parent.glob("PULSE.backup_*"), key=lambda p: p.stat().st_mtime, reverse=True)
        for old in backups[3:]:
            shutil.rmtree(old, ignore_errors=True)
    try:
        subprocess.Popen([
            str(Path(os.environ.get("SystemRoot", r"C:\Windows")) / "System32" / "WindowsPowerShell" / "v1.0" / "powershell.exe"),
            "-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", str(target / "Launch-Pulse.ps1"),
        ], cwd=str(target), creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    except OSError:
        # Installation succeeded even if automatic launch is blocked; the shortcut remains.
        pass
    return target


def main() -> int:
    try:
        target = install()
        try:
            installed_version = (target / "VERSION.txt").read_text(encoding="utf-8").strip()
        except OSError:
            installed_version = "bilinmiyor"
        print(f"\nPULSE {installed_version} kurulumu tamamlandı.")
        print(f"Kurulum konumu: {target}")
        print("Eski ENCTakip kısayolları temizlendi; PULSE kısayolları oluşturuldu.")
        print("Kullanıcı ayarları ve Notlarım korundu; ortak proje/dilekçe verileri silinmedi.")
        return 0
    except subprocess.CalledProcessError as exc:
        print(f"Kurulum sırasında komut başarısız oldu (kod {exc.returncode}).")
        return int(exc.returncode or 1)
    except Exception as exc:
        print(f"PULSE kurulumu başarısız: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
