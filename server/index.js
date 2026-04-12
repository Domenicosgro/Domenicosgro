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
 *   ALLOWED_ORIGINS  – Kommaliste erlaubter CORS-Origins, z.B.
 *                      "https://protokoll.firma.de,https://intern.firma.de"
 *                      Leer lassen = alle erlaubt (nur intern/Entwicklung)
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
  crossOriginEmbedderPolicy: false,  // needed for blob: attachments
  hsts: { maxAge: 31536000, includeSubDomains: true },
}))

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : null   // null = wildcard (lokaler Betrieb / Entwicklung)

app.use(cors({
  origin: allowedOrigins
    ? (origin, cb) => {
        // allow requests without origin (e.g. curl, Electron)
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true)
        cb(Object.assign(new Error('CORS: Herkunft nicht erlaubt'), { status: 403 }))
      }
    : true,
  methods: ['GET', 'PUT', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-API-Key'],
}))

// ── Rate limiting ─────────────────────────────────────────────────────────────
// General API limit: 300 req / 15 min per IP
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Zu viele Anfragen – bitte in 15 Minuten erneut versuchen.' },
}))

// Stricter limit for write operations: 120 req / min per IP
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: 'Zu viele Schreiboperationen – bitte kurz warten.' },
})

// ── API key authentication ────────────────────────────────────────────────────
const API_KEY = process.env.API_KEY   // optional; set to enable auth
const requireApiKey = (req, res, next) => {
  if (!API_KEY) return next()   // auth disabled
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

// ── Body parser (groß wegen base64-Anlagen) ───────────────────────────────────
app.use(express.json({ limit: '200mb' }))

// ── Static frontend ───────────────────────────────────────────────────────────
const distDir = path.join(__dirname, '../dist')
app.use(express.static(distDir, {
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
  },
}))

// ── API helper ────────────────────────────────────────────────────────────────
function apiHandler(key) {
  return {
    get: (_req, res) => {
      try { res.json(db.get(key)) }
      catch (e) { res.status(500).json({ error: e.message }) }
    },
    put: (req, res) => {
      try {
        if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Array erwartet' })
        db.set(key, req.body)
        res.json({ ok: true, count: req.body.length })
      } catch (e) {
        res.status(500).json({ error: e.message })
      }
    },
  }
}

// ── API routes (auth + rate limit on writes) ──────────────────────────────────
const protocols = apiHandler('protocols')
const projects  = apiHandler('projects')

app.get ('/api/protocols', requireApiKey, protocols.get)
app.put ('/api/protocols', requireApiKey, writeLimiter, protocols.put)

app.get ('/api/projects',  requireApiKey, projects.get)
app.put ('/api/projects',  requireApiKey, writeLimiter, projects.put)

app.get ('/api/health',    (_req, res) => res.json({ status: 'ok', time: new Date().toISOString(), version: require('../package.json').version }))
app.get ('/api/version',   (_req, res) => res.json({ version: require('../package.json').version }))

// ── SPA fallback ──────────────────────────────────────────────────────────────
app.get('*', (_req, res) => res.sendFile(path.join(distDir, 'index.html')))

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  logEvent('ERROR', req, err.message)
  res.status(err.status || 500).json({ error: err.message || 'Interner Fehler' })
})

// ── Server starten (HTTP oder HTTPS) ─────────────────────────────────────────
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
