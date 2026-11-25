'use strict'
// ─────────────────────────────────────────────────────────────────────────────
// Baustellen-Fassade  (/api/baustelle/*)
//
// Eine schmale Schnittstelle für die Handy-Oberfläche unter /baustelle. Sie
// kann genau zwei Dinge: Projekte auflisten und Tagesberichte der
// Baudokumentation schreiben – mit Fotos und Wetter. Keine Protokolle, keine
// Mängel, keine Kontakte, keine Nachträge, keine Dateiablage.
//
// Warum eine eigene Fassade und nicht einfach die vorhandenen Routen?
// Weil „von der Baustelle erreichbar" sonst „alles erreichbar" heißt. Heute ist
// das Tool nur über VPN zu haben, und das ist richtig: in der Datenbank liegt
// die vollständige Projektkorrespondenz. Eine eigene Fläche mit acht Routen
// kann man später bewusst nach außen legen, ohne die anderen 125 mitzunehmen.
// Eine schlanke Maske vor den alten Routen würde das nicht leisten – wer sich
// anmeldet, holt sich mit „curl" das Protokollarchiv.
//
// Dasselbe Muster wie server/stammdaten.js: eine Fassade vor der vorhandenen
// Datenhaltung, die bewusst weniger herausgibt als sie könnte.
//
// Gegenstück im Browser: src/baustelle/
// Die Originalfotos laufen über server/bautagebuchFotos.js, dort unter
// derselben Fassade mit angemeldet (deps.fotoPfade).
// ─────────────────────────────────────────────────────────────────────────────

// Wie weit die Handy-Oberfläche zurücksieht. Der Bauleiter braucht die letzten
// Tage, nicht das Archiv – und was nicht herausgeht, kann auch nicht verloren
// gehen, wenn das Handy abhandenkommt.
const TAGE_STANDARD = 14
const TAGE_MAX      = 60

// Wie lange ein eigener Bericht vom Handy aus noch geändert werden darf.
// Danach ist er Teil der Dokumentation und wird im Büro bearbeitet.
const AENDERN_TAGE = 30

// Kleine Fassung eines Fotos: 1200 px / ~120 KB laut photoUtils.js. Die Grenze
// liegt bewusst höher, damit ein Gerät mit anderer Kamera nicht scheitert –
// aber weit unter dem, was ein Original braucht. Originale gehen nicht hier
// durch, sondern als Rohdaten in den Projektordner.
const ANHANG_MAX_BYTES = 1024 * 1024

// Felder, die ein Bericht von der Baustelle setzen darf. Alles andere im
// Datensatz bleibt unberührt – Behinderungen, Abnahmen und was das Büro sonst
// erfasst, kann die Handy-Oberfläche nicht einmal versehentlich leeren.
const FELDER = [
  'date', 'daytime', 'weather', 'tempMin', 'tempMax', 'weatherDate', 'weatherLocation',
  'progress', 'workItems', 'workDone', 'firmList', 'firms', 'remarks', 'special',
]

// Spuren einer Formatierung aus dem Büro. Die Handy-Oberfläche kennt nur
// Fließtext; dürfte sie einen so bearbeiteten Bericht anfassen, wären Listen
// und Hervorhebungen beim Speichern still weg. Deshalb bleibt er dort gesperrt.
const FORMATIERT = /<(li|ol|ul|strong|em|b|i|u|s|img|h[1-6]|table)\b/i

// Die vier Werte, die Ausdruck und PDF kennen (WEATHER in BautagebuchView.jsx,
// wmoToWeather im Server). Was nicht dabei ist, wird zu „sonnig" – die Fassade
// schreibt nichts in den Bericht, was das Büro nicht darstellen kann.
const WETTER = ['sonnig', 'bewoelkt', 'regen', 'schnee']

const stripHtml = (html) => String(html || '')
  .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<\/li>/gi, '\n')
  .replace(/<li[^>]*>/gi, '• ')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/\n{3,}/g, '\n\n')
  .trim()

// Fließtext → HTML, wie es der Rechteditor im Büro ablegt (toHtml in
// RichTextEditor.jsx). Bewusst hier nachgebaut: der Editor zieht Tiptap mit,
// und das gehört nicht in ein Bündel, das über Mobilfunk geladen wird.
const zuHtml = (text) => {
  const s = String(text || '').replace(/\r\n/g, '\n').trim()
  if (!s) return ''
  return s.split('\n')
    .map(z => `<p>${z.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') || '<br>'}</p>`)
    .join('')
}

const heute = () => new Date().toISOString().slice(0, 10)
const tagVor = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)
const istDatum = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))

// Zahl aus einem Formularfeld: leer bleibt leer, Unsinn wird leer.
const zahl = (v) => {
  if (v === '' || v == null) return ''
  const n = Number(v)
  return Number.isFinite(n) ? n : ''
}

const text = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

function registerBaustelle(app, deps) {
  const { db, requireAuth, writeLimiter, getAccessibleProject, canAccessProject,
          attachments, validAttachmentId, logEvent, broadcast,
          displayName, wetterHandler } = deps

  // ── Was die Fassade über ein Projekt verrät ──────────────────────────────
  // Name, Nummer, Ort – und ob die Fotoablage eingerichtet ist. Kein Bauherr,
  // keine Kontakte, kein Vertrag, kein Team.
  function projektAussen(p, letzter) {
    const d = p.projectData || {}
    return {
      id:         p.id,
      name:       p.name || '',
      nummer:     d.nummer || '',
      ort:        (d.bauherr?.city || '').trim(),
      // Ohne hinterlegten Fotoordner bleiben die Originale in der
      // Warteschlange. Das soll die Oberfläche sagen können, bevor der
      // Bauleiter 20 Fotos aufnimmt.
      fotoordner: !!(p.fsPath && p.fsFotoPath),
      letzterBericht: letzter || null,
    }
  }

  // ── Was die Fassade über einen Bericht verrät ────────────────────────────
  // Fließtext statt HTML: die Handy-Oberfläche soll kein HTML darstellen und
  // auch keines erzeugen müssen.
  function berichtAussen(e, user) {
    const roh = [
      ...(Array.isArray(e.workItems) ? e.workItems.map(w => w?.html || '') : [e.workDone || '']),
      e.remarks || '', e.special || '',
    ].join(' ')
    const vonMir = (e.createdBy || '') === displayName(user)
    const frisch = !e.createdAt || e.createdAt.slice(0, 10) >= tagVor(AENDERN_TAGE)
    return {
      id:       e.id,
      date:     e.date || '',
      daytime:  e.daytime || '',
      weather:  e.weather || '',
      tempMin:  e.tempMin ?? '',
      tempMax:  e.tempMax ?? '',
      weatherDate:     e.weatherDate || '',
      weatherLocation: e.weatherLocation || '',
      progress: e.progress ?? '',
      firmen: (Array.isArray(e.firmList) ? e.firmList : []).map(f => ({
        id:      f.id || '',
        company: f.company || '',
        person:  f.person || '',
        gewerk:  f.gewerk || '',
        workers: f.workers ?? '',
        work:    f.work || '',
      })),
      arbeiten: (Array.isArray(e.workItems) && e.workItems.length
        ? e.workItems.map(w => stripHtml(w?.html))
        : [stripHtml(e.workDone)]).filter(Boolean),
      bemerkung:  stripHtml(e.remarks),
      besonderes: stripHtml(e.special),
      fotos: (Array.isArray(e.photos) ? e.photos : []).filter(Boolean).map(p => ({
        id:       p.id,
        caption:  p.caption || '',
        abgelegt: !!p.fsPath,
      })),
      von:      e.createdBy || '',
      quelle:   e.source || 'buero',
      meins:    vonMir,
      // Warum nicht änderbar – damit die Oberfläche es sagen kann, statt nur
      // die Schaltfläche zu verstecken.
      nurBuero: FORMATIERT.test(roh) ? 'formatiert' : (!vonMir ? 'fremd' : (!frisch ? 'alt' : null)),
      version:  e._version ?? null,
    }
  }

  // ── Eingang prüfen ───────────────────────────────────────────────────────
  // Aus dem, was das Handy schickt, wird genau das übernommen, was in einen
  // Bericht gehört – in der Form, die das Büro erwartet.
  function felderAus(body) {
    const b = body || {}
    const arbeiten = (Array.isArray(b.arbeiten) ? b.arbeiten : [b.arbeiten])
      .map(t => String(t ?? '').trim()).filter(Boolean).slice(0, 20)
    const workItems = arbeiten.map((t, i) => ({ id: `ba${i + 1}`, html: zuHtml(t) }))
    const firmen = (Array.isArray(b.firmen) ? b.firmen : []).slice(0, 30)
      .map((f, i) => ({
        id:      String(f?.id || `bf${i + 1}`).slice(0, 40),
        company: text(f?.company, 120),
        person:  text(f?.person, 120),
        gewerk:  text(f?.gewerk, 120),
        workers: zahl(f?.workers),
        work:    text(f?.work, 300),
      }))
      .filter(f => f.company)

    const d = {
      date:    istDatum(b.date) ? b.date : heute(),
      daytime: b.daytime === 'nachmittag' ? 'nachmittag' : 'vormittag',
      weather: WETTER.includes(b.weather) ? b.weather : 'sonnig',
      tempMin: zahl(b.tempMin),
      tempMax: zahl(b.tempMax),
      weatherDate:     istDatum(b.weatherDate) ? b.weatherDate : '',
      weatherLocation: text(b.weatherLocation, 120),
      progress: zahl(b.progress),
      workItems,
      // `workDone` bleibt die zusammengefasste Fassung – Ausdruck, PDF und
      // Bestandsdaten lesen weiter dieses Feld.
      workDone: workItems.map(w => w.html).join(''),
      firmList: firmen,
      firms: firmen.map(f => {
        const meta = [f.gewerk, f.workers !== '' ? `${f.workers} AK` : ''].filter(Boolean).join(', ')
        return `${f.company}${f.person ? `, ${f.person}` : ''}${meta ? ` (${meta})` : ''}${f.work ? ` – ${f.work}` : ''}`
      }).join('\n'),
      remarks: zuHtml(b.bemerkung),
      special: zuHtml(b.besonderes),
    }
    return d
  }

  // Fotos: das Handy darf Bild und Bildunterschrift setzen. Alles, was der
  // Server am Foto vermerkt hat – vor allem der Ablageort des Originals –
  // bleibt stehen. Sonst würde ein Bericht, der auf dem Handy noch in der
  // alten Fassung liegt, den Vermerk der Ablage überschreiben.
  function fotosMischen(alt, neu) {
    const vorher = new Map((Array.isArray(alt) ? alt : []).filter(p => p?.id).map(p => [p.id, p]))
    return (Array.isArray(neu) ? neu : []).slice(0, 60)
      .filter(p => p?.id && validAttachmentId(p.id))
      .map(p => {
        const a = vorher.get(p.id)
        return a ? { ...a, caption: text(p.caption, 200) }
                 : { id: p.id, name: text(p.name, 120) || 'foto.jpg', caption: text(p.caption, 200), source: 'handy' }
      })
  }

  // ── Projekte ─────────────────────────────────────────────────────────────
  app.get('/api/baustelle/projekte', requireAuth, (req, res) => {
    try {
      const letzte = new Map()
      for (const e of db.diaryEntries.list()) {
        const d = e.date || ''
        if (d > (letzte.get(e.projectId) || '')) letzte.set(e.projectId, d)
      }
      const liste = db.projects.list()
        .filter(p => !p.isArchived && canAccessProject(p, req.user))
        .map(p => projektAussen(p, letzte.get(p.id)))
        .sort((a, b) => (b.letzterBericht || '').localeCompare(a.letzterBericht || '')
                     || a.name.localeCompare(b.name, 'de'))
      res.json(liste)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // ── Berichte lesen ───────────────────────────────────────────────────────
  app.get('/api/baustelle/projekte/:id/berichte', requireAuth, (req, res) => {
    try {
      const project = getAccessibleProject(req, res)
      if (!project) return
      const tage = Math.min(TAGE_MAX, Math.max(1, Number(req.query.tage) || TAGE_STANDARD))
      const ab = tagVor(tage)
      const liste = db.diaryEntries.list()
        .filter(e => e.projectId === project.id && (e.date || '') >= ab)
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        .map(e => berichtAussen(e, req.user))
      res.json({ tage, berichte: liste })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // ── Bericht anlegen ──────────────────────────────────────────────────────
  app.post('/api/baustelle/projekte/:id/berichte', requireAuth, writeLimiter, (req, res) => {
    try {
      const project = getAccessibleProject(req, res)
      if (!project) return
      // Doppelte Sendung abfangen: auf der Baustelle bricht eine Verbindung
      // gern ab, nachdem der Server den Bericht schon angelegt hat. Das Handy
      // schickt deshalb eine eigene Kennung mit und bekommt beim zweiten
      // Versuch denselben Bericht zurück statt eines zweiten Eintrags.
      const clientId = text(req.body?.clientId, 64)
      if (clientId) {
        const schon = db.diaryEntries.list().find(e => e.projectId === project.id && e.clientId === clientId)
        if (schon) return res.json(berichtAussen(schon, req.user))
      }

      const id  = require('crypto').randomBytes(12).toString('base64url')
      const now = new Date().toISOString()
      const daten = {
        ...felderAus(req.body),
        photos: fotosMischen([], req.body?.fotos),
        clientId,
        // Woher der Bericht kommt. Im Büro hilft das bei der Einordnung, und
        // die Oberfläche kann ihre eigenen Einträge erkennen.
        source: 'baustelle',
        id, projectId: project.id,
        createdBy: displayName(req.user), createdAt: now, updatedAt: now,
      }
      db.diaryEntries.create(daten, req.user)
      broadcast('diary', 'create', id, now)
      logEvent('BAUSTELLE_BERICHT', req, `project=${project.id} entry=${id} fotos=${daten.photos.length}`)
      res.status(201).json(berichtAussen({ ...daten, _version: 1 }, req.user))
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // ── Eigenen Bericht ändern ───────────────────────────────────────────────
  app.patch('/api/baustelle/projekte/:id/berichte/:entryId', requireAuth, writeLimiter, (req, res) => {
    try {
      const project = getAccessibleProject(req, res)
      if (!project) return
      const alt = db.diaryEntries.get(req.params.entryId)
      if (!alt || alt.projectId !== project.id) return res.status(404).json({ error: 'Bericht nicht gefunden.' })

      const aussen = berichtAussen(alt, req.user)
      if (aussen.nurBuero === 'fremd') {
        return res.status(403).json({ error: `Der Bericht wurde von ${alt.createdBy || 'jemand anderem'} angelegt und kann nur dort oder im Büro geändert werden.`, grund: 'fremd' })
      }
      if (aussen.nurBuero === 'alt') {
        return res.status(409).json({ error: `Der Bericht ist älter als ${AENDERN_TAGE} Tage. Änderungen daran gehören ins Büro.`, grund: 'alt' })
      }
      if (aussen.nurBuero === 'formatiert') {
        return res.status(409).json({ error: 'Der Bericht wurde im Büro formatiert (Listen oder Hervorhebungen). Vom Handy aus geändert, wäre die Formatierung weg – bitte am Rechner bearbeiten.', grund: 'formatiert' })
      }

      const { _version, _updatedAt, ...stand } = alt
      const daten = {
        ...stand,
        ...felderAus(req.body),
        photos: fotosMischen(alt.photos, req.body?.fotos),
        updatedAt: new Date().toISOString(),
      }
      const version = Number(req.body?.version)
      const ergebnis = db.diaryEntries.update(alt.id, daten, Number.isFinite(version) ? version : _version, req.user)
      if (ergebnis.notFound) return res.status(404).json({ error: 'Bericht nicht gefunden.' })
      if (ergebnis.conflict) {
        return res.status(409).json({
          error: 'Der Bericht wurde zwischenzeitlich geändert. Bitte neu laden.',
          grund: 'version', conflict: true,
        })
      }
      broadcast('diary', 'update', alt.id, daten.updatedAt)
      logEvent('BAUSTELLE_BERICHT', req, `project=${project.id} entry=${alt.id} geaendert`)
      res.json(berichtAussen({ ...daten, _version: ergebnis.version }, req.user))
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // ── Kleine Fassung eines Fotos ───────────────────────────────────────────
  // Das Bild für Bericht, Ausdruck und Mailversand. Das Original geht nicht
  // hier durch, sondern als Rohdaten nach server/bautagebuchFotos.js.
  app.post('/api/baustelle/projekte/:id/anhang', requireAuth, writeLimiter, async (req, res) => {
    try {
      const project = getAccessibleProject(req, res)
      if (!project) return
      const { id, data } = req.body || {}
      if (!validAttachmentId(id) || typeof data !== 'string' || !data) {
        return res.status(400).json({ error: '„id" (alphanumerisch) und „data" (base64) erwartet.' })
      }
      if (Math.floor(data.length * 3 / 4) > ANHANG_MAX_BYTES) {
        return res.status(413).json({ error: 'Das verkleinerte Foto ist zu groß. Für die Baudokumentation gilt die kleine Fassung (1200 px).' })
      }
      if (await attachments.exists(id)) return res.json({ ok: true, id })
      await attachments.save(id, data)
      res.status(201).json({ ok: true, id })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // Anhang lesen – nur Bilder, die wirklich an einem Bericht dieses Projekts
  // hängen. Die allgemeine Anhang-Route gibt jede Kennung heraus; hier ist das
  // nicht nötig, und was nicht nötig ist, bleibt zu.
  app.get('/api/baustelle/projekte/:id/anhang/:anhangId', requireAuth, async (req, res) => {
    try {
      const project = getAccessibleProject(req, res)
      if (!project) return
      if (!validAttachmentId(req.params.anhangId)) return res.status(400).json({ error: 'Ungültige Kennung.' })
      const gehoert = db.diaryEntries.list().some(e =>
        e.projectId === project.id &&
        (Array.isArray(e.photos) ? e.photos : []).some(p => p?.id === req.params.anhangId))
      if (!gehoert) return res.status(404).json({ error: 'Anhang nicht gefunden.' })
      const data = await attachments.load(req.params.anhangId)
      if (!data) return res.status(404).json({ error: 'Anhang nicht gefunden.' })
      res.json({ id: req.params.anhangId, data })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // ── Wetter ───────────────────────────────────────────────────────────────
  // Dieselbe Abfrage wie im Büro (Open-Meteo, serverseitig, Ort aus den
  // Projektdaten) – nur unter der Fassade erreichbar.
  app.get('/api/baustelle/projekte/:id/wetter', requireAuth, wetterHandler)
}

module.exports = { registerBaustelle, stripHtml, zuHtml, FORMATIERT }
