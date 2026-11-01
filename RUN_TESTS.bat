@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title PULSE - Test
py -3 -m py_compile pulse_core.py pulse_collector.py pulse_dates.py pulse_workspace.py pulse_workspace_ui.py pulse_app.py update_service.py pulse_updater.py pulse_notification_policy.py publish_update.py install_pulse.py migrate_shortcuts.py
if errorlevel 1 goto fail
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
  node --check assets\stitch_app.js
  if errorlevel 1 goto fail
)
echo.
echo Tum temel testler gecti.
pause
exit /b 0
:fail
echo.
echo TEST BASARISIZ.
pause
exit /b 1
