from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import time
import zipfile
from datetime import datetime
from pathlib import Path
from pulse_paths import pulse_data_dir

from update_service import validate_package


def write_log(message: str) -> None:
    base = pulse_data_dir()
    try:
        base.mkdir(parents=True, exist_ok=True)
        with (base / "update.log").open("a", encoding="utf-8") as stream:
            stream.write(f"[{datetime.now().isoformat(timespec='seconds')}] {message}\n")
    except OSError:
        pass


def wait_for_pid(pid: int, timeout: int = 180) -> None:
    deadline = time.time() + timeout
    if os.name != "nt":
        while time.time() < deadline:
            try:
                os.kill(pid, 0)
            except ProcessLookupError:
                return
            except PermissionError as exc:
                raise PermissionError("Pulse işleminin kapandığı doğrulanamadı; güvenlik için güncelleme durduruldu.") from exc
            time.sleep(0.5)
        raise TimeoutError("Pulse uygulaması kapanmadığı için güncelleme uygulanamadı.")

    import ctypes
    from ctypes import wintypes
    PROCESS_SYNCHRONIZE = 0x00100000
    WAIT_OBJECT_0 = 0x00000000
    WAIT_TIMEOUT = 0x00000102
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel32.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel32.OpenProcess.restype = wintypes.HANDLE
    kernel32.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
    kernel32.WaitForSingleObject.restype = wintypes.DWORD
    kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel32.CloseHandle.restype = wintypes.BOOL
    handle = kernel32.OpenProcess(PROCESS_SYNCHRONIZE, False, pid)
    if not handle:
        error = ctypes.get_last_error()
        # ERROR_INVALID_PARAMETER / ERROR_NOT_FOUND mean the process no longer exists.
        if error in (87, 1168):
            return
        raise OSError(error, f"Pulse işlemi denetlenemedi (PID {pid}); güncelleme durduruldu.")
    try:
        while time.time() < deadline:
            result = kernel32.WaitForSingleObject(handle, 1000)
            if result == WAIT_OBJECT_0:
                return
            if result != WAIT_TIMEOUT:
                raise OSError(f"Pulse işlemi beklenirken Windows sonucu: {result}")
        raise TimeoutError("Pulse uygulaması kapanmadığı için güncelleme uygulanamadı.")
    finally:
        kernel32.CloseHandle(handle)


def _safe_extract(package: Path, stage: Path, version: str) -> None:
    validate_package(package, expected_version=version)
    with zipfile.ZipFile(package) as archive:
        for info in archive.infolist():
            # validate_package checks slash and backslash traversal before extractall.
            archive.extract(info, stage)


def _rollback(target: Path, backup: Path, written_files: set[Path], existed_before: set[Path]) -> None:
    for relative in written_files:
        destination = target / relative
        saved = backup / relative
        try:
            if saved.is_file():
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(saved, destination)
            elif relative not in existed_before:
                destination.unlink(missing_ok=True)
        except OSError as exc:
            write_log(f"Geri alma hatası ({relative}): {exc}")


def _trim_backups(target: Path, keep: int = 3) -> None:
    backups = sorted(
        (p for p in target.glob(".pulse-update-backup-*") if p.is_dir()),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    for old in backups[keep:]:
        shutil.rmtree(old, ignore_errors=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pid", type=int, required=True)
    parser.add_argument("--package", required=True)
    parser.add_argument("--target", required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--launcher", default="START_PULSE.bat")
    args = parser.parse_args()
    package = Path(args.package).resolve()
    target = Path(args.target).resolve()
    if not target.is_dir():
        raise FileNotFoundError(f"Uygulama klasörü bulunamadı: {target}")
    if not package.is_file():
        raise FileNotFoundError(f"Güncelleme paketi bulunamadı: {package}")

    # Fully validate the archive before waiting for or changing the running application.
    validate_package(package, expected_version=args.version)
    write_log(f"{args.version} güncellemesi başlatıldı; PID {args.pid} bekleniyor.")
    wait_for_pid(args.pid)

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    stage = target / (".pulse-update-stage-" + str(os.getpid()))
    backup = target / (".pulse-update-backup-" + stamp)
    stage.mkdir(parents=True, exist_ok=False)
    backup.mkdir(parents=True, exist_ok=False)
    written_files: set[Path] = set()
    existed_before: set[Path] = set()
    try:
        _safe_extract(package, stage, args.version)
        release_files = [p for p in stage.rglob("*") if p.is_file()]
        if not release_files:
            raise ValueError("Güncelleme paketi dosya içermiyor.")
        for source in release_files:
            relative = source.relative_to(stage)
            destination = target / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            if destination.exists() and destination.is_file():
                existed_before.add(relative)
                saved = backup / relative
                saved.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(destination, saved)
            elif destination.exists() and destination.is_dir():
                raise IsADirectoryError(f"Güncellenecek dosyanın yerinde klasör var: {destination}")
            # Track the path before copying so a partial write can also be rolled back.
            written_files.add(relative)
            shutil.copy2(source, destination)

        launcher = target / args.launcher
        if not launcher.is_file():
            raise FileNotFoundError("Başlatıcı bulunamadı: " + str(launcher))
        if os.name == "nt":
            subprocess.Popen(["cmd.exe", "/c", "start", "", str(launcher)], cwd=str(target), close_fds=True)
        else:
            subprocess.Popen([sys.executable, str(target / "pulse_app.py")], cwd=str(target), close_fds=True)
        shutil.rmtree(stage, ignore_errors=True)
        _trim_backups(target)
        # The verified package is in an app-specific temporary folder; remove it after success.
        shutil.rmtree(package.parent, ignore_errors=True)
        write_log(f"{args.version} güncellemesi uygulandı; uygulama yeniden başlatıldı.")
        return 0
    except Exception as exc:
        _rollback(target, backup, written_files, existed_before)
        shutil.rmtree(stage, ignore_errors=True)
        write_log(f"Güncelleme başarısız; geri alma çalıştırıldı: {exc}")
        raise


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        write_log(f"HATA: {exc}")
        raise SystemExit(1)
