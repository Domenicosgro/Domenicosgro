# Komplizen Protokolle – Projektdokumentation

> **Besprechungsprotokoll-Tool für Bauprojekte.**
> Eigenständige Web-App, die als **eine Anwendung innerhalb eines Synology-Dashboards**
> (mehrere Einzelanwendungen unter einem Dach) betrieben wird.

---

## 0. Einordnung in das Synology-Dashboard (Zielarchitektur)

Die NAS hostet künftig **mehrere unabhängige Container-Anwendungen** hinter einem
zentralen Dashboard/Reverse-Proxy. Das Protokolltool (`komplizen-protokolle`) ist
**eine dieser Anwendungen** – vollständig in sich geschlossen, mit eigener
Datenbank, eigenem Container und eigenem Volume.

```
                          ┌─────────────────────────────┐
   Browser / PWA  ───────▶│  Synology Reverse Proxy      │   (DSM > Anmeldeportal >
   (LAN / VPN)            │  bzw. Dashboard-Container     │    Reverse Proxy, Port 443)
                          └──────────────┬──────────────┘
                                         │  routet nach Host/Pfad
              ┌──────────────────────────┼──────────────────────────┐
              ▼                          ▼                          ▼
   ┌────────────────────┐    ┌────────────────────┐    ┌────────────────────┐
   │ komplizen-protokolle│    │  app-zwei          │    │  app-drei          │
   │  :3000             │    │  :3001             │    │  :3002             │
   │  /data /logs       │    │  …                 │    │  …                 │
   └────────────────────┘    └────────────────────┘    └────────────────────┘
        (dieses Repo)            (eigenes Repo)            (eigenes Repo)
```

**Designprinzipien für das Dashboard-Ökosystem:**

| Prinzip | Umsetzung im Protokolltool |
|---|---|
| **Ein Container pro App** | Eigenes Image `komplizen-protokolle:latest`, eigener Container-Name |
| **Eigenes Datenvolumen** | `/volume1/docker/komplizen-protokolle/{data,logs}` – keine Überschneidung mit anderen Apps |
| **Fester interner Port** | 3000 (jede App bekommt einen eigenen Port; Reverse-Proxy mappt nach außen) |
| **Health-Endpunkt** | `GET /api/health` → vom Dashboard/Reverse-Proxy für Statusanzeige nutzbar |
| **Einheitliche Anmeldung** | **Synology-DSM-Login** (siehe §6) → ein Benutzerverzeichnis für alle Apps |
| **Einheitliches Branding** | System-E-Mails/öffentliche Seiten = **GHBA** (CI-übergreifend) |

> **Wichtig für neue Apps im selben Dashboard:** Diesem Muster folgen –
> eigener Ordner unter `/volume1/docker/<app>/`, eigenes `docker-compose.yml`,
> eigener Port, `GET /api/health`, DSM-Login über die Synology Web-API.

---

## 1. Projekt-Überblick

**App:** Besprechungsprotokoll-Tool für Bauprojekte
**Stack:** React 18 · Vite · Tailwind CSS v3 · Express 5 / better-sqlite3 (Server-Modus) · Electron (optional) · localStorage / IndexedDB / Electron-IPC
**Branch:** `claude/protocol-tool-meetings-tIoZX`
**Push:** immer `git push -u origin claude/protocol-tool-meetings-tIoZX`

**Update/Deploy (Standard-Ablauf):**
```powershell
git fetch origin
git checkout claude/protocol-tool-meetings-tIoZX
git pull origin claude/protocol-tool-meetings-tIoZX
.\deploy-nas.ps1
```

### Betriebsmodi

| Modus | Datenhaltung | Authentifizierung |
|---|---|---|
| **Web/Docker (NAS)** | SQLite via REST-API | **Synology-DSM-Login** + Session-Token (8h TTL) |
| **Electron** | JSON-Dateien via IPC | Microsoft MSAL (optional) |
| **Local-Dev** | localStorage / IndexedDB | keine |

Erkennung im Frontend: `window.__SERVER_MODE__` (von Express injiziert),
`window.electronAPI` (Electron-Preload).

### Zwei Anwendungen und eine Einbettseite, ein Backend

| Anwendung | Einstieg | URL | Bundle |
|---|---|---|---|
| **Protokolltool** | `index.html` → `src/main.jsx` → `App.jsx` | `/` | `assets/index-*.js` |
| **Personalplanung** | `personalplanung.html` → `src/personalplanung/main.jsx` → `PersonalplanungApp.jsx` | `/personalplanung` | `assets/personalplanung-*.js` |
| **Gelände (Dashboard)** | `gelaende.html` → `src/gelaendeEntry.jsx` | `/gelaende?token=…` | `assets/gelaende-*.js` |

Die Personalplanung ist seit 2026-09-11 eine **eigenständige Oberfläche**
(eigene URL, eigene Kopfzeile, eigener Login-Titel, nur Admins), läuft aber
gegen **denselben Server und dieselbe SQLite-Datenbank**. Projektdaten sind
damit ohne Abgleich synchron – `useProjects` inkl. SSE wird geteilt. Sitzung
(`kp_session_token`) und Benutzer sind identisch; die Kachel im Protokolltool
verlinkt nur noch (`window.location.href = '/personalplanung'`).

- Vite baut alle Einstiege (`build.rollupOptions.input` in `vite.config.mjs`);
  ein Deploy, ein Container.
- Express: Route `/personalplanung` (und `.html`) liefert `personalplanung.html`
  mit injizierten Server-Variablen, ein Schrägstrich am Ende wird umgeleitet
  (relative Assets). Die Route steht vor `express.static` und vor dem
  SPA-Fallback.
- Live-Updates: `serverEvents.js` baut die SSE-Verbindung bei `kp-auth-changed`
  neu auf (Token in der URL). Ohne das blieb eine vor dem Login geöffnete
  Verbindung ohne Nutzerzuordnung – Projektereignisse kamen bis zum Neuladen
  nicht an (betraf auch das Protokolltool).
- Im Electron-/Local-Modus gibt es die Personalplanung nicht (sie braucht die
  Staff-API); die Kachel ist dort ausgeblendet.
- Für das Synology-Dashboard: eigenes Modul, Reverse-Proxy-Ziel
  `http://localhost:3000/personalplanung` (gleicher Container).

---

## 2. Dateistruktur (Repository)

```
Domenicosgro/
├── Dockerfile                     # Zweistufig: Vite-Build → schlankes Express-Produktionsimage
├── docker-compose.yml             # NAS-Deployment (/data, /logs als Volumes + ENV-Block)
├── deploy-nas.ps1                 # Ein-Befehl-Deploy auf Synology via SSH (build→save→scp→swap)
├── deploy-nas.config.example.ps1  # Vorlage für NAS-Zugangsdaten (real: .config.ps1, nie committen)
├── start-local.ps1                # Windows-Start: baut Image, startet Container, setzt PUBLIC_URL
├── start-local.config.example.ps1 # Vorlage für lokale SMTP/Graph-Zugangsdaten
├── build-deploy.ps1               # Optionaler Deploy-Build
├── package.json                   # Frontend + Electron-Abhängigkeiten
├── index.html                     # PWA-Einstieg (manifest, sw.js, apple-touch-icon)
├── gelaende.html                  # Vite-Einstieg: einbettbare Gelände-Seite (Dashboard)
├── vite.config.mjs                # erzeugt BUILD_ID → __BUILD_ID__ + dist/version.json
├── tailwind.config.mjs            # borderRadius: 0 (Flat Design)
├── postcss.config.mjs
│
├── public/
│   ├── logo.png                   # Dunkles (K)-Logo → Wasserzeichen, PWA-Icon, Favicon
│   ├── icon.png  · favicon.png
│   ├── manifest.json              # PWA-Manifest (display: standalone)
│   ├── sw.js                      # Service Worker (network-first, Cache-Fallback)
│   ├── de.aff / de.dic            # Deutsche Wörterbücher für nspell
│
├── src/                           # Frontend (React)
│   ├── App.jsx                    # Routing über view-State (home|protocols|editor|…)
│   ├── main.jsx                   # React-Einstieg
│   ├── index.css                  # Design-System (Tailwind-Components + Print-CSS + Wasserzeichen)
│   ├── utils.js                   # Datenmodelle, Helper
│   ├── crypto.js                  # AES-GCM Verschlüsselung für Projektkontakte
│   ├── attachmentStore.js         # Anhang-Abstraktion: IndexedDB (Web) / userData (Electron)
│   ├── serverEvents.js            # SSE-Client für Live-Updates
│   ├── exportDocx.js              # Word-Export einzelne Protokolle
│   ├── exportParticipantsList.js  # Word-Export Beteiligtenliste (7 Spalten)
│   ├── spellcheck.worker.js       # nspell Deutsch (Web Worker)
│   ├── gelaendeEntry.jsx          # Einstieg der eingebetteten Gelände-Seite (/gelaende)
│   │
│   ├── gelaende/                  # Gelände-Darstellung (Muster des Komplizen-Dashboards)
│   │   ├── hex.js                 # Hex-Mathematik, Auto-Platzierung, BFS-Wegfindung
│   │   ├── layout.js              # Quartiere, Farbfamilien, Parzellen, Deko, Zielwaben
│   │   └── engine.js              # Three.js: Waben, Bauzustände, Figuren, Agenten, Kamera
│   │
│   ├── components/
│   │   ├── ProjectsHome.jsx       # Startseite: Projektliste, Favoriten, PWA-Install, Import, Admin-Kachel
│   │   ├── ProjectAdminPanel.jsx  # Projekt-Admin-Panel (Co-Admins, Autoren, Freimelde-Links) – wiederverwendbar
│   │   ├── ProjectManager.jsx     # Kontaktverwaltung (Gewerk-Spalte, Sort, Drag & Drop, CSV)
│   │   ├── ProjectDashboard.jsx   # Projekt-Übersicht (Kacheln: Phasen, Kontakte, Notizen, Maßnahmen, Admin)
│   │   ├── ContactDatabase.jsx    # Projektübergreifende Kontaktdatenbank
│   │   ├── TileSidebar.jsx        # Schnellzugriff-Kacheln (Dokument-/URL-Links) im Editor
│   │   ├── BeteiligtenModal.jsx   # Projektbeteiligtenliste (Druck, Excel, Word)
│   │   ├── ProtocolList.jsx       # Protokollliste eines Projekts (+ updatedBy, Projekt-Export)
│   │   ├── ProtocolEditor.jsx     # Protokoll-Editor (Hauptkomponente)
│   │   ├── MeetingHeader.jsx      # Metadaten (Datum, Ort, Vorgänger, Projektlink)
│   │   ├── ParticipantsList.jsx   # Teilnehmerliste im Protokoll (ein-/ausblendbar)
│   │   ├── AgendaDraft.jsx        # Tagesordnungs-Entwurf (hierarchisch)
│   │   ├── AgendaEmailModal.jsx   # Agenda per E-Mail versenden
│   │   ├── AgendaItems.jsx        # Agenda-Punkte-Liste
│   │   ├── ProtocolItems.jsx      # Protokollpunkte (rich text, Drag & Drop, Anhänge)
│   │   ├── ActionItems.jsx        # Maßnahmen/Aufgaben-Liste (+ Freimeldung-Badge)
│   │   ├── FreimeldungBadge.jsx   # Badge + Modal für Aufgaben-Freimeldungen (Server-Modus)
│   │   ├── MassnahmenDashboard.jsx# Projektübergreifende Maßnahmen + Aufgaben-E-Mail-Versand
│   │   ├── PersonalplanungView.jsx# Personalplanung (Wochenraster, Mitarbeiter, Teams, Gelände)
│   │   ├── PersonalplanungGelaende.jsx # Gelände-Ansicht: Karte + Liste + Wochenregler
│   │   ├── NotesSection.jsx       # Allgemeine Bemerkungen (rich text) im Protokoll
│   │   ├── NotesList.jsx          # Akten- und Telefonnotizen (projektbezogen)
│   │   ├── RichTextEditor.jsx     # Tiptap-Editor (Bold/Italic/Underline/Strike/Listen)
│   │   ├── SpellCheckTextarea.jsx # Textarea mit Rechtschreibprüfung
│   │   ├── GesamtprotokollModal.jsx # Gesamtprotokoll-Druck über Vorgänger-Kette
│   │   ├── ProtocolEmailModal.jsx # Protokoll als PDF-Anhang versenden
│   │   ├── LogoUpload.jsx         # Logo hochladen/löschen
│   │   ├── LoginScreen.jsx        # Login-Maske (Server-Modus, DSM-Login)
│   │   └── AdminPanel.jsx         # Benutzerverwaltung, Synology-Import, E-Mail-Status, Backups
│   │
│   └── hooks/
│       ├── useProtocols.js        # CRUD + syncProjectName + refetchProtocols
│       ├── useProjects.js         # CRUD Projekte + importProject + refetchProjects
│       ├── useNotes.js            # CRUD Aktennotizen
│       ├── useLogo.js             # Logo (localStorage / Electron)
│       ├── useSpellCheck.js       # Rechtschreibprüfung (Web Worker)
│       └── useUserSettings.js     # Benutzereinstellungen + Favoriten (Server-Modus)
│
├── server/                        # Backend (Express 5)
│   ├── index.js                   # REST-API, Auth, E-Mail, SSE, Scheduler, statische Auslieferung
│   ├── db.js                      # better-sqlite3 Setup + Migrationen (DB_PATH-aware)
│   ├── auth.js                    # Session-Token-Authentifizierung (opak, 8h TTL), Token-Generator
│   ├── synologyAuth.js            # Synology-DSM Web-API: Login + Admin-Gruppen-Check + User-Liste
│   ├── mailer.js                  # E-Mail-Abstraktion: Microsoft Graph (OAuth2) + SMTP-Fallback
│   ├── attachments.js             # Anhang-Endpunkte (Datei-Upload/-Download im /data-Volume)
│   ├── gelaende.js                # Gelände-Daten je Kalenderwoche (Dashboard-Integration)
│   ├── assistent.js               # Assistent: Routen, Verlauf, SSE zum Browser (§15)
│   ├── kontext.js                 # Rückgriff: Systemkopf aus dem, was die Person sehen darf
│   ├── ki.js                      # Einzige Stelle, die das Dashboard kennt (Weg zur KI-Farm)
│   ├── handbuch.md                # Nutzerhandbuch – Laufzeitdatei, der Assistent liest sie
│   ├── pm2.config.js              # PM2-Konfiguration für direkten Linux-Betrieb (ohne Docker)
│   └── package.json               # Nur Server-Abhängigkeiten (kein Electron, kein Vite)
│
├── pruefungen/                    # Prüfskripte (nicht im Produktionsabbild)
│   └── pruefung-assistent.js      # 75 Prüfungen: Rechtegrenze, Rückgriff, Strom, Fehlerwege
│
└── electron/                      # Desktop-Variante (optional)
    ├── main.js                    # Electron-Hauptprozess
    ├── preload.js                 # IPC-Bridge
    ├── msalAuth.js                # Microsoft-Login (MSAL)
    ├── graphClient.js             # Microsoft Graph API
    ├── icon.ico / icon.icns / icon.svg
    └── make_icons.py
```

---

## 3. Synology-Struktur (NAS-seitig)

### 3.1 Verzeichnislayout auf der NAS

Jede Dashboard-Anwendung bekommt **einen eigenen Ordner** unter `/volume1/docker/`.
Für das Protokolltool:

```
/volume1/docker/
└── komplizen-protokolle/                 # ← App-Wurzel (vom Deploy-Skript adressiert)
    ├── docker-compose.yml                # Container-Definition + ENV (Secrets nur hier, NICHT in Git)
    ├── data/                             # Persistentes Volume → Container /data
    │   ├── komplizen.db                  # SQLite-Hauptdatei
    │   ├── komplizen.db-shm              # SQLite Shared-Memory (WAL-Modus)
    │   ├── komplizen.db-wal              # SQLite Write-Ahead-Log (WAL-Modus)
    │   ├── attachments/                  # Datei-Anhänge der Protokollpunkte (binär)
    │   └── backups/                      # JSON-Backups (über AdminPanel erzeugt)
    └── logs/                             # Persistentes Volume → Container /logs
        └── access-YYYY-MM-DD.log         # Zugriffslog (tagesrotiert)
```

> **Datenmigration PC → NAS / NAS → NAS:** Container stoppen, kompletten
> `data/`-Ordner kopieren (`komplizen.db` **inkl.** `-shm`/`-wal` + `attachments/`),
> Container neu starten. Die WAL-Dateien gehören zwingend mit.

### 3.2 docker-compose.yml (auf der NAS)

```yaml
services:
  komplizen-protokolle:
    image: komplizen-protokolle:latest
    container_name: komplizen-protokolle
    restart: unless-stopped
    ports:
      - "3000:3000"                       # extern:intern – pro App eindeutiger Außenport wählen
    volumes:
      - /volume1/docker/komplizen-protokolle/data:/data
      - /volume1/docker/komplizen-protokolle/logs:/logs
    environment:
      PORT: "3000"
      HOST: "0.0.0.0"
      PUBLIC_URL: "http://192.168.178.250:3000"   # echte LAN-IP/Reverse-Proxy-URL
      DB_PATH: "/data"
      LOG_PATH: "/logs"
      # ── Synology-Anmeldung (gemeinsames Benutzerverzeichnis für alle Dashboard-Apps) ──
      SYNOLOGY_URL: "http://192.168.178.250:5000"  # DSM HTTP=5000, HTTPS=5001
      # SYNOLOGY_ADMIN_GROUP: "administrators"     # DSM-Gruppe → App-Admin
      # SYNOLOGY_ADMIN_USERS: ""                   # Fallback-Adminliste (Komma)
      # SYNOLOGY_USER_GROUPS: "users,Domain Users" # Gruppen für Benutzer-Import
      # ── E-Mail via Microsoft Graph (bevorzugt) – Secrets NUR hier, nie in Git ──
      GRAPH_TENANT_ID:     "…"
      GRAPH_CLIENT_ID:     "…"
      GRAPH_CLIENT_SECRET: "…"
      GRAPH_SENDER:        "Protokoll@ghbarchitekten.de"
      SMTP_FROM:           "Protokoll@ghbarchitekten.de"
      # ── SMTP-Fallback (nur ohne GRAPH_*; mit M365-Sicherheitsstandards gesperrt) ──
      # SMTP_HOST / SMTP_PORT / SMTP_SECURE / SMTP_USER / SMTP_PASS
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 15s
```

> ⚠ **ENV-Änderung:** Container muss **gelöscht und neu erstellt** werden
> („Starten" allein übernimmt neue Variablen nicht).

### 3.3 Reverse-Proxy / Dashboard-Anbindung

Damit alle Apps unter **einer** Adresse erreichbar sind, läuft vor den Containern
der **Synology Reverse Proxy** (DSM → Anmeldeportal → Anwendungsportal → Reverse Proxy):

| Quelle (extern) | Ziel (intern) |
|---|---|
| `https://apps.example.de/protokolle` → | `http://localhost:3000` |
| `https://apps.example.de/<app-zwei>` → | `http://localhost:3001` |

Alternativ Subdomains (`protokolle.example.de` → `:3000`). Das Dashboard selbst
kann eine simple Landing-Page (eigener Container oder statische Seite) sein, die
auf die Einzel-Apps verlinkt und den `/api/health`-Status je App anzeigt.

### 3.4 Deployment-Skript `deploy-nas.ps1`

Ein-Befehl-Deploy, komplett passwortlos via SSH-Key:

```
[1/4] docker build  → komplizen-protokolle:latest
[2/4] docker save   → komplizen-protokolle-deploy.tar
[3/4] scp -O        → /tmp auf der NAS  (Synology hat KEIN SFTP-Subsystem → -O erzwingt klassisches SCP)
[4/4] ssh           → stop · rm · load · image prune · compose up -d · cleanup
```

**NAS-Voraussetzungen (einmalig):**
- Lokaler Benutzer `Deploy` in Gruppe `administrators`, SSH aktiviert
- SSH-Key hinterlegt (`ssh-copy-id`)
- Passwortloses sudo nur für docker:
  `/etc/sudoers.d/deploy-docker` → `Deploy ALL=(ALL) NOPASSWD: /usr/local/bin/docker`
- NAS-Werte (IP/User/Pfad) in `deploy-nas.config.ps1` (nicht in Git)

**Bereits gelöste Stolpersteine (Kommentare im Skript):**
- `scp -O` erzwingt klassisches SCP (kein SFTP auf Synology)
- Here-String per `-replace "\r\n","\n"` von CRLF auf LF (sonst stolpert bash)
- Remote-Befehle nutzen **vollen Pfad** `/usr/local/bin/docker` (non-interaktives
  SSH hat `/usr/local/bin` nicht im PATH → sonst greift NOPASSWD-Regel nicht)
- Skript ist **reines ASCII** (PowerShell 5.1 ANSI-Encoding verträgt keine Umlaute)
- Selbstheilung: fehlt `SYNOLOGY_URL` in der NAS-`docker-compose.yml`, fügt das
  Skript sie automatisch hinter `PUBLIC_URL` ein

### 3.5 Lokaler Test `start-local.ps1`

```powershell
.\start-local.ps1   # ermittelt Windows-LAN-IP, übergibt sie als PUBLIC_URL an den Container
```

> **Warum PUBLIC_URL?** `os.networkInterfaces()` im Container sieht nur die interne
> Bridge-IP (172.17.0.2), **nicht** die Windows-/NAS-LAN-IP. Einladungs-/Freimelde-Links
> brauchen aber die echte Adresse. `getAppUrl(req)` nutzt daher `PUBLIC_URL` vorrangig.

### 3.6 Dockerfile (zweistufig)

1. **Builder** (`node:20-alpine`): `npm ci` → `npm run build` (Vite → `dist/`).
   Build-Tools (`python3 make g++`) für das native `better-sqlite3`.
2. **Produktion** (`node:20-alpine`): nur `server/package.json`-Deps (`--omit=dev`),
   `better-sqlite3` kompiliert, Build-Tools danach entfernt; `server/` + `dist/`
   kopiert; `/data` + `/logs` angelegt; `HEALTHCHECK` auf `/api/health`.

---

## 4. Datenmodelle (utils.js + DB)

### 4.1 SQLite-Tabellen (server/db.js)

| Tabelle | Zweck |
|---|---|
| `protocols` | Protokolle (JSON-Dokument je Zeile, versioniert) |
| `projects` | Projekte inkl. Kontakte/Zugriffsrechte (JSON) |
| `notes` | Akten- und Telefonnotizen |
| `notebooks` | Projekt-Notizbuch (Hauptthemen + Notizen, je Projekt eine Zeile) |
| `users` | Benutzer (bcrypt-Hash, Rolle, E-Mail, Anzeigename, Settings) |
| `sessions` | Opake Session-Token, 8h TTL |
| `reset_requests` | Passwort-Zurücksetzen-Anfragen |
| `deletion_requests` | Projekt-Löschanfragen (Admin-Freigabe per Link) |
| `release_tokens` | Login-freie Freimelde-Links je Verantwortlicher + Projekt |
| `app_state` | Key-Value-Speicher (z.B. Scheduler-Zeitstempel) |
| `store` | Generischer Key-Value-Store (Logo etc.) |
| `chats` | Unterhaltungen mit dem Assistenten (je Benutzer) |
| `chat_messages` | deren Nachrichten inkl. Knoten, Dauer und Fundstellen (`ON DELETE CASCADE`) |

Persistenz im WAL-Modus; `makeStore()` kapselt CRUD + optimistische Versionierung.

### 4.2 Projekt
```js
{
  id, name, contacts: [...],
  passwordHash,                   // Legacy: SHA-256 (vor Verschlüsselung)
  isEncrypted, encryptedContacts, // AES-GCM
  cryptoSalt, cryptoIv,           // PBKDF2-Salt + AES-IV
  projectAdminUser,               // Ersteller (Projekt-Admin, unveränderlich)
  projectAdmins: [...],           // benannte Co-Admins
  isAccessControlled,             // true → nur allowedUsers + Admins
  allowedUsers: [...],            // freigegebene Autoren
  hoaiServices: [...],            // HOAI-Leistungsbilder (optional)
  linkedFolders: [...],           // verknüpfte Synology-Freigabe-Links
  tiles: [...],                   // Schnellzugriff-Kacheln (Editor-Sidebar)
  logo,                           // Büro-/Eigen-Logo (base64) – Fallback auf globales Logo
  clientLogo,                     // Auftraggeber-Logo (base64)
  createdAt, updatedAt
}
```

> **Logos pro Projekt:** Büro- und Auftraggeber-Logo werden im **Projekt-Dashboard**
> (Kachel „Logos") gesetzt – nicht mehr im Protokoll. Auflösung: `project.logo ||`
> globales Logo (`useLogo`); `project.clientLogo` erscheint zusätzlich daneben.
> Beide Logos durchlaufen alle Ausgaben: Protokoll-Kopf, Druck, PDF
> (`protocolPdf.js`/`notePdf.js`), Word-Export (`exportDocx.js`), Gesamtprotokoll
> und Notiz-Druck/-PDF. Signaturen erhielten dafür ein zusätzliches
> `clientLogoDataUrl`-Argument.

### 4.3 Kontakt
```js
{ id, name, company, gewerk, role, email, phone }
```

### 4.4 Protokoll
```js
{
  id, meetingType, projectName, projectId, phase ('planung'|'bau'|null),
  date, time, location, nextMeeting, nextMeetingTime,
  preparedBy, notes,
  predecessorId, itemCarriedFrom, isClosed, closedAt,
  updatedBy,                      // Anzeigename letzter Bearbeiter (Server-Modus)
  participants: [...],
  agenda: [...],                  // Tagesordnungs-Entwurf
  agendaSentAt, agendaGreeting,
  agendaItems: [...],             // Protokollpunkte
  actionItems: [...],
  createdAt, updatedAt
}
```

### 4.5 Protokollpunkt (agendaItem)
```js
{
  id, no, topic, discussion, result, level (1|2|3),
  status ('offen'|'erledigt'),
  assignedTo, carriedGray, carriedFromId,
  linkedFromAgendaId,             // Link auf Agenda-Entwurfspunkt
  createdAt, attachment: { name, mimeType, size, id }   // nur id wird gespeichert
}
```
Anhänge liegen **nicht** im Protokoll-Objekt: Web → IndexedDB `bb_attachments_v1`,
Electron → `userData/attachments/{id}`, **Server → `/data/attachments/{id}`**.
Abstraktion: `src/attachmentStore.js`.

### 4.6 Maßnahme (actionItem)
```js
{
  id, no, description, responsible, deadline,
  status ('offen'|'in_arbeit'|'erledigt'|'verschoben'),
  priority ('hoch'|'mittel'|'niedrig'),
  remarks, carriedFromId, completedAt, protocolItemId,
  releaseRequest,                 // aktuelle Freimeldung (Begründung, Anhänge, Zeit)
  releaseHistory: [...]           // Verlauf: angefordert/genehmigt/abgelehnt
}
```

---

## 5. REST-API (server/index.js)

> Alle `/api/*`-Routen sind rate-limitiert; Schreiboperationen zusätzlich über
> `writeLimiter`. Auth via `Authorization: Bearer <token>` oder `X-API-Key`.

**System / Auth**
```
GET  /api/health                          Statuscheck (Dashboard/Reverse-Proxy/Healthcheck)
GET  /api/version                          BUILD_ID (Auto-Update-Banner)
POST /api/auth/login                        DSM-Login → Session-Token
POST /api/auth/logout
GET  /api/auth/me                           aktueller Benutzer
POST /api/auth/reset-request                Passwort-Reset anfragen
```

**Projekte / Protokolle / Notizen**
```
GET/POST/PATCH/DELETE  /api/projects[/:id]
GET                    /api/projects/:id/access            Zugriffs-/Admin-Konfiguration
PATCH                  /api/projects/:id/access            isAccessControlled, allowedUsers, projectAdmins
POST                   /api/projects/:id/request-delete    Löschanfrage (Admin-Freigabe nötig)
GET/POST/PATCH/DELETE  /api/protocols[/:id]
GET/POST/PATCH/DELETE  /api/notes[/:id]
POST                   /api/protocols/:id/send-email       Protokoll als PDF
POST                   /api/notes/:id/send-email
GET/PUT                /api/notebooks/:projectId           Projekt-Notizbuch (Hauptthemen + Notizen)
POST                   /api/notebooks/:projectId/send-email
```

**Maßnahmen / Freimeldung (login-freie Magic-Links)**
```
POST /api/actions/send-email                          Aufgaben-E-Mail je Verantwortlicher
                                                      → erzeugt/holt Freimelde-Link
                                                      → Bestätigungs-E-Mail an Projektadmin(s)
POST /api/actions/release-link                         Token holen/erzeugen
GET  /api/freimeldung/:token                           offene Aufgaben (JSON, ohne Login)
POST /api/freimeldung/:token                           Freimeldung absenden (Begründung + Anhänge)
GET  /freimeldung/:token                               eigenständige HTML-Seite (GHBA, Arial, kein Login)
POST /api/actions/:protocolId/:actionId/approve        Freimeldung genehmigen (Admin)
POST /api/actions/:protocolId/:actionId/reject         ablehnen + Notiz
GET  /api/projects/:id/release-tokens                  aktive Links (Manager)
POST /api/projects/:id/release-tokens/:token/revoke    Link widerrufen
```

**Personalplanung / Gelände (Dashboard-Integration)**
```
GET  /api/staff  ·  /api/staff-plan/:week  ·  /api/staff-plan-settings
GET  /api/gelaende/personalplanung/:week          Gelände-Daten (angemeldet)
GET  /api/gelaende/public/:token/:week            dieselben Daten, login-frei
GET  /api/gelaende/public/:token/agents           Kurzmeldungen für meta.agent_says
GET  /gelaende?token=…&week=…                     einbettbare Vollbildseite (iframe)
```
> Token = veröffentlichter Team-Link der Personalplanung. Einbettung nur, wenn
> `EMBED_FRAME_ANCESTORS` das Dashboard nennt (sonst `frame-ancestors 'self'`).
> Details: `docs/DASHBOARD-INTEGRATION-PERSONALPLANUNG.md`.

**Anhänge / Live-Updates**
```
GET/POST/DELETE  /api/attachments[/:id]      base64 ↔ /data/attachments/{id}
GET              /api/events                  Server-Sent Events (protocol/project/note)
```

**Admin (Rolle `admin`)**
```
GET   /api/users  ·  /api/auth/users[/:username]            Benutzerverwaltung
PUT   /api/auth/users/:username/{email,role,password,password-note,settings}
POST  /api/auth/users/:username/{invite,password}
GET   /api/admin/synology-status                            DSM-Verbindung
POST  /api/admin/synology-list  ·  /api/admin/synology-bulk-invite   Benutzer-Import aus DSM
GET   /api/admin/smtp-status  ·  POST /api/admin/smtp-test          E-Mail-Status/Test
POST  /api/admin/backup  ·  /api/admin/restore                       JSON-Backups
GET   /api/admin/backups[/:filename]
GET   /api/admin/sessions  ·  DELETE /api/admin/sessions/:username
GET   /api/admin/deletion-requests  ·  POST …/:id/{approve,reject}
POST  /api/admin/release-report-test                        wöchentlichen Report manuell auslösen
```

**Assistent** (`server/assistent.js`, siehe §15)
```
GET    /api/assistent/status                 ist eine KI da, wie viele Projekte freigegeben
GET    /api/assistent/chats                  eigene Unterhaltungen
POST   /api/assistent/chats                  neue Unterhaltung  {projektId?}
GET    /api/assistent/chats/:id              Unterhaltung mit Nachrichten
POST   /api/assistent/chats/:id/titel        umbenennen
DELETE /api/assistent/chats/:id              löschen (Nachrichten per CASCADE)
POST   /api/assistent/chats/:id/fragen       fragen → SSE: quellen, text…, fertig | fehler
```
Fremde Unterhaltungen ergeben **404, nicht 403** – ein 403 würde bestätigen,
dass es sie gibt. Ein Dienstschlüssel (`X-API-Key` → `__apikey__`) bekommt hier
**403**: Er gehört zu keinem Menschen und sieht in `canAccessProject` jedes
Projekt; ein Assistent darauf hätte keine Rechtegrenze.

**Statische Auslieferung**
```
GET  /shortcut         Desktop-Verknüpfung (.url)
GET  /{*path}          SPA-Fallback → dist/index.html
```

---

## 6. Authentifizierung – Synology-DSM (server/synologyAuth.js)

**Aktiv, sobald `SYNOLOGY_URL` gesetzt ist** – das gemeinsame Benutzerverzeichnis
für alle Dashboard-Apps.

- **Login** (`synologyAuth`): `SYNO.API.Auth` (login → ggf. Admin-Gruppen-Check
  via `SYNO.Core.Group/member_list` → logout). Rückgabe `{ isAdmin, displayName }`.
  - App-Admin = Mitglied von `SYNOLOGY_ADMIN_GROUP` (Standard `administrators`)
    **oder** in `SYNOLOGY_ADMIN_USERS` gelistet.
- **Benutzer-Import** (`listSynologyUsers`, Admin-Zugangsdaten): kombiniert lokale
  DSM-Benutzer (`SYNO.Core.User` inkl. `email`/`fullname`) **und** Gruppenmitglieder
  (`SYNOLOGY_USER_GROUPS`, Standard `users,Domain Users` → auch LDAP/Domäne).
  System-/Dienstkonten (`guest`, `admin`) werden gefiltert.
- DSM-Ports: **5000 (HTTP)**, **5001 (HTTPS)**.

> Beim ersten erfolgreichen DSM-Login wird lokal ein Benutzersatz angelegt;
> Sessions sind opake Token mit 8h TTL (`server/auth.js`), überleben Container-Neustart.

---

## 7. E-Mail-Versand (server/mailer.js + index.js)

> Einrichtung, Anbindung weiterer Server (Planserver) und Fehlerbilder:
> siehe **[MAILSERVER.md](MAILSERVER.md)**.

Zwei Wege, gekapselt (`mailerStatus`, `verifyMailer`, `sendMail`):

1. **Microsoft Graph (OAuth2, bevorzugt)** – aktiv, sobald `GRAPH_TENANT_ID`,
   `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`, `GRAPH_SENDER` gesetzt sind.
   Client-Credentials-Flow → Token gecacht → `POST /v1.0/users/{sender}/sendMail`.
   **Kein Passwort, keine MFA** → funktioniert trotz M365-Sicherheitsstandards.
2. **SMTP (nodemailer, Fallback)** – nur ohne `GRAPH_*` und mit `SMTP_HOST`.
   ⚠ Mit aktiven Sicherheitsstandards gesperrt (Basic-Auth deaktiviert).

**Branding aller System-E-Mails/öffentlichen Seiten: `GHBA`, Schriftart Arial.**
Die App-Oberfläche bleibt „Komplizen" (neue CI noch nicht offiziell).

- App-/Link-Adressen via `getAppUrl(req)` → `PUBLIC_URL` oder Request-Host.
- Aufgaben-E-Mail: **From** = zentrale Adresse, **Reply-To** = E-Mail des
  eingeloggten Nutzers, Anzeigename `"… (GHBA)"`; enthält Freimelde-Button und
  löst eine **Bestätigungs-E-Mail an alle Projektadministratoren** aus.

**Microsoft-Graph-Einrichtung (einmalig, Admin):** Entra → App-Registrierung →
Client-Secret → API-Berechtigungen `Mail.Send` **und** `Mail.ReadWrite` (beide
Anwendung) + Admin-Zustimmung → Werte in `docker-compose.yml`, Container neu
erstellen, Test über AdminPanel.
`Mail.ReadWrite` ist seit dem Versand großer Anhänge nötig (Baudokumentation
mit Fotos, Protokolle mit Bildanlagen): Anhänge über 3 MB gehen nicht mehr
über `sendMail`, sondern über Entwurf + Upload-Session – das läuft über die
Postfach-API. Fehlt die Berechtigung, meldet Graph 403 „Access is denied";
die App nennt dann im Fehlertext die fehlende Berechtigung.

---

## 8. PWA (Progressive Web App)

- `public/manifest.json` (display: standalone), `public/sw.js` (network-first),
  `index.html` registriert SW + `apple-touch-icon`.
- Install-Prompt in `ProjectsHome.jsx` via `beforeinstallprompt`.
- **Edge:** Installation auch ohne HTTPS (LAN). **Chrome:** braucht HTTPS/`localhost`
  (oder Flag `chrome://flags/#unsafely-treat-insecure-origin-as-secure`).
- **Auto-Update:** `vite.config.mjs` backt `__BUILD_ID__` ein **und** liefert
  `dist/version.json`. `App.jsx` pollt (60 s + Tab-Fokus); bei Abweichung erscheint
  der `WebUpdateBanner` „Neue Version verfügbar". DB im `/data`-Volume überlebt den
  Container-Tausch, Sessions überleben den Neustart → einfaches Neuladen genügt.

---

## 9. Design-System

**Flat Design:** `borderRadius: 0` (theme-Ebene), keine Schatten
(`.card` → `border border-gray-200`), Body `bg-gray-100`.

**Wasserzeichen (index.css):** fixiertes `body::after` mit `logo.png`,
`opacity: 0.12`, sky-blau gefiltert, im Druck ausgeblendet.

**Komponenten-Klassen:** `.btn-primary` (brand-600), `.btn-secondary`,
`.btn-ghost`, `.btn-danger`, `.input`, `.select`, `.card`, `.badge-{blue|green|yellow|red|gray}`.
**Farben:** `brand` (Blautöne), `night`, `sky`, `concrete`, `light`.

---

## 10. Wichtige Muster & Logik

### Daten-Refresh ohne Navigationsverlust
Hooks exportieren `refetch*`; `App.handleRefresh` kombiniert sie und reicht
`onRefresh` weiter. **Niemals `window.location.reload()`** in Komponenten – das
setzt den view-State zurück.

### Server-Modus: Daten-Race beim Start (gelöst)
`handleLogin` **und** der erfolgreiche `/api/auth/me`-Pfad rufen `handleRefresh()` →
Daten werden mit gültigem Token frisch geladen (sonst 401 beim ersten Fetch).

### Live-Updates via SSE
`src/serverEvents.js` abonniert `/api/events`; Hooks aktualisieren gezielt
einzelne Einträge ohne Komplett-Reload.

### Projekt-Admin-Konzept (mehrstufig)
- `projectAdminUser` (Ersteller, unveränderlich) + `projectAdmins[]` (Co-Admins).
- Server-Helfer `isProjectAdmin(project, username)` prüft beide; davon abgeleitet
  `canAccessProject`, `isProjectManager`, `canManageRelease`.
- **Admin-Kachel** an zwei Stellen: Startseite (`ProjectsHome`, übergreifend) und
  im jeweiligen Projekt (`ProjectDashboard`). Öffnet das wiederverwendbare
  `ProjectAdminPanel.jsx` (Co-Admins, Autoren, Freimelde-Links + Widerruf).
- Sichtbar nur für System-Admins und Projekt-Admins.

### Freimeldung (Aufgaben-Sign-off)
- Login-freier Magic-Link je Verantwortlicher + Projekt (`release_tokens`).
- Daten direkt am `actionItem` (`releaseRequest`, `releaseHistory`).
- Badge + Modal in `ActionItems`/`MassnahmenDashboard`; Genehmigung durch
  Projekt-/System-Admins mit SSE-Live-Update.
- Wöchentlicher Report (Freitags 15:00) genehmigter Freimeldungen an die
  Besprechungsteilnehmer; Scheduler via `setInterval` + Minutencheck, Dedup über
  `app_state.weekly_report_last_run`.

### Aufgaben-E-Mail: automatische Empfänger-Adresse
`MassnahmenDashboard` füllt die E-Mail aus Projektkontakten vor; Zuständige werden
als `"Name (Firma)"` gespeichert → Lookup schneidet das `"(Firma)"`-Suffix ab und
prüft zusätzlich das Vollformat, Fallback über Protokoll-Teilnehmer.

### Teilnehmer-Panel ein-/ausblendbar
`ProtocolEditor` hat einen Toggle (Persistenz in `localStorage`,
`kp_show_participants`).

### Notizbuch (projektintern, 2 Ebenen)
Projekt-Dashboard-Kachel „Notizbuch" → `NotizbuchView.jsx`. Ebene 1 = Hauptthema,
Ebene 2 = Notizen mit Rich-Text + interner Aufgabenliste (Checkbox, Zuständiger,
Frist). Datenhaltung `useNotebook.js`: Server `notebooks`-Tabelle
(`GET/PUT /api/notebooks/:projectId`, Auto-Save), lokal `localStorage`.
Drucken via `window.print()`, E-Mail über `/api/notebooks/:projectId/send-email`.

### Notiz-Teilnehmer & Verteiler aus Kontakten
`NotesList`: Notizen haben `participants[]` (aus Projektkontakten **und**
projektübergreifender Kontaktdatenbank `allContacts`, dedupliziert per E-Mail bzw.
Name+Firma). Der E-Mail-Verteiler ist mit den Teilnehmern vorbelegt und lässt sich
per Suchfeld um beliebige Datenbankkontakte ergänzen. Teilnehmer erscheinen in
Druck/PDF und in der server-seitigen Notiz-E-Mail.

### Kontaktdatenbank bearbeitbar
`ContactDatabase`: „Neuer Kontakt" + Bearbeiten-Stift je Zeile. Speichern
synchronisiert in **alle zugeordneten Projekte** (Abgleich per E-Mail- oder
Name+Firma-Key); Projektzuordnung per Checkboxen (hinzufügen/entfernen).
Felder Firma/Gewerk/Funktion mit `<datalist>`-Autovervollständigung aus
bisherigen Einträgen.

### RichTextEditor: Tab = Unterpunkt
Eigene Extension `SmartIndent` (in `RichTextEditor.jsx`): Tab rückt den Listenpunkt
ein; liegt der Cursor in einer **nummerierten** Liste, wird die neu erzeugte
Unterebene automatisch in eine **Punkt-Aufzählung** umgewandelt (1. → •).
Shift-Tab rückt aus.

### Vorgänger-Kette / Carryover
`predecessorId` → `getChainNo()` → `buildProtocolNo()`. Carryover via `useEffect`,
Guard über `carriedForRef` + persistentem `itemCarriedFrom` (verhindert
Doppelübernahme in React Strict Mode bzw. nach Wieder-Öffnen).

### Agenda-Entwurf (hierarchisch)
Hauptpunkte des Vorgängers (level 1, ohne `linkedFromAgendaId`) erscheinen als
unveränderbare Abschnitte; neue Punkte hängen über `linkedProtocolItemId` darunter.
`promoteAgenda()` übernimmt beim Abschließen nur ungelinkte Punkte (Dedup über
`existingLinkedIds`).

### Projektkontakte-Verschlüsselung (crypto.js)
PBKDF2 → AES-GCM; Salt/IV im Projekt, entschlüsselte Kontakte nur im
`decryptedContacts`-State (nie persistiert), Schlüssel pro Projekt im Speicher.

### Projekt-Export / -Import
Export = JSON `{ exportType:'project', project, protocols }`, Kontakte
**entschlüsselt**, Crypto-/Passwortfelder geleert, **ohne Anhänge**. Import vergibt
neue IDs und remappt `predecessorId` über eine `idMap`.

### Export-Formate
Word (`exportDocx.js`, `exportParticipantsList.js`), CSV (Semikolon + UTF-8 BOM),
Print/PDF (`window.print()`, `@page A4`).

---

## 11. Bekannte Fallstricke

1. **React Strict Mode** doppelt → `carriedForRef`/`itemCarriedFrom`-Guards.
2. **Tiptap controlled input:** `lastEmittedRef` trennt eigene von externen Änderungen.
3. **`window.location.reload()`** in SPA = zurück zur Startseite → `onRefresh`/`refetch*` nutzen.
4. **Docker-interne IP** (172.17.0.2) ≠ LAN-IP → `PUBLIC_URL` setzen (lokal: `start-local.ps1`, NAS: compose).
5. **ENV-Änderung an docker-compose.yml:** Container **löschen + neu erstellen**.
6. **NAS-Deploy:** `scp -O` (kein SFTP), CRLF→LF im SSH-Befehl, voller docker-Pfad für NOPASSWD-sudo, Skript reines ASCII.
7. **SQLite-Migration:** `komplizen.db` **inkl.** `-shm`/`-wal` + `attachments/` kopieren.
8. **Projekt-Export** enthält **keine Anhänge** (nur Metadaten).
9. **`promoteAgenda()`** prüft `existingLinkedIds` vor Erstellung – sonst Duplikate.
10. **Synology kein SFTP-Subsystem** → Uploads immer über klassisches SCP (`-O`).
11. **DSM-Login braucht erreichbares `SYNOLOGY_URL`** (Port 5000/5001); fällt die NAS-API aus, schlägt der Login fehl.
12. **SMTP Microsoft 365** mit Sicherheitsstandards gesperrt → Graph nutzen.
13. **ParticipantsList** (Teilnehmer im Protokoll) ≠ **BeteiligtenModal** (Projektbeteiligtenliste).

---

## 12. Neue App ins Dashboard aufnehmen (Checkliste)

Für jede weitere Anwendung im Synology-Dashboard analog zu dieser App:

1. Eigenes Repo + zweistufiges `Dockerfile` (Build → schlankes Prod-Image).
2. Ordner `/volume1/docker/<app>/` mit `docker-compose.yml`, `data/`, `logs/`.
3. **Eindeutiger Außenport** (3001, 3002, …); intern frei wählbar.
4. `GET /api/health` bereitstellen (Healthcheck + Dashboard-Status).
5. **DSM-Login** über `SYNOLOGY_URL` (gemeinsames Benutzerverzeichnis).
6. Reverse-Proxy-Eintrag (Pfad oder Subdomain) in DSM ergänzen.
7. System-E-Mails/öffentliche Seiten im **GHBA**-Branding (Arial).
8. Deploy-Skript nach Vorbild `deploy-nas.ps1` (build → save → `scp -O` → ssh-swap).
9. Secrets nur in der NAS-`docker-compose.yml`, **niemals in Git**.

---

## 13. Git-Workflow

```bash
git add <files>
git commit -m "Beschreibung

https://claude.ai/code/session_01XnNnKskcg4ceXSVgJcGC9U"
git push -u origin claude/protocol-tool-meetings-tIoZX
```
Bei Push-Fehlern: bis zu 4 Retries mit exponential backoff (2s, 4s, 8s, 16s).

**Update/Deploy auf die NAS (Kurzform – ein Befehl):**
```powershell
.\update.ps1
```

**Update/Deploy auf die NAS (Langform – falls update.ps1 nicht verfügbar):**
```powershell
git fetch origin
git checkout claude/protocol-tool-meetings-tIoZX
git pull origin claude/protocol-tool-meetings-tIoZX
.\deploy-nas.ps1
```

**WICHTIG für Claude:** Am Ende jeder abgeschlossenen Aufgabe immer den Deploy-Befehl anfügen:
```powershell
.\update.ps1
```

---

## 14. Aktueller Stand

> Stand: 2026-08-28 · Branch `claude/protocol-tool-meetings-tIoZX` · letzter Commit `271089e`

### Deployment (PowerShell)
- `update.ps1` = `git fetch/checkout/pull` + Aufruf von `deploy-nas.ps1`.
- `deploy-nas.ps1`: `docker build` → `docker save` (.tar) → `scp -O` auf die NAS → per SSH `docker load` + `compose up -d`; .tar wird lokal wieder gelöscht.
- **Kein** `Start-Process`, **keine** Stderr-Umleitung im Deployskript. Die Datenbank liegt im NAS-Volume und wird beim Deploy nicht angefasst; nur der Container wird getauscht.

### Lokales Verifikationsmuster (nur für Claude-Testläufe)
- Test-Server: `Start-Process node -ArgumentList "server/index.js" -PassThru -NoNewWindow -RedirectStandardOutput <scratch>\srvN.log -RedirectStandardError <scratch>\srvN.err`, eigener `DB_PATH`/`LOG_PATH` im Scratchpad, freier Port (3475–3482 genutzt).
- PID in `srvN.pid` merken; nach dem Test Prozess stoppen und Scratch-Dateien löschen (`srvq2.err` etc. sind temporäre Testartefakte, gehören **nicht** zum Projekt).
- Pipe an `Select-Object` beendet den Server sofort → Start immer ohne Pipe.
- `node -e "require('better-sqlite3')(...)"` nur aus dem Projektverzeichnis (node_modules).

### Zuletzt behobene Fehler (Ursache → Lösung)
- **„Zu viele Anfragen" (429) beim Tippen** → Rate-Limits waren 300/15 min global und 120 Schreibvorgänge/min, geteilt pro IP. Jetzt 6000/15 min bzw. 600/min, gezählt **pro Nutzer** (Token, `ipKeyGenerator` als Fallback).
- **Arbeitsverlust bei 401/429** → Server-Antworten wurden im Sync still verworfen (`console.warn`). Jetzt `assertSaveOk()` (`src/serverSaveError.js`) + **automatischer Wiederholungsversuch** (3 s → 30 s) in `useProjects`/`useProtocols`; Auto-Save-Debounce 400 → 900 ms; `beforeunload`-Warnung bei ungespeichertem Stand.
- **Abmeldung über Nacht** → `expires_at` (ISO mit „T") wurde gegen `datetime('now')` (Leerzeichen) verglichen; Sitzung galt bis Tagesende und war am Folgetag ungültig. Jetzt identisches ISO-Format (`strftime('%Y-%m-%dT%H:%M:%fZ')`), `SESSION_HOURS` = 14 Tage **Inaktivität** + gleitende Verlängerung in `resolveToken()`.
- **Wetter-Geocoding** → PLZ liefert keine Treffer (nur Ort verwenden); „Duesseldorf" wird nicht gefunden, „Düsseldorf" schon → Umlaut-Varianten werden probiert, Ergebnis gecacht.
- **Sprung zum neuen Protokollpunkt** → `focus()` scrollt selbst und überstimmte `scrollIntoView`; jetzt `focus({ preventScroll: true })` zuerst. `behavior: 'smooth'` entfällt (wird bei „Bewegung reduzieren" unterdrückt), stattdessen `'auto'`.

### Getroffene Entscheidungen
- **Protokoll vs. Agenda:** Protokoll übernimmt **alle** offenen Punkte des Vorgängers inkl. Inhalten; die **Agenda zeigt nur Hauptpunkte** als Abschnitte (Unterpunkt nur, wenn ihm ein Agendapunkt zugeordnet ist). Das „Zuordnen zu"-Dropdown listet **alle** Ebenen.
- **Verteiler:** Empfänger der Wochen-/Statusberichte kommen ausschließlich aus dem Projekt-Verteiler; **ohne Verteiler wird nichts versendet**.
- **Maßnahmen-Zählung:** eine gemeinsame Definition (`liveActionItems`, `isMirrorAction`, `supersededActionIds`) – ohne BIM-/Planprüfungs-Spiegel und ohne ins Folgeprotokoll übernommene Vorgänger.
- **Protokollpunkt-Datum** = Besprechungsdatum (nicht Eingabezeitpunkt).
- **Wetter** über Open-Meteo, serverseitig, Standort = Ort der Bauherren-Anschrift, Zeitraum nach Tageshälfte (Vormittag 6–12, Nachmittag 12–18 Uhr).
- **Sitzungsablauf** wird per Overlay (`SessionExpiredModal`) abgefangen – **nicht** über den Login-Screen, damit ungespeicherte Eingaben erhalten bleiben.

### Personalplanung im Dashboard (Gelände)
- Die Personalplanung bleibt im Protokolltool; das Dashboard bindet die Ansicht
  per iframe ein (Registry-Zeile, keine zweite Datenhaltung).
- Reiter „Gelände" in der Personalplanung (`/personalplanung`) zeigt dieselbe
  Ansicht angemeldet; die Einbettseite `/gelaende` ist login-frei über das Token.
- Bauzustand aus den Projektdaten: nichts beauftragt → Hologramm, beauftragt und
  ruhend → Fundament, diese Woche geplant → Rohbau mit Kran, zuletzt bearbeitet →
  fertiges Gebäude. Soll aus dem Projektteam (Anteil × Kapazität).
- Three.js liegt als npm-Abhängigkeit bei und wird erst beim Öffnen geladen.

### Offene Aufgaben
- **Entscheidung ausstehend:** Konzept „Agenda = Ansicht auf die Protokollpunkte" (eine Datenquelle statt zwei Listen) – große Lösung vs. kleinere Variante; siehe Vorschlag im Verlauf.
- `ENTWICKLUNG.md` ist auf Stand 2026-07-26 und deckt die seitdem erfolgten Änderungen nicht ab.
- Freimelde-Seite (`openTasksFor`) filtert Spiegel-Einträge inzwischen, aber die Auswirkung auf bestehende Freimelde-Links ist nicht praktisch geprüft.
- `ACTION_ARTEN` (Planung/Ausführung/AG/GP) noch fest im Code – konfigurierbar machen wurde angeboten, nicht beauftragt.
- Baudokumentation/Mängel: kein Auto-Save (Speichern nur über Schaltfläche).
- Docker-Image ohne Liberation-Fonts → PDF-Metrik weicht minimal von Arial ab.
- Wetterabruf setzt Internetzugang der NAS und einen gepflegten **Ort** in den Projektdaten voraus.
- Gelände: Zuteilung per Drag (Person auf Projekt ziehen) ist noch nicht gebaut – Phase 2 des Musters.
- Gelände: ob die Embed-Shell des Dashboards eine externe `meta.embed_src` akzeptiert, ist noch nicht praktisch geprüft (Rückfall: `embed_mode = 'link'`).

---

## 15. (K)ompl(I)ze — der Assistent auf den Projektdaten

> Seit 04.11.2026. Erste von mehreren Integrationen, die je einen eigenen
> Assistenten bekommen. Das Papier dazu:
> `komplizen-dashboard/docs/ARCHITEKTUR_ASSISTENTEN.md`.

Beantwortet zwei Arten von Fragen: zu den Bauprojekten dieses Büros und zur
Bedienung des Programms. **Er liest nur** – anlegen, speichern und versenden
bleibt bei den Menschen.

### 15.0 Wie er heißt

In der Oberfläche heißt er **(K)ompl(I)ze**. Die Klammern greifen das
(K)-Logo des Hauses auf, und die beiden eingeklammerten Buchstaben ergeben
zusammen „KI" – das Wort steckt also im Namen, ohne dass es jemand
hinschreiben müsste. Dargestellt wird es in `Assistent.jsx` über die kleine
Komponente `Name`; die Klammerbuchstaben stehen in Sky (`#8FBEFF`).

**Nur die Anzeige trägt diesen Namen.** Die Routen heißen weiter
`/api/assistent/*`, die Dateien ebenso. Ein Name, der sich nach außen ändern
darf, soll nicht an Pfaden hängen, die danach alle mitwandern müssten.

Dieselbe Überlegung gilt auf der anderen Seite: Die KI-Rechner heißen seit
dem 04.11.2026 **`Komplize <letzte Stelle der IP>`** (`Komplize 54`,
`Komplize 190`), weil ihr Name unter jeder Antwort steht. Vorher standen dort
das Kürzel eines Kollegen und eine Kartenbezeichnung.

### 15.1 Die zwei Entscheidungen, auf denen alles steht

**Der Bot lebt hier, nicht im Dashboard.** Naheliegend wäre das Gegenteil
gewesen: Dort steht schon ein Assistent, dort steht die KI-Farm, und die
Leitung zu den Projektdaten gibt es seit September (`/api/stammdaten/*`).
Dagegen steht eine Zeile in `canAccessProject`:

```js
if (username === '__apikey__') return true
```

Der Dienstschlüssel des Dashboards sieht **jedes** Projekt, auch die
zugangsbeschränkten. Für die Personalplanung ist das richtig; ein Chatbot
darauf hätte genau die Grenze aufgehoben, um die es geht. Hier dagegen liegt
die Sitzung des Menschen, und `server/kontext.js` bekommt `canAccessProject`
hereingereicht – dieselbe Funktion, die auch die Oberfläche benutzt.

**Mit den KI-Rechnern spricht trotzdem nur das Dashboard.** Dort entscheidet
`ki._reservieren` nach Rang, gemeldeter GPU-Last und dem Schalter „nur leicht",
welche Karte eine Anfrage bekommt – das ist der Schutz für den Menschen, der an
der Maschine sitzt. Eine eigene Leitung zu LM Studio liefe daran vorbei.

### 15.2 Die Dateien

| Datei | Aufgabe |
|---|---|
| `server/ki.js` | Einzige Stelle, die das Dashboard kennt. Schickt `POST /api/ki/dienst/unterhalten` mit `X-KI-Key`, liest den SSE-Strom zurück. Wirft nie – jeder Fehlschlag kommt als `fehler`-Ereignis. |
| `server/kontext.js` | Der Rückgriff: baut den Systemkopf aus dem, was die Person sehen darf. Stichwortsuche, Zeichenbudget, Quellenangaben. |
| `server/assistent.js` | Die Routen, der Verlauf, das Strömen zum Browser. |
| `server/handbuch.md` | Das Nutzerhandbuch – **Laufzeitdatei**, keine reine Doku. Lag vorher als `Komplizen_Protokolle_Quelldokument.md` oben; das Produktionsabbild kopiert nur `server/` und `dist/`, dort wäre es nie angekommen. |
| `src/components/Assistent.jsx` | Das Fenster. Hängt in `wrap()` in `App.jsx`, also in jeder Ansicht. |
| `server/neuigkeiten.md` | Die Neuigkeiten selbst – **Laufzeitdatei**, von Menschen geschrieben (§15.3b) |
| `server/neuigkeiten.js` | Liest sie, merkt sich Gesehenes |
| `pruefungen/pruefung-assistent.js` | 111 Einzelprüfungen gegen echten Server und Attrappe. |

### 15.3 Wie der Systemkopf entsteht (`kontext.js`)

1. **Projekte filtern** mit `canAccessProject`. Protokolle und Notizen ohne
   Projektbezug bleiben sichtbar – genau wie in `GET /api/protocols`.
2. **Schwerpunkt bestimmen**: das offene Projekt, sonst ein in der Frage
   genanntes – aber nur bei **genau einem** Treffer. Bei zweien wäre die Wahl
   geraten, und eine geratene Mappe verdrängt echte Fundstellen.
3. **Stücke bewerten**: Protokollpunkte, Aufgaben, Bemerkungen, Notizen.
   Abdeckung zählt mehr als Häufigkeit – sonst gewinnt immer der längste Text.
4. **Füllen bis zum Budget.** **Weggelassen wird, nicht abgeschnitten**: Ein
   mitten im Satz gekappter Protokollpunkt sieht für das Modell aus wie ein
   vollständiger. Was nicht mehr hineinpasste, wird gezählt und mitgeteilt.

### 15.3a Zwei Fehler des ersten Betriebstags (04.11.2026)

Beide fielen erst im Echtbetrieb auf, beide sind gemessen.

**Das Fenster lief über.** Das Budget stand auf 17 000 Zeichen, gegriffen aus
dem Limit des Dashboards (`KI_MAX_INPUT` = 24 000). Maßgeblich ist aber das
Fenster des Modells, und LM Studio lädt `qwen3-14b` mit **8192 Token**:

```
Kopf 17000 + Verlauf 6000 + Antwort 1500 Token  ->  0 Zeichen Antwort
Kopf  9000 + Verlauf 3000 + Antwort  900 Token  ->  561 Zeichen, 3,2 s
```

Die erste Frage einer Unterhaltung passte noch, die zweite nicht mehr — dann
kam **gar nichts**. Ein übergelaufenes Fenster meldet keinen Fehler. Genau das
war der „abgerissen"-Fehler im Betrieb.

Zeichen je Token, gemessen am Handbuch über `usage.prompt_tokens`: 3,47 / 3,43
/ 3,38 / 3,40. Gerechnet wird mit **3,2**. Das Budget leitet sich jetzt aus
`KI_FENSTER_TOKEN` ab (Vorgabe 8192) — wird LM Studio größer geladen, gehört
die Zahl dort angepasst.

**„Irgendein Wort getroffen" war kein Auswahlkriterium.** Gemessen an den
ersten echten Fragen:

| Frage | Fundstellen vorher |
|---|---|
| „Hallo Test!" | 44 |
| „nochmal" | 29 |
| „wie kann ich ein neues projekt anlagen?" | 42 |

„Projekt" und „Protokoll" stehen in jedem Protokoll — wer danach sucht, findet
alles, und alles finden ist dasselbe wie nichts finden. Bei der Bedienfrage
verdrängten 42 Protokollschnipsel genau den Handbuchabschnitt mit der Antwort.

Drei Regeln dagegen:

1. **Seltenheit statt Vorkommen.** Jedes Suchwort wiegt `log(N/df)`. Wörter in
   mehr als 40 % aller Stellen (`ALLERWELT_AB`) fliegen ganz heraus — und
   stehen danach auch nicht mehr in der Quellenangabe, sonst behauptete die
   Oberfläche, danach sei gesucht worden.
2. **Abstand zur besten Stelle.** Mindestens 35 % ihrer Punkte
   (`STELLEN_SCHWELLE`), höchstens 10 Stellen (`STELLEN_HOECHSTENS`).
3. **Wortanfang statt Teilzeichenkette.** Vorher traf „hin" das Wort
   „Hinweis" und „test" das Wort „Testlauf". Das Wortende bleibt frei, damit
   „Projekt" auch „Projekte" trifft — im Deutschen hängt an jedem Wort etwas
   dran.

Das Handbuch braucht zusätzlich **zwei** tragende Wörter oder eines in der
Überschrift. Es ist die Nebenquelle: Bei einer Frage nach der
Sprinklerzentrale soll es nicht mitkommen, nur weil dort irgendwo „hin"
vorkommt.

Ein Wort, das **nirgends** vorkommt, gilt dabei nicht als nichtssagend,
sondern als erfolglos gesucht — „Reykjavik" wird in der Quellenangabe genannt.
Dass sich das von einem bloßen „nochmal" nicht unterscheiden lässt, ist kein
Mangel: Für die Antwort gilt in beiden Fällen dasselbe, nämlich sich an die
Unterhaltung zu halten und nichts zu erfinden.

**Was bewusst nicht in den Kopf kommt:** E-Mail-Adressen und Telefonnummern der
Kontakte. Für „wer macht die Statik?" braucht das Modell sie nicht, und was
nicht im Kopf steht, kann in keiner weitergeleiteten Antwort auftauchen.
Verschlüsselte Kontakte bleiben ohnehin draußen – der Schlüssel liegt im
Browser.

Gesucht wird mit Stichwörtern, nicht nach Bedeutung. Bei 66 Protokollen in 21
Projekten reicht das und ist nachprüfbar: Man kann sehen, **warum** etwas
gefunden wurde. Der Preis sind Synonyme – deshalb sagt die Anweisung dem Modell
ausdrücklich, es soll das Fehlen von Material benennen statt es zu überbrücken,
und: *„Behaupte nie, etwas existiere nicht – sage, dass du es nicht findest."*
Was fehlt, kann auch hinter einer fehlenden Freigabe liegen.

### 15.3b Neuigkeiten: die Sprechblase beim Anmelden

Seit 04.11.2026 begrüßt (K)ompl(I)ze jeden mit Namen und zeigt, was sich im
Programm geändert hat — als Sprechblase über seinem Knopf. Ein Klick auf
„Mehr dazu" öffnet den Chat, der Text steht dort als erste Nachricht, und ab
da lässt sich nachfragen.

**Der Text kommt aus `server/neuigkeiten.md`, nicht aus dem Modell.** Wer
eine Verbesserung baut, schreibt sie im selben Commit dort hinein —
versioniert, gegengelesen, nicht erfindbar. Dieselbe Rollenteilung wie bei
den Fundstellen: Die Wahrheit ist von Menschen, die Erläuterung vom Modell.
(`BUILD_ID` taugt dafür nicht: Das ist ein Zeitstempel.)

| Stück | Wo |
|---|---|
| Die Texte | `server/neuigkeiten.md`, Überschrift `## <kennung> \| <Titel>` |
| Das Lesen | `server/neuigkeiten.js` |
| Wer was gesehen hat | Tabelle `neuigkeit_gesehen` |
| Die Sprechblase | `Assistent.jsx`, Komponente `Blase` |

Vier Entscheidungen, die man an der Umsetzung sieht:

1. **Die Kennung darf sich nie ändern**, der Titel schon. Die Kennung merkt
   sich, wer den Eintrag gesehen hat — wird sie geändert, erscheint er bei
   allen erneut.
2. **Nichts von vor der eigenen Anmeldung, höchstens drei auf einmal.** Wer
   heute dazukommt, soll nicht die Versionsgeschichte eines Jahres vorgesetzt
   bekommen; wer drei Wochen weg war, keine Wand.
3. **Der Text wird beim Öffnen wirklich gespeichert**, nicht nur angezeigt.
   Sonst stünde er auf dem Schirm, aber nicht im Verlauf — und die erste
   Nachfrage („wie meinst du das?") ginge ins Leere.
4. **Bilder als `<img>` mit `data:`-URL, nie als eingebettetes SVG.** In einem
   `<img>` führt ein SVG keine Skripte aus. Die Dateien stammen aus dem
   eigenen Projekt und sind gegengelesen — die Oberfläche soll aber nicht
   davon abhängen, dass das so bleibt.

**Die Begrüßung selbst kostet keinen KI-Aufruf.** „Guten Morgen, Anna" ist
ein `if` über die Uhrzeit. Dafür belegt niemand einen Platz auf einer
Grafikkarte.

### 15.3c Bilder: SVG statt Bildmodell

Gemessen am 04.11.2026: Das 35B schreibt ein brauchbares Erklärbild als
**SVG** in rund 22 Sekunden, in den Hausfarben. Ein Bildmodell gibt es in
der Farm nicht (nachgesehen: ein LLM, ein VLM, ein Einbettungsmodell — das
VLM *liest* Bilder, es malt keine).

Das ist kein Mangel, sondern die bessere Wahl:

- **SVG ist Text.** Man sieht vor dem Ausliefern, ob es stimmt.
- **Ein Diffusionsmodell malt überzeugende Bildschirmfotos von einer
  Oberfläche, die es nicht gibt.** Im Hilfetext ist das schlimmer als gar
  kein Bild — genauso wie eine erfundene Antwort mit Quellenangabe.
- Geht es wirklich um „wo ist der neue Knopf", ist ein **echtes
  Bildschirmfoto** jedem erzeugten überlegen. Dann gehört ein PNG daneben.

22 Sekunden sind zu lang für eine Sprechblase. Das Bild entsteht deshalb
**beim Schreiben der Neuigkeit**, wird angesehen und mit ausgeliefert — nicht
beim Anzeigen.

### 15.4 Die Fundstellen stehen über der Antwort

Sie kommen auch zuerst an: Der Server schickt das `quellen`-Ereignis, bevor das
Modell das erste Wort geschrieben hat. Wer liest, worauf sich eine Antwort
stützt, **bevor** er die Antwort liest, glaubt ihr so weit, wie sie es verdient.
Steht dort „Keine Fundstellen", ist das die wichtigste Zeile auf dem Schirm.

### 15.5 Einrichten

```
KI_DASHBOARD_URL=http://192.168.178.250:5050
KI_DASHBOARD_KEY=<derselbe wie KI_DIENST_SCHLUESSEL im Dashboard>
KI_TIMEOUT_MS=180000
```

Fehlt eines von beiden, **erscheint der Knopf gar nicht**. Ein Chatfenster, das
auf jede Frage mit einem Verbindungsfehler antwortet, sieht nach einem kaputten
Programm aus statt nach einer Funktion, die hier nicht eingeschaltet ist.

### 15.6 Prüfen

```bash
node pruefungen/pruefung-assistent.js
```

Startet einen echten Server mit leerer Datenbank im Temp-Verzeichnis und eine
Attrappe des Dashboards, die **jede Anfrage mitschreibt**. Das ist die Naht, an
der sich nachlesen lässt, was der Systemkopf wirklich enthielt – die Rechtegrenze
lässt sich nicht behaupten, nur messen.

Mit `--vorschau` bleibt am Ende alles stehen (Anmeldung `anna` sieht beide
Projekte, `bert` nur eines), um die Oberfläche anzusehen. Portblock: 3477
Anwendung, 3478 Attrappe.
