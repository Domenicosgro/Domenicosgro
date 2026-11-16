---
name: git-zugang-ki
description: Gemeinsame Arbeitsbasis für Claude und Codex. Legt ein Git-Repository für ein neues Projekt an – fragt zuerst, ob es für Zusammenarbeit gedacht ist, und wenn ja, ob auf GitHub oder als gemeinsames Repo auf der Synology-NAS. Deckt Zugang für Menschen und KI-Agenten ab (Claude-/Codex-App, SSH, safe.directory), AGENTS.md/CLAUDE.md, .gitignore, Labels, Tests. Verwenden bei einem neuen Projekt oder Repo, wenn jemand Claude oder Codex Zugriff geben will, wenn mehrere Personen (z. B. Sven, Nico) und KI-Agenten an einem Repo arbeiten sollen, bei Fehlern wie "not found / no access", "repository not found", "same-named repository already attached", "detected dubious ownership", "deletion prohibited", oder wenn ein Spiegel eines fremden Repos nötig ist.
---

# Git-Zugang für Claude und Codex

Erfahrungswissen aus Lernkomplize und KOMPLIZEN Büro-Audio.

**Dieser Skill ist für beide Agenten derselbe** – Claude (Domenico) und Codex
(Sven) lesen dieselbe Datei. „Der Agent" meint im Folgenden immer den, der den
Skill gerade ausführt. Wer etwas ändert, ändert es hier für beide (siehe
„Pflege" am Ende).

---

## Schritt 0 – Immer zuerst fragen

Nichts anlegen, bevor diese Fragen beantwortet sind. Nicht raten.

1. **Gibt es schon etwas?** Repo, laufende Anwendung, Code auf einem Rechner?
   Wenn ja: bestehenden Stand abfragen, nicht ein System neu entwerfen.
2. **Soll das Projekt für Zusammenarbeit angelegt werden?**
   - **Nein** → Weg A (allein).
   - **Ja** → mit wem (Menschen, welche Agenten)? Dann Frage 3.
3. **Wo soll das gemeinsame Repo liegen?** Mit dieser Tabelle entscheiden lassen,
   Empfehlung aussprechen:

| | **B – GitHub** | **C – NAS (Git über SSH)** |
|---|---|---|
| Code verlässt das Büro | ja (privates Repo bei GitHub) | **nein** |
| Claude/Codex **in der Cloud** (Pull Requests selbstständig) | **ja** | nein |
| Claude/Codex **lokal** im eigenen Klon | ja | ja |
| Pull Requests mit Durchsicht, Issues, Tests bei jedem PR | **eingebaut** | von Hand (Branches zusammenführen) |
| Von unterwegs erreichbar | ja | nur im LAN / über VPN |
| Schutz von `main`, Löschsperre | Branch-Schutz in GitHub | Server-Einstellungen, **nur wirksam ohne SMB-Schreibrecht** |
| Einrichtung | GitHub-Konto + Apps des Besitzers | Git Server auf der NAS, SSH für alle Beteiligten |

**Faustregel:** Sollen KI-Agenten selbstständig in der Cloud arbeiten → **B**.
Soll der Code im Haus bleiben und die KI nur am eigenen Rechner helfen → **C**.

---

## Die zwei Grenzen (gelten für alle Wege)

1. **Ein Mensch mit Zugriff ist nicht dasselbe wie eine KI mit Zugriff.** Auf
   GitHub braucht die KI eine App auf dem Besitzerkonto (Weg B). Auf der NAS
   kommt eine Cloud-KI gar nicht heran (Weg C).
2. **Cloud-Agenten erreichen das Büro-/Heimnetz nicht** (NAS, Home Assistant,
   `192.168.x.x`, `\\server\freigabe`). Getestet wird vor Ort von einem Menschen,
   das Ergebnis geht zurück in Pull Request, Issue oder Absprache.

---

## Weg A – Allein (keine Zusammenarbeit)

- Repo lokal (`git init`) oder privat auf dem eigenen GitHub-Konto.
- Trotzdem: `.gitignore` aus `vorlagen/gitignore`, Geheimnisse nie ins Repo.
- `AGENTS.md`/`CLAUDE.md` optional – sinnvoll, sobald ein Agent mitarbeitet.
- Später auf B oder C umziehen ist jederzeit möglich (`git remote add` + `git push`).

---

## Weg B – GitHub

| | Zugriff über | Wer richtet es ein |
|---|---|---|
| Mensch | Einladung als *Collaborator* (Repo → Settings → Collaborators) | Besitzer des Repos |
| **Claude** | **Claude GitHub App** auf dem Konto, **dem das Repo gehört** | **nur dieser Besitzer** |
| **Codex** | ChatGPT-/Codex-GitHub-App auf demselben Konto | ebenfalls der Besitzer |

Eine Collaborator-Einladung reicht für die KI **nie**.

1. **Besitzer festlegen** (Konto oder GitHub-Organisation).
2. **Repo privat anlegen** (github.com/new; ohne README, wenn Code schon existiert).
3. **Claude-App installieren** – angemeldet als Besitzer:
   https://github.com/apps/claude/installations/select_target → Konto wählen →
   „Only select repositories" → Repo → Install.
   Kontrolle: Repo → Settings → **GitHub Apps** (nicht „Collaborators").
4. **Codex-App** genauso für dasselbe Repo freigeben (ChatGPT/Codex → GitHub verbinden).
5. **Weitere Menschen** als Collaborator einladen.
6. **Branch-Schutz** auf `main`: nur per Pull Request, eine Freigabe durch einen Menschen.
7. **Sitzung mit genau diesem Repo starten**
   - *Claude:* beim Start das Repo wählen (in einer laufenden Cloud-Sitzung lässt es
     sich nachträglich hinzufügen). Prüfen: claude.ai → Einstellungen →
     GitHub-Integration → „Repository-Status prüfen".
   - *Codex:* Umgebung für dieses Repo anlegen bzw. Repo beim Auftrag auswählen.
8. **Grundausstattung** (siehe unten), dazu Labels und GitHub Actions.

### Übergang: Spiegel, wenn der Besitzer die App noch nicht installiert hat

Zielrepo vorher **leer** auf dem eigenen Konto anlegen.

```powershell
cd $env:TEMP
```
```powershell
git clone --mirror https://github.com/BESITZER/REPO.git
```
```powershell
cd REPO.git
```
```powershell
git push --mirror https://github.com/MEINKONTO/REPO-kopie.git
```

Nur als Übergang – danach immer **ein Hauptrepo**. Zwei gleichnamige Repos (auch
bei verschiedenen Besitzern) passen nicht in eine Claude-Sitzung.

---

## Weg C – Gemeinsames Repo auf der NAS

Vorbild: `kom-audio` (Sven, 11/2026). Das Repo liegt als **bare repository**
(`source.git`) auf der Synology; jeder klont auf den eigenen Rechner und arbeitet
auf einem eigenen Branch. **Laufende Anwendung und Zugangsdaten liegen getrennt
vom Repo.**

### Empfohlen: Zugriff über SSH, nicht über die SMB-Freigabe

Erfahrung aus `kom-audio`: Mit Schreibrecht auf die Freigabe
(`\\ghba-nas\docker\…\source.git`) wirken die Schutzregeln nicht. Die Löschsperre
`receive.denyDeletes` griff bei `git push`, aber
`git -C \\ghba-nas\…\source.git branch -D …` löschte den Branch trotzdem direkt –
genauso ginge es mit `main`.

| Zugriff | Schutzregeln wirken? | Bewertung |
|---|---|---|
| **SSH** (`ssh://ds@ghba-nas/…/source.git`), auf der Freigabe nur Lesen | **ja** | **empfohlen für Zusammenarbeit** |
| SMB-Freigabe mit Schreibrecht | nein, umgehbar | nur unter Vertrauten, nur als Übergang |

### Einrichtung (Einrichter, einmalig)

Die Synology-Schritte vor der Ausführung mit der aktuellen DSM-Oberfläche
abgleichen – Menünamen ändern sich.

1. Paket **Git Server** installieren; dort den Beteiligten Zugriff geben.
   SSH-Dienst aktivieren (Systemsteuerung → Terminal & SNMP).
2. Bare-Repo anlegen und Schutzregeln setzen (auf der NAS, per SSH):

   ```bash
   git init --bare /volume1/docker/<projekt>/source.git
   ```
   ```bash
   git -C /volume1/docker/<projekt>/source.git config receive.denyDeletes true
   ```
   ```bash
   git -C /volume1/docker/<projekt>/source.git config receive.denyNonFastForwards true
   ```

3. Rechte: Beteiligte schreiben **nur über SSH**; auf der SMB-Freigabe für
   `source.git` höchstens **Lesen**.
4. SSH-Schlüssel der Beteiligten hinterlegen (sonst fragt jeder Push nach dem Kennwort).
5. Anleitung `ZUSAMMENARBEIT.md` neben das Repo legen – mit den Befehlen unten.

### Mitarbeiten (jeder Beteiligte)

```powershell
git clone ssh://<konto>@<nas>/volume1/docker/<projekt>/source.git <projekt>
```
```powershell
cd <projekt>
```
```powershell
git checkout -b <kürzel>/<thema>
```
```powershell
git push -u origin <kürzel>/<thema>
```

Übergangsweise über die Freigabe (Windows):

```powershell
git clone \\<nas>\docker\<projekt>\source.git <projekt>
```

**Bei „detected dubious ownership"** (Repo gehört auf der NAS einem lokalen
Konto, Windows kann es dem Domänenkonto nicht zuordnen → „inconvertible"):
einmal pro Rechner genau den Befehl ausführen, den Git vorschlägt:

```powershell
git config --global --add safe.directory '\\<nas>\docker\<projekt>\source.git'
```

Branches auf der NAS löscht **nur der Einrichter** (wegen `denyDeletes`).
Erst ersten Push selbst testen, bevor gearbeitet wird.

### KI-Agenten bei Weg C

| Weg | Geht? |
|---|---|
| Codex CLI / IDE auf dem eigenen Rechner, im lokalen Klon | ja |
| Claude Code (Desktop/Terminal) auf dem eigenen Rechner, im lokalen Klon | ja |
| Claude-Cloud-Sitzung mit dem lokalen Klon über **Remote Control** (Ordner in der Claude-Desktop-App freigeben) | ja |
| Claude/Codex in der Cloud direkt am NAS-Repo | **nein** |

Agenten committen auf eigenen Branches (`claude/…`, `codex/…`); pushen und
zusammenführen macht der Mensch.

---

## Grundausstattung (B und C)

| Datei | Vorlage |
|---|---|
| `AGENTS.md` – die Regeln, liest Codex automatisch | `vorlagen/AGENTS.md` |
| `CLAUDE.md` – eine Zeile: `Lies und befolge AGENTS.md.` | `vorlagen/CLAUDE.md` |
| `.gitignore` – Secrets/Konfiguration raus | `vorlagen/gitignore` |
| `*.example`-Vorlage der echten Konfiguration | projektabhängig |
| nur B: `.github/ISSUE_TEMPLATE/idee.md` | `vorlagen/idee.md` |
| nur B: `.github/workflows/tests.yml` | projektabhängig |

**Labels** (nur B): `idee`, `in-arbeit`, `umgesetzt`, `doppelt`, `entscheidung-noetig`.
**Eine Regelquelle:** Regeln nur in `AGENTS.md`, `CLAUDE.md` verweist darauf.

## Geheimnisse

- Echte Konfiguration nur lokal und auf dem Server; im Repo nur `*.example`, die
  echte Datei steht in `.gitignore`.
- Schlüssel nie in Chat, E-Mail, Screenshots, Tickets oder Markdown-Notizen. In
  Fragebögen nur notieren, **wo** ein Geheimnis liegt.
- Gelangt doch einer dorthin: **sofort beim Anbieter sperren und neu erzeugen.**
- Automatisches Deployment (B): Zugangsdaten nur als **GitHub-Secret in einem
  Environment** (z. B. `production`), beschränkt auf `main`, mit **eigenem
  Server-Zugang**, der nur den Zielordner sieht.

## Häufige Fehlermeldungen

| Meldung | Weg | Ursache | Lösung |
|---|---|---|---|
| `repository not found` bei `git push` | B | Zielrepo existiert noch nicht | Erst auf github.com anlegen |
| Claude: „not found / no access" | B | App nicht auf dem Besitzerkonto | Besitzer installiert die Claude-App |
| Codex: Repo erscheint nicht | B | Codex-App nicht freigegeben | Besitzer gibt das Repo frei |
| „same-named repository already attached" | B | Zwei gleichnamige Repos in einer Sitzung | Neue Sitzung nur mit dem Hauptrepo |
| `detected dubious ownership` | C | Repo gehört NAS-Lokalkonto, Windows-Nutzer ist Domänenkonto | `safe.directory` wie oben |
| `deletion prohibited` / `denying ref deletion` | C | `receive.denyDeletes` – gewollt | Einrichter löscht; **nicht** über die Freigabe umgehen |
| `cannot change to '/volume1/…'` | C | NAS-Pfad auf Windows ausgeführt | Befehl gehört auf die NAS (SSH) |
| Merge-Konflikt | B/C | `main` hat sich geändert | `main` in den Branch mergen, Konflikte lokal lösen |
| Hook: „unpushed commits, no remote branch" | B/C | Lokaler Branchname ≠ Remote | Branch umbenennen bzw. Tracking setzen |

## Kurz-Checkliste

**Immer**
- [ ] Schritt 0 geklärt: Bestand, Zusammenarbeit ja/nein, Weg A/B/C
- [ ] `.gitignore` + `*.example`, keine Geheimnisse im Repo
- [ ] bei Zusammenarbeit: `AGENTS.md` + `CLAUDE.md`, eigene Branches je Person/Agent
- [ ] erster Push von jedem Beteiligten selbst getestet

**Weg B (GitHub)**
- [ ] Repo privat, Besitzer festgelegt
- [ ] Claude-App und Codex-App vom Besitzer installiert (Settings → GitHub Apps)
- [ ] Menschen als Collaborator, Branch-Schutz auf `main`
- [ ] Issue-Vorlage, Labels, GitHub Actions

**Weg C (NAS)**
- [ ] bare repo `source.git`, `denyDeletes` + `denyNonFastForwards`
- [ ] Schreiben nur über SSH, SMB höchstens Lesen
- [ ] `ZUSAMMENARBEIT.md` neben dem Repo, inkl. `safe.directory`-Hinweis
- [ ] Anwendung und Zugangsdaten getrennt vom Repo

## Pflege – eine Quelle für beide Agenten

- Die **maßgebliche Fassung** dieses Skills liegt in einem Repo (derzeit
  `domenicosgro/domenicosgro`, Ordner `.claude/skills/git-zugang-ki/`; Ziel: ein
  gemeinsames Repo für Skills – nach Weg B oder C).
- Änderungen nur dort, per Pull Request bzw. eigenem Branch – Sven oder Domenico
  liest gegen.
- Danach installieren beide neu (siehe `README.md`). Nie eine lokale Kopie still
  abändern, sonst arbeiten Claude und Codex mit verschiedenen Regeln.
