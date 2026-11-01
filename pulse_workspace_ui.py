"""Lean UI mixin for projects, team profiles and per-user private notes."""
from __future__ import annotations

import csv
import io
import time
import zipfile
import hashlib
import shutil
import re
import uuid
from pathlib import Path
from datetime import datetime
from typing import Any

from PySide6.QtCore import Qt, QEvent, QTimer, Signal
from PySide6.QtGui import QColor, QPixmap, QPainter, QPainterPath
from PySide6.QtWidgets import (
    QWidget, QFrame, QLabel, QPushButton, QVBoxLayout, QHBoxLayout, QFormLayout,
    QLineEdit, QTextEdit, QComboBox, QTableWidget, QTableWidgetItem, QHeaderView, QGridLayout,
    QDialog, QDialogButtonBox, QListWidget, QListWidgetItem, QCheckBox, QToolButton, QMenu,
    QMessageBox, QSplitter, QSizePolicy, QAbstractItemView, QScrollArea, QFileDialog, QStyledItemDelegate, QApplication, QGraphicsDropShadowEffect, QTabWidget
)

from pulse_workspace import (
    WORKFLOW_STAGES, PROJECT_STATUSES, OPINION_STATUSES, PROJECT_TYPES,
    DEFAULT_INSTITUTIONS, ROLES, TASK_STATUSES, TASK_PRIORITIES,
)


from pulse_dates import format_date_tr, parse_date_tr



class NoWheelComboBox(QComboBox):
    """A combo changes only after an explicit click/keyboard action, never by hovering and scrolling."""
    def wheelEvent(self, event):
        # Ignore so the parent table/scroll area may scroll, but this choice cannot change by accident.
        event.ignore()


def wire_turkish_date_input(edit: QLineEdit) -> None:
    """Insert dots while typing DDMMYYYY, preserving the digit-based cursor position."""
    if getattr(edit, "_tr_date_mask_wired", False):
        return
    edit._tr_date_mask_wired = True

    def apply_mask(text: str) -> None:
        cursor = edit.cursorPosition()
        digits_before = sum(ch.isdigit() for ch in text[:cursor])
        digits = "".join(ch for ch in text if ch.isdigit())[:8]
        display = digits[:2]
        if len(digits) > 2:
            display += "." + digits[2:4]
        if len(digits) > 4:
            display += "." + digits[4:8]
        if display == text:
            return
        edit.blockSignals(True)
        edit.setText(display)
        edit.blockSignals(False)
        before = digits[:digits_before]
        cursor_target = len(before)
        if digits_before > 2:
            cursor_target += 1
        if digits_before > 4:
            cursor_target += 1
        edit.setCursorPosition(min(cursor_target, len(display)))

    edit.textEdited.connect(apply_mask)


class ResponsiveContactTable(QTableWidget):
    """Table that can notify its owner when its available width changes."""
    resized = Signal()

    def resizeEvent(self, event):
        super().resizeEvent(event)
        self.resized.emit()


class ResponsiveWorkspaceSplitter(QSplitter):
    """Signals viewport changes so the project list can reserve enough rows without manual dragging."""
    resized = Signal()

    def resizeEvent(self, event):
        super().resizeEvent(event)
        self.resized.emit()


class TurkishDateDelegate(QStyledItemDelegate):
    """Table-cell editor which inserts Turkish date separators during typing."""
    def createEditor(self, parent, option, index):
        editor = QLineEdit(parent)
        editor.setPlaceholderText("GG.AA.YYYY")
        wire_turkish_date_input(editor)
        return editor

    def setEditorData(self, editor, index):
        value = str(index.model().data(index, Qt.EditRole) or "")
        editor.setText(format_date_tr(value) if value else "")
        editor.setCursorPosition(len(editor.text()))

    def setModelData(self, editor, model, index):
        model.setData(index, editor.text().strip(), Qt.EditRole)


def circular_avatar_pixmap(source: QPixmap, size: int) -> QPixmap:
    """Return a centered circular crop suitable for small user avatars."""
    if source.isNull() or size <= 0:
        return QPixmap()
    scaled = source.scaled(size, size, Qt.KeepAspectRatioByExpanding, Qt.SmoothTransformation)
    x = max(0, (scaled.width() - size) // 2)
    y = max(0, (scaled.height() - size) // 2)
    result = QPixmap(size, size)
    result.fill(Qt.transparent)
    painter = QPainter(result)
    painter.setRenderHint(QPainter.Antialiasing, True)
    path = QPainterPath()
    path.addEllipse(0, 0, size, size)
    painter.setClipPath(path)
    painter.drawPixmap(-x, -y, scaled)
    painter.end()
    return result


def avatar_initials(name: str) -> str:
    words = [x for x in str(name or "").strip().split() if x]
    if not words:
        return "?"
    return "".join(word[0] for word in (words[:2] if len(words) > 1 else words[:1])).upper()[:2]


class WorkspaceCard(QFrame):
    def __init__(self, title: str = "", hint: str = ""):
        super().__init__()
        self.setObjectName("card")
        shadow = QGraphicsDropShadowEffect(self)
        shadow.setBlurRadius(18)
        shadow.setOffset(0, 3)
        shadow.setColor(QColor(28, 51, 42, 20))
        self.setGraphicsEffect(shadow)
        self.layout_v = QVBoxLayout(self)
        self.layout_v.setContentsMargins(16, 14, 16, 14)
        self.layout_v.setSpacing(10)
        if title:
            row = QHBoxLayout()
            row.setContentsMargins(0, 0, 0, 2)
            t = QLabel(title)
            t.setObjectName("sectionTitle")
            t.setMinimumWidth(0)
            t.setWordWrap(True)
            row.addWidget(t, 1)
            self.layout_v.addLayout(row)


class WorkspaceUiMixin:
    def _make_institution_contacts_page(self):
        page = QWidget()
        page.setAttribute(Qt.WA_StyledBackground, True)
        page.setObjectName("pageSurface")
        root = QVBoxLayout(page)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(10)
        card = WorkspaceCard("", "")
        controls = QHBoxLayout()
        self.institution_contacts_search = QLineEdit()
        self.institution_contacts_search.setPlaceholderText("Kurum, uzman, telefon, e-posta veya proje ara…")
        # Debounce typing so a large shared directory is filtered once per pause,
        # not after every keystroke.
        self._institution_contacts_refresh_timer = QTimer(self)
        self._institution_contacts_refresh_timer.setSingleShot(True)
        self._institution_contacts_refresh_timer.setInterval(180)
        self._institution_contacts_refresh_timer.timeout.connect(self.refresh_institution_contacts)
        self.institution_contacts_search.textChanged.connect(self._queue_institution_contacts_refresh)
        controls.addWidget(self.institution_contacts_search, 1)
        copy_btn = QPushButton("Seçili iletişimi kopyala")
        copy_btn.setObjectName("secondary")
        copy_btn.clicked.connect(self.copy_selected_institution_contact)
        controls.addWidget(copy_btn)
        self.institution_contact_remove_btn = QPushButton("Rehberden kaldır")
        self.institution_contact_remove_btn.setObjectName("danger")
        self.institution_contact_remove_btn.setToolTip("Seçili kişiyi ortak rehberden gizler; proje görüşlerindeki kaynak kayıtları korunur.")
        self.institution_contact_remove_btn.clicked.connect(self.remove_selected_institution_contact)
        self.institution_contact_remove_btn.setEnabled(False)
        controls.addWidget(self.institution_contact_remove_btn)
        refresh_btn = QPushButton("Yenile")
        refresh_btn.setObjectName("secondary")
        refresh_btn.clicked.connect(self.request_scan)
        controls.addWidget(refresh_btn)
        card.layout_v.addLayout(controls)
        self.institution_contacts_table = ResponsiveContactTable(0, 6)
        self.institution_contacts_table.setHorizontalHeaderLabels(["KURUM", "UZMAN ADI", "TELEFON", "E-POSTA", "İLGİLİ PROJELER", "SON GÜNCELLEME"])
        self._setup_table(self.institution_contacts_table)
        self.institution_contacts_table.setSelectionBehavior(QAbstractItemView.SelectRows)
        self.institution_contacts_table.setSelectionMode(QAbstractItemView.SingleSelection)
        hdr = self.institution_contacts_table.horizontalHeader()
        hdr.setSectionResizeMode(QHeaderView.Interactive)
        hdr.setStretchLastSection(False)
        self.institution_contacts_table.resized.connect(self._resize_institution_contact_columns)
        self._resize_institution_contact_columns()
        QTimer.singleShot(0, self._resize_institution_contact_columns)
        self.institution_contacts_table.setHorizontalScrollBarPolicy(Qt.ScrollBarAsNeeded)
        self.institution_contacts_table.setWordWrap(False)
        self.institution_contacts_table.setMinimumHeight(235)
        self.institution_contacts_table.setTextElideMode(Qt.ElideRight)
        self.institution_contacts_table.itemSelectionChanged.connect(self._update_institution_contact_detail)
        self.institution_contacts_table.itemDoubleClicked.connect(lambda *_: self.show_selected_institution_contact())
        card.layout_v.addWidget(self.institution_contacts_table, 1)

        self.institution_contact_detail = QFrame()
        self.institution_contact_detail.setObjectName("institutionContactDetail")

        detail_root = QVBoxLayout(self.institution_contact_detail)
        detail_root.setContentsMargins(14, 12, 14, 12)
        detail_root.setSpacing(7)
        self.institution_contact_detail_title = QLabel("Uzman ayrıntıları")
        self.institution_contact_detail_title.setObjectName("institutionContactDetailTitle")
        self.institution_contact_detail_title.setWordWrap(True)
        detail_root.addWidget(self.institution_contact_detail_title)
        details_grid = QGridLayout()
        details_grid.setHorizontalSpacing(18); details_grid.setVerticalSpacing(6)
        self.institution_contact_detail_labels = {}
        for idx, (key, caption) in enumerate((("institution", "KURUM"), ("expert", "UZMAN ADI"), ("phone", "TELEFON"), ("email", "E-POSTA"), ("projects", "İLGİLİ PROJELER"), ("updated", "SON GÜNCELLEME"))):
            cell = QVBoxLayout(); cell.setSpacing(2)
            cap = QLabel(caption); cap.setObjectName("institutionContactCaption")
            val = QLabel("—"); val.setObjectName("institutionContactValue"); val.setWordWrap(True); val.setMinimumWidth(0); val.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Preferred); val.setTextInteractionFlags(Qt.TextSelectableByMouse)
            cell.addWidget(cap); cell.addWidget(val)
            details_grid.addLayout(cell, idx // 3, idx % 3)
            self.institution_contact_detail_labels[key] = val
        detail_root.addLayout(details_grid)
        card.layout_v.addWidget(self.institution_contact_detail, 0)
        # Keep the widget count bounded: thousands of QTableWidgetItems can block
        # the GUI thread on shared workspaces. Search still covers all contacts.
        self._institution_contacts_page_size = 200
        self._institution_contacts_page = 0
        self._institution_contacts_filtered_rows = []
        paging = QHBoxLayout()
        self.institution_contacts_page_label = QLabel("0 kayıt")
        self.institution_contacts_page_label.setObjectName("muted")
        self.institution_contacts_prev = QPushButton("Önceki")
        self.institution_contacts_prev.setObjectName("secondary")
        self.institution_contacts_prev.clicked.connect(lambda: self._change_institution_contacts_page(-1))
        self.institution_contacts_next = QPushButton("Sonraki")
        self.institution_contacts_next.setObjectName("secondary")
        self.institution_contacts_next.clicked.connect(lambda: self._change_institution_contacts_page(1))
        paging.addWidget(self.institution_contacts_page_label)
        paging.addStretch(1)
        paging.addWidget(self.institution_contacts_prev)
        paging.addWidget(self.institution_contacts_next)
        card.layout_v.addLayout(paging)
        hint = QLabel("Rehber kayıtları proje kaydedildiğinde güncellenir. Telefon ve e-posta bilgileri uzman/iletişim alanından ve takip notundan yakalanır; isimler otomatik tahmin edilip kesin bilgi sayılmaz.")
        hint.setObjectName("muted")
        hint.setWordWrap(True)
        card.layout_v.addWidget(hint)
        root.addWidget(card, 1)
        self.pages["Kurum Rehberi"] = page
        self.stack.addWidget(page)
        # Do not fill thousands of cells while the page is still hidden at startup.

    def _queue_institution_contacts_refresh(self, *_):
        timer = getattr(self, "_institution_contacts_refresh_timer", None)
        if timer is not None:
            timer.start()
        else:
            self.refresh_institution_contacts()

    @staticmethod
    def _contact_values_text(value):
        if isinstance(value, str):
            return value.strip()
        if isinstance(value, (list, tuple, set)):
            return ", ".join(str(x).strip() for x in value if str(x).strip())
        return str(value).strip() if value not in (None, "") else ""

    def refresh_institution_contacts(self, *_):
        if not hasattr(self, "institution_contacts_table"):
            return
        # A hidden page does not need an immediate repaint; it will render on navigation.
        if str(getattr(self, "current_page", "")) != "Kurum Rehberi":
            return
        query = self.institution_contacts_search.text().casefold().strip() if hasattr(self, "institution_contacts_search") else ""
        contacts = list(getattr(self, "workspace_contacts", []) or [])
        prepared = getattr(self, "workspace_contact_index", None)
        rows = []
        if isinstance(prepared, list):
            contacts_by_id = {str(c.get("id", "")): c for c in contacts if isinstance(c, dict)}
            for entry in prepared:
                if not isinstance(entry, dict):
                    continue
                searchable = str(entry.get("search_text", ""))
                if query and query not in searchable:
                    continue
                contact = contacts_by_id.get(str(entry.get("id", "")))
                values = entry.get("values", [])
                if contact is not None and isinstance(values, list):
                    rows.append((contact, [str(v or "") for v in values[:6]]))
        else:
            # Compatibility fallback for a workspace snapshot produced by an older client.
            for contact in contacts:
                projects = contact.get("projects", []) if isinstance(contact.get("projects", []), list) else []
                project_names = []
                for project in projects:
                    if not isinstance(project, dict):
                        continue
                    name = str(project.get("name") or "").strip()
                    code = str(project.get("code") or "").strip()
                    label = " · ".join(x for x in (name, code) if x)
                    if label:
                        project_names.append(label)
                project_text = ", ".join(project_names)
                phones = self._contact_values_text(contact.get("phones", []))
                emails = self._contact_values_text(contact.get("emails", []))
                values = [str(contact.get("institution", "")), str(contact.get("expert_name", "")), phones, emails, project_text,
                          self._workspace_time(contact.get("updated_at")) if hasattr(self, "_workspace_time") else "—"]
                if query and query not in " ".join(values).casefold():
                    continue
                rows.append((contact, values))
        self._institution_contacts_filtered_rows = rows
        self._institution_contacts_page = 0
        self._render_institution_contacts_page()

    def _change_institution_contacts_page(self, delta: int):
        rows = list(getattr(self, "_institution_contacts_filtered_rows", []))
        size = max(1, int(getattr(self, "_institution_contacts_page_size", 200)))
        page_count = max(1, (len(rows) + size - 1) // size)
        self._institution_contacts_page = max(0, min(page_count - 1, int(getattr(self, "_institution_contacts_page", 0)) + int(delta)))
        self._render_institution_contacts_page()

    def _resize_institution_contact_columns(self, *_):
        """Use the available page width intelligently; long names remain fully visible below."""
        table = getattr(self, "institution_contacts_table", None)
        if table is None:
            return
        available = max(0, int(table.viewport().width()))
        if available <= 0:
            return
        minimums = [132, 165, 110, 145, 160, 125]
        # Extra width is distributed toward the expert, e-mail and project columns.
        weights = [0.17, 0.22, 0.09, 0.18, 0.23, 0.11]
        if available < sum(minimums):
            widths = minimums
        else:
            extra = available - sum(minimums)
            widths = [minimums[i] + int(extra * weights[i]) for i in range(len(minimums))]
            widths[4] += available - sum(widths)  # absorb rounding remainder in projects
        for column, width in enumerate(widths):
            if table.columnWidth(column) != width:
                table.setColumnWidth(column, width)

    def _render_institution_contacts_page(self):
        table = getattr(self, "institution_contacts_table", None)
        if table is None:
            return
        rows = list(getattr(self, "_institution_contacts_filtered_rows", []))
        size = max(1, int(getattr(self, "_institution_contacts_page_size", 200)))
        page_count = max(1, (len(rows) + size - 1) // size)
        page = max(0, min(page_count - 1, int(getattr(self, "_institution_contacts_page", 0))))
        self._institution_contacts_page = page
        start = page * size
        visible_rows = rows[start:start + size]
        old_signals = table.blockSignals(True)
        old_updates = table.updatesEnabled()
        old_sorting = table.isSortingEnabled()
        table.setUpdatesEnabled(False)
        table.setSortingEnabled(False)
        try:
            table.clearContents()
            table.setRowCount(len(visible_rows))
            for row, (contact, values) in enumerate(visible_rows):
                for col, value in enumerate(values):
                    item = QTableWidgetItem(value or "—")
                    item.setToolTip(value or "—")
                    if col == 1:
                        item.setData(Qt.UserRole, str(contact.get("id", "")))
                    table.setItem(row, col, item)
        finally:
            table.setSortingEnabled(old_sorting)
            table.setUpdatesEnabled(old_updates)
            table.blockSignals(old_signals)
            table.viewport().update()
        table.clearSelection()
        if visible_rows:
            table.selectRow(0)
        self._update_institution_contact_detail()
        label = getattr(self, "institution_contacts_page_label", None)
        if label is not None:
            left = start + 1 if visible_rows else 0
            right = start + len(visible_rows)
            label.setText(f"{left}–{right} / {len(rows)} kayıt · Sayfa {page + 1}/{page_count}")
        prev = getattr(self, "institution_contacts_prev", None)
        nxt = getattr(self, "institution_contacts_next", None)
        if prev is not None:
            prev.setEnabled(page > 0)
        if nxt is not None:
            nxt.setEnabled(page + 1 < page_count)

    def _selected_institution_contact(self):
        table = getattr(self, "institution_contacts_table", None)
        if table is None or table.currentRow() < 0:
            return None
        item = table.item(table.currentRow(), 1)
        key = str(item.data(Qt.UserRole) or "") if item else ""
        return next((c for c in getattr(self, "workspace_contacts", []) if str(c.get("id", "")) == key), None)

    def copy_selected_institution_contact(self):
        contact = self._selected_institution_contact()
        if not contact:
            QMessageBox.information(self, "Kayıt seçilmedi", "Önce rehberden bir uzman satırı seç.")
            return
        text = "\n".join([str(contact.get("institution", "")), str(contact.get("expert_name", "")),
                            "Telefon: " + self._contact_values_text(contact.get("phones", [])),
                            "E-posta: " + self._contact_values_text(contact.get("emails", []))]).strip()
        QApplication.clipboard().setText(text)
        self.status_label.setText("Uzman iletişim bilgileri panoya kopyalandı.")

    def remove_selected_institution_contact(self):
        contact = self._selected_institution_contact()
        if not contact:
            QMessageBox.information(self, "Kayıt seçilmedi", "Önce kurum rehberinden kaldırılacak uzmanı seç.")
            return
        if not self._is_workspace_admin():
            QMessageBox.warning(self, "Yetki gerekli", "Ortak kurum rehberinden kayıt kaldırma işlemi yönetici yetkisi gerektirir.")
            return
        name = str(contact.get("expert_name") or "İsimsiz uzman")
        institution = str(contact.get("institution") or "Kurum belirtilmedi")
        answer = QMessageBox.question(
            self, "Uzmanı rehberden kaldır",
            f"{name} · {institution}\n\nBu kayıt iki bilgisayardaki ortak kurum rehberinden gizlenecek. Projelerdeki kurum görüşü, takip notları ve iletişim alanları silinmeyecek. Bu işlem yalnızca ortak rehber görünümünü etkiler; kaynak proje kayıtları korunur.\n\nDevam edilsin mi?",
            QMessageBox.Yes | QMessageBox.No, QMessageBox.No,
        )
        if answer != QMessageBox.Yes:
            return
        self.institution_contact_remove_btn.setEnabled(False)
        self.worker.queue_workspace("contact_hide", {"id": str(contact.get("id", ""))})
        self.status_label.setText(f"{name} ortak kurum rehberinden kaldırılıyor…")

    def _update_institution_contact_detail(self, *_):
        contact = self._selected_institution_contact()
        labels = getattr(self, "institution_contact_detail_labels", {})
        if not contact:
            if hasattr(self, "institution_contact_detail_title"):
                self.institution_contact_detail_title.setText("Uzman ayrıntıları · Listeden bir satır seç")
            if hasattr(self, "institution_contact_remove_btn"):
                self.institution_contact_remove_btn.setEnabled(False)
            for label in labels.values():
                label.setText("—")
            return
        if hasattr(self, "institution_contact_remove_btn"):
            admin = self._is_workspace_admin()
            self.institution_contact_remove_btn.setVisible(True)
            self.institution_contact_remove_btn.setEnabled(admin)
            if not admin:
                self.institution_contact_remove_btn.setToolTip("Ortak rehberden kayıt kaldırmak için yönetici yetkisi gerekli")
        project_rows = contact.get("projects", []) if isinstance(contact.get("projects", []), list) else []
        project_text = "\n".join(
            " · ".join(str(v).strip() for v in (p.get("name", ""), p.get("code", "")) if str(v).strip())
            for p in project_rows if isinstance(p, dict)
        ) or "İlişkili proje yok"
        display_name = str(contact.get("expert_name") or "İsim belirtilmedi").strip()
        institution = str(contact.get("institution") or "Kurum belirtilmedi").strip()
        self.institution_contact_detail_title.setText(f"{display_name}  ·  {institution}")
        values = {
            "institution": institution,
            "expert": display_name,
            "phone": self._contact_values_text(contact.get("phones", [])) or "Telefon kaydı yok",
            "email": self._contact_values_text(contact.get("emails", [])) or "E-posta kaydı yok",
            "projects": project_text,
            "updated": self._workspace_time(contact.get("updated_at")) if hasattr(self, "_workspace_time") else "—",
        }
        for key, value in values.items():
            if key in labels:
                labels[key].setText(value)
                labels[key].setToolTip(value)

    def show_selected_institution_contact(self):
        """Show selected institution contact in the page, never in a surprise modal window."""
        contact = self._selected_institution_contact()
        if not contact:
            self.status_label.setText("Kurum rehberinde önce bir kayıt seç.")
            return
        self._update_institution_contact_detail()
        self.status_label.setText("Uzman ayrıntıları kurum rehberinin alt bölümünde gösteriliyor.")

    def _make_projects_page(self):
        page = QWidget()
        page.setAttribute(Qt.WA_StyledBackground, True)
        page.setObjectName("pageSurface")
        outer = QVBoxLayout(page)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.setSpacing(10)
        toolbar = QVBoxLayout()
        toolbar.setSpacing(8)
        search_row = QHBoxLayout()
        self.project_search = QLineEdit()
        self.project_search.setPlaceholderText("Proje kodu, adı, müşteri veya sorumlu ara…")
        self._project_search_timer = QTimer(self)
        self._project_search_timer.setSingleShot(True)
        self._project_search_timer.setInterval(180)
        self._project_search_timer.timeout.connect(self.refresh_projects)
        self.project_search.textChanged.connect(lambda *_: self._project_search_timer.start())
        self._project_page_size = 100
        self._project_page = 0
        self._project_rows_cache = []
        self._project_table_render_signature = None
        self.project_status_filter = NoWheelComboBox()
        self.project_status_filter.addItem("Tüm durumlar", "")
        for status in PROJECT_STATUSES:
            self.project_status_filter.addItem(status, status)
        self.project_status_filter.currentIndexChanged.connect(self.refresh_projects)
        search_row.addWidget(self.project_search, 1)
        search_row.addWidget(self.project_status_filter, 0)
        self.project_show_archived = QCheckBox("Arşiv dâhil")
        self.project_show_archived.setToolTip("Arşivlenmiş kayıtları da listele")
        self.project_show_archived.setChecked(True)
        self.project_show_archived.toggled.connect(self._on_project_archive_filter_changed)
        search_row.addWidget(self.project_show_archived, 0)
        toolbar.addLayout(search_row)
        action_row = QHBoxLayout()
        action_row.setSpacing(8)
        self.project_new_btn = QPushButton("+ Yeni proje")
        self.project_new_btn.setObjectName("primary")
        self.project_new_btn.clicked.connect(self.create_project_dialog)
        self.project_edit_btn = QPushButton("Projeyi düzenle")
        self.project_edit_btn.setObjectName("secondary")
        self.project_edit_btn.clicked.connect(self.edit_selected_project)
        self.project_delete_btn = QPushButton("Projeyi sil")
        self.project_delete_btn.setObjectName("danger")
        self.project_delete_btn.setToolTip("Seçili projeyi onay sonrası arşiv yedeğine taşıyarak kaldırır.")
        self.project_delete_btn.clicked.connect(self.delete_selected_project)
        self.project_delete_btn.setEnabled(False)
        self.project_refresh_btn = QPushButton("Yenile")
        self.project_refresh_btn.setObjectName("secondary")
        self.project_refresh_btn.clicked.connect(self.request_scan)
        self.project_export_btn = QPushButton("Rapor dışa aktar")
        self.project_export_btn.setObjectName("secondary")
        self.project_export_btn.clicked.connect(self.export_projects_bundle)
        action_row.addWidget(self.project_new_btn)
        action_row.addWidget(self.project_edit_btn)
        action_row.addWidget(self.project_delete_btn)
        # Keep the primary workflow visible and tuck secondary tools into one menu.
        self.project_export_btn.setVisible(False)
        self.project_refresh_btn.setVisible(False)
        self.project_more_btn = QPushButton("Diğer işlemler  ▾")
        self.project_more_btn.setObjectName("secondary")
        self.project_more_menu = QMenu(self.project_more_btn)
        self.project_more_menu.addAction("Excel raporu dışa aktar", self.export_projects_bundle)
        self.project_more_menu.addAction("Verileri yenile", self.request_scan)
        self.project_more_btn.setMenu(self.project_more_menu)
        action_row.addWidget(self.project_more_btn)
        action_row.addStretch(1)
        toolbar.addLayout(action_row)
        outer.addLayout(toolbar)
        split = ResponsiveWorkspaceSplitter(Qt.Vertical)
        list_card = WorkspaceCard("", "")
        self.project_table = ResponsiveContactTable(0, 7)
        self.project_table.setHorizontalHeaderLabels(["PROJE", "MÜŞTERİ", "AŞAMA", "DURUM", "RİSK", "SORUMLU", "HEDEF TARİH"])
        self._setup_table(self.project_table)
        self.project_table.setVerticalScrollMode(QAbstractItemView.ScrollPerPixel)
        self.project_table.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        project_header = self.project_table.horizontalHeader()
        project_header.setMinimumSectionSize(48)
        project_header.setSectionResizeMode(QHeaderView.Interactive)
        project_header.setStretchLastSection(False)
        self.project_table.setFrameShape(QFrame.NoFrame)
        self.project_table.setLineWidth(0)
        self.project_table.setShowGrid(False)
        self.project_table.setContentsMargins(0, 0, 0, 0)
        self.project_table.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        self.project_table.setTextElideMode(Qt.ElideRight)
        self.project_table.setWordWrap(False)
        self.project_table.verticalHeader().setDefaultSectionSize(38)
        self.project_table.setColumnWidth(0, 280)
        QTimer.singleShot(0, self._resize_project_list_columns)
        self.project_table.setTextElideMode(Qt.ElideRight)
        self.project_table.setSelectionBehavior(QAbstractItemView.SelectRows)
        self.project_table.itemSelectionChanged.connect(self._project_selection_changed)
        self.project_table.resized.connect(self._resize_project_list_columns)
        self.project_list_card = list_card
        list_card.setMinimumHeight(178)
        list_card.setMaximumHeight(500)
        list_card.layout_v.addWidget(self.project_table, 1)
        project_paging = QHBoxLayout()
        self.project_page_label = QLabel("0 proje")
        self.project_page_label.setObjectName("muted")
        self.project_page_prev = QPushButton("Önceki")
        self.project_page_prev.setObjectName("secondary")
        self.project_page_prev.clicked.connect(lambda: self._change_project_page(-1))
        self.project_page_next = QPushButton("Sonraki")
        self.project_page_next.setObjectName("secondary")
        self.project_page_next.clicked.connect(lambda: self._change_project_page(1))
        project_paging.addWidget(self.project_page_label)
        project_paging.addStretch(1)
        project_paging.addWidget(self.project_page_prev)
        project_paging.addWidget(self.project_page_next)
        list_card.layout_v.addLayout(project_paging)
        split.addWidget(list_card)
        detail = QWidget()
        detail_layout = QVBoxLayout(detail)
        detail_layout.setContentsMargins(0, 0, 0, 0)
        detail_layout.setSpacing(0)
        self.project_detail_tabs = QTabWidget()
        self.project_detail_tabs.setObjectName("projectDetailTabs")
        self.project_detail_tabs.setDocumentMode(True)
        self.project_detail_tabs.setMovable(False)

        overview_page = QWidget()
        overview_layout = QVBoxLayout(overview_page)
        overview_layout.setContentsMargins(0, 0, 0, 0)
        overview_layout.setSpacing(8)
        project_header = QHBoxLayout()
        self.project_detail_title = QLabel("Bir proje seç")
        self.project_detail_title.setObjectName("projectDetailTitle")
        self.project_detail_title.setWordWrap(True)
        self.project_detail_title.setMinimumWidth(0)
        project_header.addWidget(self.project_detail_title, 1)
        self.project_detail_status = QLabel("—")
        self.project_detail_status.setObjectName("statusPill")
        project_header.addWidget(self.project_detail_status, 0, Qt.AlignRight | Qt.AlignVCenter)
        overview_layout.addLayout(project_header)

        pipeline_card = WorkspaceCard("İş akışı", "")
        pipeline_grid_host = QWidget()
        pipeline_grid_host.setObjectName("pipelineContent")
        pipeline_grid_host.setAttribute(Qt.WA_StyledBackground, True)
        pipeline_grid = QGridLayout(pipeline_grid_host)
        pipeline_grid.setContentsMargins(2, 2, 2, 2)
        pipeline_grid.setHorizontalSpacing(8)
        pipeline_grid.setVerticalSpacing(8)
        self.pipeline_stage_rows = []
        for stage_index, stage_name in enumerate(WORKFLOW_STAGES):
            step = QFrame()
            step.setObjectName("pipelineStep")
            step.setAttribute(Qt.WA_StyledBackground, True)
            step.setMinimumHeight(44)
            row_layout = QHBoxLayout(step)
            row_layout.setContentsMargins(10, 7, 10, 7)
            row_layout.setSpacing(8)
            marker = QLabel("○")
            marker.setFixedSize(22, 22)
            marker.setAlignment(Qt.AlignCenter)
            label = QLabel(stage_name)
            label.setWordWrap(True)
            label.setMinimumWidth(0)
            row_layout.addWidget(marker)
            row_layout.addWidget(label, 1)
            pipeline_grid.addWidget(step, stage_index // 3, stage_index % 3)
            self.pipeline_stage_rows.append((stage_index, step, marker, label))
        for col in range(3):
            pipeline_grid.setColumnStretch(col, 1)
        pipeline_card.layout_v.addWidget(pipeline_grid_host, 1)
        overview_layout.addWidget(pipeline_card, 1)
        self.project_detail_tabs.addTab(overview_page, "İş akışı")

        opinions_page = QWidget()
        opinions_layout = QVBoxLayout(opinions_page)
        opinions_layout.setContentsMargins(0, 0, 0, 0)
        opinions_card = WorkspaceCard("Kurum görüşleri", "")
        self.opinion_summary = QLabel("")
        self.opinion_summary.setObjectName("muted")
        self.opinion_summary.setWordWrap(True)
        opinions_card.layout_v.addWidget(self.opinion_summary)
        self.project_opinion_scroll = QScrollArea()
        self.project_opinion_scroll.setObjectName("projectOpinionScroll")
        self.project_opinion_scroll.setWidgetResizable(True)
        self.project_opinion_scroll.setFrameShape(QFrame.NoFrame)
        self.project_opinion_scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        self.project_opinion_scroll.setVerticalScrollBarPolicy(Qt.ScrollBarAsNeeded)
        self.project_opinion_host = QWidget()
        self.project_opinion_host.setObjectName("projectOpinionCardsHost")
        self.project_opinion_cards_layout = QVBoxLayout(self.project_opinion_host)
        self.project_opinion_cards_layout.setContentsMargins(2, 2, 8, 2)
        self.project_opinion_cards_layout.setSpacing(8)
        self.project_opinion_empty = QLabel("Henüz kurum görüşü kaydı yok")
        self.project_opinion_empty.setObjectName("emptyState")
        self.project_opinion_empty.setAlignment(Qt.AlignCenter)
        self.project_opinion_cards_layout.addWidget(self.project_opinion_empty)
        self.project_opinion_scroll.setWidget(self.project_opinion_host)
        opinions_card.layout_v.addWidget(self.project_opinion_scroll, 1)
        self._project_opinions_project_id = ""
        self._project_opinions_signature = None
        opinions_layout.addWidget(opinions_card, 1)
        self.project_detail_tabs.addTab(opinions_page, "Kurum görüşleri")
        detail_layout.addWidget(self.project_detail_tabs, 1)
        split.addWidget(detail)
        split.setChildrenCollapsible(False)
        split.setHandleWidth(4)
        split.setStretchFactor(0, 0)
        split.setStretchFactor(1, 1)
        split.setSizes([420, 660])
        self.projects_splitter = split
        split.resized.connect(lambda: self._adjust_project_list_height(force=True))
        outer.addWidget(split, 1)
        QTimer.singleShot(0, lambda: self._adjust_project_list_height(force=True))
        self.pages["Projeler"] = page
        self.stack.addWidget(page)

    def _project_table_resize_event(self, event):
        QTableWidget.resizeEvent(self.project_table, event)
        QTimer.singleShot(0, self._resize_project_list_columns)

    def _resize_project_list_columns(self):
        table = getattr(self, "project_table", None)
        if table is None or table.columnCount() != 7:
            return
        available = max(0, table.viewport().width())
        if available <= 0:
            return
        # Seven operationally useful columns fit the viewport; code is shown with the title.
        weights = [2.65, 1.62, 1.62, 1.00, 0.74, 0.90, 0.92]
        total_weight = sum(weights)
        widths = [int(available * weight / total_weight) for weight in weights]
        widths[0] += available - sum(widths)
        for column, width in enumerate(widths):
            table.setColumnWidth(column, max(36, width))

    def _make_team_page(self):
        page = QWidget()
        page.setAttribute(Qt.WA_StyledBackground, True)
        page.setObjectName("pageSurface")
        outer = QVBoxLayout(page)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.setSpacing(10)
        row = QHBoxLayout()
        self.team_search = QLineEdit()
        self.team_search.setPlaceholderText("İsim, kullanıcı, uzmanlık veya görev ara…")
        self.team_search.textChanged.connect(self.refresh_team)
        self.team_edit_btn = QPushButton("Profilimi düzenle")
        self.team_edit_btn.setObjectName("primary")
        self.team_edit_btn.clicked.connect(self.edit_my_profile)
        self.team_admin_btn = QPushButton("Kişi ekle / rol düzenle")
        self.team_admin_btn.setObjectName("secondary")
        self.team_admin_btn.clicked.connect(self.admin_manage_profile)
        row.addWidget(self.team_search, 1)
        row.addWidget(self.team_edit_btn)
        row.addWidget(self.team_admin_btn)
        outer.addLayout(row)
        split = QSplitter(Qt.Horizontal)
        left = WorkspaceCard("Ekip dizini", "Şirket profilleri ve uzmanlık alanları")
        self.team_table = QTableWidget(0, 5)
        self.team_table.setHorizontalHeaderLabels(["KİŞİ", "GÖREV", "ROL", "AÇIK PROJE", "DURUM"])
        self._setup_table(self.team_table)
        self.team_table.itemSelectionChanged.connect(self._team_selection_changed)
        left.layout_v.addWidget(self.team_table, 1)
        split.addWidget(left)
        right = WorkspaceCard("Profil ve iş yükü", "Atanmış projeler")
        self.profile_title_label = QLabel("Profil seç")
        self.profile_title_label.setObjectName("profileTitle")
        self.profile_contact_label = QLabel("—")
        self.profile_contact_label.setWordWrap(True)
        self.profile_contact_label.setObjectName("muted")
        self.profile_skills_label = QLabel("Uzmanlık alanları: —")
        self.profile_skills_label.setWordWrap(True)
        self.profile_assignments = QListWidget()
        right.layout_v.addWidget(self.profile_title_label)
        right.layout_v.addWidget(self.profile_contact_label)
        right.layout_v.addWidget(self.profile_skills_label)
        right.layout_v.addWidget(QLabel("Üzerindeki işler"))
        right.layout_v.addWidget(self.profile_assignments, 1)
        split.addWidget(right)
        split.setStretchFactor(0, 3)
        split.setStretchFactor(1, 2)
        outer.addWidget(split, 1)
        self.pages["Ekibim"] = page
        self.stack.addWidget(page)

    def _make_notes_page(self):
        page = QWidget()
        page.setAttribute(Qt.WA_StyledBackground, True)
        page.setObjectName("pageSurface")
        outer = QVBoxLayout(page)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.setSpacing(10)
        bar = QHBoxLayout()
        self.notes_search = QLineEdit()
        self.notes_search.setPlaceholderText("Kendi notlarımda ara…")
        self.notes_search.textChanged.connect(self.refresh_notes)
        self.note_new_btn = QPushButton("+ Yeni not")
        self.note_new_btn.setObjectName("primary")
        self.note_new_btn.clicked.connect(self.create_note)
        self.note_edit_btn = QPushButton("Düzenle")
        self.note_edit_btn.setObjectName("secondary")
        self.note_edit_btn.clicked.connect(self.edit_selected_note)
        self.note_done_btn = QPushButton("Tamamlandı / Açık")
        self.note_done_btn.setObjectName("secondary")
        self.note_done_btn.clicked.connect(self.toggle_selected_note)
        self.note_delete_btn = QPushButton("Sil")
        self.note_delete_btn.setObjectName("danger")
        self.note_delete_btn.clicked.connect(self.delete_selected_note)
        bar.addWidget(self.notes_search, 1)
        bar.addWidget(self.note_new_btn)
        bar.addWidget(self.note_edit_btn)
        bar.addWidget(self.note_done_btn)
        bar.addWidget(self.note_delete_btn)
        outer.addLayout(bar)
        split = QSplitter(Qt.Horizontal)
        left = WorkspaceCard("Notlarım", "Bu Windows kullanıcısının yerel profilinde saklanır")
        self.notes_list = QListWidget()
        self.notes_list.currentItemChanged.connect(self._note_selection_changed)
        self.notes_list.itemDoubleClicked.connect(lambda _item: self.edit_selected_note())
        left.layout_v.addWidget(self.notes_list, 1)
        split.addWidget(left)
        right = WorkspaceCard("Not içeriği", "Arama, proje bağlantısı ve hatırlatıcı")
        self.note_detail_title = QLabel("Not seç")
        self.note_detail_title.setObjectName("noteDetailTitle")
        self.note_detail_meta = QLabel("—")
        self.note_detail_meta.setObjectName("muted")
        self.note_detail_meta.setWordWrap(True)
        self.note_detail_body = QTextEdit()
        self.note_detail_body.setReadOnly(True)
        self.note_detail_body.setPlaceholderText("Not seçildiğinde metin burada görünür.")
        right.layout_v.addWidget(self.note_detail_title)
        right.layout_v.addWidget(self.note_detail_meta)
        right.layout_v.addWidget(self.note_detail_body, 1)
        split.addWidget(right)
        split.setStretchFactor(0, 2)
        split.setStretchFactor(1, 3)
        outer.addWidget(split, 1)
        self.pages["Notlarım"] = page
        self.stack.addWidget(page)
        self._notes_cache = self.notes_store.list()

    def _is_workspace_admin(self) -> bool:
        user = str(self.config.get("windows_user", "")).casefold()
        prof = next((p for p in self.workspace_profiles if str(p.get("username", "")).casefold() == user), {})
        return user == "burak" or prof.get("role") in {"Yönetici", "Proje Yöneticisi"}

    def refresh_workspace_views(self):
        """Refresh every workspace screen when explicitly requested (e.g. startup)."""
        if not hasattr(self, "project_table"):
            return
        self.refresh_projects()
        self.refresh_team()
        self.refresh_notes()
        self._apply_workspace_permissions()

    def _apply_workspace_permissions(self):
        admin = self._is_workspace_admin()
        if hasattr(self, "project_new_btn"):
            self.project_new_btn.setVisible(admin)
        if hasattr(self, "project_delete_btn"):
            # Show the action consistently; permission remains enforced here and again by WorkspaceStore.
            self.project_delete_btn.setVisible(True)
            self.project_delete_btn.setEnabled(admin and bool(getattr(self, "selected_project_id", "")))
            self.project_delete_btn.setToolTip("Projeyi yedekleyerek kaldır" if admin else "Projeyi kaldırmak için yönetici yetkisi gerekli")
        if hasattr(self, "team_admin_btn"):
            self.team_admin_btn.setVisible(admin)
        if hasattr(self, "institution_contact_remove_btn"):
            self.institution_contact_remove_btn.setVisible(True)
            self.institution_contact_remove_btn.setEnabled(admin and self._selected_institution_contact() is not None)
            if not admin:
                self.institution_contact_remove_btn.setToolTip("Ortak rehberden kayıt kaldırmak için yönetici yetkisi gerekli")

    def refresh_active_workspace_page(self):
        """Update only the visible workspace page; never rebuild unrelated heavy tables."""
        page = str(getattr(self, "current_page", ""))
        if page == "Projeler":
            self.refresh_projects()
            self._apply_workspace_permissions()
        elif page == "Ekibim":
            self.refresh_team()
            self._apply_workspace_permissions()
        elif page == "Kurum Rehberi":
            self.refresh_institution_contacts()
        elif page == "Notlarım":
            self.refresh_notes()
        elif page == "Genel Bakış":
            if hasattr(self, "_refresh_dashboard_projects"):
                self._refresh_dashboard_projects()

    def _on_project_archive_filter_changed(self, _checked=False):
        self._project_table_render_signature = None
        self._project_page = 0
        self.refresh_projects()

    def _adjust_project_list_height(self, force: bool = False):
        """Reserve enough room for all small project sets while preserving the details pane."""
        card = getattr(self, "project_list_card", None)
        table = getattr(self, "project_table", None)
        splitter = getattr(self, "projects_splitter", None)
        if card is None or table is None or splitter is None:
            return
        count = max(0, table.rowCount())
        previous_count = getattr(self, "_project_list_layout_count", None)
        card.setMinimumHeight(174)
        card.setMaximumHeight(500)
        if not force and previous_count == count:
            return
        self._project_list_layout_count = count
        split_height = splitter.height()
        if split_height < 260:
            return
        rows_visible = min(max(count, 1), 7)
        row_height = max(36, table.verticalHeader().defaultSectionSize())
        wanted = 150 + rows_visible * row_height
        # At least 210 px remains for the workflow/opinion panel, even on short screens.
        target = min(500, wanted, max(190, split_height - 210))
        if target > split_height - 210:
            target = max(174, split_height - 210)
        sizes = splitter.sizes()
        if force or not sizes or abs(sizes[0] - target) > 8:
            splitter.setSizes([target, max(1, split_height - target)])

    def refresh_projects(self, *_):
        if not hasattr(self, "project_table"):
            return
        table = self.project_table
        current_id = str(getattr(self, "selected_project_id", ""))
        query = self.project_search.text().casefold().strip()
        status_filter = self.project_status_filter.currentData()
        all_rows = list(getattr(self, "workspace_projects", []))
        rows = []
        include_archived = bool(getattr(self, "project_show_archived", None) and self.project_show_archived.isChecked())
        for p in all_rows:
            if not isinstance(p, dict):
                continue
            if p.get("archived") and not include_archived:
                continue
            if status_filter and p.get("status") != status_filter:
                continue
            text = " ".join(str(p.get(k, "")) for k in ("code", "name", "client", "project_type", "lead", "province", "district", "stage", "status", "team", "risk_level", "next_action", "blocker")).casefold()
            if query and query not in text:
                continue
            rows.append(p)

        self._project_rows_cache = rows
        page_size = max(1, int(getattr(self, "_project_page_size", 100)))
        page_count = max(1, (len(rows) + page_size - 1) // page_size)
        self._project_page = max(0, min(page_count - 1, int(getattr(self, "_project_page", 0))))
        start = self._project_page * page_size
        visible_rows = rows[start:start + page_size]
        render_signature = (
            tuple((str(p.get("id", "")), int(p.get("revision", 1) or 1),
                   float(p.get("updated_at", 0) or 0), str(p.get("name", "")), str(p.get("code", ""))) for p in rows),
            query, str(status_filter or ""), self._project_page,
        )
        if render_signature == getattr(self, "_project_table_render_signature", None):
            self._update_project_page_controls(start, len(visible_rows), len(rows), page_count)
            self._adjust_project_list_height()
            return
        self._project_table_render_signature = render_signature

        # Build only one 25-project page. Block selection and paint signals until
        # every visible row is complete; the selected project is not part of the
        # render signature, so choosing another row cannot trigger a full rebuild.
        was_signals_blocked = table.blockSignals(True)
        old_sorting = table.isSortingEnabled()
        table.setSortingEnabled(False)
        table.setUpdatesEnabled(False)
        try:
            table.clearSelection()
            table.setRowCount(len(visible_rows))
            select_row = -1
            for ri, p in enumerate(visible_rows):
                base_name = str(p.get("name", "") or "Adsız proje").strip()
                project_code = str(p.get("code", "") or "").strip()
                shown_name = base_name + (f"  ·  {project_code}" if project_code else "") + ("  ·  ARŞİV" if p.get("archived") else "")
                vals = [shown_name, p.get("client", "—"), p.get("stage", "—"), ("Arşiv" if p.get("archived") else p.get("status", "—")), p.get("risk_level", "Normal"), p.get("lead", "—"), format_date_tr(p.get("due_date")) or "—"]
                for ci, val in enumerate(vals):
                    item = QTableWidgetItem(str(val))
                    item.setToolTip(str(val))
                    if ci == 0:
                        item.setData(Qt.UserRole, str(p.get("id", "")))
                    if ci == 0:
                        item.setToolTip(f"{base_name}\nKod: {project_code or '—'}\nTür: {p.get('project_type', '—')}\nMüşteri: {p.get('client', '—')}")
                    table.setItem(ri, ci, item)
                if str(p.get("id", "")) == current_id:
                    select_row = ri
            if select_row < 0 and visible_rows:
                select_row = 0
            if select_row >= 0:
                table.selectRow(select_row)
                self.selected_project_id = str(visible_rows[select_row].get("id", ""))
            else:
                self.selected_project_id = ""
        finally:
            table.setSortingEnabled(old_sorting)
            table.setUpdatesEnabled(True)
            table.blockSignals(was_signals_blocked)
            table.viewport().update()

        self._update_project_page_controls(start, len(visible_rows), len(rows), page_count)
        self._adjust_project_list_height()
        if select_row >= 0:
            self._show_project_detail(visible_rows[select_row])
        else:
            self._show_project_detail(None)

    def _update_project_page_controls(self, start: int, visible_count: int, total: int, page_count: int):
        label = getattr(self, "project_page_label", None)
        if label is not None:
            left = start + 1 if visible_count else 0
            right = start + visible_count
            label.setText(f"{left}–{right} / {total} proje · Sayfa {self._project_page + 1}/{page_count}")
        prev = getattr(self, "project_page_prev", None)
        nxt = getattr(self, "project_page_next", None)
        if prev is not None:
            prev.setEnabled(self._project_page > 0)
        if nxt is not None:
            nxt.setEnabled(self._project_page + 1 < page_count)

    def _change_project_page(self, delta: int):
        size = max(1, int(getattr(self, "_project_page_size", 100)))
        total = len(getattr(self, "_project_rows_cache", []) or [])
        page_count = max(1, (total + size - 1) // size)
        self._project_page = max(0, min(page_count - 1, int(getattr(self, "_project_page", 0)) + int(delta)))
        self._project_table_render_signature = None
        self.refresh_projects()

    def delete_selected_project(self):
        project_id = str(getattr(self, "selected_project_id", "") or "")
        project = next((p for p in self.workspace_projects if str(p.get("id", "")) == project_id), None)
        if not project:
            QMessageBox.information(self, "Proje seçilmedi", "Silmek için önce listeden bir proje seç.")
            return
        if not self._is_workspace_admin():
            QMessageBox.warning(self, "Yetki gerekli", "Proje silme işlemi yalnızca yöneticiler tarafından yapılabilir.")
            return
        name = str(project.get("name") or project.get("code") or "Proje")
        code = str(project.get("code") or "Kodsuz")
        answer = QMessageBox.question(
            self, "Projeyi kaldır",
            f"'{name}' ({code}) proje listesinden kaldırılacak.\n\nGüvenlik için kayıt önce ortak alandaki workspace/deleted_projects klasörüne yedeklenecek. Kurum rehberindeki bu projeye ait bağlantılar da kaldırılacak.\n\nDevam edilsin mi?",
            QMessageBox.Yes | QMessageBox.No, QMessageBox.No,
        )
        if answer != QMessageBox.Yes:
            return
        self.project_delete_btn.setEnabled(False)
        self.worker.queue_workspace("project_delete", {
            "id": project_id,
            "actor": str(self.config.get("windows_user", "") or "").strip(),
            "expected_revision": int(project.get("revision", 1) or 1),
        })
        self.status_label.setText(f"{code} projesi ortak alandan güvenli biçimde kaldırılıyor…")

    def _project_selection_changed(self):
        row = self.project_table.currentRow()
        if row < 0:
            return
        item = self.project_table.item(row, 0)
        project_id = str(item.data(Qt.UserRole) or "") if item else ""
        self.selected_project_id = project_id
        project = next((p for p in self.workspace_projects if str(p.get("id")) == project_id), None)
        self._show_project_detail(project)

    def _show_project_detail(self, p):
        if not hasattr(self, "project_detail_title"):
            return
        if not p:
            self.project_detail_title.setText("Bir proje seç")
            if hasattr(self, "project_detail_status"):
                self.project_detail_status.setText("—")
            self.opinion_summary.setText("0 kurum")
            self.project_edit_btn.setEnabled(False)
            if hasattr(self, "project_delete_btn"):
                self.project_delete_btn.setEnabled(False)
            self._render_project_pipeline(None)
            self._render_project_opinions(None, reset_page=True)
            return

        project_id = str(p.get("id", ""))
        reset_opinion_page = project_id != getattr(self, "_project_opinions_project_id", "")
        if reset_opinion_page:
            self._project_opinions_page = 0
            self._project_opinions_project_id = project_id
        self.project_detail_title.setText(f"{p.get('name', '')} · {p.get('code', '')}".strip(" ·"))
        if hasattr(self, "project_detail_status"):
            self.project_detail_status.setText("ARŞİV" if p.get("archived") else str(p.get("status", "—")))
        self._render_project_pipeline(p)
        self._render_project_opinions(p)
        actor = str(self.config.get("windows_user", "")).casefold()
        project_team = p.get("team", []) if isinstance(p.get("team", []), list) else []
        can_edit = self._is_workspace_admin() or actor in {str(x).casefold() for x in project_team} or actor == str(p.get("lead", "")).casefold()
        self.project_edit_btn.setEnabled(can_edit)
        if hasattr(self, "project_delete_btn"):
            admin = self._is_workspace_admin()
            self.project_delete_btn.setVisible(True)
            self.project_delete_btn.setEnabled(admin and bool(self.selected_project_id))
            self.project_delete_btn.setToolTip("Projeyi yedekleyerek kaldır" if admin else "Projeyi kaldırmak için yönetici yetkisi gerekli")

    def _render_project_opinions(self, project, reset_page=False):
        layout = getattr(self, "project_opinion_cards_layout", None)
        if layout is None:
            return
        while layout.count():
            item = layout.takeAt(0)
            widget = item.widget()
            if widget is not None:
                widget.setParent(None)
                widget.deleteLater()
        raw = (project or {}).get("institution_opinions", [])
        opinions = [op for op in raw if isinstance(op, dict)] if isinstance(raw, list) else []
        waiting = sum(1 for op in opinions if str(op.get("status", "")) == "Bekleniyor")
        received = sum(1 for op in opinions if str(op.get("status", "")) == "Geldi")
        self.opinion_summary.setText(f"{len(opinions)} kurum  ·  {waiting} bekliyor  ·  {received} yanıt")
        self.project_opinion_empty = QLabel("Henüz kurum görüşü kaydı yok")
        self.project_opinion_empty.setObjectName("emptyState")
        self.project_opinion_empty.setAlignment(Qt.AlignCenter)
        self.project_opinion_empty.setVisible(not opinions)
        layout.addWidget(self.project_opinion_empty)
        state_codes = {"Geldi": "success", "Bekleniyor": "waiting", "Revizyon istendi": "info", "Uygun değil": "danger"}
        for record in opinions:
            card = QFrame()
            card.setObjectName("opinionPreviewCard")
            card.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Maximum)
            body = QVBoxLayout(card)
            body.setContentsMargins(13, 10, 13, 10)
            body.setSpacing(5)
            header = QHBoxLayout()
            name = QLabel(str(record.get("institution", "Kurum belirtilmedi") or "Kurum belirtilmedi"))
            name.setObjectName("previewTitle")
            name.setWordWrap(True)
            name.setMinimumWidth(0)
            header.addWidget(name, 1)
            status_text = str(record.get("status", "Planlanmadı") or "Planlanmadı")
            status = QLabel(status_text)
            status.setObjectName("statusPill")
            status.setProperty("statusCode", state_codes.get(status_text, "neutral"))
            header.addWidget(status, 0, Qt.AlignTop)
            body.addLayout(header)
            dates = QLabel(f"İstenme  {format_date_tr(record.get('requested_date')) or '—'}     Dönüş  {format_date_tr(record.get('received_date')) or '—'}")
            dates.setObjectName("muted")
            dates.setWordWrap(True)
            body.addWidget(dates)
            details = " · ".join(v for v in (str(record.get("expert_name", "") or "").strip(), str(record.get("expert_contact", "") or "").strip()) if v)
            if details:
                detail_label = QLabel(details)
                detail_label.setObjectName("muted")
                detail_label.setWordWrap(True)
                detail_label.setTextInteractionFlags(Qt.TextSelectableByMouse)
                body.addWidget(detail_label)
            note_text = str(record.get("note", "") or "").strip()
            if note_text:
                note = QLabel(note_text)
                note.setObjectName("opinionPreviewNote")
                note.setWordWrap(True)
                note.setTextInteractionFlags(Qt.TextSelectableByMouse)
                body.addWidget(note)
            layout.addWidget(card)
        layout.addStretch(1)

    def _render_project_pipeline(self, project):
        """Render workflow milestones with theme-aware state properties."""
        stage = str((project or {}).get("stage", WORKFLOW_STAGES[0]))
        if stage == "Veri/literatür toplama":
            stage = "Saha çalışması"
        try:
            active_index = WORKFLOW_STAGES.index(stage)
        except ValueError:
            active_index = 0
        completed_project = bool(project and project.get("status") == "Tamamlandı")
        for index, frame, marker, label in getattr(self, "pipeline_stage_rows", []):
            if completed_project or index < active_index:
                state = "completed"
                marker.setText("✓")
            elif index == active_index:
                state = "active"
                marker.setText("●")
            else:
                state = "future"
                marker.setText("○")
            frame.setObjectName("pipelineStep")
            marker.setObjectName("pipelineMarker")
            label.setObjectName("pipelineLabel")
            for widget in (frame, marker, label):
                widget.setProperty("stepState", state)
                widget.style().unpolish(widget)
                widget.style().polish(widget)

    @staticmethod
    def _workspace_time(stamp):
        try:
            return datetime.fromtimestamp(float(stamp)).strftime("%d.%m.%Y %H:%M")
        except Exception:
            return "—"

    def _exec_project_editor(self, dialog):
        self._project_editor_active = True
        try:
            return dialog.exec()
        finally:
            self._project_editor_active = False
            if getattr(self, "_workspace_refresh_pending", False):
                self._workspace_refresh_pending = False
                QTimer.singleShot(0, self._refresh_workspace_after_project_editor)

    def _refresh_workspace_after_project_editor(self):
        if self.current_page in {"Projeler", "Ekibim", "Kurum Rehberi", "Genel Bakış"}:
            self.refresh_active_workspace_page()

    def create_project_dialog(self):
        if not self._is_workspace_admin():
            QMessageBox.warning(self, "Yetki gerekli", "Proje açma ve ekip atama işlemini yetkili kişiler yapabilir.")
            return
        dialog = ProjectEditorDialog(self, None, self.workspace_profiles)
        if self._exec_project_editor(dialog) == QDialog.Accepted:
            payload = dialog.payload()
            self.worker.queue_workspace("project_create", {"project": payload})
            self.status_label.setText("Proje ortak alana kaydediliyor…")

    def edit_selected_project(self):
        project_id = getattr(self, "selected_project_id", "")
        project = next((p for p in self.workspace_projects if str(p.get("id")) == project_id), None)
        if not project:
            return
        actor = str(self.config.get("windows_user", "")).casefold()
        can_edit = self._is_workspace_admin() or actor in {str(x).casefold() for x in project.get("team", [])} or actor == str(project.get("lead", "")).casefold()
        if not can_edit:
            QMessageBox.warning(self, "Yetki gerekli", "Bu projeyi düzenlemek için proje ekibinde olmalısın.")
            return
        dialog = ProjectEditorDialog(self, project, self.workspace_profiles, can_assign=self._is_workspace_admin())
        if self._exec_project_editor(dialog) == QDialog.Accepted:
            self.worker.queue_workspace("project_update", {"id": project_id, "changes": dialog.payload(), "expected_revision": int(project.get("revision", 1))})
            self.status_label.setText("Proje değişiklikleri kaydediliyor…")

    def refresh_team(self, *_):
        if not hasattr(self, "team_table"):
            return
        query = self.team_search.text().casefold().strip()
        projects = list(getattr(self, "workspace_projects", []))
        profiles = list(getattr(self, "workspace_profiles", []))
        rows = []
        for prof in profiles:
            assigned = [p for p in projects if str(prof.get("username", "")).casefold() in {str(x).casefold() for x in p.get("team", [])} | {str(p.get("lead", "")).casefold()} and not p.get("archived") and p.get("status") != "Tamamlandı"]
            hay = " ".join(str(prof.get(k, "")) for k in ("username", "display_name", "job_title", "role", "email", "expertise")).casefold()
            if query and query not in hay:
                continue
            rows.append((prof, assigned))
        self.team_table.setRowCount(len(rows))
        selected = str(getattr(self, "selected_profile_username", self.config.get("windows_user", ""))).casefold()
        chosen = -1
        for ri, (prof, assigned) in enumerate(rows):
            vals = [prof.get("display_name", prof.get("username", "—")), prof.get("job_title", "—") or "—", prof.get("role", "Diğer"), str(len(assigned)), prof.get("availability", "Uygun")]
            for ci, val in enumerate(vals):
                item = QTableWidgetItem(str(val))
                if ci == 0:
                    item.setData(Qt.UserRole, prof.get("username", ""))
                self.team_table.setItem(ri, ci, item)
            if str(prof.get("username", "")).casefold() == selected:
                chosen = ri
        if chosen >= 0:
            self.team_table.selectRow(chosen)
        elif rows:
            self.team_table.selectRow(0)
        else:
            self._show_profile_detail(None)

    def _team_selection_changed(self):
        row = self.team_table.currentRow()
        if row < 0:
            return
        item = self.team_table.item(row, 0)
        username = str(item.data(Qt.UserRole) or "") if item else ""
        self.selected_profile_username = username
        prof = next((p for p in self.workspace_profiles if str(p.get("username", "")).casefold() == username.casefold()), None)
        self._show_profile_detail(prof)

    def _show_profile_detail(self, prof):
        if not hasattr(self, "profile_title_label"):
            return
        self.profile_assignments.clear()
        if not prof:
            self.profile_title_label.setText("Profil seç")
            self.profile_contact_label.setText("—")
            self.profile_skills_label.setText("Uzmanlık alanları: —")
            return
        self.profile_title_label.setText(prof.get("display_name", prof.get("username", "—")))
        self.profile_contact_label.setText(f"{prof.get('job_title') or 'Görev belirtilmedi'} · {prof.get('role', 'Diğer')}\nKullanıcı: {prof.get('username', '—')}\nE-posta: {prof.get('email') or '—'} · Telefon: {prof.get('phone') or '—'}\nDurum: {prof.get('availability', 'Uygun')}")
        skills = prof.get("expertise", [])
        self.profile_skills_label.setText("Uzmanlık alanları: " + (", ".join(skills) if skills else "Henüz girilmedi"))
        username_key = str(prof.get("username", "")).casefold()
        projects = [p for p in self.workspace_projects if username_key in {str(x).casefold() for x in p.get("team", [])} | {str(p.get("lead", "")).casefold()} and not p.get("archived")]
        active_projects = [p for p in self.workspace_projects if not p.get("archived") and p.get("status") != "Tamamlandı"]
        task_rows = [(p, t) for p in active_projects for t in p.get("tasks", []) if str(t.get("assignee", "")).casefold() == username_key and t.get("status") != "Tamamlandı"]
        if not projects and not task_rows:
            self.profile_assignments.addItem("Atanmış proje veya açık görev yok")
        for p in projects:
            item = QListWidgetItem(f"{p.get('name')} · {p.get('code')}\n{p.get('stage')} · {p.get('status')} · Hedef: {format_date_tr(p.get('due_date')) or '—'}")
            item.setData(Qt.UserRole, p.get("id"))
            self.profile_assignments.addItem(item)
            for task_project, task in task_rows:
                if task_project.get("id") == p.get("id"):
                    sub = QListWidgetItem(f"    ↳ {task.get('title')} · {task.get('status')} · {task.get('priority', 'Normal')} · Hedef: {format_date_tr(task.get('due_date')) or 'Tarih yok'}")
                    sub.setData(Qt.UserRole, p.get("id"))
                    self.profile_assignments.addItem(sub)
        # Task assignees can be listed even if they have not otherwise been added to the project team.
        for p, task in task_rows:
            if p not in projects:
                self.profile_assignments.addItem(QListWidgetItem(f"{p.get('name')} · {p.get('code')}\n↳ {task.get('title')} · {task.get('status')} · Hedef: {format_date_tr(task.get('due_date')) or '—'}"))

    def edit_my_profile(self):
        actor = str(self.config.get("windows_user", ""))
        prof = next((p for p in self.workspace_profiles if str(p.get("username", "")).casefold() == actor.casefold()), {"username": actor, "display_name": actor, "role": "Diğer"})
        dialog = ProfileEditorDialog(self, prof, can_manage=self._is_workspace_admin(), allow_username=False)
        if dialog.exec() == QDialog.Accepted:
            payload = dialog.payload()
            self.worker.queue_workspace("profile_save", {"profile": payload})
            self.status_label.setText("Profil kaydediliyor…")

    def admin_manage_profile(self):
        if not self._is_workspace_admin():
            QMessageBox.warning(self, "Yetki gerekli", "Kişi oluşturma ve rol atama işlemleri yetkili kullanıcılara açıktır.")
            return
        dialog = ProfileManagerDialog(self, list(self.workspace_profiles))
        if dialog.exec() == QDialog.Accepted and dialog.profile_result:
            payload = dialog.profile_result
            self.worker.queue_workspace("profile_save", {"profile": payload})
            self.status_label.setText("Kişi profili ortak alana kaydediliyor…")

    def refresh_notes(self, *_):
        if not hasattr(self, "notes_list"):
            return
        self._notes_cache = self.notes_store.list()
        query = self.notes_search.text().casefold().strip()
        projects = {str(p.get("id")): p for p in getattr(self, "workspace_projects", [])}
        previous = self.notes_list.currentItem().data(Qt.UserRole) if self.notes_list.currentItem() else ""
        self.notes_list.clear()
        selected = None
        for note in self._notes_cache:
            linked = projects.get(str(note.get("project_id", "")), {})
            hay = " ".join(str(note.get(k, "")) for k in ("title", "body", "category", "due_date")) + " " + str(linked.get("name", ""))
            if query and query not in hay.casefold():
                continue
            pin = "★ " if note.get("pinned") else ""
            status = "✓" if note.get("status") == "Tamamlandı" else "•"
            due = f" · {format_date_tr(note.get('due_date'))}" if note.get("due_date") else ""
            project = f" · {linked.get('code')}" if linked else ""
            item = QListWidgetItem(f"{pin}{status} {note.get('title', 'Not')}\n{note.get('category', 'Genel')}{project}{due}")
            item.setData(Qt.UserRole, note.get("id"))
            self.notes_list.addItem(item)
            if str(note.get("id")) == str(previous):
                selected = self.notes_list.count() - 1
        if selected is not None:
            self.notes_list.setCurrentRow(selected)
        elif self.notes_list.count():
            self.notes_list.setCurrentRow(0)
        else:
            self._show_note_detail(None)

    def _selected_note(self):
        item = self.notes_list.currentItem() if hasattr(self, "notes_list") else None
        if not item:
            return None
        note_id = str(item.data(Qt.UserRole) or "")
        return next((n for n in self._notes_cache if str(n.get("id")) == note_id), None)

    def _note_selection_changed(self, *_):
        self._show_note_detail(self._selected_note())

    def _show_note_detail(self, note):
        if not hasattr(self, "note_detail_title"):
            return
        if not note:
            self.note_detail_title.setText("Not seç")
            self.note_detail_meta.setText("Bu notlar yalnızca mevcut Windows profilinde tutulur.")
            self.note_detail_body.setPlainText("")
            return
        project = next((p for p in self.workspace_projects if str(p.get("id")) == str(note.get("project_id"))), None)
        self.note_detail_title.setText(("★ " if note.get("pinned") else "") + note.get("title", "Not"))
        self.note_detail_meta.setText(f"{note.get('category', 'Genel')} · {note.get('status', 'Açık')} · Tarih: {format_date_tr(note.get('due_date')) or '—'} · Proje: {project.get('name') + ' · ' + project.get('code') if project else 'Bağlantısız'} · Güncellendi: {self._workspace_time(note.get('updated_at'))}")
        self.note_detail_body.setPlainText(note.get("body", ""))

    def create_note(self):
        dialog = NoteEditorDialog(self, None, self.workspace_projects)
        if dialog.exec() == QDialog.Accepted:
            self.notes_store.save(dialog.payload())
            self.refresh_notes()

    def edit_selected_note(self):
        note = self._selected_note()
        if not note:
            return
        dialog = NoteEditorDialog(self, note, self.workspace_projects)
        if dialog.exec() == QDialog.Accepted:
            self.notes_store.save(dialog.payload())
            self.refresh_notes()

    def toggle_selected_note(self):
        note = self._selected_note()
        if not note:
            return
        note["status"] = "Açık" if note.get("status") == "Tamamlandı" else "Tamamlandı"
        self.notes_store.save(note)
        self.refresh_notes()

    def delete_selected_note(self):
        note = self._selected_note()
        if not note:
            return
        answer = QMessageBox.question(self, "Notu sil", f"'{note.get('title', 'Not')}' kalıcı olarak silinsin mi?", QMessageBox.Yes | QMessageBox.No, QMessageBox.No)
        if answer == QMessageBox.Yes:
            self.notes_store.delete(str(note.get("id")))
            self.refresh_notes()

    def export_projects_bundle(self):
        if not self.snapshot.get("network_ok") or not (self.snapshot.get("workspace", {}) or {}).get("workspace_ok", True):
            QMessageBox.warning(self, "Dışa aktarma", "Ağ verisi doğrulanamıyor. Eski veriyi yeni rapor gibi dışa aktarmamak için işlem durduruldu.")
            return
        try:
            from openpyxl import Workbook
            from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
            from openpyxl.utils import get_column_letter
        except ImportError:
            QMessageBox.critical(self, "Excel dışa aktarma", "Excel dosyası oluşturmak için openpyxl eksik. INSTALL.bat / requirements.txt güncellemesinden sonra yeniden dene.")
            return
        default_name = "ENÇEV_Proje_Raporu_" + datetime.now().strftime("%d.%m.%Y_%H%M") + ".xlsx"
        path, _ = QFileDialog.getSaveFileName(self, "Excel proje takip raporu", str(Path.home() / default_name), "Excel çalışma kitabı (*.xlsx)")
        if not path:
            return
        if not path.casefold().endswith(".xlsx"):
            path += ".xlsx"
        projects = [p for p in self.workspace_projects if not p.get("archived")]
        profiles = list(self.workspace_profiles)
        project_rows, opinion_rows, task_rows = [], [], []
        for project in projects:
            code, name = project.get("code", ""), project.get("name", "")
            project_rows.append([name, code, project.get("client", ""), project.get("project_type", ""), project.get("province", ""), project.get("district", ""), project.get("status", ""), project.get("stage", ""), project.get("risk_level", "Normal"), project.get("lead", ""), ", ".join(project.get("team", [])), format_date_tr(project.get("due_date", "")), project.get("next_action", ""), project.get("blocker", ""), project.get("description", "")])
            for opinion in project.get("institution_opinions", []):
                opinion_rows.append([name, code, opinion.get("institution", ""), opinion.get("status", ""), format_date_tr(opinion.get("requested_date", "")), format_date_tr(opinion.get("received_date", "")), opinion.get("expert_name", ""), opinion.get("expert_contact", ""), opinion.get("note", "")])
            for task in project.get("tasks", []):
                task_rows.append([name, code, task.get("title", ""), task.get("assignee", ""), task.get("status", ""), task.get("priority", ""), format_date_tr(task.get("due_date", "")), task.get("note", "")])
        profile_rows = [[p.get("display_name", ""), p.get("username", ""), p.get("role", ""), p.get("job_title", ""), p.get("email", ""), p.get("phone", ""), ", ".join(p.get("expertise", [])), p.get("availability", "")] for p in profiles]
        sheets = [
            ("Projeler", ["Proje adı", "Proje kodu", "Müşteri / yatırımcı", "Tür", "İl", "İlçe", "Durum", "Aşama", "Risk", "Sorumlu", "Ekip", "Hedef teslim", "Sonraki adım", "Engel", "Kapsam notu"], project_rows),
            ("Kurum Görüşleri", ["Proje adı", "Proje kodu", "Kurum", "Durum", "İstenme tarihi", "Dönüş tarihi", "Uzmanı", "Telefon / e-posta", "Takip notu"], opinion_rows),
            ("Görevler", ["Proje adı", "Proje kodu", "Görev", "Sorumlu kullanıcı", "Durum", "Öncelik", "Hedef tarih", "Takip notu"], task_rows),
            ("Ekip", ["Ad soyad", "Windows kullanıcısı", "Rol", "Görev", "E-posta", "Telefon", "Uzmanlık", "Uygunluk"], profile_rows),
        ]
        wb = Workbook()
        wb.remove(wb.active)
        header_fill = PatternFill("solid", fgColor="157A6E")
        header_font = Font(name="Aptos", bold=True, color="FFFFFF")
        thin = Side(style="thin", color="DCE8E3")
        try:
            for sheet_name, headers, rows in sheets:
                ws = wb.create_sheet(sheet_name)
                ws.append(headers)
                for row in rows:
                    ws.append(["" if v is None else v for v in row])
                ws.freeze_panes = "A2"
                ws.auto_filter.ref = ws.dimensions
                ws.row_dimensions[1].height = 26
                for cell in ws[1]:
                    cell.fill = header_fill
                    cell.font = header_font
                    cell.alignment = Alignment(vertical="center", wrap_text=True)
                    cell.border = Border(bottom=thin)
                for row in ws.iter_rows(min_row=2):
                    for cell in row:
                        cell.alignment = Alignment(vertical="top", wrap_text=True)
                        cell.border = Border(bottom=thin)
                for col in range(1, len(headers) + 1):
                    sample = [str(ws.cell(r, col).value or "") for r in range(1, min(ws.max_row, 120) + 1)]
                    width = max((len(x) for x in sample), default=12) + 2
                    ws.column_dimensions[get_column_letter(col)].width = max(12, min(width, 42))
                ws.sheet_view.showGridLines = False
            wb.save(path)
            QMessageBox.information(self, "Excel dışa aktarma", f"Excel raporu hazırlandı:\n{path}")
        except Exception as exc:
            QMessageBox.critical(self, "Excel dışa aktarma", f"Excel raporu kaydedilemedi:\n{exc}")


class TeamPickerDialog(QDialog):
    """Comfortable modal selector for project team members."""
    def __init__(self, parent, profiles: list[dict[str, Any]], selected_usernames: list[str] | set[str] | None = None):
        super().__init__(parent)
        self.setWindowTitle("Proje ekibini seç")
        self.resize(620, 560)
        self.setMinimumSize(480, 420)
        selected = {str(x).casefold() for x in (selected_usernames or [])}
        root = QVBoxLayout(self)
        root.setContentsMargins(20, 18, 20, 16)
        root.setSpacing(12)
        title = QLabel("Projede görev alacak kişiler")
        title.setObjectName("sectionTitle")
        root.addWidget(title)
        self.search = QLineEdit()
        self.search.setPlaceholderText("İsim, kullanıcı adı veya uzmanlık ara…")
        root.addWidget(self.search)
        self.list = QListWidget()
        self.list.setAlternatingRowColors(False)
        self.list.setMouseTracking(True)
        self.list.viewport().setMouseTracking(True)
        self.list.setStyleSheet("")
        self.list.setSelectionMode(QAbstractItemView.NoSelection)
        for prof in profiles:
            username = str(prof.get("username", ""))
            display = str(prof.get("display_name") or username)
            expertise = ", ".join(prof.get("expertise", []) or [])
            item = QListWidgetItem(f"{display}  ·  {username}\n{prof.get('job_title') or prof.get('role', 'Diğer')}" + (f"  ·  {expertise}" if expertise else ""))
            item.setData(Qt.UserRole, username)
            item.setFlags(item.flags() | Qt.ItemIsUserCheckable)
            item.setCheckState(Qt.Checked if username.casefold() in selected else Qt.Unchecked)
            self.list.addItem(item)
        root.addWidget(self.list, 1)
        self.search.textChanged.connect(self._filter)
        buttons = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        buttons.button(QDialogButtonBox.Ok).setText("Seçimi uygula")
        buttons.button(QDialogButtonBox.Cancel).setText("Vazgeç")
        buttons.accepted.connect(self.accept)
        buttons.rejected.connect(self.reject)
        root.addWidget(buttons)
        self.selected_usernames = []

    def _filter(self, text: str):
        query = text.casefold().strip()
        for i in range(self.list.count()):
            item = self.list.item(i)
            item.setHidden(bool(query) and query not in item.text().casefold())

    def accept(self):
        self.selected_usernames = [str(self.list.item(i).data(Qt.UserRole)) for i in range(self.list.count()) if self.list.item(i).checkState() == Qt.Checked]
        super().accept()


class InstitutionOpinionsDialog(QDialog):
    """Responsive card-based editor: no clipped table columns or cell-widget alignment issues."""
    def __init__(self, parent, records: list[dict[str, Any]], profiles: list[dict[str, Any]] | None = None):
        super().__init__(parent)
        self.setWindowTitle("Kurum görüşleri")
        self.profiles = profiles or []
        self.rows: list[dict[str, Any]] = []
        safe_records = records if isinstance(records, list) else []
        self.institution_names = self._collect_institution_names(parent, safe_records)

        screen = self.screen() or QApplication.primaryScreen()
        available = screen.availableGeometry() if screen else None
        available_width = available.width() if available else 1400
        available_height = available.height() if available else 900
        min_width = max(440, min(720, available_width - 40))
        min_height = max(340, min(540, available_height - 44))
        self.setMinimumSize(min_width, min_height)
        self.resize(max(min_width, min(1160, available_width - 32)),
                    max(min_height, min(760, available_height - 32)))

        root = QVBoxLayout(self)
        root.setContentsMargins(18, 16, 18, 14)
        root.setSpacing(12)
        head = QHBoxLayout()
        title = QLabel("Kurum görüşleri")
        title.setObjectName("dialogTitle")
        head.addWidget(title, 1)
        self.counter = QLabel("0 kurum")
        self.counter.setObjectName("statusPill")
        head.addWidget(self.counter)
        root.addLayout(head)

        tools = QHBoxLayout()
        self.search = QLineEdit()
        self.search.setPlaceholderText("Kurum veya uzman ara…")
        self.search.setClearButtonEnabled(True)
        self.search.textChanged.connect(self._filter_rows)
        tools.addWidget(self.search, 1)
        self.add_button = QPushButton("＋ Kurum ekle")
        self.add_button.setObjectName("primary")
        self.add_button.clicked.connect(self._add_institution)
        tools.addWidget(self.add_button)
        root.addLayout(tools)

        self.scroll = QScrollArea()
        self.scroll.setObjectName("opinionEditorScroll")
        self.scroll.setWidgetResizable(True)
        self.scroll.setFrameShape(QFrame.NoFrame)
        self.scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        self.scroll.setVerticalScrollBarPolicy(Qt.ScrollBarAsNeeded)
        self.cards_host = QWidget()
        self.cards_host.setObjectName("opinionCardsHost")
        self.cards_layout = QVBoxLayout(self.cards_host)
        self.cards_layout.setContentsMargins(2, 2, 8, 2)
        self.cards_layout.setSpacing(10)
        self.empty_label = QLabel("Kurum görüşü bulunamadı")
        self.empty_label.setObjectName("emptyState")
        self.empty_label.setAlignment(Qt.AlignCenter)
        self.cards_layout.addWidget(self.empty_label)
        self.scroll.setWidget(self.cards_host)
        root.addWidget(self.scroll, 1)

        footer = QHBoxLayout()
        footer.addWidget(QLabel("Tarih biçimi: GG.AA.YYYY"), 1)
        buttons = QDialogButtonBox(QDialogButtonBox.Save | QDialogButtonBox.Cancel)
        buttons.button(QDialogButtonBox.Save).setText("Kaydet")
        buttons.button(QDialogButtonBox.Save).setObjectName("primary")
        buttons.button(QDialogButtonBox.Cancel).setText("Vazgeç")
        buttons.button(QDialogButtonBox.Cancel).setObjectName("secondary")
        buttons.accepted.connect(self._validate)
        buttons.rejected.connect(self.reject)
        footer.addWidget(buttons)
        root.addLayout(footer)

        for rec in safe_records:
            if isinstance(rec, dict):
                self._add_row(rec)
        self._update_counter()

    @staticmethod
    def _collect_institution_names(parent, records):
        """Keep a small standard list; arbitrary institution names remain editable."""
        names, seen = [], set()
        def add(value):
            value = str(value or "").strip()
            key = value.casefold()
            if value and key not in seen and len(names) < 120:
                names.append(value)
                seen.add(key)
        for value in DEFAULT_INSTITUTIONS:
            add(value)
        for opinion in (records if isinstance(records, list) else [])[:500]:
            if isinstance(opinion, dict):
                add(opinion.get("institution", ""))
        return names

    @staticmethod
    def _field(label_text: str, control: QWidget) -> QWidget:
        wrap = QWidget()
        wrap.setObjectName("labeledField")
        lay = QVBoxLayout(wrap)
        lay.setContentsMargins(0, 0, 0, 0)
        lay.setSpacing(5)
        label = QLabel(label_text)
        label.setObjectName("fieldCaption")
        lay.addWidget(label)
        control.setMinimumWidth(0)
        control.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Fixed)
        lay.addWidget(control)
        return wrap

    def _add_institution(self):
        self._add_row({"institution": "", "status": "Planlanmadı", "requested_date": "",
                       "received_date": "", "expert_name": "", "expert_contact": "", "note": ""})
        row = self.rows[-1]
        self._filter_rows(self.search.text())
        self.scroll.ensureWidgetVisible(row["card"])
        row["institution"].setFocus(Qt.OtherFocusReason)
        row["institution"].setEditText("")

    def _add_row(self, rec: dict[str, Any] | None = None):
        rec = rec or {}
        card = QFrame()
        card.setObjectName("opinionEditCard")
        card.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Maximum)
        card_layout = QVBoxLayout(card)
        card_layout.setContentsMargins(14, 12, 14, 14)
        card_layout.setSpacing(10)

        header = QHBoxLayout()
        record_label = QLabel("Kurum kaydı")
        record_label.setObjectName("opinionCardTitle")
        record_label.setWordWrap(True)
        record_label.setMinimumWidth(0)
        header.addWidget(record_label, 1)
        remove = QPushButton("Kaldır")
        remove.setObjectName("danger")
        remove.setToolTip("Bu kurum görüşünü kaydetmeden önce listeden kaldır")
        header.addWidget(remove)
        card_layout.addLayout(header)

        institution = NoWheelComboBox()
        institution.setEditable(True)
        institution.setInsertPolicy(QComboBox.NoInsert)
        institution.setMinimumContentsLength(12)
        institution.addItems(DEFAULT_INSTITUTIONS)
        current_name = str(rec.get("institution", "") or "").strip()
        if current_name and institution.findText(current_name, Qt.MatchFixedString) < 0:
            institution.addItem(current_name)
        institution.setCurrentText(current_name)
        if hasattr(institution, "lineEdit") and institution.lineEdit():
            institution.lineEdit().setPlaceholderText("Kurumun tam adını yaz veya seç")
        status = NoWheelComboBox()
        status.addItems(OPINION_STATUSES)
        status.setCurrentText(str(rec.get("status", "Planlanmadı") or "Planlanmadı"))

        requested = QLineEdit(format_date_tr(rec.get("requested_date", "")))
        received = QLineEdit(format_date_tr(rec.get("received_date", "")))
        for edit in (requested, received):
            edit.setPlaceholderText("GG.AA.YYYY")
            wire_turkish_date_input(edit)
        expert = QLineEdit(str(rec.get("expert_name", "") or ""))
        expert.setPlaceholderText("Uzmanın adı ve soyadı")
        contact = QLineEdit(str(rec.get("expert_contact", "") or ""))
        contact.setPlaceholderText("Telefon veya e-posta")
        note = QTextEdit()
        note.setObjectName("opinionNoteEdit")
        note.setPlainText(str(rec.get("note", "") or ""))
        note.setPlaceholderText("Kısa takip notu")
        note.setMinimumHeight(62)
        note.setMaximumHeight(92)

        row1 = QGridLayout()
        row1.setContentsMargins(0, 0, 0, 0)
        row1.setHorizontalSpacing(12)
        row1.setVerticalSpacing(0)
        row1.addWidget(self._field("Kurum", institution), 0, 0)
        row1.addWidget(self._field("Durum", status), 0, 1)
        row1.setColumnStretch(0, 3)
        row1.setColumnStretch(1, 2)
        card_layout.addLayout(row1)

        row2 = QGridLayout()
        row2.setContentsMargins(0, 0, 0, 0)
        row2.setHorizontalSpacing(12)
        row2.addWidget(self._field("İstenme tarihi", requested), 0, 0)
        row2.addWidget(self._field("Dönüş tarihi", received), 0, 1)
        row2.setColumnStretch(0, 1)
        row2.setColumnStretch(1, 1)
        card_layout.addLayout(row2)

        row3 = QGridLayout()
        row3.setContentsMargins(0, 0, 0, 0)
        row3.setHorizontalSpacing(12)
        row3.addWidget(self._field("Uzman adı soyadı", expert), 0, 0)
        row3.addWidget(self._field("İletişim", contact), 0, 1)
        row3.setColumnStretch(0, 1)
        row3.setColumnStretch(1, 1)
        card_layout.addLayout(row3)
        card_layout.addWidget(self._field("Takip notu", note))

        entry = {"card": card, "record_label": record_label, "institution": institution, "status": status,
                 "requested": requested, "received": received, "expert": expert, "contact": contact, "note": note}
        institution.currentTextChanged.connect(lambda value, label=record_label: label.setText(value.strip() or "Kurum kaydı"))
        remove.clicked.connect(lambda _checked=False, target=entry: self._remove_row(target))
        self.rows.append(entry)
        self.cards_layout.insertWidget(max(0, self.cards_layout.count() - (1 if self.empty_label.isVisible() else 0)), card)
        self.empty_label.hide()
        return entry

    def _remove_row(self, entry: dict[str, Any]):
        if entry not in self.rows:
            return
        institution = entry["institution"].currentText().strip() or "Bu kurum görüşü"
        answer = QMessageBox.question(
            self, "Kurum görüşünü kaldır",
            f"{institution} kaydı bu düzenlemeden kaldırılacak. Kaydetmeden önce geri alabilirsin. Devam edilsin mi?",
            QMessageBox.Yes | QMessageBox.No, QMessageBox.No,
        )
        if answer != QMessageBox.Yes:
            return
        self.rows.remove(entry)
        entry["card"].setParent(None)
        entry["card"].deleteLater()
        self._update_counter()
        self._filter_rows(self.search.text())

    def _filter_rows(self, text: str):
        query = str(text or "").casefold().strip()
        visible = 0
        for row in self.rows:
            searchable = " ".join([
                row["institution"].currentText(), row["expert"].text(), row["contact"].text(), row["note"].toPlainText()
            ]).casefold()
            show = not query or query in searchable
            row["card"].setVisible(show)
            visible += int(show)
        self.empty_label.setText("Kurum görüşü bulunamadı" if not self.rows else "Aramayla eşleşen kurum bulunamadı")
        self.empty_label.setVisible(visible == 0)
        self._update_counter(visible)

    def _update_counter(self, visible: int | None = None):
        if visible is None:
            visible = len(self.rows)
        suffix = f" · {visible} gösteriliyor" if visible != len(self.rows) else ""
        self.counter.setText(f"{len(self.rows)} kurum{suffix}")

    def _validate(self):
        seen: set[str] = set()
        for index, row in enumerate(self.rows, 1):
            name = row["institution"].currentText().strip()
            if not name:
                QMessageBox.warning(self, "Kurum adı gerekli", f"{index}. kurum kaydında kurum adı boş.")
                row["institution"].setFocus()
                return
            key = name.casefold()
            if key in seen:
                answer = QMessageBox.question(
                    self, "Tekrarlanan kurum", f"'{name}' birden fazla kez listelenmiş. Yine de devam edilsin?",
                    QMessageBox.Yes | QMessageBox.No, QMessageBox.No,
                )
                if answer != QMessageBox.Yes:
                    row["institution"].setFocus()
                    return
            seen.add(key)
            for key_name, label in (("requested", "istenme"), ("received", "dönüş")):
                field = row[key_name]
                if field.text().strip():
                    try:
                        parse_date_tr(field.text().strip(), f"{name} {label} tarihi")
                    except ValueError as exc:
                        QMessageBox.warning(self, "Tarih biçimi", str(exc))
                        field.setFocus()
                        return
        self.accept()

    def payload(self):
        out = []
        for row in self.rows:
            name = row["institution"].currentText().strip()
            if not name:
                continue
            requested = row["requested"].text().strip()
            received = row["received"].text().strip()
            out.append({
                "institution": name,
                "status": row["status"].currentText(),
                "requested_date": parse_date_tr(requested, f"{name} istenme tarihi") if requested else "",
                "received_date": parse_date_tr(received, f"{name} dönüş tarihi") if received else "",
                "expert_name": row["expert"].text().strip(),
                "expert_contact": row["contact"].text().strip(),
                "due_date": "",
                "note": row["note"].toPlainText().strip(),
            })
        return out


class ProfileManagerDialog(QDialog):
    """A proper modal directory instead of the narrow native combo popup."""
    def __init__(self, parent, profiles: list[dict[str, Any]]):
        super().__init__(parent)
        self.setWindowTitle("Kişi yönetimi")
        self.resize(760, 570)
        self.setMinimumSize(600, 440)
        self.profiles = [dict(p) for p in profiles]
        self.profile_result = None
        root = QVBoxLayout(self)
        root.setContentsMargins(20, 18, 20, 16)
        root.setSpacing(12)
        title = QLabel("Ekip kişileri")
        title.setObjectName("sectionTitle")
        title.setObjectName("profileManagerTitle")
        root.addWidget(title)
        bar = QHBoxLayout()
        self.search = QLineEdit()
        self.search.setPlaceholderText("Ad, Windows kullanıcı adı, rol veya uzmanlık ara…")
        self.search.textChanged.connect(self._filter)
        bar.addWidget(self.search, 1)
        add = QPushButton("+ Yeni kişi")
        add.setObjectName("primary")
        add.clicked.connect(self._new)
        bar.addWidget(add)
        edit = QPushButton("Seçili kişiyi düzenle")
        edit.setObjectName("secondary")
        edit.clicked.connect(self._edit)
        bar.addWidget(edit)
        root.addLayout(bar)
        self.table = QTableWidget(0, 4)
        self.table.setHorizontalHeaderLabels(["AD SOYAD", "WINDOWS KULLANICISI", "ROL", "UZMANLIKLAR"])
        self.table.setAlternatingRowColors(True)
        self.table.setSelectionBehavior(QAbstractItemView.SelectRows)
        self.table.setSelectionMode(QAbstractItemView.SingleSelection)
        self.table.setEditTriggers(QAbstractItemView.NoEditTriggers)
        self.table.verticalHeader().setVisible(False)
        self.table.horizontalHeader().setSectionResizeMode(0, QHeaderView.Stretch)
        self.table.horizontalHeader().setSectionResizeMode(1, QHeaderView.Stretch)
        self.table.horizontalHeader().setSectionResizeMode(2, QHeaderView.ResizeToContents)
        self.table.horizontalHeader().setSectionResizeMode(3, QHeaderView.Stretch)
        root.addWidget(self.table, 1)
        self.table.doubleClicked.connect(self._edit)
        self._render()
        close = QDialogButtonBox(QDialogButtonBox.Close)
        close.button(QDialogButtonBox.Close).setText("Kapat")
        close.rejected.connect(self.reject)
        close.accepted.connect(self.reject)
        root.addWidget(close)

    def _render(self):
        self.table.setRowCount(len(self.profiles))
        for row, profile in enumerate(self.profiles):
            vals = [profile.get("display_name", ""), profile.get("username", ""), profile.get("role", "Diğer"), ", ".join(profile.get("expertise", []) or [])]
            for col, value in enumerate(vals):
                item = QTableWidgetItem(str(value))
                if col == 1:
                    item.setData(Qt.UserRole, profile.get("username", ""))
                self.table.setItem(row, col, item)
            self.table.setRowHeight(row, 40)
        if self.profiles:
            self.table.selectRow(0)
        self._filter(self.search.text())

    def _filter(self, text: str):
        query = text.casefold().strip()
        for row in range(self.table.rowCount()):
            hay = " ".join(self.table.item(row, col).text() if self.table.item(row, col) else "" for col in range(self.table.columnCount())).casefold()
            self.table.setRowHidden(row, bool(query) and query not in hay)

    def _current_profile(self):
        row = self.table.currentRow()
        if row < 0:
            return None
        item = self.table.item(row, 1)
        username = str(item.data(Qt.UserRole) or "") if item else ""
        return next((dict(p) for p in self.profiles if str(p.get("username", "")).casefold() == username.casefold()), None)

    def _new(self):
        blank = {"username": "", "display_name": "", "role": "Diğer", "expertise": []}
        editor = ProfileEditorDialog(self, blank, can_manage=True, allow_username=True)
        if editor.exec() == QDialog.Accepted:
            self.profile_result = editor.payload()
            self.accept()

    def _edit(self, *_):
        profile = self._current_profile()
        if not profile:
            QMessageBox.information(self, "Kişi seç", "Düzenlemek için listeden bir kişi seç.")
            return
        editor = ProfileEditorDialog(self, profile, can_manage=True, allow_username=False)
        if editor.exec() == QDialog.Accepted:
            self.profile_result = editor.payload()
            self.accept()


class ProjectEditorDialog(QDialog):
    """Tabbed, responsive project editor. Dense embedded table editors are replaced by labeled fields/cards."""
    def __init__(self, parent, project: dict[str, Any] | None, profiles: list[dict[str, Any]], can_assign: bool = True):
        super().__init__(parent)
        self.project = dict(project or {})
        self.profiles = profiles or []
        self.can_assign = can_assign
        self.current_user = str(getattr(parent, "config", {}).get("windows_user", "")).casefold()
        self._task_cards: list[dict[str, Any]] = []
        self._opinion_records = [dict(x) for x in (self.project.get("institution_opinions") or []) if isinstance(x, dict)]
        if not self._opinion_records:
            self._opinion_records = [{"institution": name, "status": "Planlanmadı", "requested_date": "", "received_date": "", "expert_name": "", "expert_contact": "", "note": ""} for name in DEFAULT_INSTITUTIONS]

        self.setWindowTitle("Projeyi düzenle" if project else "Yeni proje")
        screen = self.screen() or QApplication.primaryScreen()
        available = screen.availableGeometry() if screen else None
        aw = available.width() if available else 1400
        ah = available.height() if available else 900
        min_width = max(480, min(800, aw - 40))
        min_height = max(360, min(570, ah - 48))
        self.setMinimumSize(min_width, min_height)
        self.resize(max(min_width, min(1120, aw - 32)), max(min_height, min(780, ah - 32)))

        root = QVBoxLayout(self)
        root.setContentsMargins(18, 16, 18, 14)
        root.setSpacing(12)
        title_row = QHBoxLayout()
        title = QLabel("Projeyi düzenle" if project else "Yeni proje")
        title.setObjectName("dialogTitle")
        title_row.addWidget(title, 1)
        code_label = QLabel(str(self.project.get("code") or "Yeni kayıt"))
        code_label.setObjectName("statusPill")
        title_row.addWidget(code_label)
        root.addLayout(title_row)

        self.tabs = QTabWidget()
        self.tabs.setObjectName("projectEditorTabs")
        self.tabs.setDocumentMode(True)
        root.addWidget(self.tabs, 1)
        self._make_general_tab()
        self._make_tasks_tab()
        self._make_opinions_tab()

        buttons = QDialogButtonBox(QDialogButtonBox.Save | QDialogButtonBox.Cancel)
        buttons.button(QDialogButtonBox.Save).setText("Kaydet")
        buttons.button(QDialogButtonBox.Save).setObjectName("primary")
        buttons.button(QDialogButtonBox.Cancel).setText("Vazgeç")
        buttons.button(QDialogButtonBox.Cancel).setObjectName("secondary")
        buttons.accepted.connect(self._validate_accept)
        buttons.rejected.connect(self.reject)
        root.addWidget(buttons)

    @staticmethod
    def _field(label_text: str, control: QWidget) -> QWidget:
        wrap = QWidget()
        wrap.setObjectName("labeledField")
        lay = QVBoxLayout(wrap)
        lay.setContentsMargins(0, 0, 0, 0)
        lay.setSpacing(5)
        label = QLabel(label_text)
        label.setObjectName("fieldCaption")
        lay.addWidget(label)
        control.setMinimumWidth(0)
        control.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Fixed)
        lay.addWidget(control)
        return wrap

    @staticmethod
    def _page_scroll(widget: QWidget) -> QScrollArea:
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.NoFrame)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        scroll.setVerticalScrollBarPolicy(Qt.ScrollBarAsNeeded)
        scroll.setWidget(widget)
        return scroll

    def _make_general_tab(self):
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(12, 12, 12, 12)
        layout.setSpacing(14)

        panel = QFrame()
        panel.setObjectName("dialogPanel")
        grid = QGridLayout(panel)
        grid.setContentsMargins(16, 16, 16, 16)
        grid.setHorizontalSpacing(14)
        grid.setVerticalSpacing(12)

        self.name = QLineEdit(str(self.project.get("name", "")))
        self.name.setPlaceholderText("Projenin tam adı")
        self.code = QLineEdit(str(self.project.get("code", "")))
        self.code.setPlaceholderText("Proje kodu")
        self.client = QLineEdit(str(self.project.get("client", "")))
        self.client.setPlaceholderText("Müşteri / yatırımcı")
        self.kind = NoWheelComboBox()
        self.kind.addItems(PROJECT_TYPES)
        self.kind.setCurrentText(str(self.project.get("project_type", "ÇED")))
        self.province = QLineEdit(str(self.project.get("province", "")))
        self.province.setPlaceholderText("İl")
        self.district = QLineEdit(str(self.project.get("district", "")))
        self.district.setPlaceholderText("İlçe")
        self.due = QLineEdit(format_date_tr(self.project.get("due_date", "")))
        self.due.setPlaceholderText("GG.AA.YYYY")
        wire_turkish_date_input(self.due)
        self.lead = NoWheelComboBox()
        self.lead.addItem("Atanmadı", "")
        for profile in self.profiles:
            username = str(profile.get("username", ""))
            self.lead.addItem(f"{profile.get('display_name', username)} · {username}", username)
        self.lead.setCurrentIndex(max(0, self.lead.findData(self.project.get("lead", ""))))
        self.status = NoWheelComboBox()
        self.status.addItems(PROJECT_STATUSES)
        self.status.setCurrentText(str(self.project.get("status", "Hazırlanıyor")))
        self.stage = NoWheelComboBox()
        self.stage.addItems(WORKFLOW_STAGES)
        initial_stage = str(self.project.get("stage", WORKFLOW_STAGES[0]))
        self.stage.setCurrentText("Saha çalışması" if initial_stage == "Veri/literatür toplama" else initial_stage)
        self.risk = NoWheelComboBox()
        self.risk.addItems(["Normal", "Dikkat", "Kritik"])
        self.risk.setCurrentText(str(self.project.get("risk_level", "Normal")))
        self.next_action = QLineEdit(str(self.project.get("next_action", "")))
        self.next_action.setPlaceholderText("Bir sonraki somut adım")
        self.blocker = QLineEdit(str(self.project.get("blocker", "")))
        self.blocker.setPlaceholderText("Beklenen karar veya engel (isteğe bağlı)")

        grid.addWidget(self._field("Proje adı *", self.name), 0, 0, 1, 2)
        grid.addWidget(self._field("Proje kodu", self.code), 1, 0)
        grid.addWidget(self._field("Proje türü", self.kind), 1, 1)
        grid.addWidget(self._field("Müşteri / yatırımcı", self.client), 2, 0)
        grid.addWidget(self._field("İl", self.province), 2, 1)
        grid.addWidget(self._field("İlçe", self.district), 3, 0)
        grid.addWidget(self._field("Hedef teslim tarihi", self.due), 3, 1)
        grid.addWidget(self._field("Proje sorumlusu", self.lead), 4, 0)
        grid.addWidget(self._field("Genel durum", self.status), 4, 1)
        grid.addWidget(self._field("Aşama", self.stage), 5, 0)
        grid.addWidget(self._field("Risk düzeyi", self.risk), 5, 1)
        grid.addWidget(self._field("Sonraki adım", self.next_action), 6, 0, 1, 2)
        grid.addWidget(self._field("Engel / beklenen karar", self.blocker), 7, 0, 1, 2)
        grid.setColumnStretch(0, 1)
        grid.setColumnStretch(1, 1)
        layout.addWidget(panel)

        team_panel = QFrame()
        team_panel.setObjectName("dialogPanel")
        team_layout = QHBoxLayout(team_panel)
        team_layout.setContentsMargins(16, 12, 16, 12)
        team_layout.setSpacing(12)
        team_heading = QLabel("Proje ekibi")
        team_heading.setObjectName("sectionTitle")
        team_layout.addWidget(team_heading)
        self.team_pick_summary = QLabel("")
        self.team_pick_summary.setObjectName("muted")
        team_layout.addWidget(self.team_pick_summary, 1)
        self.team_pick_button = QPushButton("Ekip seç")
        self.team_pick_button.setObjectName("secondary")
        self.team_pick_button.clicked.connect(self._open_team_picker)
        team_layout.addWidget(self.team_pick_button)
        layout.addWidget(team_panel)

        team = {str(x).casefold() for x in self.project.get("team", [])}
        self.team_list = QListWidget()
        for profile in self.profiles:
            username = str(profile.get("username", ""))
            item = QListWidgetItem(f"{profile.get('display_name', username)} · {username}")
            item.setData(Qt.UserRole, username)
            item.setFlags(item.flags() | Qt.ItemIsUserCheckable)
            item.setCheckState(Qt.Checked if username.casefold() in team else Qt.Unchecked)
            self.team_list.addItem(item)
        self.team_list.setVisible(False)
        self._update_team_pick_summary()

        scope_panel = QFrame()
        scope_panel.setObjectName("dialogPanel")
        scope_layout = QVBoxLayout(scope_panel)
        scope_layout.setContentsMargins(16, 12, 16, 14)
        scope_title = QLabel("Kapsam / iş notu")
        scope_title.setObjectName("sectionTitle")
        scope_layout.addWidget(scope_title)
        self.description = QTextEdit()
        self.description.setPlainText(str(self.project.get("description", "")))
        self.description.setPlaceholderText("İş kapsamı, kararlar ve temel notlar")
        self.description.setMinimumHeight(82)
        self.description.setMaximumHeight(150)
        scope_layout.addWidget(self.description)
        layout.addWidget(scope_panel)
        layout.addStretch(1)

        if self.project and not self.can_assign:
            for widget in (self.code, self.name, self.client, self.kind, self.province, self.district, self.due, self.lead, self.team_pick_button):
                widget.setEnabled(False)
        self.tabs.addTab(self._page_scroll(page), "Genel")

    def _make_tasks_tab(self):
        page = QWidget()
        root = QVBoxLayout(page)
        root.setContentsMargins(12, 12, 12, 12)
        root.setSpacing(10)
        header = QHBoxLayout()
        title = QLabel("Görevler")
        title.setObjectName("sectionTitle")
        header.addWidget(title)
        self.task_count = QLabel("0 görev")
        self.task_count.setObjectName("statusPill")
        header.addWidget(self.task_count)
        header.addStretch(1)
        self.task_add_btn = QPushButton("＋ Görev ekle")
        self.task_add_btn.setObjectName("primary")
        self.task_add_btn.clicked.connect(self._add_task_row)
        self.task_add_btn.setVisible((not self.project) or self.can_assign)
        header.addWidget(self.task_add_btn)
        root.addLayout(header)

        self.task_scroll = QScrollArea()
        self.task_scroll.setWidgetResizable(True)
        self.task_scroll.setFrameShape(QFrame.NoFrame)
        self.task_scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        self.task_host = QWidget()
        self.task_host.setObjectName("taskCardsHost")
        self.task_cards_layout = QVBoxLayout(self.task_host)
        self.task_cards_layout.setContentsMargins(2, 2, 8, 2)
        self.task_cards_layout.setSpacing(10)
        self.task_empty = QLabel("Görev eklenmedi")
        self.task_empty.setObjectName("emptyState")
        self.task_empty.setAlignment(Qt.AlignCenter)
        self.task_cards_layout.addWidget(self.task_empty)
        self.task_scroll.setWidget(self.task_host)
        root.addWidget(self.task_scroll, 1)
        self.tabs.addTab(page, "Görevler")

        for task in (self.project.get("tasks") or []):
            if isinstance(task, dict):
                self._add_task_row(task)
        self._update_task_count()

    def _make_opinions_tab(self):
        page = QWidget()
        root = QVBoxLayout(page)
        root.setContentsMargins(12, 12, 12, 12)
        root.setSpacing(10)
        header = QHBoxLayout()
        title = QLabel("Kurum görüşleri")
        title.setObjectName("sectionTitle")
        header.addWidget(title)
        self.opinion_summary_label = QLabel("")
        self.opinion_summary_label.setObjectName("statusPill")
        header.addWidget(self.opinion_summary_label)
        header.addStretch(1)
        self.opinion_edit_btn = QPushButton("Görüşleri düzenle")
        self.opinion_edit_btn.setObjectName("primary")
        self.opinion_edit_btn.clicked.connect(self._open_opinions_dialog)
        self.opinion_edit_btn.setVisible((not self.project) or self.can_assign)
        header.addWidget(self.opinion_edit_btn)
        root.addLayout(header)

        self.opinion_scroll = QScrollArea()
        self.opinion_scroll.setWidgetResizable(True)
        self.opinion_scroll.setFrameShape(QFrame.NoFrame)
        self.opinion_scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        self.opinion_host = QWidget()
        self.opinion_host.setObjectName("opinionPreviewHost")
        self.opinion_preview_layout = QVBoxLayout(self.opinion_host)
        self.opinion_preview_layout.setContentsMargins(2, 2, 8, 2)
        self.opinion_preview_layout.setSpacing(8)
        self.opinion_empty = QLabel("Kurum görüşü kaydı yok")
        self.opinion_empty.setObjectName("emptyState")
        self.opinion_empty.setAlignment(Qt.AlignCenter)
        self.opinion_preview_layout.addWidget(self.opinion_empty)
        self.opinion_scroll.setWidget(self.opinion_host)
        root.addWidget(self.opinion_scroll, 1)
        self.tabs.addTab(page, "Kurum görüşleri")
        self._render_opinion_previews()
        self._update_opinion_summary()

    def _update_team_pick_summary(self):
        selected = []
        for index in range(self.team_list.count()):
            item = self.team_list.item(index)
            if item.checkState() == Qt.Checked:
                selected.append(item.text())
        self.team_pick_summary.setText(f"{len(selected)} kişi seçildi" if selected else "Ekip atanmadı")

    def _open_team_picker(self):
        selected = [str(self.team_list.item(i).data(Qt.UserRole)) for i in range(self.team_list.count())
                    if self.team_list.item(i).checkState() == Qt.Checked]
        dlg = TeamPickerDialog(self, self.profiles, selected)
        if dlg.exec() == QDialog.Accepted:
            chosen = {str(x).casefold() for x in dlg.selected_usernames}
            for index in range(self.team_list.count()):
                item = self.team_list.item(index)
                item.setCheckState(Qt.Checked if str(item.data(Qt.UserRole)).casefold() in chosen else Qt.Unchecked)
            self._update_team_pick_summary()

    def _add_task_row(self, rec: dict[str, Any] | None = None):
        rec = dict(rec or {})
        card = QFrame()
        card.setObjectName("taskEditorCard")
        card.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Maximum)
        layout = QVBoxLayout(card)
        layout.setContentsMargins(14, 12, 14, 14)
        layout.setSpacing(10)

        title_edit = QLineEdit(str(rec.get("title", "")))
        title_edit.setPlaceholderText("Görev adı")
        task_header = QHBoxLayout()
        task_header.addWidget(self._field("Görev", title_edit), 1)
        remove = QPushButton("Kaldır")
        remove.setObjectName("danger")
        remove.setVisible((not self.project) or self.can_assign)
        task_header.addWidget(remove)
        layout.addLayout(task_header)

        assignee = NoWheelComboBox()
        assignee.addItem("Atanmadı", "")
        for profile in self.profiles:
            username = str(profile.get("username", ""))
            assignee.addItem(f"{profile.get('display_name', username)} · {username}", username)
        assignee.setCurrentIndex(max(0, assignee.findData(rec.get("assignee", ""))))
        status = NoWheelComboBox()
        status.addItems(TASK_STATUSES)
        status.setCurrentText(str(rec.get("status", "Planlandı")))
        due = QLineEdit(format_date_tr(rec.get("due_date", "")))
        due.setPlaceholderText("GG.AA.YYYY")
        wire_turkish_date_input(due)
        priority = NoWheelComboBox()
        priority.addItems(TASK_PRIORITIES)
        priority.setCurrentText(str(rec.get("priority", "Normal")))
        note = QTextEdit()
        note.setPlainText(str(rec.get("note", "")))
        note.setPlaceholderText("Kısa takip notu")
        note.setMinimumHeight(54)
        note.setMaximumHeight(78)

        grid = QGridLayout()
        grid.setContentsMargins(0, 0, 0, 0)
        grid.setHorizontalSpacing(12)
        grid.setVerticalSpacing(10)
        grid.addWidget(self._field("Sorumlu", assignee), 0, 0)
        grid.addWidget(self._field("Durum", status), 0, 1)
        grid.addWidget(self._field("Hedef tarih", due), 1, 0)
        grid.addWidget(self._field("Öncelik", priority), 1, 1)
        grid.setColumnStretch(0, 1)
        grid.setColumnStretch(1, 1)
        layout.addLayout(grid)
        layout.addWidget(self._field("Takip notu", note))

        record = {"card": card, "id": str(rec.get("id", "")), "estimate_hours": float(rec.get("estimate_hours", 0) or 0),
                  "title": title_edit, "assignee": assignee, "status": status, "due": due, "priority": priority, "note": note}
        own_task = str(rec.get("assignee", "")).casefold() == self.current_user
        if self.project and not self.can_assign:
            title_edit.setEnabled(False)
            assignee.setEnabled(False)
            priority.setEnabled(False)
            remove.setEnabled(False)
            if not own_task:
                status.setEnabled(False)
                due.setEnabled(False)
                note.setEnabled(False)
        remove.clicked.connect(lambda _checked=False, target=record: self._remove_task_card(target))
        self._task_cards.append(record)
        self.task_cards_layout.insertWidget(max(0, self.task_cards_layout.count() - (1 if self.task_empty.isVisible() else 0)), card)
        self.task_empty.hide()
        self._update_task_count()
        if not str(rec.get("title", "")).strip():
            QTimer.singleShot(0, title_edit.setFocus)
        return record

    def _remove_task_card(self, record: dict[str, Any]):
        if record not in self._task_cards or (self.project and not self.can_assign):
            return
        title = record["title"].text().strip() or "Adsız görev"
        answer = QMessageBox.question(self, "Görevi kaldır", f"'{title}' görevi kaydetmeden önce listeden kaldırılacak. Devam edilsin mi?",
                                      QMessageBox.Yes | QMessageBox.No, QMessageBox.No)
        if answer != QMessageBox.Yes:
            return
        self._task_cards.remove(record)
        record["card"].setParent(None)
        record["card"].deleteLater()
        self._update_task_count()

    def _update_task_count(self):
        if hasattr(self, "task_count"):
            self.task_count.setText(f"{len(self._task_cards)} görev")
        if hasattr(self, "task_empty"):
            self.task_empty.setVisible(len(self._task_cards) == 0)

    def _open_opinions_dialog(self):
        dlg = InstitutionOpinionsDialog(self, [dict(x) for x in self._opinion_records], self.profiles)
        if dlg.exec() == QDialog.Accepted:
            self._opinion_records = dlg.payload()
            self._render_opinion_previews()
            self._update_opinion_summary()

    def _render_opinion_previews(self):
        if not hasattr(self, "opinion_preview_layout"):
            return
        while self.opinion_preview_layout.count():
            item = self.opinion_preview_layout.takeAt(0)
            widget = item.widget()
            if widget:
                widget.setParent(None)
                widget.deleteLater()
        if not self._opinion_records:
            self.opinion_empty = QLabel("Kurum görüşü kaydı yok")
            self.opinion_empty.setObjectName("emptyState")
            self.opinion_empty.setAlignment(Qt.AlignCenter)
            self.opinion_preview_layout.addWidget(self.opinion_empty)
            self.opinion_preview_layout.addStretch(1)
            return
        for record in self._opinion_records:
            card = QFrame()
            card.setObjectName("opinionPreviewCard")
            body = QVBoxLayout(card)
            body.setContentsMargins(14, 10, 14, 10)
            body.setSpacing(5)
            head = QHBoxLayout()
            institution = QLabel(str(record.get("institution", "Kurum belirtilmedi")))
            institution.setObjectName("previewTitle")
            institution.setWordWrap(True)
            head.addWidget(institution, 1)
            status = QLabel(str(record.get("status", "Planlanmadı")))
            status.setObjectName("statusPill")
            head.addWidget(status, 0, Qt.AlignRight | Qt.AlignVCenter)
            body.addLayout(head)
            dates = QLabel(f"İstenme: {format_date_tr(record.get('requested_date')) or '—'}     Dönüş: {format_date_tr(record.get('received_date')) or '—'}")
            dates.setObjectName("muted")
            body.addWidget(dates)
            details = " · ".join(x for x in [str(record.get("expert_name", "")).strip(), str(record.get("expert_contact", "")).strip()] if x)
            if details:
                detail_label = QLabel(details)
                detail_label.setObjectName("muted")
                detail_label.setWordWrap(True)
                body.addWidget(detail_label)
            if str(record.get("note", "")).strip():
                note_label = QLabel(str(record.get("note", "")).strip())
                note_label.setObjectName("opinionPreviewNote")
                note_label.setWordWrap(True)
                body.addWidget(note_label)
            self.opinion_preview_layout.addWidget(card)
        self.opinion_preview_layout.addStretch(1)

    def _update_opinion_summary(self):
        count = len(self._opinion_records)
        waiting = sum(1 for x in self._opinion_records if x.get("status") == "Bekleniyor")
        received = sum(1 for x in self._opinion_records if x.get("status") == "Geldi")
        self.opinion_summary_label.setText(f"{count} kurum · {waiting} bekliyor · {received} geldi")

    def _validate_accept(self):
        if not self.name.text().strip():
            QMessageBox.warning(self, "Proje adı gerekli", "Proje adı boş bırakılamaz.")
            self.tabs.setCurrentIndex(0)
            self.name.setFocus()
            return
        date_fields = [("Proje hedef teslim tarihi", self.due.text().strip())]
        for task in self._task_cards:
            date_fields.append(("Görev hedef tarihi", task["due"].text().strip()))
        for record in self._opinion_records:
            for key, label in (("requested_date", "Kurum istenme tarihi"), ("received_date", "Kurum dönüş tarihi")):
                raw = str(record.get(key, "") or "").strip()
                date_fields.append((label, format_date_tr(raw) if raw else ""))
        for label, value in date_fields:
            if not value:
                continue
            try:
                parse_date_tr(value, label)
            except ValueError as exc:
                QMessageBox.warning(self, "Tarih biçimi", str(exc))
                self.tabs.setCurrentIndex(1 if "Görev" in label else (2 if "Kurum" in label else 0))
                return
        self.accept()

    def payload(self) -> dict[str, Any]:
        team = []
        for index in range(self.team_list.count()):
            item = self.team_list.item(index)
            if item.checkState() == Qt.Checked:
                team.append(str(item.data(Qt.UserRole)))
        tasks = []
        for record in self._task_cards:
            title = record["title"].text().strip()
            if not title:
                continue
            due_value = record["due"].text().strip()
            assignee = str(record["assignee"].currentData() or "")
            tasks.append({
                "id": record["id"], "title": title, "assignee": assignee,
                "status": record["status"].currentText(), "priority": record["priority"].currentText(),
                "estimate_hours": float(record["estimate_hours"]),
                "due_date": parse_date_tr(due_value, "Görev hedef tarihi") if due_value else "",
                "note": record["note"].toPlainText().strip(),
            })
        opinions = []
        for record in self._opinion_records:
            institution = str(record.get("institution", "")).strip()
            if not institution:
                continue
            req = str(record.get("requested_date", "") or "").strip()
            received = str(record.get("received_date", "") or "").strip()
            opinions.append({
                "institution": institution, "status": str(record.get("status", "Planlanmadı")),
                "requested_date": parse_date_tr(format_date_tr(req), "Kurum istenme tarihi") if req else "",
                "received_date": parse_date_tr(format_date_tr(received), "Kurum dönüş tarihi") if received else "",
                "expert_name": str(record.get("expert_name", "") or "").strip(),
                "expert_contact": str(record.get("expert_contact", "") or "").strip(),
                "note": str(record.get("note", "") or "").strip(),
            })
        team = sorted(set(team + [task["assignee"] for task in tasks if task.get("assignee")]), key=str.casefold)
        payload = {
            "code": self.code.text().strip(), "name": self.name.text().strip(), "client": self.client.text().strip(),
            "project_type": self.kind.currentText(), "province": self.province.text().strip(), "district": self.district.text().strip(),
            "due_date": parse_date_tr(self.due.text().strip(), "Proje hedef teslim tarihi") if self.due.text().strip() else "",
            "lead": str(self.lead.currentData() or ""), "status": self.status.currentText(), "stage": self.stage.currentText(),
            "risk_level": self.risk.currentText(), "next_action": self.next_action.text().strip(), "blocker": self.blocker.text().strip(),
            "team": team, "description": self.description.toPlainText().strip(), "institution_opinions": opinions, "tasks": tasks,
        }
        if self.project and not self.can_assign:
            for key in ("code", "name", "client", "project_type", "province", "district", "due_date", "lead", "team"):
                payload.pop(key, None)
        return payload




class ProfileEditorDialog(QDialog):
    def __init__(self, parent, profile: dict[str, Any], can_manage: bool, allow_username: bool):
        super().__init__(parent)
        self.profile = dict(profile)
        self.can_manage = can_manage
        self.setWindowTitle("Kişi profili")
        self.resize(520, 520)
        root = QVBoxLayout(self); form = QFormLayout()
        self.username = QLineEdit(str(profile.get("username", ""))); self.username.setReadOnly(not allow_username)
        self.display_name = QLineEdit(str(profile.get("display_name", "")))
        self.email = QLineEdit(str(profile.get("email", "")))
        self.job_title = QLineEdit(str(profile.get("job_title", "")))
        self.phone = QLineEdit(str(profile.get("phone", "")))
        self.expertise = QLineEdit(", ".join(profile.get("expertise", []))); self.expertise.setPlaceholderText("Flora, fauna, ÇED, saha çalışması…")
        self.role = NoWheelComboBox(); self.role.addItems(ROLES); self.role.setCurrentText(str(profile.get("role", "Diğer"))); self.role.setEnabled(can_manage)
        self.availability = NoWheelComboBox(); self.availability.addItems(["Uygun", "Sahada", "İzinli", "Yoğun"]); self.availability.setCurrentText(str(profile.get("availability", "Uygun")))
        self.avatar_file = Path(str(profile.get("avatar_file", ""))).name
        avatar_row = QHBoxLayout()
        self.avatar_preview = QLabel()
        self.avatar_preview.setFixedSize(60, 60)
        self.avatar_preview.setAlignment(Qt.AlignCenter)
        self.avatar_preview.setObjectName("profileAvatarPreview")
        avatar_row.addWidget(self.avatar_preview)
        avatar_buttons = QVBoxLayout()
        choose_avatar = QPushButton("Fotoğraf seç…"); choose_avatar.setObjectName("secondary"); choose_avatar.clicked.connect(self._choose_avatar)
        remove_avatar = QPushButton("Fotoğrafı kaldır"); remove_avatar.setObjectName("secondary"); remove_avatar.clicked.connect(self._remove_avatar)
        avatar_buttons.addWidget(choose_avatar); avatar_buttons.addWidget(remove_avatar); avatar_buttons.addStretch(1)
        avatar_row.addLayout(avatar_buttons); avatar_row.addStretch(1)
        for label, widget in [("Windows kullanıcı adı *", self.username), ("Ad soyad *", self.display_name), ("E-posta", self.email), ("Görev", self.job_title), ("Telefon", self.phone), ("Uzmanlıklar (virgülle ayır)", self.expertise), ("Rol", self.role), ("Durum", self.availability)]:
            form.addRow(label, widget)
        form.addRow("Profil fotoğrafı", avatar_row)
        root.addLayout(form)
        self._refresh_avatar_preview()
        hint = QLabel("Profildeki projeler otomatik olarak atamalardan hesaplanır. Rol değiştirme yalnızca yetkili kullanıcılar içindir.")
        hint.setWordWrap(True); hint.setObjectName("muted"); root.addWidget(hint)
        buttons = QDialogButtonBox(QDialogButtonBox.Save | QDialogButtonBox.Cancel); buttons.accepted.connect(self._check); buttons.rejected.connect(self.reject); root.addWidget(buttons)

    def _host_config(self):
        node = self.parent()
        while node is not None:
            cfg = getattr(node, "config", None)
            if isinstance(cfg, dict):
                return cfg
            try:
                node = node.parent()
            except Exception:
                break
        return {}

    def _avatar_directory(self):
        cfg = self._host_config()
        shared_root = str(cfg.get("shared_root", "")).strip()
        if not shared_root:
            raise ValueError("Önce Ayarlar bölümünde ortak izleme klasörünü kaydet.")
        return Path(shared_root) / "workspace" / "avatars"

    def _refresh_avatar_preview(self):
        pix = QPixmap()
        try:
            if self.avatar_file:
                pix = QPixmap(str(self._avatar_directory() / Path(self.avatar_file).name))
        except Exception:
            pix = QPixmap()
        if not pix.isNull():
            self.avatar_preview.setPixmap(circular_avatar_pixmap(pix, 58))
            self.avatar_preview.setText("")
        else:
            self.avatar_preview.setPixmap(QPixmap())
            self.avatar_preview.setText(avatar_initials(self.display_name.text() or self.username.text()))

    def _choose_avatar(self):
        source, _ = QFileDialog.getOpenFileName(self, "Profil fotoğrafı seç", "", "Görseller (*.png *.jpg *.jpeg *.bmp *.webp)")
        if not source:
            return
        identity = self.username.text().strip() or self.display_name.text().strip()
        if not identity:
            QMessageBox.information(self, "Önce isim gir", "Fotoğrafı yüklemeden önce kullanıcı adı veya ad soyad alanını doldur.")
            return
        try:
            source_path = Path(source)
            suffix = source_path.suffix.lower()
            if suffix not in {".png", ".jpg", ".jpeg", ".bmp", ".webp"}:
                raise ValueError("Desteklenmeyen fotoğraf biçimi.")
            folder = self._avatar_directory()
            folder.mkdir(parents=True, exist_ok=True)
            key = hashlib.sha256(identity.casefold().encode("utf-8")).hexdigest()[:20]
            target = folder / f"{key}{suffix}"
            shutil.copy2(source_path, target)
            test_pix = QPixmap(str(target))
            if test_pix.isNull():
                target.unlink(missing_ok=True)
                raise ValueError("Bu görsel açılamadı. PNG veya JPG biçiminde yeniden kaydetmeyi dene.")
            self.avatar_file = target.name
            self._refresh_avatar_preview()
        except Exception as exc:
            QMessageBox.warning(self, "Fotoğraf yüklenemedi", str(exc))

    def _remove_avatar(self):
        self.avatar_file = ""
        self._refresh_avatar_preview()

    def _check(self):
        if not self.username.text().strip() or not self.display_name.text().strip():
            QMessageBox.warning(self, "Eksik bilgi", "Kullanıcı adı ve ad soyad zorunlu."); return
        email = self.email.text().strip()
        if email and ("@" not in email or "." not in email.split("@")[-1]):
            QMessageBox.warning(self, "E-posta", "E-posta biçimini kontrol et."); return
        self.accept()

    def payload(self):
        return {"username": self.username.text().strip(), "display_name": self.display_name.text().strip(),
                "email": self.email.text().strip(), "job_title": self.job_title.text().strip(), "phone": self.phone.text().strip(),
                "expertise": [x.strip() for x in self.expertise.text().split(",") if x.strip()], "avatar_file": Path(self.avatar_file).name, "role": self.role.currentText(),
                "capacity_hours_week": int(self.profile.get("capacity_hours_week", 40)), "availability": self.availability.currentText()}


class NoteEditorDialog(QDialog):
    def __init__(self, parent, note: dict[str, Any] | None, projects: list[dict[str, Any]]):
        super().__init__(parent)
        self.note = dict(note or {})
        self.setWindowTitle("Not düzenle" if note else "Yeni not")
        self.setStyleSheet("")
        self.resize(620, 560)
        root = QVBoxLayout(self); form = QFormLayout()
        self.title = QLineEdit(str(self.note.get("title", "")))
        self.category = NoWheelComboBox(); self.category.addItems(["Genel", "Proje", "Saha", "Kurum görüşü", "Hatırlatma", "Toplantı"]); self.category.setCurrentText(str(self.note.get("category", "Genel")))
        self.project = NoWheelComboBox(); self.project.addItem("Projeye bağlama", "")
        for p in projects:
            self.project.addItem(f"{p.get('name')} · {p.get('code')}", p.get("id"))
        self.project.setCurrentIndex(max(0, self.project.findData(self.note.get("project_id", ""))))
        self.due = QLineEdit(format_date_tr(self.note.get("due_date", ""))); self.due.setPlaceholderText("GG.AA.YYYY (isteğe bağlı)"); wire_turkish_date_input(self.due)
        self.status = NoWheelComboBox(); self.status.addItems(["Açık", "Tamamlandı"]); self.status.setCurrentText(str(self.note.get("status", "Açık")))
        self.pinned = QCheckBox("Üste sabitle"); self.pinned.setChecked(bool(self.note.get("pinned", False)))
        form.addRow("Başlık *", self.title); form.addRow("Tür", self.category); form.addRow("İlgili proje", self.project); form.addRow("Hatırlatma tarihi", self.due); form.addRow("Durum", self.status)
        root.addLayout(form); root.addWidget(self.pinned); root.addWidget(QLabel("Not metni"))
        self.body = QTextEdit(); self.body.setPlainText(str(self.note.get("body", ""))); self.body.setPlaceholderText("Saha gözlemi, takip maddeleri, kurum dönüşleri…")
        root.addWidget(self.body, 1)
        hint = QLabel("Notlar yalnızca bu Windows kullanıcısının yerel profilinde saklanır; ortak ağdaki diğer kişiler tarafından görüntülenmez.")
        hint.setWordWrap(True); hint.setObjectName("muted"); root.addWidget(hint)
        buttons = QDialogButtonBox(QDialogButtonBox.Save | QDialogButtonBox.Cancel)
        save_button = buttons.button(QDialogButtonBox.Save); save_button.setText("Kaydet"); save_button.setObjectName("primary")
        cancel_button = buttons.button(QDialogButtonBox.Cancel); cancel_button.setText("Vazgeç"); cancel_button.setObjectName("secondary")
        buttons.accepted.connect(self._check); buttons.rejected.connect(self.reject); root.addWidget(buttons)

    def _check(self):
        if not self.title.text().strip():
            QMessageBox.warning(self, "Eksik bilgi", "Not başlığı zorunlu."); return
        due = self.due.text().strip()
        if due:
            try:
                parse_date_tr(due, "Hatırlatma tarihi")
            except ValueError as exc:
                QMessageBox.warning(self, "Tarih biçimi", str(exc)); return
        self.accept()

    def payload(self):
        return {"id": self.note.get("id", ""), "title": self.title.text().strip(), "body": self.body.toPlainText().strip(),
                "category": self.category.currentText(), "project_id": str(self.project.currentData() or ""),
                "due_date": parse_date_tr(self.due.text().strip(), "Hatırlatma tarihi") if self.due.text().strip() else "", "status": self.status.currentText(), "pinned": self.pinned.isChecked()}
