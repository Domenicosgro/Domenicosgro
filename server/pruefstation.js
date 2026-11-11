'use strict'

// ── Prüfstation ───────────────────────────────────────────────────────────────
// Eigenständige Oberfläche unter /pruefstation (gleicher Server, gleiche
// Anmeldung, gleiche Projekte wie das Protokolltool). Ein Prüfvorgang ist z. B.
// ein Nachtrag oder eine Abschlagsrechnung, die zu prüfen ist.
//
// Die Dateien liegen NICHT in der App-Datenbank, sondern im NAS-Ordner, der
// für jeden Vorgang einzeln verknüpft wird (Synology File Station über das
// Service-Konto SYNOLOGY_FS_USER, siehe fileStation.js). Die App hält nur die
// Metadaten: welcher Ordner, welche Datei ist Prüfdokument, welche Anlage
// (Einigung, E-Mail-Verlauf, Stellungnahme …), Hinweise des Bearbeiters.
//
// Aufbau im verknüpften Ordner:
//   <Vorgangsordner>/                  Prüfdokumente (Originale: Nachtrag, Rechnung …)
//   <Vorgangsordner>/Anlagen zur Prüfung/   Einigungen, E-Mails, Stellungnahmen …
// Das entspricht der Ablage aus den Prüf-Skills („Nachtrag 0xx“ = Originale).
//
// Optional: PRUEFSTATION_ROOTS = Kommaliste erlaubter Wurzelpfade auf der NAS
// (z. B. "/Projekte,/Planserver"). Ohne Angabe sind alle Freigaben erlaubt,
// die das Service-Konto sieht.

const crypto  = require('crypto')
const express = require('express')

const ANLAGEN_ORDNER = 'Anlagen zur Prüfung'

const ARTEN      = ['nachtrag', 'rechnung', 'sonstiges']
const STATUS     = ['eingang', 'in_pruefung', 'zur_freigabe', 'abgeschlossen']
const KATEGORIEN = ['pruefdokument', 'anlage']
const DATEI_ARTEN = ['einigung', 'email', 'stellungnahme', 'protokoll', 'leistungsnachweis', 'vertrag', 'hinweis', 'sonstiges']

function allowedRoots() {
  return String(process.env.PRUEFSTATION_ROOTS || '')
    .split(',').map(s => s.trim().replace(/\/+$/, '')).filter(s => s.startsWith('/'))
}

// Pfad prüfen: absolut, keine "..", keine Steuerzeichen, innerhalb der Wurzeln
function cleanPath(p) {
  const s = String(p || '').trim().replace(/\/+$/, '').replace(/\/{2,}/g, '/')
  if (!s.startsWith('/') || s.length > 1024) return null
  if (/[\u0000-\u001f]/.test(s)) return null
  if (s.split('/').some(seg => seg === '..' || seg === '.')) return null
  const roots = allowedRoots()
  if (roots.length && !roots.some(r => s === r || s.startsWith(r + '/'))) return null
  return s
}

// Datei-/Ordnername für die NAS: keine Pfadtrenner und Sonderzeichen
function cleanName(name, fallback = 'Datei') {
  let s = String(name || '').normalize('NFC')
    .replace(/[\u0000-\u001f\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ').trim().replace(/^\.+/, '')
  if (!s) s = fallback
  if (s.length > 180) {
    const dot = s.lastIndexOf('.')
    const ext = dot > 0 && s.length - dot <= 10 ? s.slice(dot) : ''
    s = s.slice(0, 180 - ext.length) + ext
  }
  return s
}

// Freier Name im Ordner: "Datei.pdf" → "Datei (2).pdf"
function uniqueName(name, existing) {
  const taken = new Set(existing.map(n => n.toLowerCase()))
  if (!taken.has(name.toLowerCase())) return name
  const dot  = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const ext  = dot > 0 ? name.slice(dot) : ''
  for (let i = 2; i < 1000; i++) {
    const cand = `${base} (${i})${ext}`
    if (!taken.has(cand.toLowerCase())) return cand
  }
  return `${base} ${Date.now()}${ext}`
}

const str = (v, max = 500) => (typeof v === 'string' ? v.slice(0, max) : '')
const isoDate = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '')

function registerPruefstation(app, { db, fileStation, requireAuth, writeLimiter, canAccessProject, isProjectManager, logEvent, broadcast }) {
  const displayName = (username) => db.users.get(username)?.display_name || username

  function notConfigured(res) {
    if (fileStation.isConfigured()) return false
    res.status(400).json({ error: 'NAS-Anbindung nicht eingerichtet – SYNOLOGY_URL, SYNOLOGY_FS_USER und SYNOLOGY_FS_PASS in der docker-compose.yml setzen.' })
    return true
  }

  // Vorgang laden + Projektzugriff prüfen
  function getVorgang(req, res) {
    const v = db.pruefVorgaenge.get(req.params.id)
    if (!v) { res.status(404).json({ error: 'Prüfvorgang nicht gefunden.' }); return null }
    const project = db.projects.get(v.projectId)
    if (project && !canAccessProject(project, req.user)) {
      logEvent('PRUEF_ACCESS_DENIED', req, `vorgang=${v.id}`)
      res.status(403).json({ error: 'Kein Zugriff auf dieses Projekt.' })
      return null
    }
    return v
  }

  function saveVorgang(v, by, changes) {
    const { _version, _updatedAt, ...data } = v
    const next = { ...data, ...changes, updatedAt: new Date().toISOString() }
    const r = db.pruefVorgaenge.update(v.id, next, _version, by)
    if (r.conflict) {
      // Metadaten-Änderungen sind feldweise – auf den frischen Stand anwenden
      const fresh = db.pruefVorgaenge.get(v.id)
      const { _version: fv, _updatedAt: _fu, ...fdata } = fresh
      const merged = { ...fdata, ...changes, updatedAt: next.updatedAt }
      db.pruefVorgaenge.update(v.id, merged, fv, by)
    }
    broadcast?.('pruefvorgang', 'update', v.id, next.updatedAt)
    return db.pruefVorgaenge.get(v.id)
  }

  function requireFolder(v, res) {
    const p = cleanPath(v.folderPath)
    if (!p) { res.status(400).json({ error: 'Für diesen Vorgang ist noch kein NAS-Ordner verknüpft.' }); return null }
    return p
  }

  // Relativen Dateipfad im Vorgangsordner auflösen (nur Ordner selbst + Anlagen)
  function resolveRel(folder, rel) {
    const r = String(rel || '')
    const parts = r.split('/')
    if (parts.length === 1 && parts[0] && cleanName(parts[0]) === parts[0]) return `${folder}/${parts[0]}`
    if (parts.length === 2 && parts[0] === ANLAGEN_ORDNER && parts[1] && cleanName(parts[1]) === parts[1]) return `${folder}/${r}`
    return null
  }

  async function listSafe(p) {
    try { return await fileStation.listFolder(p) }
    catch (e) { if (/nicht gefunden/.test(e.message)) return null; throw e }
  }

  // ── Status / Projekte ────────────────────────────────────────────────────────
  app.get('/api/pruefstation/status', requireAuth, (_req, res) => {
    res.json({ nasConfigured: fileStation.isConfigured(), roots: allowedRoots(), anlagenOrdner: ANLAGEN_ORDNER })
  })

  app.get('/api/pruefstation/projects', requireAuth, (req, res) => {
    try {
      const list = db.projects.list()
        .filter(p => !p.archived && canAccessProject(p, req.user))
        .map(p => ({ id: p.id, name: p.name, fsPath: p.fsPath || '', canManage: isProjectManager(p, req.user) }))
        .sort((a, b) => String(a.name).localeCompare(String(b.name), 'de'))
      res.json(list)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // ── Ordnerauswahl auf der NAS ────────────────────────────────────────────────
  app.get('/api/pruefstation/browse', requireAuth, async (req, res) => {
    if (notConfigured(res)) return
    try {
      if (!req.query.path) {
        const roots = allowedRoots()
        const entries = roots.length
          ? roots.map(r => ({ name: r.split('/').pop() || r, path: r, isdir: true }))
          : await fileStation.listShares()
        return res.json({ path: '', parent: null, entries })
      }
      const p = cleanPath(req.query.path)
      if (!p) return res.status(403).json({ error: 'Pfad nicht erlaubt.' })
      const entries = await fileStation.listFolder(p)
      const roots   = allowedRoots()
      const isRoot  = roots.length ? roots.includes(p) : p.split('/').length === 2
      const parent  = isRoot ? '' : p.slice(0, p.lastIndexOf('/')) || ''
      res.json({ path: p, parent, entries })
    } catch (e) { res.status(502).json({ error: e.message }) }
  })

  app.post('/api/pruefstation/folders', requireAuth, writeLimiter, async (req, res) => {
    if (notConfigured(res)) return
    try {
      const parent = cleanPath(req.body?.parent)
      if (!parent) return res.status(403).json({ error: 'Pfad nicht erlaubt.' })
      const name = cleanName(req.body?.name, '')
      if (!name) return res.status(400).json({ error: 'Ordnername fehlt.' })
      const created = await fileStation.createFolder(parent, name)
      logEvent('PRUEF_MKDIR', req, `path=${created}`)
      res.status(201).json({ path: created })
    } catch (e) { res.status(502).json({ error: e.message }) }
  })

  // ── Prüfvorgänge ─────────────────────────────────────────────────────────────
  app.get('/api/pruefstation/vorgaenge', requireAuth, (req, res) => {
    try {
      const pid = req.query.projectId
      const projects = new Map(db.projects.list().map(p => [p.id, p]))
      const list = db.pruefVorgaenge.list().filter(v => {
        if (pid && v.projectId !== pid) return false
        const p = projects.get(v.projectId)
        return !p || canAccessProject(p, req.user)
      })
      res.json(list)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  function pickFields(body) {
    const out = {}
    if ('art' in body)            out.art            = ARTEN.includes(body.art) ? body.art : 'sonstiges'
    if ('status' in body)         out.status         = STATUS.includes(body.status) ? body.status : 'eingang'
    if ('nummer' in body)         out.nummer         = str(body.nummer, 60)
    if ('index' in body)          out.index          = str(body.index, 20)
    if ('titel' in body)          out.titel          = str(body.titel, 300)
    if ('auftragnehmer' in body)  out.auftragnehmer  = str(body.auftragnehmer, 200)
    if ('eingangAm' in body)      out.eingangAm      = isoDate(body.eingangAm)
    if ('frist' in body)          out.frist          = isoDate(body.frist)
    if ('einigungAm' in body)     out.einigungAm     = isoDate(body.einigungAm)
    if ('betragNetto' in body)    out.betragNetto    = Number.isFinite(Number(body.betragNetto)) && body.betragNetto !== '' && body.betragNetto !== null ? Number(body.betragNetto) : null
    if ('hinweise' in body)       out.hinweise       = str(body.hinweise, 20000)
    if ('folderPath' in body) {
      if (body.folderPath === '' || body.folderPath === null) out.folderPath = ''
      else {
        const p = cleanPath(body.folderPath)
        if (!p) throw Object.assign(new Error('Ordnerpfad nicht erlaubt.'), { status: 400 })
        out.folderPath = p
      }
    }
    return out
  }

  app.post('/api/pruefstation/vorgaenge', requireAuth, writeLimiter, (req, res) => {
    try {
      const body = req.body || {}
      const project = db.projects.get(body.projectId)
      if (!project) return res.status(400).json({ error: 'Projekt fehlt oder existiert nicht.' })
      if (!canAccessProject(project, req.user)) return res.status(403).json({ error: 'Kein Zugriff auf dieses Projekt.' })
      const now = new Date().toISOString()
      const v = {
        art: 'nachtrag', status: 'eingang', nummer: '', index: '', titel: '', auftragnehmer: '',
        eingangAm: now.slice(0, 10), frist: '', einigungAm: '', betragNetto: null, hinweise: '', folderPath: '',
        ...pickFields(body),
        id: crypto.randomBytes(12).toString('base64url'),
        projectId: project.id,
        dateien: {},
        createdBy: req.user, createdByName: displayName(req.user),
        createdAt: now, updatedAt: now,
      }
      db.pruefVorgaenge.create(v, req.user)
      broadcast?.('pruefvorgang', 'create', v.id, now)
      logEvent('PRUEF_CREATE', req, `vorgang=${v.id} project=${project.id}`)
      res.status(201).json(db.pruefVorgaenge.get(v.id))
    } catch (e) { res.status(e.status || 500).json({ error: e.message }) }
  })

  app.get('/api/pruefstation/vorgaenge/:id', requireAuth, (req, res) => {
    const v = getVorgang(req, res)
    if (v) res.json(v)
  })

  app.patch('/api/pruefstation/vorgaenge/:id', requireAuth, writeLimiter, (req, res) => {
    try {
      const v = getVorgang(req, res)
      if (!v) return
      const changes = pickFields(req.body || {})
      changes.updatedByName = displayName(req.user)
      if (changes.folderPath !== undefined && changes.folderPath !== v.folderPath) {
        logEvent('PRUEF_LINK', req, `vorgang=${v.id} path=${changes.folderPath}`)
      }
      res.json(saveVorgang(v, req.user, changes))
    } catch (e) { res.status(e.status || 500).json({ error: e.message }) }
  })

  // Löscht nur den Vorgang in der App – die Dateien auf der NAS bleiben.
  app.delete('/api/pruefstation/vorgaenge/:id', requireAuth, writeLimiter, (req, res) => {
    try {
      const v = getVorgang(req, res)
      if (!v) return
      const project = db.projects.get(v.projectId)
      if (v.createdBy !== req.user && !(project && isProjectManager(project, req.user))) {
        return res.status(403).json({ error: 'Nur der Ersteller oder ein Projekt-Administrator kann den Vorgang löschen.' })
      }
      db.pruefVorgaenge.delete(v.id)
      broadcast?.('pruefvorgang', 'delete', v.id, new Date().toISOString())
      logEvent('PRUEF_DELETE', req, `vorgang=${v.id}`)
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // ── Dateien eines Vorgangs ───────────────────────────────────────────────────
  app.get('/api/pruefstation/vorgaenge/:id/dateien', requireAuth, async (req, res) => {
    if (notConfigured(res)) return
    try {
      const v = getVorgang(req, res)
      if (!v) return
      const folder = requireFolder(v, res)
      if (!folder) return
      const top = await listSafe(folder)
      if (!top) return res.status(404).json({ error: `Der verknüpfte Ordner existiert nicht (mehr): ${folder}` })
      const anl = top.some(f => f.isdir && f.name === ANLAGEN_ORDNER) ? (await listSafe(`${folder}/${ANLAGEN_ORDNER}`)) || [] : []
      const meta = v.dateien || {}
      const mk = (f, rel, kat) => ({
        rel, name: f.name, size: f.size, mtime: f.mtime,
        kategorie: meta[rel]?.kategorie || kat,
        art:       meta[rel]?.art || (kat === 'anlage' ? 'sonstiges' : ''),
        notiz:     meta[rel]?.notiz || '',
        uploadedBy: meta[rel]?.uploadedByName || '',
        uploadedAt: meta[rel]?.uploadedAt || '',
        viaApp:    !!meta[rel]?.uploadedAt,
      })
      const files = [
        ...top.filter(f => !f.isdir).map(f => mk(f, f.name, 'pruefdokument')),
        ...anl.filter(f => !f.isdir).map(f => mk(f, `${ANLAGEN_ORDNER}/${f.name}`, 'anlage')),
      ]
      const ordner = top.filter(f => f.isdir && f.name !== ANLAGEN_ORDNER).map(f => ({ name: f.name, path: f.path }))
      res.json({ folderPath: folder, files, ordner })
    } catch (e) { res.status(502).json({ error: e.message }) }
  })

  // Datei hochladen: Body = Rohdaten, Query: name, kategorie, art, notiz
  app.post('/api/pruefstation/vorgaenge/:id/dateien', requireAuth, writeLimiter,
    express.raw({ type: 'application/octet-stream', limit: '500mb' }),
    async (req, res) => {
      if (notConfigured(res)) return
      try {
        const v = getVorgang(req, res)
        if (!v) return
        const folder = requireFolder(v, res)
        if (!folder) return
        if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Leere Datei.' })
        const kategorie = KATEGORIEN.includes(req.query.kategorie) ? req.query.kategorie : 'anlage'
        const art       = kategorie === 'anlage' ? (DATEI_ARTEN.includes(req.query.art) ? req.query.art : 'sonstiges') : ''
        const dest      = kategorie === 'anlage' ? `${folder}/${ANLAGEN_ORDNER}` : folder
        const existing  = ((await listSafe(dest)) || []).map(f => f.name)
        const name      = uniqueName(cleanName(req.query.name), existing)
        await fileStation.uploadFile(dest, name, req.body, req.headers['content-type'] || 'application/octet-stream')
        const rel = kategorie === 'anlage' ? `${ANLAGEN_ORDNER}/${name}` : name
        const fresh = db.pruefVorgaenge.get(v.id)
        const dateien = { ...(fresh.dateien || {}), [rel]: {
          kategorie, art, notiz: str(req.query.notiz, 1000),
          uploadedBy: req.user, uploadedByName: displayName(req.user), uploadedAt: new Date().toISOString(),
        } }
        saveVorgang(fresh, req.user, { dateien })
        logEvent('PRUEF_UPLOAD', req, `vorgang=${v.id} file=${dest}/${name} size=${req.body.length}`)
        res.status(201).json({ rel, name })
      } catch (e) { res.status(502).json({ error: e.message }) }
    })

  // Text als Anlage ablegen (z. B. eingefügter E-Mail-Verlauf, Hinweis zur Einigung)
  app.post('/api/pruefstation/vorgaenge/:id/text', requireAuth, writeLimiter, async (req, res) => {
    if (notConfigured(res)) return
    try {
      const v = getVorgang(req, res)
      if (!v) return
      const folder = requireFolder(v, res)
      if (!folder) return
      const text = str(req.body?.text, 2_000_000)
      if (!text.trim()) return res.status(400).json({ error: 'Kein Text angegeben.' })
      const art   = DATEI_ARTEN.includes(req.body?.art) ? req.body.art : 'email'
      const datum = new Date().toISOString().slice(0, 10)
      const titel = cleanName(req.body?.titel || (art === 'email' ? 'E-Mail-Verlauf' : 'Hinweis'), 'Text')
      const dest  = `${folder}/${ANLAGEN_ORDNER}`
      const existing = ((await listSafe(dest)) || []).map(f => f.name)
      const name  = uniqueName(`${datum} ${titel.replace(/\.txt$/i, '').replace(/[.\s]+$/, '')}.txt`, existing)
      const head  = `${titel}\nAbgelegt am ${new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })} von ${displayName(req.user)} (Prüfstation)\n${'─'.repeat(60)}\n\n`
      // BOM, damit Windows-Editoren die Umlaute richtig zeigen
      await fileStation.uploadFile(dest, name, Buffer.from('﻿' + head + text.replace(/\r?\n/g, '\r\n'), 'utf8'), 'text/plain; charset=utf-8')
      const rel = `${ANLAGEN_ORDNER}/${name}`
      const fresh = db.pruefVorgaenge.get(v.id)
      const dateien = { ...(fresh.dateien || {}), [rel]: {
        kategorie: 'anlage', art, notiz: str(req.body?.notiz, 1000),
        uploadedBy: req.user, uploadedByName: displayName(req.user), uploadedAt: new Date().toISOString(),
      } }
      saveVorgang(fresh, req.user, { dateien })
      logEvent('PRUEF_TEXT', req, `vorgang=${v.id} file=${dest}/${name}`)
      res.status(201).json({ rel, name })
    } catch (e) { res.status(502).json({ error: e.message }) }
  })

  // Einordnung einer Datei ändern (Kategorie, Art, Notiz) – verschiebt nichts
  app.patch('/api/pruefstation/vorgaenge/:id/dateien', requireAuth, writeLimiter, (req, res) => {
    try {
      const v = getVorgang(req, res)
      if (!v) return
      const rel = String(req.body?.rel || '')
      if (!resolveRel('/x', rel)) return res.status(400).json({ error: 'Ungültige Datei.' })
      const cur = (v.dateien || {})[rel] || {}
      const next = { ...cur }
      if (KATEGORIEN.includes(req.body.kategorie)) next.kategorie = req.body.kategorie
      if (DATEI_ARTEN.includes(req.body.art) || req.body.art === '') next.art = req.body.art
      if ('notiz' in req.body) next.notiz = str(req.body.notiz, 1000)
      res.json(saveVorgang(v, req.user, { dateien: { ...(v.dateien || {}), [rel]: next } }))
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  app.get('/api/pruefstation/vorgaenge/:id/dateien/download', requireAuth, async (req, res) => {
    if (notConfigured(res)) return
    try {
      const v = getVorgang(req, res)
      if (!v) return
      const folder = requireFolder(v, res)
      if (!folder) return
      const full = resolveRel(folder, req.query.rel)
      if (!full) return res.status(400).json({ error: 'Ungültige Datei.' })
      const upstream = await fileStation.downloadFile(full)
      const filename = full.split('/').pop() || 'datei'
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream')
      const len = upstream.headers.get('content-length')
      if (len) res.setHeader('Content-Length', len)
      res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/[^a-zA-Z0-9 ._-]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(filename)}`)
      require('stream').Readable.fromWeb(upstream.body).pipe(res)
      logEvent('PRUEF_DOWNLOAD', req, `vorgang=${v.id} file=${full}`)
    } catch (e) { if (!res.headersSent) res.status(502).json({ error: e.message }) }
  })

  // Löschen nur für Dateien, die über die Prüfstation hochgeladen wurden –
  // vorhandene Originale im Projektordner rührt die App nicht an.
  app.delete('/api/pruefstation/vorgaenge/:id/dateien', requireAuth, writeLimiter, async (req, res) => {
    if (notConfigured(res)) return
    try {
      const v = getVorgang(req, res)
      if (!v) return
      const folder = requireFolder(v, res)
      if (!folder) return
      const rel  = String(req.query.rel || '')
      const full = resolveRel(folder, rel)
      if (!full) return res.status(400).json({ error: 'Ungültige Datei.' })
      const meta = (v.dateien || {})[rel]
      if (!meta?.uploadedAt) return res.status(403).json({ error: 'Nur Dateien, die über die Prüfstation hochgeladen wurden, lassen sich hier löschen.' })
      await fileStation.deleteFile(full)
      const { [rel]: _gone, ...rest } = v.dateien || {}
      saveVorgang(v, req.user, { dateien: rest })
      logEvent('PRUEF_FILE_DELETE', req, `vorgang=${v.id} file=${full}`)
      res.json({ ok: true })
    } catch (e) { res.status(502).json({ error: e.message }) }
  })
}

module.exports = { registerPruefstation, ANLAGEN_ORDNER, cleanPath, cleanName, uniqueName }
