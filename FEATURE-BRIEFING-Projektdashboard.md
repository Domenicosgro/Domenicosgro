# Feature-Briefing: Projekt-Dashboard, HOAI-Stand, Synology-Verknüpfungen & Protokoll-Kacheln

> Adressat: Claude Code im Repo `Domenicosgro`.
> Ziel: Die App von einem reinen Protokoll-Tool zu einem projektzentrierten Arbeitsplatz
> erweitern. Vier zusammenhängende Bausteine (A–D). Funktion erweitern, bestehende
> Protokoll-Logik NICHT beschädigen. Komplizen-CI durchgängig verwenden.

---

## Gesamtüberblick

| Baustein | Was | Wo |
|---|---|---|
| **A** | Pro-Benutzer-Favoriten (Stern serverseitig pro Konto) | useUserSettings, ProjectsHome |
| **B** | Startseite: nur favorisierte Projekte als Cards; „Alle Projekte anzeigen" | ProjectsHome |
| **C** | Projekt-Dashboard: HOAI-Leistungsbilder + LPH-Fortschritt (Schieberegler) + Synology-Ordner-Links | neue Komponente ProjectDashboard |
| **D** | Protokoll: vertikale Kachel-Leiste rechts (Dokument-/URL-Links, Plus-Button, CI-Farben) | ProtocolEditor + neue Komponente TileSidebar |

**Wichtige Vorab-Entscheidung (bereits getroffen):** Der Zugriff auf Synology-Dateien
erfolgt ausschließlich über **Web-Links (URLs)**, die der Nutzer aus Synology Drive /
File Station kopiert und in der App hinterlegt. Die App greift NICHT direkt auf das
Dateisystem oder eine NAS-API zu. Links öffnen in einem neuen Browser-Tab. Das ist
bewusst so – es bleibt sicher, einfach und überlebt den Umzug der App auf die Synology.

**Diese Funktion ist sofort nutzbar – KEIN Synology-Umzug nötig.** Da nur Links
gespeichert werden, funktioniert die Ordner-/Kachel-Verknüpfung bereits im aktuellen
PC-/Docker-Betrieb: Der Nutzer erzeugt in Synology Drive / File Station einen
Freigabe-Link (`https://<nas-adresse>:5001/sharing/...` o. ä.) und fügt ihn ein.
Voraussetzung ist nur eine echte Browser-URL (`https://...`). Windows-Netzwerkpfade
(`\\nas\...`) sind NICHT zulässig (vom Browser blockiert) – im UI-Hinweis klarstellen.
Die Felder/Buttons also normal aktiv schalten, nicht als „später"-Feature behandeln.

---

## Baustein A — Pro-Benutzer-Favoriten

### Problem
Favoriten liegen aktuell in `localStorage` (`bb_project_favorites`) → pro Browser, nicht pro
Benutzer. Im Server-Modus muss jeder angemeldete Nutzer seine **eigenen** Favoriten haben.

### Umsetzung
- Favoriten pro Konto über `useUserSettings` (Server-Modus) persistieren. Vorschlag:
  ein Settings-Feld `favoriteProjectIds: string[]` pro Benutzer.
- Server: falls noch nicht vorhanden, einen Settings-Speicher pro Nutzer ergänzen
  (z. B. Spalte `settings TEXT` in `users` als JSON, oder eigene Tabelle `user_settings`).
  Endpunkte: `GET /api/settings` (eigene), `PATCH /api/settings`.
- Im **lokalen/Electron-Modus** Verhalten wie bisher (localStorage) als Fallback behalten.
- `useUserSettings` bekommt: `favorites`, `toggleFavorite(projectId)`, `isFavorite(projectId)`.

---

## Baustein B — Startseite (ProjectsHome) neu strukturieren

### Verhalten
1. **Standardansicht:** nur Projekte, die der angemeldete Nutzer mit ★ markiert hat,
   werden als Project-Cards angezeigt.
2. **Button „Alle Projekte anzeigen"** (Toggle): blendet zusätzlich alle nicht-favorisierten
   Projekte ein (z. B. als kompaktere Liste oder ausgegraute Cards). Erneuter Klick →
   „Nur Favoriten anzeigen".
3. Stern ist auf jeder Card togglebar → aktualisiert die Pro-Nutzer-Favoriten (Baustein A).
4. Klick auf eine Card öffnet **nicht** sofort die Protokollliste, sondern das neue
   **Projekt-Dashboard** (Baustein C). Von dort führt ein Button zu „Protokolle".

### Project-Card – Inhalt
- Projektname (Yellix/Headline, Night)
- **HOAI-Stand kompakt:** das/die aktiven Leistungsbild(er) + aktuelle LPH + Prozent,
  z. B. „LP Gebäude · LPH 5 · 30 %". Bei mehreren Leistungsbildern das jeweils aktive
  oder eine Kurzform (z. B. das am weitesten fortgeschrittene + „+2 weitere").
- Ein kleiner **Fortschrittsbalken** (Sky auf Concrete) für den Gesamtfortschritt.
- Stern oben rechts.
- Card-Stil: Komplizen-CI (weiße Karte, `rounded-lg`, dezenter Schatten, Sky-Akzent).

---

## Baustein C — Projekt-Dashboard (neue Komponente `ProjectDashboard.jsx`)

Öffnet beim Klick auf eine Project-Card. Neuer View `'project-dashboard'` in `App.jsx`.

### C.1 Datenmodell-Erweiterung am Projekt (utils.js)

Das Projekt-Objekt (siehe ENTWICKLUNG.md 5.1) um folgende Felder erweitern:

```js
{
  // ... bestehende Felder ...
  hoaiServices: [],     // gewählte Leistungsbilder mit Phasen-Fortschritt, siehe C.2
  linkedFolders: [],    // verknüpfte Synology-Ordner, siehe C.3
}
```

`emptyProject()` entsprechend ergänzen (leere Arrays). **Abwärtskompatibilität:** Beim Laden
alter Projekte ohne diese Felder defensiv auf `[]` defaulten (kein Crash bei `undefined`).

### C.2 HOAI-Leistungsbilder & Phasen

Mehrere Leistungsbilder pro Projekt wählbar. Jedes Leistungsbild hat die 9 HOAI-Phasen
(LPH 1–9) mit den üblichen Prozent-Gewichten. Datenstruktur eines Eintrags in `hoaiServices[]`:

```js
{
  id:        uid(),
  type:      'gebaeude',   // Schlüssel des Leistungsbilds (siehe Katalog unten)
  label:     'Gebäude',    // Anzeigename
  phases: {                // Fortschritt je LPH in Prozent (0–100)
    1: 100, 2: 100, 3: 100, 4: 80, 5: 30, 6: 0, 7: 0, 8: 0, 9: 0
  },
  activePhase: 5,          // aktuell laufende LPH (für Card-Anzeige)
}
```

**Leistungsbild-Katalog** (HOAI 2021, als Konstante `HOAI_LEISTUNGSBILDER` in utils.js).
Die 9 Phasen tragen je Leistungsbild leicht andere Namen; gängige Varianten:

```js
HOAI_LEISTUNGSBILDER = [
  { type: 'gebaeude',     label: 'Gebäude (§ 34)' },
  { type: 'freianlagen',  label: 'Freianlagen (§ 39)' },
  { type: 'ingbauwerke',  label: 'Ingenieurbauwerke (§ 43)' },
  { type: 'tragwerk',     label: 'Tragwerksplanung (§ 51)' },
  { type: 'tga',          label: 'Technische Ausrüstung (§ 55)' },
]

// Phasenbezeichnungen Gebäude (§ 34) – als Referenz:
HOAI_PHASEN_GEBAEUDE = {
  1: 'Grundlagenermittlung',
  2: 'Vorplanung',
  3: 'Entwurfsplanung',
  4: 'Genehmigungsplanung',
  5: 'Ausführungsplanung',
  6: 'Vorbereitung der Vergabe',
  7: 'Mitwirkung bei der Vergabe',
  8: 'Objektüberwachung (Bauüberwachung)',
  9: 'Objektbetreuung',
}
```

> **Phasenbezeichnung:** Es genügt das einfache Format „LP 1 Grundlagenermittlung",
> „LP 2 Vorplanung" usw. Alle Leistungsbilder dürfen vorerst dieselben Phasennamen
> (Gebäude § 34) verwenden. Eine spätere Verfeinerung je Leistungsbild ist optional.

### C.3 UI des Projekt-Dashboards

**Bereich 1 – Kopf:** Projektname (Headline/Night), Zurück-Button, Button „Protokolle öffnen"
(führt zur bestehenden ProtocolList), Button „Kontakte/Beteiligte".

**Bereich 2 – HOAI-Fortschritt:**
- Button „Leistungsbild hinzufügen" → Dropdown aus `HOAI_LEISTUNGSBILDER`.
- Pro hinzugefügtem Leistungsbild eine Sektion mit 9 Zeilen (LPH 1–9), jede Zeile:
  `LPH n · <Phasenname>` + **Schieberegler 0–100 %** + Prozent-Anzeige.
- Schieberegler: `<input type="range" min=0 max=100 step=5>`, CI-Style (Sky-Track).
- „Aktive Phase" markierbar (Radio/Auswahl), wird auf der Card angezeigt.
- Änderungen sofort ins Projekt patchen (über bestehende `updateProject`/Server-PATCH).

**Bereich 3 – Verknüpfte Synology-Ordner (`linkedFolders[]`):**
```js
// Eintrag in linkedFolders[]:
{ id: uid(), label: 'Pläne', url: 'https://nas.../sharing/xxxx' }
```
- Liste der verknüpften Ordner (Label + Link „Öffnen" → `target="_blank" rel="noopener"`).
- Button „Ordner verknüpfen" → kleines Formular: Label + URL eingeben.
- Hinweistext: „Link aus Synology Drive / File Station kopieren (Freigabe-Link oder
  Drive-Link). Der Link öffnet im Browser."
- Diese verknüpften Ordner stehen später den Protokoll-Kacheln zur Auswahl (Baustein D).

---

## Baustein D — Protokoll-Kachel-Leiste (`TileSidebar.jsx`)

Im **ProtocolEditor** an der rechten Seite eine vertikale Leiste mit quadratischen Kacheln.

### Verhalten & Aussehen
- Kacheln **quadratisch, ca. 3×3 cm** (am Bildschirm ~`w-28 h-28` / `7rem`; exakt per CSS
  `width: 3cm; height: 3cm` möglich – mit `min-`Fallback für kleine Screens).
- In den **CI-Farben**: Night-Hintergrund, Light-Text/Icon, Sky beim Hover; oder Sky-Kachel
  mit Night-Text – durchwechseln für Lebendigkeit. `rounded-lg`.
- Jede Kachel zeigt: kurzes Label + Icon (lucide-react), optional Dateityp.
- **Plus-Button** als letzte Kachel (gestrichelter Rahmen, Sky) → fügt neue Kachel hinzu.
- Klick auf eine Kachel öffnet das verknüpfte Ziel in neuem Tab
  (`window.open(url, '_blank', 'noopener')`).
- Leiste `no-print` (erscheint nicht im Ausdruck).

### Kachel-Datenmodell
Kacheln gehören zum Protokoll (damit sie pro Besprechung verfügbar sind). Im Protokoll-Objekt
ergänzen:
```js
{
  // ... bestehende Protokoll-Felder ...
  tiles: [],   // [{ id, label, kind: 'folder'|'url'|'doc', url, color }]
}
```
`emptyProtocol()` ergänzen (leeres Array), defensiv auf `[]` defaulten.

### Kachel anlegen (Plus-Button → kleines Modal)
Drei Quellen anbieten:
1. **Verknüpfter Ordner:** Dropdown aus `project.linkedFolders` (Baustein C.3) → übernimmt
   Label + URL.
2. **URL/Link:** freie Eingabe (Label + URL) – beliebige Webadresse oder Dokument-Link.
3. (optional, später) **Dokument aus verknüpftem Ordner:** freie URL auf eine einzelne Datei.

Farbe der Kachel optional wählbar (Night / Sky / Concrete) – Default rotierend.

---

## Reihenfolge der Umsetzung (für Claude Code)

1. **Datenmodelle zuerst** (utils.js): `hoaiServices`, `linkedFolders` am Projekt; `tiles`
   am Protokoll; `HOAI_LEISTUNGSBILDER` + Phasennamen-Konstanten; `empty*()` ergänzen;
   defensives Defaulting beim Laden.
2. **Baustein A** (Pro-Nutzer-Favoriten via useUserSettings + Server-Settings-Endpunkt).
3. **Baustein B** (ProjectsHome: Favoriten-Ansicht + „Alle anzeigen", Card mit HOAI-Stand).
4. **Baustein C** (ProjectDashboard.jsx + neuer View in App.jsx; Card klickt dorthin).
5. **Baustein D** (TileSidebar.jsx im ProtocolEditor + Kachel-Modal).
6. ENTWICKLUNG.md um die neuen Komponenten/Felder/Views ergänzen.

## Wichtige Leitplanken
- Bestehende Protokoll-/Carryover-/Abschließen-Logik NICHT verändern.
- Alle neuen Felder abwärtskompatibel (alte Daten ohne die Felder dürfen nicht crashen).
- Server-PATCH-Pfad nutzen (Versionsfeld/Konfliktschutz beachten), nicht direkt schreiben.
- Komplizen-CI (Night #000040, Sky #8FBEFF, Light #FBFFE6, Concrete #F0F0F0, Yellix).
- Nach jedem Baustein `npm run dev` und durchklicken; committen pro Baustein.
- Externe Links immer `target="_blank" rel="noopener"`.

---

## Fertiger Prompt für Claude Code

```
Lies FEATURE-BRIEFING-Projektdashboard.md und ENTWICKLUNG.md. Setze die vier Bausteine
A–D in der angegebenen Reihenfolge um. Beginne mit den Datenmodell-Erweiterungen in
utils.js (hoaiServices, linkedFolders am Projekt; tiles am Protokoll; HOAI_LEISTUNGSBILDER;
empty*() ergänzen; alte Daten defensiv auf [] defaulten). Danach Baustein A (Pro-Nutzer-
Favoriten über useUserSettings + Server-Settings-Endpunkt), B (ProjectsHome mit Favoriten-
Ansicht, „Alle Projekte anzeigen" und Card mit HOAI-Stand + Fortschrittsbalken), C (neue
Komponente ProjectDashboard.jsx mit HOAI-Leistungsbildern, LPH-Schiebereglern und Synology-
Ordner-Verknüpfung via URL), D (TileSidebar.jsx im ProtocolEditor: vertikale, quadratische
CI-Kacheln rechts mit Plus-Button, verlinkbar mit verknüpften Ordnern oder URLs, no-print).
Verändere die bestehende Protokoll-Logik nicht. Halte alle neuen Felder abwärtskompatibel.
Nutze die Komplizen-CI. Committe nach jedem Baustein und prüfe mit npm run dev.
Aktualisiere zum Schluss ENTWICKLUNG.md.
```
