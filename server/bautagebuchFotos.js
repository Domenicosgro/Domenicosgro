'use strict'

// ── Baudokumentation: Originalfotos im Projektordner ablegen ──────────────────
//
// Im Bericht steht eine verkleinerte Fassung jedes Fotos (120 KB, 1200 px –
// photoUtils.js), damit der Bericht als PDF versandfähig bleibt. Das Original
// vom Handy oder aus der Kamera gehört aber in den Projektordner auf der NAS,
// in voller Auflösung, dorthin, wo das Büro Baustellenfotos ohnehin sucht.
//
// Die Ablage folgt der Ordnung, die es in den Projekten längst gibt:
//
//   <Projektordner>/<Fotoordner>/2026-11-21/2026-11-21 Foto 01 Bewehrung.jpg
//
// Der Fotoordner heißt in jedem Projekt gleich – „… Baustellenfotos_Bautagebuch"
// unter „02 Planung / 02 LP 8" –, nur die vorangestellte Nummer wechselt von
// Projekt zu Projekt (01, 02, 03, 04 …). Deshalb wird er NICHT geraten:
// `GET …/fotoordner` sucht ihn und schlägt vor, hinterlegt wird er einmal je
// Projekt in `project.fsFotoPath` (relativ zu `project.fsPath`).
//
// Hochgeladen wird der Rohdatenstrom (application/octet-stream), nicht base64
// in JSON – base64 bläht ein 6-MB-Foto auf 8 MB auf, und zwanzig davon in einem
// Rumpf bringt keine Baustellenverbindung durch. Vorbild: pruefstation.js.
//
// Voraussetzung: dasselbe Service-Konto wie die Prüfstation
// (SYNOLOGY_FS_USER/SYNOLOGY_FS_PASS) mit Schreibrecht auf die Projektordner.

const express = require('express')

// Namen, an denen der Fotoordner erkannt wird – je eindeutiger, desto höher
// die Punktzahl. Der Vorschlag mit der höchsten Punktzahl steht oben.
const FOTO_MUSTER = [
  { re: /baustellenfotos[\s_-]*bautagebuch/i, punkte: 100 },
  { re: /baustellenfotos/i,                   punkte: 80  },
  { re: /bautagebuch/i,                       punkte: 60  },
  { re: /^[\d\s._-]*fotos?$/i,                punkte: 40  },
]

// In diese Ordner wird hineingesehen (ab der zweiten Ebene). Ohne Filter
// würde die Suche den ganzen Projektordner durchlaufen – jede Ebene ist ein
// eigener API-Aufruf an die File Station.
const WEITER_SUCHEN = /planung|lp\s*_?\s*8|objekt|bau|foto|dokument/i

const MAX_AUFRUFE = 40   // Obergrenze für die Suche, damit die NAS nicht blockiert
const MAX_TIEFE    = 3   // „02 Planung / 02 LP 8 / 02 Baustellenfotos_Bautagebuch"

// Relativer Pfad unter dem Projektordner: keine Ausbrüche, keine Steuerzeichen.
function cleanRel(rel) {
  const s = String(rel || '').trim().replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/^\/+|\/+$/g, '')
  if (!s || s.length > 512) return null
  if (/[\u0000-\u001f:*?"<>|]/.test(s)) return null
  if (s.split('/').some(seg => !seg || seg === '.' || seg === '..')) return null
  return s
}

function registerBautagebuchFotos(app, deps) {
  const { db, fileStation, requireAuth, writeLimiter, getAccessibleProject,
          isProjectManager, logEvent, broadcast, cleanName, uniqueName, displayName } = deps

  function nichtKonfiguriert(res) {
    if (fileStation.isConfigured()) return false
    res.status(400).json({ error: 'Dateiablage nicht konfiguriert – SYNOLOGY_FS_USER/SYNOLOGY_FS_PASS in der docker-compose.yml setzen.' })
    return true
  }

  // Projektordner (Pflicht) und Fotoordner (optional) eines Projekts
  function ordner(project) {
    const root = String(project.fsPath || '').replace(/\/+$/, '')
    if (!root.startsWith('/')) return { root: null, foto: null }
    const rel = cleanRel(project.fsFotoPath)
    return { root, rel, foto: rel ? `${root}/${rel}` : null }
  }

  // ── Fotoordner suchen ──────────────────────────────────────────────────────
  // Durchsucht den Projektordner bis zur dritten Ebene nach einem Ordner, der
  // nach Baustellenfotos aussieht. Liefert alle Treffer, bester zuerst.
  async function sucheFotoordner(root) {
    const treffer = []
    let aufrufe = 0

    async function gehe(pfad, tiefe) {
      if (aufrufe >= MAX_AUFRUFE) return
      aufrufe++
      let kinder
      try { kinder = await fileStation.listFolder(pfad) } catch { return }
      const unterordner = kinder.filter(f => f.isdir)
      for (const o of unterordner) {
        const m = FOTO_MUSTER.find(x => x.re.test(o.name))
        if (m) treffer.push({ pfad: `${pfad}/${o.name}`, name: o.name, tiefe: tiefe + 1, punkte: m.punkte })
      }
      for (const o of unterordner) {
        const kindTiefe = tiefe + 1
        if (kindTiefe >= MAX_TIEFE) continue
        if (kindTiefe > 1 && !WEITER_SUCHEN.test(o.name)) continue
        await gehe(`${pfad}/${o.name}`, kindTiefe)
      }
    }

    await gehe(root, 0)
    return treffer
      .sort((a, b) => b.punkte - a.punkte || a.tiefe - b.tiefe || a.pfad.localeCompare(b.pfad, 'de'))
      .slice(0, 8)
      .map(t => ({ name: t.name, rel: t.pfad.slice(root.length + 1) }))
  }

  // Hinterlegter Fotoordner + Vorschläge. Reiner Lesezugriff.
  app.get('/api/projects/:id/bautagebuch/fotoordner', requireAuth, async (req, res) => {
    try {
      const project = getAccessibleProject(req, res)
      if (!project) return
      if (nichtKonfiguriert(res)) return
      const o = ordner(project)
      if (!o.root) {
        return res.json({
          fsPath: '', rel: '', vorhanden: false, vorschlaege: [],
          hinweis: 'Für dieses Projekt ist kein NAS-Projektordner hinterlegt. Das geschieht in der Dateiablage.',
        })
      }
      // Hinterlegter Ordner: nachsehen, ob er noch da ist
      let vorhanden = false
      if (o.foto) {
        try { await fileStation.listFolder(o.foto); vorhanden = true } catch { vorhanden = false }
      }
      const vorschlaege = o.rel && vorhanden ? [] : await sucheFotoordner(o.root)
      res.json({ fsPath: o.root, rel: o.rel || '', vorhanden, vorschlaege })
    } catch (e) { res.status(502).json({ error: e.message }) }
  })

  // Fotoordner neu anlegen (wenn die Suche keinen findet). Legt nur den Ordner
  // an und gibt den relativen Pfad zurück – hinterlegt wird er wie der
  // Projektordner über die Projektdaten.
  app.post('/api/projects/:id/bautagebuch/fotoordner', requireAuth, writeLimiter, async (req, res) => {
    try {
      const project = getAccessibleProject(req, res)
      if (!project) return
      if (nichtKonfiguriert(res)) return
      if (!isProjectManager(project, req.user)) {
        return res.status(403).json({ error: 'Nur Projekt-Admins dürfen Ordner auf der NAS anlegen.' })
      }
      const o = ordner(project)
      if (!o.root) return res.status(400).json({ error: 'Kein NAS-Projektordner hinterlegt.' })
      const rel = cleanRel(req.body?.rel)
      if (!rel) return res.status(400).json({ error: 'Kein gültiger Ordnerpfad angegeben.' })
      const teile  = rel.split('/')
      const name   = cleanName(teile.pop(), 'Baustellenfotos')
      const eltern = [o.root, ...teile].join('/')
      await fileStation.createFolder(eltern, name)
      const neuRel = [...teile, name].join('/')
      logEvent('BTB_FOTOORDNER', req, `project=${project.id} rel=${neuRel}`)
      res.status(201).json({ rel: neuRel })
    } catch (e) { res.status(502).json({ error: e.message }) }
  })

  // ── Tagesordner ───────────────────────────────────────────────────────────
  // Je Berichtstag ein Ordner „2026-11-21". Gibt es ihn schon – auch mit
  // Zusatz im Namen wie „2026-11-21 Spatenstich" –, wird er genommen.
  async function tagesordner(fotoRoot, datum) {
    let inhalt
    try {
      inhalt = await fileStation.listFolder(fotoRoot)
    } catch (e) {
      throw new Error(`Fotoordner nicht lesbar (${fotoRoot}): ${e.message}`)
    }
    const da = inhalt.find(f => f.isdir && (f.name === datum || f.name.startsWith(`${datum} `)))
    if (da) return `${fotoRoot}/${da.name}`
    await fileStation.createFolder(fotoRoot, datum)
    return `${fotoRoot}/${datum}`
  }

  // Bildtyp aus der Endung – die Rohdaten kommen als octet-stream (daran
  // erkennt express.raw den Rumpf), die Endung sagt, was es wirklich ist.
  const BILD_TYPEN = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.heic': 'image/heic', '.heif': 'image/heif', '.webp': 'image/webp',
    '.tif': 'image/tiff', '.tiff': 'image/tiff', '.gif': 'image/gif',
  }

  // Dateiname: „2026-11-21 Foto 03 Bewehrung Achse C.jpg". Die Nummer ist die
  // Stelle des Fotos im Bericht – so findet man zu jedem Foto im PDF die
  // Originaldatei und umgekehrt.
  function dateiname(datum, nr, beschriftung, originalName) {
    const roh = String(originalName || '')
    const punkt = roh.lastIndexOf('.')
    let ext = punkt > 0 && roh.length - punkt <= 6 ? roh.slice(punkt).toLowerCase() : '.jpg'
    if (!/^\.[a-z0-9]{2,5}$/.test(ext)) ext = '.jpg'
    const text = String(beschriftung || '').replace(/\s+/g, ' ').trim().slice(0, 80)
    const nummer = String(nr).padStart(2, '0')
    return cleanName(`${datum} Foto ${nummer}${text ? ` ${text}` : ''}${ext}`, `${datum} Foto ${nummer}${ext}`)
  }

  // ── Original ablegen ──────────────────────────────────────────────────────
  // Rumpf = Rohdaten des Fotos. Query: fotoId (das Foto im Bericht), name
  // (Dateiname vom Gerät). Datum, Nummer und Bildunterschrift kommen aus dem
  // Bericht selbst – so kann die Ablage nicht vom Bericht abweichen.
  app.post('/api/projects/:id/bautagebuch/:entryId/fotos', requireAuth, writeLimiter,
    express.raw({ type: 'application/octet-stream', limit: '100mb' }),
    async (req, res) => {
      try {
        const project = getAccessibleProject(req, res)
        if (!project) return
        if (nichtKonfiguriert(res)) return

        const o = ordner(project)
        if (!o.root) return res.status(409).json({ error: 'Kein NAS-Projektordner hinterlegt.', grund: 'projektordner' })
        if (!o.foto) return res.status(409).json({ error: 'Für dieses Projekt ist kein Fotoordner hinterlegt – in der Baudokumentation festlegen.', grund: 'fotoordner' })

        const entry = db.diaryEntries.get(req.params.entryId)
        if (!entry || entry.projectId !== project.id) return res.status(404).json({ error: 'Bericht nicht gefunden.' })
        if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Leere Datei.' })

        const fotos = Array.isArray(entry.photos) ? entry.photos : []
        const i = fotos.findIndex(p => p && p.id === req.query.fotoId)
        if (i < 0) return res.status(404).json({ error: 'Foto gehört nicht zu diesem Bericht.' })
        const datum = /^\d{4}-\d{2}-\d{2}$/.test(entry.date || '') ? entry.date : new Date().toISOString().slice(0, 10)

        // Schon abgelegt (z. B. doppelt gesendete Warteschlange) – nichts tun
        if (fotos[i].fsPath) return res.json({ pfad: fotos[i].fsPath, bereits: true })

        const ziel      = await tagesordner(o.foto, datum)
        const vorhanden = (await fileStation.listFolder(ziel)).map(f => f.name)
        const name      = uniqueName(dateiname(datum, i + 1, fotos[i].caption, req.query.name), vorhanden)
        const endung    = name.slice(name.lastIndexOf('.')).toLowerCase()
        const pfad      = await fileStation.uploadFile(ziel, name, req.body, BILD_TYPEN[endung] || 'image/jpeg')

        // Ergebnis am Foto im Bericht vermerken. Der Server schreibt mit der
        // aktuellen Version – der Nutzer bearbeitet den Bericht in der Zeit
        // vielleicht weiter, und eine Ablage soll ihn nicht ausbremsen.
        const frisch = db.diaryEntries.get(entry.id)
        const liste  = (Array.isArray(frisch.photos) ? frisch.photos : []).map(p =>
          p && p.id === req.query.fotoId
            ? { ...p, fsPath: pfad, fsStatus: 'ok', fsAt: new Date().toISOString(),
                fsBy: displayName(req.user), originalSize: req.body.length }
            : p)
        const { _version, _updatedAt, ...daten } = frisch
        const ergebnis = db.diaryEntries.update(entry.id, { ...daten, photos: liste }, _version, req.user)
        if (ergebnis?.conflict) {
          // Der Bericht wurde gerade anderswo geändert. Die Datei liegt auf der
          // NAS; nur der Vermerk fehlt. Der Aufrufer darf das Foto als abgelegt
          // streichen – ein zweiter Versuch würde eine Doppeldatei anlegen.
          logEvent('BTB_FOTO_VERMERK', req, `project=${project.id} entry=${entry.id} konflikt pfad=${pfad}`)
        } else {
          broadcast('diary', 'update', entry.id, new Date().toISOString())
        }

        logEvent('BTB_FOTO', req, `project=${project.id} entry=${entry.id} pfad=${pfad} size=${req.body.length}`)
        res.status(201).json({ pfad, name, nr: i + 1 })
      } catch (e) { res.status(502).json({ error: e.message }) }
    })
}

module.exports = { registerBautagebuchFotos, cleanRel }
