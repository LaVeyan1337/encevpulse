param(
    [Parameter(Mandatory=$true)][string]$AppDir,
    [Parameter(Mandatory=$true)][string]$DataDir
)
$ErrorActionPreference = 'Stop'
$appDir = [System.IO.Path]::GetFullPath($AppDir)
$dataDir = [System.IO.Path]::GetFullPath($DataDir)
$startupDir = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup'
$desktopDir = [Environment]::GetFolderPath('Desktop')
$programsDir = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
$commonDesktop = [Environment]::GetFolderPath('CommonDesktopDirectory')
$commonPrograms = [Environment]::GetFolderPath('CommonPrograms')
$legacyPattern = '(?i)(enctakip|enc[_ -]?takip|encev[ _-]*pulse)'
$pulsePattern = '(?i)^pulse$'
$wsh = New-Object -ComObject WScript.Shell
$hadAutostart = $false
$removed = 0

$scanDirs = @($desktopDir, $programsDir, $commonDesktop, $commonPrograms, $startupDir) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique
foreach ($dir in $scanDirs) {
    Get-ChildItem -LiteralPath $dir -Filter '*.lnk' -File -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
        $file = $_
        try {
            $shortcut = $wsh.CreateShortcut($file.FullName)
            $launchInfo = ($shortcut.TargetPath + ' ' + $shortcut.Arguments)
            $nameIsLegacy = $file.BaseName -match $legacyPattern
            $targetIsLegacy = $launchInfo -match '(?i)(ENCTakip\.exe|enc_takip|ENCTakipPulse|ENCTakip[_ -])'
            $isPulse = $file.BaseName -match $pulsePattern
            $targetIsThisPulse = $launchInfo -match '(?i)(pulse_app\.py|START_PULSE\.bat|Launch-Pulse\.ps1)'
            $isOldPulseBrand = $file.BaseName -match '(?i)^ENÇEV[ _-]*PULSE$|^ENCEV[ _-]*PULSE$'
            $shouldRemove = $nameIsLegacy -or $targetIsLegacy -or $isOldPulseBrand -or ($isPulse -and $targetIsThisPulse)
            if ($dir -eq $startupDir -and $shouldRemove) { $hadAutostart = $true }
            if ($shouldRemove) {
                Remove-Item -LiteralPath $file.FullName -Force -ErrorAction Stop
                $removed++
            }
        } catch { }
    }
}

# Remove only clearly named legacy startup scripts; do not touch arbitrary .cmd files.
if (Test-Path $startupDir) {
    Get-ChildItem -LiteralPath $startupDir -File -ErrorAction SilentlyContinue | ForEach-Object {
        $file = $_
        if ($file.BaseName -match $legacyPattern -or $file.Name -match '(?i)^ENCTakipPulse\.cmd$|^ENCEV_PULSE\.cmd$') {
            $hadAutostart = $true
            try { Remove-Item -LiteralPath $file.FullName -Force -ErrorAction Stop; $removed++ } catch { }
        }
    }
}

$iconPath = Join-Path $appDir 'assets\pulse.ico'
$launchScript = Join-Path $appDir 'Launch-Pulse.ps1'
$arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $launchScript + '"'
function New-PulseShortcut([string]$shortcutPath) {
    $parent = Split-Path -Parent $shortcutPath
    if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    $s = $wsh.CreateShortcut($shortcutPath)
    $s.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $s.Arguments = $arguments
    $s.WorkingDirectory = $appDir
    $s.Description = 'PULSE — Proje, evrak ve e-ÇED yönetimi'
    if (Test-Path $iconPath) { $s.IconLocation = "$iconPath,0" }
    $s.Save()
}

New-PulseShortcut (Join-Path $desktopDir 'PULSE.lnk')
$pulseMenuDir = Join-Path $programsDir 'PULSE'
New-PulseShortcut (Join-Path $pulseMenuDir 'PULSE.lnk')

# Preserve an existing legacy auto-start preference, but point it at PULSE.
if ($hadAutostart) {
    if (-not (Test-Path $startupDir)) { New-Item -ItemType Directory -Path $startupDir -Force | Out-Null }
    $startupScript = Join-Path $startupDir 'PULSE.cmd'
    $content = "@echo off`r`nstart `"`" powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launchScript`"`r`n"
    Set-Content -LiteralPath $startupScript -Value $content -Encoding ASCII
}
Write-Output "PULSE kısayolları oluşturuldu. Temizlenen eski kısayol/script sayısı: $removed"
