---
name: git-zugang-ki
description: Richtet ein GitHub-Repository so ein, dass Menschen, Claude und Codex gemeinsam daran arbeiten können – Besitzer festlegen, Claude-/Codex-App installieren, AGENTS.md/CLAUDE.md, .gitignore, Labels, Issue-Vorlage, Tests. Verwenden bei einem neuen Projekt oder Repo, wenn jemand Claude oder Codex Zugriff geben will, wenn mehrere Personen (z. B. Sven, Nico) und KI-Agenten an einem Repo arbeiten sollen, bei Fehlern wie "not found / no access", "repository not found", "same-named repository already attached", oder wenn eine Kopie/ein Spiegel eines fremden Repos nötig ist.
---

# Git-Zugang für Claude und Codex

Erfahrungswissen aus Lernkomplize und KOMPLIZEN Büro-Audio. Gilt für jedes neue
Projekt, an dem Menschen und KI-Agenten gemeinsam arbeiten.

## Der Kernsatz

**Ein Mensch mit Zugriff auf ein Repo ist nicht dasselbe wie eine KI mit Zugriff.**

| | Zugriff über | Wer richtet es ein |
|---|---|---|
| Mensch | Einladung als *Collaborator* (Repo → Settings → Collaborators) | Besitzer des Repos |
| **Claude** | **Claude GitHub App** auf dem Konto, **dem das Repo gehört** | **nur dieser Besitzer** |
| **Codex** | ChatGPT-/Codex-GitHub-App auf demselben Konto | ebenfalls der Besitzer |

Eine Collaborator-Einladung reicht für die KI **nie**. Ist Claude bei einem Repo
„not found / no access", liegt es fast immer daran, dass die App nicht auf dem
Besitzerkonto installiert ist – nicht an fehlenden Rechten der eingeladenen Person.

**Zweite Grenze:** Claude und Codex laufen in der Cloud. Sie erreichen das
Heim-/Büronetz (NAS, Home Assistant, `192.168.x.x`) **nicht**. Sie arbeiten nur im
Repository; getestet wird vor Ort von einem Menschen, das Ergebnis geht zurück in
PR oder Issue.

## Vorgehen, wenn dieser Skill greift

1. **Zuerst fragen, was schon steht**, nicht annehmen: Gibt es das Repo? Wem gehört
   es? Ist die Claude-App installiert? Existiert die Anwendung schon (dann
   bestehenden Stand abfragen, nicht ein System neu entwerfen)?
2. Den passenden Abschnitt unten abarbeiten und dem Menschen **genau die Schritte**
   nennen, die nur er tun kann (App installieren, einladen) – mit Link.
3. Was im Repo liegt (`AGENTS.md`, `CLAUDE.md`, `.gitignore`, Vorlagen), legt
   Claude selbst an – aus `vorlagen/` in diesem Skill, angepasst ans Projekt.
4. Am Ende die Kurz-Checkliste ausgeben, abgehakt nach tatsächlichem Stand.

## Neues Projekt – Ablauf

1. **Besitzer festlegen** (ein Konto oder eine GitHub-Organisation) – am besten das
   Konto, das die meiste Arbeit macht.
2. **Repo privat anlegen** (github.com/new; ohne README, wenn Code schon existiert).
3. **Claude-App installieren** – angemeldet als Besitzer:
   https://github.com/apps/claude/installations/select_target → Konto wählen →
   „Only select repositories" → Repo → Install.
   Kontrolle: Repo → Settings → **GitHub Apps** (nicht „Collaborators").
4. **Codex-App** genauso für dasselbe Repo freigeben (ChatGPT/Codex → GitHub verbinden).
5. **Weitere Menschen** als Collaborator einladen.
6. **Claude-Sitzung mit genau diesem Repo starten** (beim Start das Repo wählen;
   in einer laufenden Cloud-Sitzung lässt es sich auch nachträglich hinzufügen).
   Prüfen: claude.ai → Einstellungen → GitHub-Integration → „Repository-Status prüfen".
7. **Repo-Grundausstattung** anlegen (siehe unten).

## Repo-Grundausstattung

| Datei | Vorlage |
|---|---|
| `AGENTS.md` – die Regeln, liest Codex automatisch | `vorlagen/AGENTS.md` |
| `CLAUDE.md` – eine Zeile: `Lies und befolge AGENTS.md.` | `vorlagen/CLAUDE.md` |
| `.gitignore` – Secrets/Konfiguration raus | `vorlagen/gitignore` |
| `.github/ISSUE_TEMPLATE/idee.md` | `vorlagen/idee.md` |
| `.github/workflows/tests.yml` – Tests bei jedem PR | projektabhängig schreiben |
| `*.example`-Vorlage der echten Konfiguration (z. B. `.env.example`) | projektabhängig |

**Labels** einmal in GitHub anlegen: `idee`, `in-arbeit`, `umgesetzt`, `doppelt`,
`entscheidung-noetig`.

**Eine Regelquelle:** Die Regeln stehen nur in `AGENTS.md`. `CLAUDE.md` verweist
darauf. Nie zwei Regelwerke pflegen.

## Wenn die App (noch) nicht installiert werden kann: Spiegel

Nur als Übergang, wenn der Besitzer gerade nicht erreichbar ist. Zielrepo vorher
**leer** auf dem eigenen Konto anlegen.

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

Nachteil: zwei Repos, alles muss hin- und hergeschoben werden. Danach immer
zurück zu **einem Hauptrepo**.
**Stolperfalle:** Zwei Repos mit **gleichem Namen** (auch bei verschiedenen
Besitzern) passen nicht in eine Claude-Sitzung → Kopie anders benennen oder neue
Sitzung nur mit dem Hauptrepo.

## Geheimnisse

- Echte Konfiguration nur lokal und auf dem Server; im Repo nur `*.example`, die
  echte Datei steht in `.gitignore`.
- Schlüssel nie in Chat, E-Mail, Screenshots, Tickets oder Markdown-Notizen. In
  Fragebögen nur notieren, **wo** ein Geheimnis liegt.
- Gelangt doch einer dorthin: **sofort beim Anbieter sperren und neu erzeugen.**
- Automatisches Deployment: Zugangsdaten nur als **GitHub-Secret in einem
  Environment** (z. B. `production`), beschränkt auf `main`, mit **eigenem
  Server-Zugang**, der nur den Zielordner sieht.

## Häufige Fehlermeldungen

| Meldung | Ursache | Lösung |
|---|---|---|
| `repository not found` bei `git push` | Zielrepo existiert noch nicht | Erst auf github.com anlegen |
| Claude: „not found / no access" | App nicht auf dem Besitzerkonto installiert | Besitzer installiert die Claude-App |
| Claude: „same-named repository already attached" | Zwei gleichnamige Repos in einer Sitzung | Neue Sitzung nur mit dem Hauptrepo |
| Merge-Konflikt im PR | `main` hat sich geändert | `main` in den Branch mergen, Konflikte lokal lösen – nicht im Web-Editor bei vielen Dateien |
| Hook: „unpushed commits, no remote branch" | Lokaler Branchname ≠ Name auf GitHub | Branch umbenennen bzw. Tracking setzen |

## Kurz-Checkliste

- [ ] Ein Hauptrepo, privat, Besitzer festgelegt
- [ ] Claude-App und Codex-App vom Besitzer installiert, Kontrolle unter Settings → GitHub Apps
- [ ] Menschen als Collaborator eingeladen
- [ ] `AGENTS.md` + `CLAUDE.md` + Issue-Vorlage + Labels
- [ ] `.gitignore` für Konfiguration/Geheimnisse, `*.example`-Vorlage im Repo
- [ ] GitHub Actions: Tests bei jedem PR
- [ ] (später) Auto-Deploy nur von `main`, Secrets im Environment, eigener Server-Zugang
