# Komplizen Protokolle – Synology Deployment

Dieses Dokument beschreibt die Installation auf einem Synology NAS mit
**Container Manager** (DSM 7.1+).

---

## Voraussetzungen

| | |
|---|---|
| Synology DSM | 7.1 oder neuer |
| RAM | mindestens 512 MB frei |
| Paket | **Container Manager** (aus dem Paket-Zentrum installieren) |
| Architektur | x86-64 (z. B. DS923+) oder ARM64 (z. B. DS224+) |

---

## Option A – Docker Compose (empfohlen, DSM 7.2+)

### 1. Projektordner anlegen

In der **File Station** einen Ordner anlegen, z. B.:

```
/volume1/docker/komplizen-protokolle/
```

Darin zwei Unterordner erstellen:

```
data/
logs/
```

### 2. Image bauen (auf dem Entwicklungsrechner)

```bash
# Im Projektverzeichnis (wo die Dockerfile liegt):
docker build -t komplizen-protokolle:latest .

# Image exportieren
docker save -o komplizen-protokolle.tar komplizen-protokolle:latest
```

### 3. Image auf die Synology übertragen

```bash
# Per SCP
scp komplizen-protokolle.tar admin@192.168.1.100:/volume1/docker/komplizen-protokolle/
```

Dann im **Container Manager → Image → Hinzufügen → Aus Datei hinzufügen**
die `komplizen-protokolle.tar` auswählen.

### 4. docker-compose.yml hochladen

Die Datei `docker-compose.yml` aus dem Projekt in den Ordner
`/volume1/docker/komplizen-protokolle/` kopieren.

Optional: `API_KEY` in der compose-Datei setzen (ein zufälliger, langer String):

```yaml
environment:
  API_KEY: "ersetze-durch-32-zufaellige-zeichen"
```

### 5. Container starten

Im **Container Manager → Projekt → Erstellen**:
- Projektname: `komplizen-protokolle`
- Pfad: `/volume1/docker/komplizen-protokolle`
- Datei: `docker-compose.yml`

Alternativ per SSH:

```bash
cd /volume1/docker/komplizen-protokolle
docker compose up -d
```

---

## Option B – Manuell über Container Manager UI

1. **Container Manager → Image → Aus URL hinzufügen** → oder importiere die `.tar`
2. **Container → Erstellen**:
   - Image: `komplizen-protokolle:latest`
   - Port: Host `3000` → Container `3000`
   - Volumes:
     - `/volume1/docker/komplizen-protokolle/data` → `/data`
     - `/volume1/docker/komplizen-protokolle/logs` → `/logs`
   - Umgebungsvariablen:
     - `PORT=3000`
     - `HOST=0.0.0.0`
     - `DB_PATH=/data`
     - `LOG_PATH=/logs`
     - *(optional)* `API_KEY=<geheimer-schluessel>`

---

## Ersten Admin-Benutzer anlegen

Nach dem ersten Start ist die App im **offenen Modus** – jeder im Netzwerk
kann zugreifen. Lege sofort einen Admin-Benutzer an:

```bash
curl -s -X POST http://192.168.1.100:3000/api/auth/users \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","displayName":"Administrator","password":"SicheresPasswort123!","role":"admin"}'
```

Ab sofort ist die Anmeldung für alle Zugriffe erforderlich.

**Weitere Benutzer** können danach im Browser über  
**Startseite → Zahnrad-Icon → Benutzer anlegen** erstellt werden.

---

## HTTPS über Synology Reverse Proxy

Synology kann das SSL-Zertifikat (Let's Encrypt oder eigenes) verwalten
und den Traffic per Reverse Proxy an den Container weiterleiten.

### Schritte

1. **Systemsteuerung → Anmeldeportal → Erweitert → Reverseproxy**
2. **Erstellen**:
   - Quellprotokoll: `HTTPS`
   - Quellhostname: `protokoll.meinefirma.de` (oder lokale IP)
   - Quellport: `443`
   - Zielprotokoll: `HTTP`
   - Zielhost: `localhost`
   - Zielport: `3000`
3. Unter **Anmeldeportal → Zertifikat** das gewünschte Zertifikat zuweisen.

**Wichtig:** `ALLOWED_ORIGINS` in der compose-Datei auf die HTTPS-Adresse setzen,
damit CORS-Fehler vermieden werden:

```yaml
ALLOWED_ORIGINS: "https://protokoll.meinefirma.de"
```

---

## Direktes HTTPS ohne Reverse Proxy

Alternativ kann der Container selbst TLS terminieren.
Zertifikat und Schlüssel auf die Synology kopieren:

```bash
scp fullchain.pem privkey.pem admin@nas:/volume1/docker/komplizen-protokolle/certs/
```

Dann in `docker-compose.yml`:

```yaml
volumes:
  - ./data:/data
  - ./logs:/logs
  - ./certs:/certs:ro
environment:
  HTTPS_CERT: /certs/fullchain.pem
  HTTPS_KEY:  /certs/privkey.pem
```

---

## Update

```bash
# 1. Neues Image bauen und exportieren (Entwicklungsrechner)
docker build -t komplizen-protokolle:latest .
docker save -o komplizen-protokolle-neu.tar komplizen-protokolle:latest

# 2. Auf Synology übertragen und importieren (wie oben)

# 3. Container neu starten
cd /volume1/docker/komplizen-protokolle
docker compose pull   # falls aus Registry
docker compose up -d --force-recreate
```

Die Datenbank in `/data` bleibt erhalten – kein Datenverlust.

---

## Backup

Für ein vollständiges Backup genügt es, den Ordner `/data` zu sichern:

```bash
# Manuell
cp -r /volume1/docker/komplizen-protokolle/data /volume1/backup/komplizen-$(date +%F)

# Oder Synology Hyper Backup: /volume1/docker/komplizen-protokolle/data einschließen
```

**Inhalt von `/data`:**
- `komplizen.db` – SQLite-Datenbank (alle Protokolle, Projekte, Benutzer)
- `attachments/` – Dateianhänge als Binärdateien

---

## Umgebungsvariablen – Referenz

| Variable | Standard | Beschreibung |
|---|---|---|
| `PORT` | `3000` | HTTP-Port im Container |
| `HOST` | `0.0.0.0` | Bind-Adresse |
| `DB_PATH` | `/data` | Verzeichnis für SQLite-DB und Anhänge |
| `LOG_PATH` | `/logs` | Verzeichnis für Access-Log |
| `API_KEY` | *(leer)* | Statischer API-Schlüssel (X-API-Key Header) |
| `ALLOWED_ORIGINS` | *(alle)* | CORS-Whitelist, kommagetrennt |
| `HTTPS_CERT` | *(leer)* | Pfad zum TLS-Zertifikat (PEM) |
| `HTTPS_KEY` | *(leer)* | Pfad zum TLS-Schlüssel (PEM) |

---

## Fehlerbehebung

### Container startet nicht

```bash
docker logs komplizen-protokolle
```

Häufige Ursache: Berechtigungsproblem auf `/data` oder `/logs`.
Fix: Auf der Synology die Ordner mit Schreibrechten für den Docker-Nutzer versehen.

### "Frontend nicht gebaut"

Das `dist/`-Verzeichnis fehlt im Image. Das Image muss neu gebaut werden:

```bash
docker build --no-cache -t komplizen-protokolle:latest .
```

### Port 3000 bereits belegt

In `docker-compose.yml` den Host-Port ändern, z. B. `"3001:3000"`.

### Passwort vergessen (Admin)

Da kein Passwort-Reset per E-Mail existiert, muss der Admin-Nutzer
per SQLite direkt zurückgesetzt werden:

```bash
# In den Container wechseln
docker exec -it komplizen-protokolle sh

# SQLite öffnen
sqlite3 /data/komplizen.db

# Neuen Hash generieren (bcrypt, aus Node.js):
# node -e "require('bcryptjs').hash('NeuesPasswort123!', 12).then(console.log)"
# Dann:
UPDATE users SET password_hash = '<neuer-hash>' WHERE username = 'admin';
.quit
```
