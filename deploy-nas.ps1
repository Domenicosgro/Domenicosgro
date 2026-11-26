# deploy-nas.ps1
# Deployt die App auf die Synology NAS via SSH - ein Befehl, fertig.
#
# Voraussetzung NAS-seitig (einmalig):
#   - Lokaler Benutzer "Deploy" in Gruppe "administrators"
#   - Passwortloses sudo fuer docker:
#       /etc/sudoers.d/deploy-docker  ->  Deploy ALL=(ALL) NOPASSWD: /usr/local/bin/docker
#
# Empfohlen: SSH-Schluessel einrichten (einmalig), dann kein Passwort noetig.
# Ohne Schluessel fragt das Skript 2x nach dem Deploy-Passwort (scp + ssh).
#
# Eigene Werte in deploy-nas.config.ps1 speichern (wird nie in Git eingecheckt).

$NasIp     = "192.168.178.250"
$NasUser   = "Deploy"
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
Write-Host "=== Komplizen Protokolle - Deploy auf NAS ===" -ForegroundColor Cyan
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

# ── Wiederholung bei abgerissener Verbindung ────────────────────────────────
# Die NAS schliesst eine SSH-Sitzung gelegentlich direkt nach der Anmeldung
# ("Connection closed by ... port 22"), vor allem wenn kurz hintereinander
# mehrere Deploys laufen. Das ist kein Fehler im Deploy und kein falsches
# Passwort - beim naechsten Versuch geht es meist. Frueher brach hier der
# ganze Lauf ab und das 479-MB-Archiv wurde weggeworfen; jetzt wird gewartet
# und wiederholt. Jeder Versuch fragt das Passwort erneut.
function Invoke-MitWiederholung {
    param(
        [scriptblock]$Befehl,
        [string]$Was,
        [int[]]$Wartezeiten = @(5, 15)
    )
    for ($i = 0; $i -le $Wartezeiten.Count; $i++) {
        & $Befehl
        if ($LASTEXITCODE -eq 0) { return $true }
        if ($i -lt $Wartezeiten.Count) {
            $s = $Wartezeiten[$i]
            Write-Host "      $Was fehlgeschlagen - neuer Versuch in $s Sekunden ($($i + 2). von $($Wartezeiten.Count + 1))" -ForegroundColor DarkYellow
            Start-Sleep -Seconds $s
        }
    }
    return $false
}

# [3/4] Upload zur NAS
# -O erzwingt das klassische SCP-Protokoll (Synology hat kein SFTP-Subsystem aktiv)
Write-Host "[3/4] Upload zur NAS (SCP)..." -ForegroundColor Yellow
$hochgeladen = Invoke-MitWiederholung -Was "Upload" -Befehl {
    scp -O $TarFile "${NasUser}@${NasIp}:${TempNas}"
}
if (-not $hochgeladen) {
    Remove-Item $TarFile -ErrorAction SilentlyContinue
    Write-Host ""
    Write-Host "Upload fehlgeschlagen." -ForegroundColor Red
    Write-Host "  Port 22 erreichbar?   Test-NetConnection $NasIp -Port 22" -ForegroundColor Gray
    Write-Host "  Sperrt die NAS?       DSM > Systemsteuerung > Sicherheit > Schutz (Auto-Block)" -ForegroundColor Gray
    Write-Host "  Sonst: ein paar Minuten warten und update.ps1 erneut aufrufen." -ForegroundColor Gray
    exit 1
}
Write-Host "      fertig" -ForegroundColor Green

# [4/4] Container auf der NAS tauschen via SSH
Write-Host "[4/4] Container aktualisieren (SSH)..." -ForegroundColor Yellow
$DK = "/usr/local/bin/docker"
$remoteCmd = @"
set -e
echo '[NAS] Stoppe laufenden Container...'
sudo $DK stop komplizen-protokolle 2>/dev/null || true
sudo $DK rm   komplizen-protokolle 2>/dev/null || true
echo '[NAS] Lade neues Image...'
sudo $DK load -i $TempNas
echo '[NAS] Raeume veraltete Images auf...'
sudo $DK image prune -f 2>/dev/null || true
echo '[NAS] Pruefe docker-compose.yml auf fehlende Werte...'
DC="$NasPath/docker-compose.yml"
if ! grep -q SYNOLOGY_URL "`$DC" 2>/dev/null; then
  while IFS= read -r line; do
    if echo "`$line" | grep -q PUBLIC_URL:; then
      echo '      SYNOLOGY_URL:        "http://192.168.178.250:5000"'
    fi
    echo "`$line"
  done < "`$DC" > /tmp/_dc_new.yml && mv /tmp/_dc_new.yml "`$DC"
  echo '[NAS] SYNOLOGY_URL in docker-compose.yml hinzugefuegt.'
fi
echo '[NAS] Starte Container...'
cd $NasPath && sudo $DK compose up -d
echo '[NAS] Loesche temporaere Datei...'
rm -f $TempNas
echo '[NAS] Warte auf den Server...'
# "compose up -d" meldet Erfolg, sobald der Container LAEUFT – nicht, wenn der
# Server auch antwortet. Stirbt er beim Start (am 26.11.2026 wegen eines
# versehentlich mitgebauten server/node_modules), stand hier trotzdem
# "Fertig", und der Fehler zeigte sich erst im Browser. Deshalb nachsehen.
ok=0
for i in 1 2 3 4 5 6 7 8 9 10; do
  if sudo $DK exec komplizen-protokolle node -e "require('http').get('http://127.0.0.1:3000/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))" 2>/dev/null; then
    ok=1; break
  fi
  sleep 2
done
if [ "`$ok" != "1" ]; then
  echo '[NAS] FEHLER: Der Server antwortet nicht. Letzte Zeilen aus dem Container:'
  sudo $DK logs --tail 30 komplizen-protokolle 2>&1 || true
  exit 1
fi
echo '[NAS] Server antwortet.'
echo '[NAS] Fertig.'
"@

# Windows-Zeilenenden (CRLF) auf Unix (LF) umstellen, sonst stolpert bash
$remoteCmd = $remoteCmd -replace "`r`n", "`n"

# Skript per stdin uebergeben (nicht als Argument) – vermeidet PowerShell-Quoting-Probleme
# Der entfernte Teil ist wiederholbar: stop/rm schlucken Fehler, load
# ueberschreibt, "compose up -d" baut den Container neu. Ein zweiter Lauf nach
# einer abgerissenen Verbindung richtet also keinen Schaden an.
$getauscht = Invoke-MitWiederholung -Was "Containerwechsel" -Befehl {
    $remoteCmd | ssh -T "${NasUser}@${NasIp}"
}
if (-not $getauscht) {
    Remove-Item $TarFile -ErrorAction SilentlyContinue
    Write-Host ""
    Write-Host "Der Containerwechsel ist fehlgeschlagen." -ForegroundColor Red
    Write-Host "  Stand der App:  Test-NetConnection $NasIp -Port 3000" -ForegroundColor Gray
    Write-Host "  Das Archiv liegt noch auf der NAS unter $TempNas." -ForegroundColor Gray
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
