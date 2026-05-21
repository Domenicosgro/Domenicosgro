# Konzept: Mehrbenutzer-Synology-Server (Punkt 4)

**Status:** Konzeptphase – kein Code, noch keine Implementierung  
**Stand:** 2026-05-21  
**Basis:** Bestehender Express/SQLite-Server in `server/`

---

## 1. Ausgangslage & Ziele

### Was der aktuelle Server kann

Der bestehende Server in `server/index.js` ist ein einfacher Key-Value-Store:
- `GET /api/protocols` → gibt alle Protokolle als ein JSON-Array zurück
- `PUT /api/protocols` → ersetzt **das gesamte Array** auf einmal
- Gleiche Logik für Projekte
- Authentifizierung: optionaler globaler API-Key (`X-API-Key`)
- Datenhaltung: SQLite-Datenbank mit einer Zeile pro Tabelle (`store`-Tabelle mit `key` + `value`)

### Problem: Kein Mehrbenutzer-Betrieb möglich

Wenn Nutzer A und Nutzer B gleichzeitig arbeiten und beide `PUT /api/protocols` aufrufen, überschreibt die spätere Antwort die frühere **ohne Konflikterkennung**. Datenverlust ist vorprogrammiert.

### Ziele für Punkt 4

1. **Mehrere Benutzer gleichzeitig** können Protokolle lesen und bearbeiten
2. **Benutzerkonten** – jede Person meldet sich mit eigenem Nutzer/Passwort an
3. **Konflikte werden erkannt** – niemals stille Überschreibungen
4. **Echtzeit-Benachrichtigung** – Nutzer A sieht, wenn Nutzer B ein Protokoll ändert
5. **Synology-NAS-Deployment** – läuft ohne Cloud, on-premise
6. **Rückwärtskompatibel** – lokaler Modus (localStorage / Electron) bleibt unverändert

---

## 2. Architektur-Entscheidungen

### 2.1 Datengranularität: Zeilenbasierte API statt Bulk-Replace

#### Problem mit aktuellem Ansatz

```
PUT /api/protocols  →  ["id1":..., "id2":..., "id3":...]
```

Bei 2 gleichzeitigen Nutzern verliert immer der Zweite seine Änderung.

#### Lösung: Individuelle CRUD-Endpunkte pro Protokoll

```
GET  /api/protocols           → Liste aller Protokoll-IDs + Metadaten
GET  /api/protocols/:id       → Ein Protokoll vollständig
POST /api/protocols           → Neues Protokoll anlegen
PATCH /api/protocols/:id      → Einzelne Felder eines Protokolls aktualisieren
DELETE /api/protocols/:id     → Protokoll löschen
```

Gleiches Schema für Projekte.

#### Datenbankschema (statt aktuellem Key-Value-Store)

```sql
CREATE TABLE protocols (
  id          TEXT PRIMARY KEY,
  project_id  TEXT,
  data        TEXT NOT NULL,       -- JSON des Protokollobjekts
  version     INTEGER NOT NULL DEFAULT 1,
  updated_at  TEXT NOT NULL,
  updated_by  TEXT                 -- Nutzername
);

CREATE TABLE projects (
  id          TEXT PRIMARY KEY,
  data        TEXT NOT NULL,       -- JSON des Projektobjekts (inkl. encryptedContacts)
  version     INTEGER NOT NULL DEFAULT 1,
  updated_at  TEXT NOT NULL,
  updated_by  TEXT
);

CREATE TABLE attachments (
  id          TEXT PRIMARY KEY,
  protocol_id TEXT,
  filename    TEXT NOT NULL,
  mime_type   TEXT,
  size_bytes  INTEGER,
  stored_path TEXT NOT NULL,       -- relativer Pfad im data/attachments/-Ordner
  created_at  TEXT NOT NULL
);

CREATE TABLE users (
  username    TEXT PRIMARY KEY,
  display_name TEXT,
  password_hash TEXT NOT NULL,     -- bcrypt (12 Runden)
  role        TEXT NOT NULL DEFAULT 'editor', -- 'admin' | 'editor' | 'viewer'
  created_at  TEXT NOT NULL,
  last_login  TEXT
);

CREATE TABLE sessions (
  token       TEXT PRIMARY KEY,
  username    TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
```

---

### 2.2 Authentifizierung: Lokale Nutzerkonten + Session-Token

#### Gewählt: bcrypt + Session-Tokens (kein JWT)

**Warum nicht JWT?** JWTs können nicht invalidiert werden (kein Logout möglich ohne Blacklist). Session-Tokens in SQLite sind einfacher zu verwalten und auf Synology-NAS ausreichend.

**Warum nicht LDAP/DSM-Auth?** Synology DSM bietet LDAP, aber das macht die App zu Synology-spezifisch. Lokale Konten laufen überall.

```
POST /api/auth/login    → { username, password } → { token, expiresAt }
POST /api/auth/logout   → invalidiert den Token
GET  /api/auth/me       → gibt Nutzerinfo zurück
```

**Token:** 64-Byte kryptografisch zufälliger Hex-String, 8 Stunden gültig (konfigurierbar), wird per `Authorization: Bearer <token>` übermittelt.

**Passworte:** bcrypt mit 12 Runden. Kein Plaintext jemals gespeichert.

**Erster Admin:** Wird beim ersten Start erzeugt und im Terminal ausgegeben:
```
══════════════════════════════════════════════
  Admin-Konto angelegt: admin / Admin123!
  Bitte sofort ändern unter /admin/users
══════════════════════════════════════════════
```

**Admin-UI:** Einfache Passwort-geschützte Seite `/admin/users` zum Anlegen / Sperren von Konten (eingebettet in die bestehende React-App als neuer View).

---

### 2.3 Konflikterkennung: Optimistisches Locking via `version`

Jedes Protokoll und Projekt hat ein ganzzahliges `version`-Feld (startet bei 1, wird bei jedem PATCH inkrementiert).

**Client sendet beim PATCH:**
```json
PATCH /api/protocols/abc123
{ "version": 5, "data": { ... } }
```

**Server antwortet:**
- `200 OK { version: 6 }` → Erfolg, neues `version` speichern
- `409 Conflict { conflict: true, serverVersion: 7, serverData: {...} }` → Konflikt

**Client-Verhalten bei 409:**
- Zeigt einen Konfliktdialog: „Dieses Protokoll wurde von [Nutzer] geändert. Was möchtest du tun?"
- Option A: „Meine Änderungen behalten (serverseitige überschreiben)"
- Option B: „Serverversion laden (meine Änderungen verwerfen)"
- Option C: „Abbrechen und manuell zusammenführen"

---

### 2.4 Echtzeit-Synchronisation: Server-Sent Events (SSE)

**Warum SSE statt WebSockets?** Einfacher zu implementieren, funktioniert durch Proxies (Synology Reverse Proxy), ausreichend für den Anwendungsfall (Server → Client Push, kein bidirektionaler Kanal nötig).

```
GET /api/events  →  text/event-stream (SSE)
```

Server sendet Events bei:
- Protokoll geändert: `data: {"type":"protocol:updated","id":"abc123","by":"lisa"}`
- Protokoll gelöscht: `data: {"type":"protocol:deleted","id":"abc123"}`
- Projekt geändert: `data: {"type":"project:updated","id":"xyz789"}`

**Client-Verhalten:**
- `useEffect` öffnet `EventSource('/api/events')`
- Bei `protocol:updated` → lädt das spezifische Protokoll neu wenn es gerade geöffnet ist oder in der Liste erscheint
- Automatischer Reconnect bei Verbindungsabbruch (nativ in `EventSource` eingebaut)
- Bei `409 Conflict` nach eigenem PATCH → Konfliktdialog (siehe 2.3)

**Fallback:** Falls SSE nicht verfügbar (Proxy ohne Keepalive) → Polling alle 30 Sekunden als Fallback.

---

### 2.5 Anhänge: Dateisystem-Store auf dem Server

Anhänge werden als Dateien auf dem Dateisystem gespeichert (gleiche Logik wie im Electron-Client):

```
data/
  attachments/
    {uuid}          ← binäre Rohdaten (keine Extension)
```

API:
```
POST   /api/attachments           → multipart/form-data Upload → { id }
GET    /api/attachments/:id       → binärer Stream
DELETE /api/attachments/:id       → löscht die Datei
```

Maximale Dateigröße: 20 MB (konfigurierbar via `MAX_ATTACHMENT_MB`).

---

### 2.6 Verschlüsselung in der Server-Variante

Die AES-GCM-Verschlüsselung aus Punkt 1 ist vollständig **client-seitig** – der Server sieht nur den verschlüsselten Blob (`encryptedContacts`) und die Metadaten (`cryptoSalt`, `cryptoIv`). Das ist beabsichtigt:

- Der Server speichert und gibt das Projektobjekt inkl. verschlüsselter Kontakte zurück
- Das Passwort zur Entschlüsselung wird **niemals an den Server übermittelt**
- PBKDF2-Schlüsselableitung und AES-Entschlüsselung finden im Browser statt
- **Kein Änderungsbedarf** an der Krypto-Logik aus Punkt 1

---

## 3. Datenfluss & Synchronisation

### Normaler Workflow (kein Konflikt)

```
Client A öffnet Protokoll abc123
  → GET /api/protocols/abc123
  → erhält { data: {...}, version: 5 }
  → merkt sich: version = 5

Client A ändert Protokoll (Debounce 400ms läuft ab)
  → PATCH /api/protocols/abc123
    { version: 5, data: { ...geändert... } }
  → Server: version 5 == aktuelle version 5 → OK
  → Server speichert mit version = 6
  → Server sendet SSE: { type: "protocol:updated", id: "abc123", by: "user_a" }
  → Antwort: { ok: true, version: 6 }

Client B hat SSE offen
  → empfängt { type: "protocol:updated", id: "abc123", by: "user_a" }
  → lädt abc123 neu
  → zeigt optionale Benachrichtigung: „Protokoll wurde von user_a aktualisiert"
```

### Konfliktfall

```
Client A und Client B haben beide version 5 lokal

Client A sendet PATCH mit version: 5 → Server speichert version 6 → OK
Client B sendet PATCH mit version: 5 → Server: 5 ≠ 6 → HTTP 409

Client B empfängt 409
  → zeigt Konfliktdialog mit eigenem Inhalt und Serverinhalt nebeneinander
  → Client B entscheidet: „Serverversion nehmen" oder „Eigene behalten"
```

---

## 4. Client-Anpassungen

### 4.1 Neuer Storage-Layer: `useServerSync`

Statt `useProtocols` direkt mit localStorage / Electron-IPC zu verbinden, wird ein abstrakter Storage-Layer benötigt:

```
useProtocols (bestehend, unverändert)  ←→  Storage-Adapter
                                                 ↓ (eine von:)
                                    LocalStorageAdapter (bestehend)
                                    ElectronAdapter (bestehend)
                                    ServerAdapter (neu)
```

Der `ServerAdapter` implementiert:
- `load()` → `GET /api/protocols`
- `save(protocols)` → Für jedes geänderte Protokoll: `PATCH /api/protocols/:id`
- `onCreate(protocol)` → `POST /api/protocols`
- `onDelete(id)` → `DELETE /api/protocols/:id`
- Abonniert SSE und aktualisiert den lokalen State bei Änderungen von anderen Nutzern

### 4.2 Erkennung des Modus

```js
const storageMode =
  window.__SERVER_MODE__  // wird vom Server als globale Variable injiziert
    ? 'server'
  : isElectron
    ? 'electron'
    : 'local'
```

Der Server injiziert beim Ausliefern der `index.html`:

```html
<script>window.__SERVER_MODE__ = true; window.__SERVER_URL__ = '/';</script>
```

So muss die React-App nicht separat gebaut werden – ein Build läuft überall.

### 4.3 Login-Screen

Im Server-Modus zeigt die App vor dem Start einen Login-Screen:
- Felder: Benutzername, Passwort
- Speichert Session-Token im `sessionStorage` (Fenster-schließen → ausloggen) oder `localStorage` (persistiert)
- „Angemeldet bleiben" Checkbox

### 4.4 Nutzer-Anzeige

In der Kopfzeile: Avatar oder Kürzel des angemeldeten Nutzers, Logout-Button.

---

## 5. Synology-Deployment

### Option A: Docker (empfohlen)

**Vorteil:** Kein Versionsproblem mit Node.js, einfache Updates, saubere Trennung.

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist/ ./dist/
COPY server/ ./server/
EXPOSE 3000
CMD ["node", "server/index.js"]
```

In Synology Container Manager (Docker):
- Image bauen oder von Registry laden
- Volume `/app/data` → Synology-Ordner für Datenbank + Anhänge
- Port 3000 intern, über Synology Reverse Proxy nach außen mit HTTPS

### Option B: Native Node.js (ohne Docker)

1. Synology DSM: Paketzentrum → „Node.js" installieren
2. Anwendungsordner nach `/volume1/web/protokoll/` kopieren
3. DSM-Aufgabenplanung: Start-Skript `node /volume1/web/protokoll/server/index.js`
4. Reverse Proxy in DSM: `https://protokoll.firma.de` → `http://localhost:3000`

### HTTPS & Let's Encrypt

Synology DSM 7 bietet eingebaute Let's Encrypt-Unterstützung:
- DSM → Systemsteuerung → Sicherheit → Zertifikat → Let's Encrypt beantragen
- Synology Reverse Proxy mit diesem Zertifikat konfigurieren
- Kein manuelles Zertifikat-Management nötig

### Backup

- SQLite-Datei: Synology Hyper Backup sichert den `/data/`-Ordner automatisch
- Anhänge: Im gleichen Ordner, mitgesichert
- Wiederherstellung: Ordner wiederherstellen, Container neu starten

---

## 6. Migration: Lokal → Server

Folgende Migrations-Route wird in der UI angeboten:

```
Einstellungen → „Zu Server migrieren"
  1. Server-URL eingeben und verbinden
  2. Login mit Admin-Konto
  3. App exportiert alle lokalen Protokolle und Projekte
  4. App sendet per POST /api/protocols (batch)
  5. Anhänge werden einzeln hochgeladen
  6. Bestätigung: „X Protokolle, Y Projekte, Z Anhänge migriert"
  7. Lokale Daten werden NICHT automatisch gelöscht (Nutzer entscheidet)
```

---

## 7. Benutzer-Rollen

| Rolle    | Lesen | Erstellen | Bearbeiten | Löschen | User-Mgmt |
|----------|-------|-----------|------------|---------|-----------|
| `viewer` | ✓     | –         | –          | –       | –         |
| `editor` | ✓     | ✓         | Eigene¹    | Eigene¹ | –         |
| `admin`  | ✓     | ✓         | Alle       | Alle    | ✓         |

¹ „Eigene" = Protokolle, bei denen `updated_by` dem Nutzernamen entspricht, plus alle innerhalb der letzten 24 Stunden erstellten.

---

## 8. Sicherheits-Checkliste

- [x] HTTPS erzwungen (Synology Reverse Proxy oder `HTTPS_CERT`/`HTTPS_KEY`)
- [x] bcrypt (12 Runden) für Passwörter
- [x] Session-Tokens kryptografisch zufällig (64 Byte), TTL 8h
- [x] Rate-Limiting auf alle Endpunkte (bestehend + Login-Endpunkt: 5 Versuche/15 min)
- [x] SQL Injection: parametrierte Queries via `better-sqlite3` (kein String-Concat)
- [x] Helmet (bestehend) für Security-Header
- [x] CORS auf erlaubte Origins einschränken (`ALLOWED_ORIGINS`)
- [x] Anhänge: UUID-Dateinamen (keine Pfad-Traversal-Möglichkeit)
- [x] Kontaktdaten client-seitig verschlüsselt (Server kennt kein Passwort)
- [ ] Brute-Force-Schutz auf Login (per-IP Rate-Limit 5/15 min – umzusetzen)
- [ ] Audit-Log: Wer hat was wann geändert/gelöscht

---

## 9. Implementierungsphasen

### Phase 1: Datenbankschema & zeilenbasierte API

1. `server/db.js` umschreiben: neue Tabellen (protocols, projects, users, sessions, attachments)
2. REST-Endpunkte: `GET/POST/PATCH/DELETE /api/protocols/:id` und Projekte analog
3. Migrationsskript: bestehende `store`-Tabelle → neue Tabellen
4. Tests mit curl / Bruno

### Phase 2: Authentifizierung

1. bcrypt installieren (`npm install bcrypt`)
2. `POST /api/auth/login` + Session-Token-Verwaltung
3. Alle bestehenden API-Routen: `requireAuth` Middleware statt `requireApiKey`
4. Admin-Bootstrap beim ersten Start
5. `GET/POST/PATCH /api/admin/users` (Admin-Only)

### Phase 3: SSE-Synchronisation

1. SSE-Endpunkt `GET /api/events` mit Client-Registry
2. Nach jedem PATCH/POST/DELETE: SSE-Event an alle verbundenen Clients senden
3. Client: `EventSource`-Verbindung + State-Refresh bei Events
4. Konfliktdialog im React (neuer `ConflictModal`-Komponent)

### Phase 4: React-Client-Anpassungen

1. Storage-Adapter-Abstraktion (`src/storage/`)
2. Login-Screen (`src/components/LoginScreen.jsx`)
3. Server-Mode-Erkennung + `window.__SERVER_MODE__`
4. Admin-UI für Nutzerverwaltung (`src/components/AdminUsers.jsx`)
5. Nutzeranzeige in der Navigation

### Phase 5: Anhänge via Server-API

1. `POST /api/attachments` (multipart Upload)
2. `GET /api/attachments/:id` (Download-Stream)
3. `attachmentStore.js`: neuen `ServerAdapter` ergänzen

### Phase 6: Synology-Packaging & Dokumentation

1. Dockerfile + docker-compose.yml
2. Synology-Installationsanleitung (mit Screenshots)
3. Migrationsskript lokal → Server
4. Backup-Strategie dokumentieren

---

## 10. Offene Fragen (zu klären vor Implementierungsstart)

1. **Rollen-Granularität:** Soll `editor` wirklich nur eigene Protokolle bearbeiten dürfen – oder alle Protokolle im Projekt? Projektbasierte Berechtigungen wären mächtiger aber komplexer.

2. **Session-Dauer:** 8 Stunden Standard – zu kurz für ganztägige Arbeit? Alternativ: „Angemeldet bleiben" = 30 Tage Token.

3. **Offline-Fähigkeit:** Soll die Server-Variante auch offline nutzbar sein (lokaler Cache + Sync beim Wiederherstellen der Verbindung)? Das wäre komplexer (Konflikt-Queue nötig).

4. **Synology-Paketzentrum:** Soll eine natives Synology-Paket (`.spk`) gebaut werden, oder reicht Docker / manuelle Installation?

5. **Mehrere Instanzen / Tenants:** Soll ein Server mehrere unabhängige Organisationen bedienen (Multi-Tenancy), oder ist eine Installation = eine Organisation?

6. **Bestehender `server/index.js`:** Der aktuelle Server ist ein Einzeiler-KV-Store. Der Plan ersetzt ihn vollständig. Soll die alte API parallel laufen (für laufende Electron-Clients), oder ist ein Hard-Cut akzeptabel?

---

## 11. Nicht-Ziele (bewusst ausgeschlossen)

- **Ende-zu-Ende-Verschlüsselung aller Protokolldaten** (nur Kontakte sind verschlüsselt, Protokollinhalte liegen im Klartext auf dem Server – das ist bewusst, damit Suche und Volltext-Features möglich bleiben)
- **Mobile App** (iOS/Android)
- **Cloud-Hosting / SaaS** (der Server ist explizit für on-premise / Synology konzipiert)
- **Git-basierte Versionierung** (zu komplex; `version`-Zähler + Audit-Log sind ausreichend)

---

*Dieses Konzept muss vor Implementierungsbeginn explizit genehmigt werden.*  
*Nächster Schritt nach Freigabe: Phase 1 (DB-Schema + zeilenbasierte API).*
