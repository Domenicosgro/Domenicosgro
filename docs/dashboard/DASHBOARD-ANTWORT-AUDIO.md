# Antwort an das Audio-Projekt: Büro-Audio als Dashboard-Modul

**Repo:** `C:\Komplizen Software\komplizen-dashboard` · Zweig `main` · Stand 16.11.2026
**Am Repo wurde nichts geändert.** Alle Angaben sind entweder aus dem Quelltext
zitiert (`datei:zeile`) oder an der laufenden Datenbank abgefragt
(`komplizen-dashboard-db`, lokal).

---

## 1. Registry `core_modules`

| Frage | Antwort | Fundstelle |
|---|---|---|
| Vollständige Spalten | siehe Tabelle unten | `migrations/001_core_schema.sql:5–21`, `app/models.py:10–33`, Live-Schema |
| Erlaubte `rubrik` | `buero`, `planung`, `akquise`, `gaeste`. **Für Audio passt `buero`** („Büroorganisation — Der Maschinenraum des Büroalltags"). Eine Rubrik „Technik" gibt es nicht und der CHECK würde sie abweisen. | `001_core_schema.sql:7–8`, `app/auth.py:246–252` |
| Erlaubte `embed_mode` | `link`, `iframe`, `tab` — **aber `tab` ist tot**, siehe unten | `001_core_schema.sql:13–14` |
| Erlaubte `status` | `ok`, `proto`, `plan`, `idea`, `ext` | `001_core_schema.sql:11–12` |
| `min_role` | **Kein Rollenbegriff.** Verglichen wird gegen `dsm_groups`, also AD-Gruppennamen. Letzte Instanz der Auflösung. **Heute nirgends gesetzt, überall NULL.** | `app/auth.py:237–238`, `app/auth.py:191` |
| Belegte `sort_order` in `buero` | 5, 10, 20, 30, 40, 50, 80, 90 — **40 ist belegt** (`buero-formulare`) | Live-DB |
| Ausgewertete `meta`-Felder | nur fünf: `hex`, `color`, `agent_says`, `embed_src`, `fuer_alle` | `gelaende.js:88`, `gelaende.js:73`, `api.py:44`, `tools.py:39`, `auth.py:221` |
| Ist `buero-audio` frei? | **Ja**, 0 Treffer | Live-DB |

### Spalten

| Spalte | Typ | Pflicht | Vorgabe |
|---|---|---|---|
| `id` | integer | ja | serial |
| `key` | varchar(64) | ja | — (UNIQUE) |
| `rubrik` | varchar(32) | ja | — (CHECK) |
| `title` | varchar(128) | ja | — |
| `description` | text | nein | — |
| `status` | varchar(16) | ja | `'plan'` (CHECK) |
| `embed_mode` | varchar(16) | ja | `'link'` (CHECK) |
| `url` | text | nein | — |
| `sort_order` | integer | nein | `0` |
| `min_role` | varchar(32) | nein | — |
| `active` | boolean | nein | `true` |
| `meta` | jsonb | nein | `'{}'::jsonb` |
| `created_at` | timestamptz | nein | `now()` |

### Drei Dinge, die der Tabelle nicht anzusehen sind

**`tab` bewirkt nichts.** Jede Stelle im Code fragt nur, ob `embed_mode`
`iframe` ist (`tools.py:37`, `shell.html:101`, `gelaende.js:796`). `tab`
verhält sich also exakt wie `link`. Nicht verwenden.

**`status = 'idea'` verschiebt die Kachel auf dem Gelände.** `zoneOf()`
schickt jedes Modul mit `idea` ins Ideen-Labor, unabhängig von der Rubrik
(`gelaende.js:40`).

**`status` entscheidet über die Sprechblase.** Die Agentenmeldung erscheint nur
für `ok` und `ext` (`api.py:40`, `gelaende.js:538`). Bei `plan`, `proto` oder
`idea` bleibt `agent_says` stumm.

---

## 2. Gelände / Waben

| Frage | Antwort | Fundstelle |
|---|---|---|
| Belegte Waben | siehe Liste unten (26 Module) | Live-DB |
| Regeln, wo Module liegen | Ja, strikt: jede Rubrik ist eine Terrasse mit **fester Zellenliste** | `static/js/gelaende.js:22–38` |
| `agent_says` statisch oder Abruf? | **Statisch aus der Registry.** Endpunkt `GET /api/agents` liest `meta.agent_says`, fragt die Anwendung **nicht**. Max. 6 Einträge, nur für `ok`/`ext`, nur für Module mit Zugriff. | `app/routes/api.py:24–47` |

### Die Terrassen (`gelaende.js:22–38`)

| Rubrik | Zellen | belegt |
|---|---|---|
| akquise | 9 | **9 — voll** |
| planung | `(4,0) (4,-1) (5,-1) (5,0)` | **4 — voll** |
| buero | `(-4,0) (-4,1) (-5,1) (-5,0)` | **4 — voll** |
| gaeste | `(-4,4)` | 1 — voll |
| labor | `(0,4) (1,4) (-1,5)` | 3 — voll |

### Wie eine Wabe geprüft wird — und warum euer Entwurf daran scheitert

`gelaende.js:88–92`: Eine `meta.hex` wird **nur übernommen, wenn die Zelle in
der Zone des eigenen Moduls steht.** Sonst wird sie *stillschweigend verworfen*
— keine Warnung, kein Log — und das Modul bekommt die erste freie Zelle der
Zone (`:96`), bei voller Zone eine Ringsuche daneben (`:99–107`).

Euer `{"q": 1, "r": 2}` ist **keine Büro-Zelle**. Es war in der alten
Aufteilung die Wabe des Akquise-Agenten (`migrations/005_gelaende_hex.sql:40`),
seither umgezogen. Die Angabe würde also wirkungslos bleiben.

Dazu: Die Büro-Terrasse ist **voll**. `buero-assistent`, `buero-kifarm` und
`akq-stamm` (Rubrik `buero`, trägt noch eine Akquise-Wabe) haben bereits keine
gültige Zelle und landen in der Ringsuche. `buero-audio` wäre das vierte.

**Empfehlung: `meta.hex` weglassen.** Genau das tun die beiden jüngsten
Büro-Module. Die Karte setzt die Kachel dann selbst.

### Belegte Waben, Stand 16.11.2026

```
akquise  akq-vgv (1,-6)  akq-ted (0,-4)  akq-freie (-1,-4)  akq-refblaetter (1,-4)
         akq-refliste (-1,-3)  akq-akqliste (1,-5)  akq-cvs (2,-5)
         akq-vergabe (2,-6)  akq-praes (0,-5)  akq-agent (-1,5)
buero    buero-personal (-4,0)  buero-wiki (-4,1)  buero-vorlagen (-5,1)
         buero-formulare (-5,0)  buero-onboard (0,4)  akq-stamm (1,-6)
         buero-assistent (keine)  buero-kifarm (keine)
gaeste   gaeste-empfang (-4,4)  gaeste-tuer (1,4)
planung  plan-raumbuch (5,-1)  plan-layout (4,0)  plan-greenfield (4,-1)
         plan-protokoll (5,0)  plan-planserver (6,0)  plan-planserver-admin (6,-1)
```

---

## 3. Einbettung (`/m/<key>`)

| Frage | Antwort | Fundstelle |
|---|---|---|
| Wird `meta.embed_src` als `src` gesetzt, auch extern? | **Ja, ungeprüft.** `iframe_src = meta.embed_src or module.url`, keine Herkunftsprüfung. | `app/routes/tools.py:39`, `templates/embed.html:20` |
| `sandbox` / `allow` | `sandbox="allow-scripts allow-same-origin allow-downloads allow-modals allow-popups"`, dazu `referrerpolicy="no-referrer"`. **Kein `allow=`-Attribut.** | `templates/embed.html:23–24` |
| Eigene CSP — erlaubt `frame-src` fremde Herkünfte? | **Das Dashboard setzt auf seinen Seiten gar keine CSP.** Die einzige CSP hängt an der Layoutplaner-Datei, nicht an der Embed-Seite, und enthält kein `frame-src`. Von Dashboard-Seite blockiert also nichts. | `app/routes/tools.py:13–18`, `:56` |
| Adresse des Dashboards | **`http://192.168.178.250:5050`** — reines http (Port 5050 → 5000 im Behälter, `SESSION_COOKIE_SECURE` standardmäßig `false`) | `docker-compose.nas.yml:11–12`, `:36` |

### Vier Stolpersteine für Stufe 2

**1. `url` muss auf `/m/<key>` zeigen, nicht auf die echte Adresse.**
Das ist die wichtigste Stelle. `gelaende.js:796` macht für iframe-Module
`window.location.href = m.url`. Stünde dort die Audio-Adresse, führte ein Klick
auf dem Gelände den ganzen Browser dorthin — die Embed-Hülle käme nie zum
Zuge. Das einzige iframe-Modul macht es richtig vor:

```sql
url = '/m/plan-layout',  meta.embed_src = '/tools/layoutplaner/app'
```
(`migrations/002_layoutplaner.sql:9–12`)

**2. `allow-forms` fehlt im Sandkasten.** In `embed.html:23` steht es nicht.
Ein Formular im Rahmen lässt sich damit **nicht absenden** — auch kein
Anmeldeformular. Beim Layoutplaner ist das nie aufgefallen, weil er ein
statisches Werkzeug ohne Formulare ist. Für Audio wäre es ein stiller
Fehlschlag.

**3. Ein Zertifikatsfehler ist im Rahmen nicht wegklickbar.** Der Browser zeigt
in einem `<iframe>` keine Warnseite, sondern lässt ihn leer. Die
„KOMPLIZEN VgV NAS Test CA" (oder welche CA 18098 verwendet) muss auf **jedem**
Arbeitsplatz im Speicher liegen. Dass die Dashboard-Seite http ist und der
Rahmen https, ist dagegen **kein** Problem — Mixed Content sperrt nur die
Gegenrichtung.

**4. Kleinigkeit:** `embed.html:13` schreibt „Planung" fest in den Rücklink,
unabhängig von der Rubrik. Ein Büro-Modul bekäme dort „← Planung".

---

## 4. Status / Health

| Frage | Antwort | Fundstelle |
|---|---|---|
| Fragt das Dashboard `GET /api/health` der Module ab? | **Nein.** Es gibt keinen solchen Mechanismus und kein Feld dafür in `core_modules`. | — (keine Fundstelle; Suche über `app/`, `templates/`, `static/` ohne Treffer) |
| Erwartete Antwort | entfällt | — |
| Verhalten bei selbst signiertem https | **Würde scheitern.** | siehe unten |

Zwei Gesundheitsabrufe existieren, aber beide sind eigens gebaute Clients und
kein Registry-Mechanismus: `app/signage.py:99` (`/healthz` des
Empfangsdisplays) und `app/stammdaten.py:107` (`/health` des Protokolltools).

**Selbst signiertes Zertifikat, gemessen am 13.11.2026** am Schwesterfall auf
derselben NAS (VgV-Komplize, Port 18096): Aus dem Dashboard-Behälter heraus
scheitert die geprüfte TLS-Verbindung mit `CERTIFICATE_VERIFY_FAILED` — die
eigene CA liegt dort nicht im Vertrauensspeicher. Für eine serverseitige
Prüfung müsste das Stammzertifikat **ins Abbild**. Festgehalten in
`docs/VGV-INTEGRATION.md`.

Wenn eine Anzeige kommen soll, ist das Vorbild `ki_knoten.erreichbar` mit der
Schaltfläche „Knoten prüfen" auf `/ki-farm` (`app/ki.py:315 ff.`,
`app/routes/ki.py:233`) — **Prüfung auf Knopfdruck, kein Dauerabruf.**

---

## 5. Anmeldung

| Frage | Antwort | Fundstelle |
|---|---|---|
| Gibt das Dashboard Identität weiter? | **Nein.** Die Kachel ist ein nacktes `<a href>` — kein Token, kein Kopfzeilenfeld, kein Parameter. | `templates/shell.html:95–102`, `static/js/gelaende.js:796–800` |
| Meldet sich jedes Modul selbst an? | **Ja.** Das Dashboard meldet sich seinerseits am Active Directory an (`AD_*`). | `app/verzeichnis.py`, `docker-compose.nas.yml:23–31` |
| Steuert `min_role`, wer die Kachel **sieht**? | **Nein — jede Kachel wird immer gezeichnet.** `min_role` steuert nur `accessible`. Ohne Zugriff wird statt `<a>` ein `<div>` mit „kein Zugriff" gerendert: sichtbar, aber tot. | `app/auth.py:265–267`, `templates/shell.html:95–97` |

Die Auflösungsreihenfolge (`app/auth.py:168–240`):
`deny` → `meta.fuer_alle` → Admin → `allow` (user/group/eigene) → `min_role` → nein.

Einen Maschinenkanal gibt es, aber in die **andere** Richtung: Andere
Anwendungen rufen `POST /api/ki/dienst/unterhalten` mit gemeinsamem Schlüssel,
um die KI-Farm des Dashboards zu nutzen (`app/routes/ki.py:109 ff.`). Nichts
davon transportiert eine Identität zu einem Modul hin.

---

## 6. Einspielen

| Frage | Antwort | Fundstelle |
|---|---|---|
| Wo, nächste freie Nummer | `migrations/` im Wurzelverzeichnis. Höchste ist `036_vgv_komplize.sql` → **nächste frei: `037`** | — |
| Wie ausgeführt | **Von Hand.** `deploy-nas.ps1` kopiert den Ordner per `scp`, `docker-compose` hängt ihn unter `/docker-entrypoint-initdb.d` ein — Postgres führt den Ordner aber **nur beim allerersten Anlegen** einer leeren Datenbank aus. | `deploy-nas.ps1:53`, `docker-compose.nas.yml:106` |
| Repo, wer deployt | Lokal `C:\Komplizen Software\komplizen-dashboard`, Zweig `main`, **kein Git-Remote**. Auslieferung über `deploy-nas.ps1` auf `192.168.178.250`, Benutzer `Deploy`, Pfad `/volume1/docker/komplizen-dashboard`. | `deploy-nas.ps1:12–17` |
| Vorlage für ein **externes** Modul | **Nicht die Personalplanung** — die ist intern (`url = '/personalplanung'`, eine Flask-Route). Die richtigen Vorlagen sind `015_planserver.sql` und `036_vgv_komplize.sql`. | `migrations/008_personalplanung.sql:73` |

Ausführen:

```
ssh Deploy@192.168.178.250 "sudo /usr/local/bin/docker exec komplizen-dashboard-db \
  psql -U dashboard -d dashboard -v ON_ERROR_STOP=1 \
  -f /docker-entrypoint-initdb.d/037_buero_audio.sql"
```

**Hausregel für Migrationen** (wird von `pruefungen/pruefung-migrationen.py`
geprüft): `BEGIN;` auf eigener Zeile, dann
`SELECT pg_advisory_xact_lock(<nr>);`, am Ende `COMMIT;`. Ohne eigenes `BEGIN`
fällt das Schloss sofort wieder ab, weil `psql` aus jeder Zeile eine eigene
Transaktion macht — das sieht man der Datei nicht an.

---

## Prüfung eures Entwurfs

| # | Abweichung | Warum |
|---|---|---|
| 1 | `status = 'ok'` → besser **`'ext'`** | Hauskonvention für einen eigenständigen Dienst per Link (`015_planserver.sql:19`). Anzeige dann „Extern" statt „Produktiv"; `agent_says` funktioniert bei beiden. |
| 2 | `sort_order = 40` **kollidiert** mit `buero-formulare` | Kein Fehler, aber die Reihenfolge der beiden ist dann unbestimmt. Frei: 15, 60, 70. |
| 3 | `meta.hex = {"q":1,"r":2}` ist **keine Büro-Zelle** | Wird stillschweigend verworfen (`gelaende.js:88–92`). Büro-Terrasse ohnehin voll. **Weglassen.** |
| 4 | `meta = EXCLUDED.meta` **überschreibt ganz** | Ein späteres `fuer_alle`, `color` oder eine von Hand gesetzte Wabe wären beim nächsten Lauf weg. Haus-Muster: `meta = COALESCE(core_modules.meta,'{}'::jsonb) \|\| EXCLUDED.meta` (`015_planserver.sql:38`). |
| 5 | Kein `BEGIN;` / Schloss / `COMMIT;` | Hausregel, siehe oben. |
| 6 | Kein Wort zur **Sichtbarkeit** | Ohne Freigabe und ohne `meta.fuer_alle` sehen nur Dashboard-Admins eine benutzbare Kachel; alle anderen eine tote mit „kein Zugriff". Entscheidet euch: Einzelfreigaben (Muster `036`) oder `meta.fuer_alle` für alle (Muster `035`). |
| 7 | `rubrik 'buero'`, `key 'buero-audio'`, `min_role NULL`, `active true`, `agent_says` | **alles korrekt** |

### 1. Ist Stufe 1 so einspielbar?

**Ja**, wenn 1–6 erledigt sind. Fachlich stimmt alles: Schlüssel frei, Rubrik
zulässig, `embed_mode = 'link'` richtig, die URL geht als Ziel eines neuen Tabs
durch (`shell.html:101` setzt `target="_blank" rel="noopener"`).

### 2. Was fehlt für Stufe 2 (`iframe`)?

**Dashboard-Seite** (alles Änderungen, die ihr beauftragen müsst — ich habe
nichts angefasst):
- `url` auf `/m/buero-audio` umstellen, echte Adresse nach `meta.embed_src`
- `allow-forms` in den Sandkasten (`embed.html:23`), sonst kein Formular
- ggf. `allow="autoplay"` — ein `allow=`-Attribut existiert heute gar nicht
- `embed.html:13`: Rücklink sagt immer „Planung"

**Audio-Seite:**
- **kein `X-Frame-Options: DENY`.** Stattdessen
  `Content-Security-Policy: frame-ancestors http://192.168.178.250:5050`.
  Der VgV-Komplize auf 18096 sendet `DENY` (gemessen 13.11.2026) und ist
  deshalb gar nicht einbettbar — prüft das bei 18098, bevor ihr Stufe 2 plant.
- **Sitzungs-Cookie braucht `SameSite=None; Secure`.** In einem Rahmen fremder
  Herkunft schickt der Browser es sonst nicht mit, und jeder Aufruf sieht
  abgemeldet aus.
- Die CA muss auf jedem Arbeitsplatz vertraut sein.

### 3. Korrigierte Registry-Zeile

```sql
-- 037_buero_audio.sql
BEGIN;

SELECT pg_advisory_xact_lock(8112037);

INSERT INTO core_modules (key, rubrik, title, description, status, embed_mode,
                          url, sort_order, min_role, active, meta)
VALUES (
  'buero-audio', 'buero', 'Büro-Audio',
  'Lautsprecher im Büro: Radio, Lautstärke, später Spotify und Raumgruppen.',
  'ext', 'link', 'https://192.168.178.250:18098/audio/', 60, NULL, true,
  '{"agent_says": ["Robin spielt im Büro", "Klick: Audio öffnen"]}'::jsonb
)
ON CONFLICT (key) DO UPDATE SET
  rubrik      = EXCLUDED.rubrik,
  title       = EXCLUDED.title,
  description = EXCLUDED.description,
  status      = EXCLUDED.status,
  embed_mode  = EXCLUDED.embed_mode,
  url         = EXCLUDED.url,
  sort_order  = EXCLUDED.sort_order,
  meta        = COALESCE(core_modules.meta, '{}'::jsonb) || EXCLUDED.meta,
  active      = TRUE;

COMMIT;
```

Ohne `meta.hex` (Terrasse voll, die Karte setzt sie selbst) und **ohne**
Freigabe — die gehört dazu, sobald ihr entschieden habt, wer sie sehen soll.
Für „alle im Haus" wäre es `'{"fuer_alle": true}'` im `meta`, für einzelne
Personen Zeilen in `core_access_grants` nach dem Muster von
`036_vgv_komplize.sql`.
