# Komplizen Protokolle – Arbeitsstand für Claude

## Projekt-Überblick

**App:** Besprechungsprotokoll-Tool für Bauprojekte  
**Stack:** React 18 · Vite · Tailwind CSS v3 · Express/SQLite (Server-Modus) · Electron (optional) · localStorage / Electron-IPC  
**Branch:** `claude/protocol-tool-meetings-tIoZX`  
**Push:** immer `git push -u origin claude/protocol-tool-meetings-tIoZX`

---

## Dateistruktur

```
Domenicosgro/
├── Dockerfile                     # Zweistufig: Vite-Build → Express-Produktionsimage
├── docker-compose.yml             # Synology/Linux-Deployment (/data, /logs als Volumes + SMTP-ENV)
├── deploy-nas.ps1                 # Ein-Befehl-Deploy auf Synology NAS via SSH (build→save→scp→swap)
├── deploy-nas.config.example.ps1  # Vorlage für NAS-Zugangsdaten (nie committen: .config.ps1)
├── start-local.ps1                # Windows-Start-Skript: baut Image, startet Container, setzt PUBLIC_URL
├── start-local.config.example.ps1 # Vorlage für SMTP-Zugangsdaten (nie committen: .config.ps1)
├── build-deploy.ps1               # Optionaler Deploy-Build
├── package.json                   # Frontend + Electron-Abhängigkeiten
├── index.html                     # PWA-Einstieg (manifest, sw.js, apple-touch-icon)
├── vite.config.mjs
├── tailwind.config.mjs            # borderRadius: 0 auf theme-Ebene (Flat Design)
├── postcss.config.mjs
│
├── public/
│   ├── logo.png                   # Dunkles (K)-Logo → Wasserzeichen, PWA-Icon, Favicon
│   ├── icon.png                   # Alternatives Icon
│   ├── favicon.png
│   ├── manifest.json              # PWA-Manifest (name, icons, display: standalone)
│   ├── sw.js                      # Service Worker (network-first, Cache-Fallback)
│   ├── de.aff / de.dic            # Deutsche Wörterbücher für nspell
│
├── src/
│   ├── App.jsx                    # Routing (view-State): home|protocols|editor|project-contacts|dashboard|project-dashboard
│   ├── main.jsx                   # React-Einstiegspunkt
│   ├── index.css                  # Design-System (Tailwind-Components + Print-CSS + Wasserzeichen)
│   ├── utils.js                   # Datenmodelle, Helper-Funktionen
│   ├── crypto.js                  # AES-GCM Verschlüsselung für Projektkontakte
│   ├── attachmentStore.js         # Anhang-Abstraktion: IndexedDB (Web) / userData (Electron)
│   ├── serverEvents.js            # SSE-Client für Live-Updates zwischen Nutzern
│   ├── exportDocx.js              # Word-Export einzelne Protokolle
│   ├── exportParticipantsList.js  # Word-Export Beteiligtenliste (7 Spalten)
│   ├── spellcheck.worker.js       # nspell Deutsch (Web Worker)
│   │
│   ├── components/
│   │   ├── ProjectsHome.jsx       # Startseite: Projektliste, Favoriten, Passwortschutz, PWA-Install, Projekt-Import
│   │   ├── ProjectManager.jsx     # Kontaktverwaltung (Gewerk-Spalte, Sort, Drag & Drop, CSV)
│   │   ├── ProjectDashboard.jsx   # Projekt-Übersicht (Kacheln, Kennzahlen)
│   │   ├── TileSidebar.jsx        # Schnellzugriff-Kacheln (Dokument-/URL-Links) im Editor
│   │   ├── BeteiligtenModal.jsx   # Projektbeteiligtenliste (Druck, Excel, Word)
│   │   ├── ProtocolList.jsx       # Protokollliste eines Projekts (+ updatedBy-Anzeige, Projekt-Export)
│   │   ├── ProtocolEditor.jsx     # Protokoll-Editor (Hauptkomponente)
│   │   ├── MeetingHeader.jsx      # Metadaten (Datum, Ort, Vorgänger, Projektlink)
│   │   ├── ParticipantsList.jsx   # Teilnehmerliste im Protokoll
│   │   ├── AgendaDraft.jsx        # Tagesordnungs-Entwurf (hierarchisch unter Vorgänger-Hauptpunkten)
│   │   ├── AgendaEmailModal.jsx   # Agenda per E-Mail versenden
│   │   ├── AgendaItems.jsx        # Agenda-Punkte-Liste
│   │   ├── ProtocolItems.jsx      # Protokollpunkte (rich text, Drag & Drop, Anhänge)
│   │   ├── ActionItems.jsx        # Maßnahmen/Aufgaben-Liste
│   │   ├── NotesSection.jsx       # Allgemeine Bemerkungen (rich text)
│   │   ├── RichTextEditor.jsx     # Tiptap-Editor (Bold/Italic/Underline/Strike/Listen)
│   │   ├── SpellCheckTextarea.jsx # Textarea mit Rechtschreibprüfung
│   │   ├── GesamtprotokollModal.jsx # Gesamtprotokoll-Druck über Vorgänger-Kette
│   │   ├── MassnahmenDashboard.jsx  # Projektübergreifende Maßnahmen-Übersicht
│   │   ├── LogoUpload.jsx         # Logo hochladen/löschen
│   │   ├── LoginScreen.jsx        # Login-Maske (Server-Modus)
│   │   └── AdminPanel.jsx         # Benutzerverwaltung + E-Mail-Status/Test (Server-Modus)
│   │
│   └── hooks/
│       ├── useProtocols.js        # CRUD + syncProjectName + refetchProtocols
│       ├── useProjects.js         # CRUD Projekte + importProject + refetchProjects
│       ├── useLogo.js             # Logo (localStorage / Electron)
│       ├── useSpellCheck.js       # Rechtschreibprüfung (Web Worker)
│       └── useUserSettings.js     # Benutzereinstellungen (Server-Modus)
│
├── server/
│   ├── index.js                   # Express-Server: REST-API, Auth, E-Mail-Endpunkte, SSE
│   ├── mailer.js                  # E-Mail-Abstraktion: Microsoft Graph (OAuth2) + SMTP-Fallback
│   ├── db.js                      # better-sqlite3 Setup + Migrationen (DB_PATH-aware)
│   ├── auth.js                    # Session-Token-Authentifizierung (opak, 8h TTL), Benutzer-CRUD
│   ├── attachments.js             # Anhang-Endpunkte (Datei-Upload/-Download)
│   ├── pm2.config.js              # PM2-Konfiguration für direkten Linux-Betrieb
│   └── package.json               # Nur Server-Abhängigkeiten (kein Electron, kein Vite)
│
└── electron/
    ├── main.js                    # Electron-Hauptprozess
    ├── preload.js                 # Electron-Preload (IPC-Bridge)
    ├── msalAuth.js                # Microsoft-Login (MSAL)
    ├── graphClient.js             # Microsoft Graph API
    ├── icon.ico / icon.icns / icon.svg
    └── make_icons.py
```

---

## Betriebsmodi

| Modus | Datenhaltung | Authentifizierung |
|---|---|---|
| **Web/Docker** | SQLite via REST-API | Session-Token (LoginScreen, 8h TTL) |
| **Electron** | JSON-Dateien via IPC | Microsoft MSAL (optional) |
| **Local-Dev** | localStorage / IndexedDB | keine |

Erkennung: `window.__SERVER_MODE__` (injiziert von Express), `window.electronAPI` (Preload).

---

## Deployment (Windows / Docker)

### deploy-nas.ps1 – Ein-Befehl-Deploy auf die Synology NAS (Produktiv)
```powershell
.\deploy-nas.ps1
```
Ablauf: `docker build` → `docker save` → `scp -O` auf die NAS → SSH-Befehl tauscht
Container (`stop`/`rm`/`load`/`compose up -d`). Komplett passwortlos via SSH-Key.

**NAS-Voraussetzungen (einmalig):**
- Lokaler Benutzer `Deploy` in Gruppe `administrators` (SSH aktiviert)
- SSH-Key hinterlegt (`ssh-copy-id` bzw. `authorized_keys`)
- Passwortloses sudo nur für docker:
  `/etc/sudoers.d/deploy-docker` → `Deploy ALL=(ALL) NOPASSWD: /usr/local/bin/docker`
- Eigene NAS-Werte (IP/User) in `deploy-nas.config.ps1` (nicht in Git)

**Stolpersteine (bereits gelöst, siehe Kommentare im Skript):**
- `scp -O` erzwingt klassisches SCP-Protokoll (Synology hat **kein** SFTP-Subsystem)
- Here-String wird per `-replace "`r`n","`n"` von CRLF auf LF gestellt (sonst stolpert bash)
- Remote-Befehle nutzen **vollen Pfad** `/usr/local/bin/docker` (non-interaktives SSH
  hat `/usr/local/bin` nicht im PATH → sonst greift NOPASSWD-Regel nicht)
- Skript ist **reines ASCII** (PowerShell 5.1 ANSI-Encoding verträgt keine Umlaute/Sonderzeichen)

**Datenmigration PC → NAS:** DB liegt im Volume `/volume1/docker/komplizen-protokolle/data/`
(`komplizen.db` + `-shm`/`-wal` + `attachments/`). Beim Umzug Container stoppen, Dateien kopieren.

### start-local.ps1 (lokaler Test auf dem PC)
```powershell
# Ermittelt Windows-LAN-IP automatisch via Get-NetIPAddress
# Übergibt sie als PUBLIC_URL an den Docker-Container
# → Einladungs-E-Mails enthalten den korrekten LAN-Link
.\start-local.ps1
```

SMTP-Zugangsdaten in `start-local.config.ps1` (Datei nicht in Git – nur `*.config.example.ps1` liegt im Repo).

### Wichtig: Docker kennt nur die interne Bridge-IP (172.17.0.2)
`os.networkInterfaces()` im Container sieht **nicht** die Windows-LAN-IP.  
→ Fix: `start-local.ps1` setzt `PUBLIC_URL=http://<windows-ip>:3000` als Umgebungsvariable.  
→ `getAppUrl(req)` in `server/index.js` nutzt `PUBLIC_URL` vorrangig.
→ Auf der NAS wird `PUBLIC_URL` direkt in `docker-compose.yml` gesetzt.

### docker-compose.yml (NAS) – Umgebungsvariablen
`PORT`, `HOST`, `PUBLIC_URL`, `DB_PATH=/data`, `LOG_PATH=/logs` sowie der SMTP-Block
(`SMTP_HOST/PORT/SECURE/USER/PASS/FROM`). **`SMTP_PASS` wird nur lokal auf der NAS
eingetragen, niemals in Git committen** (im Repo steht der Platzhalter `DEIN-PASSWORT-HIER`).
Nach Änderung an ENV-Variablen: Container **löschen und neu erstellen** (nicht nur „Starten").

---

## PWA (Progressive Web App)

- `public/manifest.json` – Name, Icons (`logo.png`), `display: standalone`
- `public/sw.js` – Service Worker (network-first, offline-Fallback via Cache)
- `index.html` – registriert SW, setzt `theme-color`, `apple-touch-icon`
- Install-Prompt in `ProjectsHome.jsx` via `beforeinstallprompt`-Event
- **Edge:** PWA-Installation funktioniert auch ohne HTTPS (LAN-Betrieb)
- **Chrome:** benötigt HTTPS oder `localhost`; Workaround über Flag `chrome://flags/#unsafely-treat-insecure-origin-as-secure`

### Auto-Update-Hinweis (Server-Modus)
- `vite.config.mjs` erzeugt pro Build eine `BUILD_ID` (Timestamp), backt sie als
  `__BUILD_ID__` ins Bundle **und** liefert sie als `dist/version.json` aus.
- `App.jsx` pollt `version.json` (alle 60 s + bei Tab-Fokus). Weicht die ID von
  `__BUILD_ID__` ab → `WebUpdateBanner` „Neue Version verfügbar" mit „Jetzt neu laden".
- Nutzer müssen das Programm **nicht beenden**; DB liegt im `/data`-Volume (kein
  Verlust beim Container-Tausch), Sessions überleben den Neustart. Nach Deploy
  reicht ein Neuladen (Banner-Button oder Strg+Umschalt+R).

---

## E-Mail-Versand (server/mailer.js + server/index.js)

**Zwei Versandwege, gekapselt in `server/mailer.js`** (`mailerStatus`, `verifyMailer`, `sendMail`):

1. **Microsoft Graph (OAuth2, bevorzugt)** – aktiv, sobald `GRAPH_TENANT_ID`,
   `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET` und `GRAPH_SENDER` gesetzt sind.
   Client-Credentials-Flow (`grant_type=client_credentials`,
   `scope=…/.default`) → Token gecacht → `POST /v1.0/users/{sender}/sendMail`.
   **Kein Passwort, keine MFA** → funktioniert trotz Microsoft-365-Sicherheitsstandards.
2. **SMTP (nodemailer, Fallback)** – nur wenn keine `GRAPH_*`-Variablen gesetzt,
   aber `SMTP_HOST` vorhanden. ⚠ Mit aktiven Sicherheitsstandards **gesperrt**
   (Basic-Auth deaktiviert, App-Kennwörter nicht verfügbar).

**Warum Graph?** Auf `Protokoll@ghbarchitekten.de` ist MFA erzwungen (Authenticator).
SMTP/Basic-Auth scheitert dann immer; App-Kennwörter sind durch die Sicherheitsstandards
gesperrt (im „Anmeldemethode hinzufügen"-Dialog fehlt der Eintrag). Graph App-only
umgeht das komplett.

- App-Link via `getAppUrl(req)` → nutzt `PUBLIC_URL` oder Request-Host
- `Logo_Komplizen_sky1.png` als CID-Inline-Anhang (Graph: `isInline:true` + `contentId`)
- Einladungs-E-Mail: Zugangsdaten-Box + PWA-Installationsanleitung (Edge primär, Chrome-Flag als Fallback)
- `from`-Header wird zu `{ emailAddress: { address: GRAPH_SENDER, name } }` geparst
  (Adresse bleibt das authentifizierte Postfach, nur Anzeigename überschreibbar)

**Endpunkte:**
- `GET  /api/admin/smtp-status` – `{ configured, mode: 'graph'|'smtp', host }` (Admin)
- `POST /api/admin/smtp-test`   – `verifyMailer()` (Graph: Token holen / SMTP: verify)
- `POST /api/actions/send-email` – Maßnahmen-Mail; **From** = zentrale Adresse,
  **Reply-To** = E-Mail des eingeloggten Nutzers (`db.users.get(req.user).email`),
  Anzeigename im From-Header

**Einrichtung Microsoft Graph (einmalig, durch Admin):**
1. **entra.microsoft.com** → *Identität → Anwendungen → App-Registrierungen* → **Neue Registrierung**
   (z.B. `Komplizen-Protokoll-Mailer`, nur eigener Mandant)
2. **Anwendungs-(Client-)ID** und **Verzeichnis-(Mandanten-)ID** notieren
3. *Zertifikate & Geheimnisse* → **Neuer geheimer Clientschlüssel** → **Wert** kopieren
   (nur einmal sichtbar! Nicht die „Geheimnis-ID")
4. *API-Berechtigungen* → **Berechtigung hinzufügen** → *Microsoft Graph* →
   **Anwendungsberechtigungen** → `Mail.Send` → **Administratorzustimmung erteilen** (grüner Haken)
5. Werte in `docker-compose.yml` auf der NAS eintragen (`GRAPH_*`), Container **neu erstellen**
6. Test über AdminPanel → „Verbindung testen"

> **Hinweis Sicherheit:** `Mail.Send` als App-Berechtigung erlaubt theoretisch Versand
> als *jedes* Postfach. Optional über eine **Application Access Policy** (Exchange Online
> PowerShell) auf `GRAPH_SENDER` einschränken.

**SMTP-Fallback-Einrichtung (nur falls Graph nicht genutzt wird):**
1. admin.microsoft.com → Benutzer → `Protokoll@…` → E-Mail → **E-Mail-Apps verwalten**
   → Häkchen **Authentifiziertes SMTP** setzen
2. Exchange Admin Center → sicherstellen, dass org-weites **„SMTP-AUTH deaktivieren"** **aus** ist
3. Sicherheitsstandards müssen **deaktiviert** sein (sonst Basic-Auth gesperrt)
4. `SMTP_PASS` in `docker-compose.yml` eintragen, Container neu erstellen

---

## Datenmodelle (utils.js)

### Projekt
```js
{
  id, name, contacts: [...],
  passwordHash,                   // Legacy: SHA-256 Hash (vor Verschlüsselung)
  isEncrypted,                    // true wenn AES-GCM aktiv
  encryptedContacts,              // Base64-verschlüsselte Kontakte
  cryptoSalt, cryptoIv,          // PBKDF2-Salt + AES-IV
  hoaiServices: [...],            // HOAI-Leistungsbilder (optional)
  linkedFolders: [...],           // verknüpfte Synology-Freigabe-Links
  tiles: [...],                   // Schnellzugriff-Kacheln (für alle Protokolle des Projekts)
  createdAt, updatedAt
}
```

### Kontakt
```js
{ id, name, company, gewerk, role, email, phone }
```

### Protokoll
```js
{
  id, meetingType, projectName, projectId,
  date, time, location, nextMeeting, nextMeetingTime,
  preparedBy, notes,
  predecessorId, isClosed, closedAt,
  updatedBy,                      // Anzeigename des letzten Bearbeiters (Server-Modus)
  participants: [...],
  agenda: [...],                  // Tagesordnungs-Entwurf
  agendaSentAt, agendaGreeting,
  agendaItems: [...],             // Protokollpunkte
  actionItems: [...],
  createdAt, updatedAt
}
```

### Protokollpunkt (agendaItem)
```js
{
  id, no, topic, discussion, result, level (1|2|3),
  status ('offen'|'erledigt'),
  assignedTo, carriedGray, carriedFromId,
  linkedFromAgendaId,             // Link auf Agenda-Entwurfspunkt
  createdAt, attachment: { name, mimeType, size, id: attachmentId }
}
```
Anhänge werden **nicht** im Protokoll-Objekt gespeichert. Nur `attachment.id` bleibt.  
Daten liegen in: Web → IndexedDB `bb_attachments_v1` | Electron → `userData/attachments/{id}`  
Abstraktion: `src/attachmentStore.js` → `attachmentStore.save/load/remove(id, base64?)`

### Maßnahme (actionItem)
```js
{
  id, no, description, responsible, deadline,
  status ('offen'|'in_arbeit'|'erledigt'|'verschoben'),
  priority ('hoch'|'mittel'|'niedrig'),
  remarks, carriedFromId, completedAt, protocolItemId
}
```

---

## Design-System

**Flat Design:**
- Keine runden Ecken: `borderRadius: 0` in `tailwind.config.mjs` auf theme-Ebene
- Keine Schatten: `.card` → `border border-gray-200`, kein `shadow-sm`
- Body-Hintergrund: `bg-gray-100`

**Wasserzeichen (index.css):**
```css
body::after {
  content: '';
  position: fixed; inset: 0;
  background: url('/logo.png') no-repeat center center / 580px 580px;
  opacity: 0.12; pointer-events: none; z-index: 1;
  filter: sepia(1) saturate(2) hue-rotate(185deg) brightness(4.5); /* → sky-blau */
}
/* Im Druck ausgeblendet: body::after { display: none !important } */
```

**Komponenten-Klassen (index.css):**
```
.btn-primary   → brand-600
.btn-secondary → weißer Hintergrund, gray-300 Border
.btn-ghost     → transparent
.btn-danger    → rot
.input         → border-gray-300, focus:ring-brand-500
.card          → bg-white border border-gray-200
.badge-*       → blue/green/yellow/red/gray
```

**Farben:** `brand: { 50, 100, 500, 600, 700, 900 }` (Blautöne)

---

## Wichtige Muster & Logik

### Daten-Refresh ohne Navigationsverlust
`useProtocols` und `useProjects` exportieren `refetchProtocols` / `refetchProjects`.  
`App.jsx` kombiniert sie in `handleRefresh` und gibt ihn als `onRefresh`-Prop an `ProtocolList` und `ProtocolEditor` weiter.  
→ **Niemals `window.location.reload()`** in diesen Komponenten verwenden – das setzt den view-State zurück.

### Server-Modus: Daten-Race beim Start (gelöst)
Beim App-Start feuern die Hooks ihren ersten Fetch, **bevor** der Auth-Check
(`/api/auth/me`) fertig ist → die Requests liefen ins 401 und der State blieb leer
(„keine Projekte, erst nach Refresh da"). Fix: Sowohl `handleLogin` (nach LoginScreen)
als auch der **erfolgreiche `/api/auth/me`-Pfad** (gespeicherter Token gültig) rufen
`handleRefresh()` auf → Daten werden mit gültigem Token frisch nachgeladen.

### Projekt öffnen → direkt zur Protokollliste
`ProjectsHome` öffnet ein Projekt per `onOpenProject` (view `protocols`), **nicht**
über `project-dashboard`. Der `project-dashboard`-View (`ProjectDashboard.jsx`, früher
HOAI-Übersicht) wird derzeit nicht mehr angesteuert; auch die HOAI-Fortschrittsanzeige
in den Projektkarten ist entfernt (`calcProjectProgress` bleibt nur in `utils.js`).

### Server-Modus: Live-Updates via SSE
`src/serverEvents.js` abonniert `/api/events` (Server-Sent Events).  
Die Hooks reagieren auf `protocol`/`project`-Events und aktualisieren den State gezielt, ohne alle Daten neu zu laden.

### Wer hat zuletzt bearbeitet (updatedBy)
`handleUpdateProtocol` in `App.jsx` fügt `updatedBy: serverUser.displayName` in jeden Patch ein.  
`ProtocolList.jsx` zeigt `p.updatedBy` in der Protokollzeile an.

### Projektkontakte-Verschlüsselung (crypto.js)
- PBKDF2 zum Schlüssel ableiten (Salt in `project.cryptoSalt`)
- AES-GCM Verschlüsselung, IV in `project.cryptoIv`
- Entschlüsselte Kontakte nur in `decryptedContacts`-State (nie persistiert)
- `projectCryptoKeys` hält den abgeleiteten Schlüssel pro Projekt im Speicher

### Projekt-Protokoll-Verknüpfung
- `protocol.projectId` → Fremdschlüssel auf `project.id`
- `protocol.projectName` → denormalisierte Kopie (für Anzeige/Export)
- `handleUpdateProject()` ruft `syncProjectName(projectId, name)` auf → alle Protokolle kriegen den neuen Namen

### Vorgänger-Kette (Protokollreihe)
- `protocol.predecessorId` → ID des Vorgänger-Protokolls
- `getChainNo(protocol, allProtocols)` → Position in Kette (1-basiert), `null` = standalone
- `buildProtocolNo(projectName, date, chainNo, meetingType)` → z.B. `2 - BB-MeinProjekt_29.04.2026`
- Carryover: `useEffect` in ProtocolEditor, Guard via `carriedForRef` (verhindert Doppelübernahme in React Strict Mode)

### Vorgänger-Dropdown (MeetingHeader.jsx)
- Zeigt Protokolle aus **demselben Projekt** (`projectId` gleich) **und** aus
  ★-markierten Projekten (`bb_project_favorites` in localStorage)
- Sortiert nach Datum absteigend
- Hinweistext warnt, wenn kein Projekt zugeordnet **und** keine Favoriten gesetzt sind

### Agenda-Entwurf (AgendaDraft.jsx) – hierarchisch
- Die **Hauptpunkte des Vorgängerprotokolls** (Protokollpunkte mit `level===1` und
  **ohne** `linkedFromAgendaId`) erscheinen als unveränderbare Abschnitts-Überschriften (`sectionItems`)
- Neue Agendapunkte werden über **„Punkt hinzufügen"** unter einem bestehenden Hauptpunkt
  eingefügt → bekommen `linkedProtocolItemId = <Hauptpunkt-ID>`
- Der globale Button **„Neuer Hauptpunkt"** ist **nur sichtbar, wenn noch keine
  Hauptpunkte existieren** (Fallback für standalone-Protokolle)
- Thema-Feld ist eine **mehrzeilige Textarea** (vertikal vergrößerbar)
- `moveUp`/`moveDown` wirken nur innerhalb desselben Abschnitts

### Protokoll abschließen
- `promoteAgenda()` übernimmt nur Agenda-Punkte ohne `linkedFromAgendaId` in `agendaItems`
- Nach Abschluss: `isClosed=true`, Editor read-only

### Rich-Text Editor (RichTextEditor.jsx)
- Tiptap mit StarterKit + Underline + Placeholder
- `toHtml(str)` – Legacy-Plaintext → HTML
- `stripHtml(html)` – für Suche/Print
- `lastEmittedRef` – verhindert Cursor-Jump bei externen State-Updates
- Auto-Erkennung: `- ` → BulletList, `1. ` → OrderedList

### Kontaktliste (ProjectManager.jsx)
- Spalten: Name · Firma · Gewerk · Funktion · E-Mail · Telefon
- **Sort:** Header-Klick cycled asc→desc→clear; deaktiviert Drag & Drop
- **Drag & Drop:** HTML5 Drag API, `dragRef`/`dropTarget`
- **CSV:** Export UTF-8 BOM + Semikolon; Import mit Auto-Erkennung `;` vs `,`

### Gesamtprotokoll (GesamtprotokollModal.jsx)
- `buildChain()` geht Vorgänger-Kette rückwärts durch
- Druck via verstecktem `<iframe>` (kein Popup-Blocker)
- Nur sichtbar wenn `chainNo !== null`

### Export
- **Word (Protokoll):** `exportDocx.js` via `docx` npm-Paket
- **Word (Beteiligtenliste):** `exportParticipantsList.js`, 7 Spalten
- **CSV:** Semikolon + UTF-8 BOM
- **Print/PDF:** `window.print()`, `@page A4`

### Projekt-Export / -Import (ganzes Projekt)
- **Export:** Button in `ProtocolList.jsx` (`handleExportProject`) – lädt JSON mit
  `{ exportVersion, exportType: 'project', exportedAt, project, protocols }`.
  Kontakte werden **entschlüsselt** exportiert; Passwortschutz-/Crypto-Felder werden
  im Export geleert (kein `passwordHash`, `encryptedContacts`, `cryptoSalt`, `cryptoIv`).
  **Anhänge sind nicht enthalten** (liegen nur lokal in IndexedDB/userData).
- **Import:** Button in `ProjectsHome.jsx` → `App.handleImportProject`.
  Vergibt **neue IDs** für Projekt und alle Protokolle, remappt `predecessorId`
  über eine `idMap`, hängt alle Protokolle an die neue `projectId`.
- Hook: `useProjects.importProject(data)` (analog zu `importProtocol`).

---

## Bekannte Fallstricke

1. **React Strict Mode** führt Effects doppelt aus → `carriedForRef` Guard in ProtocolEditor
2. **Tiptap controlled input:** `lastEmittedRef` unterscheidet eigene Änderungen von externen
3. **Vorgänger-Dropdown:** zeigt Protokolle aus **gleichem Projekt** + aus `★`-markierten Projekten
4. **ParticipantsList** (Teilnehmer im Protokoll) ≠ **BeteiligtenModal** (Projektbeteiligtenliste)
5. **`promoteAgenda()`** prüft `existingLinkedIds` vor Erstellung – sonst Duplikate
6. **Docker-interne IP:** `os.networkInterfaces()` im Container gibt `172.17.0.2` zurück. Fix: `PUBLIC_URL` setzen (`start-local.ps1` lokal / `docker-compose.yml` auf NAS)
7. **`window.location.reload()`** in SPA = Navigation zurück zur Startseite. Stattdessen `onRefresh` / `refetchProtocols` nutzen
8. **SMTP Microsoft 365:** „Authentifiziertes SMTP" muss pro Benutzer aktiviert sein; org-weites „SMTP-AUTH deaktivieren" darf **nicht** gesetzt sein
9. **NAS-Deploy:** `scp -O` (kein SFTP), CRLF→LF im SSH-Befehl, voller docker-Pfad für NOPASSWD-sudo, Skript reines ASCII
10. **ENV-Änderung an docker-compose.yml:** Container muss **gelöscht und neu erstellt** werden – „Starten" allein übernimmt neue Variablen nicht
11. **Projekt-Export** enthält **keine Anhänge** (nur Metadaten); Import vergibt neue IDs und remappt `predecessorId`

---

## Git-Workflow

```bash
git add <files>
git commit -m "Beschreibung\n\nhttps://claude.ai/code/session_01XnNnKskcg4ceXSVgJcGC9U"
git push -u origin claude/protocol-tool-meetings-tIoZX
```

Bei Push-Fehlern: bis zu 4 Retries mit exponential backoff (2s, 4s, 8s, 16s).
