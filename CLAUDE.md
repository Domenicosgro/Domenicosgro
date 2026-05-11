# Komplizen Protokolle – Arbeitsstand für Claude

## Projekt-Überblick

**App:** Besprechungsprotokoll-Tool für Bauprojekte  
**Stack:** React 18 · Vite · Tailwind CSS v3 · Electron (optional) · localStorage / Electron-IPC  
**Branch:** `claude/protocol-tool-meetings-tIoZX`  
**Push:** immer `git push -u origin claude/protocol-tool-meetings-tIoZX`

---

## Dateistruktur

```
src/
  App.jsx                        # Routing (view-State): home | protocols | editor | project-contacts
  index.css                      # Design-System (Tailwind-Components + Print-CSS)
  utils.js                       # Datenmodelle, Helper-Funktionen
  main.jsx                       # React-Einstiegspunkt

  components/
    ProjectsHome.jsx             # Startseite – Projektliste, Favoriten, Passwortschutz
    ProjectManager.jsx           # Kontaktverwaltung (Gewerk-Spalte, Sort, Drag & Drop, CSV)
    BeteiligtenModal.jsx         # Projektbeteiligtenliste (Druck, Excel, Word)
    ProtocolList.jsx             # Protokollliste eines Projekts
    ProtocolEditor.jsx           # Protokoll-Editor (Hauptkomponente)
    MeetingHeader.jsx            # Metadaten (Datum, Ort, Vorgänger, Projektlink)
    ParticipantsList.jsx         # Teilnehmerliste im Protokoll
    AgendaDraft.jsx              # Tagesordnungs-Entwurf (vor Besprechung)
    AgendaEmailModal.jsx         # Agenda per E-Mail versenden
    ProtocolItems.jsx            # Protokollpunkte (rich text, Drag & Drop, Anhänge)
    ActionItems.jsx              # Maßnahmen/Aufgaben-Liste
    NotesSection.jsx             # Allgemeine Bemerkungen (rich text)
    RichTextEditor.jsx           # Tiptap-Editor (Bold/Italic/Underline/Strike/Listen)
    GesamtprotokollModal.jsx     # Gesamtprotokoll-Druck über Vorgänger-Kette
    LogoUpload.jsx               # Logo hochladen/löschen

  hooks/
    useProtocols.js              # CRUD + syncProjectName
    useProjects.js               # CRUD Projekte
    useLogo.js                   # Logo (localStorage / Electron)
    useSpellCheck.js             # Rechtschreibprüfung (Web Worker)

  exportDocx.js                  # Word-Export für einzelne Protokolle
  exportParticipantsList.js      # Word-Export Beteiligtenliste (7 Spalten)
  spellcheck.worker.js           # nspell Deutsch
```

---

## Datenmodelle (utils.js)

### Projekt
```js
{ id, name, contacts: [...], passwordHash, createdAt, updatedAt }
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
  participants: [...],
  agenda: [...],            // Tagesordnungs-Entwurf
  agendaSentAt, agendaGreeting,
  agendaItems: [...],       // Protokollpunkte
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
  linkedFromAgendaId,       // Link auf Agenda-Entwurfspunkt
  createdAt, attachment: { name, mimeType, data (base64), size }
}
```

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

**Flat Design** (seit letztem Commit):
- Keine runden Ecken: `borderRadius` komplett auf 0 in `tailwind.config.mjs` (theme-Ebene, nicht extend)
- Keine Schatten: `.card` nur `border border-gray-200`, kein `shadow-sm`
- Body-Hintergrund: `bg-gray-100` (Kontrast für weiße Karten)
- Alle `rounded-*` Tailwind-Klassen produzieren automatisch 0 – keine JSX-Dateien anfassen nötig

**Komponenten-Klassen (index.css):**
```css
.btn           → px-3 py-1.5, kein rounded
.btn-primary   → brand-600
.btn-secondary → weißer Hintergrund, gray-300 Border
.btn-ghost     → transparent
.btn-danger    → rot
.input         → border-gray-300, focus:ring-brand-500
.card          → bg-white border border-gray-200
.badge         → px-2 py-0.5, farbige Backgrounds
.badge-*       → blue/green/yellow/red/gray
```

**Farben:**
```js
brand: { 50, 100, 500, 600, 700, 900 }  // Blautöne
```

---

## Wichtige Muster & Logik

### Projekt-Protokoll-Verknüpfung
- `protocol.projectId` → Fremdschlüssel auf `project.id`
- `protocol.projectName` → denormalisierte Kopie (für Anzeige/Export)
- **Sync:** `handleUpdateProject()` in App.jsx ruft `syncProjectName(projectId, name)` auf → alle Protokolle eines Projekts bekommen den neuen Namen

### Vorgänger-Kette (Protokollreihe)
- `protocol.predecessorId` → ID des Vorgänger-Protokolls
- `getChainNo(protocol, allProtocols)` → Position in der Kette (1-basiert), `null` = standalone
- `buildProtocolNo(projectName, date, chainNo, meetingType)` → z.B. `2 - BB-MeinProjekt_29.04.2026`
- Carryover beim Öffnen: `useEffect` in ProtocolEditor, Guard via `carriedForRef` (verhindert Doppelübernahme in React Strict Mode)

### Protokoll abschließen
- `promoteAgenda()` übernimmt nur Agenda-Punkte, die noch **kein** `linkedFromAgendaId` in `agendaItems` haben (Bug-Fix: verhindert Dopplung)
- Nach Abschluss: `isClosed=true`, Editor read-only

### Rich-Text Editor (RichTextEditor.jsx)
- Tiptap mit StarterKit + Underline + Placeholder
- `toHtml(str)` – konvertiert Legacy-Plaintext zu HTML
- `stripHtml(html)` – für Plaintext-Kontexte (Suche, Print-Zusammenfassung)
- `lastEmittedRef` – verhindert Cursor-Jump bei externen State-Updates
- Auto-Erkennung: `- ` → BulletList, `1. ` → OrderedList

### Kontaktliste (ProjectManager.jsx)
- Spalten: Name · Firma · Gewerk · Funktion · E-Mail · Telefon
- **Sort:** `sortBy[projectId] = { field, dir }` State, klick auf Header cycled asc→desc→clear
- **Drag & Drop:** HTML5 Drag API, `dragRef` (useRef), `dropTarget` State; deaktiviert wenn Sort aktiv
- **CSV Export:** UTF-8 BOM + Semikolon (Excel-kompatibel)
- **CSV Import:** Auto-Erkennung `;` vs `,`, Spaltenmapping per Keyword-Suche

### Gesamtprotokoll (GesamtprotokollModal.jsx)
- `buildChain()` geht Vorgänger-Kette rückwärts durch
- Druck via verstecktem `<iframe>` (kein Popup-Blocker-Problem)
- Nur sichtbar wenn `chainNo !== null` (Protokoll ist Teil einer Reihe)

### Export
- **Word (Protokoll):** `exportDocx.js` via `docx` npm-Paket
- **Word (Beteiligtenliste):** `exportParticipantsList.js`, 7 Spalten: Nr·Name·Firma·Gewerk·Funktion·E-Mail·Telefon
- **CSV:** Semikolon + UTF-8 BOM
- **Print/PDF:** `window.print()` mit versteckten Print-Klassen, `@page A4`

---

## Bekannte Fallstricke

1. **React Strict Mode** führt Effects doppelt aus → `carriedForRef` Guard in ProtocolEditor
2. **Tiptap controlled input:** `lastEmittedRef` unterscheidet eigene Änderungen von externen (verhindert Cursor-Reset)
3. **Vorgänger-Dropdown:** zeigt nur Protokolle aus Projekten mit `★` (Favorit/markiert in ProjectsHome)
4. **ParticipantsList** (Teilnehmer im Protokoll) ≠ **BeteiligtenModal** (Projektbeteiligtenliste) – zwei verschiedene Komponenten!
5. **`promoteAgenda()`** prüft `existingLinkedIds` bevor neue Items erstellt werden – sonst Duplikate beim Abschließen

---

## Git-Workflow

```bash
git add <files>
git commit -m "Beschreibung\n\nhttps://claude.ai/code/session_01XnNnKskcg4ceXSVgJcGC9U"
git push -u origin claude/protocol-tool-meetings-tIoZX
```

Bei Push-Fehlern: bis zu 4 Retries mit exponential backoff (2s, 4s, 8s, 16s).
