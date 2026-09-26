'use strict'
// ─────────────────────────────────────────────────────────────────────────────
// E-Mail-Adressen in Projektteams ergaenzen
//
//   node server/wartung/team-emails-ergaenzen.js          Probelauf
//   node server/wartung/team-emails-ergaenzen.js --echt    ergaenzt
//
// ── Warum ───────────────────────────────────────────────────────────────────
// Die Sollbesetzung eines Projekts entsteht aus dem Projektteam: Sie sucht zu
// jedem Teammitglied den passenden Mitarbeiter - ueber den Namen ODER die
// E-Mail (siehe sollDaysFor in der Gelaende-Berechnung des Dashboards).
//
// Steht am Teammitglied keine E-Mail, bleibt nur der Namensvergleich. Der
// bricht, sobald jemand den Namen anders schreibt: ein zweiter Vorname, ein
// Bindestrich, ein Leerzeichen zu viel. Dann faellt die Person aus der
// Sollbesetzung heraus, ohne dass es auffaellt - das Projekt wirkt
// unterbesetzt.
//
// Dieses Werkzeug traegt die Adresse dort nach, wo sich die Person EINDEUTIG
// zuordnen laesst: genau ein Mitarbeiter mit diesem Namen und einer Adresse.
//
// ── Was es nicht tut ────────────────────────────────────────────────────────
//   * vorhandene Adressen ueberschreiben - was dasteht, bleibt
//   * raten, wenn zwei Mitarbeiter denselben Namen tragen; solche Faelle
//     werden gemeldet und gehoeren in die Kontaktdatenbank
//   * Namen aendern
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs')
const path = require('path')
const dbPfad = [
  path.join(__dirname, '..', 'db.js'),
  '/app/server/db.js',
  path.join(process.cwd(), 'server', 'db.js'),
].find(p => { try { return fs.existsSync(p) } catch { return false } })
if (!dbPfad) { console.error('db.js nicht gefunden'); process.exit(1) }
const db = require(dbPfad)

const ECHT = process.argv.includes('--echt') || process.env.BEREINIGEN === 'ja'
const norm = (s) => (s || '').trim().toLowerCase()

function main() {
  const staff = db.staffMembers.list()
  const projekte = db.projects.list()

  const aenderungen = []   // { projekt, neu, treffer: [{name, mail}] }
  const mehrdeutig = []
  const unbekannt = []
  let vorhanden = 0

  for (const p of projekte) {
    const team = p.team || []
    const treffer = []
    const neu = team.map(t => {
      if ((t.email || '').trim()) { vorhanden++; return t }
      const passend = staff.filter(s => norm(s.name) === norm(t.name) && (s.email || '').trim())
      if (passend.length === 1) {
        treffer.push({ name: t.name, mail: passend[0].email })
        return { ...t, email: passend[0].email }
      }
      if (passend.length > 1) mehrdeutig.push({ projekt: p.name, name: t.name, mails: passend.map(x => x.email) })
      else unbekannt.push({ projekt: p.name, name: t.name })
      return t
    })
    if (treffer.length > 0) aenderungen.push({ projekt: p, neu, treffer })
  }

  const ergaenzt = aenderungen.reduce((n, a) => n + a.treffer.length, 0)
  console.log(`Projekte: ${projekte.length}`)
  console.log(`  Teameintraege mit E-Mail (bleiben) : ${vorhanden}`)
  console.log(`  zu ergaenzen                       : ${ergaenzt}  in ${aenderungen.length} Projekten`)
  console.log(`  mehrdeutig (nicht anfassen)        : ${mehrdeutig.length}`)
  console.log(`  kein Mitarbeiter gefunden          : ${unbekannt.length}`)

  if (mehrdeutig.length > 0) {
    console.log()
    console.log('Mehrdeutig - gehoert in die Kontaktdatenbank:')
    const proName = new Map()
    for (const m of mehrdeutig) {
      if (!proName.has(m.name)) proName.set(m.name, { mails: m.mails, projekte: [] })
      proName.get(m.name).projekte.push(m.projekt)
    }
    for (const [name, d] of proName) {
      console.log(`  ${name}  ->  ${d.mails.join(' / ')}`)
      console.log(`      betrifft ${d.projekte.length} Projekt(e)`)
    }
  }
  if (unbekannt.length > 0) {
    console.log()
    console.log('Kein Mitarbeiter mit diesem Namen:')
    for (const u of unbekannt) console.log(`  ${u.name}  (${u.projekt})`)
  }

  if (!ECHT) {
    console.log()
    console.log('Probelauf - es wurde nichts geändert.')
    console.log('Zum Ergaenzen erneut aufrufen mit  --echt')
    return
  }

  let ok = 0, fehler = 0
  for (const a of aenderungen) {
    const r = db.projects.update(a.projekt.id,
      { ...a.projekt, team: a.neu, updatedAt: new Date().toISOString() },
      a.projekt._version, '__wartung__')
    if (r.conflict || r.notFound) { console.error(`  FEHLER bei ${a.projekt.name}`); fehler++; continue }
    ok += a.treffer.length
  }
  console.log()
  console.log(`${ok} E-Mail-Adressen ergaenzt in ${aenderungen.length - fehler} Projekten.`)
  if (fehler > 0) console.log(`${fehler} Projekt(e) uebersprungen - erneut ausfuehren.`)
}

main()
