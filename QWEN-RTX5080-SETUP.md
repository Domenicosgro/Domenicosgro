# Qwen auf RTX 5080 einrichten — Runbook für Claude Code

> **Für Claude Code:** Dies ist ein Übergabe-Dokument. Führe die Phasen der Reihe nach über PowerShell (Windows) aus. Nach jeder Phase die Ausgabe prüfen und erst weitergehen, wenn das Akzeptanzkriterium erfüllt ist. GUI-only-Schritte sind markiert — bei denen den Nutzer kurz um den Klick bitten. **Nichts löschen, keine Cloud-Keys hinterlegen, keine Ports offen ins Internet legen.**

> ⚠️ **Ausführungshinweis:** Dieses Runbook muss **lokal auf dem Windows-Rechner mit der RTX 5080** ausgeführt werden (benötigt `nvidia-smi`, `winget`, LM Studio, PowerShell und physischen GPU-Zugriff). In einer Cloud-/Remote-Session ohne diese Hardware ist es **nicht ausführbar** — dort dient es nur als Referenz.

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

## 7. Phase 4 — Qwen-Modell laden

> Genaue Katalog-IDs mit `lms get --help` bzw. Teilstring-Suche bestätigen — unten stehende IDs sind Richtwerte und **vor Nutzung zu verifizieren**.

**Zuerst Validierungsmodell (passt komplett in 16 GB VRAM):**

```powershell
# Download (ID/Quant verifizieren; Ziel: Qwen3-14B, Q4_K_M ~9-11 GB)
lms get "qwen3-14b"        # ggf. exakte ID/Quant interaktiv wählen

# Laden mit voller GPU-Auslastung UND 64K Kontext
lms load "qwen3-14b" --gpu max --context-length 65536
#   Falls der Flag-Name abweicht: 'lms load --help' prüfen (Kontext-Flag kann anders heißen)

lms ps    # zeigt geladene Modelle + Offload-Status
```

**Danach die Workhorses nachladen (nicht gleichzeitig):**

- `Qwen3.6-27B` (dicht, ~17–18 GB Q4 — braucht etwas RAM-Offload auf 16 GB)
- `Qwen3.6-35B-A3B` (MoE, nur 3B aktiv/Token — läuft via VRAM+RAM-Offload flüssig)

**Akzeptanzkriterium:** `lms ps` zeigt Qwen3-14B geladen, Kontext 65536, Offload auf GPU.

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

```powershell
# Modelle listen
curl http://localhost:1234/v1/models

# Chat-Completion testen (exakten Modellnamen aus /v1/models einsetzen)
curl http://localhost:1234/v1/chat/completions `
  -H "Content-Type: application/json" `
  -d '{ \"model\": \"qwen3-14b\", \"messages\": [{ \"role\": \"user\", \"content\": \"Sag kurz Hallo auf Deutsch.\" }] }'
```

**Akzeptanzkriterium:** `/v1/models` listet Qwen; die Chat-Completion liefert eine sinnvolle deutsche Antwort.

---

## 11. Definition of Done (Phase A)

- [ ] Treiber ≥ 580 / CUDA 12.8, RTX 5080 erkannt
- [ ] LM Studio ≥ 0.3.15, CUDA-12-Runtime aktiv, Developer Mode an
- [ ] Qwen3-14B geladen, Kontext 65536, GPU-Offload bestätigt
- [ ] Lokaler OpenAI-Server auf `:1234` läuft, Test-Completion erfolgreich
- [ ] (Optional) Qwen3.6-27B / 35B-A3B als weitere Modelle heruntergeladen

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
