# Qwen auf RTX 5080 einrichten — Runbook für Claude Code

> **Für Claude Code:** Dies ist ein Übergabe-Dokument. Führe die Phasen der Reihe nach über PowerShell (Windows) aus. Nach jeder Phase die Ausgabe prüfen und erst weitergehen, wenn das Akzeptanzkriterium erfüllt ist. GUI-only-Schritte sind markiert — bei denen den Nutzer kurz um den Klick bitten. **Nichts löschen, keine Cloud-Keys hinterlegen, keine Ports offen ins Internet legen.**

> ⚠️ **Ausführungshinweis:** Dieses Runbook muss **lokal auf dem Windows-Rechner mit der RTX 5080** ausgeführt werden (benötigt `nvidia-smi`, `winget`, LM Studio, PowerShell und physischen GPU-Zugriff). In einer Cloud-/Remote-Session ohne diese Hardware ist es **nicht ausführbar** — dort dient es nur als Referenz.

---

## 0. Ist-Konfiguration (validiert, Stand 2026-07-11)

> **Phase A ist erfolgreich abgeschlossen und getestet** — inkl. Tool-/Function-Calling über den Endpoint. Diese Sektion beschreibt das **tatsächlich laufende Setup**; die Phasen 1–7 darunter sind der Weg dorthin (mit den live gefundenen Korrekturen).

| Komponente | Ist-Wert |
|---|---|
| NVIDIA-Treiber | **591.86** (CUDA ≥ 12.8) — weit über der 580-Schwelle |
| LM Studio | **0.4.19** (winget-ID `ElementLabs.LMStudio`), Developer Mode **an** |
| Aktive Runtime | `llama.cpp-win-x86_64-nvidia-cuda12-avx2` (automatisch gewählt) |
| **Modell (Hermes-Workhorse)** | **`qwen/qwen3.6-35b-a3b`**, Quant **Q4_K_M** (~22 GB, MoE `qwen35moe`, 3B aktiv/Token) — Capabilities laut Modellkarte: **Tool Use ✅, Reasoning, Vision** |
| Kontextlänge | **65536** (Modell kann bis 262144) |
| GPU-Offload | **24 Layer** (von 40) → real **~15,4 GB / 16,3 GB VRAM** belegt |
| Unified KV Cache | **an** (schrumpft den 64K-Cache; kostet nur ~0,6 GB extra ggü. 8K) |
| API-Server | OpenAI-kompatibel auf **`http://localhost:1234/v1`** |
| Zusätzlich vorhanden | `qwen/qwen3-14b` (Q4_K_M, ~8,4 GB) + Embedding-Modell `text-embedding-nomic-embed-text-v1.5` (nützlich für Hermes-Memory/RAG) |

**Getesteter Funktionsnachweis:**
- `GET /v1/models` listet `qwen/qwen3.6-35b-a3b`.
- Chat-Completion → korrekte deutsche Antwort.
- Tool-Call-Test → Antwort mit `finish_reason: "tool_calls"` und `get_weather(location="Rom")`. ✅

### Korrekturen ggü. dem ursprünglichen Runbook (aus dem Live-Setup)

1. **Kein `--gpu max`** bei Modellen, die **größer als der VRAM** sind (22 GB > 16 GB) — das erzwingt vollen Offload und scheitert/OOM. Stattdessen **partieller Offload**, getunt über die **GUI-Ladeparameter** (siehe Phase 4).
2. **Laden über die GUI** mit *„Manually choose model load parameters"* (Schalter im Lade-Dialog bzw. `Alt` halten): dort **Context Length**, **GPU Offload** (Layer-Anzahl) und **Unified KV Cache** einstellen. In LM Studio 0.4.19 gibt es **kein** separates Flash-Attention- oder KV-Cache-Quantisierungs-Dropdown — „Unified KV Cache" ist der moderne Ersatz. Der CLI-Befehl `lms load` kennt kein KV-Quant-Flag.
3. **VRAM-Estimate ist optimistisch:** Der angezeigte „Estimated Memory Usage"-GPU-Wert (~14,3 GB bei 24 Layern) liegt **unter** der Realität (~15,4 GB), weil Windows-Desktop/Browser zusätzlich ~1 GB VRAM belegen. **Faustregel:** GPU-Estimate auf **~14 GB** zielen, dann bleibt real ~1 GB Puffer.
4. **PowerShell-Falle:** `curl` ist in Windows PowerShell ein **Alias für `Invoke-WebRequest`** und versteht `-H`/`-d` **nicht** wie echtes curl. API-Tests deshalb mit **`Invoke-RestMethod`** (siehe Phase 7) oder explizit `curl.exe`.
5. **Modellwahl:** Statt des 14B-Validierungsmodells direkt den **MoE-Workhorse `qwen3.6-35b-a3b`** genommen — bestes Verhältnis aus Intelligenz und Tempo auf der 5080 (nur 3B aktiv/Token) und mit belegtem Tool-Calling.

### Reproduzieren nach Neustart

- „Start local LLM service on login" ist **an** → der Server startet automatisch. Sonst: `lms server start --port 1234`.
- Modell-Ladeparameter sind über *„Remember settings for qwen3.6-35b-a3b"* gespeichert → erneutes Laden übernimmt Kontext 65536 + 24 Layer.
- Prüfen: `lms ps` (Kontext 65536?) und `nvidia-smi` (VRAM < 16 GB?).

---

## 1. Ziel & Kontext

Auf diesem Rechner soll **Qwen als lokales LLM** laufen und später als **OpenAI-kompatibler API-Endpoint im LAN** bereitstehen. Ein **externer Rechner** wird darüber **Hermes Agent** (Nous Research) betreiben.

**Gesamtarchitektur (zur Orientierung — nur Phase A ist Aufgabe dieses Runbooks):**

- **A) Dieser Rechner (5080):** LM Studio serviert Qwen über `http://<LAN-IP>:1234/v1` ← *dieses Runbook*
- **B) Externer Rechner:** Hermes Agent zeigt auf diesen Endpoint (späterer Schritt)
- **C) Alles vollständig lokal**, keine kommerzielle KI-Cloud

**Leitplanken (gelten durchgehend):**

- Vollständig lokal / air-gapped-fähig — keine Cloud-Inferenz, keine Telemetrie nach außen.
- Zielmodelle müssen **Tool-Calling / Function Calling** können (für den Agentenbetrieb). Qwen3/Qwen3.6 können das.
- **Kontextlänge ≥ 64K (65536)** — Hermes' Memory/Skills fressen sonst den Kontext auf.

---

## 2. Zielsystem (Ist-Stand)

| Komponente | Wert |
|---|---|
| OS | Windows 11 Pro (Build 26100) |
| CPU | Intel Core i7-14700 (28 logische Kerne) |
| RAM | 64 GB |
| GPU | **NVIDIA GeForce RTX 5080, 16 GB GDDR7** (Blackwell, Compute Capability 12.0) |
| Board | ASUS PRIME Z790-P WIFI |

**Schwellenwerte, die erfüllt sein müssen:**

- NVIDIA-Treiber **≥ 580**, CUDA **12.8** (Blackwell-Pflicht)
- LM Studio **≥ 0.3.15** (Blackwell-Support; besser aktuelle 0.4.x)
- Aktive Runtime: **CUDA 12 llama.cpp**

---

## 3. Phase 0 — Umgebung verifizieren

```powershell
# GPU, Treiberversion und CUDA-Version anzeigen
nvidia-smi

# Ist LM Studio schon da / per winget verfügbar?
winget list  | Select-String -Pattern "LM Studio"
winget search "LM Studio"
```

**Auswerten:**

- `nvidia-smi` zeigt `Driver Version: 580.xx` oder höher **und** `CUDA Version: 12.8`? → Treiber ok, **Phase 1 überspringen**.
- Treiber älter als 580 → **Phase 1** (Update) zuerst.
- Aus `winget search` die genaue Paket-ID notieren (i. d. R. `ElementLabs.LMStudio` — vor der Installation verifizieren).

**Akzeptanzkriterium:** GPU wird als „RTX 5080" erkannt; Treiber-/CUDA-Version bekannt.

---

## 4. Phase 1 — NVIDIA-Treiber aktualisieren *(nur falls < 580)*

> ⚠️ **Wichtig:** Nicht über Windows Update — der liefert oft einen abgespeckten Treiber ohne volle Blackwell-Unterstützung.

```powershell
# Bevorzugt via winget (Studio-Treiber). ID vorher mit 'winget search nvidia' bestätigen.
winget search "NVIDIA"

# Beispiel (ID verifizieren!):
# winget install Nvidia.GeForceExperience   # oder direkter Treiberpfad
```

Falls winget keinen passenden reinen Treiber liefert: den Nutzer bitten, den **neuesten Game-Ready- oder Studio-Treiber** manuell von nvidia.com für die RTX 5080 zu ziehen und zu installieren, danach **Neustart**.

**Nach Update erneut prüfen:**

```powershell
nvidia-smi   # muss jetzt >= 580 und CUDA 12.8 zeigen
```

**Akzeptanzkriterium:** `nvidia-smi` meldet Treiber ≥ 580, CUDA 12.8.

---

## 5. Phase 2 — LM Studio installieren

```powershell
# Mit der in Phase 0 bestätigten ID installieren, z. B.:
winget install ElementLabs.LMStudio -e

# Danach LM Studio einmal starten, damit die CLI 'lms' verfügbar wird:
# (Pfad ggf. anpassen; LM Studio bootstrappt die CLI beim ersten Start)
```

CLI in die PATH bringen / prüfen:

```powershell
lms version
lms --help
```

Falls `lms` nicht gefunden wird: LM Studio einmal per GUI starten (bootstrappt die CLI), neues PowerShell-Fenster öffnen, erneut `lms version`.

**Akzeptanzkriterium:** `lms version` läuft; Version ≥ 0.3.15 (Ziel: aktuelle 0.4.x).

---

## 6. Phase 3 — Runtime & Developer Mode *(teilweise GUI)*

**CUDA-12-Runtime sicherstellen.** LM Studio schaltet bei RTX-50 + passendem Treiber automatisch auf CUDA 12 um. Verifizieren:

```powershell
lms runtime ls    # falls vorhanden; sonst 'lms --help' nach Runtime-Befehlen absuchen
```

**GUI-Fallback (Nutzer bitten):** In LM Studio `Strg+Shift+R` → **Settings → Runtime** → **„CUDA 12 llama.cpp"** muss installiert, ausgewählt und grün „Latest version" sein. (Falls CUDA zickt: **Vulkan** ist ein vollwertiger Fallback.)

**GUI (Nutzer bitten):** **Settings → Developer → Developer Mode = ON** (schaltet Server + erweiterte Load-Parameter frei).

**Akzeptanzkriterium:** Aktive Runtime = CUDA 12 llama.cpp; Developer Mode an.

---

## 7. Phase 4 — Qwen-Modell laden (Hermes-Workhorse)

> Katalog mit `lms get qwen3` durchsuchen (zeigt eine Auswahlliste). Bestätigte verfügbare IDs u. a.: `qwen/qwen3.6-35b-a3b` (MoE), `qwen/qwen3.6-27b` (dicht), `qwen/qwen3-14b`.

**Modellwahl für Hermes:** **`qwen/qwen3.6-35b-a3b`** (MoE, 3B aktiv/Token) — Capabilities `Tool Use` + `Reasoning`, schnell trotz Größe, Sweet Spot auf der 5080. Alternative für maximale Qualität: `qwen/qwen3.6-27b` (dicht, langsamer).

**Download** (bei ~22 GB und wackliger Leitung besser über den **GUI-Downloader** — der setzt Timeouts automatisch fort):

```powershell
lms get qwen/qwen3.6-35b-a3b   # Variante Q4_K_M wählen (~22 GB)
```

**Laden — WICHTIG, über die GUI, nicht `lms load --gpu max`:**
Das Modell (22 GB) ist größer als der VRAM (16 GB), daher **partieller Offload** mit fein eingestellten Parametern. `--gpu max` würde vollen Offload erzwingen und scheitern.

1. Oben `Strg+L` → `qwen3.6-35b-a3b` wählen.
2. Schalter **„Manually choose model load parameters"** (bzw. `Alt` halten) → Konfig-Panel öffnet sich **vor** dem Laden.
3. Setzen:
   - **Context Length** = `65536`
   - **Unified KV Cache** = an
   - **GPU Offload** = so viele Layer, dass der **GPU-Estimate ~14 GB** zeigt (hier: **24** von 40 Layern → real ~15,4 GB inkl. Desktop)
   - **„Remember settings for qwen3.6-35b-a3b"** anhaken
4. **Load Model**.

```powershell
lms ps    # erwartet: qwen/qwen3.6-35b-a3b, CONTEXT 65536, DEVICE Local
```

> **CLI-Alternative** (nur wenn kein KV-Tuning nötig): `lms load qwen3.6-35b-a3b -c 65536 --gpu 0.6` — Offload-Ratio zwischen 0 und 1, **nicht** `max`. Mit `--estimate-only` vorab den Bedarf berechnen, ohne zu laden.

**Akzeptanzkriterium:** `lms ps` zeigt `qwen3.6-35b-a3b` geladen, Kontext 65536; `nvidia-smi` zeigt VRAM < 16 GB.

---

## 8. Phase 5 — GPU-Offload prüfen

```powershell
# Während einer Inferenz die GPU-Last beobachten:
nvidia-smi -l 2
```

Bei einem Testprompt muss die 5080 sichtbar Last ziehen und VRAM belegen (nicht nur CPU). Erwartung: bei 8–14B zügige Antworten (Größenordnung mehrere Dutzend Tokens/s).

**Akzeptanzkriterium:** GPU-Util > 0 %, VRAM belegt während der Generierung.

---

## 9. Phase 6 — Lokalen API-Server starten (nur localhost fürs Erste)

```powershell
lms server start --port 1234
lms server status
```

**Netzwerk-Freigabe (LAN) bewusst NOCH NICHT aktivieren** — das machen wir erst beim Anbinden von Hermes, zusammen mit Firewall-Regel/VPN. Fürs Erste reicht `localhost`.

**Akzeptanzkriterium:** `lms server status` meldet laufenden Server auf Port 1234.

---

## 10. Phase 7 — Endpoint testen

> ⚠️ In Windows PowerShell ist `curl` ein Alias für `Invoke-WebRequest` und versteht `-H`/`-d` **nicht** wie echtes curl. Deshalb **`Invoke-RestMethod`** verwenden (oder explizit `curl.exe`).

**1. Modelle listen** (bestätigt die exakte Modell-ID):
```powershell
Invoke-RestMethod http://localhost:1234/v1/models | ConvertTo-Json -Depth 5
```

**2. Chat-Completion:**
```powershell
$body = @{
  model    = "qwen/qwen3.6-35b-a3b"
  messages = @(@{ role = "user"; content = "Sag kurz Hallo auf Deutsch und nenne die Hauptstadt von Italien." })
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Uri http://localhost:1234/v1/chat/completions -Method Post -ContentType "application/json" -Body $body |
  Select-Object -ExpandProperty choices | ForEach-Object { $_.message.content }
```

**3. Tool-/Function-Calling (kritisch für Hermes):**
```powershell
$body = @{
  model    = "qwen/qwen3.6-35b-a3b"
  messages = @(@{ role="user"; content="Wie ist das Wetter in Rom?" })
  tools    = @(@{
    type = "function"
    function = @{
      name = "get_weather"
      description = "Ruft das aktuelle Wetter fuer einen Ort ab"
      parameters = @{
        type = "object"
        properties = @{ location = @{ type="string"; description="Stadt" } }
        required = @("location")
      }
    }
  })
} | ConvertTo-Json -Depth 10

Invoke-RestMethod -Uri http://localhost:1234/v1/chat/completions -Method Post -ContentType "application/json" -Body $body |
  Select-Object -ExpandProperty choices | ConvertTo-Json -Depth 10
```

**Akzeptanzkriterium:** `/v1/models` listet Qwen; die Chat-Completion liefert eine sinnvolle deutsche Antwort (Rom); der Tool-Test liefert `finish_reason: "tool_calls"` mit `get_weather(location="Rom")`.

---

## 11. Definition of Done (Phase A) — ✅ erfüllt

- [x] Treiber ≥ 580 / CUDA 12.8, RTX 5080 erkannt (591.86)
- [x] LM Studio ≥ 0.3.15, CUDA-12-Runtime aktiv, Developer Mode an (0.4.19)
- [x] `qwen3.6-35b-a3b` geladen, Kontext 65536, GPU-Offload 24 Layer (~15,4 GB VRAM) bestätigt
- [x] Lokaler OpenAI-Server auf `:1234` läuft, Test-Completion erfolgreich
- [x] **Tool-/Function-Calling über den Endpoint verifiziert** (`finish_reason: "tool_calls"`)
- [x] Embedding-Modell `nomic-embed-text-v1.5` vorhanden (für Hermes-Memory/RAG)

---

## 12. Nächste Schritte (NICHT Teil dieses Runbooks)

1. **LAN-Freigabe + Absicherung:** Server im lokalen Netz bereitstellen (an `0.0.0.0` binden), Firewall so setzen, dass nur der Hermes-Rechner den Port erreicht; extern nur via VPN (z. B. LM Studio **LM Link** auf Tailscale-Basis).
2. **Hermes auf dem externen Rechner** auf `http://<5080-LAN-IP>:1234/v1` zeigen (`hermes model` → Custom OpenAI-compatible endpoint).
3. **Auxiliary-Modelle** in Hermes' `config.yaml` explizit auf denselben lokalen Qwen-Endpoint pinnen (kein Cloud-Fallback), Telemetrie aus, TTS lokal (Piper).

---

## Troubleshooting-Kurzreferenz

- **„compute capability"-Fehler beim Laden** → Treiber zu alt **oder** in der Runtime steht noch CUDA 11. Treiber aktualisieren, Runtime auf CUDA 12 stellen.
- **GPU wird nicht genutzt** → GPU-Offload steht auf 0; im Zahnrad neben dem Modell auf „Max" (bzw. `--gpu max`). Neue Loads erben die Einstellung nicht immer.
- **`lms` nicht gefunden** → LM Studio einmal per GUI starten (bootstrappt CLI), neues Terminal öffnen.
- **CUDA bleibt instabil** → Vulkan-Runtime als vollwertiger Fallback.
- **Agent „vergisst" später** → Kontext < 64K; Load mit 65536 wiederholen.
