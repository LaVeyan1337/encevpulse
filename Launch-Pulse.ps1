$ErrorActionPreference = 'Continue'
$appDir = $PSScriptRoot
$logDir = Join-Path $env:LOCALAPPDATA 'PULSE'
try { New-Item -ItemType Directory -Path $logDir -Force | Out-Null } catch { }
$logPath = Join-Path $logDir 'launch.log'
"`r`n[$(Get-Date -Format s)] PULSE başlatılıyor. Kaynak: $appDir" | Out-File -FilePath $logPath -Append -Encoding utf8
Push-Location $appDir
try {
    & py -3 (Join-Path $appDir 'migrate_shortcuts.py') --quiet *>> $logPath
    & py -3 (Join-Path $appDir 'pulse_app.py') *>> $logPath
    "[$(Get-Date -Format s)] PULSE kapandı (kod $LASTEXITCODE)." | Out-File -FilePath $logPath -Append -Encoding utf8
} catch {
    "[$(Get-Date -Format s)] Başlatma hatası: $_" | Out-File -FilePath $logPath -Append -Encoding utf8
}
finally { Pop-Location }
