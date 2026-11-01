"""ENÇEV PULSE design tokens and single-source Qt stylesheet.

Themes follow the supplied Stitch specification: Soft Sage (light) and
Obsidian Velvet (dark). This module contains presentation only; no business
logic or stored data is handled here.
"""
from __future__ import annotations

THEME_TOKENS = {
    "light_sage": {
        "root": "#edf7f2",
        "surface": "#f7fbf8",
        "sidebar": "#e1eee7",
        "card": "#ffffff",
        "card_inner": "#f4faf7",
        "border": "#cce3d8",
        "border_subtle": "#d8eae0",
        "accent": "#10b981",
        "accent_hover": "#059669",
        "primary": "#12684f",
        "primary_hover": "#0f5742",
        "text": "#142821",
        "secondary": "#3d5a50",
        "muted": "#6a8b7f",
        "input": "#ffffff",
        "button": "#ffffff",
        "button_hover": "#f0f8f4",
        "selected": "#d1fae5",
        "selected_text": "#065f46",
        "table_alt": "#f7fbf8",
        "gridline": "#e2efe8",
        "disabled": "#edf3ef",
        "dialog": "#f7fbf8",
        "status_warning_bg": "#fff6df",
        "status_warning_text": "#8b5e14",
        "status_danger_bg": "#fff0f1",
        "status_danger_text": "#a52a45",
        "bubble_self": "#12684f",
        "bubble_peer": "#f4faf7",
        # Compatibility aliases retained for extension/tests that consume the old token names.
        "bg_surface": "#edf7f2", "bg_sidebar": "#e1eee7",
        "bg_card": "rgba(255, 255, 255, 0.90)", "bg_card_solid": "#ffffff",
        "accent_emerald": "#10b981", "accent_primary": "#12684f",
        "accent_primary_hover": "#0f5742", "text_primary": "#142821",
        "text_secondary": "#3d5a50", "text_muted": "#6a8b7f",
        "bubble_user": "#12684f", "bubble_user_text": "#ffffff",
        "bubble_peer_text": "#142821", "status_online": "#10b981",
        "status_warning": "#f59e0b", "status_danger": "#ef4444",
    },
    "dark_velvet": {
        "root": "#0a0d14",
        "surface": "#0f131c",
        "sidebar": "#121722",
        "card": "#161b26",
        "card_inner": "#111520",
        "border": "#222c3d",
        "border_subtle": "#192233",
        "accent": "#3b82f6",
        "accent_hover": "#2563eb",
        "primary": "#3b82f6",
        "primary_hover": "#2563eb",
        "text": "#f8fafc",
        "secondary": "#94a3b8",
        "muted": "#64748b",
        "input": "#121722",
        "button": "#1a2130",
        "button_hover": "#222c3f",
        "selected": "#1e3a5f",
        "selected_text": "#93c5fd",
        "table_alt": "#111722",
        "gridline": "#192233",
        "disabled": "#171e2a",
        "dialog": "#0f131c",
        "status_warning_bg": "#3a2d18",
        "status_warning_text": "#fbbf24",
        "status_danger_bg": "#351d27",
        "status_danger_text": "#fda4af",
        "bubble_self": "#1e3a5f",
        "bubble_peer": "#111520",
        # Compatibility aliases retained for extension/tests that consume the old token names.
        "bg_surface": "#0f131c", "bg_sidebar": "#121722",
        "bg_card": "rgba(24, 28, 36, 0.85)", "bg_card_solid": "#161b26",
        "accent_emerald": "#3b82f6", "accent_primary": "#3b82f6",
        "accent_primary_hover": "#2563eb", "text_primary": "#f8fafc",
        "text_secondary": "#94a3b8", "text_muted": "#64748b",
        "bubble_user": "#1e3a5f", "bubble_user_text": "#f8fafc",
        "bubble_peer_text": "#f8fafc", "status_online": "#10b981",
        "status_warning": "#f59e0b", "status_danger": "#f43f5e",
    },
}

THEME_LABELS = {
    "light_sage": "Yeşil Aydınlık · Soft Sage",
    "dark_velvet": "Kadife Antrasit · Obsidian Velvet",
}


def normalize_theme(theme_name: object) -> str:
    """Normalize legacy and current theme names to one of the supported modes."""
    name = str(theme_name or "").strip().casefold()
    aliases = {
        "light": "light_sage", "sage": "light_sage", "soft sage": "light_sage",
        "dark": "dark_velvet", "velvet": "dark_velvet", "obsidian velvet": "dark_velvet",
    }
    name = aliases.get(name, name)
    return name if name in THEME_TOKENS else "light_sage"


def build_theme_stylesheet(theme_name: object = "light_sage") -> str:
    """Build one complete stylesheet for PULSE main pages, dialogs and workspace UI."""
    name = normalize_theme(theme_name)
    t = THEME_TOKENS[name]
    dark = name == "dark_velvet"
    text = t["text"]
    secondary = t["secondary"]
    muted = t["muted"]
    border = t["border"]
    subtle = t["border_subtle"]
    border_subtle = subtle
    accent = t["accent"]
    accent_hover = t["accent_hover"]
    primary = t["primary"]
    primary_hover = t["primary_hover"]
    card = t["card"]
    inner = t["card_inner"]
    button = t["button"]
    hover = t["button_hover"]
    root = t["root"]
    surface = t["surface"]
    sidebar = t["sidebar"]
    input_bg = t["input"]
    selected = t["selected"]
    selected_text = t["selected_text"]
    table_alt = t["table_alt"]
    gridline = t["gridline"]
    disabled = t["disabled"]
    dialog = t["dialog"]
    self_bubble = t["bubble_self"]
    peer_bubble = t["bubble_peer"]
    tip = "#111827" if dark else "#142821"
    success_bg = "#12392d" if dark else "#e4f8ee"
    success_text = "#6ee7b7" if dark else "#087a52"
    info_bg = "#172e4d" if dark else "#e8f2ff"
    info_text = "#93c5fd" if dark else "#235a98"

    return f"""
/* ENÇEV PULSE / Stitch design system: {name}. Single source of truth. */
QWidget {{ font-family: 'Plus Jakarta Sans', 'Segoe UI', sans-serif; font-size: 13px; color: {text}; }}
QMainWindow, QWidget#root {{ background: {root}; color: {text}; }}
QWidget#applicationArea, QWidget#contentArea, QWidget#pageSurface,
QWidget#dashboardContent, QWidget#dashboardScroll, QWidget#settingsContent,
QWidget#dialogContent, QWidget#petitionDashboardContent, QWidget#sidebarNavContent {{ background: transparent; color: {text}; }}
QStackedWidget#pageStack {{ background: transparent; border: 0; }}

/* App shell */
QFrame#sidebar {{ background: {sidebar}; border: 0; border-right: 1px solid {border}; }}
QFrame#sidebarBrandBox, QFrame#accountStrip {{ background: transparent; border: 0; }}
QLabel#brand {{ color: {text}; font-size: 19px; font-weight: 900; letter-spacing: .3px; }}
QLabel#brandSub {{ color: {accent}; font-size: 9px; font-weight: 850; letter-spacing: 1.05px; }}
QLabel#brandFallback {{ background: {accent}; color: #ffffff; border-radius: 11px; font-size: 23px; font-weight: 900; min-width: 43px; min-height: 43px; }}
QLabel#navLabel {{ color: {muted}; font-size: 10px; font-weight: 850; padding: 10px 10px 3px; letter-spacing: .9px; }}
QPushButton#nav {{ background: transparent; color: {secondary}; border: 1px solid transparent; border-radius: 11px; text-align: left; padding: 9px 12px; min-height: 22px; font-size: 12px; font-weight: 700; }}
QPushButton#nav:hover {{ background: {inner}; color: {text}; border-color: {subtle}; }}
QPushButton#nav[active="true"] {{ background: {card}; color: {primary}; border: 1px solid {border}; border-left: 4px solid {accent}; padding-left: 9px; font-weight: 850; }}
QPushButton#nav:pressed {{ background: {selected}; }}
QLabel#accountStatusDot {{ color: {accent}; background: transparent; font-size: 12px; }}
QLabel#accountCaption {{ color: {muted}; background: transparent; font-size: 9px; font-weight: 900; letter-spacing: .7px; }}
QLabel#accountValue {{ color: {text}; background: transparent; font-size: 11px; font-weight: 750; }}
QFrame#topBar {{ background: {card}; border: 0; border-bottom: 1px solid {border}; }}
QLabel#topBarBrand {{ color: {text}; font-size: 15px; font-weight: 850; }}
QLabel#topBarMeta {{ color: {secondary}; font-size: 11px; font-weight: 650; }}
QLineEdit#globalSearch {{ background: {input_bg}; color: {text}; border: 1px solid {border}; border-radius: 12px; padding: 8px 14px; min-height: 21px; }}
QLineEdit#globalSearch:focus {{ border: 1.5px solid {accent}; }}
QLineEdit#globalSearch::placeholder {{ color: {muted}; }}
QPushButton#toolbarIcon {{ background: {button}; color: {secondary}; border: 1px solid {border}; border-radius: 10px; padding: 5px 9px; min-height: 30px; }}
QPushButton#toolbarIcon:hover {{ background: {hover}; color: {primary}; border-color: {accent}; }}
QPushButton#userChip {{ background: {primary}; color: #ffffff; border: 0; border-radius: 17px; min-width: 34px; min-height: 34px; max-width: 34px; max-height: 34px; font-weight: 900; }}
QPushButton#themeToggle {{ background: {button}; color: {secondary}; border: 1px solid {border}; border-radius: 10px; padding: 7px 11px; min-height: 30px; font-size: 11px; font-weight: 750; }}
QPushButton#themeToggle:hover {{ background: {hover}; border-color: {accent}; }}

/* Page headings, cards and banners */
QLabel#pageTitle {{ color: {text}; font-size: 22px; font-weight: 900; }}
QLabel#pageHint, QLabel#muted, QLabel#sectionHint, QLabel#cardHint {{ color: {secondary}; }}
QLabel#sectionTitle, QLabel#dialogTitle, QLabel#previewTitle, QLabel#opinionCardTitle {{ color: {text}; font-weight: 850; }}
QLabel#fieldCaption {{ color: {secondary}; font-size: 11px; font-weight: 750; background: transparent; }}
QLabel#cardEyebrow {{ color: {muted}; font-size: 10px; font-weight: 850; background: transparent; }}
QLabel#dashboardGreeting {{ color: {text}; font-size: 23px; font-weight: 900; }}
QLabel#dashboardSubGreeting {{ color: {secondary}; font-size: 12px; }}
QLabel#emptyState {{ color: {secondary}; background: {inner}; border: 1px dashed {border}; border-radius: 12px; padding: 24px; }}
QFrame#card, QFrame.cardSurface, QFrame#dialogPanel, QFrame#opinionEditCard,
QFrame#taskEditorCard, QFrame#opinionPreviewCard, QFrame#projectInfoPanel,
QFrame#institutionContactDetail, QFrame#dashboardPetitionCard, QFrame#attachmentPreviewCard {{ background: {card}; color: {text}; border: 1px solid {border}; border-radius: 16px; }}
QFrame#card:hover {{ border-color: {accent}; }}
QFrame#heroBanner {{ background: {primary}; border: 1px solid {border}; border-radius: 16px; }}
QLabel#heroTitle {{ color: #ffffff; font-size: 20px; font-weight: 900; }}
QLabel#heroSub {{ color: {"#dbeafe" if dark else "#d9f5e8"}; font-size: 12px; }}
QLabel#statusPill, QLabel#opinionStatusPill {{ background: {success_bg}; color: {success_text}; border: 1px solid {border}; border-radius: 8px; padding: 4px 8px; font-size: 11px; font-weight: 800; }}
QLabel#statusPill[statusCode="waiting"], QLabel#networkPill[statusCode="waiting"] {{ background: {t['status_warning_bg']}; color: {t['status_warning_text']}; border-color: {border}; }}
QLabel#statusPill[statusCode="danger"], QLabel#networkPill[statusCode="danger"] {{ background: {t['status_danger_bg']}; color: {t['status_danger_text']}; border-color: {border}; }}
QLabel#networkPill[statusCode="success"] {{ background: {success_bg}; color: {success_text}; border: 1px solid {border}; border-radius: 10px; padding: 6px 10px; font-weight: 850; }}
QLabel#networkPill[statusCode="waiting"] {{ border-radius: 10px; padding: 6px 10px; font-weight: 850; }}
QLabel#networkPill[statusCode="danger"] {{ border-radius: 10px; padding: 6px 10px; font-weight: 850; }}
QLabel#petitionHeroStatus[statusCode="success"], QLabel#heroPetitionStatus[statusCode="success"] {{ background: {success_bg}; color: {success_text}; border: 1px solid {border}; border-radius: 9px; padding: 8px 11px; font-size: 13px; font-weight: 900; }}
QLabel#petitionHeroStatus[statusCode="waiting"], QLabel#heroPetitionStatus[statusCode="waiting"] {{ background: {t['status_warning_bg']}; color: {t['status_warning_text']}; border: 1px solid {border}; border-radius: 9px; padding: 8px 11px; font-size: 13px; font-weight: 900; }}
QLabel#petitionHeroStatus[statusCode="danger"], QLabel#heroPetitionStatus[statusCode="danger"] {{ background: {t['status_danger_bg']}; color: {t['status_danger_text']}; border: 1px solid {border}; border-radius: 9px; padding: 8px 11px; font-size: 13px; font-weight: 900; }}
QLabel#petitionHeroStatus[statusCode="neutral"], QLabel#heroPetitionStatus[statusCode="neutral"] {{ background: {inner}; color: {secondary}; border: 1px solid {border}; border-radius: 9px; padding: 8px 11px; font-size: 13px; font-weight: 850; }}

/* Metric cards: calm surfaces, theme-derived accents, no fixed-color gradients. */
QFrame#metricCard {{ background: {card}; border: 1px solid {border}; border-top: 3px solid {accent}; border-radius: 15px; }}
QFrame#metricCard[tone="blue"] {{ border-top-color: {info_text}; }}
QFrame#metricCard[tone="amber"] {{ border-top-color: {t['status_warning_text']}; }}
QFrame#metricCard[tone="rose"] {{ border-top-color: {t['status_danger_text']}; }}
QLabel#metricIcon {{ background: {inner}; color: {accent}; border: 1px solid {border_subtle}; border-radius: 12px; font-size: 21px; font-weight: 850; }}
QLabel#metricLabel {{ color: {secondary}; font-size: 10px; font-weight: 850; }}
QLabel#metricValue {{ color: {text}; font-size: 25px; font-weight: 900; }}
QLabel#metricValue[valueLength="medium"] {{ font-size: 20px; }}
QLabel#metricValue[valueLength="long"] {{ font-size: 15px; }}
QLabel#metricNote {{ color: {muted}; font-size: 11px; }}
QLabel#dashboardPetitionTitle {{ color: {text}; font-size: 12px; font-weight: 900; }}
QLabel#dashboardPetitionOwner {{ color: {secondary}; font-size: 11px; }}
QLabel#dashboardPetitionIcon {{ background: {inner}; color: {accent}; border: 1px solid {border}; border-radius: 10px; font-size: 20px; font-weight: 900; }}
QLabel#dashboardPetitionStatus {{ background: {success_bg}; color: {success_text}; border: 1px solid {border}; border-radius: 8px; padding: 4px 7px; font-size: 10px; font-weight: 850; }}
QWidget#dashboardRightColumn {{ background: transparent; border: 0; }}
QSplitter#dashboardMiddleSplitter {{ background: transparent; border: 0; }}
QWidget#chatMessageRow {{ background: transparent; border: 0; }}

/* Buttons: a single size scale and clear primary/secondary hierarchy. */
QPushButton {{ background: {button}; color: {text}; border: 1px solid {border}; border-radius: 10px; padding: 7px 12px; min-height: 30px; font-size: 12px; font-weight: 700; }}
QPushButton:hover {{ background: {hover}; border-color: {accent}; }}
QPushButton:pressed {{ background: {selected}; }}
QPushButton:focus {{ border: 1.5px solid {accent}; }}
QPushButton:disabled {{ background: {disabled}; color: {muted}; border-color: {border_subtle}; }}
QPushButton#primary, QPushButton#btnPrimary, QDialogButtonBox QPushButton#primary {{ background: {primary}; color: #ffffff; border: 1px solid {primary}; border-radius: 10px; padding: 8px 15px; min-height: 31px; font-weight: 850; }}
QPushButton#primary:hover, QPushButton#btnPrimary:hover {{ background: {primary_hover}; border-color: {primary_hover}; color: #ffffff; }}
QPushButton#primary:pressed, QPushButton#btnPrimary:pressed {{ background: {accent_hover}; }}
QPushButton#secondary, QPushButton#btnSecondary, QDialogButtonBox QPushButton#secondary {{ background: {button}; color: {text}; border: 1px solid {border}; border-radius: 10px; padding: 7px 12px; min-height: 30px; }}
QPushButton#secondary:hover, QPushButton#btnSecondary:hover {{ background: {hover}; border-color: {accent}; }}
QPushButton#danger {{ background: {t['status_danger_bg']}; color: {t['status_danger_text']}; border: 1px solid {border}; border-radius: 10px; padding: 7px 11px; min-height: 29px; }}
QPushButton#quickAction {{ background: {button}; color: {text}; border: 1px solid {border}; border-radius: 12px; text-align: left; padding: 10px 12px; min-height: 38px; font-weight: 750; }}
QPushButton#quickAction:hover {{ background: {inner}; border-color: {accent}; }}
QPushButton#heroAction {{ background: {card}; color: {primary}; border: 1px solid {border}; border-radius: 10px; padding: 8px 13px; min-height: 30px; font-weight: 800; }}

/* Fields, selection controls, tables and dialogs. */
QLineEdit, QTextEdit, QPlainTextEdit, QComboBox, QSpinBox, QDoubleSpinBox, QDateEdit, QDateTimeEdit {{ background: {input_bg}; color: {text}; border: 1px solid {border}; border-radius: 10px; padding: 8px 10px; selection-background-color: {primary}; selection-color: #ffffff; }}
QLineEdit, QComboBox, QSpinBox, QDoubleSpinBox, QDateEdit, QDateTimeEdit {{ min-height: 22px; }}
QLineEdit:hover, QTextEdit:hover, QPlainTextEdit:hover, QComboBox:hover, QSpinBox:hover, QDoubleSpinBox:hover, QDateEdit:hover, QDateTimeEdit:hover {{ border-color: {accent}; }}
QLineEdit:focus, QTextEdit:focus, QPlainTextEdit:focus, QComboBox:focus, QSpinBox:focus, QDoubleSpinBox:focus, QDateEdit:focus, QDateTimeEdit:focus {{ border: 1.5px solid {accent}; }}
QLineEdit:disabled, QTextEdit:disabled, QPlainTextEdit:disabled, QComboBox:disabled, QSpinBox:disabled, QDoubleSpinBox:disabled, QDateEdit:disabled, QDateTimeEdit:disabled {{ background: {disabled}; color: {muted}; border-color: {border_subtle}; }}
QLineEdit::placeholder, QTextEdit::placeholder, QPlainTextEdit::placeholder {{ color: {muted}; }}
QComboBox {{ padding-right: 27px; }}
QComboBox::drop-down {{ subcontrol-origin: padding; subcontrol-position: top right; width: 25px; border: 0; border-left: 1px solid {border}; background: {inner}; }}
QComboBox QAbstractItemView, QAbstractItemView {{ background: {input_bg}; color: {text}; border: 1px solid {border}; selection-background-color: {selected}; selection-color: {selected_text}; outline: 0; padding: 4px; }}
QAbstractItemView::item {{ color: {text}; padding: 7px 9px; min-height: 25px; }}
QAbstractItemView::item:hover {{ background: {hover}; }}
QAbstractItemView::item:selected {{ background: {selected}; color: {selected_text}; }}
QCheckBox {{ color: {text}; spacing: 7px; }}
QCheckBox::indicator {{ width: 16px; height: 16px; border-radius: 4px; border: 1px solid {muted}; background: {input_bg}; }}
QCheckBox::indicator:hover {{ border-color: {accent}; }}
QCheckBox::indicator:checked {{ background: {accent}; border: 1px solid {accent}; }}
QTableWidget, QTableView {{ background: {card}; color: {text}; border: 1px solid {border}; border-radius: 12px; gridline-color: {gridline}; selection-background-color: {selected}; selection-color: {selected_text}; alternate-background-color: {table_alt}; outline: 0; }}
QTableWidget::item, QTableView::item {{ padding: 7px 8px; color: {text}; border: 0; border-bottom: 1px solid {gridline}; }}
QTableWidget::item:selected, QTableView::item:selected {{ background: {selected}; color: {selected_text}; }}
QHeaderView::section {{ background: {sidebar}; color: {secondary}; border: 0; border-bottom: 1px solid {border}; padding: 9px 10px; min-height: 24px; font-size: 10px; font-weight: 850; }}
QTableCornerButton::section {{ background: {sidebar}; border: 0; }}
QTabWidget::pane {{ background: transparent; border: 0; top: -1px; }}
QTabBar::tab {{ background: {sidebar}; color: {secondary}; border: 1px solid {border}; border-bottom: 0; border-top-left-radius: 9px; border-top-right-radius: 9px; padding: 8px 13px; margin-right: 3px; min-height: 20px; font-weight: 700; }}
QTabBar::tab:hover {{ color: {text}; background: {hover}; }}
QTabBar::tab:selected {{ background: {card}; color: {primary}; border-color: {border}; font-weight: 850; }}
QListWidget {{ background: {card}; color: {text}; border: 1px solid {border}; border-radius: 10px; padding: 4px; outline: 0; }}
QListWidget::item {{ color: {text}; padding: 8px; border-radius: 7px; }}
QListWidget::item:hover {{ background: {hover}; }}
QListWidget::item:selected {{ background: {selected}; color: {selected_text}; }}
QDialog, QMessageBox, QInputDialog {{ background: {dialog}; color: {text}; }}
QDialog QLabel, QMessageBox QLabel, QInputDialog QLabel {{ color: {text}; }}
QDialogButtonBox QPushButton {{ min-width: 84px; }}
QGroupBox {{ background: {card}; border: 1px solid {border}; border-radius: 12px; margin-top: 12px; padding: 14px 11px 11px; color: {text}; font-weight: 750; }}
QGroupBox::title {{ subcontrol-origin: margin; left: 12px; padding: 0 5px; color: {secondary}; }}
QMenu {{ background: {card}; color: {text}; border: 1px solid {border}; border-radius: 9px; padding: 5px; }}
QMenu::item {{ color: {text}; padding: 8px 18px 8px 11px; border-radius: 6px; min-height: 20px; }}
QMenu::item:selected {{ background: {hover}; color: {primary}; }}
QMenu::separator {{ height: 1px; background: {border}; margin: 4px 7px; }}
QScrollArea, QAbstractScrollArea {{ background: transparent; border: 0; }}
QAbstractScrollArea QWidget#qt_scrollarea_viewport {{ background: transparent; border: 0; }}
QScrollBar:vertical {{ background: transparent; width: 9px; margin: 2px; }}
QScrollBar::handle:vertical {{ background: {muted}; border-radius: 4px; min-height: 30px; }}
QScrollBar::handle:vertical:hover {{ background: {accent}; }}
QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {{ height: 0; }}
QScrollBar:horizontal {{ background: transparent; height: 9px; margin: 2px; }}
QScrollBar::handle:horizontal {{ background: {muted}; border-radius: 4px; min-width: 30px; }}
QScrollBar::add-line:horizontal, QScrollBar::sub-line:horizontal {{ width: 0; }}
QSplitter::handle {{ background: {border}; border-radius: 2px; }}
QSplitter::handle:hover {{ background: {accent}; }}
QProgressBar {{ background: {border}; border: 0; border-radius: 4px; min-height: 7px; max-height: 7px; text-align: center; color: transparent; }}
QProgressBar::chunk {{ background: {accent}; border-radius: 4px; }}
QFrame#pipelineStep[stepState="completed"] {{ background: {success_bg}; border: 1px solid {border}; border-radius: 10px; }}
QFrame#pipelineStep[stepState="active"] {{ background: {inner}; border: 1px solid {accent}; border-radius: 10px; }}
QFrame#pipelineStep[stepState="pending"] {{ background: {card}; border: 1px solid {border_subtle}; border-radius: 10px; }}
QLabel#pipelineMarker[stepState="completed"] {{ background: {accent}; color: #ffffff; border-radius: 9px; font-weight: 900; }}
QLabel#pipelineMarker[stepState="active"] {{ background: {primary}; color: #ffffff; border-radius: 9px; font-weight: 900; }}
QLabel#pipelineMarker[stepState="pending"] {{ background: {inner}; color: {muted}; border: 1px solid {border}; border-radius: 9px; font-weight: 800; }}
QLabel#pipelineLabel[stepState="completed"], QLabel#pipelineLabel[stepState="active"] {{ color: {text}; font-size: 11px; font-weight: 800; background: transparent; }}
QLabel#pipelineLabel[stepState="pending"] {{ color: {muted}; font-size: 11px; background: transparent; }}
QFrame#accountStatusIndicator[statusCode="busy"] {{ background: {accent}; border: 1px solid {accent}; border-radius: 6px; }}
QFrame#accountStatusIndicator[statusCode="idle"] {{ background: {t['status_danger_text']}; border: 1px solid {t['status_danger_text']}; border-radius: 6px; }}
QFrame#accountStatusIndicator[statusCode="unknown"] {{ background: {t['status_warning_text']}; border: 1px solid {t['status_warning_text']}; border-radius: 6px; }}
QLabel#chatBubbleSelf {{ background: {self_bubble}; color: #ffffff; border: 1px solid {self_bubble}; border-radius: 14px; padding: 9px 12px; }}
QLabel#chatBubbleOther {{ background: {peer_bubble}; color: {text}; border: 1px solid {border}; border-radius: 14px; padding: 9px 12px; }}
/* Stitch-specific surfaces for PULSE's existing petition, chat, profile and live-status widgets. */
QFrame#petitionHero {{ background: {primary}; color: #ffffff; border: 1px solid {border}; border-radius: 16px; }}
QLabel#petitionHeroEyebrow, QLabel#petitionStatusCaption {{ color: {"#bfdbfe" if dark else "#d1fae5"}; font-size: 10px; font-weight: 900; letter-spacing: .8px; background: transparent; }}
QLabel#petitionHeroTitle {{ color: #ffffff; font-size: 22px; font-weight: 900; }}
QLabel#petitionHeroSubtitle {{ color: {"#dbeafe" if dark else "#e8fff5"}; font-size: 12px; }}
QFrame#petitionStatusPanel {{ background: {"#111827" if dark else "#0f5b46"}; border: 1px solid {"#334155" if dark else "#24745e"}; border-radius: 12px; }}
QLabel#petitionPathLabel {{ color: {"#dbeafe" if dark else "#dcfce7"}; font-size: 11px; }}
QFrame#petitionMetricCard {{ background: {card}; color: {text}; border: 1px solid {border}; border-left: 4px solid {accent}; border-radius: 13px; }}
QFrame#petitionMetricCard[tone="blue"] {{ border-left-color: {info_text}; }}
QFrame#petitionMetricCard[tone="amber"] {{ border-left-color: {t['status_warning_text']}; }}
QFrame#petitionMetricCard[tone="violet"] {{ border-left-color: {primary}; }}
QFrame#petitionMetricCard[tone="rose"] {{ border-left-color: {t['status_danger_text']}; }}
QLabel#petitionMetricLabel, QLabel#petitionDetailCaption {{ color: {muted}; font-size: 10px; font-weight: 850; letter-spacing: .4px; background: transparent; }}
QLabel#petitionMetricValue {{ color: {text}; font-size: 15px; font-weight: 900; background: transparent; }}
QLabel#petitionMetricHint, QLabel#petitionActivityLabel {{ color: {secondary}; font-size: 11px; background: transparent; }}
QLabel#petitionDetailText, QLabel#petitionLockText {{ background: {inner}; color: {text}; border: 1px solid {border}; border-radius: 10px; padding: 10px; font-size: 12px; }}
QLabel#petitionDetailValue {{ color: {text}; font-size: 11px; font-weight: 750; }}
QLabel#petitionQueueLabel[statusCode="waiting"] {{ background: {t['status_warning_bg']}; color: {t['status_warning_text']}; border-radius: 10px; padding: 10px; font-size: 12px; font-weight: 750; }}
QLabel#petitionUsersLabel[statusCode="success"] {{ background: {success_bg}; color: {success_text}; border-radius: 10px; padding: 10px; font-size: 12px; font-weight: 700; }}
QLabel#petitionHeroStatus[statusCode="info"], QLabel#heroPetitionStatus[statusCode="info"] {{ background: {info_bg}; color: {info_text}; border: 1px solid {border}; border-radius: 9px; padding: 7px 10px; font-size: 11px; font-weight: 850; }}
QLabel#heroPetitionStatus[statusCode="success"] {{ background: {success_bg}; color: {success_text}; border: 1px solid {border}; border-radius: 8px; padding: 4px 7px; font-size: 11px; font-weight: 850; }}
QLabel#heroPetitionStatus[statusCode="waiting"] {{ background: {t['status_warning_bg']}; color: {t['status_warning_text']}; border: 1px solid {border}; border-radius: 8px; padding: 4px 7px; font-size: 11px; font-weight: 850; }}
QLabel#heroPetitionStatus[statusCode="danger"] {{ background: {t['status_danger_bg']}; color: {t['status_danger_text']}; border: 1px solid {border}; border-radius: 8px; padding: 4px 7px; font-size: 11px; font-weight: 850; }}
QLabel#opinionStatusPill[statusCode="waiting"] {{ background: {t['status_warning_bg']}; color: {t['status_warning_text']}; border-color: {border}; }}
QLabel#opinionStatusPill[statusCode="info"] {{ background: {info_bg}; color: {info_text}; border-color: {border}; }}
QLabel#opinionStatusPill[statusCode="danger"] {{ background: {t['status_danger_bg']}; color: {t['status_danger_text']}; border-color: {border}; }}
QLabel#opinionStatusPill[statusCode="neutral"] {{ background: {inner}; color: {secondary}; border-color: {border}; }}
QLabel#chatCountPill {{ background: {inner}; color: {primary}; border: 1px solid {border}; border-radius: 10px; padding: 6px 8px; font-size: 11px; font-weight: 850; }}
QLabel#chatHeaderAvatar, QLabel#avatarLabel, QLabel#chatAllAvatar, QLabel#profileAvatarPreview {{ background: {inner}; color: {primary}; border: 1px solid {border}; border-radius: 50px; font-size: 15px; font-weight: 850; }}
QLabel#avatarLabel[avatarSize="large"] {{ font-size: 20px; }}
QLabel#contactPresenceName[online="true"] {{ color: {success_text}; font-weight: 850; }}
QLabel#contactPresenceName[online="false"] {{ color: {text}; font-weight: 750; }}
QFrame#chatBubbleOutgoing {{ background: {self_bubble}; border: 1px solid {self_bubble}; border-radius: 14px; }}
QFrame#chatBubbleIncoming {{ background: {peer_bubble}; border: 1px solid {border}; border-radius: 14px; }}
QFrame#chatBubbleOutgoing QLabel#chatMeta {{ color: {"#dbeafe" if dark else "#d1fae5"}; background: transparent; }}
QFrame#chatBubbleIncoming QLabel#chatMeta {{ color: {muted}; background: transparent; }}
QFrame#chatBubbleOutgoing QLabel#chatMessageText {{ color: #ffffff; background: transparent; }}
QFrame#chatBubbleIncoming QLabel#chatMessageText {{ color: {text}; background: transparent; }}
QLabel#chatContactsTitle {{ color: {text}; font-size: 18px; font-weight: 900; }}
QLabel#chatAttachmentSummary, QLabel#attachmentFileSize {{ color: {muted}; font-size: 11px; background: transparent; }}
QLabel#attachmentFileName {{ color: {text}; font-size: 11px; font-weight: 750; background: transparent; }}
QLabel#attachmentDocumentPreview {{ background: {inner}; color: {text}; padding: 8px; border: 1px solid {border}; border-radius: 10px; font-size: 11px; }}
QLabel#attachmentImageLabel {{ background: {inner}; color: {primary}; border-radius: 8px; font-size: 11px; font-weight: 800; }}
QLabel#attachmentImagePreview {{ background: {card}; border-radius: 6px; }}
QLabel#institutionContactDetailTitle, QLabel#profileTitle, QLabel#noteDetailTitle, QLabel#profileManagerTitle {{ color: {text}; font-size: 17px; font-weight: 850; }}
QLabel#institutionContactCaption {{ color: {muted}; font-size: 10px; font-weight: 850; }}
QLabel#institutionContactValue {{ color: {text}; font-size: 12px; font-weight: 700; }}
QLabel#reservationStatus[statusCode="success"] {{ color: {success_text}; font-weight: 800; }}
QLabel#reservationStatus[statusCode="waiting"] {{ color: {t['status_warning_text']}; font-weight: 800; }}
QLabel#reservationStatus[statusCode="danger"] {{ color: {t['status_danger_text']}; font-weight: 800; }}
QLabel#reservationStatus[statusCode="neutral"] {{ color: {secondary}; font-weight: 700; }}
QPushButton#queueAction {{ background: {inner}; color: {primary}; border: 1px solid {border}; border-radius: 10px; padding: 9px 13px; font-weight: 850; }}
QPushButton#queueAction:hover {{ background: {hover}; border-color: {accent}; }}

QToolTip {{ background: {tip}; color: #ffffff; border: 1px solid {border}; padding: 6px 8px; border-radius: 6px; }}
"""
