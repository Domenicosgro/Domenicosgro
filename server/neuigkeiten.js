'use strict'
// ─────────────────────────────────────────────────────────────────────────────
// Neuigkeiten: was (K)ompl(I)ze den Leuten beim Anmelden zu sagen hat.
//
// **Der Text kommt aus einer Datei, nicht aus dem Modell.** `neuigkeiten.md`
// liegt im Projekt, wird im selben Commit geschrieben wie die Verbesserung,
// die sie ankündigt, und ist damit versioniert und gegengelesen. Der
// Assistent erfindet keine Neuigkeit — er bekommt diesen Text als Material
// und erklärt ihn, wenn jemand nachfragt. Dieselbe Rollenteilung wie bei den
// Fundstellen: Die Wahrheit ist von Menschen, die Erläuterung vom Modell.
//
// Warum nicht aus der BUILD_ID: Die ist ein Zeitstempel. „Was wurde
// verbessert" steht darin nicht und lässt sich daraus auch nicht ableiten.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')

// Höchstens so viele ungelesene Neuigkeiten auf einmal. Wer drei Wochen im
// Urlaub war, soll nicht von einer Wand empfangen werden.
const HOECHSTENS = 3

// Ein Bild darf so groß sein. Es wird als data:-URL in ein <img> gegeben;
// was darüber liegt, bläht jede Antwort auf.
const BILD_ZEICHEN = 120000

let _zwischenspeicher = null

function datei() {
  return path.join(__dirname, 'neuigkeiten.md')
}

/**
 * Die Einträge aus neuigkeiten.md, neueste zuerst.
 *
 * Aufbau je Eintrag:
 *
 *     ## <kennung> | <Titel>
 *     <Text>
 *
 * Die **Kennung** merkt sich, wer den Eintrag gesehen hat. Sie beginnt mit
 * dem Datum und darf sich nie ändern — sonst erscheint die Neuigkeit bei
 * allen erneut. Der Titel darf sich ändern.
 *
 * Überschriften ohne `|` sind Anleitung für uns selbst (der Kopf der Datei)
 * und werden übergangen. Deshalb braucht die Datei keine zweite, versteckte
 * Form: Sie ist zugleich lesbar und auswertbar.
 */
function lesen({ frisch = false } = {}) {
  if (_zwischenspeicher && !frisch) return _zwischenspeicher
  let roh = ''
  try {
    roh = fs.readFileSync(datei(), 'utf8')
  } catch (e) {
    console.error('[neuigkeiten] nicht lesbar:', e?.message || e)
    _zwischenspeicher = []
    return _zwischenspeicher
  }

  const eintraege = []
  let aktuell = null
  let imZaun = false
  for (const zeile of roh.split(/\r?\n/)) {
    // Code-Zäune überspringen. Die Datei erklärt sich selbst und zeigt dabei
    // ein Beispiel einer Überschrift — ohne diese Zeile wird daraus eine
    // echte Neuigkeit, die niemand geschrieben hat. Beim ersten Probelauf
    // genau so passiert: zwei Einträge statt einem.
    if (/^\s*```/.test(zeile)) { imZaun = !imZaun; if (aktuell) aktuell.zeilen.push(zeile); continue }
    if (imZaun) { if (aktuell) aktuell.zeilen.push(zeile); continue }

    const k = zeile.match(/^##\s+([0-9]{4}-[0-9]{2}-[0-9]{2}[a-z0-9-]*)\s*\|\s*(.+?)\s*$/)
    if (k) {
      if (aktuell) eintraege.push(fertig(aktuell))
      aktuell = { kennung: k[1], titel: k[2], zeilen: [] }
      continue
    }
    // Eine andere Überschrift beendet einen laufenden Eintrag: Sonst würde
    // der Anleitungsteil der Datei hinten an die letzte Neuigkeit geklebt.
    if (/^#{1,2}\s/.test(zeile)) {
      if (aktuell) { eintraege.push(fertig(aktuell)); aktuell = null }
      continue
    }
    if (aktuell) aktuell.zeilen.push(zeile)
  }
  if (aktuell) eintraege.push(fertig(aktuell))

  eintraege.sort((a, b) => b.kennung.localeCompare(a.kennung))
  _zwischenspeicher = eintraege
  return eintraege
}

function fertig(e) {
  const text = e.zeilen.join('\n').replace(/^\s*-{3,}\s*$/gm, '').trim()
  const bild = text.match(/!\[[^\]]*\]\(([^)]+)\)/)
  return {
    kennung: e.kennung,
    titel: e.titel,
    datum: e.kennung.slice(0, 10),
    // Ohne die Bildzeile: Sie gehört nicht in den Fließtext.
    text: text.replace(/!\[[^\]]*\]\([^)]+\)/g, '').replace(/\n{3,}/g, '\n\n').trim(),
    bildpfad: bild ? bild[1] : null,
  }
}

/**
 * Das Bild eines Eintrags als data:-URL — oder null.
 *
 * **Bewusst als data:-URL für ein `<img>`, nicht als eingebettetes SVG.**
 * Ein SVG, das direkt im Dokument landet, darf darin Skripte ausführen; in
 * einem `<img>` nicht. Diese Dateien stammen zwar aus dem eigenen Projekt
 * und sind gegengelesen — aber die Oberfläche soll nicht davon abhängen,
 * dass das immer so bleibt.
 */
function bild(eintrag) {
  if (!eintrag?.bildpfad) return null
  // Nur Dateien unterhalb von server/ -- kein Weg nach oben.
  const ziel = path.resolve(__dirname, eintrag.bildpfad)
  if (!ziel.startsWith(path.resolve(__dirname) + path.sep)) {
    console.error('[neuigkeiten] Bildpfad zeigt aus dem Ordner heraus:', eintrag.bildpfad)
    return null
  }
  let roh
  try {
    roh = fs.readFileSync(ziel)
  } catch { return null }
  if (roh.length > BILD_ZEICHEN) {
    console.error('[neuigkeiten] Bild zu gross (%d Zeichen): %s', roh.length, eintrag.bildpfad)
    return null
  }
  const art = ziel.toLowerCase().endsWith('.svg') ? 'image/svg+xml'
    : ziel.toLowerCase().endsWith('.png') ? 'image/png'
      : ziel.toLowerCase().endsWith('.jpg') || ziel.toLowerCase().endsWith('.jpeg') ? 'image/jpeg'
        : null
  if (!art) return null
  return 'data:' + art + ';base64,' + roh.toString('base64')
}

/**
 * Was diese Person noch nicht gesehen hat.
 *
 * Zwei Einschränkungen, beide mit Grund:
 *
 * * **Nichts von vor der eigenen Anmeldung.** Wer heute dazukommt, soll
 *   nicht die Versionsgeschichte des letzten Jahres vorgesetzt bekommen.
 * * **Höchstens drei.** Wer drei Wochen weg war, soll nicht von einer Wand
 *   empfangen werden. Die übrigen gelten danach als gesehen — sie stehen ja
 *   weiter im Programm zum Nachlesen.
 */
function offenFuer(db, benutzer, seit = null) {
  const alle = lesen()
  if (!alle.length) return []
  let gesehen = new Set()
  try { gesehen = new Set(db.neuigkeiten.gesehenVon(benutzer)) } catch { /* leer */ }
  const grenze = (seit || '').slice(0, 10)
  return alle
    .filter(e => !gesehen.has(e.kennung))
    .filter(e => !grenze || e.datum >= grenze)
    .slice(0, HOECHSTENS)
}

module.exports = { lesen, bild, offenFuer, HOECHSTENS, _datei: datei }
