'use strict'
// ─────────────────────────────────────────────────────────────────────────────
// Doppelte Mitarbeiter bereinigen
//
//   node server/wartung/dubletten-bereinigen.js            Probelauf, schreibt nichts
//   node server/wartung/dubletten-bereinigen.js --echt     bereinigt
//
// ── Warum es Dubletten gibt ─────────────────────────────────────────────────
// Es gibt zwei Wege, wie jemand Mitarbeiter wird:
//   1. von Hand in der Personalplanung angelegt (kein `contactKey`)
//   2. gespiegelt aus einem Kontakt der Kategorie "Eigene Organisation"
//      (syncOrgContacts in server/index.js, mit `contactKey`)
// Der Abgleich erkennt seine eigenen Spiegel am `contactKey` wieder. Die
// handangelegten Eintraege haben keinen - er sieht sie nicht und legt die
// Person ein zweites Mal an.
//
// ── Was dieses Werkzeug tut ─────────────────────────────────────────────────
// Es entfernt den HANDANGELEGTEN Eintrag, wenn zur selben Person ein
// Kontakt-Spiegel existiert. Der Spiegel ist die bessere Quelle: Er hat eine
// E-Mail, wird automatisch gepflegt und verschwindet, wenn jemand geht.
//
// Vorher haengt es die Verweise um: Team-Vorlagen
// (staff_plan_settings.teams[].members[].staffId) zeigen auf die Kennung des
// geloeschten Eintrags. Ohne das Umhaengen waeren die Vorlagen kaputt.
//
// ── Was es NICHT anfasst ────────────────────────────────────────────────────
//   * Eintraege ohne Kontakt-Gegenstueck - die koennten echt sein
//   * Eintraege mit gepflegtem Arbeitszeitmodell (abweichend von 8/8/8/8/8):
//     dort steckt Arbeit drin, die niemand verlieren soll
//   * Projektteams - die ordnen ueber Name und E-Mail zu, nicht ueber die
//     Kennung; nach dem Entfernen findet die Sollbesetzung genau einen
//     Treffer statt zwei, und das ist der Sinn der Uebung
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')

// Findet db.js sowohl beim Aufruf als Datei als auch ueber stdin
// (docker exec -i ... node < dieses-skript.js), wo __dirname nicht stimmt.
const dbPfad = [
  path.join(__dirname, '..', 'db.js'),
  '/app/server/db.js',
  path.join(process.cwd(), 'server', 'db.js'),
].find(p => { try { return fs.existsSync(p) } catch { return false } })
if (!dbPfad) { console.error('db.js nicht gefunden'); process.exit(1) }
const db = require(dbPfad)

const ECHT = process.argv.includes('--echt')
const STANDARD = { mo: 8, di: 8, mi: 8, do: 8, fr: 8 }

const schluessel = (s) => (s.name || '').trim().toLowerCase()
const istSpiegel = (s) => s.source === 'contact'
const gepflegt = (s) => {
  const t = s.dayHours || {}
  return ['mo', 'di', 'mi', 'do', 'fr'].some(k => Number(t[k] ?? -1) !== STANDARD[k])
}

function main() {
  const alle = db.staffMembers.list()
  console.log(`Mitarbeiter gesamt: ${alle.length}`)

  // Nach Namen gruppieren
  const nachName = new Map()
  for (const s of alle) {
    const k = schluessel(s)
    if (!k) continue
    if (!nachName.has(k)) nachName.set(k, [])
    nachName.get(k).push(s)
  }

  // Entscheiden, was weg kann
  const loeschen = []      // { weg, bleibt }
  const uebersprungen = []
  for (const [, gruppe] of nachName) {
    if (gruppe.length < 2) continue
    const spiegel = gruppe.filter(istSpiegel)
    const handgemacht = gruppe.filter(s => !istSpiegel(s))
    if (spiegel.length === 0) {
      uebersprungen.push({ gruppe, grund: 'nur handangelegte Eintraege - keiner ist eindeutig richtig' })
      continue
    }
    // Der Spiegel mit der plausibelsten Adresse gewinnt: eine persoenliche
    // Adresse (Nachname im lokalen Teil) vor einer Projektadresse.
    const bleibt = spiegel.length === 1 ? spiegel[0] : waehleSpiegel(spiegel)
    for (const h of handgemacht) {
      if (gepflegt(h)) {
        uebersprungen.push({ gruppe: [h], grund: 'gepflegtes Arbeitszeitmodell - nicht anfassen' })
        continue
      }
      loeschen.push({ weg: h, bleibt })
    }
    // Mehrere Spiegel zur selben Person: melden, aber NICHT loeschen. Dahinter
    // stecken zwei Kontakte, und welcher falsch ist, entscheidet ein Mensch.
    for (const s of spiegel) {
      if (s !== bleibt) uebersprungen.push({ gruppe: [s], grund: 'zweiter Kontakt-Spiegel - in der Kontaktdatenbank klaeren' })
    }
  }

  function waehleSpiegel(liste) {
    const nachname = (s) => (s.name || '').trim().split(/\s+/).pop().toLowerCase()
    const passt = liste.find(s => {
      const lokal = (s.email || '').split('@')[0].toLowerCase()
      return lokal.includes(nachname(s).slice(0, 5))
    })
    return passt || liste[0]
  }

  // Team-Vorlagen: Verweise umhaengen
  let settings = {}
  try { settings = JSON.parse(db.appState.get('staff_plan_settings') || '{}') } catch {}
  const teams = Array.isArray(settings.teams) ? settings.teams : []
  const umhaengen = new Map(loeschen.map(x => [x.weg.id, x.bleibt.id]))
  let treffer = 0
  const teamsNeu = teams.map(t => ({
    ...t,
    members: (t.members || []).map(m => {
      if (umhaengen.has(m.staffId)) { treffer++; return { ...m, staffId: umhaengen.get(m.staffId) } }
      return m
    }),
  }))

  // ── Bericht ───────────────────────────────────────────────────────────────
  console.log()
  console.log(`Zu entfernen: ${loeschen.length} handangelegte Dubletten`)
  for (const { weg, bleibt } of loeschen) {
    console.log(`  - ${weg.name}`)
    console.log(`      weg    Kennung ${weg.id.slice(0, 8)}  ohne E-Mail  (von Hand angelegt)`)
    console.log(`      bleibt Kennung ${bleibt.id.slice(0, 8)}  ${bleibt.email || '-'}`)
  }
  console.log()
  console.log(`Team-Vorlagen: ${treffer} Verweis(e) werden umgehaengt (${teams.length} Vorlagen)`)
  if (uebersprungen.length > 0) {
    console.log()
    console.log(`Nicht angefasst (${uebersprungen.length}):`)
    for (const u of uebersprungen) {
      for (const s of u.gruppe) {
        console.log(`  - ${s.name}  ${s.email || '-'}  → ${u.grund}`)
      }
    }
  }

  if (!ECHT) {
    console.log()
    console.log('Probelauf - es wurde nichts geändert.')
    console.log('Zum Bereinigen erneut aufrufen mit  --echt')
    return
  }

  // ── Ausfuehren ────────────────────────────────────────────────────────────
  // Erst die Verweise umhaengen, dann loeschen. Andersherum zeigten die
  // Vorlagen zwischenzeitlich auf nichts.
  if (treffer > 0) {
    db.appState.set('staff_plan_settings', JSON.stringify({ ...settings, teams: teamsNeu }))
    console.log()
    console.log(`Team-Vorlagen aktualisiert (${treffer} Verweise).`)
  }
  let weg = 0
  for (const { weg: s } of loeschen) {
    db.staffMembers.delete(s.id)
    weg++
  }
  console.log(`${weg} Dubletten entfernt.`)
  console.log(`Mitarbeiter jetzt: ${db.staffMembers.list().length}`)
}

main()
