# Komplizen Protokolle - Lokaler Start auf Windows-PC
# Einmalig ausfuehren zum Einrichten, danach startet Docker den Container automatisch.
# Voraussetzung: Docker Desktop ist installiert und laeuft

$ImageName = "komplizen-protokolle"
$Container = "komplizen-protokolle"
$DataDir   = "C:\KomplizDaten\data"
$LogsDir   = "C:\KomplizDaten\logs"
$Port      = 3000

# ── E-Mail / SMTP (fuer Einladungen) ─────────────────────────────────────────
# Tragt hier eure E-Mail-Zugangsdaten ein.
# Leer lassen ("") wenn kein E-Mail-Versand benoetigt wird.
$SmtpHost   = ""              # z.B. "smtp.gmail.com" oder "mail.euerbuero.de"
$SmtpPort   = "587"           # 587 = STARTTLS (Standard), 465 = SSL
$SmtpUser   = ""              # E-Mail-Adresse / Benutzername
$SmtpPass   = ""              # Passwort
$SmtpFrom   = ""              # Absender-Adresse (oft = SmtpUser)
$SmtpSecure = "false"         # "true" nur bei Port 465
# ─────────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = "Stop"

Write-Host "=== Komplizen Protokolle - Lokaler Start ===" -ForegroundColor Cyan
Write-Host ""

# Datenordner anlegen
if (-not (Test-Path $DataDir)) { New-Item -ItemType Directory -Path $DataDir -Force | Out-Null }
if (-not (Test-Path $LogsDir)) { New-Item -ItemType Directory -Path $LogsDir -Force | Out-Null }

# Alter Container entfernen falls vorhanden
$existing = docker ps -a --filter "name=$Container" --format "{{.Names}}" 2>$null
if ($existing -eq $Container) {
    Write-Host "Alter Container wird entfernt..." -ForegroundColor Yellow
    docker rm -f $Container | Out-Null
}

# Image bauen
Write-Host "[1/2] Image bauen..." -ForegroundColor Yellow
docker build -t "${ImageName}:latest" .
if ($LASTEXITCODE -ne 0) { Write-Error "Build fehlgeschlagen"; exit 1 }
Write-Host "    OK" -ForegroundColor Green

# Container starten
Write-Host "[2/2] Container starten..." -ForegroundColor Yellow
docker run -d `
    --name $Container `
    --restart unless-stopped `
    -p "${Port}:3000" `
    -v "${DataDir}:/data" `
    -v "${LogsDir}:/logs" `
    -e PORT=3000 `
    -e HOST=0.0.0.0 `
    -e DB_PATH=/data `
    -e LOG_PATH=/logs `
    $(if ($SmtpHost) { "-e SMTP_HOST=$SmtpHost" }) `
    $(if ($SmtpHost) { "-e SMTP_PORT=$SmtpPort" }) `
    $(if ($SmtpUser) { "-e SMTP_USER=$SmtpUser" }) `
    $(if ($SmtpPass) { "-e SMTP_PASS=$SmtpPass" }) `
    $(if ($SmtpFrom) { "-e SMTP_FROM=$SmtpFrom" }) `
    $(if ($SmtpHost) { "-e SMTP_SECURE=$SmtpSecure" }) `
    "${ImageName}:latest"

if ($LASTEXITCODE -ne 0) { Write-Error "Start fehlgeschlagen"; exit 1 }
Write-Host "    OK" -ForegroundColor Green

# IP-Adresse ermitteln
$ip = (Get-NetIPAddress -AddressFamily IPv4 |
       Where-Object { $_.InterfaceAlias -notmatch "Loopback|vEthernet" -and $_.IPAddress -notmatch "^169" } |
       Select-Object -First 1).IPAddress

Write-Host ""
Write-Host "=== Fertig ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "App laeuft unter:" -ForegroundColor White
Write-Host "  Dieser PC:       http://localhost:$Port" -ForegroundColor Green
if ($ip) {
Write-Host "  Andere im Netz:  http://${ip}:$Port" -ForegroundColor Green
}
Write-Host ""
Write-Host "Daten liegen in:  $DataDir" -ForegroundColor Gray
Write-Host "Container startet automatisch beim naechsten Docker-Start." -ForegroundColor Gray
