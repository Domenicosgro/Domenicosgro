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

## 5. Abnahme-Checkliste

- [ ] Container läuft, `docker compose ps` = **healthy**
- [ ] Über Dashboard-Adresse erreichbar (Reverse-Proxy)
- [ ] DSM-Login funktioniert, ein Admin bestätigt
- [ ] E-Mail-Test erfolgreich (Graph)
- [ ] Einladungs-/Freimelde-Link zeigt die **öffentliche** URL
- [ ] Secrets nur in der NAS-`docker-compose.yml`

---

## 6. Drei Stolpersteine

1. **ENV geändert?** Container **löschen + neu erstellen** (nicht nur „starten").
2. **Daten umziehen?** `komplizen.db` **inkl. `-shm`/`-wal`** + `attachments/` kopieren.
3. **Falsche Links?** `PUBLIC_URL` auf die echte Adresse setzen (nicht Docker-IP `172.x`).

---

*Vollständige Doku: `CLAUDE.md` · NAS-Details: `SYNOLOGY.md`, `SERVER-KONZEPT.md`*
