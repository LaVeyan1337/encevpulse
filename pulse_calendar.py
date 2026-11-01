"""Date normalization and real workspace calendar events for PULSE.

The calendar is a view over existing project/task/institution-opinion records; it does
not store duplicate records or invent meeting events.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any


def iso_date(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(text, fmt).date().isoformat()
        except (TypeError, ValueError):
            continue
    return ""


def collect_calendar_events(projects: list[dict[str, Any]] | None) -> list[dict[str, str]]:
    """Build dated views from actual stored project, task, and opinion records."""
    result: list[dict[str, str]] = []
    for project in (projects or [])[:1000]:
        if not isinstance(project, dict) or project.get("archived"):
            continue
        project_id = str(project.get("id", ""))
        project_name = str(project.get("name", "İsimsiz proje"))
        project_code = str(project.get("code", ""))
        project_label = f"{project_code} · {project_name}" if project_code else project_name
        due = iso_date(project.get("due_date"))
        if due:
            result.append({"date": due, "kind": "Proje teslimi", "title": project_name,
                           "detail": f"{project_code} · Proje hedef teslim tarihi".strip(" ·"),
                           "project_id": project_id, "record_id": project_id, "source": "project"})
        for task in (project.get("tasks", []) or [])[:200]:
            if not isinstance(task, dict):
                continue
            task_due = iso_date(task.get("due_date"))
            title = str(task.get("title", "Görev"))
            if task_due:
                result.append({"date": task_due, "kind": "Görev teslimi", "title": title,
                               "detail": f"{project_label} · {task.get('assignee') or 'Atanmamış'} · {task.get('status') or 'Planlandı'}",
                               "project_id": project_id, "record_id": str(task.get("id", "")), "source": "task"})
        for opinion in (project.get("institution_opinions", []) or [])[:100]:
            if not isinstance(opinion, dict):
                continue
            institution = str(opinion.get("institution", "Kurum görüşü"))
            for key, kind, suffix in (
                ("requested_date", "Görüş talebi", "Görüş talebi gönderildi"),
                ("due_date", "Görüş hedef tarihi", "Görüş hedef tarihi"),
                ("received_date", "Görüş dönüşü", "Görüş alındı"),
            ):
                event_date = iso_date(opinion.get(key))
                if event_date:
                    result.append({"date": event_date, "kind": kind, "title": institution,
                                   "detail": f"{project_label} · {suffix} · {opinion.get('status', 'Durum yok')}",
                                   "project_id": project_id, "record_id": institution, "source": "opinion"})
    result.sort(key=lambda item: (item["date"], item["kind"].casefold(), item["title"].casefold()))
    return result
