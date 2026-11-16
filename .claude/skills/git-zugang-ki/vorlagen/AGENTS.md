# <PROJEKT> – Regeln für alle, die hier arbeiten (Menschen und KI-Agenten)

## Zweck
<Ein, zwei Sätze: was die Anwendung tut, wo sie läuft.>

## Arbeitsweise
- **`main` = Stand, der live ist.** Niemand pusht direkt auf `main`.
- **Jede Änderung auf eigenem Branch** (`claude/…`, `codex/…`, `<name>/…`) **als Pull Request.**
  Ein anderer liest gegen, dann Merge.
- **Vor jedem Auftrag prüfen:** offene Issues und PRs, aktive Branches, Konzeptdateien.
  Ist etwas schon umgesetzt, gerade in Arbeit oder widerspricht es einer Entscheidung,
  wird das **zurückgemeldet, bevor gebaut wird**.
- **Ein Issue gehört genau einem Bearbeiter** (Label bzw. Zuweisung). Große gemeinsame
  Dateien nicht parallel bearbeiten, sondern vorher absprechen.
- **Tests müssen grün sein** (GitHub Actions bei jedem PR).
- **Entscheidungen schriftlich** in `docs/ENTSCHEIDUNGEN.md` mit Datum und Namen.

## Grenzen der KI-Agenten
- Claude und Codex erreichen das lokale Netz (NAS, Home Assistant, Geräte) **nicht**.
  Nie behaupten, etwas getestet zu haben, das nur vor Ort testbar ist.
- Jeder PR enthält eine **Testanleitung** für den Menschen vor Ort.

## Niemals ins Repo
- API-Schlüssel, Passwörter, Tokens, Zugangscodes
- `.env` oder andere Konfigurationsdateien mit Geheimnissen (nur `*.example`)
- personenbezogene Daten (auch nicht in Tests)

## Sprache
Deutsch in Doku, Commits und Oberfläche.
