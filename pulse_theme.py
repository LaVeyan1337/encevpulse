"""Central, dialog-wide PULSE Workspace theme based on the supplied Stitch and modern Bitrix24 UI."""
from __future__ import annotations

PALETTES = {
    "dark": {
        "bg":"#121316", "sidebar":"#1b1b1f", "surface":"#1f1f23", "high":"#292a2d", "highest":"#343538", "lowest":"#0d0e11",
        "text":"#e3e2e6", "muted":"#c2c6d6", "dim":"#8c909f", "border":"#424754", "soft":"#292a2d",
        "primary":"#adc6ff", "accent":"#4d8eff", "accent_text":"#ffffff", "green":"#4edea3", "green_bg":"#133b30",
        "red":"#ffb4ab", "red_bg":"#4b171c", "pink":"#ffb2b7", "warning":"#f4c969", "selection":"#4d8eff", "selection_text":"#ffffff",
    },
    "light": {
        "bg":"#f4f6fa", "sidebar":"#ffffff", "surface":"#ffffff", "high":"#f1f4f8", "highest":"#e3e8f0", "lowest":"#f8faff",
        "text":"#172033", "muted":"#46546b", "dim":"#6d788d", "border":"#d6deea", "soft":"#e7ebf2",
        "primary":"#245fd6", "accent":"#3167d5", "accent_text":"#ffffff", "green":"#178663", "green_bg":"#e2f6ed",
        "red":"#b42332", "red_bg":"#fee4e2", "pink":"#a5214a", "warning":"#936515", "selection":"#d8e5ff", "selection_text":"#183a7a",
    },
}

def normalize_theme(mode: str | None) -> str:
    value = str(mode or "dark").strip().casefold()
    return "light" if value in {"light", "light_sage", "sage", "bright"} else "dark"


def theme_color(mode: str | None, role: str) -> str:
    """Return a semantic token for runtime-painted items (table cells/calendar dates)."""
    palette = PALETTES[normalize_theme(mode)]
    return palette.get(str(role), palette["text"])


def build_stylesheet(mode: str = "dark") -> str:
    t = PALETTES[normalize_theme(mode)]
    return f"""
* {{ font-family:'Inter','Segoe UI',sans-serif; font-size:13px; }}
QMainWindow,QDialog {{ background:{t['bg']}; color:{t['text']}; }}
QWidget {{ color:{t['text']}; }}
QWidget#root,QWidget#applicationArea,QWidget#contentArea,QWidget#pageSurface,QWidget#dashboardContent,QWidget#dialogContent,QWidget#petitionDashboardContent,QWidget#settingsContent,QStackedWidget#pageStack,QStackedWidget#pulseWindowStack {{ background:{t['bg']}; color:{t['text']}; border:0; }}
QFrame#sidebar {{ background:{t['sidebar']}; border:0; border-right:1px solid {t['soft']}; }}
QFrame#sidebarBrandBox,QFrame#accountStrip {{ background:transparent; border:0; }}
QLabel#brand {{ color:{t['text']}; font-family:'Plus Jakarta Sans','Segoe UI',sans-serif; font-size:22px; font-weight:700; letter-spacing:.4px; }}
QLabel#brandSub {{ color:{t['dim']}; font-size:10px; font-weight:700; letter-spacing:1.35px; }}
QLabel#navLabel {{ color:{t['dim']}; font-size:10px; font-weight:700; padding:10px 12px 5px; letter-spacing:1px; }}
QPushButton#nav {{ background:transparent; border:1px solid transparent; border-radius:18px; color:{t['muted']}; text-align:left; padding:10px 13px; min-height:18px; font-size:12px; font-weight:500; }}
QPushButton#nav:hover {{ background:{t['high']}; color:{t['text']}; border-color:{t['soft']}; }}
QPushButton#nav[active="true"] {{ background:{t['accent']}; color:{t['accent_text']}; border-color:transparent; font-weight:700; }}
QFrame#topBar {{ background:{t['bg']}; border:0; border-bottom:1px solid {t['soft']}; }}
QLabel#topBarBrand {{ color:{t['text']}; font-family:'Plus Jakarta Sans','Segoe UI',sans-serif; font-size:17px; font-weight:700; }}
QLabel#topBarMeta,QLabel#muted,QLabel#pageHint,QLabel#sectionHint {{ color:{t['dim']}; font-size:12px; background:transparent; }}
QLineEdit#globalSearch {{ background:{t['lowest']}; border:1px solid {t['soft']}; color:{t['text']}; border-radius:19px; padding:9px 14px; min-height:18px; selection-background-color:{t['selection']}; selection-color:{t['selection_text']}; }}
QLineEdit#globalSearch:focus {{ border:1px solid {t['accent']}; }}
QLineEdit#globalSearch::placeholder {{ color:{t['dim']}; }}
QPushButton#toolbarIcon,QToolButton#toolbarIcon {{ background:{t['surface']}; border:1px solid {t['soft']}; color:{t['muted']}; border-radius:16px; padding:6px; font-weight:600; }}
QPushButton#toolbarIcon:hover,QToolButton#toolbarIcon:hover {{ background:{t['high']}; color:{t['text']}; }}
QPushButton#userChip {{ background:{t['primary']}; color:{t['accent_text']}; border:0; border-radius:17px; min-width:34px; min-height:34px; max-width:34px; max-height:34px; font-weight:800; }}
QLabel#pageTitle {{ color:{t['text']}; font-family:'Plus Jakarta Sans','Segoe UI',sans-serif; font-size:24px; font-weight:700; }}
QLabel#sectionTitle {{ color:{t['text']}; font-family:'Plus Jakarta Sans','Segoe UI',sans-serif; font-size:15px; font-weight:650; }}
QLabel#statusPill {{ background:{t['high']}; color:{t['green']}; border:1px solid {t['soft']}; border-radius:13px; padding:6px 10px; font-weight:700; }}
QLabel#statusPill[state="warning"],QLabel[state="warning"] {{ background:{t['high']}; color:{t['warning']}; }}
QLabel#statusPill[state="error"],QLabel[state="error"] {{ background:{t['red_bg']}; color:{t['red']}; }}
QLabel#statusPill[state="success"],QLabel[state="success"] {{ color:{t['green']}; }}
QFrame#card,QFrame#dashboardPetitionCard,QFrame#petitionMetricCard,QFrame#attachmentPreviewCard,QFrame#institutionContactDetail,QFrame#uiCard,QFrame#metricCard {{ background:{t['surface']}; border:1px solid {t['soft']}; border-radius:16px; }}
QLabel#metricLabel,QLabel#petitionMetricTitle {{ color:{t['dim']}; font-size:10px; font-weight:700; letter-spacing:.6px; }}
QLabel#metricValue,QLabel#petitionMetricValue,QLabel#petitionMetricStatusValue {{ color:{t['text']}; font-family:'Plus Jakarta Sans','Segoe UI',sans-serif; font-size:23px; font-weight:700; }}
QFrame#metricCard[metricTone="green"] QLabel#metricIcon {{ color:{t['green']}; background:{t['green_bg']}; border:1px solid {t['soft']}; border-radius:14px; }}
QFrame#metricCard[metricTone="red"] QLabel#metricIcon {{ color:{t['red']}; background:{t['red_bg']}; border:1px solid {t['soft']}; border-radius:14px; }}
QFrame#metricCard[metricTone="warning"] QLabel#metricIcon {{ color:{t['warning']}; background:{t['high']}; border:1px solid {t['soft']}; border-radius:14px; }}
QFrame#metricCard[metricTone="primary"] QLabel#metricIcon {{ color:{t['primary']}; background:{t['high']}; border:1px solid {t['soft']}; border-radius:14px; }}
QFrame#heroBanner,QFrame#petitionHero {{ background:{t['surface']}; border:1px solid {t['soft']}; border-radius:18px; }}
QLabel#heroTitle {{ color:{t['text']}; font-family:'Plus Jakarta Sans','Segoe UI',sans-serif; font-size:21px; font-weight:700; }}
QLabel#heroSub {{ color:{t['muted']}; font-size:12px; }}
QLabel#chatContactTitle,QLabel#chatHeaderName {{ color:{t['text']}; font-size:15px; font-weight:700; }}
QLabel#chatCountPill {{ background:{t['high']}; color:{t['muted']}; border:1px solid {t['soft']}; border-radius:10px; padding:5px 8px; font-size:11px; font-weight:700; }}
QPushButton,QToolButton {{ background:{t['high']}; color:{t['text']}; border:1px solid {t['border']}; border-radius:10px; padding:8px 12px; min-height:17px; font-weight:600; }}
QPushButton:hover,QToolButton:hover {{ background:{t['highest']}; border-color:{t['accent']}; }}
QPushButton:pressed,QToolButton:pressed {{ background:{t['lowest']}; }}
QPushButton:disabled,QToolButton:disabled {{ color:{t['dim']}; background:{t['surface']}; border-color:{t['soft']}; }}
QPushButton#primary {{ background:{t['accent']}; color:{t['accent_text']}; border:1px solid {t['accent']}; border-radius:10px; padding:9px 15px; font-weight:700; }}
QPushButton#primary:hover {{ background:{t['primary']}; border-color:{t['primary']}; }}
QPushButton#secondary {{ background:{t['high']}; color:{t['text']}; border:1px solid {t['border']}; }}
QPushButton#danger {{ background:{t['red_bg']}; color:{t['red']}; border:1px solid {t['soft']}; }}
QPushButton#quickAction {{ background:{t['surface']}; color:{t['text']}; border:1px solid {t['soft']}; border-radius:12px; text-align:left; padding:11px 13px; min-height:38px; }}
QPushButton#heroAction {{ background:{t['accent']}; color:{t['accent_text']}; border:0; border-radius:10px; padding:9px 14px; }}
QLineEdit,QTextEdit,QPlainTextEdit,QComboBox,QSpinBox,QDoubleSpinBox,QDateEdit,QDateTimeEdit {{ background:{t['lowest']}; border:1px solid {t['border']}; border-radius:10px; padding:8px 10px; color:{t['text']}; selection-background-color:{t['selection']}; selection-color:{t['selection_text']}; }}
QLineEdit:hover,QTextEdit:hover,QPlainTextEdit:hover,QComboBox:hover,QSpinBox:hover,QDoubleSpinBox:hover,QDateEdit:hover,QDateTimeEdit:hover {{ border-color:{t['dim']}; }}
QLineEdit:focus,QTextEdit:focus,QPlainTextEdit:focus,QComboBox:focus,QSpinBox:focus,QDoubleSpinBox:focus,QDateEdit:focus,QDateTimeEdit:focus {{ border:1px solid {t['accent']}; }}
QLineEdit::placeholder,QTextEdit::placeholder,QPlainTextEdit::placeholder {{ color:{t['dim']}; }}
QComboBox {{ padding-right:28px; min-height:18px; }}
QComboBox::drop-down {{ subcontrol-origin:padding; subcontrol-position:top right; width:26px; border:0; border-left:1px solid {t['soft']}; }}
QComboBox QAbstractItemView,QAbstractItemView {{ background:{t['surface']}; color:{t['text']}; border:1px solid {t['border']}; selection-background-color:{t['accent']}; selection-color:{t['accent_text']}; outline:0; padding:4px; }}
QAbstractItemView::item {{ min-height:30px; padding:7px 9px; border-radius:6px; }}
QAbstractItemView::item:hover {{ background:{t['high']}; }}
QTableWidget,QTableView,QTreeWidget,QTreeView,QListWidget,QListView {{ background:{t['surface']}; alternate-background-color:{t['high']}; color:{t['text']}; border:1px solid {t['soft']}; border-radius:12px; gridline-color:{t['soft']}; selection-background-color:{t['accent']}; selection-color:{t['accent_text']}; outline:0; padding:3px; }}
QTableWidget::item,QTableView::item,QTreeWidget::item,QTreeView::item,QListWidget::item,QListView::item {{ padding:7px 9px; border-bottom:1px solid {t['soft']}; }}
QTableWidget::item:hover,QTableView::item:hover,QTreeWidget::item:hover,QTreeView::item:hover,QListWidget::item:hover,QListView::item:hover {{ background:{t['high']}; }}
QHeaderView::section {{ background:{t['high']}; color:{t['muted']}; border:0; border-bottom:1px solid {t['border']}; padding:10px 9px; font-size:10px; font-weight:700; }}
QTabWidget::pane {{ background:{t['surface']}; border:1px solid {t['soft']}; border-radius:12px; top:-1px; }}
QTabBar::tab {{ background:transparent; color:{t['dim']}; border:0; border-bottom:2px solid transparent; padding:10px 14px; margin-right:4px; min-width:65px; }}
QTabBar::tab:selected {{ color:{t['primary']}; border-bottom:2px solid {t['accent']}; font-weight:700; }}
QTabBar::tab:hover:!selected {{ background:{t['high']}; color:{t['text']}; }}
QCheckBox,QRadioButton {{ color:{t['text']}; spacing:8px; }}
QCheckBox::indicator,QRadioButton::indicator {{ width:16px; height:16px; border:1px solid {t['dim']}; border-radius:4px; background:{t['lowest']}; }}
QRadioButton::indicator {{ border-radius:8px; }}
QCheckBox::indicator:checked,QRadioButton::indicator:checked {{ background:{t['accent']}; border-color:{t['accent']}; }}
QGroupBox {{ background:{t['surface']}; border:1px solid {t['soft']}; border-radius:12px; margin-top:14px; padding:16px 12px 12px; font-weight:700; }}
QGroupBox::title {{ subcontrol-origin:margin; left:12px; padding:0 6px; color:{t['muted']}; }}
QDialogButtonBox QPushButton {{ min-width:86px; }}
QScrollArea {{ background:transparent; border:0; }}
QScrollBar:vertical {{ background:transparent; width:9px; margin:2px; }}
QScrollBar::handle:vertical {{ background:{t['highest']}; min-height:30px; border-radius:4px; }}
QScrollBar::handle:vertical:hover {{ background:{t['dim']}; }}
QScrollBar::add-line:vertical,QScrollBar::sub-line:vertical,QScrollBar::add-page:vertical,QScrollBar::sub-page:vertical {{ height:0; background:transparent; }}
QScrollBar:horizontal {{ background:transparent; height:9px; margin:2px; }}
QScrollBar::handle:horizontal {{ background:{t['highest']}; min-width:30px; border-radius:4px; }}
QScrollBar::add-line:horizontal,QScrollBar::sub-line:horizontal,QScrollBar::add-page:horizontal,QScrollBar::sub-page:horizontal {{ width:0; background:transparent; }}
QMenu {{ background:{t['surface']}; color:{t['text']}; border:1px solid {t['border']}; border-radius:10px; padding:5px; }}
QMenu::item {{ padding:8px 24px 8px 12px; border-radius:6px; }}
QMenu::item:selected {{ background:{t['high']}; color:{t['primary']}; }}
QMenu::separator {{ height:1px; background:{t['soft']}; margin:4px 8px; }}
QToolTip {{ background:{t['high']}; color:{t['text']}; border:1px solid {t['border']}; padding:5px 8px; border-radius:6px; }}
QProgressBar {{ background:{t['highest']}; border:0; border-radius:4px; text-align:center; color:{t['text']}; min-height:8px; max-height:8px; }}
QProgressBar::chunk {{ background:{t['accent']}; border-radius:4px; }}
QSplitter::handle {{ background:{t['soft']}; }}
QSplitter::handle:horizontal {{ width:5px; }} QSplitter::handle:vertical {{ height:5px; }}
QFrame#pipelineStep {{ background:{t['surface']}; border:1px solid {t['soft']}; border-radius:9px; }}
QFrame#pipelineStep[stepState="completed"] {{ background:{t['surface']}; border-color:{t['green']}; }}
QFrame#pipelineStep[stepState="active"] {{ background:{t['high']}; border-color:{t['accent']}; }}
QFrame#pipelineStep[stepState="future"] {{ background:{t['surface']}; border-color:{t['soft']}; }}
QWidget#attachmentPreviewSurface,QWidget#settingsContent {{ background:transparent; }}
/* Unified Bitrix-like native modules: every embedded page, dialog and transient editor */
QDialog {{ background:{t['bg']}; color:{t['text']}; }}
QDialog QWidget {{ color:{t['text']}; }}
QMessageBox QLabel,QInputDialog QLabel,QFileDialog QLabel {{ color:{t['text']}; }}
QFrame#chatShell,QFrame#chatContactPane,QFrame#chatMainPane,QFrame#chatHeader,QFrame#chatComposer {{ background:{t['surface']}; border:0; }}
QFrame#chatContactPane {{ background:{t['sidebar']}; border-right:1px solid {t['soft']}; }}
QFrame#chatHeader {{ border-bottom:1px solid {t['soft']}; }}
QFrame#chatComposer {{ border-top:1px solid {t['soft']}; }}
QLabel#chatContactPreview,QLabel#chatMeta,QLabel#chatHeaderHint,QLabel#chatComposerHint {{ color:{t['dim']}; font-size:11px; }}
QFrame#chatContactRow {{ background:transparent; border:1px solid transparent; border-radius:10px; }}
QFrame#chatContactRow:hover {{ background:{t['high']}; }}
QFrame#chatContactRow[active="true"] {{ background:{t['high']}; border-color:{t['accent']}; }}
QLabel#chatUnreadBadge {{ background:{t['accent']}; color:{t['accent_text']}; border-radius:9px; padding:2px 6px; font-size:10px; font-weight:700; }}
QLabel#chatAvatar {{ background:{t['high']}; color:{t['primary']}; border:1px solid {t['soft']}; border-radius:22px; font-weight:700; }}
QFrame#chatBubbleOutgoing {{ background:{t['accent']}; color:{t['accent_text']}; border:0; border-radius:12px; }}
QFrame#chatBubbleIncoming {{ background:{t['high']}; color:{t['text']}; border:1px solid {t['soft']}; border-radius:12px; }}
QLabel#chatContactName {{ color:{t['text']}; font-size:12px; font-weight:700; background:transparent; }}
QLabel#chatMessageText {{ color:{t['text']}; }}
QLabel#chatComposerHint {{ color:{t['dim']}; }}
QPushButton#queueAction {{ background:{t['pink']}; color:{t['bg']}; border:1px solid {t['pink']}; border-radius:10px; padding:9px 14px; font-weight:700; }}
QPushButton#queueAction:hover {{ background:{t['primary']}; border-color:{t['primary']}; }}
QLabel#heroPetitionStatus[state="success"],QLabel#petitionHeroStatus[state="success"] {{ color:{t['green']}; background:{t['green_bg']}; border:1px solid {t['soft']}; border-radius:9px; padding:5px 9px; font-weight:700; }}
QLabel#heroPetitionStatus[state="error"],QLabel#petitionHeroStatus[state="error"] {{ color:{t['red']}; background:{t['red_bg']}; border:1px solid {t['soft']}; border-radius:9px; padding:5px 9px; font-weight:700; }}
QLabel#heroPetitionStatus[state="warning"],QLabel#petitionHeroStatus[state="warning"] {{ color:{t['warning']}; background:{t['high']}; border:1px solid {t['soft']}; border-radius:9px; padding:5px 9px; font-weight:700; }}
QLabel#heroPetitionStatus[state="neutral"],QLabel#petitionHeroStatus[state="neutral"] {{ color:{t['muted']}; background:{t['high']}; border:1px solid {t['soft']}; border-radius:9px; padding:5px 9px; font-weight:700; }}
QLabel#petitionQueueLabel,QLabel#petitionUsersLabel {{ color:{t['muted']}; background:transparent; }}
QLabel#profileManagerTitle {{ color:{t['text']}; font-family:'Plus Jakarta Sans','Segoe UI',sans-serif; font-size:19px; font-weight:700; }}
QLabel#pipelineLabel {{ color:{t['muted']}; font-size:11px; font-weight:600; }}
QLabel#pipelineMarker {{ color:{t['dim']}; font-size:15px; font-weight:800; }}
QFrame#pipelineStep[stepState="completed"] QLabel#pipelineMarker {{ color:{t['green']}; }}
QFrame#pipelineStep[stepState="active"] QLabel#pipelineMarker {{ color:{t['primary']}; }}
QWidget#opinionCardsHost,QWidget#taskCardsHost,QWidget#opinionPreviewHost,QWidget#projectOpinionCardsHost {{ background:transparent; border:0; }}
QWidget#labeledField {{ background:transparent; border:0; }}
QTabWidget#projectDetailTabs,QTabWidget#projectEditorTabs {{ background:{t['bg']}; }}
QFrame#opinionPreviewCard,QFrame#opinionEditCard,QFrame#institutionContactDetail,QFrame#attachmentPreviewCard {{ background:{t['surface']}; border:1px solid {t['soft']}; border-radius:12px; }}
QLabel#opinionCardTitle,QLabel#institutionContactDetailTitle,QLabel#noteDetailTitle,QLabel#profileTitle,QLabel#projectDetailTitle,QLabel#previewTitle,QLabel#dialogTitle {{ color:{t['text']}; font-family:'Plus Jakarta Sans','Segoe UI',sans-serif; font-weight:700; }}
QLabel#fieldCaption,QLabel#institutionContactCaption,QLabel#institutionContactValue,QLabel#petitionDetailText,QLabel#opinionPreviewNote {{ color:{t['muted']}; }}
QFrame#dialogPanel,QFrame#taskEditorCard,QFrame#profileAvatarPreview,QFrame#emptyState {{ background:{t['surface']}; border:1px solid {t['soft']}; border-radius:12px; }}
QWidget#pipelineContent,QWidget#opinionPreviewHost,QWidget#projectOpinionCardsHost {{ background:transparent; }}
QCalendarWidget {{ background:{t['surface']}; color:{t['text']}; border:1px solid {t['soft']}; border-radius:12px; }}
QCalendarWidget QWidget {{ alternate-background-color:{t['high']}; background:{t['surface']}; color:{t['text']}; }}
QCalendarWidget QToolButton {{ background:{t['surface']}; color:{t['text']}; border:0; border-radius:7px; padding:6px; }}
QCalendarWidget QToolButton:hover {{ background:{t['high']}; }}
QCalendarWidget QSpinBox {{ background:{t['lowest']}; color:{t['text']}; border:1px solid {t['soft']}; border-radius:6px; padding:4px; }}
QCalendarWidget QAbstractItemView:enabled {{ background:{t['surface']}; color:{t['text']}; selection-background-color:{t['accent']}; selection-color:{t['accent_text']}; outline:0; }}
QCalendarWidget QAbstractItemView:disabled {{ color:{t['dim']}; }}
QFrame#heroBanner {{ background:{t['surface']}; border:1px solid {t['soft']}; border-radius:14px; }}
QFrame#card {{ background:{t['surface']}; border:1px solid {t['soft']}; border-radius:14px; }}
QWidget#pageSurface {{ background:{t['bg']}; }}
QHeaderView::section:horizontal {{ border-right:1px solid {t['soft']}; }}
QToolButton#calendarNavigationButton {{ background:transparent; }}
QTableWidget::item:selected,QTreeWidget::item:selected,QListWidget::item:selected {{ background:{t['selection']}; color:{t['selection_text']}; }}
QProgressBar::chunk {{ background:{t['green']}; }}
QLabel[state="error"] {{ color:{t['red']}; }}
QLabel[state="warning"] {{ color:{t['warning']}; }}
QLabel[state="success"] {{ color:{t['green']}; }}
QLabel[state="neutral"] {{ color:{t['muted']}; }}
"""
