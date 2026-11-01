@echo off
setlocal
cd /d "%~dp0"
title PULSE

echo ENCEV PULSE baslatiliyor...
where py >nul 2>nul
if errorlevel 1 (
  echo Python Launcher bulunamadi. Once PULSE_SETUP.bat dosyasini calistirin.
  pause
  exit /b 1
)
py -3 pulse_app.py
if errorlevel 1 (
  echo.
  echo PULSE kapandi veya baslatma hatasi olustu.
  pause
)
