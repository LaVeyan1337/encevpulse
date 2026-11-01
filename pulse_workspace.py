"""Shared project/workspace records and private per-Windows-user notes.

The shared-folder model is intentionally dependency-light. Network operations must be
called from Pulse's monitor worker, never from the GUI thread. Role checks are useful
application controls; filesystem ACLs remain the actual security boundary.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import re
import tempfile
import time
import uuid
from datetime import date, datetime
from pathlib import Path
from typing import Any
from pulse_paths import pulse_data_dir

WORKFLOW_STAGES = [
    "Yeni kayıt", "Kapsam ve planlama", "Saha çalışması",
    "Rapor hazırlanıyor", "Kurum görüşleri isteniyor", "Kurum görüşleri bekleniyor",
    "Görüşler değerlendiriliyor", "Revizyon hazırlanıyor", "İç kalite kontrol",
    "İdare/kurum kontrolü", "Nihai rapor ve teslim", "Kapanış / arşiv",
]
PROJECT_STATUSES = ["Hazırlanıyor", "Revizyonda", "Beklemede", "Tamamlandı"]
RISK_LEVELS = ["Normal", "Dikkat", "Kritik"]
OPINION_STATUSES = ["Planlanmadı", "Görüş istendi", "Bekleniyor", "Geldi", "Revizyon istendi", "Uygun değil", "Gerekli değil"]
TASK_STATUSES = ["Planlandı", "Devam ediyor", "Bekliyor", "Revizyonda", "Tamamlandı"]
TASK_PRIORITIES = ["Normal", "Öncelikli", "Acil"]
PROJECT_TYPES = ["ÇED", "PTD", "GES", "RES", "ETL / Enerji İletim Hattı", "Maden", "Çevre izin/lisans", "İzleme", "Diğer"]
ROLES = ["Yönetici", "Proje Yöneticisi", "Biyolog", "ÇED Uzmanı", "Mühendis", "Saha Ekibi", "Diğer"]
DEFAULT_INSTITUTIONS = [
    "İl Çevre, Şehircilik ve İklim Değişikliği Müdürlüğü",
    "Doğa Koruma ve Millî Parklar Müdürlüğü",
    "Tarım ve Orman İl Müdürlüğü",
    "Devlet Su İşleri (DSİ)",
    "Orman Bölge Müdürlüğü",
    "Kültür Varlıklarını Koruma Bölge Kurulu",
    "İl Kültür ve Turizm Müdürlüğü",
    "Karayolları Bölge Müdürlüğü",
    "TEİAŞ",
    "BOTAŞ",
    "Maden Tetkik ve Arama (MTA)",
    "Meteoroloji Bölge Müdürlüğü",
    "İl Sağlık Müdürlüğü",
    "Belediye / İl Özel İdaresi",
    "İl Afet ve Acil Durum Müdürlüğü",
]


def _slug(value: Any) -> str:
    text = str(value or "unknown").strip().casefold()
    return re.sub(r"[^a-z0-9_.-]+", "_", text)[:80] or "unknown"


def _key(value: Any) -> str:
    return hashlib.sha256(str(value or "").strip().casefold().encode("utf-8")).hexdigest()[:32]


def _clean(value: Any, cap: int = 500) -> str:
    return re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", str(value or "")).strip()[:cap]


def _date_text(value: Any, field_label: str) -> str:
    text = _clean(value, 10)
    if not text:
        return ""
    try:
        parsed = date.fromisoformat(text)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field_label} YYYY-AA-GG biçiminde geçerli bir tarih olmalı.") from exc
    if parsed.isoformat() != text:
        raise ValueError(f"{field_label} YYYY-AA-GG biçiminde olmalı.")
    return text


EMAIL_RE = re.compile(r"(?i)(?<![\w.+-])[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}(?![\w.-])")
PHONE_RE = re.compile(r"(?<!\d)(?:(?:\+?90|0090)\s*[-(). ]*)?0?([2-5]\d{2})[\s().-]*(\d{3})[\s.-]*(\d{2})[\s.-]*(\d{2})(?!\d)")


def _extract_emails(text: Any) -> list[str]:
    found = []
    for match in EMAIL_RE.findall(str(text or "")):
        email = match.strip(".,;:()[]<>").lower()
        if email and email not in found:
            found.append(email)
    return found[:10]


def _extract_phones(text: Any) -> list[str]:
    found = []
    for match in PHONE_RE.finditer(str(text or "")):
        area, block, part_a, part_b = match.groups()
        digits = re.sub(r"\D", "", match.group(0))
        if digits.startswith("0090"):
            digits = digits[2:]
        if digits.startswith("90") and len(digits) == 12:
            normalized = "+90 " + digits[2:5] + " " + digits[5:8] + " " + digits[8:10] + " " + digits[10:12]
        elif len(digits) == 11 and digits.startswith("0"):
            normalized = "+90 " + digits[1:4] + " " + digits[4:7] + " " + digits[7:9] + " " + digits[9:11]
        elif len(digits) == 10:
            normalized = "+90 " + digits[:3] + " " + digits[3:6] + " " + digits[6:8] + " " + digits[8:10]
        else:
            continue
        if normalized not in found:
            found.append(normalized)
    return found[:10]


def _expert_name_from_note(note: Any) -> str:
    """Conservative fallback for notes explicitly labelled with an expert/contact name."""
    text = str(note or "")
    match = re.search(r"(?im)(?:uzman(?:ı|i)?|ilgili kişi|irtibat kişisi|yetkili kişi)\s*[:：-]\s*([^\n;|,]{3,100})", text)
    if not match:
        return ""
    candidate = re.sub(r"\s+", " ", match.group(1)).strip(" .:-")
    if re.search(r"\d|@", candidate) or len(candidate.split()) < 2:
        return ""
    return candidate[:100]


def _atomic_json(path: Path, obj: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    finally:
        try:
            os.unlink(tmp)
        except OSError:
            pass


class WorkspaceStore:
    def __init__(self, shared_root: str | Path):
        self.root = Path(str(shared_root)) / "workspace"
        self.projects_dir = self.root / "projects"
        self.profiles_dir = self.root / "profiles"
        self.contacts_dir = self.root / "contacts"
        self.hidden_contacts_path = self.root / "hidden_contacts.json"
        self.events_dir = self.root / "events"
        self.avatars_dir = self.root / "avatars"
        # Avoid rescanning unchanged legacy projects for contact backfill on every polling tick.
        self._contact_sync_signatures: dict[str, tuple[int, float]] = {}

    def ensure(self) -> None:
        for p in (self.projects_dir, self.profiles_dir, self.contacts_dir, self.events_dir, self.avatars_dir):
            p.mkdir(parents=True, exist_ok=True)

    def _event(self, actor: str, kind: str, detail: str, project_id: str = "") -> None:
        try:
            self.ensure()
            rec = {"id": uuid.uuid4().hex, "at": time.time(), "actor": _clean(actor, 80),
                   "kind": _clean(kind, 80), "detail": _clean(detail, 300), "project_id": _clean(project_id, 50)}
            _atomic_json(self.events_dir / f"{int(rec['at']*1000)}_{rec['id'][:10]}.json", rec)
        except OSError:
            # Event history must not prevent an otherwise safe primary action.
            pass

    def _profile_path(self, username: str) -> Path:
        return self.profiles_dir / f"{_key(username)}.json"

    def _project_path(self, project_id: str) -> Path:
        return self.projects_dir / f"{_slug(project_id)}.json"

    def _hidden_contact_ids(self) -> set[str]:
        try:
            payload = json.loads(self.hidden_contacts_path.read_text(encoding="utf-8")) if self.hidden_contacts_path.exists() else {}
            if isinstance(payload, dict):
                return {str(key) for key in payload}
            if isinstance(payload, list):
                return {str(value) for value in payload}
        except (OSError, ValueError, UnicodeError):
            pass
        return set()

    def hide_contact(self, contact_id: str, actor: str, admin_users: list[str] | None = None) -> dict[str, Any]:
        """Hide a contact from the shared address book without deleting project source data."""
        self.ensure()
        actor = _clean(actor, 80)
        if not self._is_admin(actor, admin_users):
            raise PermissionError("Ortak kurum rehberinden kayıt kaldırma işlemi yalnızca yöneticilere açıktır.")
        key = _clean(contact_id, 120)
        if not key or not re.fullmatch(r"[A-Za-z0-9_.-]{1,120}", key):
            raise ValueError("Geçersiz kurum rehberi kaydı.")
        contact_path = self.contacts_dir / f"{key}.json"
        if not contact_path.is_file():
            raise FileNotFoundError("Kurum rehberi kaydı bulunamadı; listeyi yenileyip tekrar dene.")
        try:
            current = json.loads(self.hidden_contacts_path.read_text(encoding="utf-8")) if self.hidden_contacts_path.exists() else {}
        except (OSError, ValueError, UnicodeError):
            current = {}
        if not isinstance(current, dict):
            current = {}
        current[key] = {"id": key, "hidden_at": time.time(), "actor": actor}
        _atomic_json(self.hidden_contacts_path, current)
        self._event(actor, "Kurum rehberi kaydı kaldırıldı", f"{key} ortak rehberden gizlendi; proje kaynak verileri korundu.")
        return {"id": key, "hidden": True}

    def contacts(self) -> list[dict[str, Any]]:
        """Shared address book collected from saved project institution opinions."""
        self.ensure()
        out = []
        try:
            paths = list(self.contacts_dir.glob("*.json"))[:5000]
        except OSError:
            return []
        hidden_ids = self._hidden_contact_ids()
        for path in paths:
            try:
                value = json.loads(path.read_text(encoding="utf-8"))
                if not isinstance(value, dict):
                    continue
                if str(value.get("id", "")) in hidden_ids:
                    continue
                if value.get("expert_name") or value.get("phones") or value.get("emails"):
                    out.append(value)
            except (OSError, ValueError, UnicodeError):
                continue
        return sorted(out, key=lambda c: (str(c.get("institution", "")).casefold(), str(c.get("expert_name", "")).casefold(), str(c.get("contact_text", "")).casefold()))[:3000]

    def _sync_project_contacts(self, project: dict[str, Any]) -> int:
        """Upsert institution contacts even when the opinion contains only phone/email."""
        self.ensure()
        saved = 0
        project_ref = {"id": str(project.get("id", "")), "code": _clean(project.get("code"), 50), "name": _clean(project.get("name"), 180)}
        for opinion in project.get("institution_opinions", []) or []:
            if not isinstance(opinion, dict):
                continue
            institution = _clean(opinion.get("institution"), 160)
            note = _clean(opinion.get("note"), 1000)
            contact_text = " ".join(x for x in (str(opinion.get("expert_contact", "")), note) if x)
            phones = _extract_phones(contact_text)
            emails = _extract_emails(contact_text)
            name = _clean(opinion.get("expert_name") or _expert_name_from_note(note), 100)
            if not institution or (not name and not phones and not emails):
                continue
            display_name = name or "İsim belirtilmedi"
            # Keep distinct unnamed contacts from overwriting each other within the same institution.
            identity = institution.casefold() + "|" + (name.casefold() if name else "unnamed|" + re.sub(r"\s+", " ", contact_text).casefold())
            key = _key(identity)
            path = self.contacts_dir / f"{key}.json"
            existing = {}
            if path.exists():
                try:
                    existing = json.loads(path.read_text(encoding="utf-8"))
                except Exception:
                    existing = {}
            refs = {str(x.get("id", "")): x for x in existing.get("projects", []) if isinstance(x, dict) and x.get("id")}
            if project_ref["id"]:
                refs[project_ref["id"]] = project_ref
            merged_phones = list(dict.fromkeys(list(existing.get("phones", [])) + phones))[:20]
            merged_emails = list(dict.fromkeys(list(existing.get("emails", [])) + emails))[:20]
            record = {"id": key, "institution": institution, "expert_name": display_name,
                      "phones": merged_phones, "emails": merged_emails,
                      "contact_text": _clean(opinion.get("expert_contact"), 300),
                      "projects": list(refs.values())[:100], "source": "project_opinion"}
            previous_core = {k: existing.get(k) for k in record}
            if previous_core == record:
                continue
            record["updated_at"] = time.time()
            _atomic_json(path, record)
            saved += 1
        return saved

    def profiles(self) -> list[dict[str, Any]]:
        self.ensure()
        out = []
        try:
            paths = list(self.profiles_dir.glob("*.json"))[:1000]
        except OSError:
            return []
        for p in paths:
            try:
                row = json.loads(p.read_text(encoding="utf-8"))
                if isinstance(row, dict) and row.get("username"):
                    out.append(row)
            except (OSError, ValueError, UnicodeError):
                continue
        return sorted(out, key=lambda p: str(p.get("display_name", p.get("username", ""))).casefold())[:300]

    def ensure_profile(self, username: str, display_name: str = "", admin_users: list[str] | None = None) -> dict[str, Any]:
        username = _clean(username, 80)
        if not username:
            raise ValueError("Kullanıcı adı boş olamaz.")
        self.ensure()
        path = self._profile_path(username)
        if path.exists():
            try:
                return json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                # Never overwrite a broken profile silently.
                raise ValueError(f"Profil kaydı okunamıyor: {username}")
        # Bootstrap administrator is fixed in code; a local client config must not grant roles.
        role = "Yönetici" if username.casefold() == "burak" else "Diğer"
        now = time.time()
        profile = {
            "username": username, "display_name": _clean(display_name or username, 100),
            "email": "", "job_title": "", "phone": "", "expertise": [], "avatar_file": "", "role": role,
            "capacity_hours_week": 40, "availability": "Uygun", "created_at": now, "updated_at": now,
        }
        _atomic_json(path, profile)
        self._event(username, "Profil oluşturuldu", profile["display_name"])
        return profile

    def save_profile(self, profile: dict[str, Any], actor: str, admin_users: list[str] | None = None) -> dict[str, Any]:
        username = _clean(profile.get("username"), 80)
        actor = _clean(actor, 80)
        if not username or not actor:
            raise ValueError("Kullanıcı ve profil adı gerekli.")
        existing = None
        path = self._profile_path(username)
        if path.exists():
            try:
                existing = json.loads(path.read_text(encoding="utf-8"))
            except Exception as exc:
                raise ValueError("Mevcut profil okunamadı; üzerine yazılmadı.") from exc
        # Local config cannot grant management permission; use the bootstrapped account or shared profile role.
        actor_profile = next((p for p in self.profiles() if str(p.get("username", "")).casefold() == actor.casefold()), {})
        is_admin = actor.casefold() == "burak" or actor_profile.get("role") in {"Yönetici", "Proje Yöneticisi"}
        if (existing and actor.casefold() != username.casefold() and not is_admin) or (not existing and actor.casefold() != username.casefold() and not is_admin):
            raise PermissionError("Yalnızca kendi profilini düzenleyebilirsin; yeni profil açmak için yönetici yetkisi gerekli.")
        if existing and not is_admin:
            role = existing.get("role", "Diğer")
        elif not existing and not is_admin:
            role = "Diğer"
        else:
            role = _clean(profile.get("role", existing.get("role", "Diğer") if existing else "Diğer"), 40)
            if role not in ROLES:
                role = "Diğer"
        now = time.time()
        safe = {
            "username": username,
            "display_name": _clean(profile.get("display_name") or (existing or {}).get("display_name") or username, 100),
            "email": _clean(profile.get("email"), 160),
            "job_title": _clean(profile.get("job_title"), 100),
            "phone": _clean(profile.get("phone"), 60),
            "expertise": [_clean(x, 80) for x in (profile.get("expertise") or []) if _clean(x, 80)][:30],
            "avatar_file": Path(_clean(profile.get("avatar_file", (existing or {}).get("avatar_file", "")), 120)).name,
            "role": role,
            "capacity_hours_week": max(1, min(80, int(profile.get("capacity_hours_week", (existing or {}).get("capacity_hours_week", 40))))),
            "availability": _clean(profile.get("availability", (existing or {}).get("availability", "Uygun")), 40),
            "created_at": float((existing or {}).get("created_at", now)), "updated_at": now,
        }
        _atomic_json(path, safe)
        self._event(actor, "Profil güncellendi", f"{safe['display_name']} · {safe['role']}")
        return safe

    def projects(self) -> list[dict[str, Any]]:
        self.ensure()
        out = []
        try:
            paths = list(self.projects_dir.glob("*.json"))[:2000]
        except OSError:
            return []
        for p in paths:
            try:
                row = json.loads(p.read_text(encoding="utf-8"))
                if isinstance(row, dict) and row.get("id") and row.get("name"):
                    out.append(row)
            except (OSError, ValueError, UnicodeError):
                continue
        return sorted(out, key=lambda p: (p.get("status") == "Tamamlandı", str(p.get("due_date", "9999-99-99")), str(p.get("name", "")).casefold()))[:500]

    def _is_admin(self, actor: str, admin_users: list[str] | None = None) -> bool:
        if actor.casefold() == "burak":
            return True
        prof = next((p for p in self.profiles() if str(p.get("username", "")).casefold() == actor.casefold()), {})
        return prof.get("role") in {"Yönetici", "Proje Yöneticisi"}

    def create_project(self, payload: dict[str, Any], actor: str, admin_users: list[str] | None = None) -> dict[str, Any]:
        if not self._is_admin(actor, admin_users):
            raise PermissionError("Yeni proje açma ve ekip atama yetkisi gerekli.")
        name = _clean(payload.get("name"), 180)
        if not name:
            raise ValueError("Proje adı gerekli.")
        self.ensure()
        create_lock = self.projects_dir / ".project_create.lock"
        try:
            fd = os.open(str(create_lock), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        except FileExistsError as exc:
            # If an app crashed while creating a project, recover only an old lock.
            try:
                if time.time() - create_lock.stat().st_mtime > 120:
                    create_lock.unlink(missing_ok=True)
                    fd = os.open(str(create_lock), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                else:
                    raise RuntimeError("Başka bir proje oluşturma işlemi sürüyor; tekrar dene.") from exc
            except FileNotFoundError:
                fd = os.open(str(create_lock), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            except OSError as cleanup_exc:
                raise RuntimeError("Proje oluşturma kilidi temizlenemedi; ağ erişimini kontrol et.") from cleanup_exc
        try:
            os.write(fd, str(time.time()).encode("ascii"))
            os.close(fd)
            code = _clean(payload.get("code"), 50)
            if code and any(str(p.get("code", "")).casefold() == code.casefold() for p in self.projects()):
                raise ValueError("Bu proje kodu zaten kullanılıyor.")
            stage = _clean(payload.get("stage") or WORKFLOW_STAGES[0], 80)
            if stage not in WORKFLOW_STAGES:
                stage = WORKFLOW_STAGES[0]
            status = _clean(payload.get("status") or "Hazırlanıyor", 40)
            if status not in PROJECT_STATUSES:
                status = "Hazırlanıyor"
            opinion_input = payload.get("institution_opinions")
            if opinion_input is None:
                opinion_input = [{"institution": inst, "status": "Planlanmadı"} for inst in DEFAULT_INSTITUTIONS]
            opinions = self._sanitize_opinions(opinion_input)
            tasks = self._sanitize_tasks(payload.get("tasks") or [])
            now = time.time()
            team_members = {_clean(x, 80) for x in payload.get("team", []) if _clean(x, 80)}
            team_members.update(t["assignee"] for t in tasks if t.get("assignee"))
            if _clean(payload.get("lead"), 80):
                team_members.add(_clean(payload.get("lead"), 80))
            project = {
                "id": uuid.uuid4().hex,
                "code": code or f"P-{datetime_id(now)}-{uuid.uuid4().hex[:4].upper()}",
                "name": name, "client": _clean(payload.get("client"), 160),
                "project_type": _clean(payload.get("project_type") or "ÇED", 80),
                "province": _clean(payload.get("province"), 100), "district": _clean(payload.get("district"), 100), "status": status, "stage": stage,
                "stage_index": WORKFLOW_STAGES.index(stage), "lead": _clean(payload.get("lead"), 80),
                "team": sorted(team_members, key=str.casefold),
                "due_date": _date_text(payload.get("due_date"), "Proje hedef teslim tarihi"), "description": _clean(payload.get("description"), 5000),
                "risk_level": _clean(payload.get("risk_level") or "Normal", 20) if _clean(payload.get("risk_level") or "Normal", 20) in RISK_LEVELS else "Normal",
                "next_action": _clean(payload.get("next_action"), 300),
                "blocker": _clean(payload.get("blocker"), 500),
                "institution_opinions": opinions, "tasks": tasks, "created_by": _clean(actor, 80),
                "created_at": now, "updated_at": now, "revision": 1, "archived": False,
            }
            _atomic_json(self._project_path(project["id"]), project)
            try:
                self._sync_project_contacts(project)
            except OSError:
                self._event(actor, "Kurum rehberi uyarısı", f"{project['code']} kaydedildi ancak rehber yazılamadı", project["id"])
            self._event(actor, "Proje açıldı", f"{project['code']} · {name}", project["id"])
            return project
        finally:
            try:
                os.close(fd)
            except OSError:
                pass
            try:
                create_lock.unlink(missing_ok=True)
            except OSError:
                pass

    @staticmethod
    def _sanitize_opinions(opinions: list[dict[str, Any]]) -> list[dict[str, Any]]:
        out = []
        seen = set()
        for item in opinions[:50]:
            if not isinstance(item, dict):
                continue
            name = _clean(item.get("institution"), 160)
            if not name or name.casefold() in seen:
                continue
            seen.add(name.casefold())
            status = _clean(item.get("status") or "Planlanmadı", 40)
            if status not in OPINION_STATUSES:
                status = "Planlanmadı"
            note = _clean(item.get("note"), 1000)
            out.append({"institution": name, "status": status, "requested_date": _date_text(item.get("requested_date"), f"{name} istenme tarihi"),
                        "due_date": _date_text(item.get("due_date"), f"{name} hedef tarihi"), "received_date": _date_text(item.get("received_date"), f"{name} dönüş tarihi"),
                        "expert_name": _clean(item.get("expert_name") or _expert_name_from_note(note), 100),
                        "expert_contact": _clean(item.get("expert_contact"), 300), "note": note})
        return out

    @staticmethod
    def _sanitize_tasks(tasks: list[dict[str, Any]]) -> list[dict[str, Any]]:
        out = []
        seen = set()
        for item in (tasks or [])[:200]:
            if not isinstance(item, dict):
                continue
            title = _clean(item.get("title"), 180)
            if not title:
                continue
            task_id = _clean(item.get("id") or uuid.uuid4().hex, 40)
            if task_id in seen:
                task_id = uuid.uuid4().hex
            seen.add(task_id)
            status = _clean(item.get("status") or "Planlandı", 40)
            priority = _clean(item.get("priority") or "Normal", 40)
            if status not in TASK_STATUSES:
                status = "Planlandı"
            if priority not in TASK_PRIORITIES:
                priority = "Normal"
            try:
                estimate_hours = float(item.get("estimate_hours", 0) or 0)
                if not math.isfinite(estimate_hours):
                    estimate_hours = 0.0
            except (TypeError, ValueError):
                estimate_hours = 0.0
            estimate_hours = round(max(0.0, min(500.0, estimate_hours)), 1)
            out.append({"id": task_id, "title": title, "assignee": _clean(item.get("assignee"), 80),
                        "status": status, "priority": priority, "estimate_hours": estimate_hours,
                        "due_date": _date_text(item.get("due_date"), f"{title} hedef tarihi"),
                        "note": _clean(item.get("note"), 500)})
        return out

    def update_project(self, project_id: str, changes: dict[str, Any], actor: str,
                       admin_users: list[str] | None = None, expected_revision: int | None = None) -> dict[str, Any]:
        path = self._project_path(project_id)
        lock = path.with_suffix(".lock")
        self.ensure()
        try:
            fd = os.open(str(lock), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        except FileExistsError as exc:
            # Recover only an abandoned lock file; normal project writes last far below this threshold.
            try:
                if time.time() - lock.stat().st_mtime > 120:
                    lock.unlink(missing_ok=True)
                    fd = os.open(str(lock), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                else:
                    raise RuntimeError("Bu proje başka bir bilgisayarda güncelleniyor. Birkaç saniye sonra tekrar dene.") from exc
            except FileNotFoundError:
                fd = os.open(str(lock), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            except OSError as cleanup_exc:
                raise RuntimeError("Proje kilidi temizlenemedi; ağ erişimini kontrol et.") from cleanup_exc
        try:
            os.write(fd, str(time.time()).encode("ascii"))
            os.close(fd)
            if not path.exists():
                raise FileNotFoundError("Proje bulunamadı.")
            current = json.loads(path.read_text(encoding="utf-8"))
            if expected_revision is not None and int(current.get("revision", 1)) != int(expected_revision):
                raise RuntimeError("Proje başka bir kullanıcı tarafından değiştirilmiş. Veriyi yenileyip tekrar dene.")
            is_admin = self._is_admin(actor, admin_users)
            assigned = {str(x).casefold() for x in current.get("team", [])}
            lead = str(current.get("lead", "")).casefold()
            assigned.update(str(t.get("assignee", "")).casefold() for t in current.get("tasks", []) if t.get("assignee"))
            if not is_admin and actor.casefold() not in assigned and actor.casefold() != lead:
                raise PermissionError("Bu projeyi düzenlemek için proje ekibinde veya görevli listesinde olmalısın.")
            allowed = {"code", "name", "client", "project_type", "province", "district", "status", "stage", "lead", "team", "due_date", "description", "risk_level", "next_action", "blocker", "institution_opinions", "tasks", "archived"}
            if not is_admin:
                restricted = {"code", "name", "client", "project_type", "province", "district", "due_date", "lead", "team", "archived"}
                if any(key in changes for key in restricted):
                    raise PermissionError("Proje bilgileri ve ekip ataması yönetici/proje yöneticisi yetkisi gerektirir.")
                if "institution_opinions" in changes:
                    old_ops = {str(o.get("institution", "")).casefold(): o for o in current.get("institution_opinions", [])}
                    new_ops = {str(o.get("institution", "")).casefold(): o for o in changes.get("institution_opinions", []) if isinstance(o, dict)}
                    if set(old_ops) != set(new_ops):
                        raise PermissionError("Kurum ekleme, çıkarma ve ad değiştirme yalnızca yetkili kişilerce yapılabilir.")
                if "tasks" in changes:
                    old_tasks = {str(t.get("id")): t for t in current.get("tasks", [])}
                    new_tasks = {str(t.get("id")): t for t in changes.get("tasks", []) if isinstance(t, dict)}
                    if set(old_tasks) != set(new_tasks):
                        raise PermissionError("Görev ekleme/silme yalnızca yönetici veya proje yöneticisi tarafından yapılabilir.")
                    for task_id, old_task in old_tasks.items():
                        new_task = new_tasks[task_id]
                        for field in ("title", "assignee", "priority", "estimate_hours"):
                            old_value = old_task.get(field, 0 if field == "estimate_hours" else "")
                            new_value = new_task.get(field, 0 if field == "estimate_hours" else "")
                            if field == "estimate_hours":
                                try:
                                    changed = round(float(old_value or 0), 1) != round(float(new_value or 0), 1)
                                except (TypeError, ValueError):
                                    changed = True
                            else:
                                changed = str(old_value) != str(new_value)
                            if changed:
                                raise PermissionError("Görev tanımı, saat tahmini ve sorumlu ataması yalnızca yönetici tarafından değiştirilebilir.")
                        mutable_fields = ("status", "due_date", "note")
                        changed_task = any(str(old_task.get(field, "")) != str(new_task.get(field, "")) for field in mutable_fields)
                        assignee = str(old_task.get("assignee", "")).casefold()
                        if changed_task and assignee != actor.casefold():
                            raise PermissionError("Görevin durumu, tarihi ve takip notunu yalnızca atanmış kişi değiştirebilir.")
            for key in allowed:
                if key not in changes:
                    continue
                val = changes[key]
                if key == "name":
                    val = _clean(val, 180)
                    if not val:
                        raise ValueError("Proje adı boş olamaz.")
                elif key == "status":
                    val = _clean(val, 40)
                    if val not in PROJECT_STATUSES:
                        raise ValueError("Geçersiz proje durumu.")
                elif key == "stage":
                    val = _clean(val, 80)
                    if val not in WORKFLOW_STAGES:
                        raise ValueError("Geçersiz proje aşaması.")
                    current["stage_index"] = WORKFLOW_STAGES.index(val)
                elif key == "team":
                    val = sorted({_clean(x, 80) for x in val if _clean(x, 80)}, key=str.casefold)
                elif key == "institution_opinions":
                    val = self._sanitize_opinions(val)
                elif key == "tasks":
                    val = self._sanitize_tasks(val)
                    current_team = {str(x).casefold() for x in current.get("team", [])}
                    for task in val:
                        assignee = str(task.get("assignee", "")).strip()
                        if assignee and assignee.casefold() not in current_team:
                            current.setdefault("team", []).append(assignee)
                            current_team.add(assignee.casefold())
                elif key == "risk_level":
                    val = _clean(val, 20)
                    if val not in RISK_LEVELS:
                        val = "Normal"
                elif key in {"next_action", "blocker"}:
                    val = _clean(val, 500 if key == "blocker" else 300)
                elif key == "due_date":
                    val = _date_text(val, "Proje hedef teslim tarihi")
                elif key in {"code", "client", "project_type", "province", "district", "lead", "description"}:
                    val = _clean(val, 5000 if key == "description" else 180)
                current[key] = val
            current["updated_at"] = time.time()
            current["revision"] = int(current.get("revision", 1)) + 1
            _atomic_json(path, current)
            try:
                self._sync_project_contacts(current)
            except OSError:
                self._event(actor, "Kurum rehberi uyarısı", f"{current.get('code')} kaydedildi ancak rehber yazılamadı", project_id)
            self._event(actor, "Proje güncellendi", f"{current.get('code')} · {current.get('stage')} · {current.get('status')}", project_id)
            return current
        finally:
            try:
                os.close(fd)
            except OSError:
                pass
            try:
                lock.unlink(missing_ok=True)
            except OSError:
                pass

    def delete_project(self, project_id: str, actor: str, admin_users: list[str] | None = None,
                       expected_revision: int | None = None) -> dict[str, Any]:
        """Remove a project from the active list after making a recoverable shared backup.

        Only a workspace administrator can run this operation. The source JSON is moved
        atomically within the same share to workspace/deleted_projects; it is not erased.
        """
        self.ensure()
        if not self._is_admin(str(actor or ""), admin_users):
            raise PermissionError("Proje silme işlemi yalnızca yöneticilere açıktır.")
        project_id = str(project_id or "").strip()
        if not project_id or not re.fullmatch(r"[A-Za-z0-9_.-]{1,80}", project_id):
            raise ValueError("Geçersiz proje kimliği.")
        source = self._project_path(project_id)
        lock = source.with_suffix(".lock")
        try:
            fd = os.open(str(lock), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        except FileExistsError as exc:
            try:
                if time.time() - lock.stat().st_mtime > 120:
                    lock.unlink(missing_ok=True)
                    fd = os.open(str(lock), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                else:
                    raise RuntimeError("Bu proje başka bir bilgisayarda işleniyor. Birkaç saniye sonra tekrar dene.") from exc
            except FileNotFoundError:
                fd = os.open(str(lock), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        try:
            if not source.is_file():
                raise FileNotFoundError("Proje bulunamadı veya başka bir kullanıcı kaldırdı.")
            project = json.loads(source.read_text(encoding="utf-8"))
            if not isinstance(project, dict):
                raise ValueError("Proje kaydı okunamadı; silme yapılmadı.")
            if expected_revision is not None and int(project.get("revision", 1) or 1) != int(expected_revision):
                raise RuntimeError("Proje başka bir kullanıcı tarafından değiştirilmiş. Listeyi yenileyip tekrar dene.")
            backup_dir = self.root / "deleted_projects"
            backup_dir.mkdir(parents=True, exist_ok=True)
            stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            code = _slug(project.get("code") or project_id)
            backup = backup_dir / f"{stamp}_{code}_{project_id}.json"
            source.replace(backup)
            cleanup_warning = False
            try:
                for contact_path in self.contacts_dir.glob("*.json"):
                    try:
                        contact = json.loads(contact_path.read_text(encoding="utf-8"))
                        if not isinstance(contact, dict):
                            continue
                        linked = contact.get("projects", [])
                        if not isinstance(linked, list):
                            continue
                        filtered = [entry for entry in linked if not (isinstance(entry, dict) and str(entry.get("id", "")) == project_id)]
                        if filtered != linked:
                            contact["projects"] = filtered
                            contact["updated_at"] = time.time()
                            if not filtered and str(contact.get("source", "")) == "project_opinion" and any(
                                isinstance(entry, dict) and str(entry.get("id", "")) == project_id for entry in linked
                            ):
                                # No remaining project uses this aggregated contact: remove the orphan record.
                                contact_path.unlink(missing_ok=True)
                            else:
                                _atomic_json(contact_path, contact)
                    except (OSError, ValueError, UnicodeError):
                        cleanup_warning = True
            except OSError:
                cleanup_warning = True
            detail = f"{project.get('code', project_id)} · yedek: workspace/deleted_projects/{backup.name}"
            if cleanup_warning:
                detail += " · bazı kurum rehberi bağlantıları otomatik temizlenemedi"
            self._event(actor, "Proje kaldırıldı", detail, project_id)
            return {"id": project_id, "code": str(project.get("code", "")), "name": str(project.get("name", "")),
                    "backup": str(backup), "contact_cleanup_warning": cleanup_warning}
        finally:
            try:
                os.close(fd)
            except OSError:
                pass
            try:
                lock.unlink(missing_ok=True)
            except OSError:
                pass

    def snapshot(self) -> dict[str, Any]:
        self.ensure()
        events = []
        try:
            files = sorted(self.events_dir.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)[:100]
        except OSError:
            files = []
        for p in files:
            try:
                rec = json.loads(p.read_text(encoding="utf-8"))
                if isinstance(rec, dict):
                    events.append(rec)
            except Exception:
                continue
        projects = self.projects()
        profiles = self.profiles()
        # One-time/changed-data backfill: only changed project revisions are rescanned.
        # Project create/update writes still sync contacts immediately; this fills legacy records.
        for project in projects:
            project_id = str(project.get("id", ""))
            try:
                signature = (int(project.get("revision", 1) or 1), float(project.get("updated_at", 0) or 0))
            except (TypeError, ValueError):
                signature = (1, 0.0)
            if not project_id or self._contact_sync_signatures.get(project_id) == signature:
                continue
            try:
                self._sync_project_contacts(project)
                self._contact_sync_signatures[project_id] = signature
            except OSError:
                # Retry on the next snapshot if shared storage was temporarily unavailable.
                continue
        contacts = self.contacts()
        # Precompute the address-book display/search columns on the monitor worker.
        # Doing this in a Qt slot used to walk every contact and every linked project
        # on the GUI thread, causing a visible stall when the directory grew.
        contact_index = []
        for contact in contacts:
            linked = contact.get("projects", []) if isinstance(contact.get("projects", []), list) else []
            project_labels = []
            for item in linked:
                if not isinstance(item, dict):
                    continue
                label = " · ".join(x for x in (
                    str(item.get("name") or "").strip(), str(item.get("code") or "").strip()
                ) if x)
                if label:
                    project_labels.append(label)
            def display_value(value):
                if isinstance(value, str):
                    return value.strip()
                if isinstance(value, (list, tuple, set)):
                    return ", ".join(str(x).strip() for x in value if str(x).strip())
                return str(value).strip() if value not in (None, "") else ""
            stamp = contact.get("updated_at")
            try:
                updated_text = datetime.fromtimestamp(float(stamp)).strftime("%d.%m.%Y %H:%M") if stamp else "—"
            except (TypeError, ValueError, OSError, OverflowError):
                updated_text = "—"
            values = [str(contact.get("institution", "")), str(contact.get("expert_name", "")),
                      display_value(contact.get("phones", [])), display_value(contact.get("emails", [])),
                      ", ".join(project_labels), updated_text]
            contact_index.append({"id": str(contact.get("id", "")), "values": values,
                                  "search_text": " ".join(values).casefold()})
        active_projects = [p for p in projects if not p.get("archived") and p.get("status") != "Tamamlandı"]
        return {"projects": projects, "profiles": profiles, "contacts": contacts, "contact_index": contact_index, "workspace_events": events,
                "open_projects": len(active_projects),
                "waiting_opinions": sum(1 for p in active_projects for o in p.get("institution_opinions", []) if o.get("status") == "Bekleniyor"),
                "revision_projects": sum(1 for p in active_projects if p.get("status") == "Revizyonda"),
                "risk_projects": sum(1 for p in active_projects if p.get("risk_level") == "Kritik" or bool(str(p.get("blocker", "")).strip())),
                "critical_projects": sum(1 for p in active_projects if p.get("risk_level") == "Kritik"),
                "open_tasks": sum(1 for p in active_projects for t in p.get("tasks", []) if t.get("status") != "Tamamlandı"),
                "open_task_hours": round(sum(float(t.get("estimate_hours", 0) or 0) for p in active_projects for t in p.get("tasks", []) if t.get("status") != "Tamamlandı"), 1),
                "workspace_ok": True}


def datetime_id(stamp: float) -> str:
    from datetime import datetime
    return datetime.fromtimestamp(stamp).strftime("%y%m%d-%H%M%S")


class PrivateNotesStore:
    """Notes are local to the current Windows profile; they are not placed on the shared folder."""
    def __init__(self, path: Path | None = None):
        base = pulse_data_dir()
        self.path = path or (base / "private_notes.json")

    def list(self) -> list[dict[str, Any]]:
        try:
            data = json.loads(self.path.read_text(encoding="utf-8")) if self.path.exists() else []
            if not isinstance(data, list):
                return []
            return sorted([x for x in data if isinstance(x, dict)], key=lambda x: (not bool(x.get("pinned")), -float(x.get("updated_at", 0) or 0)))[:1000]
        except Exception:
            return []

    def save(self, note: dict[str, Any]) -> dict[str, Any]:
        notes = self.list()
        note_id = str(note.get("id") or uuid.uuid4().hex)
        existing = next((x for x in notes if x.get("id") == note_id), {})
        now = time.time()
        status = note.get("status", existing.get("status", "Açık"))
        if status not in {"Açık", "Tamamlandı"}:
            status = "Açık"
        record = {"id": note_id, "title": _clean(note.get("title") or "Not", 180),
                  "body": _clean(note.get("body"), 8000), "project_id": _clean(note.get("project_id"), 50),
                  "category": _clean(note.get("category") or "Genel", 40), "due_date": _clean(note.get("due_date"), 20),
                  "status": status, "pinned": bool(note.get("pinned", existing.get("pinned", False))),
                  "created_at": float(existing.get("created_at", now)), "updated_at": now}
        notes = [x for x in notes if x.get("id") != note_id]
        notes.append(record)
        _atomic_json(self.path, notes[:1000])
        return record

    def delete(self, note_id: str) -> bool:
        notes = self.list()
        after = [n for n in notes if n.get("id") != note_id]
        if len(after) == len(notes):
            return False
        _atomic_json(self.path, after)
        return True
