#!/usr/bin/env bash
# install-claude-skills.sh
# Installiert Agent Skills in das persoenliche Claude-Code-Verzeichnis (~/.claude/skills/).
# Ein Skill ist nur ein Ordner mit einer SKILL.md -> "installieren" = Ordner an die richtige Stelle legen.
# Nach dem Lauf: neue Claude-Code-Session starten, damit die Skills geladen werden.

set -euo pipefail
shopt -s nullglob

SKILLS_DIR="${HOME}/.claude/skills"
mkdir -p "$SKILLS_DIR"

# --- Skill aus lokalem Ordner installieren --------------------------------
install_local() {
  local src="$1"
  local name
  name="$(basename "$src")"

  if [[ ! -d "$src" ]]; then
    echo "  ✗ $name: Ordner nicht gefunden ($src)"
    return 1
  fi
  if [[ ! -f "$src/SKILL.md" ]]; then
    echo "  ✗ $name: keine SKILL.md im Ordner – uebersprungen"
    return 1
  fi

  rm -rf "${SKILLS_DIR:?}/$name"
  cp -R "$src" "$SKILLS_DIR/$name"
  echo "  ✓ $name installiert"
}

# --- Skill aus einem Git-Repo installieren --------------------------------
# Aufruf:  install_git <repo-url> [unterordner-im-repo]
install_git() {
  local repo="$1"
  local subdir="${2:-}"
  local tmp
  tmp="$(mktemp -d)"

  if ! git clone --depth 1 "$repo" "$tmp" >/dev/null 2>&1; then
    echo "  ✗ Klonen fehlgeschlagen: $repo"
    rm -rf "$tmp"
    return 1
  fi

  if [[ -n "$subdir" ]]; then
    install_local "$tmp/$subdir"
  else
    install_local "$tmp"
  fi
  rm -rf "$tmp"
}

echo "Ziel-Verzeichnis: $SKILLS_DIR"
echo
echo "Installiere Skills ..."

# ==========================================================================
# HIER deine Skills eintragen (Kommentarzeichen # entfernen und Pfade anpassen)
# ==========================================================================

# Eigener Skill aus lokalem Pfad – z. B. dein Branding-Skill:
# install_local "$HOME/dev/skills/ghba-komplizen-branding"

# Mehrere eigene Skills auf einmal aus einem Sammelordner:
# for d in "$HOME/dev/skills/"*/; do install_local "$d"; done

# Skill aus einem Git-Repo (ganzes Repo ist der Skill):
# install_git "https://github.com/dein-account/mein-skill.git"

# Skill aus einem Unterordner eines Repos (Pfad im Repo vorher pruefen!):
# install_git "https://github.com/dein-account/skills-mono.git" "skills/hoai-angebot"

echo
echo "Aktuell installierte Skills:"
if ls -1 "$SKILLS_DIR" >/dev/null 2>&1 && [[ -n "$(ls -A "$SKILLS_DIR")" ]]; then
  for d in "$SKILLS_DIR"/*/; do
    [[ -f "$d/SKILL.md" ]] && echo "  - $(basename "$d")"
  done
else
  echo "  (noch keine)"
fi

echo
echo "Fertig. Bitte eine neue Claude-Code-Session starten."
