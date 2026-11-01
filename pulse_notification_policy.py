"""Noise-controlled policy for Windows tray notifications.

The in-app notification history still records operational events. Only a small,
explicitly important subset is allowed to create Windows desktop toasts.
"""
from __future__ import annotations

from collections import deque
import time


DESKTOP_NOTIFICATION_TITLES = frozenset({
    "Yeni mesaj",
    "Hesap çakışması",
    "Dilekçe sırası sende",
    "Dilekçe dosyasında hareketsizlik",
    "e-ÇED hesabı başka bilgisayarda",
})

# Some notices naturally change their text as time passes. Cool them down by title,
# not by the full text, so a changing minute count cannot bypass the duplicate guard.
_TITLE_COOLDOWN_SECONDS = {
    "Hesap çakışması": 300,
    "Dilekçe sırası sende": 180,
    "Dilekçe dosyasında hareketsizlik": 900,
    "e-ÇED hesabı başka bilgisayarda": 300,
}


class NotificationLimiter:
    """Allow only relevant, non-repetitive, rate-limited Windows tray toasts."""

    def __init__(self, *, max_per_window: int = 3, window_seconds: int = 60) -> None:
        self.max_per_window = max(1, int(max_per_window))
        self.window_seconds = max(1, int(window_seconds))
        self._recent: deque[float] = deque()
        self._last_shown: dict[str, float] = {}

    def should_show(self, title: str, detail: str, *, now: float | None = None) -> bool:
        title = str(title or "").strip()
        if title not in DESKTOP_NOTIFICATION_TITLES:
            return False
        current = time.monotonic() if now is None else float(now)
        while self._recent and current - self._recent[0] >= self.window_seconds:
            self._recent.popleft()

        if title in _TITLE_COOLDOWN_SECONDS:
            key = title
            cooldown = _TITLE_COOLDOWN_SECONDS[title]
        else:
            # Permit distinct messages, but suppress an accidental duplicate delivery.
            key = title + "\x1f" + str(detail or "").strip().casefold()
            cooldown = 45

        last = self._last_shown.get(key)
        if last is not None and current - last < cooldown:
            return False
        if len(self._recent) >= self.max_per_window:
            return False

        self._last_shown[key] = current
        self._recent.append(current)
        # Bound memory without resetting the active cooldowns.
        if len(self._last_shown) > 2000:
            cutoff = current - 3600
            self._last_shown = {k: stamp for k, stamp in self._last_shown.items() if stamp >= cutoff}
        return True
