# deploy-nas.ps1
# Deployt die App auf die Synology NAS via SSH – ein Befehl, fertig.
#
# Voraussetzung: SSH auf der Synology aktiviert
#   Synology DSM → Systemsteuerung → Terminal & SNMP → SSH-Dienst aktivieren
#
# Empfohlen: SSH-Schluessel einrichten (einmalig), dann kein Passwort noetig:
#   ssh-keygen -t ed25519 -C "komplizen-deploy"
#   ssh-copy-id admin@192.168.178.250
#
# Eigene Werte in deploy-nas.config.ps1 speichern (wird nie in Git eingecheckt).

$NasIp     = "192.168.178.250"
$NasUser   = "admin"
$NasPath   = "/volume1/docker/komplizen-protokolle"
$ImageName = "komplizen-protokolle"
$TarFile   = "komplizen-protokolle-deploy.tar"
$TempNas   = "/tmp/$TarFile"

# Optionale lokale Konfiguration laden
$ConfigFile = Join-Path $PSScriptRoot "deploy-nas.config.ps1"
if (Test-Path $ConfigFile) {
    . $ConfigFile
    Write-Host "  Konfiguration geladen aus deploy-nas.config.ps1" -ForegroundColor Gray
}

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=== Komplizen Protokolle – Deploy auf NAS ===" -ForegroundColor Cyan
Write-Host "  NAS:   $NasUser@$NasIp" -ForegroundColor Gray
Write-Host "  Pfad:  $NasPath" -ForegroundColor Gray
Write-Host ""

# [1/4] Image bauen
Write-Host "[1/4] Docker-Image bauen..." -ForegroundColor Yellow
docker build -t "${ImageName}:latest" .
if ($LASTEXITCODE -ne 0) { Write-Error "Build fehlgeschlagen"; exit 1 }
Write-Host "      fertig" -ForegroundColor Green

# [2/4] Image als .tar speichern
Write-Host "[2/4] Image speichern..." -ForegroundColor Yellow
docker save -o $TarFile "${ImageName}:latest"
if ($LASTEXITCODE -ne 0) { Write-Error "docker save fehlgeschlagen"; exit 1 }
$sizeMb = [math]::Round((Get-Item $TarFile).Length / 1MB, 0)
Write-Host "      fertig ($sizeMb MB)" -ForegroundColor Green

# [3/4] Upload zur NAS
Write-Host "[3/4] Upload zur NAS (SCP)..." -ForegroundColor Yellow
scp $TarFile "${NasUser}@${NasIp}:${TempNas}"
if ($LASTEXITCODE -ne 0) {
    Remove-Item $TarFile -ErrorAction SilentlyContinue
    Write-Error "Upload fehlgeschlagen – SSH erreichbar?"
    exit 1
}
Write-Host "      fertig" -ForegroundColor Green

# [4/4] Container auf der NAS tauschen via SSH
Write-Host "[4/4] Container aktualisieren (SSH)..." -ForegroundColor Yellow
$remoteCmd = @"
set -e
echo '[NAS] Stoppe laufenden Container...'
docker stop komplizen-protokolle 2>/dev/null || true
docker rm   komplizen-protokolle 2>/dev/null || true
echo '[NAS] Lade neues Image...'
docker load -i $TempNas
echo '[NAS] Raeume veraltete Images auf...'
docker image prune -f 2>/dev/null || true
echo '[NAS] Starte Container...'
cd $NasPath && docker compose up -d
echo '[NAS] Loesche temporaere Datei...'
rm -f $TempNas
echo '[NAS] Fertig.'
"@

ssh "${NasUser}@${NasIp}" "$remoteCmd"
if ($LASTEXITCODE -ne 0) {
    Remove-Item $TarFile -ErrorAction SilentlyContinue
    Write-Error "SSH-Befehl fehlgeschlagen"
    exit 1
}
Write-Host "      fertig" -ForegroundColor Green

# Lokale .tar aufraumen
Remove-Item $TarFile -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "=== Deploy abgeschlossen ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "App erreichbar unter:" -ForegroundColor White
Write-Host "  http://${NasIp}:3000" -ForegroundColor Green
Write-Host ""
Write-Host "Tipp: Browser-Cache leeren mit Strg+Umschalt+R" -ForegroundColor Gray
Write-Host ""
