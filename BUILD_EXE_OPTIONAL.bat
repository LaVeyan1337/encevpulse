@echo off
setlocal
cd /d "%~dp0"
title PULSE - EXE Paketleme
echo Bu adim mevcut uygulama dosyalarini silmez; sadece dist_pulse klasorune yazar.
py -3 -m pip install pyinstaller
if errorlevel 1 goto fail
py -3 -m PyInstaller --noconfirm --clean --onefile --windowed --name PULSE --icon assets\pulse.ico --add-data "assets;assets" --distpath dist_pulse --workpath build_pulse pulse_app.py
if errorlevel 1 goto fail
if exist "dist_pulse\browser_extension" rmdir /s /q "dist_pulse\browser_extension"
xcopy "browser_extension" "dist_pulse\browser_extension\" /e /i /y >nul
if errorlevel 1 goto fail
if exist "dist_pulse\assets" rmdir /s /q "dist_pulse\assets"
xcopy "assets" "dist_pulse\assets\" /e /i /y >nul
if errorlevel 1 goto fail
echo Olustu: dist_pulse\PULSE.exe
pause
exit /b 0
:fail
echo Paketleme basarisiz.
pause
exit /b 1
