/**
 * Prueft den Rueckkanal zwischen Massnahmen und Maengeln (server/maengel.js).
 *
 * Hintergrund: Ein Mangel wird zur Massnahme mit Frist und Zustaendigem. Bis
 * zum 26.11.2026 lief der Zustand nur in eine Richtung – meldete die Firma die
 * Massnahme frei, blieb der Mangel auf "offen". Die Maengelliste, die bis zur
 * Abnahme gefuehrt wird, lief damit auseinander.
 *
 * Geprueft wird deshalb vor allem, was NICHT passieren darf: ein abgenommener
 * Mangel wird nie wieder angefasst, "verschoben" ist kein Zustand, und
 * behoben ist ein Mangel erst, wenn ALLE seine Massnahmen erledigt sind.
 *
 * Aufruf:  npm run pruefe:maengel
 * Ergebnis: Rueckgabewert 1 bei Fehlern, sonst 0.
 */
'use strict'
const { mangelSpiegel } = require('../server/maengel')

let fehler = 0
const pruefe = (name, ok, extra = '') => {
  console.log((ok ? '  ok   ' : '  FEHL ') + name + (ok ? '' : '  -> ' + extra))
  if (!ok) fehler++
}

// ── Nachgebildete Datenbank ──────────────────────────────────────────────────
let protokolle = new Map()
let maengel    = new Map()
let schreibt   = 0          // Zaehler: wie oft wirklich geschrieben wurde
let ereignisse = []

const tief = (x) => JSON.parse(JSON.stringify(x))

const db = {
  protocols: {
    get:  (id) => (protokolle.has(id) ? tief(protokolle.get(id)) : null),
    list: () => [...protokolle.values()].map(tief),
  },
  defects: {
    get: (id) => (maengel.has(id) ? tief(maengel.get(id)) : null),
    update: (id, daten, version, by) => {
      const m = maengel.get(id)
      if (!m) return { notFound: true }
      if (m._version !== version) return { conflict: true, serverVersion: m._version }
      schreibt++
      maengel.set(id, { ...daten, id, _version: version + 1, _letzterBy: by })
      return { version: version + 1 }
    },
  },
}

const spiegle = mangelSpiegel({
  db,
  broadcast: (art, was, id) => ereignisse.push(`${art}:${was}:${id}`),
  logEvent: () => {},
  displayName: (u) => ({ ds: 'Domenico Sgro' }[u] || u),
})

// ── Aufbau ───────────────────────────────────────────────────────────────────
function aufbauen() {
  protokolle = new Map()
  maengel    = new Map()
  schreibt   = 0
  ereignisse = []

  for (const [id, status] of [['M1', 'offen'], ['M2', 'offen'], ['M3', 'abgenommen'], ['M4', 'offen'], ['M5', 'offen']]) {
    maengel.set(id, {
      id, projectId: 'P1', no: Number(id.slice(1)), title: `Mangel ${id}`,
      status, dueDate: '2026-12-15', responsible: 'Rohbau GmbH', _version: 1,
    })
  }
  // Mangel eines anderen Projekts, aber mit derselben Kennung verlinkt
  maengel.set('F1', { id: 'F1', projectId: 'P9', title: 'fremdes Projekt', status: 'offen', _version: 1 })

  protokolle.set('PR1', {
    id: 'PR1', projectId: 'P1', _version: 1,
    actionItems: [
      { id: 'a1', status: 'erledigt',   defectId: 'M1', deadline: '2026-12-01' },
      { id: 'a2', status: 'in_arbeit',  defectId: 'M2' },
      { id: 'a3', status: 'offen',      defectId: 'M3' },      // abgenommen – tabu
      { id: 'a4', status: 'verschoben', defectId: 'M4' },      // kein Zustand
      { id: 'a5', status: 'erledigt',   defectId: 'M5' },      // zweite Maßnahme in PR2
      { id: 'a6', status: 'erledigt',   defectId: 'F1' },      // anderes Projekt
      { id: 'a7', status: 'offen' },                            // ohne Mangelbezug
    ],
  })
  protokolle.set('PR2', {
    id: 'PR2', projectId: 'P1', _version: 1,
    actionItems: [{ id: 'b1', status: 'offen', defectId: 'M5' }],
  })
  protokolle.set('PR3', { id: 'PR3', projectId: 'P1', _version: 1, actionItems: [{ id: 'c1', status: 'offen' }] })
}

try {
  console.log('\n1) Zustand folgt der Maßnahme')
  aufbauen()
  const n = spiegle('PR1', 'ds')
  pruefe('erledigt → behoben', maengel.get('M1').status === 'behoben', maengel.get('M1').status)
  pruefe('in Arbeit → in Arbeit', maengel.get('M2').status === 'in_arbeit', maengel.get('M2').status)
  pruefe('Quelle am Mangel vermerkt', maengel.get('M1').statusQuelle === 'massnahme')
  pruefe('wer und wann vermerkt',
    maengel.get('M1').statusDurch === 'Domenico Sgro' && !!maengel.get('M1').statusAm,
    JSON.stringify({ d: maengel.get('M1').statusDurch, a: maengel.get('M1').statusAm }))
  pruefe('Version erhöht', maengel.get('M1')._version === 2)
  pruefe('Ereignis gemeldet', ereignisse.includes('defect:update:M1'), ereignisse.join(','))

  console.log('\n2) Was nicht angefasst werden darf')
  pruefe('abgenommener Mangel bleibt abgenommen', maengel.get('M3').status === 'abgenommen')
  pruefe('„verschoben" ändert nichts', maengel.get('M4').status === 'offen')
  pruefe('Mangel eines anderen Projekts bleibt unberührt', maengel.get('F1').status === 'offen')
  pruefe('Frist am Mangel unverändert', maengel.get('M1').dueDate === '2026-12-15', maengel.get('M1').dueDate)
  pruefe('Zuständiger unverändert', maengel.get('M1').responsible === 'Rohbau GmbH')
  // Geschrieben wird nur bei echter Aenderung: M1 (behoben) und M2 (in Arbeit).
  // M5 soll "offen" werden und ist es schon, M3/M4/F1 sind tabu.
  pruefe('nur die zwei nötigen Schreibvorgänge', schreibt === 2, String(schreibt))
  pruefe('Rückgabe zählt die Änderungen', n === 2, String(n))

  console.log('\n3) Mehrere Maßnahmen zu einem Mangel')
  pruefe('eine offen, eine erledigt → bleibt offen', maengel.get('M5').status === 'offen', maengel.get('M5').status)
  // Jetzt auch die zweite erledigen
  const pr2 = protokolle.get('PR2')
  pr2.actionItems[0].status = 'erledigt'
  protokolle.set('PR2', pr2)
  spiegle('PR2', 'ds')
  pruefe('alle erledigt → behoben', maengel.get('M5').status === 'behoben', maengel.get('M5').status)

  console.log('\n4) Zurück nach „offen" (abgelehnte Freimeldung)')
  const pr1 = protokolle.get('PR1')
  pr1.actionItems[0].status = 'offen'
  protokolle.set('PR1', pr1)
  spiegle('PR1', 'ds')
  pruefe('behoben → offen', maengel.get('M1').status === 'offen', maengel.get('M1').status)

  console.log('\n5) Ein abgenommener Mangel bleibt auch später tabu')
  const m5 = maengel.get('M5')
  maengel.set('M5', { ...m5, status: 'abgenommen' })
  const pr2b = protokolle.get('PR2')
  pr2b.actionItems[0].status = 'offen'
  protokolle.set('PR2', pr2b)
  spiegle('PR2', 'ds')
  pruefe('bleibt abgenommen', maengel.get('M5').status === 'abgenommen', maengel.get('M5').status)

  console.log('\n6) Protokoll ohne Mangelbezug: kein Aufwand')
  schreibt = 0
  const vorher = ereignisse.length
  const k = spiegle('PR3', 'ds')
  pruefe('nichts geschrieben', schreibt === 0 && k === 0)
  pruefe('kein Ereignis', ereignisse.length === vorher)

  console.log('\n7) Gleicher Zustand: kein Schreibvorgang')
  aufbauen()
  spiegle('PR1', 'ds')
  const standM2 = maengel.get('M2')._version
  schreibt = 0
  spiegle('PR1', 'ds')
  pruefe('zweiter Durchlauf schreibt nicht', schreibt === 0, String(schreibt))
  pruefe('Version unverändert', maengel.get('M2')._version === standM2)

  console.log('\n8) Fehler dürfen das Speichern nicht aufhalten')
  const echt = db.defects.update
  db.defects.update = () => { throw new Error('Datenbank weg') }
  let geworfen = false
  try {
    const pr = protokolle.get('PR1'); pr.actionItems[1].status = 'erledigt'; protokolle.set('PR1', pr)
    spiegle('PR1', 'ds')
  } catch { geworfen = true }
  db.defects.update = echt
  pruefe('keine Ausnahme nach außen', !geworfen)

  const unbekannt = spiegle('gibtsnicht', 'ds')
  pruefe('unbekanntes Protokoll: 0', unbekannt === 0)
} catch (e) {
  console.log('\nABBRUCH: ' + e.stack)
  fehler++
}

console.log(fehler === 0 ? '\n--- alles gruen' : `\n--- ${fehler} Fehler`)
process.exit(fehler === 0 ? 0 : 1)
