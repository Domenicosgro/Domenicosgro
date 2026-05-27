# Komplizen Protokolle - Lokale Konfiguration
# Diese Datei als "start-local.config.ps1" speichern.
# start-local.config.ps1 wird von Git ignoriert und nie ueberschrieben.

# ── E-Mail / SMTP (Microsoft 365) ─────────────────────────────────────────────
$SmtpHost   = "smtp.office365.com"
$SmtpPort   = "587"
$SmtpUser   = "d.sgro@ghbarchitekten.de"
$SmtpPass   = ""               # <-- Passwort hier eintragen
$SmtpFrom   = "d.sgro@ghbarchitekten.de"
$SmtpSecure = "false"
