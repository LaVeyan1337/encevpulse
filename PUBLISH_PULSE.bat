@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title PULSE - Güncelleme Yayını
echo ============================================
echo PULSE 2.7.0 - BITRIX WORKSPACE YAYINI
echo ============================================
echo.
echo Önce kod ve test kontrolleri çalışacak, ardından paket ortak güncelleme alanına yayınlanacak.
echo.
where py >nul 2>nul
if errorlevel 1 goto no_python

echo [1/3] Python kaynak kontrolü...
py -3 -m py_compile pulse_core.py pulse_collector.py pulse_dates.py pulse_calendar.py pulse_documents.py pulse_theme.py pulse_theme_tokens.py pulse_workspace.py pulse_workspace_ui.py pulse_petition.py pulse_app.py update_service.py pulse_updater.py pulse_notification_policy.py publish_update.py install_pulse.py migrate_shortcuts.py
if errorlevel 1 goto fail

echo.
echo [2/3] Otomatik testler...
py -3 -m pytest -q tests
if errorlevel 1 goto fail

where node >nul 2>nul
if not errorlevel 1 (
  node --check browser_extension\background.js
  if errorlevel 1 goto fail
  node --check browser_extension\content.js
  if errorlevel 1 goto fail
  node --check browser_extension\popup.js
  if errorlevel 1 goto fail
)

echo.
echo [3/3] Güncelleme paketi yayınlama
echo Varsayılan hedef, uygulamadaki ortak izleme klasörünün altındaki updates klasörüdür.
echo Farklı ortak klasör kullanacaksan tam yolu yaz; varsayılan için boş Enter.
set /p TARGET=Ortak klasör:
if "%TARGET%"=="" (
  py -3 publish_update.py
) else (
  py -3 publish_update.py "%TARGET%"
)
if errorlevel 1 goto fail

echo.
echo YAYIN TAMAMLANDI. İstemciler sürümü otomatik denetleyecek.
echo Chrome/Edge eklenti dosyalari da masaustu paketine dahildir.
echo Eklenti kalici kurulum yolu: %LOCALAPPDATA%\Programs\PULSE\browser_extension
echo Her istemcide guncellemeden sonra uzantilar sayfasinda PULSE icin Yenile'ye basin.
echo Ayrintili gecis: PULSE_EKLENTI_GUNCELLEME_REHBERI.txt
pause
exit /b 0

:no_python
echo Python Launcher (py) bulunamadi. Python 3 kurulumunu kontrol edin.
goto fail

:fail
echo.
echo YAYIN DURDURULDU. Hata ayrıntısını yukarıdaki çıktıda kontrol edin.
pause
exit /b 1
