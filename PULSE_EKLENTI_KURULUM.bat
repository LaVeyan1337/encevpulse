@echo off
setlocal
chcp 65001 >nul
set "APP_DIR=%LOCALAPPDATA%\Programs\PULSE"
if not exist "%APP_DIR%\browser_extension\manifest.json" set "APP_DIR=%~dp0"
set "EXT_DIR=%APP_DIR%\browser_extension"
title PULSE - Chrome / Edge Eklenti Yardimcisi
echo ========================================================
echo       PULSE - TARAYICI EKLENTISI KURULUM / YENILEME
echo ========================================================
echo.
if not exist "%EXT_DIR%\manifest.json" (
  echo PULSE'in kalici kurulum klasorunde eklenti bulunamadi:
  echo %EXT_DIR%
  echo.
  echo Once PULSE 2.7.0 paketini yayinlayip bu bilgisayarda guncelleyin.
  echo Program elle farkli bir klasore kurulduysa bu BAT dosyasini o klasorden calistirin.
  pause
  exit /b 1
)

echo Sabit eklenti klasoru:
echo %EXT_DIR%
echo.
echo ILK TASIMA: Uzanti sayfasinda Gelistirici modunu acip Paketlenmemis oge yukle ile
echo yukaridaki klasoru secin. Eski eklentiyi, yenisi test edilene kadar kaldirmayin.
echo NORMAL GUNCELLEME: PULSE surumunu yukselttikten sonra uzanti kartindaki Yenile
echo dugmesine basin ve acik e-CED / imza sekmesini yenileyin. Tekrar kurulum gerekmez.
echo.
start "" explorer.exe "%EXT_DIR%"
echo Hangi tarayicinin uzanti sayfasini acalim?
echo.
choice /C CEI /N /M "C=Chrome  E=Edge  I=Ikisi: "
if errorlevel 3 goto both
if errorlevel 2 goto edge
if errorlevel 1 goto chrome
goto end

:chrome
call :open_chrome
goto end

:edge
call :open_edge
goto end

:both
call :open_chrome
call :open_edge
goto end

:open_chrome
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" "chrome://extensions/"
  exit /b 0
)
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "chrome://extensions/"
  exit /b 0
)
if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" (
  start "" "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" "chrome://extensions/"
  exit /b 0
)
echo Chrome otomatik bulunamadi. Chrome'da chrome://extensions adresini elle acin.
exit /b 0

:open_edge
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
  start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" "edge://extensions/"
  exit /b 0
)
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
  start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" "edge://extensions/"
  exit /b 0
)
if exist "%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe" (
  start "" "%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe" "edge://extensions/"
  exit /b 0
)
echo Edge otomatik bulunamadi. Edge'de edge://extensions adresini elle acin.
exit /b 0

:end
echo.
echo Not: Bu yardimci eklentiyi kendisi yuklemez veya Yenile'ye otomatik basmaz.
echo Tarayici guvenligi geregi bu son adimlari siz yapmalisiniz.
pause
exit /b 0
