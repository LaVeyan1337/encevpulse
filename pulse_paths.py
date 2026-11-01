"""Stable per-user data paths and non-destructive ENCTakipPulse -> PULSE migration."""
from __future__ import annotations

import os
import shutil
from pathlib import Path


def local_app_data_root() -> Path:
    return Path(os.environ.get("LOCALAPPDATA") or Path.home())


def pulse_data_dir() -> Path:
    """Return %LOCALAPPDATA%/PULSE, copying legacy files without deleting/overwriting them."""
    root = local_app_data_root()
    target = root / "PULSE"
    legacy = root / "ENCTakipPulse"
    try:
        target.mkdir(parents=True, exist_ok=True)
        if legacy.is_dir() and legacy.resolve() != target.resolve():
            # Copy only missing files. Existing PULSE state always wins, and the old
            # directory remains as a fallback rather than being removed by migration.
            for source in legacy.rglob("*"):
                try:
                    relative = source.relative_to(legacy)
                    destination = target / relative
                    if source.is_dir():
                        destination.mkdir(parents=True, exist_ok=True)
                    elif source.is_file() and not destination.exists():
                        destination.parent.mkdir(parents=True, exist_ok=True)
                        shutil.copy2(source, destination)
                except (OSError, shutil.Error):
                    # One inaccessible cache/log must not prevent the app from opening.
                    continue
    except OSError:
        # Fall back to the legacy path if the preferred location is not writable.
        try:
            legacy.mkdir(parents=True, exist_ok=True)
            return legacy
        except OSError:
            return root / "PULSE"
    return target
