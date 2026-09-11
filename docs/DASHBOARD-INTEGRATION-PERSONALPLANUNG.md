# Personalplanung im Komplizen-Dashboard

> Wie die Personalplanung des Protokolltools als Modul im Dashboard erscheint –
> als Gelände-Ansicht nach `docs/MUSTER_GELAENDE-DARSTELLUNG.md`.
> Stand: September 2026 · Repo `komplizen-protokolle` (dieses Repo).

---

## 1. Entscheidung: additiv, nicht umgebaut

Das Dashboard hostet keine Anwendungen, und die Personalplanung bleibt dort, wo
ihre Daten liegen – im Protokolltool (`staff_members`, `staff_plan`, `projects`,
`staff_plan_settings`). Statt der in der Dashboard-Doku skizzierten Variante
„Weg C" mit eigenen `pp_`-Tabellen läuft die Personalplanung seit 2026-09-11 als
**eigenständige Oberfläche unter `/personalplanung`** im selben Container – und
das Dashboard nimmt sie über die Registry auf. Ergebnis:

- keine zweite Datenhaltung, keine Synchronisation, kein doppelter Pflegeaufwand
- die Registry bleibt die einzige Wahrheit darüber, **dass** es das Modul gibt
- im Dashboard sind es Registry-Zeilen (Weg A bzw. B), kein Blueprint

Wenn die Planung später doch im Dashboard laufen soll, bleibt der Weg offen: die
Daten liegen bereits als flache JSON-Liste am Endpunkt aus Abschnitt 3.

### Zwei Module, zwei Aufgaben

| Modul | Ziel | Weg | Anmeldung |
|---|---|---|---|
| **Personalplanung** (arbeiten) | `http://192.168.178.250:3000/personalplanung` | A – `embed_mode = link`, neuer Tab | DSM-Login des Protokolltools, nur Admins |
| **Personalplanung · Gelände** (schauen) | `http://192.168.178.250:3000/gelaende?token=…` | B – `embed_mode = iframe` | keine – der veröffentlichte Team-Link trägt den Zugriff |

Warum getrennt: Die Planung **bearbeiten** setzt eine Anmeldung am Protokolltool
voraus – im iframe erschiene sonst dessen Login-Maske, also gehört sie als Link
in einen eigenen Tab. Die Gelände-Ansicht ist dagegen lesend und login-frei über
das Token – genau das, was sich im Dashboard einbetten lässt. Wer nur eine Zeile
will, nimmt die erste: das Dashboard zeigt die Personalplanung dann als Kachel
bzw. Gebäude, und der Klick öffnet sie.

```
Browser ──▶ Dashboard  http://192.168.178.250:5050
                │  Anmeldung (DSM) + Zugriffslayer des Dashboards
                ├─ Klick „Personalplanung"  ──▶ neuer Tab
                │                              Protokolltool /personalplanung
                └─ /m/personalplanung-gelaende
                      └─ iframe ──▶ Protokolltool /gelaende?token=…
                                       └─ /api/gelaende/public/<token>/<KW>  (JSON)
```

## 2. Was gebaut wurde (in diesem Repo)

| Datei | Inhalt |
|---|---|
| `server/gelaende.js` | Datenaufbereitung je Kalenderwoche (flache Liste: Projekte, Personen, Agentenmeldungen) |
| `server/index.js` | Endpunkte (§3), Auslieferung der Einbettseite, CSP-Freigabe für das iframe |
| `src/gelaende/hex.js` | Hex-Mathematik, Auto-Platzierung (Ringsuche), BFS-Wegfindung |
| `src/gelaende/layout.js` | Quartiere, Farbfamilien, Parzellen, Deko, Zielwaben der Figuren |
| `src/gelaende/engine.js` | Three.js-Engine: Waben, Bauzustände, Figuren, Agenten, Kamera, Sprechblasen |
| `src/components/PersonalplanungGelaende.jsx` | Ansicht: Karte + flache Liste + Wochenregler + Panel + ANIM |
| `src/gelaendeEntry.jsx`, `gelaende.html` | eigener Vite-Einstieg → `dist/gelaende.html` (die eingebettete Seite) |
| `src/components/PersonalplanungView.jsx` | neuer Reiter „Gelände" (dieselbe Ansicht, angemeldet) |

Three.js kommt aus `node_modules` und wird mitgebaut – **keine CDN-Abhängigkeit**
im Betrieb, passend zu Prinzip 4 des Dashboards.

---

## 3. Schnittstellen

| Route | Schutz | Zweck |
|---|---|---|
| `GET /api/gelaende/personalplanung/<KW>` | Sitzung (Bearer) | Daten einer Woche, im Tool |
| `GET /api/gelaende/public/<token>/<KW>` | Token | dieselben Daten, login-frei |
| `GET /api/gelaende/public/<token>/agents` | Token | Kurzmeldungen für `meta.agent_says` |
| `GET /gelaende?token=…&week=…` | Token (oder Sitzung) | die einbettbare Vollbildseite |

`<KW>` ist eine ISO-Woche (`2026-W38`); fehlt sie, gilt die laufende Woche.
Das **Token ist dasselbe wie beim veröffentlichten Team-Link** (`/plan/<token>`):
es wird in der Personalplanung unter „Veröffentlichen" erzeugt und lässt sich
dort widerrufen – danach ist auch die Gelände-Einbettung tot.

### Antwortformat (gekürzt)

```jsonc
{
  "week": "2026-W38", "weekLabel": "KW 38", "monday": "2026-09-14",
  "projects": [{
    "id": "…", "kind": "project|service|absence", "name": "0801 KITA Musterweg",
    "short": "0801 KITA", "gesellschaft": "GHBA", "lphLabel": "LPH 2, 3",
    "state": "idee|fundament|rohbau|fertig|labor|buero|urlaub|krank",
    "saturation": "ok|unter|ueber",
    "personDays": 3.5, "headcount": 2, "sollDays": 6.75, "teamSize": 2,
    "hex": null, "color": null, "agentSays": ["3,5 Personentage, 2 Köpfe", "…"]
  }],
  "people": [{
    "id": "…", "name": "Anna Berg", "funktion": "Projektleitung",
    "capacityDays": 5, "plannedDays": 2.5, "loadPct": 50,
    "absence": null, "free": false,
    "targets": [{ "projectId": "…", "name": "0801 KITA Musterweg", "days": 2.5 }]
  }],
  "totals": { "capacityDays": 13.5, "plannedDays": 10, "loadPct": 74, "freePeople": 0, "absentPeople": 1 }
}
```

Die Liste ist **flach**: Platzierung, Farbfamilien und Formen entstehen im
Frontend (`src/gelaende/layout.js`). Eine feste Wabe lässt sich je Projekt über
`projectData.hex = {q, r}` hinterlegen; fehlt sie, platziert die Ringsuche
automatisch. Ein neues Projekt erscheint damit ohne jede Konfiguration.

---

## 4. Übersetzung des Musters

| Schicht | Umsetzung |
|---|---|
| **Raum** | Hex-Raster; Quartiere = **Gesellschaft** aus den Projektdaten, dazu „Leistungen" und „Abwesend" am Rand |
| **Objekt** | ein Gebäude je Projekt; Höhe ∝ Sollbesetzung, Parzellengröße ∝ Teamgröße (wochenunabhängig, damit die Karte beim Wochenwechsel ruhig bleibt) |
| **Zustand** | Bauzustand statt Farbpunkt (§4.1), Bake in Statusfarbe darüber |
| **Leben** | **Figuren mit Identität**: jede Person steht auf dem Projekt, dem sie diese Woche zugeteilt ist, und läuft beim Wochenwechsel dorthin; ein Agent je Objekt mit Meldungen |
| **Handlung** | Klick auf Projekt → Besetzung dieser Woche, Klick auf Person → Einsatzübersicht; Tooltip sagt es vorher an |

### 4.1 Bauzustand aus den Projektdaten

| Datenlage | Zustand | Form |
|---|---|---|
| nichts beauftragt (weder Vorleistung noch LPH) | `idee` | violettes Hologramm auf Sockel |
| beauftragt, diese und die letzten 4 Wochen niemand eingeplant | `fundament` | Fundamentplatte |
| diese Woche eingeplant | `rohbau` | Rohbau mit Gerüst, Kran dreht |
| beauftragt, zuletzt bearbeitet, diese Woche frei | `fertig` | fertiges Gebäude, warme Fenster |
| Zusatz-Leistung (`staff_plan_settings.services`) | `labor` | Glaskuppel |
| Urlaub / Krank / Büro | `urlaub` `krank` `buero` | Strand / gedimmtes Haus / Bürohaus |

Über-/Unterbesetzung kommt aus dem **Projektteam**: Soll = Σ(Anteil × Kapazität).
Über 115 % glüht die Parzelle rot von unten, unter 75 % bleiben die Fenster dunkel
und die Bake blinkt gelb. Ohne gepflegtes Team gibt es keinen Sollwert – dann
zeigt die Karte nur, was geplant ist.

Auslastung je Person: Figurgröße 0,9 (50 %) bis 1,1 (110 %), ab 100 % roter
Bodenring. Wer diese Woche keine Zuteilung hat, wartet am Brunnen.

---

## 5. Einbindung im Dashboard

### 5.1 Registry-Zeilen (Migration im Dashboard-Repo)

Fertig zum Kopieren: `docs/dashboard/007_personalplanung.sql` in diesem Repo →
im Dashboard-Repo als `migrations/007_personalplanung.sql` ablegen, Token
einsetzen, einspielen. Die Datei legt beide Zeilen an (Arbeiten + Gelände) und
ist idempotent (`ON CONFLICT (key) DO UPDATE`).

Einspielen auf der laufenden Datenbank (NAS, per SSH):

```
docker compose exec -T db psql -U dashboard -d dashboard < migrations/007_personalplanung.sql
```

> Umlaut-Fallstrick aus der Dashboard-Doku: die Datei aus PowerShell 5.1 nicht
> mit `Get-Content` lesen, sondern `[System.IO.File]::ReadAllText()`.

> **Annahme prüfen (nur für die Gelände-Zeile):** die Embed-Shell (`/m/<key>`,
> `templates/embed.html`) setzt `meta.embed_src` als `src` des iframes. Trägt sie
> dort ausschließlich **interne** Routen ein, akzeptiert sie unsere absolute
> Adresse womöglich nicht – dann entweder in `embed.html` absolute `http(s)://`-
> Werte durchlassen, oder die Gelände-Zeile ebenfalls auf `embed_mode = 'link'`
> stellen. Die erste Zeile (Personalplanung als Link) funktioniert in jedem Fall
> ohne Änderung am Dashboard.

### 5.2 Freigabe im Protokolltool (Pflicht)

Das Protokolltool verbietet Einbettung global (`frame-ancestors 'none'`). Für die
Gelände-Seite wird gezielt gelockert – in der NAS-`docker-compose.yml`:

```yaml
      EMBED_FRAME_ANCESTORS: "http://192.168.178.250:5050"
```

Ohne diesen Eintrag bleibt es bei `'self'`: die Seite funktioniert direkt im
Browser, das Dashboard-iframe bleibt leer. Mehrere Herkünfte durch Leerzeichen
trennen. **ENV-Änderung heißt: Container löschen und neu erstellen**, „Starten"
allein übernimmt sie nicht.

### 5.3 Agentenmeldungen aktuell halten (optional)

`meta.agent_says` ist statischer Text. Wer im Dashboard-Gelände den echten Stand
sprechen lassen will, holt ihn beim Rendern oder per Job:

```python
# app/routes/api.py – Ergänzung in der Agenten-Route
import requests
r = requests.get(f"{PP_URL}/api/gelaende/public/{PP_TOKEN}/agents", timeout=2)
says = r.json().get("says", [])     # z. B. ["KW 38: 74 % Auslastung", "2 ohne Zuteilung"]
```

Fällt das Protokolltool aus, bleibt die gepflegte Meldung stehen – der Aufruf
gehört deshalb in ein `try`.

---

## 6. Checkliste des Musters

| Punkt | Stand |
|---|---|
| Oberste Gliederung benannt → Regionen | ✓ Gesellschaft, dazu Leistungen/Abwesend |
| Je Datensatz ein Objekt, je Zustand eine Form | ✓ Tabelle §4.1 |
| Auto-Platzierung ohne Konfiguration | ✓ Ringsuche, feste Wabe optional (`projectData.hex`) |
| Deko definiert, Deko weicht Daten | ✓ Deko füllt erst, was frei bleibt |
| Farbe = Zugehörigkeit, Zustand = Form + Bake | ✓ Farbfamilie je Quartier |
| Figuren: Rauschen oder Identität | ✓ Identität (Name, Auslastung, Ziel) |
| Agentenmeldungen als Daten, Endpunkt vorgesehen | ✓ `agentSays` + `/agents` |
| Klick = die eine erwartete Aktion, Tooltip kündigt sie an | ✓ |
| Flache Liste neben der Karte, Hover hebt hervor | ✓ Schaltfläche „Liste" |
| Bewegung unabhängig von der Systemeinstellung, ANIM-Knopf | ✓ (nur die Kamerafahrt achtet auf „Bewegung reduzieren") |
| Marke Yellix, Rest Arial, eckig, kein Emoji, keine erfundenen Objekte | ✓ Brunnen ist erkennbar Landschaft |
| Natur drauf | ✓ Bäume, Büsche, Findlinge, Teiche, Glühwürmchen |

Offen gegenüber dem Muster: Personen lassen sich noch **nicht** per Drag auf ein
Projekt ziehen (Phase 2 im Muster) – geplant wird weiter im Wochenraster.

---

## 7. Betrieb

- Deploy wie immer: `.\update.ps1` (baut auch die neue Seite mit).
- Prüfen: `http://<nas>:3000/gelaende?token=<token>` im Browser, danach im
  Dashboard unter `/m/personalplanung`.
- Die Seite lädt Three.js nach (~670 kB gzip 186 kB) – im Tool erst beim Öffnen
  des Reiters „Gelände", nicht beim Start.
- Ohne WebGL zeigt die Ansicht die flache Liste als Rückfallebene.
