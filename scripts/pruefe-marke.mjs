/**
 * Prüft, ob der Name des Betreibers irgendwo hart im Code steht.
 *
 * Hintergrund: Name, Kürzel, Logo und Mail-Farben gehören in
 * server/betreiber.js bzw. src/brand.js und kommen aus Umgebungsvariablen
 * (CLAUDE.md §9). Wer sie hart einträgt, macht die Anwendung für jedes
 * andere Büro unbrauchbar — und findet die Stelle beim nächsten Mal nicht.
 *
 * Aufruf:  npm run pruefe:marke
 * Ergebnis: Rückgabewert 1 bei Fund, sonst 0.
 *
 * Nicht gemeldet werden Kommentare (die dürfen Namen nennen, sie erscheinen
 * nirgends) und die unten begründeten technischen Kennungen.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const WURZEL = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const ORDNER = ['src', 'server']
// Gesucht wird auch der alte Name GHBA: das Büro heißt seit November 2026
// Komplizen, und der alte soll nicht über eine kopierte Zeile zurückkommen.
const MARKE  = /ghba|komplizen/i

/**
 * Stellen, an denen der Name stehen BLEIBT, mit Begründung. Das sind keine
 * Schlampigkeiten, sondern Kennungen, an denen Datenbestand und
 * Schnittstellen hängen — wer sie ändert, richtet Schaden an.
 */
const ERLAUBT = [
  { ort: 'server/betreiber.js',    grund: 'hier stehen die Vorgaben, genau dafür ist die Datei da' },
  { ort: 'src/brand.js',           grund: 'dito, für die Oberfläche' },
  { ort: 'server/db.js',           grund: 'Dateiname der Datenbank — Umbenennen legt eine neue, leere an' },
  { ort: 'server/pm2.config.js',   grund: 'Name des Prozesses, nirgends sichtbar' },
  { ort: 'server/stammdaten.js',   grund: 'Kennung Richtung Dashboard, die andere Seite erwartet sie so' },
  { ort: 'server/synologyAuth.js', grund: 'Sitzungsname der DSM-Anmeldung' },
]

const istErlaubt = (datei) => ERLAUBT.some(e => e.ort === datei)

// Kommentarzeile? Dann ist der Name nirgends zu sehen.
const istKommentar = (zeile) => {
  const t = zeile.trim()
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')
}

function dateien(ordner, treffer = []) {
  for (const name of readdirSync(ordner)) {
    const pfad = join(ordner, name)
    if (statSync(pfad).isDirectory()) {
      if (name !== 'node_modules') dateien(pfad, treffer)
    } else if (/\.(js|jsx|mjs)$/.test(name)) {
      treffer.push(pfad)
    }
  }
  return treffer
}

const funde = []
for (const ordner of ORDNER) {
  for (const pfad of dateien(join(WURZEL, ordner))) {
    const datei = relative(WURZEL, pfad).split(sep).join('/')
    if (istErlaubt(datei)) continue
    readFileSync(pfad, 'utf8').split(/\r?\n/).forEach((zeile, i) => {
      if (MARKE.test(zeile) && !istKommentar(zeile)) {
        funde.push({ datei, nr: i + 1, zeile: zeile.trim() })
      }
    })
  }
}

if (funde.length === 0) {
  console.log('Marke: in Ordnung — kein harter Name des Betreibers im Code.')
  console.log('(%d Stellen bleiben begründet, siehe Ausnahmeliste in diesem Skript)', ERLAUBT.length)
  process.exit(0)
}

console.error('Marke hart eingetragen — %d Stelle(n):\n', funde.length)
for (const f of funde) console.error('  %s:%d\n    %s\n', f.datei, f.nr, f.zeile)
console.error('Gehört nach server/betreiber.js bzw. src/brand.js (CLAUDE.md §9).')
console.error('Ist es eine technische Kennung, die bleiben muss: mit Begründung')
console.error('in die Ausnahmeliste in scripts/pruefe-marke.mjs aufnehmen.')
process.exit(1)
