# Git-Zugang für Claude und Codex – Anleitung für neue Projekte

Was wir beim Lernkomplize gelernt haben, als Vorlage für jedes weitere Projekt.

## 1. Die wichtigste Erkenntnis

**Ein Mensch mit Zugriff auf ein Repo ist nicht dasselbe wie eine KI mit Zugriff.**

| | Wie bekommt man Zugriff? | Wer richtet es ein? |
|---|---|---|
| Mensch (z. B. Nico) | Einladung als *Collaborator* (Repo → Settings → Collaborators) | Besitzer des Repos |
| **Claude** | **Claude GitHub App** auf dem Konto installieren, dem das Repo gehört | **Nur der Besitzer** dieses Kontos |
| **Codex** | ChatGPT-/Codex-GitHub-App auf demselben Konto | Ebenfalls der Besitzer |

Eine Einladung als Collaborator reicht für die KI **nicht**. Die App muss auf dem Konto
installiert sein, **dem das Repo gehört**, nicht auf dem Konto der eingeladenen Person.

## 2. Neues Projekt – empfohlener Ablauf

1. **Festlegen, wem das Repo gehört** (ein Konto oder eine GitHub-Organisation).
   Am einfachsten: das Konto, das ohnehin die meiste Arbeit macht.
2. **Repo privat anlegen** (github.com/new, ohne README, wenn Code schon existiert).
3. **Claude-App installieren** (Besitzer, angemeldet als Besitzer):
   https://github.com/apps/claude/installations/select_target → Konto wählen →
   „Only select repositories" → Repo → Install.
   Kontrolle: Repo → Settings → **GitHub Apps** (nicht „Collaborators").
4. **Codex-App** genauso für dasselbe Repo freigeben (über ChatGPT/Codex → GitHub verbinden).
5. **Weitere Menschen** als Collaborator einladen (Settings → Collaborators → Add people).
6. **Claude-Sitzung mit genau diesem Repo starten** (in der Claude-App beim Start das Repo
   auswählen).
   Prüfen: „Repository-Status prüfen" in claude.ai → Einstellungen → GitHub-Integration.

## 3. Wenn die App (noch) nicht installiert werden kann: Spiegel

Wenn der Besitzer gerade nicht erreichbar ist, auf dem eigenen Konto eine Kopie anlegen:

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

(Das Zielrepo vorher leer auf github.com anlegen.)

Nachteile: zwei Repos, alles muss hin- und hergeschoben werden. Nur als Übergang nutzen.
Danach immer **ein Hauptrepo**.

**Stolperfalle:** Zwei Repos mit **gleichem Namen** (auch bei verschiedenen Besitzern)
passen nicht in eine Claude-Sitzung. Dann eine neue Sitzung nur mit dem Hauptrepo starten.

## 4. Regeln für die Zusammenarbeit (in `AGENTS.md` im Repo)

`AGENTS.md` liest Codex automatisch. Für Claude eine `CLAUDE.md` mit einer Zeile anlegen:
`Lies und befolge AGENTS.md.` Inhalt bewährt:

- **`main` = Stand, der live ist.** Niemand pusht direkt auf `main`.
- **Jede Änderung auf eigenem Branch** (`claude/…`, `codex/…`, `name/…`) **als Pull Request**.
  Der andere liest gegen, dann Merge.
- **Vor jedem Auftrag prüfen:** offene Issues und PRs, aktive Branches und Konzeptdateien.
  Ist etwas schon umgesetzt, gerade in Arbeit oder widerspricht es einer Entscheidung,
  wird das **zurückgemeldet, bevor gebaut wird**.
- **Große gemeinsame Dateien** (z. B. die eine Oberflächendatei) nicht parallel bearbeiten,
  sondern vorher absprechen.
- **Tests müssen grün sein** (GitHub Actions bei jedem PR).
- **Niemals ins Repo:** API-Schlüssel, Passwörter, Zugangscodes, `.env`/Konfigurationsdateien
  mit Geheimnissen, personenbezogene Daten (z. B. echte Namen von Kindern, auch nicht in Tests).
- **Entscheidungen schriftlich** in einer Konzeptdatei mit Datum und Namen festhalten.

Zusätzlich: eine **Issue-Vorlage für Ideen** (`.github/ISSUE_TEMPLATE/idee.md`) und Labels
(`idee`, `in-arbeit`, `umgesetzt`, `doppelt`, `entscheidung-noetig`) einmal in GitHub anlegen.

## 5. Geheimnisse richtig behandeln

- Echte Konfiguration nur lokal und auf dem Server. Im Repo liegt nur eine
  `*.example`-Vorlage, die echte Datei steht in der `.gitignore`.
- Schlüssel nie in Chat, E-Mail, Screenshots oder Tickets. Gelangt doch einer dorthin:
  sofort beim Anbieter sperren und neu erzeugen.
- Für automatisches Hochladen: Zugangsdaten nur als **GitHub-Secret in einem Environment
  (z. B. `production`)**, beschränkt auf `main`. Dafür einen **eigenen Server-Zugang**
  einrichten, der nur den Webordner sieht.

## 6. Häufige Fehlermeldungen

| Meldung | Ursache | Lösung |
|---|---|---|
| `repository not found` bei `git push` | Zielrepo existiert noch nicht | Erst auf github.com anlegen |
| Claude: „not found / no access" | App nicht auf dem Besitzerkonto installiert | Besitzer installiert die Claude-App (Abschnitt 2.3) |
| Claude: „same-named repository already attached" | Zwei gleichnamige Repos in einer Sitzung | Neue Sitzung nur mit dem Hauptrepo |
| Merge-Konflikt im PR | `main` hat sich inzwischen geändert | `main` in den Branch mergen und Konflikte lösen, **nicht** im GitHub-Webeditor bei vielen Dateien |
| Hook meldet „unpushed commits, no remote branch" | Lokaler Branchname weicht vom Namen auf GitHub ab | Lokalen Branch umbenennen bzw. Tracking setzen |

## 7. Kurz-Checkliste

- [ ] Ein Hauptrepo, privat, Besitzer festgelegt
- [ ] Claude-App und Codex-App vom Besitzer installiert, Kontrolle unter Settings → GitHub Apps
- [ ] Menschen als Collaborator eingeladen
- [ ] `AGENTS.md` + `CLAUDE.md` + Issue-Vorlage + Labels
- [ ] `.gitignore` für Konfiguration/Geheimnisse, `*.example`-Vorlage im Repo
- [ ] GitHub Actions: Tests bei jedem PR
- [ ] (später) Auto-Deploy nur von `main`, Secrets im Environment, eigener Server-Zugang
