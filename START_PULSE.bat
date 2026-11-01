@echo off
setlocal
cd /d "%~dp0"
title PULSE
echo PULSE baslatiliyor...
where py >nul 2>nul
if errorlevel 1 (
  echo Python Launcher bulunamadi. PULSE_SETUP.bat dosyasini calistirin.
  pause
  exit /b 1
)
py -3 migrate_shortcuts.py --quiet
py -3 pulse_app.py
if errorlevel 1 (
  echo.
  echo PULSE kapandi veya baslatma hatasi olustu.
  pause
)
