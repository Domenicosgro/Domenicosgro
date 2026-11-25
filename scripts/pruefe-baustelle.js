/**
 * Prueft die Baustellen-Fassade (server/baustelle.js) gegen eine nachgebildete
 * Datenbank - ohne NAS, ohne SQLite, ohne Browser.
 *
 * Hintergrund: Diese Fassade ist der Teil der Anwendung, der eines Tages nach
 * aussen gelegt werden soll. Dann entscheidet sie allein darueber, was ein
 * Handy aus der Projektdatenbank herausholen und hineinschreiben kann. Deshalb
 * prueft dieser Lauf vor allem Grenzen: dass keine Kontakte und keine
 * Projektdaten mitgehen, dass ein Bericht keine fremden Felder ueberschreibt,
 * dass ein doppelt gesendeter Bericht nicht zweimal im Buero steht und dass
 * der Vermerk der Fotoablage nicht verloren geht.
 *
 * Aufruf:  npm run pruefe:baustelle
 * Ergebnis: Rueckgabewert 1 bei Fehlern, sonst 0.
 */
'use strict'
const express = require('express')
const { registerBaustelle } = require('../server/baustelle')

let fehler = 0
const pruefe = (name, ok, extra = '') => {
  console.log((ok ? '  ok   ' : '  FEHL ') + name + (ok ? '' : '  -> ' + extra))
  if (!ok) fehler++
}

const tagVor = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)
const heute  = () => new Date().toISOString().slice(0, 10)

// ── Nachgebildete Datenbank ──────────────────────────────────────────────────
const projekte = [
  {
    id: 'P1', name: 'Halle Nord', fsPath: '/Projekte/1234 Halle Nord',
    fsFotoPath: '02 Planung/02 LP 8/02 Baustellenfotos_Bautagebuch',
    projectData: {
      nummer: '1234',
      bauherr: { city: 'Krefeld', street: 'Musterweg 1', phone: '02151 0000' },
      vertrag: 'Objektueberwachung, 140.000 EUR',
    },
    contacts: [{ name: 'Herr Meier', email: 'meier@example.com', phone: '0170 0000' }],
  },
  { id: 'P2', name: 'Ohne Fotoordner', fsPath: '/Projekte/999 Alt', projectData: { nummer: '999' } },
  { id: 'P3', name: 'Archiviert', isArchived: true, projectData: {} },
  { id: 'P4', name: 'Kein Zugang', isAccessControlled: true, allowedUsers: ['andere'], projectData: {} },
]

const eintraege = new Map()
const setze = (e) => eintraege.set(e.id, e)

setze({
  id: 'E1', projectId: 'P1', date: tagVor(1), daytime: 'vormittag', weather: 'regen',
  tempMin: 3, tempMax: 9, _version: 2,
  createdBy: 'Domenico Sgro', createdAt: new Date(Date.now() - 86400000).toISOString(),
  workItems: [{ id: 'w1', html: '<p>Bewehrung Achse C</p><p>Schalung Achse D</p>' }],
  workDone: '<p>Bewehrung Achse C</p>',
  remarks: '<p>Kran stand bis 10 Uhr still</p>',
  // Felder, die nur das Buero erfasst - die Fassade darf sie nicht anfassen
  obstructions: '<p>Behinderung: Starkregen</p>',
  inspections: '<p>Abnahme Bewehrung</p>',
  inspectedBy: 'Prueferin',
  firmList: [{ id: 'f1', company: 'Rohbau GmbH', gewerk: 'Rohbau', workers: 6, person: '', work: '' }],
  photos: [
    { id: 'foto-eins', name: 'IMG_1.JPG', caption: 'Achse C', fsPath: '/Projekte/1234 Halle Nord/…/Foto 01.jpg', fsStatus: 'ok' },
    { id: 'foto-zwei', name: 'IMG_2.JPG', caption: '' },
  ],
})
setze({
  id: 'E2', projectId: 'P1', date: tagVor(2), _version: 1,
  createdBy: 'Sabine Beispiel', createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
  workItems: [{ id: 'w1', html: '<p>Fremder Bericht</p>' }], photos: [],
})
setze({
  id: 'E3', projectId: 'P1', date: tagVor(3), _version: 1,
  createdBy: 'Domenico Sgro', createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
  workItems: [{ id: 'w1', html: '<ul><li>Im Buero formatiert</li></ul>' }], photos: [],
})
setze({
  id: 'E4', projectId: 'P1', date: tagVor(40), _version: 1,
  createdBy: 'Domenico Sgro', createdAt: new Date(Date.now() - 40 * 86400000).toISOString(),
  workItems: [], photos: [],
})

const db = {
  projects: { list: () => projekte.map(p => JSON.parse(JSON.stringify(p))) },
  diaryEntries: {
    list: () => [...eintraege.values()].map(e => JSON.parse(JSON.stringify(e))),
    get:  (id) => { const e = eintraege.get(id); return e ? JSON.parse(JSON.stringify(e)) : null },
    create: (daten) => { setze({ ...daten, _version: 1 }); return { version: 1 } },
    update: (id, daten, version) => {
      const e = eintraege.get(id)
      if (!e) return { notFound: true }
      if (e._version !== version) return { conflict: true, serverVersion: e._version }
      setze({ ...daten, id, _version: version + 1 })
      return { version: version + 1 }
    },
  },
}

// ── Nachgebildeter Anhang-Speicher ───────────────────────────────────────────
const anhaenge = new Map()
const attachments = {
  async save(id, data) { anhaenge.set(id, data) },
  async load(id) { return anhaenge.get(id) || null },
  async exists(id) { return anhaenge.has(id) },
}

const validAttachmentId = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(id)

// ── Server ───────────────────────────────────────────────────────────────────
let nutzer = 'ds'
const anzeigename = { ds: 'Domenico Sgro', sb: 'Sabine Beispiel' }

const app = express()
app.use(express.json({ limit: '20mb' }))

registerBaustelle(app, {
  db, attachments, validAttachmentId,
  requireAuth: (req, _res, next) => { req.user = nutzer; next() },
  writeLimiter: (_req, _res, next) => next(),
  getAccessibleProject: (req, res) => {
    const p = projekte.find(x => x.id === req.params.id)
    if (!p) { res.status(404).json({ error: 'Projekt nicht gefunden.' }); return null }
    if (p.isAccessControlled && !(p.allowedUsers || []).includes(req.user)) {
      res.status(403).json({ error: 'Kein Zugriff auf dieses Projekt.' }); return null
    }
    return JSON.parse(JSON.stringify(p))
  },
  canAccessProject: (p, user) => !p.isAccessControlled || (p.allowedUsers || []).includes(user),
  logEvent: () => {}, broadcast: () => {},
  displayName: (u) => anzeigename[u] || u,
  wetterHandler: (req, res) => res.json({ weather: 'regen', tempMin: 4, tempMax: 11, date: req.query.date, location: 'Krefeld' }),
})

const server = app.listen(0, async () => {
  const basis = `http://127.0.0.1:${server.address().port}/api/baustelle`
  const hole = async (url, opt) => {
    const r = await fetch(url, opt)
    return { status: r.status, body: await r.json().catch(() => null) }
  }
  const sende = (url, daten, method = 'POST') => hole(url, {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(daten),
  })

  try {
    console.log('\n1) Projektliste: schmal und nur mit Zugang')
    const pl = await hole(`${basis}/projekte`)
    const namen = (pl.body || []).map(p => p.name)
    pruefe('200', pl.status === 200)
    pruefe('Halle Nord dabei', namen.includes('Halle Nord'), JSON.stringify(namen))
    pruefe('Archiviertes fehlt', !namen.includes('Archiviert'))
    pruefe('Projekt ohne Zugang fehlt', !namen.includes('Kein Zugang'))
    const roh = JSON.stringify(pl.body)
    pruefe('kein Bauherr, keine Kontakte, kein Vertrag',
      !/bauherr|contacts|vertrag|Musterweg|meier@|140\.000/i.test(roh), roh.slice(0, 300))
    const p1 = pl.body.find(p => p.id === 'P1')
    pruefe('Fotoordner gemeldet', p1.fotoordner === true)
    pruefe('Ort fuer die Wetterabfrage dabei', p1.ort === 'Krefeld')
    pruefe('letzter Bericht gemeldet', p1.letzterBericht === tagVor(1), p1.letzterBericht)
    pruefe('Projekt ohne Fotoordner markiert',
      pl.body.find(p => p.id === 'P2').fotoordner === false)

    console.log('\n2) Berichte lesen: Fliesstext, Fenster, Sperrgruende')
    const bl = await hole(`${basis}/projekte/P1/berichte`)
    const ids = (bl.body.berichte || []).map(b => b.id)
    pruefe('E1 bis E3 dabei', ids.includes('E1') && ids.includes('E2') && ids.includes('E3'), JSON.stringify(ids))
    pruefe('alter Bericht (40 Tage) nicht dabei', !ids.includes('E4'))
    const e1 = bl.body.berichte.find(b => b.id === 'E1')
    pruefe('Arbeiten als Fliesstext', e1.arbeiten[0] === 'Bewehrung Achse C\nSchalung Achse D', JSON.stringify(e1.arbeiten))
    pruefe('kein HTML im Ergebnis', !/[<>]/.test(JSON.stringify(e1.arbeiten) + e1.bemerkung))
    pruefe('eigener Bericht ist aenderbar', e1.meins === true && e1.nurBuero === null, String(e1.nurBuero))
    pruefe('Foto als abgelegt gemeldet', e1.fotos[0].abgelegt === true && e1.fotos[1].abgelegt === false)
    pruefe('fremder Bericht gesperrt', bl.body.berichte.find(b => b.id === 'E2').nurBuero === 'fremd')
    pruefe('formatierter Bericht gesperrt', bl.body.berichte.find(b => b.id === 'E3').nurBuero === 'formatiert')
    pruefe('Behinderungen gehen nicht mit hinaus', !/Starkregen|Abnahme Bewehrung|Prueferin/.test(JSON.stringify(bl.body)))

    console.log('\n3) Bericht anlegen')
    const neu = await sende(`${basis}/projekte/P1/berichte`, {
      clientId: 'handy-1', date: heute(), daytime: 'nachmittag', weather: 'regen',
      tempMin: '4', tempMax: '11', progress: '35',
      arbeiten: ['Estrich EG', '  ', 'Fenster OG'],
      firmen: [{ company: 'Trockenbau KG', gewerk: 'Trockenbau', workers: '3' }, { company: '' }],
      bemerkung: 'Zufahrt gesperrt',
      besonderes: '',
      fotos: [{ id: 'neu-eins', name: 'IMG_9.JPG', caption: 'Estrich' }, { id: 'un gueltig', name: 'x.jpg' }],
    })
    pruefe('201', neu.status === 201, JSON.stringify(neu.body))
    const gespeichert = eintraege.get(neu.body.id)
    pruefe('Arbeiten als Absaetze abgelegt',
      gespeichert.workItems.length === 2 && gespeichert.workItems[0].html === '<p>Estrich EG</p>',
      JSON.stringify(gespeichert.workItems))
    pruefe('workDone bleibt gefuellt', gespeichert.workDone === '<p>Estrich EG</p><p>Fenster OG</p>')
    pruefe('leere Angabe verworfen', !gespeichert.workItems.some(w => w.html === '<p>  </p>'))
    pruefe('Firmen als Klartext mitgeschrieben',
      gespeichert.firms === 'Trockenbau KG (Trockenbau, 3 AK)', gespeichert.firms)
    pruefe('leere Firma verworfen', gespeichert.firmList.length === 1)
    pruefe('Herkunft vermerkt', gespeichert.source === 'baustelle')
    pruefe('Verfasser vermerkt', gespeichert.createdBy === 'Domenico Sgro')
    pruefe('Zahlen sind Zahlen', gespeichert.tempMin === 4 && gespeichert.progress === 35)
    pruefe('ungueltige Fotokennung verworfen',
      gespeichert.photos.length === 1 && gespeichert.photos[0].id === 'neu-eins',
      JSON.stringify(gespeichert.photos))

    console.log('\n4) Unbekannter Wetterwert wird nicht uebernommen')
    const wx = await sende(`${basis}/projekte/P1/berichte`, { clientId: 'handy-wx', weather: 'Hagelsturm' })
    pruefe('auf sonnig zurueckgefallen', eintraege.get(wx.body.id).weather === 'sonnig')

    console.log('\n5) Doppelt gesendet -> derselbe Bericht')
    const anzahlVorher = eintraege.size
    const noch = await sende(`${basis}/projekte/P1/berichte`, { clientId: 'handy-1', date: heute() })
    pruefe('200 statt 201', noch.status === 200, String(noch.status))
    pruefe('dieselbe Kennung', noch.body.id === neu.body.id)
    pruefe('kein zweiter Eintrag', eintraege.size === anzahlVorher)

    console.log('\n6) Eigenen Bericht aendern')
    const vers = eintraege.get('E1')._version
    const ae = await sende(`${basis}/projekte/P1/berichte/E1`, {
      version: vers, date: tagVor(1), daytime: 'vormittag', weather: 'regen',
      arbeiten: ['Bewehrung Achse C fertig'],
      bemerkung: 'Kran lief ab 10 Uhr',
      // Das Handy schickt eine aeltere Fotoliste ohne den Ablagevermerk
      fotos: [{ id: 'foto-eins', caption: 'Achse C' }, { id: 'foto-zwei', caption: 'Achse D' }],
    }, 'PATCH')
    pruefe('200', ae.status === 200, JSON.stringify(ae.body))
    const n1 = eintraege.get('E1')
    pruefe('Arbeiten ersetzt', n1.workItems[0].html === '<p>Bewehrung Achse C fertig</p>')
    pruefe('Ablagevermerk erhalten', n1.photos[0].fsPath && n1.photos[0].fsStatus === 'ok')
    pruefe('neue Bildunterschrift uebernommen', n1.photos[1].caption === 'Achse D')
    pruefe('Buerofelder unberuehrt',
      n1.obstructions === '<p>Behinderung: Starkregen</p>' && n1.inspectedBy === 'Prueferin',
      JSON.stringify({ o: n1.obstructions, i: n1.inspectedBy }))
    pruefe('Version erhoeht', n1._version === vers + 1)

    console.log('\n7) Was die Fassade nicht aendern darf')
    const fremd = await sende(`${basis}/projekte/P1/berichte/E2`, { version: 1, arbeiten: ['x'] }, 'PATCH')
    pruefe('fremder Bericht: 403', fremd.status === 403 && fremd.body.grund === 'fremd', JSON.stringify(fremd))
    const form = await sende(`${basis}/projekte/P1/berichte/E3`, { version: 1, arbeiten: ['x'] }, 'PATCH')
    pruefe('formatierter Bericht: 409', form.status === 409 && form.body.grund === 'formatiert', JSON.stringify(form))
    const alt = await sende(`${basis}/projekte/P1/berichte/E4`, { version: 1, arbeiten: ['x'] }, 'PATCH')
    pruefe('alter Bericht: 409', alt.status === 409 && alt.body.grund === 'alt', JSON.stringify(alt))
    const konflikt = await sende(`${basis}/projekte/P1/berichte/E1`, { version: 1, arbeiten: ['x'] }, 'PATCH')
    pruefe('veraltete Version: 409', konflikt.status === 409 && konflikt.body.grund === 'version', JSON.stringify(konflikt))
    const weg = await sende(`${basis}/projekte/P1/berichte/gibtsnicht`, { version: 1 }, 'PATCH')
    pruefe('unbekannter Bericht: 404', weg.status === 404)

    console.log('\n8) Bericht eines anderen Projekts')
    const quer = await sende(`${basis}/projekte/P2/berichte/E1`, { version: 3, arbeiten: ['x'] }, 'PATCH')
    pruefe('404 statt Zugriff ueber die Projektgrenze', quer.status === 404, JSON.stringify(quer))

    console.log('\n9) Kein Zugang zum Projekt')
    const kein = await hole(`${basis}/projekte/P4/berichte`)
    pruefe('403', kein.status === 403, JSON.stringify(kein))

    console.log('\n10) Anhaenge')
    const klein = Buffer.alloc(80 * 1024, 1).toString('base64')
    const ok1 = await sende(`${basis}/projekte/P1/anhang`, { id: 'neu-eins', data: klein })
    pruefe('kleine Fassung angenommen', ok1.status === 201 && anhaenge.has('neu-eins'), JSON.stringify(ok1))
    const nochmal = await sende(`${basis}/projekte/P1/anhang`, { id: 'neu-eins', data: klein })
    pruefe('zweite Sendung stoert nicht', nochmal.status === 200)
    const gross = await sende(`${basis}/projekte/P1/anhang`, { id: 'zu-gross', data: Buffer.alloc(2 * 1024 * 1024, 1).toString('base64') })
    pruefe('Original abgewiesen (413)', gross.status === 413, String(gross.status))
    const schlecht = await sende(`${basis}/projekte/P1/anhang`, { id: '../../etc/passwd', data: klein })
    pruefe('unsaubere Kennung abgewiesen', schlecht.status === 400)

    const lesen = await hole(`${basis}/projekte/P1/anhang/neu-eins`)
    pruefe('eigener Anhang lesbar', lesen.status === 200 && lesen.body.data === klein, String(lesen.status))
    anhaenge.set('fremd-eins', klein)
    const fremdAnhang = await hole(`${basis}/projekte/P1/anhang/fremd-eins`)
    pruefe('Anhang ohne Bericht: 404', fremdAnhang.status === 404, JSON.stringify(fremdAnhang))

    console.log('\n11) Wetter laeuft ueber denselben Griff')
    const w = await hole(`${basis}/projekte/P1/wetter?date=${heute()}&half=vormittag`)
    pruefe('Wetter geliefert', w.status === 200 && w.body.weather === 'regen', JSON.stringify(w.body))

    console.log('\n12) Die Fassade hat keine weiteren Routen')
    const verboten = []
    for (const [pfad, art] of [
      ['/projekte/P1/protokolle', 'GET'], ['/projekte/P1/kontakte', 'GET'],
      ['/projekte/P1/maengel', 'GET'], ['/projekte/P1/dateien', 'GET'],
      ['/projekte/P1/berichte/E1', 'DELETE'],
    ]) {
      const r = await hole(basis + pfad, { method: art })
      if (r.status !== 404) verboten.push(`${art} ${pfad} -> ${r.status}`)
    }
    pruefe('nichts ausser den gebauten Routen', verboten.length === 0, verboten.join(', '))

    console.log('\n13) Anderer Benutzer sieht denselben Bericht als fremd')
    nutzer = 'sb'
    const sicht = await hole(`${basis}/projekte/P1/berichte`)
    pruefe('E1 fuer Sabine gesperrt', sicht.body.berichte.find(b => b.id === 'E1').nurBuero === 'fremd')
    pruefe('E2 fuer Sabine aenderbar', sicht.body.berichte.find(b => b.id === 'E2').nurBuero === null)
    nutzer = 'ds'
  } catch (e) {
    console.log('\nABBRUCH: ' + e.stack)
    fehler++
  } finally {
    server.close()
    console.log(fehler === 0 ? '\n--- alles gruen' : `\n--- ${fehler} Fehler`)
    process.exit(fehler === 0 ? 0 : 1)
  }
})
