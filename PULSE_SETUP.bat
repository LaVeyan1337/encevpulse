@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title PULSE - Kurulum
color 0B
echo ========================================================
echo                       PULSE 2.7.0
echo       Bitrix Workspace arayüzü ve PULSE kurulumu
echo ========================================================
echo.
echo Bu kurulum eski ENCTakip kisayollarini temizler ve PULSE kisayollarini olusturur.
echo Ayarlar ve kisisel notlar korunur. Ortak proje/dilekce verileri silinmez.
echo Kurulumdan once PULSE ve ENCTakip pencerelerini kapatin.
echo.
where py >nul 2>nul
if errorlevel 1 (
  echo Python Launcher ^(py.exe^) bulunamadi. Python 3 kurulumu gerekiyor.
  echo Kurulum paketi Python 3'u otomatik indirmez.
  pause
  exit /b 1
)
py -3 install_pulse.py
if errorlevel 1 goto fail
echo.
echo PULSE kurulumu tamamlandi.
echo Masaustunde ve Baslat menusunde PULSE kisayolu olusturuldu.
echo.
pause
exit /b 0
:fail
echo.
echo Kurulum tamamlanamadi. Yukaridaki hatayi kontrol edin.
pause
exit /b 1
