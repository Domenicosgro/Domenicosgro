# Komplizen Protokolle – Vollständige Entwicklungsdokumentation

> Stand: 2026-07-26 · Branch: `claude/protocol-tool-meetings-tIoZX`

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
- Protokoll-**Untertitel** (Protokollbezeichnung) – in Kopf, Ausdruck, PDF, Word und E-Mail
- Protokollpunkte mit Rich-Text, Anhängen, Hierarchie (3 Ebenen), eigener **Frist**,
  Ein-/Ausklappen, **geerbtem Titel** vom übergeordneten Punkt und Zuständigkeit inkl. „**Info**"
- Maßnahmen/Aufgaben mit **Titel**, **Art** (Planung/Ausführung/AG/GP), Status, Priorität, Deadline
- Protokoll-**Anlagen** (beliebige Dateien) inkl. **Anlagenverzeichnis** – als E-Mail-Anhang mitsendbar
- **Notizpanel** neben dem Protokoll – parallel bearbeitbar (kein Overlay)
- Tagesordnungs-Entwurf (optionale Uhrzeit je Thema, Drag&Drop in Hauptthemen,
  abgeleitete Nummerierung) und Einladungs-E-Mail (SMTP, CID-Logo, PWA-Anleitung)
- Projektübergreifendes Maßnahmen-Dashboard (Anlegen, Auswahl-Versand, Fortschritts-Diagramm,
  eigener „Erledigt"-Bereich – auch für BIM-Issues und Planprüfung)
- **Verteiler-Terminal je Projekt**: Matrix Empfänger × Nachrichtenart steuert, wer welche
  Nachrichten erhält (Bericht, Protokoll, Freigabe, Aufgaben)
- Automatische **Wochen-/Statusberichte** (freitags) – Empfänger ausschließlich aus dem Verteiler
- **Kontakt-Sync**: Kontakte der Kategorie „Eigene Organisation" werden automatisch als
  Mitarbeiter (Personalplanung) und login-freie Benutzer gespiegelt
- **Admin-Vorschau** „Als Anwender ansehen" (rein clientseitig) + **laufende Software-Version** im Adminbereich
- Gesamtprotokoll über gesamte Sitzungsreihe drucken
- Export als Word (.docx), **PDF (serverseitig via Chrome – identisch für Druck & Versand)** und CSV
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
│   ├── index.js                   ← REST-API, Auth, SMTP, SSE, Reporting, Verteiler
│   ├── db.js                      ← SQLite-Setup + Migrationen
│   ├── auth.js                    ← Session-Token-Auth (crypto.randomBytes, 8h TTL), Benutzer-CRUD
│   ├── mailer.js                  ← Versand Graph (bevorzugt) / SMTP, cc-fähig
│   ├── pdfRender.js               ← Serverseitiges Chromium-PDF (puppeteer-core), SSRF-sicher
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
    │   ├── ProjectsHome.jsx        ← Startseite: Favoriten, Projektkacheln (einheitl. Kennzahlen)
    │   ├── ProjectDashboard.jsx    ← Projekt-Dashboard: HOAI-Schieberegler + Synology-Links
    │   ├── ProjectAdminPanel.jsx   ← Projekt-Terminal: Zugang, Co-Admins, Verteiler, Portal, Logos
    │   ├── ProjectDistribution.jsx ← Verteiler-Matrix (Empfänger × Nachrichtenart)  ← NEU
    │   ├── TileSidebar.jsx         ← Kachel-Leiste im ProtocolEditor (fixed rechts, no-print)
    │   ├── ProjectManager.jsx      ← Kontaktverwaltung
    │   ├── ContactAutocomplete.jsx ← Namensfeld mit smarter Suche (Portal-Dropdown, extraOptions)
    │   ├── BeteiligtenModal.jsx    ← Projektbeteiligtenliste (Druck/Export)
    │   ├── ProtocolList.jsx        ← Protokollliste: nach Art gruppiert, neuestes zuoberst, ausblendbar
    │   ├── ProtocolEditor.jsx      ← Protokoll-Editor (Hauptkomponente)
    │   ├── ProtocolNotesPanel.jsx  ← Andockendes Notizpanel (parallel bedienbar)  ← NEU
    │   ├── ProtocolEmailModal.jsx  ← Protokoll-/Freigabe-Versand (Empfängerwahl, Anlagen, Verteiler)
    │   ├── MeetingHeader.jsx       ← Metadaten des Protokolls (inkl. Untertitel)
    │   ├── ParticipantsList.jsx    ← Teilnehmerliste im Protokoll
    │   ├── AgendaDraft.jsx         ← Tagesordnungs-Entwurf
    │   ├── AgendaEmailModal.jsx    ← Agenda-E-Mail-Dialog
    │   ├── AgendaItems.jsx         ← Agenda-Punkte-Liste
    │   ├── ProtocolItems.jsx       ← Protokollpunkte
    │   ├── ActionItems.jsx         ← Maßnahmen/Aufgaben
    │   ├── NotesSection.jsx        ← Allgemeine Bemerkungen
    │   ├── RichTextEditor.jsx      ← Tiptap-Editor-Komponente
    │   ├── SpellCheckTextarea.jsx  ← Textarea mit Rechtschreibprüfung
    │   ├── MassnahmenDashboard.jsx ← Projektübergreifende Maßnahmen-Übersicht (+ Erstellen, Versand, Donut)
    │   ├── GesamtprotokollModal.jsx ← Gesamtprotokoll Druck/Vorschau
    │   ├── LogoUpload.jsx          ← Logo hochladen/löschen
    │   ├── LoginScreen.jsx         ← Login-Maske (Server-Modus)
    │   └── AdminPanel.jsx          ← Benutzerverwaltung + laufende Software-Version (Server-Modus)
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
  distribution:      { recipients: [] },  // Nachrichten-Verteiler (siehe 4.1.3)
  isAccessControlled: false,     // Projektzugang eingeschränkt?
  allowedUsers:      [],         // freigegebene Autoren (Usernamen)
  projectAdmins:     [],         // Co-Administratoren (Usernamen)
  projectAdminUser:  null,       // Ersteller/Eigentümer
  createdAt:         ISO-String,
  updatedAt:         ISO-String,
}
```

#### 4.1.3 Verteiler-Empfänger (distribution.recipients[])

```js
{
  id:        uid(),
  name:      '',
  email:     '',            // Pflicht; ohne @ ignoriert
  contactId: null,          // optional: verknüpfter Projektkontakt
  username:  null,          // optional: verknüpfter App-Benutzer
  scope:     'short',       // 'full' = interner Vollbericht · 'short' = gekürzte Fassung
  channels:  { report: false, protocol: false, freigabe: false, actions: false },
}
```

Kanäle (`DISTRIBUTION_CHANNELS` in utils): **report** (Wochen-/Statusbericht),
**protocol** / **freigabe** (Vorauswahl im Versanddialog), **actions** (Kopie/CC beim
Aufgabenversand). Serverseitig durch `sanitizeDistributionRecipients()` bereinigt
(valide Mail, bekannte Kanäle, nach E-Mail dedupliziert). Abgefragt via
`distributionFor(project, channel)` (Client **und** Server, spiegelbildlich).
**Ohne report-Empfänger sendet der automatische Bericht für dieses Projekt nichts.**

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
  subtitle:        '',     // freier Untertitel = Protokollbezeichnung (Kopf, Ausdruck, E-Mail)
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
  attachments:     [],     // Protokoll-Anlagen, siehe 4.9
  reviewSentAt:    null,    // Zeitpunkt „zur Freigabe versendet"
  reviewDeadline:  null,    // optionale Rückmeldefrist
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
  no:                    '',     // ⚠ nicht mehr genutzt – Nummer wird ABGELEITET
  topic:                 '',     // erbt beim Anlegen den Titel des Hauptpunkts (änderbar)
  time:                  '',     // optionale Uhrzeit des Themas (HH:MM)
  duration:              '',     // Minuten als String
  responsible:           '',
  documents:             '',
  linkedProtocolItemId:  null,   // Link zu bestehendem agendaItems.id (null = neu erstellen)
}
```

**Nummerierung ist abgeleitet** (nicht gespeichert): `{Hauptpunkt-Nr}.{Position im Abschnitt}`
(z. B. `3.1`, `3.2`) – passt sich bei **Drag & Drop** in ein anderes Hauptthema und beim
Sortieren automatisch an. `AgendaDraft` zeigt sie read-only; `buildAgendaEmailBody()` leitet
sie identisch ab. Per Drag&Drop (Griff) wird `linkedProtocolItemId` umgesetzt.

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
  deadline:           '',          // eigene Frist zur Erledigung des PUNKTS (unabhängig von Aufgaben)
  carriedGray:        false,       // true = war erledigt im direkten Vorgänger → grau anzeigen
  carriedFromId:      null,        // ID des Quell-Items im Vorgänger · fehlt = NEU in diesem Protokoll
  linkedFromAgendaId: null,        // Link auf Agenda-Entwurfspunkt (verhindert Dopplung beim Abschließen)
  createdAt:          ISO-String,
  attachment:         null,        // { name, mimeType, data (base64), size } – max 20 MB
}
```

**Neu-Markierung:** Punkte **ohne** `carriedFromId` gelten als neu und werden amber
hervorgehoben – aber nur, wenn das Protokoll auch übernommene Punkte enthält
(sonst wäre im Erstprotokoll alles amber).

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
  title:          '',          // Kurztitel – in der E-Mail die erkennbare Überschrift
  description:    '',
  art:            '',          // 'planung' | 'ausfuehrung' | 'ag' | 'gp'  (ACTION_ARTEN)
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

- `ACTION_ARTEN` (utils) ist bewusst eine **Konstante** → später leicht konfigurierbar.
- **Anlegen aus der Projekt-Maßnahmenübersicht**: `CreateActionModal` erzwingt **Titel + Beschreibung**
  und hängt die Maßnahme an das **neueste Protokoll** des Projekts → erscheint synchron am Protokollende.
- Versand: Auswahl per Haken (sonst alle sichtbaren), gruppiert nach Verantwortlichem
  (`POST /api/actions/send-email`). Die **Admin-Bestätigung** enthält dieselbe Aufgaben-Tabelle.

### 4.9 Protokoll-Anlagen (protocol.attachments[])

```js
{ id, name, mimeType, size }   // Bytes liegen im attachmentStore (Server: /api/attachments)
```
**Beliebige Dateitypen** (max. 25 MB/Datei, Mehrfachauswahl). Werden im **Anlagenverzeichnis**
am Protokollende gelistet und beim E-Mail-Versand (Protokoll **und** Freigabe) als **eigene
Dateien** angehängt – der Server lädt sie aus dem Attachment-Store, berücksichtigt nur Anlagen
des jeweiligen Protokolls (IDs aus dem Datensatz, nicht aus dem Request), im Dialog einzeln abwählbar.

### 4.10 Maßnahmen-Übernahme & Spiegel-Einträge (wichtig!)

Zwei Sonderfälle, die **projektweite Zählungen** verfälschen, wenn nicht gefiltert wird:

- **Übernommene Maßnahme:** Wird eine offene Maßnahme in ein Folgeprotokoll übernommen,
  entsteht dort eine Kopie mit `carriedFromId` → ID des Originals. Das Original bleibt im
  Vorgänger stehen (historischer Beleg). In Übersichten/Berichten zählt **nur die jüngste Kopie**.
- **Spiegel-Eintrag:** BIM-Issues und Planprüfungen werden als Maßnahme ins Protokoll gespiegelt
  (`bimIssueId` bzw. `planReviewId`). Ihr Status bleibt dauerhaft „offen" (gepflegt wird er in
  der Datenquelle) → sie zählen **nie** als reguläre Maßnahme.

Zentrale Helfer (utils, spiegelbildlich auf dem Server): `isMirrorAction(a)`,
`supersededActionIds(protocols)`, `liveActionItems(protos, allProtocols)`. Angewendet in
Maßnahmen-Dashboard, Projektkachel, Projekt-Dashboard, Protokollkarten, Bericht, Bauherren-Portal
und Freimelde-Seite – damit zählen alle Ansichten **gleich**.

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

### 7.13a ContactAutocomplete ← NEU

Wiederverwendbares **Namensfeld mit smarter Suche** – ersetzt die früheren nativen
`<datalist>`-Felder (browserabhängig, wurde in Tabellen abgeschnitten).

```jsx
<ContactAutocomplete value={x} onChange={v => …} contacts={projectContacts}
                     placeholder="Zuständig…" className="input" />
```
- Treffer in **Name/Firma/E-Mail/Funktion**; **Präfix-Treffer vor Teiltreffern**
  → Vorschläge werden mit jedem Buchstaben konkreter. Freitext bleibt erlaubt.
- Tastatur: ↑/↓ navigieren, Enter übernimmt, Esc schließt.
- Dropdown per **Portal** (`position: fixed`) → **kein Clipping** in Tabellen/Scroll-Containern.
- Eingesetzt in: ProtocolItems (Zuständigkeit + Aufgaben), ActionItems, AgendaDraft,
  MeetingHeader (Erstellt von), NotizbuchView, CreateActionModal.

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

// Maßnahmen-Filter (projektweite Zählungen, siehe 4.10)
isMirrorAction(a)                  // → true für BIM-/Planprüfungs-Spiegel
supersededActionIds(protocols)     // → Set der von einer Folge-Kopie abgelösten IDs
liveActionItems(protos, all?)      // → reguläre, aktuelle Maßnahmen (ohne Spiegel/abgelöst)

// Verteiler
DISTRIBUTION_CHANNELS              // [{ key, label, hint }] – report/protocol/freigabe/actions
emptyDistributionRecipient()       // → { id, name, email, contactId, username, scope, channels }
distributionFor(project, channel)  // → Empfänger [{ name, email, scope }] (valide, dedup)

// Maßnahmen-Art
ACTION_ARTEN                       // [{ value, label }] planung/ausfuehrung/ag/gp
artBadge(val)                      // → Badge-Objekt der Art

// HOAI
HOAI_LEISTUNGSBILDER                      // 5 Einträge { type, label }
HOAI_PHASEN                               // { 1: 'Grundlagenermittlung', … 9: 'Objektbetreuung' }
emptyHoaiService(type?)                   // → { id, type, label, phases{1..9: 0}, activePhase: 1 }
calcProjectProgress(hoaiServices)         // → Ø Fortschritt 0–100

// Fabrik-Funktionen
emptyProject()                            // incl. hoaiServices, linkedFolders, distribution
emptyContact()
emptyProtocol()                           // incl. subtitle, tiles, attachments
emptyParticipant()
emptyAgendaDraftItem()
emptyAgendaItem(level)
emptyActionItem()                         // incl. title, art
emptyTile(color?)                         // → { id, label:'', kind:'url', url:'', color }
emptyDistributionRecipient()
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

### 11.0 Ein PDF für Druck UND Versand (serverseitiges Chrome) ⭐

**Wichtigste Architekturentscheidung (2026-07):** Druck und E-Mail-/Freigabe-Versand
erzeugen **dieselbe** Datei – ein **durchsuchbares, immer identisches** PDF.

Ablauf (`ProtocolEditor.buildServerPdf()`):
1. Bild-Anlagen vorladen (`flushSync` → als `data:`-URL inline im Druck-DOM)
2. **Aktuelle Druckansicht einsammeln**: `document.body.innerHTML` (Skripte entfernt)
   + gesamtes CSS aus `document.styleSheets` inline als `<style>`
3. `POST /api/protocols/:id/render-pdf` → Server rendert per **Chromium (puppeteer-core)**
   in **Print-Media** → PDF

Da dasselbe DOM + CSS in Print-Media gerendert wird, ist das Ergebnis **per Konstruktion
identisch zu `window.print()`** – nur deterministisch (Server-Chrome statt Nutzer-Browser).

- `server/pdfRender.js`: geteilte Browser-Instanz, **serialisiertes** Rendering,
  `renderHtmlToPdf()` blockiert externe Requests (nur `data:`/`blob:`) → **SSRF-sicher**;
  A4, `printBackground`, Ränder 12/12/20/12 mm, `preferCSSPageSize`.
- **Dockerfile**: System-Chromium + Schriften (`chromium`, `ttf-freefont`, `font-noto`),
  `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser` (Alpine → **kein** gebündeltes Chromium!)
- **Selbsttest**: `GET /api/pdf-selftest` (Admin) + Button im AdminPanel → Backup-Tab.
- `ProtocolEmailModal` bekommt `buildPdf` als Prop und nutzt es statt pdf-lib;
  der Dialog ist `no-print`, damit er beim Einsammeln nicht im PDF landet.
- `src/protocolPdf.js` (pdf-lib) existiert nur noch als **Fallback**.

### 11.1 Print-CSS (@media print in index.css)

- `@page`: A4, Ränder `12mm 12mm 20mm 12mm`
- `.no-print`: `display: none !important` (Toolbar, Buttons, Modals, etc.)
- `.card`: kein Border, kein Shadow, kein Radius
- Inputs/Textareas: `border: none`, `background: transparent`
- Rich-Text Toolbar: ausgeblendet; ProseMirror-Chrome entfernt
- `.print-footer`: `position: fixed; bottom: 0` → Chromium wiederholt auf jeder Seite
- `.print-page-break`: `page-break-after: always`
- **Umbruchschutz**: `break-inside: avoid` auf `.protocol-item` **und** `.protocol-item > div`
  sowie auf `.print-action-item` – sonst werden Punkte/Aufgaben am Seitenende
  angeschnitten und von der fixen Fußzeile überlagert.
- **Farben erzwungen**: `print-color-adjust: exact` (Amber „Neu"-Punkte, Ebenen-Farben)
- `.protocol-item-new`: amber Hervorhebung neu eingefügter Punkte – muss **nach** den
  Ebenen-Regeln stehen, um sie zu überschreiben.

### 11.2 Druckstruktur im ProtocolEditor

```
[hidden print:block] Agenda-Seite (print-agenda-page)
[print-page-break]
[hidden print:block] Deckblatt (print-cover-page)   ← Teilnehmerliste NUR Anwesende
[print-page-break]
[hidden print:flex]  Laufender Header (jede Seite)
[screen content]     Protokollinhalt (+ Anlagenverzeichnis am Ende)
[print-footer]       Fußzeile (jede Seite)
[hidden print:block] Anlagen (je Anhang eine Seite mit Wasserzeichen)
```

**Einklappen ist druck-sicher**: eingeklappte Unterpunkte werden **nicht** aus der Liste
gefiltert, sondern nur am Bildschirm ausgeblendet (`hidden print:block`) → im PDF vollständig.

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

## 12a. Server: E-Mail, Reporting & Verteiler

### Versandwege (`server/mailer.js`)
Microsoft **Graph** (bevorzugt, wenn `GRAPH_*` gesetzt), sonst **SMTP** (`SMTP_HOST` …).
`sendMail({ from, to, cc?, subject, html, text, replyTo?, attachments? })` – **cc** wird in
**beiden** Pfaden unterstützt (Graph: `ccRecipients`).

### Nachrichtenarten & Empfänger
| Nachricht | Auslöser | Empfänger |
|---|---|---|
| Protokoll-Versand / Freigabe | Dialog (`ProtocolEmailModal`) | Teilnehmer + Verteiler (protocol/freigabe) **vorausgewählt**, frei anpassbar |
| Aufgaben-/Maßnahmenversand | `EmailModal` je Verantwortlichem | `to` = Verantwortliche(r); **cc** = Verteiler-Kanal `actions` |
| Wochen-/Statusbericht | Cron (Fr 10:00) + `POST /api/admin/release-report-test` | **ausschließlich** Verteiler-Kanal `report` |

### Automatischer Bericht (`sendWeeklyReleaseReports`)
- Empfänger **nur** aus `distributionFor(project, 'report')`. **Kein report-Empfänger → Projekt
  übersprungen** (bewusste Entscheidung „ohne Verteiler nichts senden").
- Umfang je Empfänger: `scope:'full'` → interne Vollversion (alle Abschnitte),
  `scope:'short'` → gekürzte externe Fassung (ohne interne Abschnitte).
- Ampel & Zähler blenden Spiegel-Einträge und abgelöste Vorgänger aus (siehe 4.10).
- Auch das **Bauherren-Portal** (`collectProjectStatus`) und die **Freimelde-Seite**
  (`openTasksFor`) filtern Spiegel/abgelöste Maßnahmen.

### Speicherung
`PATCH /api/projects/:id/access` nimmt `{ isAccessControlled, allowedUsers, projectAdmins,
distribution }` entgegen; `sanitizeDistributionRecipients()` verwirft ungültige Mails/Kanäle
und dedupliziert. Nur Projekt-Manager dürfen speichern.

### Laufende Version im Adminbereich
`GET /api/system-info` (Admin): `version`, `buildId` (aus `dist/version.json`), `startedAt`,
`uptimeSec`, `node`, `platform`. Die **Build-ID** (Zeitstempel aus `vite.config.mjs`)
identifiziert den ausgerollten Stand; weicht sie von `__BUILD_ID__` im geladenen Bundle ab,
zeigt der Adminkopf „Oberfläche veraltet – neu laden".

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

### 13.3 Tiptap Cursor-Reset / Cursor springt / doppelte Buchstaben

**Problem 1:** Bei React-State-Updates ruft `editor.commands.setContent()` den Cursor an den Anfang zurück.
**Lösung 1:** `lastEmittedRef` unterscheidet eigene Editor-Änderungen von externen Updates.

**Problem 2 (2026-07):** Beim **schnellen Tippen** lief der value-Sync-Effekt gelegentlich mit
einem **veralteten** `value` (React hatte den emittierten Wert noch nicht zurückgereicht) und
setzte den Editor mitten im Tippen per `setContent()` zurück → **Cursor sprang, Buchstaben
gingen verloren/verdoppelten sich**.

**Lösung 2:** Während der Editor **fokussiert** ist (= Nutzer tippt) **nie** von außen setzen.
Externe Änderungen (z. B. Vorgänger-Übernahme) greifen bei Fokusverlust.
```js
useEffect(() => {
  if (!editor) return
  if (editor.isFocused) return                      // ← der entscheidende Guard
  const incoming = toHtml(value)
  if (incoming === toHtml(lastEmittedRef.current)) return  // eigene Änderung
  if (incoming === editor.getHTML()) return                // keine echte Änderung
  editor.commands.setContent(incoming, false)
}, [value])
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

### 13.7 pdf-lib: „WinAnsi cannot encode" (Versand schlug fehl)

**Problem:** Die pdf-lib-Standardschriften nutzen WinAnsi/CP1252 und **brechen ab**, sobald ein
Zeichen nicht kodierbar ist (z. B. Häkchen `✓`, Pfeile, Emojis) → „Versand fehlgeschlagen".

**Lösung:** `pdfSafe()` in `src/protocolPdf.js` – ersetzt gängige Symbole durch ASCII
(`✓→[x]`, `→→->`, `≥→>=` …) und tauscht alle übrigen nicht kodierbaren Zeichen gegen `?`
(Regex mit `u`-Flag → Emojis werden zu **einem** `?`). Umlaute, `€`, typografische
Anführungen/Bindestriche/Bullets bleiben erhalten (CP1252). Angewendet zentral in
`wrapText`/`drawParagraph` + an den dynamischen `drawText`-Aufrufen.

### 13.8 Umbruchfehler: Fußzeile überlagert Inhalt

**Problem:** `break-inside: avoid` galt nur auf `.protocol-item`, nicht auf der eigentlichen
(farbigen) Box `> div` bzw. gar nicht auf `.print-action-item` → Punkte/Aufgaben wurden am
Seitenende angeschnitten und von der fixen Fußzeile überlagert.

**Lösung:** Umbruch-Vermeidung auf **beiden** Ebenen sowie auf Maßnahmen (siehe 11.1).
**Grenze:** Ein Block, der **länger als eine Seite** ist, kann nicht zusammengehalten werden.

### 13.9 Kontakt-Sync „Eigene Organisation" (source='contact')

Kontakte mit `category === 'organisation'` werden **serverseitig einseitig** gespiegelt in
`staff_members` (Feld `contactKey`) und `users` (`source='contact'`, Username `kontakt:<key>`,
**leeres Passwort → kein Login**). `syncOrgContacts()` läuft nach jeder Projekt-Schreibroute
und beim Start; entfällt ein Kontakt, wird der Mirror entfernt.

**Fallstricke:**
- `users.hasAny()` ignoriert `source='contact'` – sonst könnten Mirrors den Auth-/Open-Mode erzwingen.
- Ist ein Org-Kontakt bereits echter Login-Benutzer (per E-Mail), wird **nicht** zusätzlich gespiegelt.
- Mirrors NIE von Hand löschen/bearbeiten → über die Kontaktkategorie steuern (UI-Badge „aus Kontakt").

### 13.10 Popup-Blocker bei `window.open()` nach `await`

**Problem:** `window.open(blobUrl)` **nach** einem `await fetch(...)` gilt nicht mehr als
direkte Nutzerinteraktion → wird blockiert (PDF öffnete sich nicht).
**Lösung:** Rückgabewert prüfen und auf einen `<a download>`-Klick zurückfallen.

### 13.11 Prozess-Crash-Guards (Server)

Ohne Handler beendet **ein** unbehandelter async-Fehler den gesamten Node-Prozess → **alle**
Nutzer fliegen gleichzeitig raus. `process.on('uncaughtException'|'unhandledRejection')` loggt
nach `logs/error.log` und hält den Server am Leben (Zustand liegt in SQLite/WAL, atomar).
Healthcheck + `restart: unless-stopped` bleiben das Netz für echte Hänger.
Ergänzend: `express.json` auf 100 MB begrenzt (große Uploads laufen über eigene
`express.raw`-Parser), `mem_limit: 2g` im Compose.

### 13.12 Lokale Test-Umgebung (Windows)

`node_modules` ist für die **NAS-Node-Version** gebaut → unter lokalem Node ABI-Fehler.
Vor lokalen Server-/Node-Tests: `npm rebuild better-sqlite3`, ggf. fehlende Deps
(`nodemailer`, `pdf-lib`) nachinstallieren. Für Node-Tests von ESM-Modulen mit
extensionslosen Imports: vorher mit `esbuild --bundle` bündeln.
`src/utils.js` hat **keine** Fremd-Importe → Helfer (z. B. `liveActionItems`,
`distributionFor`) lassen sich direkt per `node --input-type=module` gegen die echte Datei testen.

### 13.13 Doppelt gezählte Maßnahmen (Übersichten & Berichte)

**Problem:** Projektweite Ansichten zählten Maßnahmen ungefiltert → dieselbe Maßnahme
erschien je Protokoll der Vorgänger-Kette erneut, und BIM-/Planprüfungs-Spiegel (Status
dauerhaft „offen") wurden als offene/überfällige Aufgaben mitgezählt.
**Lösung:** Eine gemeinsame Definition „reguläre, aktuelle Maßnahme" (`liveActionItems`,
`isMirrorAction`, `supersededActionIds` – siehe 4.10), angewendet in **allen** zählenden
Ansichten (Client + Server). Die einzelnen Protokolle zeigen ihre Maßnahmen unverändert
vollständig; die Entdopplung wirkt nur projektweit.

### 13.14 Notizpanel blockierte das Protokoll

**Problem:** Das Notizfenster war ein Modal mit unsichtbarem Backdrop (`fixed inset-0`),
der jeden Klick ins Protokoll abfing → nicht parallel bedienbar.
**Lösung:** `ProtocolNotesPanel` dockt ohne Backdrop seitlich an; der Editor hält den
Offen-Zustand und hält per `md:pr-[25rem]` Platz frei (im Druck via `print:pr-0` zurückgesetzt).

### 13.15 Projektkachel wich von Maßnahmenbereich/Protokoll ab

**Problem:** Die Projektkachel zählte Aufgaben völlig ungefiltert; Null-Werte ließen Zeilen
ganz verschwinden → Kacheln waren nicht vergleichbar.
**Lösung:** `liveActionItems` auch hier; jede Kachel zeigt dieselben vier Zeilen, Null-Werte
als ruhiges graues Badge (statt zu verschwinden), Grammatik „1 Aufgabe offen".

### 13.16 PowerShell zerlegt mehrzeilige Commit-Nachrichten

Mehrzeilige `-m`-Nachrichten scheitern in Windows PowerShell. **Lösung:** Nachricht in eine
Datei schreiben und `git commit -F <datei>` verwenden.

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
Mehrzeilige Commit-Nachrichten unter Windows-PowerShell via `git commit -F <datei>` (siehe 13.16).

**Commit-Chronik (jüngste zuerst):**
```
7bd019c  Verteiler-Management je Projekt: Kontrolle wer welche Nachrichten erhaelt
2b6df01  Projektkachel: einheitliche Kennzahlen, Null-Werte werden angezeigt
a17c410  Adminbereich zeigt die laufende Software-Version
1afc249  Bugfix: Projektkachel zaehlt Aufgaben wie Massnahmenbereich und Protokoll
ec925ea  Bugfix: uebernommene Massnahmen nicht mehr doppelt zaehlen
e6f61be  Bugfix: Projektbericht zeigte erledigte BIM-Issues/Planpruefungen als offen
d5ed839  Protokoll-Untertitel (Protokollbezeichnung) ergaenzt
c991fd9  Zustaendigkeit im Protokollpunkt: Auswahl Info ergaenzt
cbe90eb  Protokoll-Anlagen per E-Mail versenden, Notizpanel parallel bedienbar
a1c8b5a  Protokolluebersicht: Kategorien je Besprechungsart, aeltere ausblendbar
ef2fbae  Protokollliste: nach Besprechungsart gruppiert, neuestes Protokoll zuerst
ec39e24  Protokollpunkte: jeder Unterpunkt erbt den Titel des uebergeordneten Punkts
```
