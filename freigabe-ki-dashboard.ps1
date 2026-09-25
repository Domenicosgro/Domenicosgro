# -----------------------------------------------------------------------------
#  KI-Rechner fuer das Komplizen-Dashboard freigeben
#  Auf dem Rechner ausfuehren, auf dem LM Studio laeuft (Genbauer/HS).
#  ALS ADMINISTRATOR starten - die Firewall-Regel braucht erhoehte Rechte.
#
#  Das Skript prueft erst, legt dann die Firewall-Regel an und sagt am Ende
#  klar, ob noch etwas von Hand zu tun ist. Mehrfaches Ausfuehren ist gefahrlos.
#
#  HINWEIS ZUR KODIERUNG: Bewusst reines ASCII (ae/oe/ue statt Umlauten),
#  damit es in Windows PowerShell 5.1 ohne Encoding-Probleme laeuft - so wie
#  die uebrigen .ps1-Skripte im Projekt.
# -----------------------------------------------------------------------------

$Port      = 1234                      # LM Studio Standard (Ollama waere 11434)
$Subnetz   = '192.168.178.0/24'        # nur das Buero-LAN, nicht das ganze Internet
$RegelName = 'Komplizen KI (LM Studio) - Dashboard-Zugriff'

$ErrorActionPreference = 'Stop'
function Titel($t) { Write-Host ""; Write-Host "-- $t " -ForegroundColor Cyan -NoNewline; Write-Host ("-" * [Math]::Max(0, 60 - $t.Length)) -ForegroundColor DarkCyan }
function Gut($t)   { Write-Host "  [ok]   $t" -ForegroundColor Green }
function Warn($t)  { Write-Host "  [!]    $t" -ForegroundColor Yellow }
function Fehl($t)  { Write-Host "  [XX]   $t" -ForegroundColor Red }
function Info($t)  { Write-Host "         $t" -ForegroundColor Gray }

Write-Host ""
Write-Host "  KI-Rechner fuer das Dashboard freigeben" -ForegroundColor White
Write-Host "  Port $Port, Zugriff nur aus $Subnetz" -ForegroundColor DarkGray

# -- 1. Administratorrechte ---------------------------------------------------
Titel "1. Rechte"
$istAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
            ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if ($istAdmin) { Gut "Als Administrator gestartet." }
else {
  Fehl "KEINE Administratorrechte."
  Info "PowerShell mit Rechtsklick -> 'Als Administrator ausfuehren' erneut oeffnen."
  Info "Die Diagnose laeuft trotzdem durch, die Firewall-Regel wird uebersprungen."
}

# -- 2. Horcht ueberhaupt etwas auf dem Port? ---------------------------------
Titel "2. Laeuft der LM-Studio-Server?"
$listen = @(Get-NetTCPConnection -LocalPort $Port -State Listen -EA SilentlyContinue)
$nurLokal = $false

if (-not $listen) {
  Fehl "Auf Port $Port horcht nichts."
  Info "LM Studio oeffnen -> Reiter 'Developer' -> 'Start Server'."
  Info "Alternativ in der Kommandozeile:  lms server start --port $Port"
} else {
  foreach ($l in $listen) {
    $proz = try { (Get-Process -Id $l.OwningProcess -EA Stop).ProcessName } catch { 'unbekannt' }
    Info "$($l.LocalAddress):$($l.LocalPort)  <- $proz (PID $($l.OwningProcess))"
  }
  $adressen = $listen.LocalAddress
  if ($adressen -contains '0.0.0.0' -or $adressen -contains '::') {
    Gut "Der Server horcht auf ALLEN Netzwerkkarten - im Netz grundsaetzlich erreichbar."
  } elseif ($adressen -contains '127.0.0.1' -or $adressen -contains '::1') {
    $nurLokal = $true
    Fehl "Der Server horcht NUR auf localhost. Vom Netz aus ist er unsichtbar."
    Info "In LM Studio: Reiter 'Developer' -> Haken bei 'Serve on Local Network' setzen,"
    Info "dann den Server einmal stoppen und neu starten."
  } else {
    Warn "Ungewoehnliche Bindung - bitte die Adressen oben pruefen."
  }
}

# -- 3. Firewall-Regel --------------------------------------------------------
Titel "3. Firewall"
if ($istAdmin) {
  $alt = Get-NetFirewallRule -DisplayName $RegelName -EA SilentlyContinue
  if ($alt) { $alt | Remove-NetFirewallRule; Info "Vorhandene Regel entfernt (wird neu angelegt)." }

  New-NetFirewallRule -DisplayName $RegelName `
      -Description  'Erlaubt dem Komplizen-Dashboard den Zugriff auf das lokale Sprachmodell.' `
      -Direction    Inbound `
      -Protocol     TCP `
      -LocalPort    $Port `
      -Action       Allow `
      -Profile      Private,Domain `
      -RemoteAddress $Subnetz | Out-Null
  Gut "Regel angelegt: TCP $Port eingehend, nur aus $Subnetz, nur in privaten Netzen."
  Info "Oeffentliche Netze (Hotspot, fremdes WLAN) bleiben bewusst gesperrt."
} else {
  Warn "Uebersprungen - ohne Administratorrechte nicht moeglich."
}

# -- 4. Netzwerkprofil pruefen ------------------------------------------------
Titel "4. Netzwerkprofil"
$profile = Get-NetConnectionProfile | Where-Object { $_.IPv4Connectivity -ne 'Disconnected' }
foreach ($p in $profile) {
  if ($p.NetworkCategory -eq 'Public') {
    Warn "'$($p.Name)' ist als OEFFENTLICH eingestuft - die Regel greift dort nicht."
    Info "Umstellen: Einstellungen -> Netzwerk -> Eigenschaften -> 'Privates Netzwerk'"
    Info "oder:  Set-NetConnectionProfile -InterfaceIndex $($p.InterfaceIndex) -NetworkCategory Private"
  } else {
    Gut "'$($p.Name)' ist $($p.NetworkCategory) - passt."
  }
}

# -- 5. Funktionsprobe --------------------------------------------------------
Titel "5. Probe"
# Auf das konkrete Buero-Subnetz eingegrenzt (192.168.178.*), damit nicht
# versehentlich eine virtuelle Adapter-IP (Hyper-V/WSL/Docker) erwischt wird.
$meineIp = (Get-NetIPAddress -AddressFamily IPv4 |
            Where-Object { $_.IPAddress -like '192.168.178.*' } |
            Select-Object -First 1).IPAddress

try {
  $r = Invoke-RestMethod -Uri "http://localhost:$Port/v1/models" -TimeoutSec 8
  $modelle = @($r.data.id)
  Gut "Der Server antwortet lokal. Geladene Modelle:"
  $modelle | ForEach-Object { Info "- $_" }
} catch {
  Fehl "Der Server antwortet nicht einmal lokal - er laeuft nicht oder kein Modell ist geladen."
}

# Hinweis: Dieser Selbsttest ueber die eigene IP kann auch dann gruen sein, wenn
# ein FREMDER Rechner (Firewall/Bindung) noch nicht durchkommt. Verbindliche
# Gegenprobe ist der curl-Aufruf vom anderen Rechner am Ende.
if ($meineIp -and -not $nurLokal) {
  try {
    Invoke-RestMethod -Uri "http://${meineIp}:$Port/v1/models" -TimeoutSec 8 | Out-Null
    Gut "Auch ueber die Netzwerkadresse erreichbar: http://${meineIp}:$Port/v1"
  } catch {
    Warn "Ueber http://${meineIp}:$Port nicht erreichbar - Bindung oder Firewall pruefen."
  }
}

# -- Ergebnis -----------------------------------------------------------------
Titel "Ergebnis"
if ($nurLokal) {
  Write-Host "  Noch NICHT fertig." -ForegroundColor Yellow
  Write-Host "  In LM Studio 'Serve on Local Network' einschalten, Server neu starten," -ForegroundColor Yellow
  Write-Host "  danach dieses Skript noch einmal laufen lassen." -ForegroundColor Yellow
} elseif (-not $listen) {
  Write-Host "  Noch NICHT fertig - der LM-Studio-Server laeuft nicht." -ForegroundColor Yellow
} else {
  Write-Host "  Freigabe steht." -ForegroundColor Green
  Write-Host "  Endpunkt fuer das Dashboard:  http://${meineIp}:$Port/v1" -ForegroundColor Green
}
Write-Host ""
Info "Gegenprobe von einem anderen Rechner im Buero:"
Info "  curl http://${meineIp}:$Port/v1/models"
Write-Host ""
