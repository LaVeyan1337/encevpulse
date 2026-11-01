from __future__ import annotations

import hashlib
import json
import os
import sys
import zipfile
from datetime import datetime
from pathlib import Path

from update_service import is_newer, read_manifest, version_tuple

ROOT = Path(__file__).resolve().parent
VERSION_FILE = ROOT / "VERSION.txt"
DEFAULT_TARGET = Path(r"\\192.168.1.55\Genel Evrak\.encev_sistem\eced_pulse")
EXCLUDE_DIRS = {"tests", "__pycache__", ".pytest_cache", "build_pulse", "dist_pulse", "build", "dist"}
EXCLUDE_FILES = {"publish_update.py", "PUBLISH_PULSE.bat", "VALIDATION_RESULTS.txt"}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    version = VERSION_FILE.read_text(encoding="utf-8").strip()
    if not version_tuple(version):
        raise ValueError("VERSION.txt ör. 1.2.3 biçiminde olmalı.")
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_TARGET
    if not target.is_dir():
        raise FileNotFoundError(f"Yayın klasörüne erişilemiyor: {target}\nÖnce ağ bağlantısını ve klasör izinlerini kontrol edin.")
    updates = target / "updates"
    updates.mkdir(parents=True, exist_ok=True)
    latest_path = updates / "latest.json"
    if latest_path.exists():
        old = read_manifest(target)
        if not old:
            raise ValueError(f"Mevcut {latest_path} dosyası okunamıyor veya biçimi geçersiz. Önce yöneticinin düzeltmesi gerekir.")
        if not is_newer(version, old["version"]):
            raise ValueError(f"Yayın durduruldu: yeni sürüm ({version}), yayındaki sürümden ({old['version']}) daha yüksek olmalı. VERSION.txt değerini artırın.")

    package_name = f"PULSE_{version}.zip"
    final_package = updates / package_name
    temp_package = updates / (package_name + ".tmp")
    if final_package.exists():
        raise FileExistsError(f"Bu sürümün ZIP dosyası zaten var: {final_package}. Yeni bir sürüm numarası kullanın.")
    try:
        with zipfile.ZipFile(temp_package, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=7) as zf:
            for path in sorted(ROOT.rglob("*")):
                if not path.is_file():
                    continue
                relative = path.relative_to(ROOT)
                if any(part in EXCLUDE_DIRS for part in relative.parts) or path.name in EXCLUDE_FILES:
                    continue
                if path.name.startswith("TEST_RESULTS_") and path.suffix.casefold() == ".txt":
                    continue
                if any(part.startswith((".pulse-update-stage-", ".pulse-update-backup-")) for part in relative.parts):
                    continue
                zf.write(path, relative.as_posix())
        # Verify the release ZIP before publishing it as the current release.
        with zipfile.ZipFile(temp_package) as zf:
            bad_member = zf.testzip()
            if bad_member:
                raise ValueError(f"ZIP doğrulaması başarısız: {bad_member}")
            archived_version = zf.read("VERSION.txt").decode("utf-8-sig").strip()
            required = {"pulse_app.py", "pulse_core.py", "pulse_collector.py", "pulse_workspace.py", "pulse_workspace_ui.py", "pulse_petition.py", "pulse_updater.py", "update_service.py", "START_PULSE.bat", "INSTALL.bat", "PULSE_SETUP.bat", "RUN_TESTS.bat", "VERSION.txt", "requirements.txt", "pulse_dates.py", "pulse_calendar.py", "pulse_documents.py", "pulse_theme.py", "pulse_theme_tokens.py", "assets/stitch_overview.html", "assets/stitch_tasks.html", "assets/stitch_design.css", "assets/stitch_app.js", "pulse_paths.py", "pulse_notification_policy.py", "migrate_shortcuts.py", "migrate_shortcuts.ps1", "Launch-Pulse.ps1", "README.txt", "CHANGELOG.txt", "assets/pulse.ico", "assets/pulse_icon.png", "assets/pulse_logo_white.png", "browser_extension/manifest.json", "browser_extension/background.js", "browser_extension/content.js", "browser_extension/popup.html", "browser_extension/popup.js", "browser_extension/popup.css", "browser_extension/icons/pulse16.png", "browser_extension/icons/pulse32.png", "browser_extension/icons/pulse48.png", "browser_extension/icons/pulse128.png", "PULSE_EKLENTI_KURULUM.bat", "PULSE_EKLENTI_GUNCELLEME_REHBERI.txt"}
            names = {n for n in zf.namelist() if not n.endswith("/")}
            if archived_version != version or not required.issubset(names):
                raise ValueError("Paket içeriği/sürümü beklenen kaynaklarla uyuşmuyor; yayın yapılmadı.")
        digest = sha256(temp_package)
        os.replace(temp_package, final_package)
        manifest = {
            "app": "PULSE",
            "version": version,
            "package": package_name,
            "sha256": digest,
            "published_at": datetime.now().astimezone().isoformat(timespec="seconds"),
            "notes": f"PULSE {version} güncellemesi. Tarayıcı eklentisi dosyaları da bu pakete dahildir. Sabit kurulum klasöründen yüklenen Chrome/Edge eklentisinde yayın sonrası tarayıcı uzantılar sayfasından Yenile ve ardından portal sekmesini yenile işlemi gerekir. Ayarlar, Notlarım ve ortak proje/dilekçe/sohbet verileri bu güncelleme tarafından silinmez."
        }
        manifest_tmp = updates / "latest.json.tmp"
        manifest_tmp.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(manifest_tmp, latest_path)
    finally:
        try:
            temp_package.unlink(missing_ok=True)
        except OSError:
            pass

    print("YAYIN TAMAMLANDI")
    print(f"Sürüm: {version}")
    print(f"Paket: {final_package}")
    print(f"SHA-256: {digest}")
    print(f"Manifest: {latest_path}")
    print("İstemciler en geç yaklaşık 5 dakika içinde güncellemeyi görür; kurulum yalnızca kullanıcı onayından sonra başlar.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"YAYIN BAŞARISIZ: {exc}")
        raise SystemExit(1)
