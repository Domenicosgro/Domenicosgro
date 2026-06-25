# update.ps1
# Zieht den aktuellen Stand vom Branch und deployt direkt auf die NAS.
# Einmaliger Aufruf statt vier einzelner Befehle.

$Branch = "claude/protocol-tool-meetings-tIoZX"

Write-Host "[1/2] Git Pull..." -ForegroundColor Cyan
git fetch origin
git checkout $Branch
git pull origin $Branch
if ($LASTEXITCODE -ne 0) { Write-Host "Git Pull fehlgeschlagen." -ForegroundColor Red; exit 1 }

Write-Host "[2/2] Deploy auf NAS..." -ForegroundColor Cyan
& "$PSScriptRoot\deploy-nas.ps1"
