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
├── docker-compose.yml             # Synology/Linux-Deployment (./data, ./logs als Volumes)
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
│   ├── App.jsx                    # Routing (view-State): home|protocols|editor|project-contacts|dashboard
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
│   │   ├── ProjectsHome.jsx       # Startseite: Projektliste, Favoriten, Passwortschutz, PWA-Install
│   │   ├── ProjectManager.jsx     # Kontaktverwaltung (Gewerk-Spalte, Sort, Drag & Drop, CSV)
│   │   ├── BeteiligtenModal.jsx   # Projektbeteiligtenliste (Druck, Excel, Word)
│   │   ├── ProtocolList.jsx       # Protokollliste eines Projekts (+ updatedBy-Anzeige)
│   │   ├── ProtocolEditor.jsx     # Protokoll-Editor (Hauptkomponente)
│   │   ├── MeetingHeader.jsx      # Metadaten (Datum, Ort, Vorgänger, Projektlink)
│   │   ├── ParticipantsList.jsx   # Teilnehmerliste im Protokoll
│   │   ├── AgendaDraft.jsx        # Tagesordnungs-Entwurf (vor Besprechung)
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
│   │   └── AdminPanel.jsx         # Benutzerverwaltung (Server-Modus)
│   │
│   └── hooks/
│       ├── useProtocols.js        # CRUD + syncProjectName + refetchProtocols
│       ├── useProjects.js         # CRUD Projekte + refetchProjects
│       ├── useLogo.js             # Logo (localStorage / Electron)
│       ├── useSpellCheck.js       # Rechtschreibprüfung (Web Worker)
│       └── useUserSettings.js     # Benutzereinstellungen (Server-Modus)
│
├── server/
│   ├── index.js                   # Express-Server: REST-API, Auth, SMTP-Einladung, SSE
│   ├── db.js                      # better-sqlite3 Setup + Migrationen
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

### start-local.ps1
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

---

## PWA (Progressive Web App)

- `public/manifest.json` – Name, Icons (`logo.png`), `display: standalone`
- `public/sw.js` – Service Worker (network-first, offline-Fallback via Cache)
- `index.html` – registriert SW, setzt `theme-color`, `apple-touch-icon`
- Install-Prompt in `ProjectsHome.jsx` via `beforeinstallprompt`-Event
- **Edge:** PWA-Installation funktioniert auch ohne HTTPS (LAN-Betrieb)
- **Chrome:** benötigt HTTPS oder `localhost`; Workaround über Flag `chrome://flags/#unsafely-treat-insecure-origin-as-secure`

---

## Einladungs-E-Mail (server/index.js)

- nodemailer mit SMTP (Microsoft 365: App-Passwort nach MFA-Aktivierung)
- App-Link via `getAppUrl(req)` → nutzt `PUBLIC_URL` oder Request-Host
- `Logo_Komplizen_sky1.png` als CID-Inline-Anhang (nur in E-Mail, nicht als Wasserzeichen)
- Enthält Zugangsdaten-Box + PWA-Installationsanleitung (Edge primär, Chrome-Flag als Fallback)

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

---

## Bekannte Fallstricke

1. **React Strict Mode** führt Effects doppelt aus → `carriedForRef` Guard in ProtocolEditor
2. **Tiptap controlled input:** `lastEmittedRef` unterscheidet eigene Änderungen von externen
3. **Vorgänger-Dropdown:** zeigt nur Protokolle aus Projekten mit `★`
4. **ParticipantsList** (Teilnehmer im Protokoll) ≠ **BeteiligtenModal** (Projektbeteiligtenliste)
5. **`promoteAgenda()`** prüft `existingLinkedIds` vor Erstellung – sonst Duplikate
6. **Docker-interne IP:** `os.networkInterfaces()` im Container gibt `172.17.0.2` zurück. Fix: `PUBLIC_URL` via `start-local.ps1` übergeben
7. **`window.location.reload()`** in SPA = Navigation zurück zur Startseite. Stattdessen `onRefresh` / `refetchProtocols` nutzen
8. **SMTP Microsoft 365:** erfordert App-Passwort (per-user MFA muss aktiviert sein, nicht nur Diensteinstellungen)

---

## Git-Workflow

```bash
git add <files>
git commit -m "Beschreibung\n\nhttps://claude.ai/code/session_01XnNnKskcg4ceXSVgJcGC9U"
git push -u origin claude/protocol-tool-meetings-tIoZX
```

Bei Push-Fehlern: bis zu 4 Retries mit exponential backoff (2s, 4s, 8s, 16s).
