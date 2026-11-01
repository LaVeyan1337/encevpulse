"""Safe, shallow directory listing helpers for the PULSE Documents workspace.

Listings are non-recursive by design: the company share is large and may be remote.
Call ``scan_directory`` from a worker thread, never directly on the GUI thread.
"""
from __future__ import annotations

import os
from datetime import datetime
from pathlib import Path
from typing import Any


def scan_directory(raw_path: str, limit: int = 1200) -> tuple[list[dict[str, Any]], str]:
    path_text = str(raw_path or "").strip()
    if not path_text:
        return [], "Klasör yolu girilmedi."
    path = Path(path_text).expanduser()
    try:
        if not path.exists():
            return [], f"Klasör bulunamadı veya erişilemiyor: {path_text}"
        if not path.is_dir():
            return [], "Seçilen yol bir klasör değil."
        entries: list[dict[str, Any]] = []
        truncated = False
        with os.scandir(path) as it:
            for entry in it:
                # Avoid following symbolic links/junctions outside the chosen root.
                if entry.name.startswith("."):
                    continue
                try:
                    is_dir = entry.is_dir(follow_symlinks=False)
                    if not is_dir and not entry.is_file(follow_symlinks=False):
                        continue
                    stat = entry.stat(follow_symlinks=False)
                    entries.append({
                        "name": entry.name,
                        "path": str(path / entry.name),
                        "is_dir": is_dir,
                        "size": 0 if is_dir else int(stat.st_size),
                        "modified": datetime.fromtimestamp(stat.st_mtime).strftime("%d.%m.%Y %H:%M"),
                        "suffix": "" if is_dir else Path(entry.name).suffix.casefold(),
                    })
                except (OSError, PermissionError):
                    continue
                if len(entries) >= max(1, min(int(limit), 5000)):
                    truncated = True
                    break
        entries.sort(key=lambda row: (not row["is_dir"], row["name"].casefold()))
        message = f"İlk {len(entries)} kayıt listelendi; alt klasörlere girerek devam edebilirsin." if truncated else f"{len(entries)} öğe"
        return entries, message
    except (OSError, PermissionError, ValueError) as exc:
        return [], f"Klasör listelenemedi: {exc}"
