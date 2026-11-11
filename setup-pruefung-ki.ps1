# setup-pruefung-ki.ps1
# Schaltet in der Pruefstation die Pruefung mit Claude ein - einmalig.
#
#   1. entpackt die Skills (skills_pruefung_ghba.zip) in den Skill-Ordner auf
#      der NAS (Standard: G:\01 Projekte\_Pruefstation\Skills)
#   2. traegt ANTHROPIC_API_KEY und PRUEF_SKILLS_PFAD in die docker-compose.yml
#      auf der NAS ein (vorher Sicherungskopie)
#   3. erstellt den Container neu und prueft, ob die NAS die Claude API mit
#      diesem Schluessel erreicht
#
# Der Schluessel wird verdeckt abgefragt und steht danach NUR in der
# docker-compose.yml auf der NAS - nicht in Git, nicht auf diesem PC.
# Schluessel anlegen: https://console.anthropic.com -> API Keys
#
# Aufruf:  .\setup-pruefung-ki.ps1 -SkillsZip "C:\Users\DS\Downloads\skills_pruefung_ghba.zip"
#
# Skript ist reines ASCII (PowerShell 5.1).

param(
    [string]$SkillsZip   = "",
    [string]$SkillsZiel  = "G:\01 Projekte\_Pruefstation\Skills",
    [string]$SkillsNas   = "/DriveShare/01 Projekte/_Pruefstation/Skills"
)

$NasIp   = "192.168.178.250"
$NasUser = "Deploy"
$NasPath = "/volume1/docker/komplizen-protokolle"

$ConfigFile = Join-Path $PSScriptRoot "deploy-nas.config.ps1"
if (Test-Path $ConfigFile) { . $ConfigFile }

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=== Pruefstation - Pruefung mit Claude einschalten ===" -ForegroundColor Cyan
Write-Host "  NAS:          $NasUser@$NasIp" -ForegroundColor Gray
Write-Host "  Skill-Ordner: $SkillsNas" -ForegroundColor Gray
Write-Host ""

# [1] Skills entpacken
if ($SkillsZip) {
    if (-not (Test-Path $SkillsZip)) { Write-Error "ZIP nicht gefunden: $SkillsZip"; exit 1 }
    Write-Host "[1/3] Skills nach $SkillsZiel entpacken..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Force -Path $SkillsZiel | Out-Null
    Expand-Archive -Path $SkillsZip -DestinationPath $SkillsZiel -Force
    foreach ($s in @("nachtragspruefung", "rechnungspruefung")) {
        if (-not (Test-Path (Join-Path $SkillsZiel "$s\SKILL.md"))) {
            Write-Host "      Hinweis: $s\SKILL.md fehlt im Ziel - ZIP-Aufbau pruefen." -ForegroundColor DarkYellow
        }
    }
    Write-Host "      fertig" -ForegroundColor Green
} else {
    Write-Host "[1/3] Skills: kein -SkillsZip angegeben, Ordner bleibt wie er ist." -ForegroundColor Gray
}

# [2] Schluessel verdeckt abfragen
$sec = Read-Host "Anthropic API-Schluessel (sk-ant-...)" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
$key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
$key = $key.Trim()
if ($key -notmatch '^sk-ant-[A-Za-z0-9_-]+$') { Write-Error "Das sieht nicht nach einem Anthropic-Schluessel aus (sk-ant-...)."; exit 1 }
if ($SkillsNas -notmatch '^/[^''"\\]+$') { Write-Error "Ungueltiger Skill-Pfad: $SkillsNas"; exit 1 }

$remote = @"
#!/bin/bash
set -e
trap 'rm -f /tmp/kp-setup-ki.sh' EXIT
KEY='$key'
SKP='$SkillsNas'
DC='$NasPath/docker-compose.yml'
DK=/usr/local/bin/docker

echo '[NAS 1/3] docker-compose.yml...'
[ -f "`$DC" ] || { echo "          FEHLER: `$DC fehlt."; exit 1; }
grep -q '^[[:space:]]*SYNOLOGY_URL:' "`$DC" || { echo '          FEHLER: SYNOLOGY_URL fehlt in der docker-compose.yml.'; exit 1; }
cp "`$DC" "`$DC.bak-`$(date +%Y%m%d-%H%M%S)"
sed -i '/^[[:space:]]*#\{0,1\}[[:space:]]*ANTHROPIC_API_KEY:/d;/^[[:space:]]*#\{0,1\}[[:space:]]*PRUEF_SKILLS_PFAD:/d' "`$DC"
awk -v k="`$KEY" -v s="`$SKP" '
  { print }
  /^[[:space:]]*SYNOLOGY_URL:/ && !done {
    match(`$0, /^[[:space:]]*/); ind = substr(`$0, 1, RLENGTH)
    print ind "ANTHROPIC_API_KEY:   \"" k "\""
    print ind "PRUEF_SKILLS_PFAD:   \"" s "\""
    done = 1
  }' "`$DC" > /tmp/_dc_new.yml
cat /tmp/_dc_new.yml > "`$DC" && rm -f /tmp/_dc_new.yml
echo "          eingetragen (Sicherung: `$DC.bak-*)"

echo '[NAS 2/3] Container neu erstellen...'
cd '$NasPath' && `$DK compose up -d --force-recreate

echo '[NAS 3/3] Erreicht die NAS die Claude API?'
CODE=`$(curl -s -m 15 -o /dev/null -w '%{http_code}' -H "x-api-key: `$KEY" -H 'anthropic-version: 2023-06-01' https://api.anthropic.com/v1/models || echo 000)
case "`$CODE" in
  200) echo '          OK - Schluessel gueltig, Verbindung steht.' ;;
  401) echo '          WARNUNG: Schluessel ungueltig (401).' ;;
  403) echo '          WARNUNG: Schluessel ohne Berechtigung (403).' ;;
  000) echo '          WARNUNG: api.anthropic.com nicht erreichbar - Internetzugang/Firewall der NAS pruefen.' ;;
  *)   echo "          WARNUNG: unerwartete Antwort `$CODE." ;;
esac

for i in `$(seq 1 20); do
  if curl -s -m 3 http://127.0.0.1:3000/api/health | grep -q '"ok"'; then echo '[NAS] Container laeuft.'; exit 0; fi
  sleep 3
done
echo '[NAS] WARNUNG: /api/health antwortet noch nicht - Container-Log pruefen.'
"@

$remote = $remote -replace "`r`n", "`n"
$tmp = Join-Path $env:TEMP "kp-setup-ki.sh"
[System.IO.File]::WriteAllText($tmp, $remote, (New-Object System.Text.UTF8Encoding($false)))

try {
    Write-Host "[2/3] Skript zur NAS kopieren (SCP)..." -ForegroundColor Yellow
    scp -O $tmp "${NasUser}@${NasIp}:/tmp/kp-setup-ki.sh"
    if ($LASTEXITCODE -ne 0) { Write-Error "Upload fehlgeschlagen - SSH erreichbar?"; exit 1 }

    Write-Host "[3/3] Einrichtung auf der NAS (sudo-Passwort von $NasUser eingeben)..." -ForegroundColor Yellow
    Write-Host "      Hinweis: Beim Tippen erscheinen keine Zeichen - Passwort blind eingeben, dann Enter." -ForegroundColor Gray
    ssh -t "${NasUser}@${NasIp}" "chmod 600 /tmp/kp-setup-ki.sh; sudo bash /tmp/kp-setup-ki.sh; rc=`$?; rm -f /tmp/kp-setup-ki.sh; exit `$rc"
    if ($LASTEXITCODE -ne 0) { Write-Error "Einrichtung auf der NAS fehlgeschlagen (Ausgabe oben)."; exit 1 }
}
finally {
    Remove-Item $tmp -ErrorAction SilentlyContinue
    $key = $null
}

Write-Host ""
Write-Host "=== Pruefung mit Claude eingeschaltet ===" -ForegroundColor Cyan
Write-Host "  Jetzt .\update.ps1 (falls noch nicht geschehen), dann in der Pruefstation 'Pruefung starten'." -ForegroundColor Green
Write-Host ""
