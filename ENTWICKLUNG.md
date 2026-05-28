# Komplizen Protokolle – Vollständige Entwicklungsdokumentation

> Stand: 2026-05-28 · Branch: `claude/protocol-tool-meetings-tIoZX`

---

## Inhaltsverzeichnis

1. [Projektübersicht](#1-projektübersicht)
2. [Tech-Stack & Abhängigkeiten](#2-tech-stack--abhängigkeiten)
3. [Dateistruktur](#3-dateistruktur)
4. [Datenmodelle](#4-datenmodelle)
5. [Datenpersistenz & Hooks](#5-datenpersistenz--hooks)
6. [Routing & App-Struktur](#6-routing--app-struktur)
7. [Komponenten – vollständige Beschreibung](#7-komponenten--vollständige-beschreibung)
8. [Hilfsfunktionen (utils.js)](#8-hilfsfunktionen-utilsjs)
9. [Export-Module](#9-export-module)
10. [Design-System](#10-design-system)
11. [Drucken & PDF](#11-drucken--pdf)
12. [Electron-Integration](#12-electron-integration)
13. [Wichtige Muster & gelöste Bugs](#13-wichtige-muster--gelöste-bugs)
14. [Git-Workflow](#14-git-workflow)

---

## 1. Projektübersicht

**Komplizen Protokolle** ist ein Besprechungsprotokoll-Tool speziell für Bauprojekte. Die App läuft in drei Modi:
- **Server-Modus** (Docker/Synology): Express + SQLite, Session-Token-Auth (opak, 8h), Mehrbenutzer, SSE-Live-Updates
- **Browser-Modus** (lokal): localStorage + IndexedDB, kein Backend
- **Electron** (Desktop): JSON-Dateien via IPC, optionaler Microsoft-Graph-Login

**Kernfunktionen:**
- Projekte mit verschlüsselter Kontaktdatenbank (AES-GCM)
- Protokolle erstellen, abschließen und in Reihen (Vorgänger-Kette) verknüpfen
- Protokollpunkte mit Rich-Text, Anhängen und Hierarchie (3 Ebenen)
- Maßnahmen/Aufgaben mit Status, Priorität, Deadline
- Tagesordnungs-Entwurf und Einladungs-E-Mail (SMTP, CID-Logo, PWA-Anleitung)
- Projektübergreifendes Maßnahmen-Dashboard
- Gesamtprotokoll über gesamte Sitzungsreihe drucken
- Export als Word (.docx), PDF (Druckdialog) und CSV
- PWA-Installation (Edge ohne HTTPS, Chrome mit HTTPS)

---

## 2. Tech-Stack & Abhängigkeiten

| Paket | Version | Zweck |
|---|---|---|
| `react` + `react-dom` | ^18.3.1 | UI-Framework |
| `vite` | ^5.4.10 | Build-Tool / Dev-Server |
| `tailwindcss` | ^3.4.15 | CSS-Framework |
| `@tiptap/react` + Extensions | ^3.22.x | Rich-Text-Editor |
| `lucide-react` | ^0.462.0 | Icon-Bibliothek |
| `docx` | ^9.6.1 | Word (.docx) Export |
| `nspell` + `dictionary-de` | — | Deutsches Rechtschreib-Wörterbuch |
| `electron` | ^33.2.0 | Desktop-App-Wrapper |
| `electron-updater` | ^6.8.3 | Auto-Update |
| `better-sqlite3` | ^12.8.0 | SQLite (Electron) |
| `express` | ^5.2.1 | HTTP-Server (Server-Modus) |
| `better-sqlite3` | ^12.8.0 | SQLite (Server-Modus + Electron) |
| `nodemailer` | — | SMTP-Einladungs-E-Mails (Server-Modus) |
| `bcryptjs` | ^2.4.3 | Passwort-Hashing |
| `@azure/msal-node` | ^5.2.2 | Microsoft-Login (Electron) |

**Build-Skripte:**
```bash
npm run dev                  # Vite Dev-Server (Browser/localStorage)
npm run electron:dev         # Electron + Vite parallel
npm run electron:build:win   # Windows Installer (.exe)
npm run electron:build:mac   # macOS DMG
.\start-local.ps1            # Docker-Container bauen + starten (Windows)
```

---

## 3. Dateistruktur

```
/
├── CLAUDE.md                      ← Kurzreferenz für Claude-Sessions
├── ENTWICKLUNG.md                 ← Diese Datei
├── Dockerfile                     ← Zweistufig: Vite-Build → Express-Produktionsimage
├── docker-compose.yml             ← Synology/Linux-Deployment
├── start-local.ps1                ← Windows-Docker-Start (setzt PUBLIC_URL automatisch)
├── start-local.config.example.ps1 ← SMTP-Vorlage
├── tailwind.config.mjs            ← Tailwind-Konfiguration (flat design, brand-Farben)
├── vite.config.mjs                ← Vite-Konfiguration
├── package.json
├── public/
│   ├── logo.png                   ← Dunkles (K)-Logo: Wasserzeichen + PWA-Icon
│   ├── manifest.json              ← PWA-Manifest
│   ├── sw.js                      ← Service Worker (network-first)
│   └── de.aff / de.dic            ← Deutsche Wörterbücher
├── server/                        ← Express-Backend (Server-Modus)
│   ├── index.js                   ← REST-API, Auth, SMTP, SSE
│   ├── db.js                      ← SQLite-Setup + Migrationen
│   ├── auth.js                    ← Session-Token-Auth (crypto.randomBytes, 8h TTL), Benutzer-CRUD
│   ├── attachments.js             ← Datei-Upload/-Download
│   └── package.json               ← Nur Server-Abhängigkeiten
├── electron/                      ← Electron-Hauptprozess
│   ├── main.js
│   ├── preload.js
│   ├── msalAuth.js                ← Microsoft MSAL-Login
│   └── graphClient.js             ← Microsoft Graph API
└── src/
    ├── main.jsx                   ← React-Einstiegspunkt
    ├── App.jsx                    ← Routing (view-State-Machine)
    ├── index.css                  ← Design-System, Print-CSS, Wasserzeichen
    ├── utils.js                   ← Datenmodelle, Helper-Funktionen
    ├── crypto.js                  ← AES-GCM Verschlüsselung
    ├── attachmentStore.js         ← IndexedDB (Web) / userData (Electron)
    ├── serverEvents.js            ← SSE-Client für Live-Updates
    ├── exportDocx.js              ← Word-Export für Protokolle
    ├── exportParticipantsList.js  ← Word-Export Beteiligtenliste
    ├── spellcheck.worker.js       ← Web Worker für nspell
    ├── components/
    │   ├── ProjectsHome.jsx        ← Startseite: Favoriten-Ansicht, HOAI-Karte, PWA-Install
    │   ├── ProjectDashboard.jsx    ← Projekt-Dashboard: HOAI-Schieberegler + Synology-Links  ← NEU
    │   ├── TileSidebar.jsx         ← Kachel-Leiste im ProtocolEditor (fixed rechts, no-print) ← NEU
    │   ├── ProjectManager.jsx      ← Kontaktverwaltung
    │   ├── BeteiligtenModal.jsx    ← Projektbeteiligtenliste (Druck/Export)
    │   ├── ProtocolList.jsx        ← Protokollliste (+ updatedBy-Anzeige)
    │   ├── ProtocolEditor.jsx      ← Protokoll-Editor (Hauptkomponente)
    │   ├── MeetingHeader.jsx       ← Metadaten des Protokolls
    │   ├── ParticipantsList.jsx    ← Teilnehmerliste im Protokoll
    │   ├── AgendaDraft.jsx         ← Tagesordnungs-Entwurf
    │   ├── AgendaEmailModal.jsx    ← Agenda-E-Mail-Dialog
    │   ├── AgendaItems.jsx         ← Agenda-Punkte-Liste
    │   ├── ProtocolItems.jsx       ← Protokollpunkte
    │   ├── ActionItems.jsx         ← Maßnahmen/Aufgaben
    │   ├── NotesSection.jsx        ← Allgemeine Bemerkungen
    │   ├── RichTextEditor.jsx      ← Tiptap-Editor-Komponente
    │   ├── SpellCheckTextarea.jsx  ← Textarea mit Rechtschreibprüfung
    │   ├── MassnahmenDashboard.jsx ← Projektübergreifende Maßnahmen-Übersicht
    │   ├── GesamtprotokollModal.jsx ← Gesamtprotokoll Druck/Vorschau
    │   ├── LogoUpload.jsx          ← Logo hochladen/löschen
    │   ├── LoginScreen.jsx         ← Login-Maske (Server-Modus)
    │   └── AdminPanel.jsx          ← Benutzerverwaltung (Server-Modus)
    └── hooks/
        ├── useProtocols.js         ← CRUD Protokolle + syncProjectName + refetchProtocols
        ├── useProjects.js         ← CRUD Projekte + refetchProjects
        ├── useLogo.js             ← Logo-Persistenz
        ├── useSpellCheck.js       ← Rechtschreibprüfung via Worker
        └── useUserSettings.js     ← Benutzereinstellungen (Server-Modus)
```

---

## 4. Datenmodelle

Alle Modelle sind in `src/utils.js` als `empty*()` Fabrik-Funktionen definiert.

### 4.1 Projekt

```js
{
  id:                uid(),      // UUID
  name:              '',         // Projektname (wird in Protokoll-Kopie gesynct)
  contacts:          [],         // Kontaktliste (siehe 4.2)
  passwordHash:      null,       // Legacy SHA-256 Hex – null nach Migration auf AES-GCM
  isEncrypted:       false,
  encryptedContacts: null,       // base64 AES-GCM Ciphertext
  cryptoSalt:        null,       // base64 32-Byte PBKDF2-Salt
  cryptoIv:          null,       // base64 12-Byte AES-GCM IV
  hoaiServices:      [],         // HOAI-Leistungsbilder (siehe 4.1.1) – default []
  linkedFolders:     [],         // verknüpfte Synology-URLs (siehe 4.1.2) – default []
  createdAt:         ISO-String,
  updatedAt:         ISO-String,
}
```

#### 4.1.1 HOAI-Leistungsbild (hoaiServices[])

```js
{
  id:          uid(),
  type:        'gebaeude',    // Schlüssel aus HOAI_LEISTUNGSBILDER
  label:       'Gebäude (§ 34)',
  phases:      { 1:0, 2:0, 3:0, 4:0, 5:0, 6:0, 7:0, 8:0, 9:0 },  // Fortschritt 0–100
  activePhase: 1,             // aktuell laufende LPH (für Karten-Anzeige)
}
```

#### 4.1.2 Verknüpfter Ordner (linkedFolders[])

```js
{ id: uid(), label: 'Pläne', url: 'https://nas.../sharing/xxxx' }
```

Nur Web-URLs (https://…). Windows-Pfade (\\server\...) werden vom Browser blockiert.

### 4.2 Kontakt (innerhalb eines Projekts)

```js
{
  id:      uid(),
  name:    '',
  company: '',
  gewerk:  '',     // Gewerk/Fachbereich (Rohbau, Elektro, …)
  role:    '',     // Funktion (Bauleiter, Architekt, …)
  email:   '',
  phone:   '',
}
```

### 4.3 Protokoll

```js
{
  id:              uid(),
  meetingType:     '',     // 'Baubesprechung' | 'Team-Besprechung' | … | custom
  projectName:     '',     // denorm. Kopie von project.name (wird bei Rename gesynct)
  projectId:       null,   // Fremdschlüssel auf project.id
  date:            today(),
  time:            '',
  location:        '',
  nextMeeting:     '',
  nextMeetingTime: '',
  preparedBy:      '',
  notes:           '',     // Rich-Text HTML
  predecessorId:   null,   // ID des Vorgänger-Protokolls
  isClosed:        false,
  closedAt:        null,
  updatedBy:       null,   // Anzeigename des letzten Bearbeiters (Server-Modus)
  participants:    [],     // siehe 4.4
  agenda:          [],     // Tagesordnungs-Entwurf, siehe 4.5
  agendaSentAt:    null,
  agendaGreeting:  '',
  agendaItems:     [],     // Protokollpunkte, siehe 4.6
  actionItems:     [],     // Maßnahmen, siehe 4.7
  tiles:           [],     // Kacheln in der Sidebar (Dokument-/URL-Links), siehe 4.8
  createdAt:       ISO-String,
  updatedAt:       ISO-String,
}
```

### 4.4 Teilnehmer (participants[])

```js
{
  id:      uid(),
  name:    '',
  company: '',
  role:    '',
  email:   '',
  present: true,   // anwesend = true / entschuldigt = false
}
```

### 4.5 Tagesordnungspunkt – Entwurf (agenda[])

```js
{
  id:                    uid(),
  no:                    '',
  topic:                 '',
  duration:              '',     // Minuten als String
  responsible:           '',
  documents:             '',
  linkedProtocolItemId:  null,   // Link zu bestehendem agendaItems.id (null = neu erstellen)
}
```

### 4.6 Protokollpunkt (agendaItems[])

```js
{
  id:                 uid(),
  no:                 '',          // z.B. '1', '1.2', '1.2.3'
  topic:              '',
  discussion:         '',          // Rich-Text HTML
  result:             '',
  level:              1,           // 1 = Hauptpunkt, 2 = Unterpunkt, 3 = Unter-Unterpunkt
  status:             'offen',     // 'offen' | 'erledigt'
  assignedTo:         '',
  carriedGray:        false,       // true = war erledigt im direkten Vorgänger → grau anzeigen
  carriedFromId:      null,        // ID des Quell-Items im Vorgänger
  linkedFromAgendaId: null,        // Link auf Agenda-Entwurfspunkt (verhindert Dopplung beim Abschließen)
  createdAt:          ISO-String,
  attachment:         null,        // { name, mimeType, data (base64), size } – max 20 MB
}
```

### 4.8 Kachel (tiles[] im Protokoll)

```js
{
  id:    uid(),
  label: '',
  kind:  'url',   // 'folder' | 'url' | 'doc'
  url:   '',
  color: 'night', // 'night' | 'sky' | 'concrete'
}
```

Kacheln werden in `TileSidebar.jsx` gerendert (fixed rechts, no-print). Klick öffnet `url` in neuem Tab. Farbe steuert Night/Sky/Concrete CI-Schema.

### 4.7 Maßnahme (actionItems[])

```js
{
  id:             uid(),
  no:             '',
  description:    '',
  responsible:    '',
  deadline:       '',          // ISO-Datum-String 'YYYY-MM-DD'
  status:         'offen',     // 'offen' | 'in_arbeit' | 'erledigt' | 'verschoben'
  priority:       'mittel',    // 'hoch' | 'mittel' | 'niedrig'
  remarks:        '',
  carriedFromId:  null,        // ID der Quell-Maßnahme im Vorgänger
  completedAt:    null,        // ISO-Timestamp wenn erledigt
  protocolItemId: null,        // Link zu agendaItem.id (wenn direkt aus Protokollpunkt erstellt)
}
```

---

## 5. Datenpersistenz & Hooks

### 5.1 useProtocols (`src/hooks/useProtocols.js`)

**Storage-Key:** `bb_protocols_v1` (localStorage) / Electron-IPC

```js
// Exportierte Funktionen:
createProtocol(initial?)   // → neue ID; merged mit emptyProtocol()
updateProtocol(id, patch)  // → setzt updatedAt automatisch
deleteProtocol(id)
duplicateProtocol(id)      // → neue ID + aktuelle Timestamps
importProtocol(data)       // → neue ID + aktuelle Timestamps
syncProjectName(projectId, name)  // → alle Protokolle mit projectId kriegen neues projectName
```

**Speicher-Mechanismus:** `useEffect` mit 400 ms Debounce löst automatisch nach jeder Änderung.

### 5.2 useProjects (`src/hooks/useProjects.js`)

**Storage-Key:** `bb_projects_v1` (localStorage) / Electron-IPC

```js
createProject()            // → neue ID
updateProject(id, patch)   // → setzt updatedAt automatisch
deleteProject(id)
```

### 5.3 useLogo (`src/hooks/useLogo.js`)

Speichert das Logo als Data-URL in `localStorage` oder via Electron-IPC.

```js
logoDataUrl   // aktuelles Logo (string | null)
updateLogo(dataUrl)
clearLogo()
```

### 5.4 useUserSettings (`src/hooks/useUserSettings.js`)

```js
const { settings, loaded, update, isFavorite, toggleFavorite } = useUserSettings(username)
```

- **Server-Modus:** `GET/PUT /api/auth/users/:username/settings` (JSON pro Benutzer).
- **Lokal/Electron:** `localStorage` unter `bb_user_settings`.
- `settings.favorites: string[]` – Array von Projekt-IDs.
- `isFavorite(id)` – boolean; `toggleFavorite(id)` – aktualisiert Favoriten-Array.
- Debounced Save (500 ms).

### 5.5 useSpellCheck (`src/hooks/useSpellCheck.js`)

Web Worker (`spellcheck.worker.js`) lädt `nspell` + `dictionary-de`. Gibt `checkWord(word)` und `getSuggestions(word)` zurück.

---

## 6. Routing & App-Struktur

`App.jsx` verwaltet einen `view`-State (einfache String-State-Machine, kein Router):

```
'home'               → <ProjectsHome>
'project-dashboard'  → <ProjectDashboard>   ← NEU
'protocols'          → <ProtocolList>
'editor'             → <ProtocolEditor>
'project-contacts'   → <ProjectManager>
'dashboard'          → <MassnahmenDashboard>
```

**Navigation:**
- Klick auf Projekt-Card → `project-dashboard`
- „Protokolle" in ProjectDashboard → `protocols`
- „Kontakte" in ProjectDashboard → `project-contacts` (mit `contactsOrigin='project-dashboard'` → zurück zum Dashboard)
- „Kontakte" in ProtocolList → `project-contacts` (mit `contactsOrigin='protocols'` → zurück zur Liste)

**Projekt-Name-Sync:**

```js
// In App.jsx
const handleUpdateProject = (projectId, patch) => {
  updateProject(projectId, patch)
  if ('name' in patch) syncProjectName(projectId, patch.name)
}
```

Dieser Wrapper wird als `onUpdate` an `ProjectsHome` und `ProjectManager` übergeben. Damit wird bei jeder Namensänderung automatisch `projectName` in allen verknüpften Protokollen aktualisiert.

---

## 7. Komponenten – vollständige Beschreibung

### 7.1 ProjectsHome

**Props:** `{ projects, protocols, onCreate, onUpdate, onDelete, onOpenProject, onOpenProjectDashboard, ... }`

- **Favoriten-Ansicht:** Standardmäßig nur favorisierte Projekte (Stern = `useUserSettings.favorites[]`). Toggle „Alle anzeigen" / „Nur Favoriten".
- Favoriten werden per `useUserSettings` server-seitig pro Nutzer gespeichert (Baustein A).
- Karten zeigen HOAI-Stand: Leistungsbild · LPH + Sky-Fortschrittsbalken (`calcProjectProgress()`).
- Klick auf Karte → `onOpenProjectDashboard(id)` → View `'project-dashboard'`.
- **Passwortschutz:** AES-GCM via `crypto.js`; Legacy-SHA-256-Hash wird beim ersten Öffnen migriert.
- Nur Protokolle aus **markierten** Projekten erscheinen im Vorgänger-Dropdown.

### 7.1a ProjectDashboard ← NEU

**Props:** `{ project, protocols, onBack, onOpenProtocols, onManageContacts, onUpdate }`

- **HOAI-Leistungsbilder:** Mehrere Leistungsbilder pro Projekt. „Leistungsbild hinzufügen"-Dropdown aus `HOAI_LEISTUNGSBILDER`. Pro Leistungsbild 9 Schieberegler (LPH 1–9, 0–100 %, Schritt 5). Aktive Phase per Kreis-Button markierbar.
- **Verknüpfte Ordner:** Liste der `project.linkedFolders`. Formular: Label + URL. „Öffnen" → `target="_blank" rel="noopener"`.
- Alle Änderungen sofort via `onUpdate(project.id, { hoaiServices/linkedFolders: ... })` gespeichert.

### 7.1b TileSidebar ← NEU

**Props:** `{ tiles, linkedFolders, onChange }`

- Vertikale, quadratische Kacheln (`w-24 h-24`) fixed rechts im ProtocolEditor. `no-print`.
- Kacheln in Night/Sky/Concrete CI-Farbschema, Hover-Wechsel.
- Plus-Kachel → Modal: Quelle (Ordner aus `linkedFolders` oder freie URL), Label, Farbe.
- Klick auf Kachel → `window.open(url, '_blank', 'noopener')`.
- Kacheln per × entfernen.

### 7.2 ProjectManager

**Props:** `{ projects, onCreate, onUpdate, onDelete, onBack, logoDataUrl }`

Kontaktliste pro Projekt mit:

| Feature | Implementierung |
|---|---|
| **Spalten** | Name · Firma · Gewerk · Funktion · E-Mail · Telefon |
| **Sort** | `sortBy[projectId] = { field, dir }` State; click auf `<SortTh>` cycled asc→desc→clear |
| **Drag & Drop** | HTML5 Drag API; `dragRef` (useRef) speichert `{ projectId, contactId, fromIdx }`; `dropTarget` State zeigt blaue Linie; disabled wenn Sort aktiv |
| **CSV Export** | UTF-8 BOM + Semikolon; `exportContactsCSV()` |
| **CSV Import** | Auto-Erkennung `;` vs `,`; Keyword-Mapping für Spalten (DE + EN); Vorschau-Modal vor Übernahme |
| **Beteiligtenliste** | öffnet `<BeteiligtenModal>` |

**CSV-Spaltenerkennung (parseCSVContacts):**
```
name    ← 'name', 'person', 'vorname', 'nachname'
company ← 'firma', 'company', 'organisation', 'unternehmen'
gewerk  ← 'gewerk', 'gewerke', 'trade'
role    ← 'funktion', 'rolle', 'role', 'position'
email   ← 'email', 'mail'
phone   ← 'telefon', 'phone', 'tel', 'mobil', 'handy'
```

### 7.3 BeteiligtenModal

**Props:** `{ project, logoDataUrl, onClose }`

Projektbeteiligtenliste mit 7 Spalten: Nr · Name · Firma · Gewerk · Funktion · E-Mail · Telefon

| Export | Details |
|---|---|
| **Drucken/PDF** | versteckter `<iframe>`; `buildPrintHtml()` generiert vollständiges HTML-Dokument |
| **Excel (CSV)** | UTF-8 BOM + Semikolon; 7 Spalten |
| **Word (.docx)** | via `exportParticipantsListDocx()` aus `exportParticipantsList.js` |

### 7.4 ProtocolList

**Props:** `{ protocols, allProtocols, project, onCreate, onOpen, onDelete, onDuplicate, onImport, onOpenImported, onBack, onManageContacts }`

- Listet alle Protokolle des gewählten Projekts
- Zeigt Protokollnummer (`buildProtocolNo()`), Datum, Status
- Import via JSON-Datei (Electron Datei-Dialog oder File-Input)

### 7.5 ProtocolEditor

**Props:** `{ protocol, protocols, projects, projectContacts, logoDataUrl, onLogoUpdate, onLogoClear, onUpdate, onBack }`

Zentrale Komponente. Enthält:

#### Carryover-Logik (Vorgänger-Übernahme)

```js
// Guard verhindert Doppel-Ausführung (React Strict Mode)
const carriedForRef = useRef(null)

useEffect(() => {
  if (!predecessor?.id || isClosed) return
  if (carriedForRef.current === predecessor.id) return   // Guard 1: Ref
  if (pendingItemCarryover.length === 0) return           // Guard 2: Daten
  carriedForRef.current = predecessor.id
  handleItemCarryover()
}, [predecessor?.id])
```

`handleItemCarryover()` und `handleActionCarryover()` sind **selbst-deduplizierend**: Sie recomputen `already`-Sets direkt aus dem aktuellen State, unabhängig von den Memos.

#### Protokoll abschließen (`handleClose`)

```js
function promoteAgenda(agenda, existingItems) {
  // Verhindert Dopplung: nur Agenda-Items promoten, die NOCH KEINEN
  // verknüpften Protokollpunkt haben (linkedFromAgendaId)
  const existingLinkedIds = new Set(existingItems.map(it => it.linkedFromAgendaId).filter(Boolean))
  const unlinked = agenda.filter(a => !a.linkedProtocolItemId && !existingLinkedIds.has(a.id))
  // ... new items werden erstellt
}
```

#### Agenda ↔ Protokollpunkte Live-Sync (`handleAgendaChange`)

Wenn ein Tagesordnungspunkt angelegt oder geändert wird:
- `linkedProtocolItemId === null` → sofort neuer Hauptpunkt in `agendaItems`, mit `linkedFromAgendaId` markiert
- `linkedProtocolItemId = existingId` → Unterpunkt nach dem Parent eingefügt
- Thema/Zuständigkeit ändern → synct sich sofort auf den verknüpften Protokollpunkt

#### Toolbar-Buttons
- **Zurück** · **Seite neu laden** (RotateCcw)
- **Gesamtprotokoll** (nur wenn `chainNo !== null`)
- **Word** · **Drucken/PDF**
- **Protokoll abschließen / öffnen**

### 7.6 MeetingHeader

**Props:** `{ protocol, protocols, projects, logoDataUrl, onLogoUpdate, onLogoClear, onChange }`

- Felder: Datum · Uhrzeit · Ort/Raum · Erstellt von · Nächste Besprechung
- **Vorgänger-Dropdown:** zeigt nur Protokolle aus `★`-Projekten; Auto-Fill Projektname wenn leer
- **LogoUpload:** eingebettet; speichert Base64 Data-URL
- Zeigt generierte Protokollnummer (`buildProtocolNo()`)

### 7.7 ParticipantsList

**Props:** `{ participants, onChange, readOnly, projectContacts }`

> ⚠️ **Nicht verwechseln mit BeteiligtenModal!** Diese Komponente ist die Teilnehmerliste **innerhalb eines Protokolls** (wer war anwesend/entschuldigt).

- Zeigt Zeilen: Nr · Name · Firma · Funktion · E-Mail · Anwesend-Checkbox
- Button **"Aus Projekt"**: kopiert Projektkontakte in die Teilnehmerliste

### 7.8 AgendaDraft

**Props:** `{ agenda, agendaGreeting, agendaSentAt, protocolItems, projectContacts, onChange, onChangeGreeting }`

Tagesordnungs-Entwurf vor der Besprechung:
- Felder pro Punkt: Nr · Thema · Dauer (min) · Zuständig · Unterlagen
- **Verknüpfen:** Dropdown wählt bestehenden Protokollpunkt (oder "Neu erstellen")
- Änderungen triggern `handleAgendaChange()` in ProtocolEditor → Live-Sync

### 7.9 AgendaEmailModal

**Props:** `{ protocol, onClose, onSent }`

- Baut Plaintext-E-Mail-Body via `buildAgendaEmailBody()` aus `utils.js`
- `mailto:`-Link öffnet Standard-E-Mail-Client
- Setzt `agendaSentAt` Timestamp nach Versand

### 7.10 ProtocolItems

**Props:** `{ items, onChange, allTasks, onTasksChange, readOnly, projectContacts }`

#### Hierarchie (3 Ebenen)

```
Level 1: Hauptpunkt       (bold, brand-blauer Randstreifen links)
Level 2: Unterpunkt       (ml-6, hellerer Randstreifen)
Level 3: Unter-Unterpunkt (ml-12, grauer Randstreifen)
```

Nummerierung: `1`, `1.1`, `1.1.1` — automatisch via `renumberItems()`

#### Nummer-Eingabe mit Auto-Reorder

Benutzer tippt neue Nummer → `handleNoBlur()`:
1. Leitet `level` aus Punkt-Anzahl ab (`"2.3"` → level 2)
2. Verschiebt Item inkl. Subtree an die richtige Position
3. `renumberItems()` normalisiert alle Nummern

#### Drag & Drop

- `DropZone`-Komponenten (schmale Balken) zwischen allen Items
- `moveSubtree()` verschiebt Item + alle Kinder als Block
- DnD deaktiviert während Suche aktiv

#### Collapse/Expand

- Hauptpunkte und Unterpunkte haben Pfeil-Toggle
- `collapsed: Set<id>` State

#### Pro-Item Aufgaben

Jeder Protokollpunkt kann direkt Aufgaben enthalten (`protocolItemId` verknüpft Maßnahme mit Punkt). Wird auch in der globalen Maßnahmenliste (`ActionItems`) mit Badge angezeigt.

#### Anhänge

- Max. 20 MB pro Datei
- Gespeichert als Base64 in `attachment: { name, mimeType, data, size }`
- In Druckansicht: jeder Anhang auf eigener Seite mit diagonalem Wasserzeichen (Item-Nummer)

#### Carry-Over-Visualisierung

- `carriedGray=true` + `status='erledigt'` → grau, durchgestrichen, Badge "Freigemeldet (Vorgänger)"
- `carriedFromId` gesetzt aber nicht gray → Badge "↩ Übernommen" (blau)
- Button "Reaktivieren" setzt `status='offen'` + `carriedGray=false`

### 7.11 ActionItems

**Props:** `{ items, onChange, agendaItems, projectContacts }`

Maßnahmenliste mit:
- Status-Farb-Kodierung: grün (erledigt) · rot (überfällig) · blau (übernommen) · weiß (normal)
- Zeilen: Nr · Toggle · Beschreibung · Löschen
- Meta: Zuständig · Deadline · Priorität · Status · Bemerkungen
- `completedAt` wird automatisch gesetzt/gelöscht beim Status-Toggle
- Such-Highlight mit `<mark>`-Tags

### 7.12 NotesSection

**Props:** `{ notes, onChange, readOnly }`

Allgemeine Bemerkungen / Verteiler — Rich-Text via `RichTextEditor`. Read-Only mit `dangerouslySetInnerHTML`.

### 7.13 RichTextEditor

**Props:** `{ value, onChange, placeholder? }`

Tiptap-basierter Editor.

**Extensions:**
- `StarterKit` (Heading/CodeBlock/Blockquote/HR/Code **deaktiviert**)
- `Underline`
- `Placeholder`

**Toolbar:** B · I · U · S | • · 1.

**Besonderheiten:**
```js
// Verhindert Cursor-Reset bei externen State-Updates
const lastEmittedRef = useRef(null)
// In onUpdate: lastEmittedRef.current = html; onChange(html)
// In useEffect: if (incoming === lastEmitted) return   // eigene Änderung → skip
//               editor.commands.setContent(incoming, false)  // extern → übernehmen
```

**Auto-Erkennung:**
- `- ` oder `* ` am Zeilenanfang → BulletList (StarterKit Input Rules)
- `1. ` am Zeilenanfang → OrderedList

**Hilfsfunktionen (exportiert):**
```js
stripHtml(html)    // → Plaintext (für Suche, Print-Zusammenfassungen)
toHtml(str)        // → HTML (konvertiert Legacy-Plaintext; erkennt <-Tags)
```

### 7.14 GesamtprotokollModal

**Props:** `{ protocol, protocols, logoDataUrl, onClose }`

- `buildChain(protocol, allProtocols)` → Vorgänger-Kette von ältester zur aktuellen Sitzung
- Vorschau im Modal: Tabelle pro Sitzung (Nr · Erstellt · Thema · Inhalt · Zugewiesen · Status)
- Druck via verstecktem `<iframe>` (kein Popup-Blocker)
- Nur aufrufbar wenn `chainNo !== null` (Protokoll ist Teil einer Reihe)

---

## 8. Hilfsfunktionen (utils.js)

```js
uid()                              // → 7-stelliger base36 String
today()                            // → 'YYYY-MM-DD'
formatDate(iso)                    // → 'DD.MM.YYYY'

// Protokoll-Nummerierung
getMeetingAbbrev(meetingType)      // → 'BB' | 'TB' | 'PB' | 'JF' | Initialen
getChainNo(protocol, allProtocols) // → Position in Vorgänger-Kette (1-basiert) | null
buildProtocolNo(projectName, date, chainNo, meetingType)
// → z.B. '2 - BB-MeinProjekt_29.04.2026'

// Passwort
hashPassword(password)             // async; SHA-256 via Web Crypto API → Hex-String

// Status/Priorität
statusBadge(val)                   // → { value, label, color } aus ACTION_STATUSES
priorityBadge(val)                 // → { value, label, color } aus PRIORITIES

// Agenda-E-Mail
buildAgendaEmailBody(protocol)     // → Plaintext für mailto:

// HOAI
HOAI_LEISTUNGSBILDER                      // 5 Einträge { type, label }
HOAI_PHASEN                               // { 1: 'Grundlagenermittlung', … 9: 'Objektbetreuung' }
emptyHoaiService(type?)                   // → { id, type, label, phases{1..9: 0}, activePhase: 1 }
calcProjectProgress(hoaiServices)         // → Ø Fortschritt 0–100

// Fabrik-Funktionen
emptyProject()                            // incl. hoaiServices: [], linkedFolders: []
emptyContact()
emptyProtocol()                           // incl. tiles: []
emptyParticipant()
emptyAgendaDraftItem()
emptyAgendaItem(level)
emptyActionItem()
emptyTile(color?)                         // → { id, label:'', kind:'url', url:'', color }
```

**Konstanten:**
```js
MEETING_TYPES = ['Baubesprechung', 'Team-Besprechung', 'Projektbesprechung', 'Jour Fixe']

ACTION_STATUSES = [
  { value: 'offen',      label: 'Offen',      color: 'badge-yellow' },
  { value: 'in_arbeit',  label: 'In Arbeit',  color: 'badge-blue'   },
  { value: 'erledigt',   label: 'Erledigt',   color: 'badge-green'  },
  { value: 'verschoben', label: 'Verschoben', color: 'badge-red'    },
]

PRIORITIES = [
  { value: 'hoch',    label: 'Hoch',    color: 'badge-red'    },
  { value: 'mittel',  label: 'Mittel',  color: 'badge-yellow' },
  { value: 'niedrig', label: 'Niedrig', color: 'badge-gray'   },
]
```

---

## 9. Export-Module

### 9.1 exportDocx.js — Protokoll als Word

`exportDocx(protocol, chainNo, logoDataUrl)`

Erzeugt vollständiges .docx Protokolldokument:
- Deckblatt mit Logo, Protokollnummer, Metadaten, Teilnehmerliste
- Protokollpunkte mit Hierarchie-Einrückung
- Maßnahmenliste mit Status-Symbolen
- Fußzeile mit Seitennummer

### 9.2 exportParticipantsList.js — Beteiligtenliste als Word

`exportParticipantsListDocx(project, logoDataUrl)`

7 Spalten (Prozent-Breiten): `[5, 17, 17, 14, 15, 20, 12]`
→ Nr · Name · Firma · Gewerk · Funktion · E-Mail · Telefon

Enthält Logo (links) + Titel (rechts) als Header-Tabelle, Fußzeile mit Seitennummer.

---

## 10. Design-System

### 10.1 Flat Design (seit 2026-05-20)

**tailwind.config.mjs** — alle `borderRadius`-Werte auf `0`:
```js
theme: {
  borderRadius: {
    'none': '0', 'sm': '0', DEFAULT: '0', 'md': '0',
    'lg': '0', 'xl': '0', '2xl': '0', '3xl': '0', 'full': '0',
  },
  extend: { colors: { brand: { … } }, fontFamily: { … } }
}
```

Dadurch werden **alle** `rounded-*` Tailwind-Klassen im gesamten Projekt automatisch zu 0 — keine JSX-Datei muss einzeln angepasst werden.

### 10.2 Komponenten-Klassen (index.css)

```css
.btn           → px-3 py-1.5, transition-colors, focus:ring-2
.btn-primary   → bg-brand-600, text-white
.btn-secondary → bg-white, border border-gray-300
.btn-ghost     → transparent, hover:bg-gray-100
.btn-danger    → bg-red-50, text-red-600
.input         → border-gray-300, focus:ring-brand-500
.card          → bg-white, border border-gray-200  (kein shadow)
.badge         → px-2 py-0.5, text-xs
.badge-blue/green/yellow/red/gray
```

### 10.3 Farben

```js
brand: {
  50:  '#f0f4ff',
  100: '#dce6ff',
  500: '#3b5fc0',
  600: '#2f4da8',   ← Primärfarbe (Buttons)
  700: '#243d90',
  900: '#0f1f52',
}
```

Body-Hintergrund: `bg-gray-100` → weiße Karten heben sich ab ohne Schatten.

---

## 11. Drucken & PDF

### 11.1 Print-CSS (@media print in index.css)

- `@page`: A4, Ränder `12mm 12mm 20mm 12mm`
- `.no-print`: `display: none !important` (Toolbar, Buttons, etc.)
- `.card`: kein Border, kein Shadow, kein Radius
- Inputs/Textareas: `border: none`, `background: transparent`
- Rich-Text Toolbar: ausgeblendet; ProseMirror-Chrome entfernt
- `.print-footer`: `position: fixed; bottom: 0` → Chromium wiederholt auf jeder Seite
- `.print-page-break`: `page-break-after: always`

### 11.2 Druckstruktur im ProtocolEditor

```
[hidden print:block] Agenda-Seite (print-agenda-page)
[print-page-break]
[hidden print:block] Deckblatt (print-cover-page)
[print-page-break]
[hidden print:flex]  Laufender Header (jede Seite)
[screen content]     Protokollinhalt
[print-footer]       Fußzeile (jede Seite)
[hidden print:block] Anlagen (je Anhang eine Seite mit Wasserzeichen)
```

### 11.3 Iframe-Druck (Modals)

`BeteiligtenModal` und `GesamtprotokollModal` drucken via verstecktem `<iframe>`:
```js
const iframe = document.createElement('iframe')
iframe.style.cssText = 'position:fixed;top:-9999px;…;visibility:hidden;'
document.body.appendChild(iframe)
const doc = iframe.contentDocument
doc.open(); doc.write(buildPrintHtml(…)); doc.close()
// Warten auf Logo-Bild, dann:
iframe.contentWindow.print()
setTimeout(() => document.body.removeChild(iframe), 2000)
```
Vorteil: kein Popup-Blocker-Problem, vollständige CSS-Kontrolle.

---

## 12. Electron-Integration

### 12.1 Erkennung

```js
const isElectron = typeof window !== 'undefined' && !!window.electronAPI
```

### 12.2 IPC-Kanäle (via preload.js)

| Funktion | Richtung | Beschreibung |
|---|---|---|
| `loadProtocols()` | Renderer → Main | Protokolle laden |
| `saveProtocols(data)` | Renderer → Main | Protokolle speichern |
| `loadProjects()` | Renderer → Main | Projekte laden |
| `saveProjects(data)` | Renderer → Main | Projekte speichern |
| `exportJSON(protocol)` | Renderer → Main | Protokoll als JSON speichern |
| `importJSON()` | Renderer → Main | JSON-Datei laden |
| `openAttachment(att)` | Renderer → Main | Anhang öffnen |
| `onUpdateAvailable(cb)` | Main → Renderer | Update verfügbar |
| `onUpdateDownloaded(cb)` | Main → Renderer | Update heruntergeladen |
| `installUpdate()` | Renderer → Main | Neustart + Installation |

### 12.3 macOS Titlebar

```css
body.platform-darwin {
  padding-top: env(titlebar-area-height, 40px);
  -webkit-app-region: no-drag;
}
```

### 12.4 Auto-Update Banner

Zeigt sich am unteren Rand der App:
- **Update verfügbar:** blauer Banner mit Versionsinfo
- **Update heruntergeladen:** grüner Banner mit "Jetzt neu starten"

---

## 13. Wichtige Muster & gelöste Bugs

### 13.1 React Strict Mode – Doppelter Effect

**Problem:** React Strict Mode führt `useEffect` im Entwicklungs-Modus zweimal aus. Carryover-Logik würde doppelt laufen.

**Lösung:** `carriedForRef` in `ProtocolEditor`:
```js
const carriedForRef = useRef(null)
useEffect(() => {
  if (carriedForRef.current === predecessor.id) return  // ← Guard
  carriedForRef.current = predecessor.id
  handleItemCarryover()
}, [predecessor?.id])
```

### 13.2 Duplikate beim Protokoll abschließen

**Problem:** `promoteAgenda()` erstellte doppelte Protokollpunkte, weil `handleAgendaChange()` bereits live Items erstellt und mit `linkedFromAgendaId` markiert hatte.

**Lösung:**
```js
function promoteAgenda(agenda, existingItems) {
  const existingLinkedIds = new Set(existingItems.map(it => it.linkedFromAgendaId).filter(Boolean))
  const unlinked = agenda.filter(a => !a.linkedProtocolItemId && !existingLinkedIds.has(a.id))
  // Nur wirklich neue Items promoten
}
```

### 13.3 Tiptap Cursor-Reset

**Problem:** Bei React-State-Updates ruft `editor.commands.setContent()` den Cursor an den Anfang zurück.

**Lösung:** `lastEmittedRef` unterscheidet eigene Editor-Änderungen von externen Updates:
```js
const lastEmittedRef = useRef(null)
// Im Editor onUpdate:
lastEmittedRef.current = html
onChange(html)
// Im useEffect bei prop-Änderung:
if (incoming === lastEmittedRef.current) return   // eigene Änderung → überspringen
editor.commands.setContent(incoming, false)        // externe Änderung → übernehmen
```

### 13.4 Projekt-Name-Sync

**Problem:** `protocol.projectName` war eine Kopie zum Erstellungszeitpunkt und wurde bei Umbenennung des Projekts nie aktualisiert.

**Lösung:** `syncProjectName(projectId, name)` in `useProtocols` + Wrapper `handleUpdateProject` in `App.jsx`:
```js
const handleUpdateProject = (projectId, patch) => {
  updateProject(projectId, patch)
  if ('name' in patch) syncProjectName(projectId, patch.name)
}
```

### 13.5 ParticipantsList vs BeteiligtenModal

Zwei Komponenten mit ähnlichem Namen, völlig verschiedene Funktion:

| Komponente | Zweck | Props |
|---|---|---|
| `ParticipantsList` | Teilnehmer **im Protokoll** (anwesend/entschuldigt) | `participants, onChange, readOnly, projectContacts` |
| `BeteiligtenModal` | **Projektbeteiligtenliste** (Druck/Export) | `project, logoDataUrl, onClose` |

### 13.6 Flat Design – globale Lösung

Statt alle `rounded-*` Klassen in hunderten JSX-Zeilen zu entfernen, wurde `borderRadius` im Tailwind-Theme **vollständig überschrieben**:
```js
// tailwind.config.mjs
theme: {
  borderRadius: { 'none':'0', 'sm':'0', DEFAULT:'0', 'md':'0',
                  'lg':'0', 'xl':'0', '2xl':'0', '3xl':'0', 'full':'0' },
  extend: { … }
}
```
Alle `rounded-*` Klassen erzeugen automatisch `border-radius: 0`.

---

## 14. Git-Workflow

```bash
# Entwickeln auf Feature-Branch
git add <geänderte-dateien>
git commit -m "Kurzbeschreibung der Änderung

https://claude.ai/code/session_01XnNnKskcg4ceXSVgJcGC9U"

git push -u origin claude/protocol-tool-meetings-tIoZX
```

**Bei Push-Fehlern:** bis zu 4 Retries mit exponentiellem Backoff (2s → 4s → 8s → 16s).

**Commit-Chronik (aktuell):**
```
99fac4d  Add CLAUDE.md with project context
31787cc  Switch UI to flat design: no rounded corners, no shadows
ae323f3  Sync project name to all linked protocols on rename
90d0cb0  Fix duplicate protocol items when closing a protocol
e4dc396  Add Gewerk column, sortable headers, and drag-and-drop reordering
1629d64  Add CSV export for project contact list
b9c2a5f  Add rich-text editing to protocol items and notes fields
e1ff583  Harden carryover: prevent duplicate protocol items
a9db604  Add refresh button, Gesamtprotokoll print, always-visible item dates
04968f4  Fix white screen: restore ParticipantsList, rename contacts modal
```
