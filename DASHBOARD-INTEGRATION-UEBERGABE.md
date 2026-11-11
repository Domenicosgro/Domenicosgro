# Übergabe: „Komplizen Protokolle" ins Firmen-Dashboard

Eigenständige Web-App (Besprechungsprotokolle für Bauprojekte), die als **eine Container-App**
im Synology-Dashboard läuft. Diese Seite reicht zum Aufsetzen. Details: `CLAUDE.md`.

---

## 1. Was die App dem Dashboard bietet

| Punkt | Wert |
|---|---|
| Image / Container | `komplizen-protokolle:latest` |
| Interner Port | **3000** (Außenport frei) |
| Health-Check | `GET /api/health` |
| Login | Synology-DSM (gemeinsames Benutzerverzeichnis) |
| Daten | alles im Volume `/data` (DB + Anhänge + Backups) |

---

## 2. Vorher entscheiden

- **Außenport** – im Dashboard eindeutig (z. B. `3000`, nächste App `3001` …).
- **Öffentliche URL** (`PUBLIC_URL`) – echte LAN-/Proxy-Adresse, **nicht** die Docker-IP.
- **E-Mail** – Microsoft Graph (empfohlen).

---

## 3. Aufsetzen (NAS)

**1. Ordner anlegen**
```
/volume1/docker/komplizen-protokolle/
├── docker-compose.yml
├── data/     → /data   (DB, Anhänge, Backups)
└── logs/     → /logs
```

**2. `docker-compose.yml`** (Vorlage im Repo; Secrets NUR hier, nie in Git)
```yaml
services:
  komplizen-protokolle:
    image: komplizen-protokolle:latest
    container_name: komplizen-protokolle
    restart: unless-stopped
    mem_limit: 2g
    ports:
      - "3000:3000"                                 # AUSSEN:innen
    volumes:
      - /volume1/docker/komplizen-protokolle/data:/data
      - /volume1/docker/komplizen-protokolle/logs:/logs
    environment:
      PORT: "3000"
      HOST: "0.0.0.0"
      PUBLIC_URL: "http://192.168.178.250:3000"     # echte Adresse!
      DB_PATH: "/data"
      LOG_PATH: "/logs"
      SYNOLOGY_URL: "http://192.168.178.250:5000"   # DSM-Login (5000 HTTP / 5001 HTTPS)
      GRAPH_TENANT_ID:     "<tenant>"               # E-Mail via Microsoft Graph
      GRAPH_CLIENT_ID:     "<client>"
      GRAPH_CLIENT_SECRET: "<secret>"               # NIE in Git
      GRAPH_SENDER:        "Protokoll@ghbarchitekten.de"
      STAMMDATEN_KEY:      "<schluessel>"                # Dashboard liest Projekte/Mitarbeiter
      KI_DASHBOARD_URL:    "http://192.168.178.250:5050" # Assistent: Weg zur KI-Farm
      KI_DASHBOARD_KEY:    "<schluessel>"                # = KI_DIENST_SCHLUESSEL im Dashboard
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 15s
```

**3. Starten**
```bash
cd /volume1/docker/komplizen-protokolle
docker compose up -d
docker compose ps        # -> healthy
```

**4. Reverse-Proxy** (optional, für Dashboard-Adresse)
`https://apps.<firma>.de/protokolle` → `http://localhost:3000`

---

## 4. Deploy / Update (vom Entwickler-PC)

```powershell
.\update.ps1     # build -> save -> scp -O -> ssh: stop/rm/load/up
```
DB und Sessions überleben den Container-Tausch → im Browser genügt Neuladen.

---

## 4a. (K)ompl(I)ze — der Assistent (Chatbot auf den Projektdaten)

Das Protokolltool bringt seinen **eigenen** Assistenten mit. Er liest nur, und
nur das, was die fragende Person auch in der Oberfläche sehen darf.

| Punkt | Wert |
|---|---|
| Braucht | `KI_DASHBOARD_URL` + `KI_DASHBOARD_KEY` (≥ 24 Zeichen) |
| Gegenstück | Dashboard: `KI_DIENST_SCHLUESSEL`, Route `POST /api/ki/dienst/unterhalten` |
| Ohne das | Der Knopf erscheint nicht – kein halbes Fenster mit Verbindungsfehlern |
| Daten | verlassen diesen Container **nicht als Daten**: Der Systemkopf wird hier gebaut, das Dashboard liefert nur die Antwort |

Warum der Umweg über das Dashboard und nicht direkt zu LM Studio: Dort
entscheidet `ki._reservieren` nach Rang, GPU-Last und dem Schalter „nur leicht",
welche Karte eine Anfrage bekommt. Eine eigene Leitung liefe daran vorbei und
würde auf einer Karte rechnen, an der jemand sitzt.

Begründung in voller Länge: `komplizen-dashboard/docs/ARCHITEKTUR_ASSISTENTEN.md`.
Einzelheiten hier: `CLAUDE.md` §15.

---

## 5. Abnahme-Checkliste

- [ ] Container läuft, `docker compose ps` = **healthy**
- [ ] Über Dashboard-Adresse erreichbar (Reverse-Proxy)
- [ ] DSM-Login funktioniert, ein Admin bestätigt
- [ ] E-Mail-Test erfolgreich (Graph)
- [ ] Einladungs-/Freimelde-Link zeigt die **öffentliche** URL
- [ ] Secrets nur in der NAS-`docker-compose.yml`
- [ ] (K)ompl(I)ze: Knopf unten rechts erscheint, eine Frage bekommt Fundstellen
      genannt und darunter „beantwortet von Komplize 54" (sonst stimmen die
      beiden KI-Schlüssel nicht überein)

---

## 6. Drei Stolpersteine

1. **ENV geändert?** Container **löschen + neu erstellen** (nicht nur „starten").
2. **Daten umziehen?** `komplizen.db` **inkl. `-shm`/`-wal`** + `attachments/` kopieren.
3. **Falsche Links?** `PUBLIC_URL` auf die echte Adresse setzen (nicht Docker-IP `172.x`).

---

*Vollständige Doku: `CLAUDE.md` · NAS-Details: `SYNOLOGY.md`, `SERVER-KONZEPT.md`*
