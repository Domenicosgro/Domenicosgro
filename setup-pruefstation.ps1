# setup-pruefstation.ps1
# Richtet den NAS-Zugriff der Pruefstation ein - einmalig, ein Befehl.
#
#   1. legt in DSM das Service-Konto an (Standard: svc-komplizen) bzw. setzt
#      ein neues Passwort, falls es schon existiert
#   2. gibt dem Konto Lese-/Schreibrecht auf die Projektfreigabe(n)
#   3. traegt SYNOLOGY_FS_USER / SYNOLOGY_FS_PASS / PRUEFSTATION_ROOTS in die
#      docker-compose.yml auf der NAS ein (vorher Sicherungskopie)
#   4. erstellt den Container neu (ENV-Aenderung) und prueft die Anmeldung
#
# Das Passwort wird zufaellig erzeugt und landet NUR in der docker-compose.yml
# auf der NAS - nicht in Git, nicht auf diesem PC.
#
# Voraussetzung: wie deploy-nas.ps1 (SSH als "Deploy", Gruppe administrators).
# Das Skript fragt einmal nach dem sudo-Passwort des Deploy-Benutzers, weil
# Benutzer- und Freigabeverwaltung root-Rechte brauchen.
#
# Aufruf:  .\setup-pruefstation.ps1
#          .\setup-pruefstation.ps1 -Shares "Projekte,Planserver" -ServiceUser svc-komplizen
#
# Skript ist reines ASCII (PowerShell 5.1).

param(
    [string]$Shares      = "",
    [string]$ServiceUser = "svc-komplizen"
)

$NasIp   = "192.168.178.250"
$NasUser = "Deploy"
$NasPath = "/volume1/docker/komplizen-protokolle"

$ConfigFile = Join-Path $PSScriptRoot "deploy-nas.config.ps1"
if (Test-Path $ConfigFile) { . $ConfigFile }

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=== Pruefstation - NAS-Zugriff einrichten ===" -ForegroundColor Cyan
Write-Host "  NAS:          $NasUser@$NasIp" -ForegroundColor Gray
Write-Host "  Service-Konto: $ServiceUser" -ForegroundColor Gray
Write-Host ""

if (-not $Shares) {
    $Shares = Read-Host "Name der Projektfreigabe(n) auf der NAS (mehrere mit Komma) [Projekte]"
    if (-not $Shares) { $Shares = "Projekte" }
}
$shareList = $Shares.Split(",") | ForEach-Object { $_.Trim().Trim("/") } | Where-Object { $_ }
if (-not $shareList) { Write-Error "Keine Freigabe angegeben."; exit 1 }
foreach ($s in $shareList) {
    if ($s -notmatch '^[A-Za-z0-9 ._-]+$') { Write-Error "Ungueltiger Freigabename: $s"; exit 1 }
}
$roots = ($shareList | ForEach-Object { "/$_" }) -join ","

# Zufallspasswort: Buchstaben/Ziffern + feste Sonderzeichen (DSM-Richtlinie),
# bewusst ohne Zeichen, die in YAML, URL oder Shell stoeren.
$chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789".ToCharArray()
$rng   = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$bytes = New-Object byte[] 24
$rng.GetBytes($bytes)
$pw = -join ($bytes | ForEach-Object { $chars[$_ % $chars.Length] })
$pw = $pw + "-Kp7_"

$shareArgs = ($shareList | ForEach-Object { "'" + $_ + "'" }) -join " "

$remote = @"
#!/bin/bash
set -e
trap 'rm -f /tmp/kp-setup-pruef.sh' EXIT
SVC='$ServiceUser'
PASS='$pw'
ROOTS='$roots'
DC='$NasPath/docker-compose.yml'
SU=/usr/syno/sbin/synouser
SS=/usr/syno/sbin/synoshare
DK=/usr/local/bin/docker

echo '[NAS 1/4] Service-Konto...'
if `$SU --get "`$SVC" >/dev/null 2>&1; then
  `$SU --setpw "`$SVC" "`$PASS" >/dev/null
  echo "          `$SVC existiert - neues Passwort gesetzt."
else
  `$SU --add "`$SVC" "`$PASS" "Service-Konto Komplizen Pruefstation (Dateizugriff)" 0 "" 0 >/dev/null
  echo "          `$SVC angelegt."
fi

echo '[NAS 2/4] Freigaben (Lesen/Schreiben)...'
for SHARE in $shareArgs; do
  if ! `$SS --get "`$SHARE" >/dev/null 2>&1; then
    echo "          FEHLER: Freigabe '`$SHARE' nicht gefunden. Vorhandene Freigaben:"
    `$SS --enum ALL | tail -n +2 | sed 's/^/            /'
    exit 1
  fi
  `$SS --setuser "`$SHARE" RW + "`$SVC" >/dev/null
  echo "          `$SHARE: RW fuer `$SVC"
done

echo '[NAS 3/4] docker-compose.yml...'
[ -f "`$DC" ] || { echo "          FEHLER: `$DC fehlt."; exit 1; }
grep -q '^[[:space:]]*SYNOLOGY_URL:' "`$DC" || { echo '          FEHLER: SYNOLOGY_URL fehlt in der docker-compose.yml (einmal deploy-nas.ps1 laufen lassen).'; exit 1; }
cp "`$DC" "`$DC.bak-`$(date +%Y%m%d-%H%M%S)"
sed -i '/^[[:space:]]*#\{0,1\}[[:space:]]*SYNOLOGY_FS_USER:/d;/^[[:space:]]*#\{0,1\}[[:space:]]*SYNOLOGY_FS_PASS:/d;/^[[:space:]]*#\{0,1\}[[:space:]]*PRUEFSTATION_ROOTS:/d' "`$DC"
awk -v u="`$SVC" -v p="`$PASS" -v r="`$ROOTS" '
  { print }
  /^[[:space:]]*SYNOLOGY_URL:/ && !done {
    match(`$0, /^[[:space:]]*/); ind = substr(`$0, 1, RLENGTH)
    print ind "SYNOLOGY_FS_USER:    \"" u "\""
    print ind "SYNOLOGY_FS_PASS:    \"" p "\""
    print ind "PRUEFSTATION_ROOTS:  \"" r "\""
    done = 1
  }' "`$DC" > /tmp/_dc_new.yml
cat /tmp/_dc_new.yml > "`$DC" && rm -f /tmp/_dc_new.yml
echo "          eingetragen (Sicherung: `$DC.bak-*)"

echo '[NAS 4/4] Container neu erstellen...'
cd '$NasPath' && `$DK compose up -d --force-recreate

echo '[NAS] Pruefe File-Station-Anmeldung des Service-Kontos...'
SYNO=`$(grep '^[[:space:]]*SYNOLOGY_URL:' "`$DC" | head -1 | sed 's/.*SYNOLOGY_URL:[[:space:]]*"\{0,1\}\([^"]*\)"\{0,1\}.*/\1/')
RES=`$(curl -s -m 10 "`$SYNO/webapi/auth.cgi?api=SYNO.API.Auth&version=6&method=login&account=`$SVC&passwd=`$PASS&session=FileStation&format=sid" || true)
if echo "`$RES" | grep -q '"success":true'; then
  SID=`$(echo "`$RES" | sed 's/.*"sid":"\([^"]*\)".*/\1/')
  LS=`$(curl -s -m 10 "`$SYNO/webapi/entry.cgi?api=SYNO.FileStation.List&version=2&method=list_share&_sid=`$SID" || true)
  curl -s -m 5 "`$SYNO/webapi/auth.cgi?api=SYNO.API.Auth&version=6&method=logout&session=FileStation&_sid=`$SID" >/dev/null || true
  echo "          Anmeldung OK. Sichtbare Freigaben:"
  echo "`$LS" | grep -o '"name":"[^"]*"' | sed 's/"name":"\(.*\)"/            \1/'
else
  echo "          WARNUNG: Anmeldung fehlgeschlagen: `$RES"
  echo "          (Code 400/401 = Passwort, 402/403 = 2-Faktor oder App-Recht File Station fehlt)"
fi

echo '[NAS] Warte auf Healthcheck...'
for i in `$(seq 1 20); do
  if curl -s -m 3 http://127.0.0.1:3000/api/health | grep -q '"ok"'; then echo '          Container laeuft.'; exit 0; fi
  sleep 3
done
echo '          WARNUNG: /api/health antwortet noch nicht - Container-Log pruefen.'
"@

$remote = $remote -replace "`r`n", "`n"
$tmp = Join-Path $env:TEMP "kp-setup-pruef.sh"
[System.IO.File]::WriteAllText($tmp, $remote, (New-Object System.Text.UTF8Encoding($false)))

try {
    Write-Host "[1/2] Skript zur NAS kopieren (SCP)..." -ForegroundColor Yellow
    scp -O $tmp "${NasUser}@${NasIp}:/tmp/kp-setup-pruef.sh"
    if ($LASTEXITCODE -ne 0) { Write-Error "Upload fehlgeschlagen - SSH erreichbar?"; exit 1 }

    Write-Host "[2/2] Einrichtung auf der NAS (sudo-Passwort von $NasUser eingeben)..." -ForegroundColor Yellow
    ssh -t "${NasUser}@${NasIp}" "chmod 600 /tmp/kp-setup-pruef.sh && sudo bash /tmp/kp-setup-pruef.sh; rm -f /tmp/kp-setup-pruef.sh"
    if ($LASTEXITCODE -ne 0) { Write-Error "Einrichtung auf der NAS fehlgeschlagen (Ausgabe oben)."; exit 1 }
}
finally {
    Remove-Item $tmp -ErrorAction SilentlyContinue
    $pw = $null
}

Write-Host ""
Write-Host "=== Pruefstation: NAS-Zugriff eingerichtet ===" -ForegroundColor Cyan
Write-Host "  Erlaubte Wurzeln: $roots" -ForegroundColor Gray
Write-Host "  Oberflaeche:      http://${NasIp}:3000/pruefstation" -ForegroundColor Green
Write-Host ""
