# KI-Farm-Koordinator im Firmen-Dashboard (Konzept / Blueprint)

> **Status:** Konzept, noch nicht gebaut. Baut auf dem bereits laufenden lokalen
> Qwen-Endpoint auf (`http://192.168.178.54:1234/v1`, Rechner „Genbauer/HS", RTX 5080).
> Dieses Dokument beschreibt, wie das Dashboard zum **Koordinator einer internen
> KI-Farm** aus mehreren GPU-Rechnern erweitert werden kann.

---

## 1. Ziel

Mehrere Büro-Rechner (Ziel: ~18) mit leistungsfähiger GPU betreiben **je eine
eigenständige lokale KI**. Das Dashboard verteilt Aufgaben an diese Rechner:
- **leichte Aufgaben** laufen auch, während jemand am PC arbeitet,
- **schwere Aufgaben** laufen, **wenn der PC gerade frei ist**,
- **komplexe Aufgaben** werden **zerlegt und parallel** über mehrere Rechner erledigt.

Alles **vollständig lokal**, keine Cloud.

---

## 2. Grundentscheidung: Aufgaben verteilen, nicht GPUs verschmelzen

Es gibt zwei Arten zu „bündeln" — wir wählen bewusst **Weg A**:

| | Weg A — Aufgaben parallel verteilen | Weg B — ein Modell über viele GPUs splitten |
|---|---|---|
| Idee | Jeder PC hat seine eigene KI; Koordinator verteilt Teilaufgaben | 18 GPUs rechnen gemeinsam an **einem** großen Modell |
| Über Büro-LAN | ✅ sehr gut (nur **Text** über das Netz) | ⚠️ langsam (GPUs tauschen pro Token Daten → Ethernet = Flaschenhals) |
| Nutzen | ~×N Durchsatz, komplexe Aufgaben durch Zerlegung | nur sinnvoll, wenn ein Modell sonst **nirgends** reinpasst |

→ **Weg A** ist für uns richtig: Der Koordinator **zerlegt** eine komplexe Aufgabe in
Teilaufgaben, verteilt sie auf freie Rechner und **führt die Ergebnisse zusammen**
(Map-Reduce / Multi-Agenten). Weg B bleibt Spezialfall und ist hier nicht Teil des Plans.

---

## 3. Architektur

```
                 ┌──────────────────────────────────────────────┐
                 │   DASHBOARD-APP "KI-Koordinator"              │
                 │   (eigener Container, Port z.B. 3003)         │
                 │                                               │
   Nutzer ─────▶ │   Web-UI  ──▶  Job-Queue  ──▶  Scheduler      │
   (DSM-Login)   │                    │              │           │
                 │   Node-Registry ◀──┘      Aggregation         │
                 └───────────┬──────────────────┬────────────────┘
                             │ verteilt Jobs     │ sammelt Ergebnisse
          ┌──────────────────┼──────────────────┼───────────────────┐
          ▼                  ▼                  ▼                   ▼
   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
   │ PC 1 (5080) │    │ PC 2        │    │ PC 3        │ …  │ PC 18       │
   │ LM Studio   │    │ LM Studio   │    │ LM Studio   │    │ LM Studio   │
   │ :1234/v1    │    │ :1234/v1    │    │ :1234/v1    │    │ :1234/v1    │
   │ + Idle-Agent│    │ + Idle-Agent│    │ + Idle-Agent│    │ + Idle-Agent│
   └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
       frei/belegt        frei/belegt        frei/belegt         frei/belegt
```

- **Koordinator** = neue Dashboard-App (nach dem Muster aus `CLAUDE.md` §0/§12).
- **Worker** = je PC ein OpenAI-kompatibler Modell-Server (wie der 5080 schon) **+**
  ein kleiner **Idle-Agent**, der „frei/belegt" + GPU-Auslastung meldet.
- Über das Netz laufen nur **Prompts und Antworten** (Text) → geringe Bandbreite.

---

## 4. Einordnung ins Dashboard-Ökosystem

Folgt exakt dem bestehenden Muster (`CLAUDE.md` §0, §12):

| Prinzip | Umsetzung KI-Koordinator |
|---|---|
| Ein Container pro App | eigenes Image, eigener Container, **eigener Außenport** (z. B. 3003) |
| Health-Endpunkt | `GET /api/health` |
| Einheitliche Anmeldung | **Synology-DSM-Login** über `SYNOLOGY_URL` |
| Branding | GHBA (Arial) für System-E-Mails/öffentliche Seiten |
| Secrets | nur in der NAS-`docker-compose.yml`, nie in Git |
| Reverse-Proxy | z. B. `https://apps.<firma>.de/ki` → `http://localhost:3003` |

Technisch gleicher Stack wie das Protokolltool (Node/Express), damit Betrieb und
Deploy (`deploy-nas.ps1`) identisch bleiben.

---

## 5. Komponenten im Detail

### 5.1 Worker-Knoten (je PC)
- **Modell-Server:** LM Studio (wie 5080) oder Ollama — OpenAI-kompatibel auf `:1234/v1`.
- **Idle-Agent** (kleines Programm/Service): meldet sich periodisch beim Koordinator:
  - Rechnername, erreichbare Adresse (`http://<ip>:1234/v1`), geladenes Modell
  - **frei/belegt** (Tastatur-/Maus-Inaktivität > X Minuten)
  - GPU-Auslastung / freier VRAM (via `nvidia-smi`)
- Freigabe im LAN pro Rechner wie beim 5080 (Skript `freigabe-ki-dashboard.ps1`).

### 5.2 Node-Registry (im Koordinator)
Aktuelle Liste aller Knoten mit Status (online, frei/belegt, Modell, letzte Meldung).
Knoten, die sich länger nicht melden, gelten als offline.

### 5.3 Job-Queue + Scheduler
- Aufgaben landen in einer **Warteschlange** (Priorität, Typ „leicht"/„schwer").
- Scheduler ordnet jeden Job einem **passenden, freien** Knoten zu:
  - **leichte** Jobs → auch an belegte Rechner (kleine Last),
  - **schwere** Jobs → **nur an freie** Rechner.
- **Preemption:** Kehrt der Nutzer an einen Rechner zurück, wird dessen schwerer Job
  pausiert/abgebrochen und **neu eingereiht** (Nutzer hat immer Vorrang).

### 5.4 Aggregation / Task-Decomposition
- Der Koordinator zerlegt eine komplexe Aufgabe in Teilaufgaben (Map), verteilt sie,
  sammelt Teilergebnisse und **fasst sie zusammen** (Reduce) — ggf. selbst per KI.

### 5.5 Optionale Abkürzung: Router statt Eigenbau
Für reine **Lastverteilung** (viele gleichartige Anfragen) kann ein fertiger Router
wie **LiteLLM** vor die Knoten gesetzt werden (eine Adresse → verteilt auf alle
Endpoints). Der Koordinator nutzt ihn dann als „eine große KI mit N Backends".

---

## 6. Datenmodell (Skizze)

```js
// Knoten
{ id, name, baseUrl, model, status: 'online'|'offline',
  busy: true|false, vramFreeMB, gpuUtil, lastSeen }

// Job
{ id, type: 'light'|'heavy', priority, prompt|task,
  status: 'queued'|'running'|'done'|'failed'|'preempted',
  assignedNode, parentJobId,        // parentJobId = Teil einer zerlegten Aufgabe
  result, createdBy, createdAt, finishedAt }
```

---

## 7. API-Skizze (Koordinator, hinter DSM-Login + Rate-Limit)

```
GET  /api/health                      Status der App
POST /api/nodes/heartbeat             Worker meldet frei/belegt + Auslastung
GET  /api/nodes                       aktuelle Knotenliste (UI)
POST /api/jobs                        neue Aufgabe einreihen (einfach oder komplex)
GET  /api/jobs/:id                    Status/Ergebnis
GET  /api/jobs                        Übersicht/Historie
POST /api/jobs/:id/cancel             abbrechen
```

---

## 8. Idle-/Nutzer-Vorrang-Logik (Kernregel)

1. Nutzer am PC aktiv → nur **leichte** Jobs, GPU gedrosselt.
2. PC seit X Minuten inaktiv → **frei**, nimmt **schwere** Jobs.
3. Nutzer kehrt zurück → laufender schwerer Job **sofort pausieren**, neu einreihen.
4. **Der lokale Nutzer wird nie spürbar ausgebremst** — oberste Regel.

---

## 9. Komplexe Aufgaben: Zerlegungs-Muster

- **Map-Reduce:** großes Dokument/viele Projekte → pro Teil ein Knoten → Zusammenfassung.
- **Multi-Agent:** mehrere spezialisierte KI-Rollen (z. B. „Rechercheur", „Prüfer",
  „Schreiber") laufen parallel auf verschiedenen Knoten, Koordinator führt zusammen.
- **Fan-out/Fan-in:** eine Frage an N Knoten, beste/konsolidierte Antwort wählen.

---

## 10. Technologie-Optionen

| Variante | Für wen | Aufwand |
|---|---|---|
| **Eigenbau** (Node/Express + Queue) | volle Kontrolle, passt in euer Dashboard | mittel |
| **LiteLLM-Proxy** davor | schnelle Lastverteilung ohne eigene Queue | gering |
| **GPUStack** | fertige Cluster-Verwaltung über viele Rechner (inkl. Windows) | gering–mittel |
| Ray Serve / vLLM | Profi-Orchestrierung (Linux-first) | hoch |

**Empfehlung:** Klein starten mit **LiteLLM** (Lastverteilung) **oder GPUStack**
(Cluster-Verwaltung) und das Dashboard als **UI + Job-Steuerung** davorsetzen; den
eigenen Scheduler/Decomposer nur dort selbst bauen, wo die fertigen Tools nicht reichen.

---

## 11. Phasenplan

| Phase | Inhalt | Ergebnis |
|---|---|---|
| **0 (fertig)** | 1 Knoten (5080) im LAN erreichbar | Basis steht |
| **1 — MVP** | Koordinator-App: 2–3 Knoten manuell eintragen, Lastverteilung einfacher Jobs | „Dashboard verteilt Anfragen" |
| **2 — Idle** | Idle-Agent auf den PCs, frei/belegt-Scheduling + Preemption | „arbeitet, wenn PC frei" |
| **3 — Komplex** | Task-Decomposition (Map-Reduce / Multi-Agent) | „komplexe Aufgaben gebündelt" |
| **4 — Skalierung** | auf ~18 Knoten ausrollen, Monitoring/UI | Vollbetrieb |

---

## 12. Leitplanken

- **Vollständig lokal** — keine Cloud, keine Telemetrie nach außen.
- **Nutzer hat Vorrang** — kein spürbares Ausbremsen am Arbeitsplatz.
- **Nur server-seitig** auf die Knoten zugreifen; interne IPs nie ans Frontend.
- **DSM-Login** + Rate-Limits wie bei den anderen Dashboard-Apps.
- **Ergebnisse als Vorschlag** behandeln (Mensch bestätigt).

---

## 13. Grenzen & Stolpersteine (ehrlich)

- **LAN ist die Grenze** für echte GPU-Fusion (Weg B) — nicht Teil dieses Plans.
- **16 GB VRAM** pro Rechner begrenzt die Modellgröße → **MoE-Modelle** (wie Qwen3.6-35B-A3B) bevorzugen.
- **18 Windows-Rechner** verwalten (Treiber, Modelle, Freigaben) = Betriebsaufwand → GPUStack o. Ä. nimmt viel ab.
- Einige Profi-Tools (vLLM/Ray) sind **Linux-first**.
- Heterogene GPUs → Scheduler sollte Fähigkeiten je Knoten kennen (VRAM, Modell).

---

## 14. Offene Entscheidungen (vor Phase 1 klären)

1. **Welche Aufgaben zuerst?** Viele kleine parallel (Durchsatz) **oder** einzelne große/komplexe (Zerlegung)? → bestimmt das Design.
2. **Eigenbau vs. GPUStack/LiteLLM** als Basis.
3. **Eigene Dashboard-App** (empfohlen, Port 3003) **oder** Modul im Protokolltool.
4. **Idle-Schwelle** (ab wann gilt ein PC als „frei"?) und Preemption-Verhalten.
5. **Welche Modelle** laufen auf welchen Rechnern (einheitlich vs. gemischt).

---

*Baut auf: `QWEN-RTX5080-SETUP.md`, `freigabe-ki-dashboard.ps1` (LAN-Freigabe der Knoten).
Dashboard-Muster: `CLAUDE.md` §0 und §12 (neue App ins Dashboard aufnehmen).*
