/**
 * Komplizen Protokolle – Express/SQLite Backend
 *
 * Startet mit: node server/index.js
 * Produktionsstart: pm2 start server/pm2.config.js
 *
 * Umgebungsvariablen:
 *   PORT             – HTTP(S)-Port (Standard: 3000)
 *   HOST             – Bind-Adresse (Standard: 0.0.0.0)
 *   DB_PATH          – Verzeichnis für SQLite-Datenbank (Standard: ./data)
 *   API_KEY          – Wenn gesetzt, müssen alle API-Anfragen den Header
 *                      "X-API-Key: <wert>" senden (empfohlen für Produktion)
 *   ALLOWED_ORIGINS  – Kommaliste erlaubter CORS-Origins
 *   HTTPS_CERT       – Pfad zum TLS-Zertifikat (PEM) für HTTPS
 *   HTTPS_KEY        – Pfad zum TLS-Schlüssel (PEM) für HTTPS
 */

'use strict'

const express   = require('express')
const cors      = require('cors')
const helmet    = require('helmet')
const rateLimit = require('express-rate-limit')
const path      = require('path')
const fs        = require('fs')
const http      = require('http')
const https     = require('https')
const db        = require('./db')

const app  = express()
const PORT = parseInt(process.env.PORT  || '3000', 10)
const HOST = process.env.HOST || '0.0.0.0'

// ── Security headers (Helmet) ─────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "'unsafe-inline'"],
      styleSrc:    ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:     ["'self'", 'https://fonts.gstatic.com'],
      imgSrc:      ["'self'", 'data:', 'blob:'],
      connectSrc:  ["'self'"],
      objectSrc:   ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: { maxAge: 31536000, includeSubDomains: true },
}))

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : null

app.use(cors({
  origin: allowedOrigins
    ? (origin, cb) => {
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true)
        cb(Object.assign(new Error('CORS: Herkunft nicht erlaubt'), { status: 403 }))
      }
    : true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-API-Key'],
}))

// ── Rate limiting ─────────────────────────────────────────────────────────────
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Zu viele Anfragen – bitte in 15 Minuten erneut versuchen.' },
}))

const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: 'Zu viele Schreiboperationen – bitte kurz warten.' },
})

// ── API key authentication ────────────────────────────────────────────────────
const API_KEY = process.env.API_KEY
const requireApiKey = (req, res, next) => {
  if (!API_KEY) return next()
  const provided = req.headers['x-api-key']
  if (!provided || provided !== API_KEY) {
    logEvent('AUTH_FAIL', req)
    return res.status(401).json({ error: 'Nicht autorisiert.' })
  }
  next()
}

// ── Access logging ────────────────────────────────────────────────────────────
const LOG_DIR  = process.env.LOG_PATH || path.join(__dirname, '../logs')
const LOG_FILE = path.join(LOG_DIR, 'access.log')
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true })

function logEvent(event, req, extra = '') {
  const line = `${new Date().toISOString()} [${event}] ${req.method} ${req.path} ip=${req.ip}${extra ? ' ' + extra : ''}\n`
  fs.appendFile(LOG_FILE, line, () => {})
  if (event !== 'REQ') console.log(line.trim())
}

app.use((req, _res, next) => { logEvent('REQ', req); next() })

// ── Body parser ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: '200mb' }))

// ── Static frontend (index: false so we can inject server mode flag) ──────────
const distDir = path.join(__dirname, '../dist')

function serveHtml(_req, res) {
  const htmlPath = path.join(distDir, 'index.html')
  if (!fs.existsSync(htmlPath)) {
    return res.status(503).send('Frontend nicht gebaut. Bitte zuerst "npm run build" ausführen.')
  }
  let html = fs.readFileSync(htmlPath, 'utf8')
  const inject = API_KEY
    ? `<script>window.__SERVER_MODE__=true;window.__API_KEY__=${JSON.stringify(API_KEY)}</script>`
    : `<script>window.__SERVER_MODE__=true</script>`
  html = html.replace('</head>', inject + '</head>')
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.send(html)
}

// Serve index.html explicitly so injection fires before express.static
app.get('/', serveHtml)

app.use(express.static(distDir, {
  index: false,
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
  },
}))

// ── Row-level API helpers ─────────────────────────────────────────────────────
function makeRoutes(router, store) {
  // GET all
  router.get('/', requireApiKey, (req, res) => {
    try { res.json(store.list()) }
    catch (e) { res.status(500).json({ error: e.message }) }
  })

  // GET one
  router.get('/:id', requireApiKey, (req, res) => {
    try {
      const item = store.get(req.params.id)
      if (!item) return res.status(404).json({ error: 'Nicht gefunden.' })
      res.json(item)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // POST create
  router.post('/', requireApiKey, writeLimiter, (req, res) => {
    try {
      const data = req.body
      if (!data || typeof data !== 'object' || !data.id) {
        return res.status(400).json({ error: 'Objekt mit "id"-Feld erwartet.' })
      }
      const existing = store.get(data.id)
      if (existing) return res.status(409).json({ error: 'ID existiert bereits.', serverVersion: existing._version })
      const result = store.create(data)
      res.status(201).json(result)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // PATCH update with optimistic lock
  router.patch('/:id', requireApiKey, writeLimiter, (req, res) => {
    try {
      const { data, version } = req.body
      if (!data || typeof data !== 'object') {
        return res.status(400).json({ error: '"data"-Objekt erwartet.' })
      }
      if (typeof version !== 'number') {
        return res.status(400).json({ error: '"version" (Zahl) erwartet.' })
      }
      const result = store.update(req.params.id, data, version)
      if (result.notFound) return res.status(404).json({ error: 'Nicht gefunden.' })
      if (result.conflict) return res.status(409).json({
        error: 'Konflikt – Eintrag wurde zwischenzeitlich geändert.',
        serverVersion: result.serverVersion,
        serverData:    result.serverData,
      })
      res.json(result)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // DELETE
  router.delete('/:id', requireApiKey, writeLimiter, (req, res) => {
    try {
      const found = store.delete(req.params.id)
      if (!found) return res.status(404).json({ error: 'Nicht gefunden.' })
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // PUT – legacy bulk replace (keeps backward compat with non-server hooks)
  router.put('/', requireApiKey, writeLimiter, (req, res) => {
    try {
      if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Array erwartet.' })
      store.replaceAll(req.body)
      res.json({ ok: true, count: req.body.length })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })
}

const protocolRouter = express.Router()
const projectRouter  = express.Router()
makeRoutes(protocolRouter, db.protocols)
makeRoutes(projectRouter,  db.projects)

app.use('/api/protocols', protocolRouter)
app.use('/api/projects',  projectRouter)

// ── Misc API routes ───────────────────────────────────────────────────────────
app.get('/api/health',  (_req, res) => res.json({ status: 'ok', time: new Date().toISOString(), version: require('../package.json').version }))
app.get('/api/version', (_req, res) => res.json({ version: require('../package.json').version }))

// ── SPA fallback ──────────────────────────────────────────────────────────────
app.get('*', serveHtml)

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  logEvent('ERROR', req, err.message)
  res.status(err.status || 500).json({ error: err.message || 'Interner Fehler' })
})

// ── Server starten ────────────────────────────────────────────────────────────
const certFile = process.env.HTTPS_CERT
const keyFile  = process.env.HTTPS_KEY

const onListen = (protocol) => () => {
  console.log(`✓ Komplizen Protokolle läuft auf ${protocol}://${HOST}:${PORT}`)
  console.log(`  Datenbank : ${process.env.DB_PATH || path.join(__dirname, '../data')}`)
  console.log(`  API-Auth  : ${API_KEY ? 'Aktiv (X-API-Key)' : 'Deaktiviert'}`)
  console.log(`  CORS      : ${allowedOrigins ? allowedOrigins.join(', ') : 'Alle erlaubt'}`)
}

if (certFile && keyFile && fs.existsSync(certFile) && fs.existsSync(keyFile)) {
  const tlsOpts = { cert: fs.readFileSync(certFile), key: fs.readFileSync(keyFile) }
  https.createServer(tlsOpts, app).listen(PORT, HOST, onListen('https'))
} else {
  http.createServer(app).listen(PORT, HOST, onListen('http'))
}
