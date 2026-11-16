# KOMPLIZEN Büro-Audio – Infos für die Zusammenarbeit

> Ziel: Domenico, Sven und Codex/Claude arbeiten gemeinsam an der bestehenden
> Audio-App weiter. Später soll sie eine Anwendung im Synology-Dashboard werden.
>
> **Keine Passwörter, Tokens oder Schlüssel hier eintragen.** Nur notieren, *wo*
> sie liegen.

---

## 1. Bekannt (laut Sven, 16.11.2026)

| Punkt | Stand |
|---|---|
| Name | KOMPLIZEN Büro-Audio |
| Adresse | `192.168.178.250:18098/audio/` (Synology) |
| Anmeldung | Domänenkonto (z. B. `ds`) |
| Einrichter der App | `sb` (Sven), `ds` (Domenico) |
| Lautsprecher | **Robin** – Bose SoundTouch 20, steht zum Testen bei Sven |
| Kette | App ↔ Home Assistant ↔ Robin – funktioniert |
| Funktionen heute | Robin im Bürogrundriss · Zustand, Quelle, Lautstärke auslesen · Position bearbeiten · Pegel einstellen · 14 Internetradiosender (u. a. radioeins, Deutschlandfunk, FluxFM) |
| Hörbar getestet | radioeins |
| Ansichten | **Alle**, **Sherwood**, **Camelot** – für Gruppen/Raumszenarien vorbereitet, noch nicht aktiv |
| Gruppen/Zusammenschaltung | wird getestet, sobald weitere Lautsprecher da sind |
| Fehlt für Einzelbetrieb | **Spotify-Bürokonto** |
| Git-Zugang | Repo wird gerade gebaut, Ablauf siehe Abschnitt 2 |

---

## 2. Git-Zugang (Repository wird gerade gebaut)

Vorgehen nach `docs/ANLEITUNG-GIT-ZUGANG-KI.md`. Wichtig: Eine Einladung als
Collaborator reicht für Claude/Codex **nicht** – die Apps muss der **Besitzer des
Repos** auf seinem Konto installieren.

| Schritt | Wer | Erledigt |
|---|---|---|
| Besitzer festlegen (Konto oder Organisation) | | ☐ |
| Repo **privat** anlegen, Code hochladen | Sven | ☐ |
| Domenico als Collaborator einladen | Besitzer | ☐ |
| **Claude-App** installieren („Only select repositories" → Audio-Repo) | Besitzer | ☐ |
| **Codex-App** für dasselbe Repo freigeben | Besitzer | ☐ |
| Kontrolle: Repo → Settings → **GitHub Apps** zeigt beide | Besitzer | ☐ |
| `AGENTS.md` + `CLAUDE.md` („Lies und befolge AGENTS.md.") | | ☐ |
| `.gitignore` für Secrets, `*.example`-Vorlage im Repo | | ☐ |
| Issue-Vorlage + Labels (`idee`, `in-arbeit`, `umgesetzt`, `doppelt`, `entscheidung-noetig`) | | ☐ |
| GitHub Actions: Tests bei jedem PR | | ☐ |

| Frage | Antwort |
|---|---|
| Repo-URL / Besitzer | |
| Haupt-Branch (`main` = live?) | |
| Sprache / Framework | |
| Lokal starten zum Entwickeln – wie? | |
| Gibt es Tests / README? | |

## 3. Noch offen – Betrieb auf der NAS

| Frage | Antwort |
|---|---|
| Container-Name(n), Image | |
| Ordner auf der NAS, Lage der `docker-compose.yml` | |
| Daten und Logs – wo? | |
| Wer stellt Port 18098 und den Pfad `/audio/` bereit? (App selbst, DSM-Reverse-Proxy, …) | |
| Wie wird eine neue Version eingespielt? Wer darf das? | |
| Health-Endpunkt vorhanden? (`/api/health`) | |
| Backup? | |
| Wo liegen Secrets (HA-Token usw.)? | |

---

## 4. Noch offen – Home Assistant und Geräte

| Frage | Antwort |
|---|---|
| HA-Adresse und Installationsart (Container / HA OS in VM) | |
| Wie spricht die App mit HA? (REST, WebSocket, Token) | |
| Welche HA-Integration für Robin? (Bose SoundTouch?) | |
| Woher kommen die 14 Radiosender? (feste Liste in der App, HA, TuneIn, …) | |
| Robin: feste IP-Adresse? | |
| Welche weiteren Lautsprecher kommen wohin? (Sherwood, Camelot, …) | |
| Wo ist der Bürogrundriss abgelegt? | |

### Lautsprecher

| Name | Modell | Raum / Ansicht | IP (fest?) | Status |
|---|---|---|---|---|
| Robin | Bose SoundTouch 20 | Test bei Sven | | läuft |
| | | | | |
| | | | | |

---

## 5. Noch offen – Spotify

| Frage | Antwort |
|---|---|
| Wer legt das Spotify-Bürokonto an? (Premium nötig) | |
| Wie soll es eingebunden werden? (Spotify Connect direkt auf Robin, über HA, Music Assistant, …) | |
| Wo liegen die Zugangsdaten danach? | |
| Hinweis: Boses SoundTouch-Cloud wurde 2026 abgeschaltet – geht Spotify auf Robin noch? | |

---

## 6. Noch offen – Zusammenarbeit

| Frage | Antwort |
|---|---|
| Wer liest Pull Requests von Codex/Claude gegen und mergt? | |
| Kanal für Absprachen (Issues, Chat, …) | |
| Bekannte Probleme / Baustellen | |
| Was soll auf keinen Fall angefasst werden? | |

> Hinweis für die Agenten: Codex und Claude laufen in der Cloud und erreichen die
> NAS (`192.168.178.x`) **nicht**. Sie arbeiten nur im Repository; testen im Büro
> müssen Sven oder Domenico.

---

## 7. Später – Anwendung im Dashboard

| Frage | Antwort |
|---|---|
| Bleibt es bei Port 18098 / Pfad `/audio/`? | |
| Anmeldung wie die anderen Dashboard-Apps (DSM)? Ist das schon so? | |
| Was soll die Dashboard-Kachel zeigen? (Status, laufender Sender, …) | |
