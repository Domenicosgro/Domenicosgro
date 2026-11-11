# Prüfstation (Arbeitstitel)

Eigene Oberfläche unter **`/pruefstation`** für das Prüfen von Nachträgen,
Abschlagsrechnungen und anderen Dokumenten. Die Prüfunterlagen liegen im
Projektordner auf der NAS. Jeder Prüfvorgang wird mit **seinem eigenen Ordner**
verknüpft, den man frei auswählt.

Sie läuft wie die Personalplanung **im selben Container**: gleicher Server,
gleiche Anmeldung (DSM-Login, `kp_session_token`), gleiche Projekte und
Zugriffsrechte. Reverse-Proxy-Ziel fürs Dashboard: `http://localhost:3000/pruefstation`.

---

## Stufe 1 (umgesetzt): Unterlagen sammeln

| Funktion | Umsetzung |
|---|---|
| Prüfvorgang anlegen | Projekt, Art (Nachtrag / Abschlagsrechnung / Sonstiges), Nummer, Index, Titel |
| **NAS-Ordner verknüpfen** | Ordnerauswahl über die Freigaben der NAS, Start im Projektordner (`project.fsPath`), neue Ordner direkt anlegen (Vorschlag „Nachtrag 008", „3. AR Bau"). Jederzeit änderbar. |
| Prüfdokumente | Upload per Drag & Drop **in den verknüpften Ordner** (Originale) |
| Anlagen zur Prüfung | Upload in den Unterordner **„Anlagen zur Prüfung"**, je Datei eine Art: Einigung, E-Mail-Verlauf, Stellungnahme, Protokoll, Leistungsnachweis, Vertragsunterlage, Hinweis, Sonstiges |
| E-Mail-Verlauf einfügen | Text aus Outlook einfügen → `JJJJ-MM-TT <Bezeichnung>.txt` im Anlagen-Ordner (UTF-8 mit BOM) |
| Vorhandene Dateien | Was schon im Ordner liegt, erscheint automatisch (Original = Prüfdokument, im Anlagen-Ordner = Anlage); die Art lässt sich nachträglich setzen |
| Angaben | Status (Eingang → In Prüfung → Zur Freigabe → Abgeschlossen), Auftragnehmer, Eingang, Prüffrist, Einigung vom, Betrag netto |
| Hinweise des Bearbeiters | Freitext (Auftragszettel). Laut Skills geht er für diesen Vorgang dem Projekt-Standard vor, ändert ihn aber nicht. |
| Löschen | Vorgang löschen lässt die NAS-Dateien unangetastet. Dateien lassen sich nur löschen, wenn sie **über die Prüfstation** hochgeladen wurden; Originale im Projektordner rührt die App nicht an. |

Ablage im verknüpften Ordner:

```
<Vorgangsordner>/                      z. B. …/05 Nachträge/Nachtragspruefung/Nachtrag 008
├── Nachtragsschreiben.pdf             Prüfdokumente (Originale)
├── Anlage 1 - Kostenaufstellung.pdf
├── Anlagen zur Prüfung/               Einigungen, E-Mails, Stellungnahmen …
└── Nachtrag geprüft JJJJ-MM-TT/       (Stufe 2: Ergebnisse, wird angezeigt)
```

### Im Projekt (seit 2026-11-11)

- **Kachel „Prüfstation" im Projekt-Dashboard** (neben „Dateiablage") mit
  offenen Vorgängen und nächster Frist. Öffnet die Vorgänge dieses Projekts im
  Protokolltool (`view = 'project-pruefstation'`). `/pruefstation` bleibt als
  Übersicht über alle Projekte.
- **Prüfordner je Projekt** (`project.pruefOrdner = { nachtrag, rechnung, sonstiges }`),
  festgelegt von Projekt- oder System-Admins über „Prüfordner des Projekts".
  Beispiel 427 VIZ: `/DriveShare/01 Projekte/427 VIZ/08 Objektüberwachung/02 Nachtragsprüfung`.
- **Neuer Vorgang → Ordner automatisch**: darunter wird „Nachtrag 008" (aus „NA 8",
  „NA 008" …) bzw. die Nummer der Rechnung („3. AR Bau") angelegt. Gibt es den
  Ordner schon, wird er verknüpft statt neu angelegt. Ohne Prüfordner bleibt es
  bei der freien Verknüpfung.

## Stufe 2 (geplant): Prüfung mit Claude

Die Skills `nachtragspruefung` und `rechnungspruefung` (Stand 11.11.2026) werden
über die Claude API eingebunden (`POST /v1/skills`, Code-Execution-Tool, dazu die
Anthropic-Skills `pdf` und `docx`). Eingabe sind die Prüfdokumente, die Anlagen und
die Hinweise des Bearbeiters. Die Ergebnisse (Anschreiben, Prüfvermerk, grün
markiertes PDF) werden **erst nach Freigabe** in den Unterordner „… geprüft
JJJJ-MM-TT" geschrieben. Ein neuerer Projekt-Standard unter `_Standard/` im
Projektordner hat Vorrang.

Vorher klären (aus der Skill-Übergabe):
- Vertraulichkeit 427 VIZ: Lassen die Vertragsbedingungen des LBIH die Verarbeitung über die API zu?
- Dateinamen und Ordner der Rechnungsprüfung bestätigen.
- Prüfsummen-Tabelle 427 VIZ ab dem 07.10.2026 fortschreiben.

---

## Einrichtung (NAS)

Die Prüfstation nutzt die File-Station-Anbindung der Dateiablage (`server/fileStation.js`).

**Automatisch (empfohlen):** `.\setup-pruefstation.ps1` vom Entwickler-PC aus.
Das Skript legt das Service-Konto `svc-komplizen` mit Zufallspasswort an, gibt
ihm Lese- und Schreibrecht auf die abgefragte(n) Freigabe(n), trägt
`SYNOLOGY_FS_USER`, `SYNOLOGY_FS_PASS` und `PRUEFSTATION_ROOTS` in die
NAS-`docker-compose.yml` ein (mit Sicherungskopie `.bak-…`), erstellt den
Container neu und prüft die File-Station-Anmeldung. Es fragt einmal nach dem
sudo-Passwort von `Deploy`. Das Passwort steht danach nur in der
docker-compose.yml auf der NAS. Ein erneuter Aufruf setzt ein neues Passwort.

Von Hand:

1. In DSM ein **Service-Konto** anlegen (z. B. `svc-komplizen`) mit **Lese- und
   Schreibrecht** auf die Projektfreigabe(n). Nur lesen reicht nicht: die
   Prüfstation legt Ordner an und lädt Dateien hoch.
2. In der NAS-`docker-compose.yml` ergänzen (Passwort nie in Git):
   ```yaml
   SYNOLOGY_URL:       "http://192.168.178.250:5000"
   SYNOLOGY_FS_USER:   "svc-komplizen"
   SYNOLOGY_FS_PASS:   "…"
   PRUEFSTATION_ROOTS: "/Projekte"     # optional, Kommaliste erlaubter Wurzeln
   ```
3. Container **löschen und neu erstellen** (ENV-Änderung), dann `.\update.ps1`.
4. Im Dashboard eine Kachel bzw. einen Reverse-Proxy-Eintrag auf `/pruefstation` anlegen.

Hinweis: Alle Dateizugriffe laufen über das Service-Konto, nicht über das
DSM-Konto der angemeldeten Person. Wer welche Vorgänge sieht, regeln die
Projektrechte der App (`canAccessProject`). Mit `PRUEFSTATION_ROOTS` lässt sich die
Ordnerauswahl auf die Projektfreigabe begrenzen.

## API

```
GET    /api/pruefstation/status                      NAS konfiguriert?, erlaubte Wurzeln
GET    /api/pruefstation/projects                    zugängliche Projekte (+ fsPath, pruefOrdner)
PUT    /api/pruefstation/projects/:id/ordner {nachtrag,rechnung,sonstiges}  Prüfordner (Projekt-Admin)
GET    /api/pruefstation/browse?path=                Ordner/Dateien; ohne path: Freigaben
POST   /api/pruefstation/folders        {parent,name} Ordner anlegen
GET    /api/pruefstation/vorgaenge[?projectId=]
POST   /api/pruefstation/vorgaenge
GET    /api/pruefstation/vorgaenge/:id
PATCH  /api/pruefstation/vorgaenge/:id               Felder + folderPath (Verknüpfung)
DELETE /api/pruefstation/vorgaenge/:id               nur Vorgang, NAS-Dateien bleiben
GET    /api/pruefstation/vorgaenge/:id/dateien       Ordnerinhalt + Metadaten
POST   /api/pruefstation/vorgaenge/:id/dateien?name=&kategorie=pruefdokument|anlage&art=
                                                     Rohdaten (application/octet-stream, ≤ 500 MB)
POST   /api/pruefstation/vorgaenge/:id/text  {titel,art,text}   Text als .txt-Anlage
PATCH  /api/pruefstation/vorgaenge/:id/dateien {rel,art,kategorie,notiz}
GET    /api/pruefstation/vorgaenge/:id/dateien/download?rel=
DELETE /api/pruefstation/vorgaenge/:id/dateien?rel=  nur über die App hochgeladene Dateien
```

Datenhaltung: Tabelle `pruef_vorgaenge` (JSON je Vorgang, `makeStore`). Die
Metadaten der Dateien stehen unter `dateien[<relativer Pfad>]`. Pfade werden
serverseitig geprüft: absolut, ohne `..`, innerhalb von `PRUEFSTATION_ROOTS`.
Dateien liegen nur im Vorgangsordner selbst oder in „Anlagen zur Prüfung".
Vorhandene Namen werden nicht überschrieben („Datei (2).pdf").
