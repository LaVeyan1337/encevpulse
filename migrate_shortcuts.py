from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

from pulse_paths import pulse_data_dir

try:
    VERSION = (Path(__file__).resolve().with_name("VERSION.txt").read_text(encoding="utf-8").strip() or "2.7.0")
except OSError:
    VERSION = "2.7.0"


def migrate(app_dir: Path, force: bool = False, quiet: bool = False) -> int:
    if os.name != "nt":
        return 0
    app_dir = app_dir.resolve()
    data_dir = pulse_data_dir()
    marker = data_dir / "shortcut_migration.json"
    if not force:
        try:
            saved = json.loads(marker.read_text(encoding="utf-8"))
            if saved.get("version") == VERSION and Path(saved.get("app_dir", "")).resolve() == app_dir:
                return 0
        except (OSError, ValueError, TypeError):
            pass
    script = app_dir / "migrate_shortcuts.ps1"
    if not script.is_file():
        if not quiet:
            print(f"Kısayol geçiş betiği bulunamadı: {script}")
        return 1
    powershell = Path(os.environ.get("SystemRoot", r"C:\Windows")) / "System32" / "WindowsPowerShell" / "v1.0" / "powershell.exe"
    if not powershell.is_file():
        powershell = Path("powershell.exe")
    command = [str(powershell), "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(script), "-AppDir", str(app_dir), "-DataDir", str(data_dir)]
    try:
        result = subprocess.run(command, check=False, capture_output=quiet, text=True, timeout=90)
    except (OSError, subprocess.SubprocessError) as exc:
        if not quiet:
            print(f"Kısayollar güncellenemedi: {exc}")
        return 1
    if result.returncode != 0:
        if not quiet:
            print(getattr(result, "stdout", "") or "")
            print(getattr(result, "stderr", "") or "Kısayol geçişi başarısız.")
        return int(result.returncode or 1)
    try:
        marker.parent.mkdir(parents=True, exist_ok=True)
        marker.write_text(json.dumps({"version": VERSION, "app_dir": str(app_dir)}, ensure_ascii=False, indent=2), encoding="utf-8")
    except OSError:
        pass
    if not quiet and getattr(result, "stdout", None):
        print(result.stdout)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Eski ENCTakip kısayollarını PULSE'a geçirir.")
    parser.add_argument("--app-dir", default=str(Path(__file__).resolve().parent))
    parser.add_argument("--force", action="store_true", help="Önceden çalışmış olsa da geçişi yeniden uygula.")
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args()
    return migrate(Path(args.app_dir), force=args.force, quiet=args.quiet)


if __name__ == "__main__":
    raise SystemExit(main())
