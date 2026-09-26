# Stammdaten-Schnittstelle des Protokolltools

> Phase 1 aus `komplizen-dashboard/docs/ARCHITEKTUR_STAMMDATEN.md`:
> eine Fassade vor der vorhandenen Datenhaltung. Intern ändert sich nichts,
> aber andere Anwendungen sprechen ab jetzt **nur** diese Routen und nie die
> Datenbank.
> Stand: September 2026 · `server/stammdaten.js`

---

## 1. Wozu

Die Personalplanung zieht ins Dashboard um. Sie nimmt ihre eigenen Daten mit
(Wochenzuteilungen, Einstellungen), braucht aber weiterhin **Projekte** und
**Mitarbeiter** — und die gehören dem Protokolltool. Statt sie zu kopieren,
holt sie sich diese hier.

> **Besitzprinzip:** Projekte und Mitarbeiter werden im Protokolltool gepflegt
> und hier nur gelesen. Die einzige Ausnahme ist das **Projektteam** — das
> pflegt die Personalplanung, deshalb darf sie es schreiben.

---

## 2. Zugang

Ein eigener Schlüssel, **nicht** der allgemeine `API_KEY` (der öffnet alles):

```
X-Stammdaten-Key: <STAMMDATEN_KEY aus der Umgebung>
```

| Fall | Antwort |
|---|---|
| richtiger Schlüssel | 200 — Aufrufer gilt als `__stammdaten__` |
| falscher Schlüssel | 401, wird als `AUTH_FAIL` protokolliert |
| Schlüssel gesetzt, Server kennt keinen | 503 — Schnittstelle nicht eingerichtet |
| gar kein Schlüssel | normale Sitzungsprüfung (ein Mensch im Tool) |

Ein falscher Schlüssel fällt **nicht** stillschweigend auf die Sitzungsprüfung
zurück. Sonst sähe ein Tippfehler in der Dashboard-Konfiguration wie ein
Anmeldeproblem aus, und ein Rateversuch bliebe unbemerkt.

Den Schlüssel erzeugen und auf beiden Seiten eintragen:

```bash
openssl rand -hex 32
```

Protokolltool: `STAMMDATEN_KEY` in der NAS-`docker-compose.yml`.
**ENV-Änderung heißt: Container löschen und neu erstellen** — „Starten" allein
übernimmt sie nicht.

---

## 3. Routen

| Route | Zweck |
|---|---|
| `GET /api/stammdaten/health` | Lebenszeichen mit Anzahl Projekte/Mitarbeiter |
| `GET /api/stammdaten/projekte` | alle nicht archivierten Projekte (`?archiviert=1` nimmt sie mit) |
| `GET /api/stammdaten/projekte/{id}` | ein Projekt |
| `PUT /api/stammdaten/projekte/{id}/team` | Projektteam setzen |
| `GET /api/stammdaten/mitarbeiter` | aktive Mitarbeiter (`?inaktiv=1` nimmt sie mit) |

### Projekt

```jsonc
{
  "id": "p-484",
  "name": "484 HMG Neubau Produktionshalle",
  "nummer": "484", "kuerzel": "HMG", "bezeichnung": "Neubau Produktionshalle",
  "gesellschaft": "GHBA", "vertrag": "Objektplanung", "generalplanung": false,
  "beauftragung": { "lph": [2, 3], "pre": ["machbarkeit"], "beauftragt": true },
  "team": [
    { "id": "t1", "name": "Anna Berg", "username": "aberg",
      "rolle": "Projektleitung", "anteil": 0.5 }
  ],
  "hex": null, "archived": false, "updatedAt": "2026-09-26T06:39:15.954Z"
}
```

`beauftragung` steuert im Gelände den **Bauzustand**, `team` die
**Sollbesetzung** (Σ Anteil × Kapazität). Beides wird hier genauso berechnet
wie in `server/gelaende.js` — die Ableitung steht an einer Stelle.

**Kontakte werden bewusst nicht herausgegeben.** Die Personalplanung braucht
sie nicht, und ein Teil davon kann projektweise verschlüsselt sein. Wer
Kontakte braucht, bekommt eine eigene Route mit eigener Begründung.

### Mitarbeiter

```jsonc
{
  "id": "s1", "name": "Anna Berg", "funktion": "Projektleitung",
  "username": "aberg", "weeklyHours": 40,
  "dayHours": { "mo": 8, "di": 8, "mi": 8, "do": 8, "fr": 8 },
  "active": true, "quelle": "contact", "updatedAt": "…"
}
```

`quelle: "contact"` heißt: Der Eintrag ist aus einem Kontakt der Kategorie
**„Eigene Organisation"** gespiegelt (`syncOrgContacts` in `server/index.js`).
Solche Einträge entstehen und verschwinden mit dem Kontakt und dürfen von außen
nicht bearbeitet werden — gesteuert wird über die Kontaktkategorie im
Protokolltool.

> **Folge für den Umbau:** `staff_members` und der Kontakt-Sync müssen im
> Protokolltool **bleiben**, auch wenn die Personalplanung dort entfernt wird.
> Sonst verliert das Dashboard seine Mitarbeiterliste.

### Team schreiben

```http
PUT /api/stammdaten/projekte/p-484/team
{ "team": [ { "id": "t1", "name": "Anna Berg", "username": "aberg",
             "rolle": "Projektleitung", "anteil": 0.75 } ] }
```

- Nur bekannte Felder werden übernommen (`id`, `name`, `username`, `rolle`,
  `anteil`) — ein Aufrufer kann dem Projekt nichts unterschieben.
- Einträge ohne `id` oder ohne Namen/Benutzer fallen weg.
- Alles andere am Projekt bleibt unberührt: Kontakte, Leistungsphasen,
  Gesellschaft, Verträge.
- Bei gleichzeitiger Änderung wird einmal mit frischem Stand nachgefasst,
  danach `409`.

| Fehler | Antwort |
|---|---|
| Projekt unbekannt | 404 |
| `team` ist keine Liste | 400 |
| Änderungskonflikt bleibt bestehen | 409 |

---

## 4. Was hier (noch) nicht steht

Bewusst offen, bis es jemand braucht — jede Erweiterung kostet Pflege:

- Organisationen und Personen (Kontakte) — Regelwerk: `komplizen-dashboard/docs/REGELWERK_KONTAKTE.md`
- Anlegen und Ändern von Projekten
- Protokolle, Mängel, Baudokumentation — das sind Anwendungsdaten, keine Stammdaten
