# Heim-Audio – Zusammenarbeit auf der NAS

> **Multiroom-Wiedergabe mit Spotify auf den Bose-Lautsprechern, gesteuert über
> Home Assistant auf der Synology.**
> Bearbeitet von Domenico und Sven, unterstützt von Codex und Claude.
> Später eine **eigene Anwendung im Synology-Dashboard** – nach demselben Muster
> wie `komplizen-protokolle` (siehe `CLAUDE.md` §0 und §12).

Stand: 16.11.2026 · Status: **Planung**, noch nichts gebaut.

> Diese Datei liegt vorerst im Repository des Protokolltools, weil es das neue
> Repository noch nicht gibt. Sobald `heim-audio` angelegt ist (Schritt 1 unten),
> zieht sie dorthin um und wird dort zur `README.md`.

---

## 1. Ziel

1. **Jetzt:** Spotify auf allen Bose-Lautsprechern, einzeln oder als Gruppe
   („überall", „Erdgeschoss", „Küche + Wohnzimmer"), bedienbar aus Home Assistant
   und vom Handy.
2. **Danach:** Automationen – z. B. Musik morgens in der Küche, alles aus beim
   Verlassen des Hauses, Lautstärke nachts begrenzen.
3. **Später:** Eine eigene Kachel/Anwendung **„Audio"** im Synology-Dashboard –
   mit eigenem Container, eigenem Port, `GET /api/health` und DSM-Anmeldung.

---

## 2. Aufbau

```
                 Spotify (Premium-Konto)
                          │
                          ▼
   ┌─────────────────────────────────────────────┐
   │  Music Assistant  (Docker, Synology)         │  Gruppen, Warteschlange,
   │  Weboberfläche :8095 · Stream-Port :8097      │  Lautstärke je Raum
   └──────────────────────┬──────────────────────┘
                          │ erscheint als Mediaplayer
                          ▼
   ┌─────────────────────────────────────────────┐
   │  Home Assistant  (Synology) :8123            │  Dashboard-Karten,
   │                                              │  Automationen, Benutzer
   └──────────────────────┬──────────────────────┘
                          │ AirPlay / Chromecast / DLNA / SoundTouch-API
                          ▼                      (je nach Bose-Modell)
        Bose Wohnzimmer · Bose Küche · Bose Bad · …

   Später davor:
   ┌─────────────────────────────────────────────┐
   │  heim-audio  (eigene Dashboard-App)          │  /audio/ · /api/health
   │  dünne Oberfläche auf Music Assistant + HA   │  DSM-Login
   └─────────────────────────────────────────────┘
```

**Warum Music Assistant:** Die Spotify-App kann per Spotify Connect immer nur
**einen** Bose-Lautsprecher gleichzeitig bespielen. Music Assistant holt die Musik
selbst von Spotify und verteilt sie synchron auf mehrere Lautsprecher.

---

## 3. Offene Fragen (vor dem Bauen klären)

| # | Frage | Warum wichtig | Antwort |
|---|---|---|---|
| 1 | **Welche Bose-Modelle?** (SoundTouch 10/20/30/300, Home Speaker 300/500, Smart Soundbar, SoundLink …) | Entscheidet, wie Music Assistant sie erreicht (AirPlay, Chromecast, DLNA, SoundTouch-API) | |
| 2 | **Wie läuft Home Assistant?** Docker-Container **oder** Home Assistant OS in einer VM (Virtual Machine Manager)? | Im Container gibt es keine Add-ons → Music Assistant als eigener Container | |
| 3 | **Was läuft unter `https://192.168.178.250:18098/audio/`?** | Port und Pfad gehören evtl. schon einer Anwendung / einem Reverse-Proxy-Eintrag | |
| 4 | **Spotify Premium vorhanden?** Welches Konto? | Ohne Premium keine Wiedergabe über Music Assistant | |
| 5 | **SoundTouch-Cloud:** Was funktioniert nach Boses Abschaltung noch (App, Voreinstellungen, Gruppen)? | Nur auf lokale Wege bauen, die sicher bleiben | |
| 6 | **Feste IP-Adressen** für die Lautsprecher im Router (DHCP-Reservierung)? | Ohne feste IPs verliert HA die Geräte nach Neustarts | |

---

## 4. Wer macht was

| Wer | Rolle | Zugänge |
|---|---|---|
| **Domenico** | Eigentümer, NAS-Admin, entscheidet | DSM-Admin, GitHub-Owner, Spotify-Konto |
| **Sven** | Mitentwickler, testet im Haus | DSM-Benutzer, HA-Benutzer (Admin), GitHub-Mitarbeiter, VPN |
| **Codex** | Schreibt Code/Konfiguration im Repository | nur GitHub (siehe §6) |
| **Claude** | Schreibt Code/Konfiguration im Repository | nur GitHub (siehe §6) |

**Grundsatz:** Die KI-Agenten arbeiten **nur im Repository**. Sie kommen nicht an
die NAS, nicht ins Heimnetz und an keine Passwörter. Auf die NAS bringt den Stand
immer ein Mensch – per Deploy-Skript.

---

## 5. Zugänge einrichten (einmalig, Domenico)

### 5.1 GitHub
- [ ] Neues privates Repository **`heim-audio`** anlegen.
- [ ] Sven als **Collaborator** einladen (Settings → Collaborators).
- [ ] Codex-Zugriff auf das Repository freigeben (ChatGPT → Codex → GitHub verbinden,
      nur dieses Repository auswählen).
- [ ] Claude-Zugriff: Claude-GitHub-App für `heim-audio` installieren.
- [ ] Branch-Schutz auf `main`: Änderungen nur über Pull Request, eine Freigabe
      durch einen Menschen (Domenico **oder** Sven).

### 5.2 Synology (DSM)
- [ ] DSM-Benutzer für Sven (falls noch nicht vorhanden).
- [ ] Ordner `/volume1/docker/heim-audio/` mit `data/` und `logs/` anlegen.
- [ ] Sven Lese-/Schreibrecht auf `/volume1/docker/heim-audio/`, **nicht** auf
      andere App-Ordner.
- [ ] Deploy wie beim Protokolltool über den Benutzer `Deploy` per SSH-Key
      (siehe `CLAUDE.md` §3.4). Svens öffentlichen SSH-Key bei `Deploy` hinterlegen,
      wenn er selbst deployen soll.

### 5.3 Home Assistant
- [ ] Einstellungen → Personen → **Sven** anlegen, „Darf sich anmelden" an,
      bei Bedarf „Administrator".
- [ ] Langlebiges Zugriffstoken **nur für die spätere Dashboard-App** erzeugen
      (Profil → Sicherheit). Es kommt in die `.env` auf der NAS, nie ins Repository.

### 5.4 Fernzugriff für Sven
- [ ] Zugriff von außen nur über **VPN** (Synology VPN Server oder WireGuard im
      Router) – Home Assistant und Music Assistant **nicht** direkt ins Internet
      freigeben.

---

## 6. Zusammenarbeit mit Codex und Claude

### 6.1 Was die Agenten können – und was nicht
- ✅ Dateien im Repository lesen und schreiben, Branches anlegen, Pull Requests öffnen.
- ✅ Docker-Compose-Dateien, HA-YAML, Automationen, später den Code der Dashboard-App
      schreiben.
- ❌ **Keinen Zugriff auf `192.168.178.x`.** Codex und Claude laufen in der Cloud;
      die NAS, Home Assistant und die Boxen sind für sie nicht erreichbar.
- ❌ Keine Passwörter, Tokens oder Spotify-Zugänge – die stehen nur auf der NAS.

Deshalb gilt: **Testen im Haus machen Domenico oder Sven**, und das Ergebnis
(Fehlermeldung, Log-Auszug, Bildschirmfoto) geht zurück in den Pull Request oder
in ein Issue. Daran arbeitet der Agent weiter.

### 6.2 Anweisungsdateien im Repository
| Datei | Wer liest sie |
|---|---|
| `AGENTS.md` | Codex (und andere Agenten) – **die eigentlichen Regeln** |
| `CLAUDE.md` | Claude – enthält nur: „Lies und befolge `AGENTS.md`." |

So gibt es **eine** Regelquelle, die beide Agenten gleich befolgen.

Inhalt von `AGENTS.md` (Vorschlag):

```markdown
# heim-audio – Regeln für Agenten

- Sprache: Deutsch in Doku, Commits und Oberfläche.
- Arbeite immer auf einem eigenen Branch (`codex/<thema>` bzw. `claude/<thema>`),
  nie direkt auf `main`. Änderungen nur per Pull Request.
- Keine Secrets ins Repository. Werte kommen aus `.env` (Vorlage: `.env.example`).
- Du kannst die NAS und das Heimnetz nicht erreichen. Behaupte nie, etwas
  getestet zu haben, das nur im Haus testbar ist – schreib in den Pull Request,
  was ein Mensch prüfen muss („Testanleitung").
- Jede neue Funktion: kurzer Eintrag in `docs/AENDERUNGEN.md`.
- Dashboard-Muster einhalten: eigener Container, Port 18098, `GET /api/health`,
  DSM-Login über `SYNOLOGY_URL`, Daten nur unter `/data`, Logs unter `/logs`.
```

### 6.3 Arbeitsablauf
```
Issue anlegen (Mensch)          „Küche + Wohnzimmer als Gruppe 'Erdgeschoss'"
      │
Agent arbeitet auf Branch       codex/gruppe-erdgeschoss
      │
Pull Request mit Testanleitung  „Nach Deploy: in MA → Gruppen prüfen …"
      │
Mensch prüft Code + deployt     .\deploy-nas.ps1   (Testlauf im Haus)
      │
Ergebnis in den PR schreiben    ok → mergen · Fehler → Agent bessert nach
```

**Damit sich Codex und Claude nicht in die Quere kommen:** Ein Issue gehört immer
genau einem Agenten (Label `codex` oder `claude`). Nie beide gleichzeitig an
derselben Datei arbeiten lassen.

---

## 7. Repository-Struktur (Ziel)

```
heim-audio/
├── README.md                    # diese Datei (nach dem Umzug)
├── AGENTS.md                    # Regeln für Codex & Co.
├── CLAUDE.md                    # Verweis auf AGENTS.md
├── .env.example                 # Vorlage ohne echte Werte
├── docker-compose.yml           # Music Assistant (+ später die Dashboard-App)
├── deploy-nas.ps1               # nach Vorbild komplizen-protokolle
├── homeassistant/
│   ├── packages/audio.yaml      # Gruppen, Skripte, Szenen
│   └── automations/             # z. B. morgens-kueche.yaml
├── app/                         # später: Dashboard-App „Audio"
│   ├── server/                  # Express: /api/health, DSM-Login, Proxy zu MA/HA
│   └── src/                     # Oberfläche: Räume, Gruppen, Lautstärke
└── docs/
    ├── EINRICHTUNG.md           # Schritt für Schritt im Haus
    ├── LAUTSPRECHER.md          # Modell, IP, Anschlussweg je Box
    └── AENDERUNGEN.md
```

---

## 8. NAS-Seite

### 8.1 Verzeichnis
```
/volume1/docker/heim-audio/
├── docker-compose.yml
├── .env                         # Secrets – nur hier
├── music-assistant/             # → Container /data
├── data/                        # später: Dashboard-App
└── logs/
```

### 8.2 Ports (Belegung festhalten)
| Dienst | Port | Bemerkung |
|---|---|---|
| Home Assistant | 8123 | bestehend |
| Music Assistant Web | 8095 | Standard |
| Music Assistant Stream | 8097 | muss von den Boxen erreichbar sein |
| **heim-audio (Dashboard-App)** | **18098** | Pfad `/audio/` – vorher prüfen, was dort heute läuft (Frage 3) |
| komplizen-protokolle | 3000 | zum Vergleich, nicht anfassen |

### 8.3 Music Assistant (Entwurf – vor dem Einsatz mit der aktuellen Doku abgleichen)
```yaml
services:
  music-assistant:
    image: ghcr.io/music-assistant/server:latest
    container_name: music-assistant
    restart: unless-stopped
    network_mode: host          # nötig: Lautsprecher werden per mDNS/Multicast gefunden
    volumes:
      - /volume1/docker/heim-audio/music-assistant:/data
    cap_add:
      - SYS_ADMIN
      - DAC_READ_SEARCH
    security_opt:
      - apparmor:unconfined
```

> **`network_mode: host`** ist auf der Synology wichtig: Im normalen Bridge-Netz
> sieht der Container die Bose-Boxen nicht (gleiche Ursache wie die interne IP
> 172.17.0.2 im Protokolltool, `CLAUDE.md` §3.5).

### 8.4 Einbindung in Home Assistant
- Integration **Music Assistant** hinzufügen (Adresse `http://192.168.178.250:8095`).
- Bei SoundTouch-Modellen zusätzlich die Integration **Bose SoundTouch** – sie
  erkennt die Boxen lokal und bietet eigene Zonen-Funktionen.

---

## 9. Später: Anwendung „Audio" im Dashboard

Nach der Checkliste aus `CLAUDE.md` §12:

1. Eigenes Repository `heim-audio`, zweistufiges `Dockerfile`.
2. Ordner `/volume1/docker/heim-audio/`.
3. Außenport **18098**, Reverse-Proxy-Pfad `/audio/`.
4. `GET /api/health` – meldet zusätzlich, ob Music Assistant und HA erreichbar sind.
5. **DSM-Login** über `SYNOLOGY_URL` – dieselbe Anmeldung wie im Protokolltool.
6. Reverse-Proxy-Eintrag in DSM.
7. Deploy-Skript nach Vorbild `deploy-nas.ps1`.
8. Secrets (HA-Token, ggf. MA-Token) nur in der `.env` auf der NAS.

**Umfang der ersten Version:** Räume als Kacheln, Play/Pause, Lautstärke je Raum,
Gruppen zusammenstellen, aktuelle Spotify-Wiedergabe anzeigen. Die App spricht
**nicht** selbst mit Spotify oder den Boxen, sondern nur mit Music Assistant und
Home Assistant – eine Stelle für die Musiklogik, keine zweite.

---

## 10. Nächste Schritte

1. [ ] Fragen aus §3 beantworten (Domenico/Sven, im Haus).
2. [ ] Repository `heim-audio` anlegen, Sven + Codex + Claude freischalten (§5.1).
3. [ ] Diese Datei als `README.md` dorthin übernehmen, `AGENTS.md` anlegen (§6.2).
4. [ ] `docs/LAUTSPRECHER.md` mit Modell + IP je Box füllen.
5. [ ] Music Assistant per Compose starten, Spotify verbinden, erste Gruppe testen.
6. [ ] Danach: Automationen, dann die Dashboard-App.
