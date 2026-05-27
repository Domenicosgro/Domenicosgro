# Komplizen Protokolle - Build & Deploy zur Synology
# Ausfuehren: .\build-deploy.ps1
# Voraussetzung: Docker Desktop laeuft, Synology-Freigabe ist eingebunden

param(
    [string]$NasPath   = "\\192.168.178.250\docker\komplizen-protokolle",
    [string]$ImageName = "komplizen-protokolle",
    [string]$Tag       = "latest"
)

$ErrorActionPreference = "Stop"
$TarFile  = "$ImageName.tar"
$FullName = "${ImageName}:${Tag}"

Write-Host "=== Komplizen Protokolle - Build & Deploy ===" -ForegroundColor Cyan
Write-Host ""

# 1. Docker-Image bauen
Write-Host "[1/4] Image bauen ($FullName)..." -ForegroundColor Yellow
docker build -t $FullName .
if ($LASTEXITCODE -ne 0) { Write-Error "Build fehlgeschlagen"; exit 1 }
Write-Host "    OK" -ForegroundColor Green

# 2. Image exportieren
Write-Host "[2/4] Image exportieren als $TarFile..." -ForegroundColor Yellow
docker save -o $TarFile $FullName
if ($LASTEXITCODE -ne 0) { Write-Error "Export fehlgeschlagen"; exit 1 }
$size = [math]::Round((Get-Item $TarFile).Length / 1MB, 1)
Write-Host "    OK ($size MB)" -ForegroundColor Green

# 3. Zielordner auf NAS pruefen
Write-Host "[3/4] NAS-Ordner pruefen ($NasPath)..." -ForegroundColor Yellow
if (-not (Test-Path $NasPath)) {
    Write-Host ""
    Write-Host "  FEHLER: Ordner nicht gefunden oder kein Zugriff." -ForegroundColor Red
    Write-Host "  Bitte manuell im Windows Explorer anlegen:" -ForegroundColor Yellow
    Write-Host "    1. Explorer oeffnen -> \\192.168.178.250\docker" -ForegroundColor Gray
    Write-Host "    2. Ordner 'komplizen-protokolle' erstellen" -ForegroundColor Gray
    Write-Host "    3. Darin 'data' und 'logs' erstellen" -ForegroundColor Gray
    Write-Host "    4. Skript erneut ausfuehren" -ForegroundColor Gray
    exit 1
}
foreach ($sub in @("data", "logs")) {
    $subPath = Join-Path $NasPath $sub
    if (-not (Test-Path $subPath)) {
        New-Item -ItemType Directory -Path $subPath -Force | Out-Null
    }
}
Write-Host "    OK" -ForegroundColor Green

# 4. Dateien kopieren
Write-Host "[4/4] Dateien auf NAS kopieren..." -ForegroundColor Yellow
Copy-Item -Path $TarFile           -Destination $NasPath -Force
Copy-Item -Path "docker-compose.yml" -Destination $NasPath -Force
Write-Host "    OK" -ForegroundColor Green

Write-Host ""
Write-Host "=== Fertig ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Naechste Schritte auf der Synology:" -ForegroundColor White
Write-Host "  1. Container Manager oeffnen" -ForegroundColor Gray
Write-Host "  2. Image -> Hinzufuegen -> Aus Datei -> $TarFile auswaehlen" -ForegroundColor Gray
Write-Host "  3. Projekt -> Erstellen -> Pfad: $NasPath" -ForegroundColor Gray
Write-Host "     ODER per SSH:" -ForegroundColor Gray
Write-Host "     cd /volume1/docker/komplizen-protokolle && docker compose up -d" -ForegroundColor Gray
Write-Host ""
Write-Host "App laeuft dann auf: http://192.168.178.250:3000" -ForegroundColor Cyan
