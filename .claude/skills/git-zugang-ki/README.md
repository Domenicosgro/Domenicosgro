# Skill `git-zugang-ki` – installieren

Ein Skill, zwei Agenten. Der Ordner folgt dem offenen Skill-Format
(`SKILL.md` mit `name` + `description` im Kopf, daneben Hilfsdateien) und
funktioniert so in Claude und in Codex.

```
git-zugang-ki/
├── SKILL.md          # die eigentlichen Anweisungen
├── README.md         # diese Datei
└── vorlagen/         # AGENTS.md, CLAUDE.md, gitignore, idee.md
```

## Claude (Domenico)

**claude.ai / Claude-App:** `git-zugang-ki.zip` unter Einstellungen →
Funktionen → Skills hochladen.

**Claude Code im Repo:** Ordner nach `.claude/skills/git-zugang-ki/` legen.
**Claude Code für alle Projekte:** nach `~/.claude/skills/git-zugang-ki/`.

## Codex (Sven)

**Codex CLI / IDE für alle Projekte:** Ordner nach `~/.codex/skills/git-zugang-ki/`
kopieren und Codex neu starten.

```powershell
Copy-Item -Recurse git-zugang-ki "$env:USERPROFILE\.codex\skills\"
```

**Nur für ein Repo:** Ordner im Repo unter dem Skill-Verzeichnis ablegen, das die
aktuelle Codex-Doku nennt.

> Die Pfade bei Codex bitte einmal mit der aktuellen Codex-Doku abgleichen – sie
> haben sich dort schon geändert. Kontrolle: Codex fragen „Welche Skills hast du?"
> – `git-zugang-ki` muss erscheinen.

**Rückfall ohne Skill-Unterstützung:** `SKILL.md` als Abschnitt in die
`AGENTS.md` des Repos übernehmen – die liest Codex immer.

## Aktualisieren

Maßgeblich ist die Fassung im Repo. Nach jeder Änderung (per Pull Request)
installieren **beide** neu – sonst arbeiten Claude und Codex mit verschiedenen
Regeln.
