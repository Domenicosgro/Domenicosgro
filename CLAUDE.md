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
│   │   ├── NotesSection.jsx       # Allgemeine Bemerkungen (rich text) im Protokoll
│   │   ├── NotesList.jsx          # Akten- und Telefonnotizen (projektbezogen)
│   │   ├── RichTextEditor.jsx     # Tiptap-Editor (Bold/Italic/Underline/Strike/Listen)
│   │   ├── SpellCheckTextarea.jsx # Textarea mit Rechtschreibprüfung
│   │   ├── GesamtprotokollModal.jsx # Gesamtprotokoll-Druck über Vorgänger-Kette
│   │   ├── ProtocolEmailModal.jsx # Protokoll als PDF-Anhang versenden
│   │   ├── LogoUpload.jsx         # Logo hochladen/löschen
│   │   ├── KostendatenbankView.jsx # Büroweite Kostendatenbanken (Startseiten-Kachel)
│   │   ├── KostenView.jsx         # Kostenermittlung: Liste, Editor-Shell, CSV-Export
│   │   ├── kosten/                # Reiter des Kosteneditors
│   │   │   ├── cells.jsx          # Eingabezellen (blau) mit Formel-/Fehleranzeige
│   │   │   ├── UebersichtTab.jsx  # Abgabeblatt 2. Ebene + BKI-Plausibilisierung
│   │   │   ├── PositionenTab.jsx  # KG 300 (3. Ebene) und KG 200-700 (2. Ebene)
│   │   │   ├── ParameterTab.jsx   # Bezugsgrößen und Mengen mit Formelnamen
│   │   │   ├── VariantenTab.jsx   # Variantenverwaltung + Variantendifferenz-Analyse
│   │   │   ├── DatenquellenTab.jsx # Bindung an Kostenstände + Referenzobjekt-Übernahme
│   │   │   ├── AnnahmenTab.jsx    # Annahmen/offene Punkte + Planerstand
│   │   │   ├── QuellenTab.jsx     # Quellenregister
│   │   │   └── KopfdatenTab.jsx   # Stufe, Kostentiefe, Rechenfaktoren, Budget, BKI-Referenzwerte
│   │   ├── LoginScreen.jsx        # Login-Maske (Server-Modus, DSM-Login)
│   │   └── AdminPanel.jsx         # Benutzerverwaltung, Synology-Import, E-Mail-Status, Backups
│   │
│   ├── kosten/                    # Kostenermittlung nach DIN 276 (gekapseltes Modul)
│   │   ├── formula.js             # Formel-Parser/-Auswerter ("=PERIMETER*AF_STREIFEN")
│   │   ├── din276.js              # KG-Katalog: 2. Ebene KG 100-800, 3. Ebene KG 300
│   │   ├── model.js               # Datenmodell, Fabriken, Stufen/Ansatztypen/Reifegrade
│   │   ├── calc.js                # Rechenkern: Varianten, Summen, Prozentpositionen
│   │   ├── datenbank.js           # Kostendatenbanken: Kostenstände, Kennwerte, Referenzobjekte
│   │   ├── tiefe.js               # Kostentiefe je Leistungsphase (DIN-Minimum vs. Zieltiefe)
│   │   └── templates.js           # Vorlagen: leere DIN-Struktur / Sporthalle BKI Q2-2026
│   │
│   └── hooks/
│       ├── useKosten.js           # CRUD Kostenermittlungen + entprellter Editor-Entwurf
│       ├── useKostendatenbanken.js # CRUD Kostendatenbanken + Dokument-Upload
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
│   ├── pm2.config.js              # PM2-Konfiguration für direkten Linux-Betrieb (ohne Docker)
│   └── package.json               # Nur Server-Abhängigkeiten (kein Electron, kein Vite)
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
| `cost_estimates` | Kostenermittlungen nach DIN 276 (JSON je Zeile, projektbezogen) |
| `cost_databases` | Büroweite Kostendatenbanken inkl. Kostenstände, Kennwerte und Dokumentverweise |
| `app_state` | Key-Value-Speicher (z.B. Scheduler-Zeitstempel) |
| `store` | Generischer Key-Value-Store (Logo etc.) |

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
GET/POST/PATCH/DELETE  /api/projects/:id/kostenermittlung[/:itemId]  Kostenermittlungen (DIN 276)
GET                    /api/kostendatenbanken[/:id]        Kostendatenbanken (alle Angemeldeten)
POST/PATCH/DELETE      /api/kostendatenbanken[/:id]        Pflege – nur Rolle `admin`
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
Client-Secret → API-Berechtigung `Mail.Send` (Anwendung) + Admin-Zustimmung →
Werte in `docker-compose.yml`, Container neu erstellen, Test über AdminPanel.

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

### Kostenermittlung nach DIN 276 (src/kosten/)
Projekt-Dashboard-Kachel „Kostenermittlung" → `KostenView.jsx`. Je Projekt sind
mehrere Kostenstände möglich (Kostenrahmen … Kostenfeststellung).

**Rechenlogik (BKI-Kennwerte sind brutto):**
```text
Nettokosten Variante = Menge × gewählter Bruttokennwert ÷ (1 + USt) × Regionalfaktor × Preisindex
```
Prozentpositionen (typisch KG 700) rechnen auf eine Bezugssumme. Bezugsbasis sind
**nur die nicht-prozentualen Positionen** des Bereichs – so bleibt die Rechnung
zirkelfrei.

**Formeln:** Mengen, Kennwerte und Parameter dürfen mit `=` beginnen und andere
Parameter über ihren Formelnamen referenzieren (`=PERIMETER*AF_STREIFEN`).
`src/kosten/formula.js` löst rekursiv mit Zyklusschutz auf; Grundrechenarten,
Klammern sowie `MIN`, `MAX`, `ROUND`, `SUM`, `WENN`. Deutsche Dezimalkommata
werden in Zahlwerten akzeptiert.

**Methodische Leitplanken** (bewusst so umgesetzt, nicht „vergessen"):
- Erstbefüllung mit dem **unteren** BKI-Wert, wo Leistung und Einheit passen –
  als reproduzierbare Regel, nicht als Prognose. Das ▸ neben einem BKI-Wert
  überträgt ihn in alle Variantenspalten.
- Wo BKI keinen passenden Kennwert liefert, **keine Scheingenauigkeit**: Ansatztyp
  `Projektansatz`/`Marktansatz` statt erfundener BKI-Untergliederung.
- BKI-Gesamtkennwerte dienen nur der **Plausibilisierung**. Die Summe der Unterwerte
  der 2./3. Ebene muss den Unterwert der übergeordneten Kostengruppe **nicht**
  treffen (unterschiedliche Vergleichsobjekte).
- Varianten werden über **eigene sichtbare Kennwert-/Mengenspalten** verglichen,
  nie über versteckte Zuschläge. Der Reiter „Varianten" listet auf, wo sie sich
  tatsächlich unterscheiden.
- Offene Punkte bleiben sichtbar: jede Position trägt einen Reifegrad
  (BKI-basiert · Mengen prüfen · Marktanfrage · Konzept offen · Schadstoffmengen
  offen · gesichert), die Übersicht zählt sie aus.

**Vorlagen** (`templates.js`): „Leere DIN-276-Struktur" (KG 200–700, 2. Ebene) und
„Sporthalle – Modernisierung (BKI Q2/2026)" mit 88 Positionen, 40 Parametern,
vier Varianten, Annahmen, Planerständen und Quellenregister. Die Werte der
zweiten Vorlage sind Startwerte eines konkreten Projekts und für ein neues
Projekt zu ersetzen.

**Zugriff:** Lesen darf jeder Projektberechtigte, Bearbeiten nur System- und
Projektadministratoren (`readOnly`-Prop in `App.jsx`).

**Speicherung:** Server-Modus → `cost_estimates` über
`/api/projects/:id/kostenermittlung` mit optimistischer Versionierung; lokal →
`localStorage`. Der Editor arbeitet auf einem Entwurf und speichert entprellt
(`useKostenDraft`).

### Kostendatenbanken (src/kosten/datenbank.js)
Startseiten-Kachel „Kostendatenbanken" → `KostendatenbankView.jsx`. Büroweit und
projektübergreifend: einmal gepflegt, für alle Projekte verfügbar. Lesen darf
jeder Angemeldete, Pflege ist Systemadministratoren vorbehalten.

**Drei Arten:** `bki` (statistische Kennwerte), `eigen` (aus abgeschlossenen
eigenen Projekten abgeleitet), `extern` (Herstellerlisten, Fachplanerkennwerte,
Förderrichtwerte).

**Kostenstand = Version.** Eine Datenbank besteht aus mehreren Kostenständen mit
Bezeichnung, Datum, Gebietsstand, Steuerhinweis, Status
(`entwurf` · `freigegeben` · `abgeloest`) und Vermerk, wer wann eingespielt hat.
Bestehende Werte werden **nie überschrieben**: ein neuer Preisstand ist ein neuer
Kostenstand; beim Freigeben wird der bisher freigegebene automatisch abgelöst.
„Aus letztem Stand" übernimmt die Struktur und leert die Werte.

**Dokumente sind Teil des Kostenstands.** PDF, Excel, CSV, Word, ZIP oder Bild
werden am Kostenstand hinterlegt (Ablage über `/api/attachments` im
`/data/attachments`-Volume) und sind aus der Kostenermittlung heraus direkt zu
öffnen. Ohne Beleg ist ein Kostenstand fachlich nicht nachvollziehbar.

**Kennwerte** je Kostengruppe (1.–3. Ebene) mit Leistungsabgrenzung, Bezugsgröße,
von/Mittel/bis und Quellenangabe. Erfassung von Hand oder über „Aus Tabelle
einfügen" (Excel-Zwischenablage oder CSV; Trennzeichen und Kopfzeile werden
erkannt).

**Bindung an eine Kostenermittlung** (Reiter „Datenquellen"): Die Ermittlung
rechnet mit genau dem gebundenen Kostenstand. Bezeichnung, Stand und Datum werden
als **Kopie** mitgeführt – die Datenbasis bleibt nachweisbar, auch wenn die
Datenbank später umbenannt oder aufgeräumt wird. Erscheint ein neuerer
freigegebener Stand, meldet der Editor das; übernommen wird er erst auf
Anweisung, damit eine abgegebene Kostenermittlung ihre Zahlen behält.
`fillFromVersion()` füllt die Vergleichsspalten je Kostengruppe (exakter Treffer,
sonst nächsthöhere Ebene) und vermerkt die Herkunft in `position.dbRef`. Passt
kein Kennwert, bleibt die Position unangetastet – es wird nichts erfunden.

**Rückfluss:** „Als Referenzobjekt übernehmen" leitet aus einer Kostenermittlung
Kennwerte ab (Nettokosten ÷ Bezugsgröße, auf brutto hochgerechnet) und legt sie
als neuen Kostenstand in einer `eigen`-Datenbank an – Status `entwurf`, vor
Verwendung zu prüfen. Die Bezugsgröße ist **je Hauptkostengruppe** wählbar
(KG 500 gegen AF, KG 200 gegen GF, sonst BGF); Kostengruppen ohne hinterlegte
Bezugsgröße werden übersprungen statt gegen eine unpassende Größe gerechnet.

### Kostentiefe je Leistungsphase (src/kosten/tiefe.js)
Zwei getrennte Größen:
- **`minDin`** – die von DIN 276 verlangte Mindesttiefe (Kostenrahmen/-schätzung
  1. Ebene, Kostenberechnung 2. Ebene, Kostenanschlag/-feststellung 3. Ebene).
  Wird sie unterschritten, meldet die Übersicht das rot.
- **`ziel`** – die Tiefe, die das Büro in diesem Projekt anstrebt, **je
  Hauptkostengruppe** einstellbar (`byKg1`).

Daraus entsteht die **vertiefte Kostenschätzung**: Profil
`kostenschaetzung-vertieft` gibt Abgabe auf der 2. Ebene vor, KG 300 und KG 400
aber auf der 3. Ebene. Die Profile in `TIEFENPROFILE` sind Startwerte – die
Tiefe bleibt in den Kopfdaten frei änderbar. `tiefeCheck()` wertet aus, welche
Kostengruppe ihre Zieltiefe erreicht; Übersicht und Kopfdaten zeigen es an.

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
14. **Kostenermittlung:** Kennwerte sind **brutto**; die Nettoumrechnung passiert im Rechenkern. Ein netto vorliegender Betrag (Angebot, Fachplanung) braucht die Rechenart „Nettobetrag direkt", sonst wird er ein zweites Mal entsteuert.
15. **Prozentpositionen** rechnen nur auf nicht-prozentuale Positionen – eine KG-700-Position kann sich nicht selbst als Basis nehmen.
16. **Parameter-Formelnamen** müssen eindeutig sein; doppelte Namen lösen den zuletzt gefundenen Wert auf (das Parameterblatt warnt).
17. **Speichern ohne `projectId`** würde eine Kostenermittlung aus der Projektliste fallen lassen – `useKosten.save` setzt das Feld deshalb immer.
18. **Kostenstände nie überschreiben.** Neuer Preisstand = neuer Kostenstand. Sonst ändern sich rückwirkend die Zahlen bereits abgegebener Kostenermittlungen.
19. **Die Bindung an einen Kostenstand ist eine Kopie**, keine Referenz: `datenquelle()` schreibt Name, Stand und Datum in die Ermittlung. Ein Umbenennen der Datenbank ändert eine gebundene Ermittlung deshalb nicht.
20. **Referenzobjekte brauchen die richtige Bezugsgröße je Kostengruppe** – KG 500 gegen AF, KG 200 gegen GF. Alles gegen BGF zu rechnen erzeugt Kennwerte, die mit keiner Quelle vergleichbar sind.
21. **Kostendatenbanken pflegen nur Systemadministratoren** (`requireAdmin`); die Oberfläche blendet die Bearbeitung sonst aus.

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
