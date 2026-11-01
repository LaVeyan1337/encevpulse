"""Turkish date display/parsing helpers shared by Pulse screens."""
from __future__ import annotations
from datetime import datetime
from typing import Any


def format_date_tr(value: Any) -> str:
    """Render persisted ISO dates in the company-wide Turkish DD.MM.YYYY format."""
    text = str(value or "").strip()
    if not text:
        return ""
    for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d.%m.%y"):
        try:
            return datetime.strptime(text, fmt).strftime("%d.%m.%Y")
        except ValueError:
            continue
    return text


def parse_date_tr(value: Any, field_label: str = "Tarih") -> str:
    """Accept Turkish local dates and legacy ISO input; persist a sortable ISO date."""
    text = str(value or "").strip()
    if not text:
        return ""
    for fmt in ("%d.%m.%Y", "%d.%m.%y", "%Y-%m-%d"):
        try:
            parsed = datetime.strptime(text, fmt).date()
            if parsed.strftime(fmt) == text:
                return parsed.isoformat()
        except ValueError:
            continue
    raise ValueError(f"{field_label}: tarihi GG.AA.YYYY biçiminde gir (ör. 13.10.2026).")
