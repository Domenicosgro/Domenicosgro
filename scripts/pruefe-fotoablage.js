/**
 * Prueft die Fotoablage der Baudokumentation (server/bautagebuchFotos.js)
 * gegen eine nachgebildete File Station - ohne NAS, ohne Datenbank.
 *
 * Hintergrund: Diese Ablage schreibt in die Projektordner des Buero-Laufwerks.
 * Ein Fehler darin legt Dateien an der falschen Stelle ab oder doppelt, und
 * das sieht man erst Wochen spaeter. Deshalb ein Testlauf, der die Suche nach
 * dem Fotoordner, den Tagesordner, den Dateinamen, den Vermerk am Bericht und
 * das doppelte Senden nachstellt.
 *
 * Aufruf:  npm run pruefe:fotoablage
 * Ergebnis: Rueckgabewert 1 bei Fehlern, sonst 0.
 */
'use strict'
const express = require('express')
const ps = require('../server/pruefstation')
const { registerBautagebuchFotos, cleanRel } = require('../server/bautagebuchFotos')

let fehler = 0
const pruefe = (name, ok, extra = '') => {
  console.log((ok ? '  ok   ' : '  FEHL ') + name + (ok ? '' : '  -> ' + extra))
  if (!ok) fehler++
}

// ── Nachgebildete NAS ────────────────────────────────────────────────────────
const ROOT = '/Projekte/1234 Beispiel'
const baum = new Set([
  ROOT,
  ROOT + '/01 Grundlagen',
  ROOT + '/02 Planung',
  ROOT + '/02 Planung/01 LP 1-5',
  ROOT + '/02 Planung/02 LP 8',
  ROOT + '/02 Planung/02 LP 8/01 Bautagebuch',
  ROOT + '/02 Planung/02 LP 8/02 Baustellenfotos_Bautagebuch',
  ROOT + '/02 Planung/02 LP 8/02 Baustellenfotos_Bautagebuch/2026-11-20 Spatenstich',
  ROOT + '/03 Ausfuehrung',
])
const dateien = new Map()   // vollerPfad -> groesse
const typen   = new Map()   // vollerPfad -> mimeType
let listAufrufe = 0

const fileStation = {
  isConfigured: () => true,
  async listFolder(pfad) {
    listAufrufe++
    if (!baum.has(pfad)) throw new Error('Ordner nicht gefunden.')
    const kinder = []
    for (const p of baum) {
      if (p !== pfad && p.startsWith(pfad + '/') && !p.slice(pfad.length + 1).includes('/')) {
        kinder.push({ name: p.slice(pfad.length + 1), path: p, isdir: true })
      }
    }
    for (const p of dateien.keys()) {
      if (p.startsWith(pfad + '/') && !p.slice(pfad.length + 1).includes('/')) {
        kinder.push({ name: p.slice(pfad.length + 1), path: p, isdir: false, size: dateien.get(p) })
      }
    }
    return kinder
  },
  async createFolder(eltern, name) { baum.add(eltern + '/' + name); return eltern + '/' + name },
  async uploadFile(ziel, name, buffer, mimeType) {
    const p = ziel + '/' + name
    if (dateien.has(p)) throw new Error('existiert bereits')
    dateien.set(p, buffer.length)
    typen.set(p, mimeType)
    return p
  },
}

// ── Nachgebildete Datenbank ──────────────────────────────────────────────────
const projekt = { id: 'P1', name: 'Beispiel', fsPath: ROOT, fsFotoPath: '' }
const berichte = new Map()
berichte.set('E1', {
  id: 'E1', projectId: 'P1', date: '2026-11-20', _version: 3,
  photos: [
    { id: 'f1', name: 'IMG_0001.JPG', caption: 'Bewehrung Achse C' },
    { id: 'f2', name: 'IMG_0002.JPG', caption: '' },
  ],
})
const db = {
  diaryEntries: {
    get: (id) => { const e = berichte.get(id); return e ? JSON.parse(JSON.stringify(e)) : null },
    update: (id, daten, version) => {
      const e = berichte.get(id)
      if (!e) return { notFound: true }
      if (e._version !== version) return { conflict: true, serverVersion: e._version }
      berichte.set(id, { ...daten, _version: version + 1 })
      return { version: version + 1 }
    },
  },
}

const app = express()
app.use(express.json())
registerBautagebuchFotos(app, {
  db, fileStation,
  requireAuth: (req, _res, next) => { req.user = 'ds'; next() },
  writeLimiter: (_req, _res, next) => next(),
  getAccessibleProject: (_req, _res) => projekt,
  isProjectManager: () => true,
  logEvent: () => {}, broadcast: () => {},
  cleanName: ps.cleanName, uniqueName: ps.uniqueName,
  displayName: () => 'Domenico Sgro',
})

const server = app.listen(0, async () => {
  const basis = `http://127.0.0.1:${server.address().port}/api/projects/P1/bautagebuch`
  const hole = async (url, opt) => { const r = await fetch(url, opt); return { status: r.status, body: await r.json().catch(() => null) } }
  const sendeFoto = (entryId, fotoId, name, bytes) => hole(
    `${basis}/${entryId}/fotos?fotoId=${encodeURIComponent(fotoId)}&name=${encodeURIComponent(name)}`,
    { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: Buffer.alloc(bytes, 7) })

  try {
    console.log('\n1) Relativer Pfad pruefen')
    pruefe('normaler Pfad', cleanRel('02 Planung/02 LP 8/02 Baustellenfotos_Bautagebuch') === '02 Planung/02 LP 8/02 Baustellenfotos_Bautagebuch')
    pruefe('fuehrende Schraegstriche weg', cleanRel('/a/b/') === 'a/b')
    pruefe('Ausbruch abgewiesen', cleanRel('a/../../etc') === null)
    pruefe('leer abgewiesen', cleanRel('   ') === null)
    pruefe('Doppelpunkt abgewiesen', cleanRel('a/b:c') === null)

    console.log('\n2) Fotoordner suchen')
    listAufrufe = 0
    const v = await hole(`${basis}/fotoordner`)
    const erster = v.body?.vorschlaege?.[0]
    pruefe('Vorschlag gefunden', erster?.rel === '02 Planung/02 LP 8/02 Baustellenfotos_Bautagebuch', JSON.stringify(v.body))
    pruefe('Bautagebuch-Ordner steht dahinter',
      (v.body.vorschlaege || []).some(x => x.rel.endsWith('01 Bautagebuch')) &&
      v.body.vorschlaege[0].rel.endsWith('02 Baustellenfotos_Bautagebuch'))
    pruefe('Suche bleibt sparsam (' + listAufrufe + ' Aufrufe)', listAufrufe <= 10)

    console.log('\n3) Ohne hinterlegten Ordner wird nichts abgelegt')
    const ohne = await sendeFoto('E1', 'f1', 'IMG_0001.JPG', 1000)
    pruefe('409 + Grund fotoordner', ohne.status === 409 && ohne.body.grund === 'fotoordner', JSON.stringify(ohne))

    // Ordner hinterlegen (im Betrieb ueber die Projektdaten)
    projekt.fsFotoPath = erster.rel

    console.log('\n4) Foto ablegen')
    const a = await sendeFoto('E1', 'f1', 'IMG_0001.JPG', 6 * 1024 * 1024)
    pruefe('201', a.status === 201, JSON.stringify(a))
    pruefe('Tagesordner wiederverwendet (mit Zusatz im Namen)',
      a.body.pfad === ROOT + '/02 Planung/02 LP 8/02 Baustellenfotos_Bautagebuch/2026-11-20 Spatenstich/2026-11-20 Foto 01 Bewehrung Achse C.jpg',
      a.body.pfad)
    pruefe('Nummer = Stelle im Bericht', a.body.nr === 1)
    const e1 = berichte.get('E1')
    pruefe('Vermerk am Foto', e1.photos[0].fsStatus === 'ok' && e1.photos[0].fsPath === a.body.pfad)
    pruefe('Originalgroesse vermerkt', e1.photos[0].originalSize === 6 * 1024 * 1024)
    pruefe('zweites Foto unberuehrt', !e1.photos[1].fsPath)
    pruefe('Version erhoeht', e1._version === 4)

    console.log('\n5) Zweites Foto ohne Bildunterschrift')
    const b = await sendeFoto('E1', 'f2', 'IMG_0002.jpeg', 5000)
    pruefe('Name ohne Beschriftung', b.body.pfad.endsWith('/2026-11-20 Foto 02.jpeg'), b.body.pfad)

    console.log('\n6) Doppelt gesendet -> keine zweite Datei')
    const anzahlVorher = dateien.size
    const c = await sendeFoto('E1', 'f1', 'IMG_0001.JPG', 6 * 1024 * 1024)
    pruefe('als bereits abgelegt gemeldet', c.status === 200 && c.body.bereits === true, JSON.stringify(c))
    pruefe('keine Doppeldatei', dateien.size === anzahlVorher)

    console.log('\n7) Neuer Berichtstag -> Tagesordner wird angelegt')
    berichte.set('E2', { id: 'E2', projectId: 'P1', date: '2026-11-21', _version: 1, photos: [{ id: 'g1', name: 'a.heic', caption: 'Schalung' }] })
    const d = await sendeFoto('E2', 'g1', 'a.heic', 2000)
    pruefe('Ordner 2026-11-21 angelegt', baum.has(ROOT + '/02 Planung/02 LP 8/02 Baustellenfotos_Bautagebuch/2026-11-21'))
    pruefe('Dateiname', d.body.pfad.endsWith('/2026-11-21/2026-11-21 Foto 01 Schalung.heic'), d.body.pfad)
    pruefe('Bildtyp aus der Endung', typen.get(d.body.pfad) === 'image/heic', typen.get(d.body.pfad))

    console.log('\n8) Fremdes Foto / fremder Bericht')
    const x = await sendeFoto('E1', 'gibtsnicht', 'x.jpg', 100)
    pruefe('404 bei fremder Foto-Id', x.status === 404, JSON.stringify(x))
    const y = await sendeFoto('E9', 'f1', 'x.jpg', 100)
    pruefe('404 bei fremdem Bericht', y.status === 404, JSON.stringify(y))

    console.log('\n9) Leerer Rumpf')
    const z = await hole(`${basis}/E1/fotos?fotoId=f2&name=leer.jpg`,
      { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: Buffer.alloc(0) })
    pruefe('400 bei leerer Datei', z.status === 400, JSON.stringify(z))

    console.log('\n10) Ordner neu anlegen')
    const n = await hole(`${basis}/fotoordner`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rel: '02 Planung/02 LP 8/09 Neue Fotos' }),
    })
    pruefe('201 + relativer Pfad', n.status === 201 && n.body.rel === '02 Planung/02 LP 8/09 Neue Fotos', JSON.stringify(n))
    pruefe('Ordner liegt auf der NAS', baum.has(ROOT + '/02 Planung/02 LP 8/09 Neue Fotos'))
    const n2 = await hole(`${basis}/fotoordner`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rel: '../ausbruch' }),
    })
    pruefe('Ausbruch abgewiesen', n2.status === 400, JSON.stringify(n2))

    console.log('\n11) Hinterlegter Ordner wird gemeldet, ohne neu zu suchen')
    const m = await hole(`${basis}/fotoordner`)
    pruefe('vorhanden=true, keine Vorschlaege', m.body.vorhanden === true && m.body.vorschlaege.length === 0, JSON.stringify(m.body))
    pruefe('rel gemeldet', m.body.rel === projekt.fsFotoPath)

    console.log('\n12) Vermerk-Konflikt: Datei liegt, Bericht wurde geaendert')
    berichte.set('E3', { id: 'E3', projectId: 'P1', date: '2026-11-22', _version: 1, photos: [{ id: 'h1', name: 'k.jpg', caption: '' }] })
    const echtesUpdate = db.diaryEntries.update
    db.diaryEntries.update = () => ({ conflict: true, serverVersion: 99 })
    const k = await sendeFoto('E3', 'h1', 'k.jpg', 1234)
    db.diaryEntries.update = echtesUpdate
    pruefe('trotzdem 201 (Datei liegt auf der NAS)', k.status === 201, JSON.stringify(k))
    pruefe('Datei wirklich da', dateien.has(k.body.pfad))
  } catch (e) {
    console.log('\nABBRUCH: ' + e.stack)
    fehler++
  } finally {
    server.close()
    console.log(fehler === 0 ? '\n--- alles gruen' : `\n--- ${fehler} Fehler`)
    process.exit(fehler === 0 ? 0 : 1)
  }
})
