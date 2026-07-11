# Hermes-Anbindung an den lokalen Qwen-Endpoint — Runbook Phase B

> **Für Claude Code:** Übergabe-Dokument für **Phase B** (Anbindung von Hermes Agent an den in Phase A eingerichteten Qwen-Endpoint). Führe die Phasen der Reihe nach aus. **Zwei verschiedene Rechner** sind beteiligt — jede Phase ist mit dem Zielrechner markiert. Nach jeder Phase das Akzeptanzkriterium prüfen. **Nichts löschen, keine Cloud-Keys hinterlegen, keinen Port offen ins Internet legen.**

> ⚠️ **Ausführung:** Läuft auf **zwei lokalen Rechnern** (5080-Windows + Linux-Mint-Client). In einer Cloud-/Remote-Session ohne Zugriff auf diese Rechner ist es nur Referenz. Claude Code soll Hermes-spezifische Details (Installationsbefehl, exakte Feldnamen) bei Unsicherheit über die verlinkten offiziellen Docs verifizieren — nicht raten.

---

## 0. Kontext & Voraussetzungen

**Phase A ist abgeschlossen** (siehe `QWEN-RTX5080-SETUP.md`): Auf dem **5080-Rechner** läuft LM Studio und serviert **`qwen/qwen3.6-35b-a3b`** (MoE, Tool-Calling ✅, Kontext 65536) als OpenAI-kompatiblen Server auf `http://localhost:1234/v1`.

**Ziel von Phase B:** Der **externe Rechner (Linux Mint)** betreibt **Hermes Agent** und nutzt ausschließlich diesen lokalen Qwen-Endpoint — keine kommerzielle KI-Cloud.

```
   ┌─────────────────────────────┐        Tailscale (WireGuard, verschlüsselt)
   │  5080-Rechner (Windows)      │◀───────────────────────────────────┐
   │  LM Studio :1234             │                                     │
   │  qwen/qwen3.6-35b-a3b        │        ┌──────────────────────────┐ │
   │  Tailscale-IP: 100.a.b.c     │        │  Linux Mint (Client)     │ │
   └─────────────────────────────┘        │  Hermes Agent            │─┘
        GPU-Last liegt HIER               │  Tailscale-IP: 100.d.e.f │
                                          │  (KEINE GPU nötig)       │
                                          └──────────────────────────┘
```

> **Wichtig:** Der Mint-Rechner ist nur **Client** — er schickt API-Requests an den 5080. **Er braucht keine GPU** und lädt kein Modell. Ein dort laufender anderer Dienst (z. B. „open claw") stört nur, wenn er Port/Ressourcen kollidiert; Hermes selbst braucht nur ausgehende HTTP-Requests.

### Beteiligte Rechner

| Kürzel | Rechner | Rolle |
|---|---|---|
| **[5080]** | Windows 11, RTX 5080 | Modell-Server (LM Studio) |
| **[MINT]** | Linux Mint | Hermes-Client |

### Leitplanken (durchgehend)

- **Kein Port offen ins Internet.** Verbindung ausschließlich über **VPN (Tailscale)**.
- **Kein Cloud-Fallback:** Hermes-Hauptmodell **und** alle Hilfsmodelle müssen auf den lokalen Endpoint zeigen.
- Vollständig lokal / air-gapped-fähig.

---

## 1. Phase B0 — Endpoint lokal verifizieren **[5080]**

Sicherstellen, dass Phase A wirklich läuft, bevor wir das Netz aufmachen.

```powershell
lms ps                                   # qwen/qwen3.6-35b-a3b, CONTEXT 65536?
lms server status                        # läuft auf Port 1234?
Invoke-RestMethod http://localhost:1234/v1/models | ConvertTo-Json -Depth 5
```

Falls Server/Modell nicht laufen: `lms server start --port 1234` und Modell laden (siehe `QWEN-RTX5080-SETUP.md`, Phase 4/6).

**Akzeptanzkriterium:** `/v1/models` listet `qwen/qwen3.6-35b-a3b` lokal.

---

## 2. Phase B1 — Tailscale auf dem 5080 **[5080]**

```powershell
winget install tailscale.tailscale
# Danach NEUES PowerShell-Fenster öffnen (PATH aktualisieren), dann:
tailscale up
#   → öffnet Browser-Login. Mit einem Konto anmelden, das GLEICH auch
#     auf dem Mint-Rechner verwendet wird (gleiches Tailnet!).
tailscale ip -4
#   → zeigt die Tailscale-IP des 5080 (Format 100.a.b.c) — NOTIEREN.
```

**Akzeptanzkriterium:** `tailscale ip -4` liefert eine `100.x`-Adresse; `tailscale status` zeigt den Rechner als verbunden.

> Diese `100.a.b.c` = **`TS_5080`** wird in Phase B5 als Hermes-Endpoint eingetragen.

---

## 3. Phase B2 — LM Studio ans Netz binden + Firewall **[5080]**

Standardmäßig lauscht der Server nur auf `localhost`. Er muss auf allen Interfaces lauschen (damit auch das Tailscale-Interface erreichbar ist).

**GUI:** LM Studio → **Developer/Server-Tab** → Server-Einstellungen → **„Serve on Local Network"** einschalten. Server neu starten (`lms server start --port 1234`).

**Binding prüfen:**
```powershell
netstat -an | Select-String ":1234"
#   Erwartung: 0.0.0.0:1234 (LISTENING) — NICHT nur 127.0.0.1:1234
```

**Firewall streng auf den Mint-Rechner beschränken** (erst nach Phase B3 möglich, wenn die Mint-Tailscale-IP `TS_MINT` bekannt ist — Regel dann nachtragen):
```powershell
New-NetFirewallRule -DisplayName "LM Studio (Tailscale/Hermes)" `
  -Direction Inbound -Action Allow -Protocol TCP -LocalPort 1234 `
  -RemoteAddress <TS_MINT>          # NUR die Tailscale-IP des Mint-Rechners
```

> Alternativ (weniger streng, aber ok): `-RemoteAddress 100.64.0.0/10` erlaubt das gesamte Tailscale-CGNAT-Netz. **Niemals** die Regel offen (`Any`) lassen.

**Akzeptanzkriterium:** `netstat` zeigt `0.0.0.0:1234`; Firewall-Regel erlaubt Port 1234 **nur** von der/den Tailscale-IP(s).

---

## 4. Phase B3 — Tailscale auf Linux Mint + Erreichbarkeit **[MINT]**

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
#   → Browser-Login mit DEMSELBEN Konto wie auf dem 5080 (gleiches Tailnet).
tailscale ip -4
#   → Tailscale-IP des Mint-Rechners (100.d.e.f) = TS_MINT — NOTIEREN
#     (danach die Firewall-Regel in Phase B2 mit dieser IP nachtragen!).
```

**Erreichbarkeit des Endpoints über den Tunnel testen** (TS_5080 = Tailscale-IP des 5080):
```bash
curl http://<TS_5080>:1234/v1/models
#   → muss dasselbe JSON liefern wie lokal auf dem 5080
```

**Akzeptanzkriterium:** Der `curl`-Aufruf vom Mint-Rechner listet `qwen/qwen3.6-35b-a3b`. **Das ist der kritische Meilenstein** — ab hier ist der Endpoint remote nutzbar.

> Klappt es nicht: auf dem 5080 „Serve on Local Network" prüfen, Binding (`netstat`), Firewall-Regel (RemoteAddress = `TS_MINT`?), und `tailscale status` (sehen sich beide Peers?).

---

## 5. Phase B4 — Hermes Agent installieren **[MINT]**

Hermes ist noch nicht installiert. **Aktuelle Installationsmethode über den offiziellen Quickstart verifizieren** (verlinkt unten) — nicht raten.

- Docs Quickstart: https://hermes-agent.nousresearch.com/docs/getting-started/quickstart
- Repo: https://github.com/NousResearch/hermes-agent

Nach der Installation:
```bash
hermes --version         # Installation bestätigen
```

**Akzeptanzkriterium:** `hermes` ist im PATH aufrufbar.

> „open claw" auf dem Mint-Rechner kann i. d. R. weiterlaufen. Nur falls es Port 1234 lokal belegt oder mit Hermes' eigenem Port/API-Server kollidiert, dort einen anderen Port wählen.

---

## 6. Phase B5 — Hermes auf den lokalen Endpoint konfigurieren **[MINT]**

Config liegt in `~/.hermes/config.yaml` (+ `~/.hermes/.env`). **Bevorzugt** den interaktiven Assistenten nutzen — er schreibt die korrekten Feldnamen und prüft den Endpoint gegen `/v1/models`:

```bash
hermes model
#   → Provider-Auswahl: "Custom OpenAI-compatible endpoint" wählen
#   → base_url:  http://<TS_5080>:1234/v1
#   → Modell:    qwen/qwen3.6-35b-a3b   (Hermes bestätigt es via /v1/models)
```

**Resultierende `~/.hermes/config.yaml`** (manuell prüfen/ergänzen — Feldnamen ggf. gegen die Doku abgleichen):
```yaml
model:
  default: "qwen/qwen3.6-35b-a3b"
  provider: "custom"                     # base_url gesetzt → Cloud-Provider wird ignoriert
  base_url: "http://<TS_5080>:1234/v1"
  context_length: 65536                  # deckt sich mit dem geladenen Modell

# ── ALLE Hilfsmodelle auf das lokale Hauptmodell zwingen (KEIN Cloud-Fallback) ──
auxiliary:
  vision:         { provider: "main" }
  web_extract:    { provider: "main" }
  session_search: { provider: "main" }
  # tts: lokal (Piper) statt Cloud — Feldname/Setup gegen die Doku prüfen
```

**`~/.hermes/.env`** — Dummy-Key setzen (LM Studio prüft ihn nicht, der OpenAI-Client braucht aber einen Wert):
```bash
OPENAI_API_KEY=lm-studio
```

> **Kein-Cloud-Kontrolle (wichtig!):** Die Hermes-Default-Config zeigt auf OpenRouter/Claude. Sicherstellen, dass
> (a) `model.provider: custom` **mit** gesetztem `base_url`, und
> (b) **jeder** `auxiliary`-Eintrag auf `main` (oder denselben lokalen `base_url`) zeigt — sonst gehen Vision/Websuche/Zusammenfassung heimlich in die Cloud.
> Telemetrie hat laut Config keinen expliziten Schalter → echtes Air-Gapping über Firewall/VPN + **kein Nous-Dashboard-Login**.

**Akzeptanzkriterium:** `~/.hermes/config.yaml` zeigt `base_url` auf `TS_5080:1234/v1`, Modell = `qwen/qwen3.6-35b-a3b`, alle `auxiliary` auf `main`.

---

## 7. Phase B6 — Funktionstest über Hermes **[MINT]**

```bash
# Einfacher Chat-Durchlauf durch Hermes
hermes "Sag kurz Hallo auf Deutsch und nenne die Hauptstadt von Italien."
```

Und ein Test, der **Tool-Nutzung** provoziert (Hermes' Kernfunktion), z. B. eine kleine Datei-/Shell-Aufgabe im Hermes-Workflow, sodass ein Tool-Call ausgelöst wird.

**Parallel auf dem 5080 beobachten**, dass die Last wirklich dort landet:
```powershell
nvidia-smi -l 2        # GPU-Util steigt, während Hermes generiert
```

**Akzeptanzkriterium (Definition of Done Phase B):**
- [ ] Tailscale verbindet 5080 ↔ Mint (beide `100.x`, `tailscale status` grün)
- [ ] LM Studio lauscht auf `0.0.0.0:1234`, Firewall nur für `TS_MINT`
- [ ] `curl http://<TS_5080>:1234/v1/models` vom Mint-Rechner erfolgreich
- [ ] Hermes installiert, `config.yaml` zeigt auf den lokalen Endpoint
- [ ] **Alle** `auxiliary`-Modelle auf `main` (kein Cloud-Fallback)
- [ ] Hermes-Chat liefert Antwort; GPU-Last erscheint auf dem 5080
- [ ] Tool-/Function-Calling über Hermes funktioniert

---

## 8. Troubleshooting-Kurzreferenz

- **`curl` vom Mint schlägt fehl** → auf 5080: „Serve on Local Network" an? `netstat` = `0.0.0.0:1234`? Firewall-`RemoteAddress` = `TS_MINT`? `tailscale status` auf beiden?
- **Hermes antwortet, aber langsam/Cloud** → `config.yaml` prüfen: `base_url` gesetzt, `provider: custom`, **alle** `auxiliary` auf `main`. Ein vergessener Cloud-Provider im `auxiliary`-Block ist die häufigste Ursache.
- **„model not found" in Hermes** → Modell-ID exakt wie in `/v1/models` (`qwen/qwen3.6-35b-a3b`), nicht der Anzeigename.
- **Kontext „vergessen"** → `context_length` in Hermes ≤ dem in LM Studio geladenen Wert (65536).
- **VRAM-OOM auf dem 5080 unter Last** → GPU-Offload-Layer reduzieren (siehe `QWEN-RTX5080-SETUP.md`, Sektion 0).
- **Auth-Fehler** → `OPENAI_API_KEY` in `~/.hermes/.env` gesetzt (Dummy reicht)?
- **Tailscale-Peers sehen sich nicht** → gleiches Konto/Tailnet? `sudo tailscale up` erneut; ggf. ACLs im Tailscale-Admin prüfen.

---

## 9. Nächste Schritte (optional, nach erfolgreicher Anbindung)

- **Kleines Hilfsmodell** zusätzlich auf dem 5080 laden (z. B. `qwen3-14b` oder das Embedding-Modell) und in Hermes gezielt für Nebenjobs (Memory/Zusammenfassung/RAG) pinnen — passt neben dem 35B-A3B in den freien Speicher.
- **Speculative Decoding** für mehr Tempo (großes + kleines Draft-Modell) — nur, wenn VRAM-Budget es hergibt.
- **Lokales TTS (Piper)** in Hermes einrichten statt Cloud-TTS.

---

## Quellen (Hermes-Konfiguration)

- [Configuration | Hermes Agent](https://hermes-agent.nousresearch.com/docs/user-guide/configuration)
- [AI Providers | Hermes Agent](https://hermes-agent.nousresearch.com/docs/integrations/providers)
- [Quickstart | Hermes Agent](https://hermes-agent.nousresearch.com/docs/getting-started/quickstart)
- [NousResearch/hermes-agent (GitHub)](https://github.com/NousResearch/hermes-agent)
- [cli-config.yaml.example](https://github.com/NousResearch/hermes-agent/blob/main/cli-config.yaml.example)
