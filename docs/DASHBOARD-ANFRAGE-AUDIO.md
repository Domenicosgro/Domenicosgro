# Anfrage an das Dashboard-Projekt: Büro-Audio als Modul

> **Für den Agenten (Claude/Codex) im Repo `komplizen-dashboard`.**
> Bitte **nur nachsehen und berichten, nichts ändern.** Antworten direkt in die
> Tabellen unten eintragen, jeweils mit Fundstelle (`datei:zeile`). Wo etwas nicht
> zu finden ist: „nicht gefunden" schreiben, nicht raten.

---

## Hintergrund

- Neue Anwendung **KOMPLIZEN Büro-Audio** läuft auf der Synology unter
  `https://192.168.178.250:18098/audio/` (eigener Container, Code im NAS-Repo
  `kom-audio`, Einrichter: Sven `sb`, Domenico `ds`).
- Sie steuert die Bose-Lautsprecher über Home Assistant (Grundriss, Radio, Pegel;
  später Spotify und Raumgruppen „Alle", „Sherwood", „Camelot").
- Sie soll als **Modul im Dashboard** erscheinen – nach dem Muster der
  Personalplanung: eine Zeile in `core_modules`, keine zweite Datenhaltung.
- Geplant: erst `embed_mode = 'link'` (Kachel öffnet die App), später `'iframe'`.

---

## 1. Registry `core_modules`

| Frage | Antwort | Fundstelle |
|---|---|---|
| Vollständige Spalten von `core_modules` (Name, Typ, Pflicht?) | | |
| Erlaubte Werte für `rubrik` – und welche Rubrik passt zu „Büro-Technik/Audio"? | | |
| Erlaubte Werte für `embed_mode` (`link`, `iframe`, …) und was jeder bewirkt | | |
| Erlaubte Werte für `status` | | |
| Bedeutung von `min_role` – welche Rollen gibt es? | | |
| Welche `sort_order`-Werte sind in der Rubrik schon belegt? | | |
| Welche Felder in `meta` werden ausgewertet (`embed_src`, `hex`, `agent_says`, …)? | | |
| Ist der `key` `buero-audio` frei? | | |

## 2. Gelände / Waben

| Frage | Antwort | Fundstelle |
|---|---|---|
| Welche Waben (`meta.hex` q/r) sind schon belegt? | | |
| Gibt es Regeln, wo Module einer Rubrik liegen sollen? | | |
| Wird `agent_says` statisch angezeigt oder gibt es einen Abruf (Endpunkt)? | | |

## 3. Einbettung (`/m/<key>`)

| Frage | Antwort | Fundstelle |
|---|---|---|
| Setzt die Embed-Shell (`templates/embed.html` o. ä.) `meta.embed_src` als `src` des iframes – auch **externe** Adressen (anderer Port, `https`)? | | |
| Welche `sandbox`/`allow`-Attribute hat das iframe? | | |
| Eigene CSP des Dashboards: erlaubt `frame-src` fremde Herkünfte? Wo konfiguriert? | | |
| Unter welcher Adresse läuft das Dashboard (Schema, Port)? | | |

## 4. Status / Health

| Frage | Antwort | Fundstelle |
|---|---|---|
| Fragt das Dashboard `GET /api/health` der Module ab? Wo ist die URL hinterlegt? | | |
| Welche Antwort erwartet es (Statuscode, JSON-Felder)? | | |
| Wie verhält es sich bei selbst signiertem `https`-Zertifikat? | | |

## 5. Anmeldung

| Frage | Antwort | Fundstelle |
|---|---|---|
| Gibt das Dashboard Anmeldung/Identität an Module weiter (Token, Header, SSO)? | | |
| Oder meldet sich jedes Modul selbst über DSM an? | | |
| Steuert `min_role`, wer die Kachel sieht? | | |

## 6. Einspielen

| Frage | Antwort | Fundstelle |
|---|---|---|
| Wo liegen Migrationen, wie heißt die nächste freie Nummer? | | |
| Wie werden sie ausgeführt (beim Start, Skript, von Hand)? | | |
| Wo liegt das Dashboard-Repo (GitHub / NAS), wer deployt? | | |
| Gibt es eine Vorlage/Beispiel-Migration für ein **externes** Modul (z. B. `personalplanung`)? | | |

---

## Entwurf der Registry-Zeile (zur Prüfung, nicht einspielen)

Bitte gegen das echte Schema prüfen und Abweichungen benennen:

```sql
INSERT INTO core_modules (key, rubrik, title, description, status, embed_mode,
                          url, sort_order, min_role, active, meta)
VALUES (
  'buero-audio', 'buero', 'Büro-Audio',
  'Lautsprecher im Büro: Radio, Lautstärke, später Spotify und Raumgruppen.',
  'ok', 'link', 'https://192.168.178.250:18098/audio/', 40, NULL, true,
  '{"hex": {"q": 1, "r": 2},
    "agent_says": ["Robin spielt im Büro", "Klick: Audio öffnen"]}'::jsonb
)
ON CONFLICT (key) DO UPDATE SET
  title = EXCLUDED.title, description = EXCLUDED.description,
  status = EXCLUDED.status, embed_mode = EXCLUDED.embed_mode,
  url = EXCLUDED.url, active = EXCLUDED.active, meta = EXCLUDED.meta;
```

---

## Ergebnis zurück

Am Ende bitte zusammenfassen:

1. Ist Stufe 1 (`link`) mit dieser Zeile so einspielbar? Was muss geändert werden?
2. Was fehlt für Stufe 2 (`iframe`) – auf Dashboard-Seite und auf Audio-Seite?
3. Korrigierte Registry-Zeile.
