# Komplizen Protokolle

Besprechungsprotokoll-Tool für Bauprojekte – Baubesprechungen, Jour-Fixe, Projektbesprechungen.

**Stack:** React 18 · Vite · Tailwind CSS v3 · Express/SQLite (Server-Modus) · Electron (optional)

---

## Schnellstart (Entwicklung)

```bash
npm install
npm run dev              # Web-Version im Browser (localStorage)
npm run electron:dev     # Electron-Version (Desktop)
```

## Server-Modus (Docker / Windows)

Mehrbenutzer-Betrieb mit SQLite-Backend, Session-Token-Authentifizierung (8h TTL) und Live-Updates per SSE.

**Windows-Schnellstart:**
```powershell
# SMTP-Zugangsdaten in start-local.config.ps1 eintragen (Vorlage: start-local.config.example.ps1)
.\start-local.ps1
```
Das Skript baut das Docker-Image, startet den Container und setzt automatisch `PUBLIC_URL`
auf die Windows-LAN-IP – damit enthalten Einladungs-E-Mails den richtigen Link.

**Synology / Linux:**  
Siehe `SYNOLOGY.md` für vollständige Deployment-Anleitung mit `docker-compose.yml`.

**Ersten Admin-Benutzer anlegen** (nach erstem Start):
```bash
curl -s -X POST http://<server-ip>:3000/api/auth/users \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","displayName":"Administrator","password":"SicheresPasswort!","role":"admin"}'
```

## Build (Produktion / Electron)

```bash
npm run electron:build:win   # Windows NSIS + Portable
npm run electron:build:mac   # macOS DMG + ZIP
```

---

## Verschlüsselung (Punkt 1)

Passwortgeschützte Projekte werden mit **AES-256-GCM** verschlüsselt (Schlüsselableitung per PBKDF2, 310.000 Iterationen, SHA-256). Kontaktdaten verlassen den Arbeitsspeicher nie unverschlüsselt – nur das Chiffrat wird in `projects.json` / localStorage gespeichert.

**Wichtig:** Bei verlorenem Passwort sind die Kontaktdaten unwiederbringlich verloren. Es gibt keine Wiederherstellung.

Bestehende Projekte mit SHA-256-Passwort-Hash werden beim ersten Login automatisch auf AES-GCM migriert.

---

## Maßnahmen-Dashboard (Punkt 2)

Erreichbar über den **„Dashboard"**-Button auf der Startseite. Zeigt alle Maßnahmen (actionItems) aus sämtlichen Protokollen und Projekten in einer tabellarischen Übersicht.

- Filter: Projekt, Status, Zuständig, „Nur offene", „Nur überfällige"
- Sortierung: Überfällige zuerst, dann Frist aufsteigend
- Klick auf eine Zeile öffnet das zugehörige Protokoll

---

## Microsoft Graph einrichten (Punkt 3)

Die Graph-Integration ist **nur in der Electron-Desktop-Version** aktiv. Die Web-Version nutzt immer den `mailto:`-Fallback.

### Azure App Registration anlegen

1. Öffne das [Azure-Portal](https://portal.azure.com) → **Microsoft Entra ID** → **App-Registrierungen** → „Neue Registrierung"
2. Name: z. B. `Komplizen Protokolle`
3. Unterstützte Kontotypen: „Konten in einem beliebigen Organisationsverzeichnis und persönliche Microsoft-Konten" (oder nur Ihres Tenants)
4. **Umleitungs-URI** (exakt so eintragen):
   - Plattform: **Öffentlicher Client/nativ (Mobil und Desktop)**
   - URI: **`msprotokoll://auth`**
5. Registrieren – notiere die **Anwendungs-ID (Client-ID)**

### API-Berechtigungen

Unter **API-Berechtigungen** → „Berechtigung hinzufügen" → Microsoft Graph → Delegiert:

| Berechtigung          | Zweck                          |
|-----------------------|-------------------------------|
| `Mail.Send`           | Agenda und Protokoll versenden |
| `Calendars.ReadWrite` | Folgetermin anlegen            |
| `User.Read`           | Angemeldeten Nutzer anzeigen   |

Berechtigungen für den Mandanten erteilen (Admin-Consent) oder Nutzer beim ersten Login zustimmen lassen.

### Konfiguration

**Entwicklung** – lege eine `.env`-Datei im Projektverzeichnis an (Vorlage: `.env.example`):

```env
GRAPH_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
GRAPH_TENANT_ID=common
GRAPH_REDIRECT_URI=msprotokoll://auth
```

**Produktion / Endnutzer** – lege eine Datei `graph.config.json` im App-Datenordner an:
- Windows: `%APPDATA%\Komplizen Protokolle\graph.config.json`
- macOS: `~/Library/Application Support/Komplizen Protokolle/graph.config.json`

```json
{
  "clientId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "tenantId": "common",
  "redirectUri": "msprotokoll://auth"
}
```

### Funktionen (nach Login)

| Funktion | Wo |
|----------|-----|
| Agenda per Outlook senden | Protokoll-Editor → „Agenda versenden" → „Via Outlook senden" |
| Folgetermin im Kalender anlegen | Protokoll-Editor → „Agenda versenden" → „Termin anlegen" |
| Protokoll als Word per Outlook versenden | Protokoll-Editor → „Per E-Mail"-Button (neben „Word") |

**Fehlerbehandlung:** Schlägt die Graph-Anfrage fehl (kein Login, abgelaufenes Token, API-Fehler), erscheint eine deutsche Fehlermeldung mit Fallback auf das lokale E-Mail-Programm.

### Token-Cache

Zugriffstoken werden mit **Electron safeStorage** (OS-Keychain / Credential Manager) verschlüsselt in `graph_token.enc` im App-Datenordner gespeichert. Kein Klartext auf der Festplatte.

---

## PWA (Progressive Web App)

Die App kann als Desktop-App installiert werden (ohne Electron):
- **Edge:** Installieren-Button erscheint direkt in der Adressleiste (funktioniert auch ohne HTTPS im LAN)
- **Chrome:** Benötigt HTTPS oder `localhost`; Workaround über `chrome://flags/#unsafely-treat-insecure-origin-as-secure`

Die Einladungs-E-Mail enthält Installationsanleitung für beide Browser.

---

## Datei-Struktur (wichtige Module)

```
electron/
  main.js          Hauptprozess – IPC, Protokoll-Handler, Auto-Updater
  preload.js       Secure Bridge (contextBridge)
  msalAuth.js      MSAL Auth Code + PKCE Flow, Token-Cache (Punkt 3)
  graphClient.js   Graph API Calls: sendMail, createCalendarEvent (Punkt 3)

src/
  crypto.js        PBKDF2 + AES-GCM (Punkt 1)
  App.jsx          Haupt-Routing, Crypto-State, Dashboard-View
  components/
    ProjectsHome.jsx        Startseite mit Dashboard-Button
    MassnahmenDashboard.jsx Maßnahmen-Übersicht (Punkt 2)
    AgendaEmailModal.jsx    Agenda-Versand (mailto + Graph)
    ProtocolEditor.jsx      Protokoll-Editor mit Graph-Send
```
