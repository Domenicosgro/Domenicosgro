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
 *   API_KEY          – Optionaler statischer API-Schlüssel (X-API-Key Header)
 *   ALLOWED_ORIGINS  – Kommaliste erlaubter CORS-Origins
 *   HTTPS_CERT       – Pfad zum TLS-Zertifikat (PEM) für HTTPS
 *   HTTPS_KEY        – Pfad zum TLS-Schlüssel (PEM) für HTTPS
 */

'use strict'

const express   = require('express')
const cors      = require('cors')
const helmet    = require('helmet')
const rateLimit = require('express-rate-limit')
const { ipKeyGenerator } = require('express-rate-limit')
const path      = require('path')
const fs        = require('fs')
const http      = require('http')
const https     = require('https')
const os        = require('os')
const db          = require('./db')
const auth        = require('./auth')
const attachments = require('./attachments')
const mailer      = require('./mailer')
const { synologyAuth, listSynologyUsers } = require('./synologyAuth')

const app      = express()
const PORT     = parseInt(process.env.PORT  || '3000', 10)
const HOST     = process.env.HOST || '0.0.0.0'
const certFile = process.env.HTTPS_CERT
const keyFile  = process.env.HTTPS_KEY
const isHttps  = !!(certFile && keyFile && fs.existsSync(certFile) && fs.existsSync(keyFile))

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "'unsafe-inline'", "'unsafe-eval'", "'wasm-unsafe-eval'"],
      styleSrc:    ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:     ["'self'", 'https://fonts.gstatic.com'],
      imgSrc:      ["'self'", 'data:', 'blob:'],
      connectSrc:  ["'self'"],
      workerSrc:   ["'self'", 'blob:'],
      objectSrc:   ["'self'", 'blob:'],
      frameSrc:    ["'self'", 'blob:'],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: isHttps ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy:   isHttps ? { policy: 'same-origin' } : false,
  crossOriginResourcePolicy: isHttps ? { policy: 'same-origin' } : { policy: 'cross-origin' },
  hsts: isHttps ? { maxAge: 31536000, includeSubDomains: true } : false,
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
  allowedHeaders: ['Content-Type', 'X-API-Key', 'Authorization'],
}))

// ── Rate limiting ─────────────────────────────────────────────────────────────
// Die Limits müssen ARBEITSTAUGLICH sein: beim Bearbeiten eines Protokolls
// entstehen laufend Speichervorgänge (Auto-Save). Zu strenge Limits führten zu
// 429-Antworten und damit zu nicht gespeicherter Arbeit.
// Gezählt wird pro ANGEMELDETEM NUTZER (Token) – sonst teilen sich alle
// Mitarbeiter hinter derselben IP/NAT ein gemeinsames Kontingent.
const perUserKey = (req, res) => {
  const auth = req.headers['authorization']
  if (auth?.startsWith('Bearer ')) return `u:${auth.slice(7, 71)}`
  if (req.headers['x-api-key'])    return `k:${String(req.headers['x-api-key']).slice(0, 64)}`
  return ipKeyGenerator(req, res)   // IPv6-sicher
}

app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 6000,                       // ~400/min je Nutzer – deckt aktives Arbeiten ab
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: perUserKey,
  message: { error: 'Zu viele Anfragen – bitte kurz warten.' },
}))

const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,                        // Auto-Save beim Tippen darf nicht anschlagen
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: perUserKey,
  message: { error: 'Zu viele Schreiboperationen – bitte kurz warten.' },
})

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Zu viele Anmeldeversuche – bitte in 15 Minuten erneut versuchen.' },
})

// ── Access logging ────────────────────────────────────────────────────────────
const LOG_DIR  = process.env.LOG_PATH || path.join(__dirname, '../logs')
const LOG_FILE = path.join(LOG_DIR, 'access.log')
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true })

function logEvent(event, req, extra = '') {
  const line = `${new Date().toISOString()} [${event}] ${req.method} ${req.path} ip=${req.ip}${extra ? ' ' + extra : ''}\n`
  fs.appendFile(LOG_FILE, line, () => {})
  if (event !== 'REQ') console.log(line.trim())
}

// ── Prozess-Crash-Guards ──────────────────────────────────────────────────────
// Ohne diese Handler beendet ein einziger unbehandelter (asynchroner) Fehler den
// gesamten Node-Prozess → ALLE Mitarbeiter verlieren gleichzeitig die Sitzung.
// Da der komplette dauerhafte Zustand in SQLite liegt (WAL, atomare Writes) und
// Requests weitgehend unabhängig sind, ist Weiterlaufen sicherer als ein
// Komplettabsturz durch einen lokalen Fehler. Bleibt der Prozess doch hängen,
// greift der Healthcheck + restart:unless-stopped des Containers als letztes Netz.
const ERROR_LOG = path.join(LOG_DIR, 'error.log')
function logCrash(kind, err) {
  const detail = (err && (err.stack || err.message)) || String(err)
  const line   = `${new Date().toISOString()} [${kind}] ${detail}\n`
  try { fs.appendFileSync(ERROR_LOG, line) } catch {}
  console.error(line.trim())
}
process.on('uncaughtException',  (err)    => logCrash('UNCAUGHT_EXCEPTION', err))
process.on('unhandledRejection', (reason) => logCrash('UNHANDLED_REJECTION', reason))

app.use((req, _res, next) => { logEvent('REQ', req); next() })

// ── Body parser ───────────────────────────────────────────────────────────────
// 100 MB deckt alle base64-JSON-Payloads (komprimierte Fotos, client-erzeugte
// PDF-Anhänge) großzügig ab. Die wirklich großen Uploads (Videos, BIM/IFC,
// Plan-Dateien) laufen über eigene express.raw-Parser und hängen NICHT hieran.
app.use(express.json({ limit: '100mb' }))

// ── Authentication ────────────────────────────────────────────────────────────
const API_KEY = process.env.API_KEY

// Resolves a token string to a username or null.
// Gleitende Verlängerung: Wer aktiv arbeitet, bleibt angemeldet. Die Sitzung
// läuft nur ab, wenn das Programm SESSION_HOURS lang gar nicht genutzt wurde –
// so ist man am nächsten Arbeitstag nicht plötzlich abgemeldet (was zuvor zu
// "Speichern fehlgeschlagen" mitten in der Arbeit führte).
// Geschrieben wird nur, wenn weniger als die halbe Laufzeit übrig ist
// (spart Schreibzugriffe bei jedem Request).
function resolveToken(token) {
  if (!token) return null
  const session = db.sessions.get(token)
  if (!session) return null
  try {
    const fullMs = auth.SESSION_HOURS * 60 * 60 * 1000
    const msLeft = new Date(session.expires_at).getTime() - Date.now()
    if (Number.isNaN(msLeft) || msLeft < fullMs / 2) {
      db.sessions.touch(token, new Date(Date.now() + fullMs).toISOString())
    }
  } catch {}
  db.users.updateLastLogin(session.username)
  return session.username
}

function requireAuth(req, res, next) {
  // 1) Bearer session token
  const authHeader = req.headers['authorization']
  if (authHeader?.startsWith('Bearer ')) {
    const username = resolveToken(authHeader.slice(7))
    if (username) { req.user = username; return next() }
  }
  // 2) Static API key
  if (API_KEY && req.headers['x-api-key'] === API_KEY) {
    req.user = '__apikey__'; return next()
  }
  // 3) Open mode: no users registered yet (first-time setup)
  if (!db.users.hasAny()) {
    req.user = '__anonymous__'; return next()
  }
  logEvent('AUTH_FAIL', req)
  res.status(401).json({ error: 'Nicht angemeldet. Bitte zuerst einloggen.' })
}

function requireAdmin(req, res, next) {
  if (req.user === '__apikey__' || req.user === '__anonymous__') return next()
  const user = db.users.get(req.user)
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Administratorrechte erforderlich.' })
  }
  next()
}

// ── SSE broadcast ─────────────────────────────────────────────────────────────
const sseClients = new Set()   // Set of { res }

function broadcast(resourceType, action, id, updatedAt) {
  if (sseClients.size === 0) return
  const payload = `event: change\ndata: ${JSON.stringify({ type: resourceType, action, id, updatedAt })}\n\n`
  const dead = []
  for (const client of sseClients) {
    try { client.res.write(payload) }
    catch { dead.push(client) }
  }
  dead.forEach(c => sseClients.delete(c))
}

// ── SSE endpoint ──────────────────────────────────────────────────────────────
app.get('/api/events', (req, res) => {
  // EventSource can't set headers → accept token via query param as well
  const token =
    req.query.token ||
    (req.headers['authorization']?.startsWith('Bearer ') ? req.headers['authorization'].slice(7) : null)

  if (token) {
    const username = resolveToken(token)
    if (!username && db.users.hasAny()) {
      return res.status(401).json({ error: 'Ungültige oder abgelaufene Sitzung.' })
    }
  } else if (API_KEY && req.headers['x-api-key'] !== API_KEY && db.users.hasAny()) {
    return res.status(401).json({ error: 'Nicht angemeldet.' })
  }

  res.setHeader('Content-Type',      'text/event-stream')
  res.setHeader('Cache-Control',     'no-cache')
  res.setHeader('Connection',        'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')   // disable nginx proxy buffering
  res.flushHeaders()

  const client = { res }
  sseClients.add(client)

  // Initial handshake
  res.write(`event: connected\ndata: ${JSON.stringify({ clients: sseClients.size })}\n\n`)

  // Heartbeat keeps the connection alive through proxies (every 25 s)
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n') }
    catch { cleanup() }
  }, 25_000)

  function cleanup() {
    clearInterval(heartbeat)
    sseClients.delete(client)
  }

  req.on('close',  cleanup)
  req.on('error',  cleanup)
})

// ── Auth endpoints ────────────────────────────────────────────────────────────
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body
    if (!username || !password) return res.status(400).json({ error: 'Benutzername und Passwort erforderlich.' })

    // ── Synology-Authentifizierung (wenn SYNOLOGY_URL gesetzt) ────────────────
    if (process.env.SYNOLOGY_URL) {
      try {
        const syno = await synologyAuth(username, password)
        if (syno) {
          db.users.upsertSynology(username, username, syno.isAdmin ? 'admin' : 'user')
          const token     = auth.generateToken()
          const expiresAt = new Date(Date.now() + auth.SESSION_HOURS * 60 * 60 * 1000).toISOString()
          db.sessions.create(token, username, expiresAt)
          db.users.updateLastLogin(username)
          logEvent('LOGIN_SYNOLOGY', req, `user=${username} admin=${syno.isAdmin}`)
          const user = db.users.get(username)
          return res.json({ token, expiresAt, user: { username, displayName: user.display_name, role: user.role } })
        }
        // syno === null → falsches Passwort oder unbekannter Synology-Nutzer → weiter zu lokalem Fallback
      } catch (synoErr) {
        // NAS nicht erreichbar → lokale Konten als Fallback nutzen
        logEvent('SYNOLOGY_UNREACHABLE', req, `err=${synoErr.message}`)
      }
    }

    // ── Lokale Authentifizierung (externe Nutzer / Synology-Ausfall) ──────────
    const user = db.users.get(username)
    if (!user || !user.password_hash || !(await auth.verifyPassword(password, user.password_hash))) {
      logEvent('AUTH_FAIL', req, `user=${username}`)
      return res.status(401).json({ error: 'Ungültige Anmeldedaten.' })
    }
    const token     = auth.generateToken()
    const expiresAt = new Date(Date.now() + auth.SESSION_HOURS * 60 * 60 * 1000).toISOString()
    db.sessions.create(token, username, expiresAt)
    db.users.updateLastLogin(username)
    logEvent('LOGIN', req, `user=${username}`)
    res.json({ token, expiresAt, user: { username: user.username, displayName: user.display_name, role: user.role } })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/auth/logout', requireAuth, (req, res) => {
  const authHeader = req.headers['authorization']
  if (authHeader?.startsWith('Bearer ')) db.sessions.delete(authHeader.slice(7))
  logEvent('LOGOUT', req, `user=${req.user}`)
  res.json({ ok: true })
})

app.get('/api/auth/me', requireAuth, (req, res) => {
  if (req.user === '__apikey__')    return res.json({ username: 'apikey',   displayName: 'API Key', role: 'admin', source: 'local' })
  if (req.user === '__anonymous__') return res.json({ username: '',          displayName: '',        role: 'admin', devMode: true, source: 'local' })
  const user = db.users.get(req.user)
  if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden.' })
  res.json({ username: user.username, displayName: user.display_name, role: user.role, source: user.source || 'local' })
})

app.get('/api/auth/users', requireAuth, requireAdmin, (_req, res) => {
  res.json(db.users.list())
})

app.post('/api/auth/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { username, displayName, password, role = 'user', email = '' } = req.body
    if (!username || !password)   return res.status(400).json({ error: 'Benutzername und Passwort erforderlich.' })
    if (password.length < 8)      return res.status(400).json({ error: 'Passwort muss mindestens 8 Zeichen lang sein.' })
    if (db.users.get(username))   return res.status(409).json({ error: 'Benutzername bereits vergeben.' })
    const hash = await auth.hashPassword(password)
    db.users.create(username, displayName || username, hash, role, password, email)
    logEvent('USER_CREATED', req, `newUser=${username} role=${role}`)
    res.status(201).json({ ok: true, username })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/auth/users/:username', requireAuth, requireAdmin, (req, res) => {
  try {
    const { username } = req.params
    if (username === req.user) return res.status(400).json({ error: 'Eigener Account kann nicht gelöscht werden.' })
    if (!db.users.delete(username)) return res.status(404).json({ error: 'Benutzer nicht gefunden.' })
    logEvent('USER_DELETED', req, `deletedUser=${username}`)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/auth/users/:username/password', requireAuth, async (req, res) => {
  try {
    const { username }                     = req.params
    const { currentPassword, newPassword } = req.body
    const callerUser = db.users.get(req.user)
    const isAdmin    = callerUser?.role === 'admin' || req.user === '__apikey__' || req.user === '__anonymous__'
    if (req.user !== username && !isAdmin) return res.status(403).json({ error: 'Nur das eigene Passwort kann geändert werden.' })
    if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: 'Neues Passwort muss mindestens 8 Zeichen lang sein.' })
    if (!isAdmin) {
      const target = db.users.get(username)
      if (!target || !(await auth.verifyPassword(currentPassword, target.password_hash)))
        return res.status(401).json({ error: 'Aktuelles Passwort falsch.' })
    }
    db.users.updatePassword(username, await auth.hashPassword(newPassword))
    logEvent('PASSWORD_CHANGED', req, `user=${username}`)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Role management ───────────────────────────────────────────────────────────
app.put('/api/auth/users/:username/role', requireAuth, requireAdmin, (req, res) => {
  try {
    const { username } = req.params
    const { role }     = req.body
    if (!['user', 'admin'].includes(role)) return res.status(400).json({ error: 'Ungültige Rolle. Erlaubt: user, admin.' })
    if (username === req.user && role !== 'admin') return res.status(400).json({ error: 'Eigene Admin-Rechte können nicht entzogen werden.' })
    if (!db.users.get(username)) return res.status(404).json({ error: 'Benutzer nicht gefunden.' })
    db.users.setRole(username, role)
    logEvent('ROLE_CHANGED', req, `user=${username} role=${role}`)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Active sessions ───────────────────────────────────────────────────────────
app.get('/api/admin/sessions', requireAuth, requireAdmin, (_req, res) => {
  try { res.json(db.sessions.listActive()) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/admin/sessions/:username', requireAuth, requireAdmin, (req, res) => {
  try {
    const { username } = req.params
    if (username === req.user) return res.status(400).json({ error: 'Eigene Sitzung kann nicht beendet werden.' })
    db.sessions.deleteByUser(username)
    logEvent('SESSION_FORCE_LOGOUT', req, `user=${username}`)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Password reset requests ───────────────────────────────────────────────────
app.post('/api/auth/reset-request', (req, res) => {
  try {
    const { username } = req.body
    if (!username) return res.status(400).json({ error: 'Benutzername erforderlich.' })
    if (!db.users.get(username)) return res.status(404).json({ error: 'Benutzer nicht gefunden.' })
    db.resetRequests.upsert(username)
    logEvent('RESET_REQUESTED', req, `user=${username}`)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/auth/reset-requests', requireAuth, requireAdmin, (_req, res) => {
  res.json(db.resetRequests.list())
})

app.post('/api/auth/reset-requests/:username/resolve', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { username }    = req.params
    const { newPassword } = req.body
    if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: 'Passwort muss mindestens 8 Zeichen haben.' })
    db.users.updatePassword(username, await auth.hashPassword(newPassword))
    db.users.updatePasswordNote(username, newPassword)
    db.resetRequests.delete(username)
    logEvent('RESET_RESOLVED', req, `user=${username}`)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Desktop shortcut download ─────────────────────────────────────────────────
app.get('/shortcut', (req, res) => {
  const proto = req.protocol
  const host  = req.headers.host
  const url   = `${proto}://${host}`
  const icon  = `${url}/logo.png`
  const content = `[InternetShortcut]\r\nURL=${url}\r\nIconFile=${icon}\r\nIconIndex=0\r\n`
  res.setHeader('Content-Type', 'application/octet-stream')
  res.setHeader('Content-Disposition', 'attachment; filename="Komplizen Protokolle.url"')
  res.send(content)
})

// ── Password note API (admin only) ────────────────────────────────────────────
app.put('/api/auth/users/:username/password-note', requireAuth, requireAdmin, (req, res) => {
  try {
    const { username } = req.params
    const { note = '' } = req.body
    if (!db.users.get(username)) return res.status(404).json({ error: 'Benutzer nicht gefunden.' })
    db.users.updatePasswordNote(username, note)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── User email API ────────────────────────────────────────────────────────────
app.put('/api/auth/users/:username/email', requireAuth, requireAdmin, (req, res) => {
  try {
    const { username } = req.params
    const { email = '' } = req.body
    if (!db.users.get(username)) return res.status(404).json({ error: 'Benutzer nicht gefunden.' })
    db.users.updateEmail(username, email)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── LAN-IP ermitteln ──────────────────────────────────────────────────────────
function getLanIp() {
  if (process.env.PUBLIC_URL) return null  // wird unten direkt verwendet
  for (const iface of Object.values(os.networkInterfaces())) {
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal && !addr.address.startsWith('169.'))
        return addr.address
    }
  }
  return null
}

function getAppUrl(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '')
  const reqHost = req.headers.host || ''
  const isLocal = reqHost.startsWith('localhost') || reqHost.startsWith('127.')
  const lanIp   = getLanIp()
  const host    = (isLocal && lanIp) ? `${lanIp}:${PORT}` : reqHost
  return `${req.protocol}://${host}`
}

// ── E-Mail-Versand (Microsoft Graph bevorzugt, SMTP-Fallback) ─────────────────
// Implementierung in ./mailer.js. Statusabfrage liefert auch den aktiven Modus,
// damit das AdminPanel "Graph" vs. "SMTP" anzeigen kann.

app.get('/api/admin/smtp-status', requireAuth, requireAdmin, (_req, res) => {
  const status = mailer.mailerStatus()
  res.json({ configured: status.configured, mode: status.mode, host: status.sender })
})

app.post('/api/admin/smtp-test', requireAuth, requireAdmin, async (req, res) => {
  try {
    if (!mailer.mailerStatus().configured) return res.status(400).json({ error: 'E-Mail-Versand nicht konfiguriert.' })
    await mailer.verifyMailer()
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/admin/email-settings', requireAuth, requireAdmin, (_req, res) => {
  try { res.json(getEmailSettings()) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

app.put('/api/admin/email-settings', requireAuth, requireAdmin, writeLimiter, (req, res) => {
  try {
    const incoming = req.body || {}
    // Only allow known top-level keys; merge numeric fields properly
    const allowed = Object.keys(EMAIL_DEFAULTS)
    const sanitized = {}
    for (const type of allowed) {
      if (!incoming[type]) continue
      const defaults = EMAIL_DEFAULTS[type]
      sanitized[type] = {}
      for (const [field, def] of Object.entries(defaults)) {
        if (incoming[type][field] === undefined) continue
        const raw = incoming[type][field]
        // schedule_day / schedule_hour must be integers within valid ranges
        if (field === 'schedule_day')  { sanitized[type][field] = Math.min(6,  Math.max(0, parseInt(raw) || 0)); continue }
        if (field === 'schedule_hour') { sanitized[type][field] = Math.min(23, Math.max(0, parseInt(raw) || 0)); continue }
        // Text fields: trim, or keep default if empty
        const val = String(raw).trim()
        sanitized[type][field] = val === '' ? def : val
      }
    }
    db.appState.set('email_settings', JSON.stringify(sanitized))
    logEvent('EMAIL_SETTINGS_UPDATED', req)
    res.json({ ok: true, settings: getEmailSettings() })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/admin/synology-status', requireAuth, requireAdmin, (_req, res) => {
  const url = process.env.SYNOLOGY_URL || ''
  res.json({ configured: !!url, url: url || null })
})

// ── HTML escape (shared across all email builders) ────────────────────────────
function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ── Einladungs-E-Mail bauen ───────────────────────────────────────────────────
function buildInviteMail({ username, displayName, email, appUrl, isSynology, passwordNote }) {
  const from        = process.env.SMTP_FROM || process.env.GRAPH_SENDER || process.env.SMTP_USER || 'noreply@ghba'
  const shortcutUrl = `${appUrl}/shortcut`
  const tpl         = getEmailSettings().invite

  const logoPath = path.join(__dirname, '../dist/Logo_Komplizen_sky1.png')
  const logoAttachment = fs.existsSync(logoPath)
    ? [{ filename: 'Logo_Komplizen_sky1.png', path: logoPath, cid: 'logo@komplizen' }]
    : []
  const logoTag = logoAttachment.length
    ? '<img src="cid:logo@komplizen" alt="GHBA" style="height:80px;display:block;margin:0 auto;">'
    : '<h2 style="color:#1e3a5f;text-align:center;margin:0;font-family:Arial,sans-serif;">GHBA</h2>'

  const pwRow = isSynology
    ? `<tr><td style="color:#6b7280;white-space:nowrap;padding-right:16px;">Passwort</td><td style="color:#374151;">Ihr <strong>Synology-NAS-Passwort</strong></td></tr>`
    : `<tr><td style="color:#6b7280;white-space:nowrap;padding-right:16px;">Passwort</td><td style="font-family:monospace;font-weight:bold;">${passwordNote || '(bitte beim Admin erfragen)'}</td></tr>`

  const pwHint = isSynology
    ? `<p style="margin:12px 0 0 0;font-size:12px;color:#6b7280;">Du meldest dich mit deinem Synology-DSM-Benutzernamen und -Passwort an. Es ist kein separates Passwort erforderlich.</p>`
    : `<p style="margin:12px 0 0 0;font-size:12px;color:#ef4444;">⚠ Bitte ändere dein Passwort nach der ersten Anmeldung (Einstellungen → Passwort ändern).</p>`

  const pwTextHint = isSynology
    ? 'Passwort: Ihr Synology-NAS-Passwort'
    : `Passwort: ${passwordNote || '(bitte beim Admin erfragen)'}\n\n⚠ Bitte Passwort nach der ersten Anmeldung ändern.`

  const html = `<!DOCTYPE html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;font-size:14px;color:#1f2937;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;max-width:560px;width:100%;">
        <tr><td style="background:#ffffff;padding:32px 40px 20px 40px;text-align:center;border-bottom:3px solid #7ab3d4;">
          ${logoTag}
          <p style="color:#7ab3d4;margin:8px 0 0 0;font-size:11px;letter-spacing:2px;text-transform:uppercase;">Einladung</p>
        </td></tr>
        <tr><td style="padding:32px 40px 0 40px;">
          <p style="font-size:22px;font-weight:bold;color:#1e3a5f;margin:0 0 8px 0;">Willkommen, ${displayName}!</p>
          <p style="margin:0 0 24px 0;color:#6b7280;">${esc(tpl.greeting)}</p>
        </td></tr>
        <tr><td style="padding:0 40px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #1e3a5f;">
            <tr><td style="padding:20px 24px;">
              <p style="margin:0 0 12px 0;font-weight:bold;color:#1e3a5f;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Deine Zugangsdaten</p>
              <table cellpadding="4" cellspacing="0">
                <tr><td style="color:#6b7280;white-space:nowrap;padding-right:16px;">Adresse</td>      <td><a href="${appUrl}" style="color:#2563eb;font-weight:bold;">${appUrl}</a></td></tr>
                <tr><td style="color:#6b7280;white-space:nowrap;padding-right:16px;">Benutzername</td> <td style="font-family:monospace;font-weight:bold;">${username}</td></tr>
                ${pwRow}
              </table>
            </td></tr>
          </table>
          ${pwHint}
        </td></tr>
        <tr><td style="padding:24px 40px 0 40px;">
          <p style="font-weight:bold;color:#1e3a5f;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin:0 0 10px 0;">Als App auf dem Desktop installieren</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f7ff;border:1px solid #bfdbfe;margin-bottom:12px;">
            <tr><td style="padding:14px 18px;">
              <p style="margin:0 0 6px 0;font-weight:bold;color:#1e40af;">Microsoft Edge (empfohlen – funktioniert sofort)</p>
              <ol style="margin:0;padding-left:18px;color:#374151;line-height:1.9;font-size:13px;">
                <li>Öffne <a href="${appUrl}" style="color:#2563eb;">${appUrl}</a> in <strong>Microsoft Edge</strong></li>
                <li>Melde dich an</li>
                <li>Klicke in der Adresszeile auf das <strong>Installieren-Symbol</strong> <span style="font-family:monospace;background:#e5e7eb;padding:1px 5px;">⊕</span></li>
                <li>„Installieren" bestätigen – fertig!</li>
              </ol>
              <p style="margin:8px 0 0 0;font-size:12px;color:#6b7280;">Die App erscheint im Startmenü und auf dem Desktop mit dem GHBA-Logo. Edge ist auf jedem Windows-PC bereits vorinstalliert.</p>
            </td></tr>
          </table>
          <p style="margin:12px 0 6px 0;font-size:12px;color:#374151;"><strong>Ich nutze Chrome</strong> – einmalige Einstellung (1 Minute):</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border:1px solid #e5e7eb;">
            <tr><td style="padding:12px 16px;">
              <ol style="margin:0;padding-left:18px;color:#374151;line-height:2;font-size:12px;">
                <li>In Chrome diese Adresse öffnen: <span style="font-family:monospace;background:#e5e7eb;padding:1px 6px;font-size:11px;">chrome://flags/#unsafely-treat-insecure-origin-as-secure</span></li>
                <li>Das Eingabefeld auf <strong>Enabled</strong> setzen</li>
                <li>In das Textfeld eintragen: <span style="font-family:monospace;background:#e5e7eb;padding:1px 6px;font-size:11px;">${appUrl}</span></li>
                <li>Unten auf <strong>Relaunch</strong> klicken – Chrome startet neu</li>
                <li><a href="${appUrl}" style="color:#2563eb;">${appUrl}</a> öffnen → Installieren-Symbol erscheint</li>
              </ol>
            </td></tr>
          </table>
          <p style="margin:8px 0 0 0;font-size:12px;color:#9ca3af;">Alternative: <a href="${shortcutUrl}" style="color:#6b7280;">Browser-Verknüpfung herunterladen</a></p>
        </td></tr>
        <tr><td style="padding:24px 40px 0 40px;">
          <p style="font-weight:bold;color:#1e3a5f;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin:0 0 10px 0;">Was ist GHBA?</p>
          <ul style="margin:0;padding-left:20px;color:#374151;line-height:1.8;">
            <li>Besprechungsprotokolle erstellen und verwalten</li>
            <li>Maßnahmen und Aufgaben nachverfolgen</li>
            <li>Tagesordnungen vorbereiten und per E-Mail versenden</li>
            <li>Protokollketten über mehrere Besprechungen führen</li>
            <li>Projekte und Beteiligte organisieren</li>
          </ul>
          <p style="margin:10px 0 0 0;font-size:12px;color:#6b7280;">Alle Daten liegen sicher auf unserem eigenen Server – kein Cloud-Dienst, keine externen Abhängigkeiten.</p>
        </td></tr>
        <tr><td style="padding:32px 40px;text-align:center;border-top:1px solid #e5e7eb;margin-top:24px;">
          <p style="margin:0;color:#9ca3af;font-size:12px;">${esc(tpl.footer)}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  const text = [
    `Willkommen ${displayName}!`,
    '',
    tpl.greeting,
    '',
    `Adresse:      ${appUrl}`,
    `Benutzername: ${username}`,
    pwTextHint,
    '',
    'Desktop-Verknüpfung: ' + shortcutUrl,
    '',
    tpl.footer,
  ].join('\n')

  return { from, html, text, attachments: logoAttachment }
}

app.post('/api/auth/users/:username/invite', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { username } = req.params
    const user = db.users.get(username)
    if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden.' })
    if (!user.email) return res.status(400).json({ error: 'Keine E-Mail-Adresse hinterlegt.' })
    if (!mailer.mailerStatus().configured) return res.status(400).json({ error: 'E-Mail-Versand nicht konfiguriert. Bitte Graph- oder SMTP-Zugangsdaten in den Server-Einstellungen setzen.' })

    const appUrl = getAppUrl(req)
    const { from, html, text, attachments } = buildInviteMail({
      username,
      displayName:  user.display_name || username,
      email:        user.email,
      appUrl,
      isSynology:   user.source === 'synology',
      passwordNote: user.password_note,
    })

    await mailer.sendMail({
      from, to: user.email,
      subject: applyTpl(getEmailSettings().invite.subject, { name: user.display_name || username }),
      html, text, attachments,
    })

    logEvent('INVITE_SENT', req, `to=${user.email} user=${username}`)
    db.users.markInvited(username)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Synology-Benutzerliste abrufen ────────────────────────────────────────────
app.post('/api/admin/synology-list', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { username, password } = req.body
    if (!username || !password) return res.status(400).json({ error: 'Synology-Zugangsdaten erforderlich.' })
    if (!process.env.SYNOLOGY_URL)  return res.status(400).json({ error: 'SYNOLOGY_URL nicht konfiguriert.' })

    const synoUsers = await listSynologyUsers(username, password)
    if (!synoUsers) return res.status(401).json({ error: 'Anmeldung fehlgeschlagen. Bitte Zugangsdaten prüfen.' })

    const existing = db.users.list().reduce((acc, u) => { acc[u.username] = u; return acc }, {})
    const result   = synoUsers.map(u => ({
      username:    u.username,
      displayName: u.displayName,
      email:       u.email || existing[u.username]?.email || '',
      synoSource:  u.source || 'local',
      inSystem:    !!existing[u.username],
    }))

    logEvent('SYNOLOGY_LIST', req, `count=${result.length}`)
    res.json(result)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Synology-Nutzer bulk anlegen + einladen ───────────────────────────────────
app.post('/api/admin/synology-bulk-invite', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { users: list } = req.body   // [{ username, displayName, email, sendInvite }]
    if (!Array.isArray(list) || list.length === 0)
      return res.status(400).json({ error: 'Keine Nutzer angegeben.' })

    const appUrl    = getAppUrl(req)
    const canEmail  = mailer.mailerStatus().configured
    const results   = []

    for (const u of list) {
      const { username, displayName, email, sendInvite } = u
      db.users.upsertSynology(username, displayName || username, 'user')
      if (email) db.users.updateEmail(username, email)

      let invited = false; let inviteError = null
      if (sendInvite && email && canEmail) {
        try {
          const { from, html, text, attachments } = buildInviteMail({
            username, displayName: displayName || username, email, appUrl,
            isSynology: true, passwordNote: null,
          })
          await mailer.sendMail({
            from, to: email,
            subject: applyTpl(getEmailSettings().invite.subject, { name: displayName || username }),
            html, text, attachments,
          })
          invited = true
          db.users.markInvited(username)
        } catch (e) { inviteError = e.message }
      } else if (sendInvite && !email) {
        inviteError = 'Keine E-Mail-Adresse angegeben.'
      } else if (sendInvite && !canEmail) {
        inviteError = 'E-Mail-Versand nicht konfiguriert.'
      }

      results.push({ username, displayName: displayName || username, invited, inviteError })
    }

    logEvent('BULK_INVITE', req, `count=${list.length}`)
    res.json({ ok: true, results })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Aufgaben-E-Mail (projektspezifisch, pro Verantwortlicher) ─────────────────
app.post('/api/actions/send-email', requireAuth, async (req, res) => {
  try {
    const { to, responsible, projectName, projectId, items } = req.body
    if (!to || !responsible || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Ungültige Anfrage.' })
    }
    if (!mailer.mailerStatus().configured) return res.status(400).json({ error: 'E-Mail-Versand nicht konfiguriert.' })

    // Freimelde-Link (login-frei) – ein Token je Verantwortlicher + Projekt
    let releaseUrl = null
    if (projectId && db.projects.get(projectId)) {
      let tk = db.releaseTokens.find(projectId, responsible)
      if (!tk) {
        const token = auth.generateToken()
        db.releaseTokens.create({ token, projectId, responsible: String(responsible).trim(), email: to })
        tk = db.releaseTokens.getByToken(token)
      } else if (to && to !== tk.email) {
        db.releaseTokens.updateEmail(tk.token, to)
      }
      releaseUrl = `${getAppUrl(req)}/freimeldung/${tk.token}`
    }

    const from     = process.env.SMTP_FROM || process.env.GRAPH_SENDER || process.env.SMTP_USER || 'noreply@ghba'
    const today    = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const projStr  = projectName || 'Unbekanntes Projekt'
    const taskTpl  = getEmailSettings().task_assignment
    const subject  = applyTpl(taskTpl.subject, { project: projStr, date: today })

    // Absender: eingeloggter Nutzer als Reply-To + Anzeigename im From
    const sender      = req.user !== '__apikey__' && req.user !== '__anonymous__' ? db.users.get(req.user) : null
    const senderName  = sender?.display_name || null
    const replyTo     = sender?.email || null
    const fromAddress = senderName ? `"${senderName} (GHBA)" <${from}>` : from

    const STATUS_LABELS   = { offen: 'Offen', in_arbeit: 'In Arbeit', erledigt: 'Erledigt', verschoben: 'Verschoben' }
    const PRIORITY_LABELS = { hoch: 'Hoch', mittel: 'Mittel', niedrig: 'Niedrig' }
    const ART_LABELS      = { planung: 'Planung', ausfuehrung: 'Ausführung', ag: 'AG', gp: 'GP' }
    const todayIso        = new Date().toISOString().slice(0, 10)

    const rows = items.map(item => {
      const overdue     = item.deadline && item.status !== 'erledigt' && item.deadline < todayIso
      const isDone      = item.status === 'erledigt'
      const rowBg       = overdue ? '#FEF2F2' : isDone ? '#F0FDF4' : '#FFFFFF'
      const descColor   = overdue ? '#DC2626' : isDone ? '#6B7280' : '#000040'
      const deadlineFmt = item.deadline
        ? new Date(item.deadline + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : '–'
      const head    = esc(item.title || item.description || '–')
      const sub     = item.title && item.description ? `<br><span style="font-weight:normal;font-size:12px;color:#4B5563;">${esc(item.description)}</span>` : ''
      const artTag  = ART_LABELS[item.art] ? `<br><span style="display:inline-block;margin-top:3px;font-size:10px;color:#4B5563;border:1px solid #D1D5DB;padding:1px 6px;">${ART_LABELS[item.art]}</span>` : ''
      return `<tr style="background:${rowBg};border-bottom:1px solid #E5E7EB;">
        <td style="padding:9px 12px;font-size:12px;color:#6B7280;white-space:nowrap;">${esc(item._protocolNo || '–')}</td>
        <td style="padding:9px 12px;font-weight:bold;color:${descColor};">${head}${sub}${item.remarks ? `<br><span style="font-weight:normal;font-size:11px;color:#9CA3AF;">${esc(item.remarks)}</span>` : ''}${artTag}</td>
        <td style="padding:9px 12px;font-size:12px;color:${overdue ? '#DC2626' : '#374151'};white-space:nowrap;">${deadlineFmt}${overdue ? ' ⚠' : ''}</td>
        <td style="padding:9px 12px;font-size:12px;color:#374151;white-space:nowrap;">${PRIORITY_LABELS[item.priority] || '–'}</td>
        <td style="padding:9px 12px;font-size:12px;color:#374151;white-space:nowrap;">${STATUS_LABELS[item.status] || '–'}</td>
      </tr>`
    }).join('')

    const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F0F0F0;font-family:Arial,sans-serif;font-size:14px;color:#1F2937;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F0F0;padding:32px 16px;">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0" style="background:#FFF;border:1px solid #E5E7EB;max-width:620px;width:100%;">
        <tr><td style="background:#000040;padding:28px 36px;">
          <p style="margin:0;color:#8FBEFF;font-size:11px;letter-spacing:2px;text-transform:uppercase;">GHBA</p>
          <p style="margin:6px 0 0 0;color:#FBFFE6;font-size:20px;font-weight:bold;">Ihre Aufgaben</p>
          <p style="margin:4px 0 0 0;color:#8FBEFF;font-size:14px;font-weight:600;">${projStr}</p>
          <p style="margin:6px 0 0 0;color:#8FBEFF;font-size:12px;">Stand: ${today}</p>
        </td></tr>
        <tr><td style="padding:28px 36px 16px 36px;">
          <p style="margin:0;font-size:15px;color:#000040;">Guten Tag, <strong>${responsible}</strong>,</p>
          <p style="margin:10px 0 0 0;color:#4B5563;">${esc(applyTpl(taskTpl.intro, { project: projStr, count: String(items.length) }))}</p>
        </td></tr>
        ${releaseUrl ? `<tr><td style="padding:0 36px 8px 36px;">
          <table cellpadding="0" cellspacing="0"><tr><td style="background:#000040;">
            <a href="${releaseUrl}" style="display:inline-block;padding:11px 22px;color:#FBFFE6;font-size:14px;font-weight:bold;text-decoration:none;font-family:Arial,sans-serif;">Aufgaben online freimelden</a>
          </td></tr></table>
          <p style="margin:8px 0 0 0;font-size:12px;color:#6B7280;">Erledigte Aufgaben können Sie über diesen Link mit kurzer Begründung (und optional Nachweisen) freimelden. Die Freigabe erfolgt in der nächsten Besprechung.</p>
        </td></tr>` : ''}
        <tr><td style="padding:0 36px 28px 36px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-collapse:collapse;">
            <thead>
              <tr style="background:#000040;">
                <th style="padding:9px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#8FBEFF;font-weight:600;">Protokoll</th>
                <th style="padding:9px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#8FBEFF;font-weight:600;">Aufgabe</th>
                <th style="padding:9px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#8FBEFF;font-weight:600;">Frist</th>
                <th style="padding:9px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#8FBEFF;font-weight:600;">Priorität</th>
                <th style="padding:9px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#8FBEFF;font-weight:600;">Status</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </td></tr>
        <tr><td style="padding:20px 36px;border-top:1px solid #E5E7EB;background:#F0F0F0;text-align:center;">
          <p style="margin:0;color:#9CA3AF;font-size:12px;">${esc(taskTpl.footer)}${senderName ? ` · Gesendet von ${senderName}` : ''} · ${today}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`

    const text = [
      `Ihre Aufgaben – ${projStr}`,
      `Stand: ${today}`, '',
      `Guten Tag, ${responsible},`,
      '',
      applyTpl(taskTpl.intro, { project: projStr, count: String(items.length) }),
      '',
      ...items.map(item => {
        const dl = item.deadline
          ? new Date(item.deadline + 'T12:00:00').toLocaleDateString('de-DE') : '–'
        const head = item.title || item.description || '–'
        const desc = item.title && item.description ? `\n  ${item.description}` : ''
        const art  = ART_LABELS[item.art] ? ` [${ART_LABELS[item.art]}]` : ''
        return `• ${head}${art}${desc}\n  Protokoll: ${item._protocolNo || '–'} | Frist: ${dl} | Status: ${STATUS_LABELS[item.status] || item.status}`
      }),
      ...(releaseUrl ? ['', 'Aufgaben online freimelden: ' + releaseUrl] : []),
      '', taskTpl.footer,
    ].join('\n')

    // Verteiler-Empfänger des Kanals "actions" als Kopie (CC) – z. B. die
    // Projektleitung, die über jede Aufgabenzustellung informiert sein soll.
    // Der/die eigentliche(n) Empfänger (to) werden nicht dupliziert.
    const proj    = projectId ? db.projects.get(projectId) : null
    const toSet   = new Set(String(to).split(',').map(s => s.trim().toLowerCase()).filter(Boolean))
    const ccList  = distributionFor(proj, 'actions').map(r => r.email).filter(e => !toSet.has(e.toLowerCase()))
    const cc      = [...new Set(ccList)]

    await mailer.sendMail({
      from: fromAddress,
      to,
      subject,
      html,
      text,
      ...(cc.length ? { cc: cc.join(', ') } : {}),
      ...(replyTo ? { replyTo } : {}),
    })
    logEvent('ACTIONS_EMAIL_SENT', req, `to=${to} cc=${cc.join(';') || '–'} responsible=${responsible} project=${projStr} count=${items.length} sender=${senderName || req.user}`)

    // Bestätigungs-E-Mail an Projektadministratoren
    if (projectId) {
      try {
        if (proj) {
          const adminUsernames = [...new Set([
            proj.projectAdminUser,
            ...(Array.isArray(proj.projectAdmins) ? proj.projectAdmins : []),
          ].filter(Boolean))]
          const adminEmails = adminUsernames.map(u => db.users.get(u)?.email).filter(Boolean)
          if (adminEmails.length > 0) {
            const confirmSubject = `Aufgaben-E-Mail versendet – ${projStr}`
            const sentByLine = senderName ? `Versendet von <strong>${senderName}</strong>` : 'Automatischer Versand'
            const confirmHtml = `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F0F0F0;font-family:Arial,sans-serif;font-size:14px;color:#1F2937;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F0F0;padding:32px 16px;">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0" style="background:#FFF;border:1px solid #E5E7EB;max-width:580px;width:100%;">
        <tr><td style="background:#000040;padding:24px 32px;">
          <p style="margin:0;color:#8FBEFF;font-size:11px;letter-spacing:2px;text-transform:uppercase;">GHBA</p>
          <p style="margin:6px 0 0 0;color:#FBFFE6;font-size:18px;font-weight:bold;">Aufgaben-E-Mail versendet</p>
          <p style="margin:4px 0 0 0;color:#8FBEFF;font-size:13px;">${projStr}</p>
        </td></tr>
        <tr><td style="padding:24px 32px;">
          <p style="margin:0 0 12px 0;color:#4B5563;">${sentByLine} am ${today}.</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;">
            <tr style="background:#F9FAFB;">
              <td style="padding:8px 12px;font-size:12px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;width:40%;">Empfänger</td>
              <td style="padding:8px 12px;font-size:13px;color:#000040;font-weight:600;">${responsible}</td>
            </tr>
            <tr>
              <td style="padding:8px 12px;font-size:12px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;border-top:1px solid #E5E7EB;">E-Mail-Adresse</td>
              <td style="padding:8px 12px;font-size:13px;color:#374151;border-top:1px solid #E5E7EB;">${to}</td>
            </tr>
            <tr style="background:#F9FAFB;">
              <td style="padding:8px 12px;font-size:12px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;border-top:1px solid #E5E7EB;">Anzahl Aufgaben</td>
              <td style="padding:8px 12px;font-size:13px;color:#374151;border-top:1px solid #E5E7EB;">${items.length} Aufgabe${items.length !== 1 ? 'n' : ''}</td>
            </tr>
          </table>
          <p style="margin:20px 0 8px 0;font-size:13px;font-weight:600;color:#000040;">Versendete Aufgaben</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-collapse:collapse;">
            <thead>
              <tr style="background:#000040;">
                <th style="padding:9px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#8FBEFF;font-weight:600;">Protokoll</th>
                <th style="padding:9px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#8FBEFF;font-weight:600;">Aufgabe</th>
                <th style="padding:9px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#8FBEFF;font-weight:600;">Frist</th>
                <th style="padding:9px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#8FBEFF;font-weight:600;">Priorität</th>
                <th style="padding:9px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#8FBEFF;font-weight:600;">Status</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #E5E7EB;background:#F0F0F0;text-align:center;">
          <p style="margin:0;color:#9CA3AF;font-size:11px;">GHBA · Automatische Bestätigung · ${today}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
            const confirmText = [
              `Aufgaben-E-Mail versendet – ${projStr}`,
              '',
              `${sentByLine.replace(/<[^>]+>/g, '')} am ${today}.`,
              '',
              `Empfänger:    ${responsible}`,
              `E-Mail:       ${to}`,
              `Aufgaben:     ${items.length}`,
              '',
              'Versendete Aufgaben:',
              ...items.map(item => {
                const dl   = item.deadline ? new Date(item.deadline + 'T12:00:00').toLocaleDateString('de-DE') : '–'
                const head = item.title || item.description || '–'
                const desc = item.title && item.description ? `\n  ${item.description}` : ''
                const art  = ART_LABELS[item.art] ? ` [${ART_LABELS[item.art]}]` : ''
                return `• ${head}${art}${desc}\n  Protokoll: ${item._protocolNo || '–'} | Frist: ${dl} | Status: ${STATUS_LABELS[item.status] || item.status}`
              }),
              '',
              'GHBA · Automatische Bestätigung',
            ].join('\n')
            for (const adminEmail of adminEmails) {
              mailer.sendMail({
                from: fromAddress,
                to: adminEmail,
                subject: confirmSubject,
                html: confirmHtml,
                text: confirmText,
              }).catch(() => {})
            }
          }
        }
      } catch (_) {}
    }

    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Alle Kontakte aus Projekten (für Nutzer-Import) ───────────────────────────
app.get('/api/admin/contacts', requireAuth, requireAdmin, (_req, res) => {
  try {
    const projects  = db.projects.list()
    const contacts  = []
    for (const p of projects) {
      const list = Array.isArray(p.contacts) ? p.contacts : []
      for (const c of list) {
        if (c.name || c.email) contacts.push({ ...c, projectName: p.name })
      }
    }
    res.json(contacts)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── User settings API ─────────────────────────────────────────────────────────
app.get('/api/auth/users/:username/settings', requireAuth, (req, res) => {
  try {
    const { username } = req.params
    if (req.user !== username) return res.status(403).json({ error: 'Kein Zugriff.' })
    res.json(db.users.getSettings(username))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.put('/api/auth/users/:username/settings', requireAuth, (req, res) => {
  try {
    const { username } = req.params
    if (req.user !== username) return res.status(403).json({ error: 'Kein Zugriff.' })
    const settings = req.body
    if (typeof settings !== 'object' || settings === null) return res.status(400).json({ error: 'Ungültige Einstellungen.' })
    db.users.updateSettings(username, settings)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Kontakt-Nutzungshäufigkeit (pro Nutzer, isoliert von den User-Settings) ────
// Speichert je Nutzer eine Map { key: { count, last } } im app_state. Dient nur
// der Sortierung „meistgenutzte Kontakte zuerst" und ist rein persönlich.
const contactUsageKey = (user) => `contact_usage:${user}`
app.get('/api/contact-usage', requireAuth, (req, res) => {
  try {
    const raw = db.appState.get(contactUsageKey(req.user))
    let usage = {}
    if (raw) { try { usage = JSON.parse(raw) } catch {} }
    res.json({ usage })
  } catch (e) { res.status(500).json({ error: e.message }) }
})
app.put('/api/contact-usage', requireAuth, writeLimiter, (req, res) => {
  try {
    const usage = req.body?.usage
    if (typeof usage !== 'object' || usage === null || Array.isArray(usage)) {
      return res.status(400).json({ error: '"usage"-Objekt erwartet.' })
    }
    // Nur { count:Number, last:Number } je Schlüssel, gedeckelt auf 500 Einträge.
    const clean = {}
    for (const [k, v] of Object.entries(usage).slice(0, 500)) {
      if (typeof k !== 'string' || !k) continue
      const count = Number(v?.count); const last = Number(v?.last)
      if (!Number.isFinite(count) || count <= 0) continue
      clean[k.slice(0, 200)] = { count: Math.min(count, 1e6), last: Number.isFinite(last) ? last : 0 }
    }
    db.appState.set(contactUsageKey(req.user), JSON.stringify(clean))
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Attachment API ────────────────────────────────────────────────────────────
// ID validation helper used in all three routes.
function validAttachmentId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]+$/.test(id)
}

// POST /api/attachments  { id, data: base64 }
app.post('/api/attachments', requireAuth, writeLimiter, async (req, res) => {
  try {
    const { id, data } = req.body
    if (!validAttachmentId(id) || typeof data !== 'string') {
      return res.status(400).json({ error: '"id" (alphanumerisch) und "data" (base64) erwartet.' })
    }
    // Idempotent: if the file already exists we skip re-writing it.
    if (await attachments.exists(id)) return res.json({ ok: true, id })
    await attachments.save(id, data)
    res.status(201).json({ ok: true, id })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// GET /api/attachments/:id  → { id, data: base64 }
app.get('/api/attachments/:id', requireAuth, async (req, res) => {
  try {
    if (!validAttachmentId(req.params.id)) return res.status(400).json({ error: 'Ungültige ID.' })
    const data = await attachments.load(req.params.id)
    if (!data) return res.status(404).json({ error: 'Anhang nicht gefunden.' })
    res.json({ id: req.params.id, data })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// DELETE /api/attachments/:id
app.delete('/api/attachments/:id', requireAuth, writeLimiter, async (req, res) => {
  try {
    if (!validAttachmentId(req.params.id)) return res.status(400).json({ error: 'Ungültige ID.' })
    await attachments.remove(req.params.id)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── BIM / IFC-Modell ─────────────────────────────────────────────────────────
const BIM_DIR = path.join(process.env.DB_PATH || path.join(__dirname, '../data'), 'ifc')
fs.mkdirSync(BIM_DIR, { recursive: true })

// ── Learning-Plattform (Schulungsvideos) ────────────────────────────────────
const LEARNING_DIR = path.join(process.env.DB_PATH || path.join(__dirname, '../data'), 'learning')
fs.mkdirSync(LEARNING_DIR, { recursive: true })

// ── 2D-Pläne (Grundrisse, Schnitte, Ansichten – PDF/Bild je Projekt) ─────────
const PLANS_DIR = path.join(process.env.DB_PATH || path.join(__dirname, '../data'), 'plans')
fs.mkdirSync(PLANS_DIR, { recursive: true })

// ── Projekt-Archiv (Gesamtprotokoll-PDF bei Archivierung) ────────────────────
const ARCHIVE_DIR = path.join(process.env.DB_PATH || path.join(__dirname, '../data'), 'archives')
fs.mkdirSync(ARCHIVE_DIR, { recursive: true })

// POST – Gesamtprotokoll-PDF ablegen (wird beim Archivieren im Browser erzeugt)
app.post('/api/projects/:id/archive-pdf', requireAuth, writeLimiter, (req, res) => {
  try {
    const project = getAccessibleProject(req, res)
    if (!project) return
    const { pdfBase64 } = req.body
    if (!pdfBase64) return res.status(400).json({ error: 'Kein PDF übergeben.' })

    const buf      = Buffer.from(pdfBase64, 'base64')
    const filePath = path.join(ARCHIVE_DIR, `${req.params.id}.pdf`)
    fs.writeFileSync(filePath, buf)
    logEvent('PROJECT_ARCHIVE_PDF', req, `project=${req.params.id} size=${buf.length}`)
    res.status(201).json({ ok: true, size: buf.length, createdAt: new Date().toISOString() })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// GET – archiviertes Gesamtprotokoll abrufen (Auth über Header ODER ?token=)
app.get('/api/projects/:id/archive-pdf', (req, res) => {
  try {
    const authHeader = req.headers['authorization']
    const headerTok  = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    const token      = headerTok || req.query.token
    const username   = (token && resolveToken(token))
      || (API_KEY && req.headers['x-api-key'] === API_KEY ? '__apikey__' : null)
      || (!db.users.hasAny() ? '__anonymous__' : null)
    if (!username) return res.status(401).json({ error: 'Nicht angemeldet.' })

    const project = db.projects.get(req.params.id)
    if (!project) return res.status(404).json({ error: 'Projekt nicht gefunden.' })
    if (db.users.hasAny() && !canAccessProject(project, username)) {
      return res.status(403).json({ error: 'Kein Zugriff auf dieses Projekt.' })
    }

    const filePath = path.join(ARCHIVE_DIR, `${req.params.id}.pdf`)
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Kein Archiv-PDF vorhanden.' })
    const name    = (project?.name || 'Projekt').replace(/[^a-zA-Z0-9äöüÄÖÜß ._-]/g, '_')
    const stat    = fs.statSync(filePath)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Length', stat.size)
    res.setHeader('Content-Disposition', `attachment; filename="Gesamtprotokoll_${name}.pdf"`)
    fs.createReadStream(filePath).pipe(res)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST /api/projects/:id/bim  (Content-Type: application/octet-stream, X-Filename header)
app.post('/api/projects/:id/bim', requireAuth, writeLimiter,
  express.raw({ type: 'application/octet-stream', limit: '500mb' }),
  (req, res) => {
    try {
      const project = getAccessibleProject(req, res)
      if (!project) return

      const filename  = (req.headers['x-filename'] || 'model.ifc').replace(/[^a-zA-Z0-9._-]/g, '_')
      const filePath  = path.join(BIM_DIR, `${req.params.id}.ifc`)

      fs.writeFileSync(filePath, req.body)

      const stat    = fs.statSync(filePath)
      const bimMeta = {
        filename,
        size:       stat.size,
        uploadedAt: new Date().toISOString(),
        uploadedBy: req.user?.displayName || req.user?.username || 'Unbekannt',
      }
      const { _version, _updatedAt, ...pData } = project
      const updated = { ...pData, bimMeta, updatedAt: bimMeta.uploadedAt }
      db.projects.update(req.params.id, updated, _version, req.user)
      broadcast('project', 'update', req.params.id, updated.updatedAt)
      logEvent('BIM_UPLOAD', req, `project=${req.params.id} file=${filename} size=${stat.size}`)
      res.status(201).json({ ok: true, bimMeta })
    } catch (e) { res.status(500).json({ error: e.message }) }
  }
)

// GET /api/projects/:id/bim  → IFC-Datei streamen
app.get('/api/projects/:id/bim', requireAuth, (req, res) => {
  try {
    if (!getAccessibleProject(req, res)) return
    const filePath = path.join(BIM_DIR, `${req.params.id}.ifc`)
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Kein BIM-Modell vorhanden.' })
    const stat = fs.statSync(filePath)
    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Length', stat.size)
    res.setHeader('Content-Disposition', `inline; filename="${req.params.id}.ifc"`)
    res.setHeader('Cache-Control', 'private, max-age=300')
    fs.createReadStream(filePath).pipe(res)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── In-App-Benachrichtigungen ────────────────────────────────────────────────
function notifyUsers(usernames, type, text, projectId = null) {
  const seen = new Set()
  for (const u of usernames) {
    if (!u || u === '__apikey__' || u === '__anonymous__' || seen.has(u)) continue
    seen.add(u)
    if (!db.users.get(u)) continue
    try { db.notifications.create({ id: serverUid(), username: u, type, text, projectId }) }
    catch (e) { console.warn('[notify]', e.message) }
  }
}
function adminUsernames() {
  return db.users.list().filter(u => u.role === 'admin').map(u => u.username)
}
function projectManagerUsernames(project) {
  return [...adminUsernames(), project?.projectAdminUser, ...(project?.projectAdmins ?? [])].filter(Boolean)
}

app.get('/api/notifications', requireAuth, (req, res) => {
  try {
    if (req.user === '__apikey__' || req.user === '__anonymous__') return res.json({ unread: 0, items: [] })
    res.json({
      unread: db.notifications.unreadCount(req.user),
      items:  db.notifications.listFor(req.user),
    })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/notifications/read', requireAuth, (req, res) => {
  try {
    if (req.user !== '__apikey__' && req.user !== '__anonymous__') db.notifications.markAllRead(req.user)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Projekt laden + Zugriff des angemeldeten Nutzers prüfen. Sendet 404/403
// selbst und gibt dann null zurück – Aufrufer bricht einfach ab.
// (canAccessProject/isProjectAdmin sind weiter unten definiert – hoisted.)
function getAccessibleProject(req, res) {
  const project = db.projects.get(req.params.id)
  if (!project) { res.status(404).json({ error: 'Projekt nicht gefunden.' }); return null }
  if (!canAccessProject(project, req.user)) {
    logEvent('PROJECT_ACCESS_DENIED', req, `project=${req.params.id}`)
    res.status(403).json({ error: 'Kein Zugriff auf dieses Projekt.' })
    return null
  }
  return project
}

// ── BIM Issues ────────────────────────────────────────────────────────────────
app.get('/api/projects/:id/bim-issues', requireAuth, (req, res) => {
  try {
    if (!getAccessibleProject(req, res)) return
    const all = db.bimIssues.list()
    res.json(all.filter(i => i.projectId === req.params.id))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/projects/:id/bim-issues', requireAuth, writeLimiter, (req, res) => {
  try {
    if (!getAccessibleProject(req, res)) return
    const id   = require('crypto').randomBytes(12).toString('base64url')
    const now  = new Date().toISOString()
    const data = {
      id,
      projectId:   req.params.id,
      title:       req.body.title       || 'Unbenanntes Issue',
      description: req.body.description || '',
      type:        req.body.type        || 'info',
      status:      req.body.status      || 'offen',
      priority:    req.body.priority    || 'mittel',
      assignedTo:  req.body.assignedTo  || '',
      dueDate:     req.body.dueDate     || '',
      viewpoint:   req.body.viewpoint   || null,
      createdBy:   req.user?.displayName || req.user?.username || '',
      createdAt:   now,
      updatedAt:   now,
    }
    db.bimIssues.create(data, req.user?.username)
    res.status(201).json(data)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.patch('/api/projects/:id/bim-issues/:issueId', requireAuth, writeLimiter, (req, res) => {
  try {
    if (!getAccessibleProject(req, res)) return
    const { data, version } = req.body
    const updated = { ...data, updatedAt: new Date().toISOString() }
    const result  = db.bimIssues.update(req.params.issueId, updated, version, req.user?.username)
    if (result.notFound)  return res.status(404).json({ error: 'Nicht gefunden.' })
    if (result.conflict)  return res.status(409).json({ conflict: true, ...result })
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/projects/:id/bim-issues/:issueId', requireAuth, writeLimiter, (req, res) => {
  try {
    if (!getAccessibleProject(req, res)) return
    db.bimIssues.delete(req.params.issueId)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Planprüfung: Prüfvermerke auf 2D-Plänen (mit optionaler 3D-Verknüpfung) ────
// Projekt- und plangebunden. Prüfberechtigte werden aus den Projektkontakten
// gewählt. Verknüpfbar mit Protokoll (wie BIM-Issue) und per E-Mail versendbar.
app.get('/api/projects/:id/plan-reviews', requireAuth, (req, res) => {
  try {
    if (!getAccessibleProject(req, res)) return
    let all = db.planReviews.list().filter(r => r.projectId === req.params.id)
    if (req.query.planId) all = all.filter(r => r.planId === req.query.planId)
    all.sort((a, b) => (a.no ?? 0) - (b.no ?? 0) || (a.createdAt || '').localeCompare(b.createdAt || ''))
    res.json(all)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/projects/:id/plan-reviews', requireAuth, writeLimiter, (req, res) => {
  try {
    if (!getAccessibleProject(req, res)) return
    const id  = require('crypto').randomBytes(12).toString('base64url')
    const now = new Date().toISOString()
    const existing = db.planReviews.list().filter(r => r.projectId === req.params.id)
    const maxNo = existing.reduce((m, r) => Math.max(m, r.no ?? 0), 0)
    const data = {
      id,
      projectId:     req.params.id,
      planId:        req.body.planId       || null,
      planTitle:     req.body.planTitle    || '',
      no:            maxNo + 1,
      title:         req.body.title        || 'Prüfvermerk',
      description:   req.body.description  || '',
      type:          req.body.type         || 'pruefung',   // pruefung|mangel|hinweis|freigabe
      status:        req.body.status       || 'offen',      // offen|in_pruefung|geprueft|freigegeben|abgelehnt
      priority:      req.body.priority     || 'mittel',
      assignedTo:    req.body.assignedTo   || '',           // Prüfberechtigter (aus Projektkontakten)
      assignedEmail: req.body.assignedEmail || '',
      dueDate:       req.body.dueDate      || '',
      position:      req.body.position     || null,          // { x, y } normalisiert (nur Bildpläne)
      viewpoint:     req.body.viewpoint    || null,          // 3D-Standpunkt (optional)
      createdBy:     planDisplayName(req.user),
      createdAt:     now,
      updatedAt:     now,
    }
    db.planReviews.create(data, req.user)
    broadcast('plan_review', 'create', id, now)
    logEvent('PLAN_REVIEW_CREATE', req, `project=${req.params.id} id=${id}`)
    res.status(201).json(data)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.patch('/api/projects/:id/plan-reviews/:reviewId', requireAuth, writeLimiter, (req, res) => {
  try {
    if (!getAccessibleProject(req, res)) return
    const { data, version } = req.body
    const updated = { ...data, updatedAt: new Date().toISOString() }
    const result  = db.planReviews.update(req.params.reviewId, updated, version, req.user)
    if (result.notFound)  return res.status(404).json({ error: 'Nicht gefunden.' })
    if (result.conflict)  return res.status(409).json({ conflict: true, ...result })
    broadcast('plan_review', 'update', req.params.reviewId, updated.updatedAt)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/projects/:id/plan-reviews/:reviewId', requireAuth, writeLimiter, (req, res) => {
  try {
    if (!getAccessibleProject(req, res)) return
    db.planReviews.delete(req.params.reviewId)
    broadcast('plan_review', 'delete', req.params.reviewId, new Date().toISOString())
    logEvent('PLAN_REVIEW_DELETE', req, `project=${req.params.id} id=${req.params.reviewId}`)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST – Prüfvermerk per E-Mail an den Prüfberechtigten senden
app.post('/api/projects/:id/plan-reviews/:reviewId/send-email', requireAuth, async (req, res) => {
  try {
    if (!getAccessibleProject(req, res)) return
    if (!mailer.mailerStatus().configured) return res.status(400).json({ error: 'E-Mail-Versand nicht konfiguriert.' })
    const review = db.planReviews.get(req.params.reviewId)
    if (!review || review.projectId !== req.params.id) return res.status(404).json({ error: 'Prüfvermerk nicht gefunden.' })

    const to = (req.body.to || review.assignedEmail || '').trim()
    if (!to) return res.status(400).json({ error: 'Keine Empfänger-E-Mail vorhanden.' })

    const project  = db.projects.get(req.params.id)
    const projStr  = project?.name || 'Projekt'
    const tpl      = getEmailSettings().plan_review
    const TYPE_DE  = { pruefung: 'Prüfung', mangel: 'Mangel', hinweis: 'Hinweis', freigabe: 'Freigabe' }
    const STAT_DE  = { offen: 'Offen', in_pruefung: 'In Prüfung', geprueft: 'Geprüft', freigegeben: 'Freigegeben', abgelehnt: 'Abgelehnt' }
    const dueStr   = review.dueDate ? new Date(review.dueDate + 'T12:00:00').toLocaleDateString('de-DE') : '–'
    const vars = {
      project:   projStr,
      plan:      review.planTitle || '–',
      reviewer:  review.assignedTo || '',
      title:     review.title || '',
      type:      TYPE_DE[review.type] || review.type,
      status:    STAT_DE[review.status] || review.status,
      due:       dueStr,
    }

    const from        = process.env.SMTP_FROM || process.env.GRAPH_SENDER || process.env.SMTP_USER || 'noreply@ghba'
    const sender      = req.user !== '__apikey__' && req.user !== '__anonymous__' ? db.users.get(req.user) : null
    const senderName  = sender?.display_name || null
    const replyTo     = sender?.email || null
    const fromAddress = senderName ? `"${senderName} (GHBA)" <${from}>` : from
    const subject     = applyTpl(tpl.subject, vars)
    const appUrl      = getAppUrl(req)

    const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#222;font-size:14px;line-height:1.5">
      <p>Guten Tag${review.assignedTo ? ' ' + esc(review.assignedTo) : ''},</p>
      <p>${esc(applyTpl(tpl.intro, vars))}</p>
      <table style="border-collapse:collapse;margin:12px 0">
        <tr><td style="padding:2px 10px 2px 0;color:#666">Plan</td><td style="padding:2px 0"><strong>${esc(vars.plan)}</strong></td></tr>
        <tr><td style="padding:2px 10px 2px 0;color:#666">Prüfvermerk</td><td style="padding:2px 0"><strong>${esc(vars.title)}</strong></td></tr>
        <tr><td style="padding:2px 10px 2px 0;color:#666">Art</td><td style="padding:2px 0">${esc(vars.type)}</td></tr>
        <tr><td style="padding:2px 10px 2px 0;color:#666">Status</td><td style="padding:2px 0">${esc(vars.status)}</td></tr>
        <tr><td style="padding:2px 10px 2px 0;color:#666">Frist</td><td style="padding:2px 0">${esc(vars.due)}</td></tr>
      </table>
      ${review.description ? `<p style="white-space:pre-wrap;border-left:3px solid #ccc;padding-left:10px;color:#444">${esc(review.description)}</p>` : ''}
      <p><a href="${appUrl}" style="color:#2563eb">Zur Anwendung</a></p>
      <p style="color:#888;margin-top:18px">${esc(tpl.footer)}</p>
    </body></html>`

    const text = [
      `Guten Tag${review.assignedTo ? ' ' + review.assignedTo : ''},`, '',
      applyTpl(tpl.intro, vars), '',
      `Plan:        ${vars.plan}`,
      `Prüfvermerk: ${vars.title}`,
      `Art:         ${vars.type}`,
      `Status:      ${vars.status}`,
      `Frist:       ${vars.due}`,
      review.description ? `\n${review.description}` : '',
      '', appUrl, '', tpl.footer,
    ].join('\n')

    await mailer.sendMail({ from: fromAddress, to, subject, html, text, ...(replyTo ? { replyTo } : {}) })

    // Zeitstempel des Versands am Prüfvermerk vermerken
    const { _version, _updatedAt, ...rData } = review
    db.planReviews.update(review.id, { ...rData, notifiedAt: new Date().toISOString() }, _version, req.user)
    logEvent('PLAN_REVIEW_EMAIL', req, `to=${to} id=${review.id} project=${req.params.id}`)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// DELETE /api/projects/:id/bim  → Modell entfernen
app.delete('/api/projects/:id/bim', requireAuth, writeLimiter, (req, res) => {
  try {
    const project = getAccessibleProject(req, res)
    if (!project) return

    const filePath = path.join(BIM_DIR, `${req.params.id}.ifc`)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)

    const { _version, _updatedAt, bimMeta: _bimMeta, ...pData } = project
    const updated = { ...pData, updatedAt: new Date().toISOString() }
    db.projects.update(req.params.id, updated, _version, req.user)
    broadcast('project', 'update', req.params.id, updated.updatedAt)
    logEvent('BIM_DELETE', req, `project=${req.params.id}`)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── 2D-Pläne: Grundrisse, Schnitte, Ansichten ────────────────────────────────
// Projektbezogen. Lesen: jeder angemeldete Nutzer. Schreiben: requireAuth (UI
// gated auf Projekt-/Systemadmin, analog zum BIM-Modell-Upload).
const planDisplayName = (reqUser) => {
  if (!reqUser || reqUser === '__anonymous__' || reqUser === '__apikey__') return 'Unbekannt'
  const u = db.users.get(reqUser)
  return u?.display_name || reqUser
}

// GET – alle Pläne eines Projekts (Metadaten)
app.get('/api/projects/:id/plans', requireAuth, (req, res) => {
  try {
    if (!getAccessibleProject(req, res)) return
    const all = db.bimPlans.list().filter(p => p.projectId === req.params.id)
    all.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)
      || (a.createdAt || '').localeCompare(b.createdAt || ''))
    res.json(all)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST – neuen Plan (Metadaten) anlegen; Datei folgt separat
app.post('/api/projects/:id/plans', requireAuth, writeLimiter, (req, res) => {
  try {
    if (!getAccessibleProject(req, res)) return
    const id  = require('crypto').randomBytes(12).toString('base64url')
    const now = new Date().toISOString()
    const existing = db.bimPlans.list().filter(p => p.projectId === req.params.id)
    const maxOrder = existing.reduce((m, p) => Math.max(m, p.order ?? 0), 0)
    const data = {
      id,
      projectId:   req.params.id,
      title:       req.body.title       || 'Neuer Plan',
      description: req.body.description || '',
      planType:    req.body.planType    || 'grundriss',  // grundriss|schnitt|ansicht|lageplan|sonstige
      order:       typeof req.body.order === 'number' ? req.body.order : maxOrder + 1,
      filename:    '',
      size:        0,
      mimeType:    '',
      hasFile:     false,
      uploadedAt:  null,
      uploadedBy:  '',
      createdBy:   planDisplayName(req.user),
      createdAt:   now,
      updatedAt:   now,
    }
    db.bimPlans.create(data, req.user)
    logEvent('PLAN_CREATE', req, `project=${req.params.id} id=${id}`)
    res.status(201).json(data)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST – Plandatei hochladen (PDF/Bild); Content-Type: application/octet-stream
app.post('/api/projects/:id/plans/:planId/file', requireAuth, writeLimiter,
  express.raw({ type: 'application/octet-stream', limit: '200mb' }),
  (req, res) => {
    try {
      if (!getAccessibleProject(req, res)) return
      const plan = db.bimPlans.get(req.params.planId)
      if (!plan || plan.projectId !== req.params.id) return res.status(404).json({ error: 'Plan nicht gefunden.' })

      const filename = (req.headers['x-filename'] || 'plan.pdf').replace(/[^a-zA-Z0-9._-]/g, '_')
      const mimeType = req.headers['x-mimetype'] || 'application/pdf'
      const filePath = path.join(PLANS_DIR, req.params.planId)

      fs.writeFileSync(filePath, req.body)
      const stat = fs.statSync(filePath)

      const { _version, _updatedAt, ...pData } = plan
      const now     = new Date().toISOString()
      const updated = {
        ...pData, filename, mimeType, size: stat.size, hasFile: true,
        uploadedAt: now, uploadedBy: planDisplayName(req.user), updatedAt: now,
      }
      db.bimPlans.update(req.params.planId, updated, _version, req.user)
      logEvent('PLAN_UPLOAD', req, `project=${req.params.id} id=${req.params.planId} file=${filename} size=${stat.size}`)
      res.status(201).json(updated)
    } catch (e) { res.status(500).json({ error: e.message }) }
  }
)

// GET – Plandatei ausliefern (Range-Support; Auth über Header ODER ?token=,
// damit <embed>/<img> ohne Header authentifizieren können)
app.get('/api/projects/:id/plans/:planId/file', (req, res) => {
  try {
    const authHeader = req.headers['authorization']
    const headerTok  = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    const token      = headerTok || req.query.token
    const username   = (token && resolveToken(token))
      || (API_KEY && req.headers['x-api-key'] === API_KEY ? '__apikey__' : null)
      || (!db.users.hasAny() ? '__anonymous__' : null)
    if (!username) return res.status(401).json({ error: 'Nicht angemeldet.' })

    const project = db.projects.get(req.params.id)
    if (!project) return res.status(404).json({ error: 'Projekt nicht gefunden.' })
    if (db.users.hasAny() && !canAccessProject(project, username)) {
      return res.status(403).json({ error: 'Kein Zugriff auf dieses Projekt.' })
    }

    const plan     = db.bimPlans.get(req.params.planId)
    const filePath = path.join(PLANS_DIR, req.params.planId)
    if (!plan || plan.projectId !== req.params.id || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Kein Plan vorhanden.' })
    }
    const stat     = fs.statSync(filePath)
    const mimeType = plan.mimeType || 'application/pdf'
    res.setHeader('Content-Type',        mimeType)
    res.setHeader('Content-Length',      stat.size)
    res.setHeader('Content-Disposition', `inline; filename="${plan.filename || 'plan'}"`)
    res.setHeader('Cache-Control',       'private, max-age=300')
    fs.createReadStream(filePath).pipe(res)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// PATCH – Plan-Metadaten ändern
app.patch('/api/projects/:id/plans/:planId', requireAuth, writeLimiter, (req, res) => {
  try {
    if (!getAccessibleProject(req, res)) return
    const plan = db.bimPlans.get(req.params.planId)
    if (!plan || plan.projectId !== req.params.id) return res.status(404).json({ error: 'Plan nicht gefunden.' })
    const { _version, _updatedAt, ...pData } = plan
    const allowed = (({ title, description, planType, order }) => ({ title, description, planType, order }))(req.body)
    const updated = { ...pData, ...Object.fromEntries(Object.entries(allowed).filter(([, v]) => v !== undefined)), updatedAt: new Date().toISOString() }
    const result  = db.bimPlans.update(req.params.planId, updated, _version, req.user)
    if (result.notFound) return res.status(404).json({ error: 'Nicht gefunden.' })
    if (result.conflict) return res.status(409).json({ conflict: true, ...result })
    logEvent('PLAN_UPDATE', req, `project=${req.params.id} id=${req.params.planId}`)
    res.json(updated)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// DELETE – Plan + Datei löschen
app.delete('/api/projects/:id/plans/:planId', requireAuth, writeLimiter, (req, res) => {
  try {
    if (!getAccessibleProject(req, res)) return
    const plan = db.bimPlans.get(req.params.planId)
    if (plan && plan.projectId !== req.params.id) return res.status(404).json({ error: 'Plan nicht gefunden.' })
    const filePath = path.join(PLANS_DIR, req.params.planId)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    db.bimPlans.delete(req.params.planId)
    logEvent('PLAN_DELETE', req, `project=${req.params.id} id=${req.params.planId}`)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Generische projektgebundene CRUD-Routen (Bautagebuch, Mängel) ────────────
function mountProjectStore(route, store, label) {
  app.get(`/api/projects/:id/${route}`, requireAuth, (req, res) => {
    try {
      if (!getAccessibleProject(req, res)) return
      res.json(store.list().filter(x => x.projectId === req.params.id))
    } catch (e) { res.status(500).json({ error: e.message }) }
  })
  app.post(`/api/projects/:id/${route}`, requireAuth, writeLimiter, (req, res) => {
    try {
      if (!getAccessibleProject(req, res)) return
      const id  = require('crypto').randomBytes(12).toString('base64url')
      const now = new Date().toISOString()
      const data = { ...req.body, id, projectId: req.params.id, createdBy: planDisplayName(req.user), createdAt: now, updatedAt: now }
      store.create(data, req.user)
      broadcast(label, 'create', id, now)
      res.status(201).json(data)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })
  app.patch(`/api/projects/:id/${route}/:itemId`, requireAuth, writeLimiter, (req, res) => {
    try {
      if (!getAccessibleProject(req, res)) return
      const { data, version } = req.body
      const updated = { ...data, updatedAt: new Date().toISOString() }
      const result  = store.update(req.params.itemId, updated, version, req.user)
      if (result.notFound) return res.status(404).json({ error: 'Nicht gefunden.' })
      if (result.conflict) return res.status(409).json({ conflict: true, ...result })
      broadcast(label, 'update', req.params.itemId, updated.updatedAt)
      res.json({ ok: true, version: result.version })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })
  app.delete(`/api/projects/:id/${route}/:itemId`, requireAuth, writeLimiter, (req, res) => {
    try {
      if (!getAccessibleProject(req, res)) return
      store.delete(req.params.itemId)
      broadcast(label, 'delete', req.params.itemId, new Date().toISOString())
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })
}
mountProjectStore('diary',   db.diaryEntries, 'diary')
mountProjectStore('defects', db.defects,      'defect')

// ── Wetter für die Baudokumentation ──────────────────────────────────────────
// Ermittelt das Wetter für Datum + Tageshälfte am Projektstandort (Anschrift des
// Bauherrn aus den Projektdaten). Genutzt wird Open-Meteo: kostenlos, ohne
// API-Schlüssel. Läuft bewusst serverseitig – so funktioniert es auch mobil und
// die Adresse verlässt nicht den Browser des Nutzers.
// Voraussetzung: Der Server hat Internetzugang. Ohne Zugang liefert die Route
// einen erklärenden Fehler; die manuelle Auswahl bleibt davon unberührt.
const GEO_CACHE = new Map()   // "plz ort" → { lat, lon, name }

// Der Geocoder sucht nach ORTSNAMEN – eine vorangestellte PLZ liefert keine
// Treffer. Ebenso wird "Duesseldorf" nicht gefunden, "Düsseldorf" schon.
// Daher mehrere Schreibweisen der Reihe nach probieren.
const umlautBack = (s) => s
  .replace(/ue/gi, m => (m[0] === 'U' ? 'Ü' : 'ü'))
  .replace(/oe/gi, m => (m[0] === 'O' ? 'Ö' : 'ö'))
  .replace(/ae/gi, m => (m[0] === 'A' ? 'Ä' : 'ä'))

async function geocodeOnce(name) {
  const url = 'https://geocoding-api.open-meteo.com/v1/search'
    + `?name=${encodeURIComponent(name)}&count=1&language=de&format=json`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Geocoding fehlgeschlagen (${res.status})`)
  const hit = (await res.json())?.results?.[0]
  return hit ? { lat: hit.latitude, lon: hit.longitude, name: [hit.name, hit.admin1].filter(Boolean).join(', ') } : null
}

async function geocode(city) {
  const base = String(city || '').trim()
  if (!base) return null
  const key = base.toLowerCase()
  if (GEO_CACHE.has(key)) return GEO_CACHE.get(key)

  const varianten = [...new Set([base, umlautBack(base)])]
  let out = null
  for (const v of varianten) {
    out = await geocodeOnce(v)
    if (out) break
  }
  GEO_CACHE.set(key, out)
  return out
}

// WMO-Wettercode → die vier Kategorien der Baudokumentation
function wmoToWeather(code) {
  if (code == null) return 'bewoelkt'
  if (code >= 71 && code <= 77) return 'schnee'
  if (code >= 85 && code <= 86) return 'schnee'
  if (code >= 51 && code <= 67) return 'regen'
  if (code >= 80 && code <= 82) return 'regen'
  if (code >= 95)               return 'regen'   // Gewitter
  if (code === 0 || code === 1) return 'sonnig'
  return 'bewoelkt'
}

// Wetterwerte einer Quelle für Datum + Tageszeit auswerten.
// Liefert null, wenn die Quelle für den Zeitraum keine Stundenwerte hat.
async function weatherFrom(baseUrl, geo, date, from, to) {
  const url = baseUrl
    + `?latitude=${geo.lat}&longitude=${geo.lon}`
    + '&hourly=temperature_2m,weather_code'
    + `&start_date=${date}&end_date=${date}&timezone=Europe%2FBerlin`
  const wres = await fetch(url)
  // 400 = Datum außerhalb des Zeitraums dieser Quelle → als "keine Daten" behandeln,
  // damit die andere Quelle es versuchen kann.
  if (wres.status === 400) return null
  if (!wres.ok) throw new Error(`Wetterdienst antwortete mit ${wres.status}`)
  const w = await wres.json()

  const times = w?.hourly?.time || []
  const temps = w?.hourly?.temperature_2m || []
  const codes = w?.hourly?.weather_code || []
  const idx = times.map((t, i) => ({ h: Number(String(t).slice(11, 13)), i }))
    .filter(x => x.h >= from && x.h < to).map(x => x.i)
  const vals = idx.map(i => temps[i]).filter(v => typeof v === 'number')
  if (vals.length === 0) return null

  // Häufigster Wettercode im Zeitraum bestimmt die Kategorie
  const counts = {}
  for (const i of idx) { const c = codes[i]; if (c != null) counts[c] = (counts[c] || 0) + 1 }
  const domCode = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0]

  return {
    weather: wmoToWeather(domCode == null ? null : Number(domCode)),
    tempMin: Math.round(Math.min(...vals)),
    tempMax: Math.round(Math.max(...vals)),
  }
}

app.get('/api/projects/:id/weather', requireAuth, async (req, res) => {
  try {
    const project = getAccessibleProject(req, res)
    if (!project) return

    const date   = String(req.query.date || '').slice(0, 10)
    const half   = req.query.half === 'nachmittag' ? 'nachmittag' : 'vormittag'
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Datum (YYYY-MM-DD) erwartet.' })

    // Standort = Ort aus der Anschrift in den Projektdaten (Bauherr)
    const bh   = project.projectData?.bauherr || {}
    const city = String(bh.city || '').trim()
    if (!city) {
      return res.status(400).json({ error: 'Kein Projektstandort hinterlegt. Bitte in den Projektdaten den Ort der Anschrift eintragen.' })
    }

    const geo = await geocode(city)
    if (!geo) return res.status(404).json({ error: `Ort „${city}" nicht gefunden – bitte Schreibweise in den Projektdaten prüfen.` })

    // Vormittag 06–12 Uhr, Nachmittag 12–18 Uhr (Mittelwert über den Zeitraum)
    const [from, to] = half === 'vormittag' ? [6, 12] : [12, 18]

    // Das Wetter gehört zum Datum der Begehung – auch wenn diese länger zurückliegt.
    // Der Vorhersagedienst deckt nur die letzten ~3 Monate ab, weiter zurück
    // liefert das Archiv die Messwerte. Reihenfolge nach Alter des Datums,
    // die jeweils andere Quelle springt ein, wenn die erste nichts hat.
    const FORECAST = 'https://api.open-meteo.com/v1/forecast'
    const ARCHIVE  = 'https://archive-api.open-meteo.com/v1/archive'
    const today    = new Date().toISOString().slice(0, 10)
    const ageDays  = Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86400000)
    const sources  = ageDays > 80 ? [ARCHIVE, FORECAST] : [FORECAST, ARCHIVE]

    let wx = null
    let lastErr = null
    for (const src of sources) {
      try { wx = await weatherFrom(src, geo, date, from, to) } catch (e) { lastErr = e }
      if (wx) break
    }
    if (!wx) {
      if (lastErr) throw lastErr
      return res.status(404).json({ error: `Für den ${date} liegen keine Wetterdaten vor – Vorhersage und Archiv decken dieses Datum nicht ab.` })
    }

    res.json({
      ...wx,
      location: geo.name,
      date,
      half,
    })
  } catch (e) {
    res.status(502).json({ error: `Wetterdaten nicht abrufbar: ${e.message}. Hat der Server Internetzugang?` })
  }
})

// ── Dateiablage: Synology File Station je Projekt (project.fsPath) ───────────
const fileStation = require('./fileStation')

function resolveFsPath(project, reqPath, res) {
  if (!fileStation.isConfigured()) {
    res.status(400).json({ error: 'Dateiablage nicht konfiguriert – SYNOLOGY_FS_USER/SYNOLOGY_FS_PASS in der docker-compose.yml setzen.' })
    return null
  }
  const root = String(project.fsPath || '').replace(/\/+$/, '')
  if (!root || !root.startsWith('/')) {
    res.status(400).json({ error: 'Kein Projektordner hinterlegt. Pfad (z. B. /projekte/1234_Beispiel) in der Dateiablage konfigurieren.' })
    return null
  }
  const p = String(reqPath || root)
  // Ausbruch aus dem Projektordner verhindern
  if (p !== root && !p.startsWith(root + '/') || p.includes('..')) {
    res.status(403).json({ error: 'Pfad außerhalb des Projektordners.' })
    return null
  }
  return { root, path: p }
}

app.get('/api/projects/:id/files', requireAuth, async (req, res) => {
  try {
    const project = getAccessibleProject(req, res)
    if (!project) return
    const fs2 = resolveFsPath(project, req.query.path, res)
    if (!fs2) return
    const files = await fileStation.listFolder(fs2.path)
    res.json({ root: fs2.root, path: fs2.path, files })
  } catch (e) { res.status(502).json({ error: e.message }) }
})

app.get('/api/projects/:id/files/download', requireAuth, async (req, res) => {
  try {
    const project = getAccessibleProject(req, res)
    if (!project) return
    const fs2 = resolveFsPath(project, req.query.path, res)
    if (!fs2) return
    if (fs2.path === fs2.root) return res.status(400).json({ error: 'Keine Datei angegeben.' })
    const upstream = await fileStation.downloadFile(fs2.path)
    const filename = fs2.path.split('/').pop() || 'datei'
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream')
    const len = upstream.headers.get('content-length')
    if (len) res.setHeader('Content-Length', len)
    res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/[^a-zA-Z0-9äöüÄÖÜß ._-]/g, '_')}"`)
    require('stream').Readable.fromWeb(upstream.body).pipe(res)
    logEvent('FS_DOWNLOAD', req, `project=${req.params.id} path=${fs2.path}`)
  } catch (e) {
    if (!res.headersSent) res.status(502).json({ error: e.message })
  }
})

// ── Personalplanung: Mitarbeiter-Stammdaten (Arbeitszeitmodelle) ──────────────
// ── Sync: "Eigene Organisation"-Kontakte → Benutzer + Personalplanung ──────────
// Einseitige Spiegelung. Quelle: alle Kontakte mit category==='organisation'
// (projektübergreifend, dedupliziert nach E-Mail bzw. Name|Firma). Ziele:
//   (1) Personalplanung-Mitarbeiter  (staff_members, Feld contactKey)
//   (2) login-freie Benutzer         (users, source='contact', leeres Passwort)
// Entfällt ein Kontakt (Kategorie geändert oder Projekt/Kontakt gelöscht), wird der
// gespiegelte Eintrag automatisch entfernt. Echte Benutzer (local/synology) und
// manuell angelegte Mitarbeiter werden nie verändert. Läuft nach jeder Projekt-
// änderung und einmal beim Start; komplett synchron (better-sqlite3).
function collectOrgContacts() {
  const map = new Map()
  for (const p of db.projects.list()) {
    const list = Array.isArray(p.contacts) ? p.contacts : []
    for (const c of list) {
      if (c?.category !== 'organisation') continue
      const name  = (c.name || c.company || '').trim()
      const email = (c.email || '').trim()
      if (!name && !email) continue
      const key = email.toLowerCase()
        || `${(c.name || '').trim().toLowerCase()}|${(c.company || '').trim().toLowerCase()}`
      if (!key || map.has(key)) continue
      map.set(key, { key, name, email, funktion: (c.role || c.gewerk || '').trim() })
    }
  }
  return map
}

function reconcileStaffFromContacts(orgMap) {
  const now = new Date().toISOString()
  const mirrors = new Map()
  for (const s of db.staffMembers.list()) if (s.contactKey) mirrors.set(s.contactKey, s)

  for (const [key, c] of orgMap) {
    const existing = mirrors.get(key)
    if (existing) {
      const funktion = c.funktion || existing.funktion || ''
      if ((existing.name || '') !== c.name || (existing.email || '') !== c.email || (existing.funktion || '') !== funktion) {
        const { _version, _updatedAt, ...rest } = existing
        db.staffMembers.update(existing.id, { ...rest, name: c.name || existing.name, email: c.email, funktion, updatedAt: now }, _version, '__contactsync__')
      }
    } else {
      db.staffMembers.create({
        id:          require('crypto').randomBytes(12).toString('base64url'),
        name:        c.name,
        email:       c.email,
        funktion:    c.funktion,
        weeklyHours: 40,
        dayHours:    { mo: 8, di: 8, mi: 8, do: 8, fr: 8 },
        active:      true,
        source:      'contact',
        contactKey:  key,
        createdAt:   now, updatedAt: now,
      }, '__contactsync__')
    }
  }
  // Nicht mehr vorhandene Kontakte → gespiegelte Mitarbeiter entfernen
  for (const [key, s] of mirrors) if (!orgMap.has(key)) db.staffMembers.delete(s.id)
}

function reconcileUsersFromContacts(orgMap) {
  const allUsers   = db.users.list()
  const realEmails = new Set(
    allUsers.filter(u => (u.source || 'local') !== 'contact')
            .map(u => (u.email || '').trim().toLowerCase()).filter(Boolean))
  const usernames  = new Set(allUsers.map(u => u.username))
  const mirrors    = new Map()
  for (const m of db.users.listContactMirrors()) mirrors.set(m.contact_key, m)

  for (const [key, c] of orgMap) {
    // Person ist bereits echter Login-Benutzer (per E-Mail) → nicht spiegeln
    if (c.email && realEmails.has(c.email.toLowerCase())) {
      if (mirrors.has(key)) { db.users.delete(mirrors.get(key).username); mirrors.delete(key) }
      continue
    }
    const existing = mirrors.get(key)
    if (existing) {
      if ((existing.display_name || '') !== c.name || (existing.email || '') !== c.email) {
        db.users.updateContactMirror(existing.username, { displayName: c.name, email: c.email })
      }
    } else {
      const username = 'kontakt:' + key
      if (!usernames.has(username)) {
        db.users.createContactMirror({ username, displayName: c.name, email: c.email, contactKey: key })
      }
    }
  }
  for (const [key, m] of mirrors) if (!orgMap.has(key)) db.users.delete(m.username)
}

function syncOrgContacts() {
  try {
    const orgMap = collectOrgContacts()
    reconcileStaffFromContacts(orgMap)
    reconcileUsersFromContacts(orgMap)
  } catch (e) {
    console.error('[org-sync] ' + ((e && (e.stack || e.message)) || e))
  }
}

app.get('/api/staff', requireAuth, (req, res) => {
  try { res.json(db.staffMembers.list()) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/staff', requireAuth, requireAdmin, writeLimiter, (req, res) => {
  try {
    const id  = require('crypto').randomBytes(12).toString('base64url')
    const now = new Date().toISOString()
    const data = {
      id,
      name:        req.body.name        || 'Neuer Mitarbeiter',
      email:       req.body.email       || '',
      funktion:    req.body.funktion    || '',
      weeklyHours: typeof req.body.weeklyHours === 'number' ? req.body.weeklyHours : 40,
      dayHours:    req.body.dayHours    || { mo: 8, di: 8, mi: 8, do: 8, fr: 8 },
      active:      req.body.active !== false,
      createdAt:   now, updatedAt: now,
    }
    db.staffMembers.create(data, req.user)
    res.status(201).json(data)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.patch('/api/staff/:id', requireAuth, requireAdmin, writeLimiter, (req, res) => {
  try {
    const { data, version } = req.body
    const updated = { ...data, updatedAt: new Date().toISOString() }
    const result  = db.staffMembers.update(req.params.id, updated, version, req.user)
    if (result.notFound) return res.status(404).json({ error: 'Nicht gefunden.' })
    if (result.conflict) return res.status(409).json({ conflict: true, ...result })
    res.json({ ok: true, version: result.version })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/staff/:id', requireAuth, requireAdmin, writeLimiter, (req, res) => {
  try { db.staffMembers.delete(req.params.id); res.json({ ok: true }) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Personalplan veröffentlichen (login-freier Team-Link) ─────────────────────
app.post('/api/staff-plan-token', requireAuth, requireAdmin, writeLimiter, (req, res) => {
  try {
    const revoke = req.body?.action === 'revoke'
    const token  = revoke ? '' : auth.generateToken()
    db.appState.set('staff_plan_token', token)
    logEvent(revoke ? 'STAFFPLAN_UNPUBLISHED' : 'STAFFPLAN_PUBLISHED', req, '')
    res.json({ ok: true, url: token ? `${getAppUrl(req)}/plan/${token}` : null })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/staff-plan-token', requireAuth, (req, res) => {
  try {
    const token = db.appState.get('staff_plan_token') || ''
    res.json({ url: token ? `${getAppUrl(req)}/plan/${token}` : null })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Öffentliche Team-Ansicht: aktuelle + nächste Woche
app.get('/plan/:token', (req, res) => {
  try {
    const token = db.appState.get('staff_plan_token') || ''
    if (!token || req.params.token !== token) {
      return res.status(404).send(renderSimplePage('Nicht verfügbar',
        '<p style="color:#6b7280;">Dieser Link ist ungültig oder wurde deaktiviert.</p>'))
    }
    // ISO-Woche + Montag berechnen
    const isoWeekOf = (date) => {
      const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
      const dayNum = d.getUTCDay() || 7
      d.setUTCDate(d.getUTCDate() + 4 - dayNum)
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
      return `${d.getUTCFullYear()}-W${String(Math.ceil((((d - yearStart) / 86400000) + 1) / 7)).padStart(2, '0')}`
    }
    const mondayOf = (date) => { const d = new Date(date); const day = d.getDay() || 7; d.setDate(d.getDate() - day + 1); return d }
    const addDays  = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
    const fmtShort = (d) => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })

    const staff    = db.staffMembers.list().filter(s => s.active !== false)
    const projects = db.projects.list()
    let services = []
    try { services = JSON.parse(db.appState.get('staff_plan_settings') || '{}').services || [] } catch {}
    const projName = (pid) => {
      if (!pid) return ''
      if (['urlaub', 'krank', 'buero'].includes(pid)) return { urlaub: 'Urlaub', krank: 'Krank', buero: 'Büro' }[pid]
      return projects.find(p => p.id === pid)?.name
        || services.find(s => s.id === pid)?.name
        || pid
    }
    const DAYS = [['mo', 'Mo'], ['di', 'Di'], ['mi', 'Mi'], ['do', 'Do'], ['fr', 'Fr']]

    const fmtTage = (t) => String(t).replace('.', ',')
    const weekTable = (monday) => {
      const week = isoWeekOf(monday)
      const plan = db.staffPlan.get(week) || {}
      const assignments = plan.assignments || []
      const bodyRows = staff.map(s => {
        const mine = assignments.filter(a => a.staffId === s.id)
        const cells = DAYS.map(([key]) => {
          const parts = mine
            .filter(a => a.days?.[key] > 0)
            .map(a => `${esc(projName(a.projectId))} <span style="color:#9ca3af;font-size:11px;">${fmtTage(a.days[key])}</span>`)
          if (parts.length === 0) return '<td style="padding:6px 8px;border:0.5px solid #e5e7eb;color:#d1d5db;">–</td>'
          const special = mine.some(a => ['urlaub', 'krank'].includes(a.projectId) && a.days?.[key] > 0)
          return `<td style="padding:6px 8px;border:0.5px solid #e5e7eb;${special ? 'background:#fef9c3;' : ''}">${parts.join('<br>')}</td>`
        }).join('')
        return `<tr><td style="padding:6px 8px;border:0.5px solid #e5e7eb;font-weight:bold;white-space:nowrap;">${esc(s.name)}</td>${cells}</tr>`
      }).join('')
      const heads = DAYS.map(([, label], i) =>
        `<th style="padding:6px 8px;border:0.5px solid #d1d5db;background:#000040;color:#8FBEFF;font-size:11px;text-transform:uppercase;">${label} ${fmtShort(addDays(monday, i))}</th>`).join('')
      return `
        <h2 style="font-size:15px;margin:24px 0 8px 0;">KW ${week.split('-W')[1]} (${fmtShort(monday)} – ${fmtShort(addDays(monday, 4))})</h2>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead><tr><th style="padding:6px 8px;border:0.5px solid #d1d5db;background:#000040;color:#8FBEFF;font-size:11px;text-transform:uppercase;text-align:left;">Mitarbeiter</th>${heads}</tr></thead>
          <tbody>${bodyRows || '<tr><td colspan="6" style="padding:12px;color:#9ca3af;">Keine Planung hinterlegt.</td></tr>'}</tbody>
        </table>`
    }

    const thisMonday = mondayOf(new Date())
    const html = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Personalplanung – GHBA</title></head>
      <body style="font-family:Arial,sans-serif;margin:0;background:#F0F0F0;color:#1F2937;">
      <div style="max-width:860px;margin:0 auto;padding:24px 16px;">
        <div style="background:#000040;padding:20px 24px;">
          <p style="margin:0;color:#8FBEFF;font-size:11px;letter-spacing:2px;text-transform:uppercase;">GHBA</p>
          <p style="margin:4px 0 0 0;color:#FBFFE6;font-size:19px;font-weight:bold;">Personalplanung</p>
          <p style="margin:4px 0 0 0;color:#8FBEFF;font-size:12px;">Stand ${new Date().toLocaleString('de-DE')}</p>
        </div>
        <div style="background:#fff;padding:8px 24px 24px 24px;border:1px solid #e5e7eb;border-top:none;">
          ${weekTable(thisMonday)}
          ${weekTable(addDays(thisMonday, 7))}
          ${weekTable(addDays(thisMonday, 14))}
          ${weekTable(addDays(thisMonday, 21))}
          <p style="color:#9ca3af;font-size:11px;margin-top:20px;">Werte in Tagen (¼-Schritte). Diese Seite ist immer aktuell – einfach neu laden. Änderungen erfolgen im Protokolltool.</p>
        </div>
      </div></body></html>`
    res.send(html)
  } catch (e) { res.status(500).send(renderSimplePage('Fehler', `<p>${esc(e.message)}</p>`)) }
})

// ── Personalplanung: Einstellungen (Projekt-Reihenfolge + Zusatz-Leistungen) ──
app.get('/api/staff-plan-settings', requireAuth, (_req, res) => {
  try { res.json(JSON.parse(db.appState.get('staff_plan_settings') || '{}')) }
  catch { res.json({}) }
})

app.put('/api/staff-plan-settings', requireAuth, requireAdmin, writeLimiter, (req, res) => {
  try {
    const arr = (v) => Array.isArray(v) ? v : []
    db.appState.set('staff_plan_settings', JSON.stringify({
      projectOrder:   arr(req.body.projectOrder),
      services:       arr(req.body.services),
      hiddenProjects: arr(req.body.hiddenProjects),
      reportPresets:  arr(req.body.reportPresets),
      teams:          arr(req.body.teams),        // Team-Vorlagen [{id, name, members:[{staffId, role}]}]
    }))
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Personalplanung: ein Dokument je Kalenderwoche (global) ──────────────────
app.get('/api/staff-plan/:week', requireAuth, (req, res) => {
  try {
    const doc = db.staffPlan.get(req.params.week)
    res.json(doc || { id: req.params.week, rows: [] })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.put('/api/staff-plan/:week', requireAuth, requireAdmin, writeLimiter, (req, res) => {
  try {
    const week = req.params.week
    if (!/^\d{4}-W\d{2}$/.test(week)) return res.status(400).json({ error: 'Ungültige Woche.' })
    const existing = db.staffPlan.get(week)
    const data = {
      id: week,
      // assignments: [{ projectId, staffId, days: { mo: 0.25|0.5|0.75|1, … } }]
      assignments: Array.isArray(req.body.assignments) ? req.body.assignments : [],
      rows: Array.isArray(req.body.rows) ? req.body.rows : [],   // Altformat (Kompatibilität)
      updatedAt: new Date().toISOString(),
    }
    if (existing) {
      const result = db.staffPlan.update(week, data, existing._version, req.user)
      if (result.conflict) return res.status(409).json({ conflict: true, ...result })
    } else {
      db.staffPlan.create(data, req.user)
    }
    broadcast('staff_plan', 'update', week, data.updatedAt)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Learning-Plattform: Schulungsvideos ──────────────────────────────────────
// Videos sind global (projektübergreifend) – sie erklären die Bedienung der App.
// Lesen: jeder angemeldete Nutzer. Verwalten (Upload/Ändern/Löschen): nur Admins.
function displayNameOf(reqUser) {
  if (!reqUser || reqUser === '__anonymous__' || reqUser === '__apikey__') return 'Admin'
  const u = db.users.get(reqUser)
  return u?.display_name || reqUser
}

// GET – Liste aller Videos (Metadaten, ohne Binärdaten)
app.get('/api/learning-videos', requireAuth, (req, res) => {
  try {
    const all = db.learningVideos.list()
    all.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)
      || (a.createdAt || '').localeCompare(b.createdAt || ''))
    res.json(all)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST – neues Video-Metadatenobjekt anlegen (Admin); Datei folgt separat
app.post('/api/learning-videos', requireAuth, requireAdmin, writeLimiter, (req, res) => {
  try {
    const id  = require('crypto').randomBytes(12).toString('base64url')
    const now = new Date().toISOString()
    const existing = db.learningVideos.list()
    const maxOrder = existing.reduce((m, v) => Math.max(m, v.order ?? 0), 0)
    const data = {
      id,
      title:       req.body.title       || 'Neues Video',
      description: req.body.description || '',
      category:    req.body.category    || 'Allgemein',
      order:       typeof req.body.order === 'number' ? req.body.order : maxOrder + 1,
      filename:    '',
      size:        0,
      mimeType:    '',
      hasFile:     false,
      uploadedAt:  null,
      uploadedBy:  '',
      createdBy:   displayNameOf(req.user),
      createdAt:   now,
      updatedAt:   now,
    }
    db.learningVideos.create(data, req.user)
    logEvent('LEARNING_CREATE', req, `id=${id} title=${data.title}`)
    res.status(201).json(data)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST – Video-Datei hochladen (Admin); Content-Type: application/octet-stream
app.post('/api/learning-videos/:id/file', requireAuth, requireAdmin, writeLimiter,
  express.raw({ type: 'application/octet-stream', limit: '2048mb' }),
  (req, res) => {
    try {
      const video = db.learningVideos.get(req.params.id)
      if (!video) return res.status(404).json({ error: 'Video nicht gefunden.' })

      const filename = (req.headers['x-filename'] || 'video.mp4').replace(/[^a-zA-Z0-9._-]/g, '_')
      const mimeType = req.headers['x-mimetype'] || 'video/mp4'
      const filePath = path.join(LEARNING_DIR, req.params.id)

      fs.writeFileSync(filePath, req.body)
      const stat = fs.statSync(filePath)

      const { _version, _updatedAt, ...vData } = video
      const now     = new Date().toISOString()
      const updated = {
        ...vData,
        filename,
        mimeType,
        size:       stat.size,
        hasFile:    true,
        uploadedAt: now,
        uploadedBy: displayNameOf(req.user),
        updatedAt:  now,
      }
      db.learningVideos.update(req.params.id, updated, _version, req.user)
      logEvent('LEARNING_UPLOAD', req, `id=${req.params.id} file=${filename} size=${stat.size}`)
      res.status(201).json(updated)
    } catch (e) { res.status(500).json({ error: e.message }) }
  }
)

// GET – Video-Datei streamen (mit Range-Support für Vor-/Zurückspulen)
// Auth über Authorization-Header ODER ?token= (das <video>-Element kann keine
// Header setzen) bzw. Open-Mode wenn noch keine Benutzer registriert sind.
app.get('/api/learning-videos/:id/file', (req, res) => {
  try {
    const authHeader = req.headers['authorization']
    const headerTok  = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    const token      = headerTok || req.query.token
    const authed     = (token && resolveToken(token)) || !db.users.hasAny()
      || (API_KEY && req.headers['x-api-key'] === API_KEY)
    if (!authed) return res.status(401).json({ error: 'Nicht angemeldet.' })

    const video    = db.learningVideos.get(req.params.id)
    const filePath = path.join(LEARNING_DIR, req.params.id)
    if (!video || !fs.existsSync(filePath)) return res.status(404).json({ error: 'Kein Video vorhanden.' })

    const stat      = fs.statSync(filePath)
    const total     = stat.size
    const mimeType  = video.mimeType || 'video/mp4'
    const range     = req.headers.range

    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range)
      let start = match && match[1] ? parseInt(match[1], 10) : 0
      let end   = match && match[2] ? parseInt(match[2], 10) : total - 1
      if (isNaN(start) || start < 0) start = 0
      if (isNaN(end)   || end >= total) end = total - 1
      if (start > end) { start = 0; end = total - 1 }

      res.status(206)
      res.setHeader('Content-Range',  `bytes ${start}-${end}/${total}`)
      res.setHeader('Accept-Ranges',  'bytes')
      res.setHeader('Content-Length', end - start + 1)
      res.setHeader('Content-Type',   mimeType)
      fs.createReadStream(filePath, { start, end }).pipe(res)
    } else {
      res.setHeader('Content-Length', total)
      res.setHeader('Accept-Ranges',  'bytes')
      res.setHeader('Content-Type',   mimeType)
      res.setHeader('Cache-Control',  'private, max-age=300')
      fs.createReadStream(filePath).pipe(res)
    }
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// PATCH – Metadaten ändern (Admin)
app.patch('/api/learning-videos/:id', requireAuth, requireAdmin, writeLimiter, (req, res) => {
  try {
    const video = db.learningVideos.get(req.params.id)
    if (!video) return res.status(404).json({ error: 'Video nicht gefunden.' })
    const { _version, _updatedAt, ...vData } = video
    const allowed = (({ title, description, category, order }) => ({ title, description, category, order }))(req.body)
    const updated = { ...vData, ...Object.fromEntries(Object.entries(allowed).filter(([, v]) => v !== undefined)), updatedAt: new Date().toISOString() }
    const result  = db.learningVideos.update(req.params.id, updated, _version, req.user)
    if (result.notFound) return res.status(404).json({ error: 'Nicht gefunden.' })
    if (result.conflict) return res.status(409).json({ conflict: true, ...result })
    logEvent('LEARNING_UPDATE', req, `id=${req.params.id}`)
    res.json(updated)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// DELETE – Video + Datei löschen (Admin)
app.delete('/api/learning-videos/:id', requireAuth, requireAdmin, writeLimiter, (req, res) => {
  try {
    const filePath = path.join(LEARNING_DIR, req.params.id)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    db.learningVideos.delete(req.params.id)
    logEvent('LEARNING_DELETE', req, `id=${req.params.id}`)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Verteiler (Nachrichten-Terminal je Projekt) ──────────────────────────────
const DISTRIBUTION_CHANNEL_KEYS = ['report', 'protocol', 'freigabe', 'actions', 'diary']

// Bereinigt die vom Client gelieferten Verteiler-Empfänger: nur valide E-Mail,
// bekannte Kanäle, nach E-Mail dedupliziert. Vertraut keinen Client-Feldern.
function sanitizeDistributionRecipients(list) {
  const out = []
  const seen = new Set()
  for (const r of list) {
    const email = String(r?.email || '').trim()
    if (!email || !email.includes('@')) continue
    const key = email.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const channels = {}
    for (const k of DISTRIBUTION_CHANNEL_KEYS) channels[k] = !!r?.channels?.[k]
    out.push({
      id:        typeof r?.id === 'string' ? r.id.slice(0, 64) : require('crypto').randomBytes(8).toString('hex'),
      name:      String(r?.name || '').trim().slice(0, 200),
      email,
      contactId: r?.contactId ? String(r.contactId).slice(0, 64) : null,
      username:  r?.username ? String(r.username).slice(0, 64) : null,
      scope:     r?.scope === 'full' ? 'full' : 'short',
      channels,
    })
  }
  return out
}

// Empfänger eines Kanals (valide E-Mail, Kanal aktiv, dedupliziert).
// Spiegelbild von distributionFor() in src/utils.js.
function distributionFor(project, channel) {
  const list = project?.distribution?.recipients
  if (!Array.isArray(list)) return []
  const seen = new Set()
  const out = []
  for (const r of list) {
    const email = String(r?.email || '').trim()
    if (!email || !email.includes('@')) continue
    if (!r?.channels?.[channel]) continue
    const key = email.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ name: String(r?.name || '').trim(), email, scope: r?.scope === 'full' ? 'full' : 'short' })
  }
  return out
}

// ── Projektzugang – Hilfsfunktionen ──────────────────────────────────────────
function isProjectAdmin(project, username) {
  if (!project || !username) return false
  if (project.projectAdminUser === username) return true   // Ersteller/Eigentümer
  return Array.isArray(project.projectAdmins) && project.projectAdmins.includes(username)
}

function canAccessProject(project, username) {
  if (!project.isAccessControlled) return true
  if (!username) return false
  if (username === '__apikey__') return true
  if (username === '__anonymous__') return false
  const user = db.users.get(username)
  if (user?.role === 'admin') return true
  if (isProjectAdmin(project, username)) return true
  return Array.isArray(project.allowedUsers) && project.allowedUsers.includes(username)
}

function isProjectManager(project, username) {
  if (!username || username === '__anonymous__') return false
  if (username === '__apikey__') return true
  const user = db.users.get(username)
  return !!(user?.role === 'admin' || isProjectAdmin(project, username))
}

// GET /api/users – minimale Benutzerliste für Zugangsverwaltung (alle angemeldeten Benutzer)
app.get('/api/users', requireAuth, (req, res) => {
  try {
    res.json(db.users.list().map(u => ({
      username:     u.username,
      display_name: u.display_name || u.username,
      role:         u.role,
      source:       u.source || 'local',
    })))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Projekt-Löschfreigabe ─────────────────────────────────────────────────────
function serverUid() {
  return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)
}

function renderSimplePage(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title} – GHBA</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;font-size:14px;color:#1f2937;background:#f3f4f6;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{background:white;border:1px solid #e5e7eb;max-width:500px;width:100%}
    .hdr{background:#000040;color:#fbffe6;padding:20px 28px}
    .hdr small{font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#8fbeff;display:block;margin-bottom:4px}
    .hdr h1{font-size:17px;font-weight:bold}
    .body{padding:24px 28px}
    .info{background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #000040;padding:14px 16px;margin-bottom:16px}
    .info p{font-size:12px;color:#6b7280;margin-top:3px}
    .warn{background:#fef2f2;border:1px solid #fecaca;border-left:4px solid #dc2626;padding:12px 16px;margin-bottom:16px;font-size:13px;color:#991b1b}
    .ok{background:#f0fdf4;border:1px solid #bbf7d0;border-left:4px solid #16a34a;padding:12px 16px;font-size:13px;color:#14532d}
    .info-neutral{background:#fffbeb;border:1px solid #fde68a;border-left:4px solid #d97706;padding:12px 16px;font-size:13px;color:#92400e}
    .actions{display:flex;gap:10px;margin-top:18px;flex-wrap:wrap}
    .btn-del{background:#dc2626;color:white;border:none;padding:9px 18px;cursor:pointer;font-size:13px;font-weight:bold}
    .btn-del:hover{background:#b91c1c}
    .btn-sec{background:white;color:#374151;border:1px solid #d1d5db;padding:9px 18px;cursor:pointer;font-size:13px;text-decoration:none;display:inline-block}
    .btn-sec:hover{background:#f9fafb}
    .ftr{margin-top:20px;font-size:11px;color:#9ca3af;text-align:center}
  </style>
</head>
<body><div class="card">
  <div class="hdr"><small>GHBA</small><h1>${title}</h1></div>
  <div class="body">${bodyHtml}<div class="ftr">GHBA – Projektverwaltung</div></div>
</div></body></html>`
}

// POST /api/projects/:id/request-delete
app.post('/api/projects/:id/request-delete', requireAuth, async (req, res) => {
  try {
    const { id } = req.params
    const project = db.projects.get(id)
    if (!project) return res.status(404).json({ error: 'Projekt nicht gefunden.' })

    const requesterUser  = db.users.get(req.user)
    const requesterName  = requesterUser?.display_name || req.user
    const protocolCount  = db.protocols.list().filter(p => p.projectId === id).length

    // Idempotent: if a pending request already exists, just return ok
    const existing = db.deletionRequests.getByTarget(id)
    if (existing) return res.json({ ok: true, alreadyPending: true })

    const token   = auth.generateToken()
    const reqId   = serverUid()
    const projName = project.name || 'Unbenanntes Projekt'

    db.deletionRequests.create({
      id:              reqId,
      targetId:        id,
      targetName:      projName,
      protocolCount,
      requestedBy:     req.user,
      requestedByName: requesterName,
      token,
    })
    logEvent('DELETE_REQUESTED', req, `project=${id} name="${projName}" by=${req.user}`)
    notifyUsers(adminUsernames(), 'request', `Löschanfrage: „${projName}" von ${requesterName}`, id)

    // Send email to all admins
    if (mailer.mailerStatus().configured) {
      const admins  = db.users.list().filter(u => u.role === 'admin' && u.email)
      const appUrl  = getAppUrl(req)
      const approveUrl = `${appUrl}/api/delete-approve/${token}`
      const rejectUrl  = `${appUrl}/api/delete-reject/${token}`
      const from    = process.env.SMTP_FROM || process.env.GRAPH_SENDER || process.env.SMTP_USER || 'noreply@ghba'
      const today   = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
      const protoLine = protocolCount > 0
        ? `<tr><td style="color:#6b7280;padding-right:16px;white-space:nowrap;">Protokolle</td><td>${protocolCount} (werden nicht gelöscht, aber vom Projekt getrennt)</td></tr>`
        : ''

      const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;font-size:14px;color:#1f2937;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #e5e7eb;max-width:520px;width:100%;">
  <tr><td style="background:#000040;padding:24px 36px;">
    <p style="margin:0 0 4px 0;font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#8fbeff;">GHBA</p>
    <p style="margin:0;font-size:18px;font-weight:bold;color:#fbffe6;">Löschanfrage für ein Projekt</p>
  </td></tr>
  <tr><td style="padding:28px 36px 0 36px;">
    <p style="margin:0 0 18px 0;color:#374151;">Ein Benutzer möchte ein Projekt löschen und benötigt Ihre Freigabe als Administrator.</p>
    <table cellpadding="4" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #000040;width:100%;padding:16px;">
      <tr><td style="padding:14px 16px;" colspan="2">
        <p style="margin:0 0 10px 0;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#6b7280;">Details der Anfrage</p>
        <table cellpadding="3" cellspacing="0">
          <tr><td style="color:#6b7280;padding-right:16px;white-space:nowrap;">Projekt</td><td style="font-weight:bold;color:#000040;">${projName}</td></tr>
          <tr><td style="color:#6b7280;padding-right:16px;white-space:nowrap;">Angefragt von</td><td>${requesterName}</td></tr>
          <tr><td style="color:#6b7280;padding-right:16px;white-space:nowrap;">Datum</td><td>${today}</td></tr>
          ${protoLine}
        </table>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:24px 36px;">
    <p style="margin:0 0 14px 0;font-size:13px;color:#374151;font-weight:bold;">Was möchten Sie tun?</p>
    <table cellpadding="0" cellspacing="0"><tr>
      <td style="padding-right:10px;">
        <a href="${approveUrl}" style="display:inline-block;background:#dc2626;color:white;padding:11px 22px;font-size:13px;font-weight:bold;text-decoration:none;">Löschen genehmigen</a>
      </td>
      <td>
        <a href="${rejectUrl}" style="display:inline-block;background:white;color:#374151;border:1px solid #d1d5db;padding:11px 22px;font-size:13px;text-decoration:none;">Ablehnen</a>
      </td>
    </tr></table>
    <p style="margin:12px 0 0 0;font-size:11px;color:#9ca3af;">Sie können die Anfrage auch im AdminPanel unter dem Tab „Löschanfragen" bearbeiten.</p>
  </td></tr>
  <tr><td style="padding:16px 36px;border-top:1px solid #e5e7eb;text-align:center;">
    <p style="margin:0;font-size:11px;color:#9ca3af;">GHBA · ${today}</p>
  </td></tr>
</table></td></tr></table>
</body></html>`

      const text = [
        `Löschanfrage für Projekt „${projName}"`,
        '',
        `Ein Benutzer (${requesterName}) möchte dieses Projekt löschen.`,
        protocolCount > 0 ? `${protocolCount} Protokolle würden vom Projekt getrennt (nicht gelöscht).` : '',
        '',
        `Löschen genehmigen: ${approveUrl}`,
        `Ablehnen:           ${rejectUrl}`,
      ].filter(l => l !== undefined).join('\n')

      for (const admin of admins) {
        try {
          await mailer.sendMail({ from, to: admin.email, subject: `Löschanfrage: Projekt „${projName}"`, html, text })
        } catch (e) { console.warn('[delete-request] E-Mail fehlgeschlagen:', e.message) }
      }
    }

    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// GET /api/delete-approve/:token – HTML confirmation page
app.get('/api/delete-approve/:token', (req, res) => {
  const dr = db.deletionRequests.getByToken(req.params.token)
  if (!dr) return res.send(renderSimplePage('Ungültige Anfrage',
    '<p style="color:#6b7280;">Dieser Link ist ungültig oder wurde bereits verwendet.</p>'))

  if (dr.status !== 'pending') {
    const label = dr.status === 'approved' ? 'bereits genehmigt und gelöscht' : 'bereits abgelehnt'
    return res.send(renderSimplePage('Anfrage bereits bearbeitet',
      `<div class="info-neutral">Diese Löschanfrage wurde ${label}.</div>`))
  }

  const dateStr = new Date(dr.requested_at).toLocaleString('de-DE')
  const body = `
    <div class="warn">Diese Aktion löscht das Projekt endgültig und kann nicht rückgängig gemacht werden.</div>
    <div class="info">
      <strong>${dr.target_name}</strong>
      <p>Angefragt von: ${dr.requested_by_name} · ${dateStr}</p>
      ${dr.protocol_count > 0 ? `<p>${dr.protocol_count} Protokoll${dr.protocol_count !== 1 ? 'e werden' : ' wird'} vom Projekt getrennt (nicht gelöscht).</p>` : ''}
    </div>
    <form method="POST">
      <div class="actions">
        <button type="submit" class="btn-del">Jetzt endgültig löschen</button>
        <a href="/api/delete-reject/${dr.token}" class="btn-sec">Ablehnen</a>
      </div>
    </form>`
  res.send(renderSimplePage('Löschanfrage genehmigen', body))
})

// POST /api/delete-approve/:token – execute deletion
app.post('/api/delete-approve/:token', (req, res) => {
  const dr = db.deletionRequests.getByToken(req.params.token)
  if (!dr || dr.status !== 'pending')
    return res.send(renderSimplePage('Ungültige Anfrage',
      '<p style="color:#6b7280;">Dieser Link ist ungültig oder wurde bereits verwendet.</p>'))

  db.projects.delete(dr.target_id)
  db.deletionRequests.resolve(dr.id, 'approved', 'email-link')
  broadcast('project', 'delete', dr.target_id, new Date().toISOString())
  logEvent('DELETE_APPROVED', req, `project=${dr.target_id} by=email-token`)

  res.send(renderSimplePage('Projekt gelöscht',
    `<div class="ok">✓ Projekt „${dr.target_name}" wurde erfolgreich gelöscht.</div>
     <p style="margin-top:12px;font-size:13px;color:#6b7280;">Zugehörige Protokolle bleiben erhalten, sind aber keinem Projekt mehr zugeordnet.</p>`))
})

// GET /api/delete-reject/:token – HTML rejection page
app.get('/api/delete-reject/:token', (req, res) => {
  const dr = db.deletionRequests.getByToken(req.params.token)
  if (!dr) return res.send(renderSimplePage('Ungültige Anfrage',
    '<p style="color:#6b7280;">Dieser Link ist ungültig oder wurde bereits verwendet.</p>'))

  if (dr.status !== 'pending') {
    const label = dr.status === 'approved' ? 'bereits genehmigt und gelöscht' : 'bereits abgelehnt'
    return res.send(renderSimplePage('Anfrage bereits bearbeitet',
      `<div class="info-neutral">Diese Löschanfrage wurde ${label}.</div>`))
  }

  const body = `
    <div class="info">
      <strong>${dr.target_name}</strong>
      <p>Angefragt von: ${dr.requested_by_name}</p>
    </div>
    <p style="font-size:13px;color:#374151;margin-bottom:16px;">Die Löschanfrage wird abgelehnt. Das Projekt bleibt unverändert erhalten.</p>
    <form method="POST">
      <div class="actions">
        <button type="submit" class="btn-del" style="background:#6b7280;">Ablehnen bestätigen</button>
        <a href="/api/delete-approve/${dr.token}" class="btn-sec">Zurück (Genehmigen)</a>
      </div>
    </form>`
  res.send(renderSimplePage('Löschanfrage ablehnen', body))
})

// POST /api/delete-reject/:token – mark rejected
app.post('/api/delete-reject/:token', (req, res) => {
  const dr = db.deletionRequests.getByToken(req.params.token)
  if (!dr || dr.status !== 'pending')
    return res.send(renderSimplePage('Ungültige Anfrage',
      '<p style="color:#6b7280;">Dieser Link ist ungültig oder wurde bereits verwendet.</p>'))

  db.deletionRequests.resolve(dr.id, 'rejected', 'email-link')
  logEvent('DELETE_REJECTED', req, `project=${dr.target_id} by=email-token`)

  res.send(renderSimplePage('Anfrage abgelehnt',
    `<div class="ok" style="background:#f0f7ff;border-color:#bfdbfe;border-left-color:#2563eb;color:#1e40af;">✓ Löschanfrage für „${dr.target_name}" wurde abgelehnt. Das Projekt bleibt erhalten.</div>`))
})

// ── Archivierungsanfragen (Genehmigung durch Software-Admin) ──────────────────

// Projekt serverseitig als archiviert markieren (nach Admin-Genehmigung).
// Das Gesamtprotokoll-PDF wurde bereits beim Stellen der Anfrage vom Browser
// erzeugt und unter /data/archives abgelegt.
function applyProjectArchive(projectId, resolvedBy) {
  const project = db.projects.get(projectId)
  if (!project) return false
  const { _version, _updatedAt, ...pData } = project
  const now = new Date().toISOString()
  const pdfPath = path.join(ARCHIVE_DIR, `${projectId}.pdf`)
  const archivePdf = fs.existsSync(pdfPath)
    ? {
        size: fs.statSync(pdfPath).size,
        createdAt: now,
        protocolCount: db.protocols.list().filter(p => p.projectId === projectId).length,
      }
    : null
  const updated = { ...pData, isArchived: true, archivedAt: now, archivePdf, updatedAt: now }
  db.projects.update(projectId, updated, _version, resolvedBy)
  broadcast('project', 'update', projectId, now)
  return true
}

// POST /api/projects/:id/request-archive – Archivierungsanfrage stellen
app.post('/api/projects/:id/request-archive', requireAuth, async (req, res) => {
  try {
    const project = getAccessibleProject(req, res)
    if (!project) return
    const { id } = req.params

    const requesterUser = db.users.get(req.user)
    const requesterName = requesterUser?.display_name || req.user
    const protocolCount = db.protocols.list().filter(p => p.projectId === id).length

    const existing = db.deletionRequests.getByTarget(id, 'archive')
    if (existing) return res.json({ ok: true, alreadyPending: true })

    const token    = auth.generateToken()
    const reqId    = serverUid()
    const projName = project.name || 'Unbenanntes Projekt'
    db.deletionRequests.create({
      id: reqId, targetId: id, targetName: projName,
      protocolCount, requestedBy: req.user, requestedByName: requesterName,
      token, requestType: 'archive',
    })
    logEvent('ARCHIVE_REQUESTED', req, `project=${id} name="${projName}" by=${req.user}`)
    notifyUsers(adminUsernames(), 'request', `Archivierungsanfrage: „${projName}" von ${requesterName}`, id)

    // Admins per E-Mail informieren (Genehmigen/Ablehnen per Link)
    if (mailer.mailerStatus().configured) {
      const admins = db.users.list().filter(u => u.role === 'admin' && u.email)
      if (admins.length > 0) {
        const appUrl     = getAppUrl(req)
        const approveUrl = `${appUrl}/api/archive-approve/${token}`
        const rejectUrl  = `${appUrl}/api/archive-reject/${token}`
        const from = process.env.SMTP_FROM || process.env.GRAPH_SENDER || process.env.SMTP_USER || 'noreply@ghba'
        const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#222;font-size:14px;line-height:1.5">
          <p><strong>${esc(requesterName)}</strong> bittet um Freigabe der Archivierung des Projekts
          <strong>„${esc(projName)}"</strong> (${protocolCount} Protokoll${protocolCount !== 1 ? 'e' : ''}).</p>
          <p>Das Gesamtprotokoll wurde bereits als PDF abgelegt. Das Projekt bleibt nach der Archivierung jederzeit zugänglich.</p>
          <p>
            <a href="${approveUrl}" style="display:inline-block;background:#16a34a;color:#fff;padding:8px 16px;text-decoration:none;margin-right:8px">Archivierung genehmigen</a>
            <a href="${rejectUrl}" style="display:inline-block;background:#6b7280;color:#fff;padding:8px 16px;text-decoration:none">Ablehnen</a>
          </p>
          <p style="color:#888;margin-top:18px">GHBA · Projektverwaltung</p>
        </body></html>`
        const text = `${requesterName} bittet um Freigabe der Archivierung des Projekts "${projName}" (${protocolCount} Protokolle).\n\nGenehmigen: ${approveUrl}\nAblehnen:  ${rejectUrl}\n\nGHBA`
        for (const admin of admins) {
          try {
            await mailer.sendMail({ from, to: admin.email, subject: `Archivierungsanfrage: Projekt „${projName}"`, html, text })
          } catch (e) { console.warn('[archive-request] Mail an', admin.email, 'fehlgeschlagen:', e.message) }
        }
      }
    }
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// GET/POST /api/archive-approve/:token – Genehmigung per E-Mail-Link
app.get('/api/archive-approve/:token', (req, res) => {
  const dr = db.deletionRequests.getByToken(req.params.token)
  if (!dr || dr.request_type !== 'archive') return res.send(renderSimplePage('Ungültige Anfrage',
    '<p style="color:#6b7280;">Dieser Link ist ungültig oder wurde bereits verwendet.</p>'))
  if (dr.status !== 'pending') {
    const label = dr.status === 'approved' ? 'bereits genehmigt' : 'bereits abgelehnt'
    return res.send(renderSimplePage('Anfrage bereits bearbeitet',
      `<div class="info-neutral">Diese Archivierungsanfrage wurde ${label}.</div>`))
  }
  const dateStr = new Date(dr.requested_at).toLocaleString('de-DE')
  const body = `
    <div class="info">
      <strong>${dr.target_name}</strong>
      <p>Angefragt von: ${dr.requested_by_name} · ${dateStr}</p>
      <p>${dr.protocol_count} Protokoll${dr.protocol_count !== 1 ? 'e' : ''} · Gesamtprotokoll-PDF liegt bereit.</p>
    </div>
    <p style="font-size:13px;color:#374151;margin-bottom:16px;">Das Projekt wird ins Archiv verschoben, bleibt aber jederzeit zugänglich und kann wiederhergestellt werden.</p>
    <form method="POST">
      <div class="actions">
        <button type="submit" class="btn-del" style="background:#16a34a;">Archivierung genehmigen</button>
        <a href="/api/archive-reject/${dr.token}" class="btn-sec">Ablehnen</a>
      </div>
    </form>`
  res.send(renderSimplePage('Archivierungsanfrage genehmigen', body))
})

app.post('/api/archive-approve/:token', (req, res) => {
  const dr = db.deletionRequests.getByToken(req.params.token)
  if (!dr || dr.request_type !== 'archive' || dr.status !== 'pending')
    return res.send(renderSimplePage('Ungültige Anfrage',
      '<p style="color:#6b7280;">Dieser Link ist ungültig oder wurde bereits verwendet.</p>'))
  applyProjectArchive(dr.target_id, 'email-link')
  db.deletionRequests.resolve(dr.id, 'approved', 'email-link')
  logEvent('ARCHIVE_APPROVED', req, `project=${dr.target_id} by=email-token`)
  res.send(renderSimplePage('Projekt archiviert',
    `<div class="ok">✓ Projekt „${dr.target_name}" wurde archiviert.</div>
     <p style="margin-top:12px;font-size:13px;color:#6b7280;">Das Projekt ist im Archiv-Bereich weiterhin zugänglich.</p>`))
})

app.get('/api/archive-reject/:token', (req, res) => {
  const dr = db.deletionRequests.getByToken(req.params.token)
  if (!dr || dr.request_type !== 'archive') return res.send(renderSimplePage('Ungültige Anfrage',
    '<p style="color:#6b7280;">Dieser Link ist ungültig oder wurde bereits verwendet.</p>'))
  if (dr.status !== 'pending') {
    const label = dr.status === 'approved' ? 'bereits genehmigt' : 'bereits abgelehnt'
    return res.send(renderSimplePage('Anfrage bereits bearbeitet',
      `<div class="info-neutral">Diese Archivierungsanfrage wurde ${label}.</div>`))
  }
  const body = `
    <div class="info">
      <strong>${dr.target_name}</strong>
      <p>Angefragt von: ${dr.requested_by_name}</p>
    </div>
    <p style="font-size:13px;color:#374151;margin-bottom:16px;">Die Archivierungsanfrage wird abgelehnt. Das Projekt bleibt aktiv.</p>
    <form method="POST">
      <div class="actions">
        <button type="submit" class="btn-del" style="background:#6b7280;">Ablehnen bestätigen</button>
        <a href="/api/archive-approve/${dr.token}" class="btn-sec">Zurück (Genehmigen)</a>
      </div>
    </form>`
  res.send(renderSimplePage('Archivierungsanfrage ablehnen', body))
})

app.post('/api/archive-reject/:token', (req, res) => {
  const dr = db.deletionRequests.getByToken(req.params.token)
  if (!dr || dr.request_type !== 'archive' || dr.status !== 'pending')
    return res.send(renderSimplePage('Ungültige Anfrage',
      '<p style="color:#6b7280;">Dieser Link ist ungültig oder wurde bereits verwendet.</p>'))
  db.deletionRequests.resolve(dr.id, 'rejected', 'email-link')
  logEvent('ARCHIVE_REJECTED', req, `project=${dr.target_id} by=email-token`)
  res.send(renderSimplePage('Anfrage abgelehnt',
    `<div class="ok" style="background:#f0f7ff;border-color:#bfdbfe;border-left-color:#2563eb;color:#1e40af;">✓ Archivierungsanfrage für „${dr.target_name}" wurde abgelehnt. Das Projekt bleibt aktiv.</div>`))
})

// GET /api/admin/deletion-requests – list pending (AdminPanel; Lösch- UND Archivierungsanfragen)
app.get('/api/admin/deletion-requests', requireAuth, requireAdmin, (_req, res) => {
  try { res.json(db.deletionRequests.list()) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

// POST /api/admin/deletion-requests/:id/approve – direct admin approve
// Verzweigt nach request_type: 'delete' löscht das Projekt, 'archive' archiviert es.
app.post('/api/admin/deletion-requests/:id/approve', requireAuth, requireAdmin, (req, res) => {
  try {
    const dr = db.deletionRequests.list().find(r => r.id === req.params.id)
    if (!dr) return res.status(404).json({ error: 'Anfrage nicht gefunden.' })
    if (dr.status !== 'pending') return res.status(400).json({ error: 'Anfrage bereits bearbeitet.' })
    if (dr.request_type === 'archive') {
      applyProjectArchive(dr.target_id, req.user)
      db.deletionRequests.resolve(dr.id, 'approved', req.user)
      logEvent('ARCHIVE_APPROVED', req, `project=${dr.target_id} by=${req.user}`)
    } else {
      db.projects.delete(dr.target_id)
      db.deletionRequests.resolve(dr.id, 'approved', req.user)
      broadcast('project', 'delete', dr.target_id, new Date().toISOString())
      logEvent('DELETE_APPROVED', req, `project=${dr.target_id} by=${req.user}`)
    }
    notifyUsers([dr.requested_by], 'decision',
      `${dr.request_type === 'archive' ? 'Archivierungsanfrage' : 'Löschanfrage'} für „${dr.target_name}" wurde genehmigt.`,
      dr.target_id)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST /api/admin/deletion-requests/:id/reject – direct admin reject
app.post('/api/admin/deletion-requests/:id/reject', requireAuth, requireAdmin, (req, res) => {
  try {
    const dr = db.deletionRequests.list().find(r => r.id === req.params.id)
    if (!dr) return res.status(404).json({ error: 'Anfrage nicht gefunden.' })
    if (dr.status !== 'pending') return res.status(400).json({ error: 'Anfrage bereits bearbeitet.' })
    db.deletionRequests.resolve(dr.id, 'rejected', req.user)
    logEvent(dr.request_type === 'archive' ? 'ARCHIVE_REJECTED' : 'DELETE_REJECTED', req, `project=${dr.target_id} by=${req.user}`)
    notifyUsers([dr.requested_by], 'decision',
      `${dr.request_type === 'archive' ? 'Archivierungsanfrage' : 'Löschanfrage'} für „${dr.target_name}" wurde abgelehnt.`,
      dr.target_id)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ══════════════════════════════════════════════════════════════════════════════
// Freimeldung von Aufgaben (Magic-Link, Genehmigung, wöchentliches Reporting)
//
// Externe Verantwortliche melden Aufgaben über einen login-freien Link frei
// (Begründung + optionale Anlagen). Im Protokoll erscheint ein Hinweis
// „Freimeldung angefordert"; Projekt-/Systemadmins genehmigen oder lehnen ab.
// Alles wird direkt am actionItem gespeichert (releaseRequest + releaseHistory),
// nur das Token-Mapping liegt in einer eigenen Tabelle.
//
// Systemmails/-seiten dieses Bereichs sind mit „GHBA" gebrandet (neue CI noch
// nicht offiziell) und nutzen durchgehend die Schriftart Arial.
// ══════════════════════════════════════════════════════════════════════════════

// Absender für GHBA-Systemmails
function systemFrom() {
  const addr = process.env.SMTP_FROM || process.env.GRAPH_SENDER || process.env.SMTP_USER || 'noreply@ghba'
  return { addr, from: `"GHBA" <${addr}>` }
}

function fmtDateDe(iso) {
  if (!iso) return '–'
  const s = String(iso).slice(0, 10)
  const [y, m, d] = s.split('-')
  if (!y || !m || !d) return s
  return `${d}.${m}.${y}`
}

// ── E-Mail-Einstellungen (Templates + Zeitplanung) ────────────────────────────
const EMAIL_DEFAULTS = {
  invite: {
    subject:  'Willkommen bei GHBA, {name}!',
    greeting: 'Du wurdest eingeladen, GHBA zu nutzen – unser gemeinsames Tool für Besprechungsprotokolle und Projektdokumentation.',
    footer:   'Viel Erfolg und willkommen im Team!',
  },
  protocol: {
    subject:       'Protokoll – {project}{date_sep}{date}',
    intro:         'im Anhang finden Sie das Protokoll der Besprechung zum Projekt {project}.',
    detail:        'Das Protokoll enthält die Teilnehmer, die behandelten Protokollpunkte sowie die festgehaltenen Maßnahmen und liegt dieser E-Mail als PDF-Anlage bei.',
    no_next_meeting: 'Ein Termin für die nächste Besprechung wird gesondert bekannt gegeben.',
    actions_note:  'Die aus dem Protokoll resultierenden Aufgaben werden separat versendet.',
    reply_note:    'Für Rückfragen stehen wir gerne zur Verfügung.',
    footer:        'GHBA',
  },
  protocol_review: {
    subject:      'Protokoll zur Freigabe – {project}{date_sep}{date}',
    intro:        'vorab und zur Freigabe erhalten Sie das Protokoll der Besprechung zum Projekt {project} als PDF-Anlage.',
    detail:       'Bitte prüfen Sie das Protokoll und teilen Sie uns Ihre Anmerkungen oder Ihre Freigabe durch Antwort auf diese E-Mail mit.',
    deadline_note: 'Wir bitten um Ihre Rückmeldung bis zum {deadline}.',
    silence_note: 'Sofern bis dahin keine Rückmeldung erfolgt, betrachten wir das Protokoll als freigegeben.',
    footer:       'GHBA',
  },
  note: {
    subject:  '{type} – {note_subject}',
    greeting: 'Guten Tag,',
    intro:    'anbei erhalten Sie eine {type} zum Projekt {project}.',
    footer:   'GHBA',
  },
  notebook: {
    subject:  'Notizbuch – {project}',
    greeting: 'Guten Tag,',
    intro:    'anbei erhalten Sie einen Auszug aus dem Notizbuch zum Projekt {project}.',
    footer:   'GHBA',
  },
  diary: {
    subject:  'Baudokumentation – {project} – Stand {date}',
    greeting: 'Guten Tag,',
    intro:    'anbei erhalten Sie die Baudokumentation zum Projekt {project}.',
    footer:   'GHBA',
  },
  task_assignment: {
    subject: 'Ihre Aufgaben – {project} – Stand {date}',
    intro:   'nachfolgend finden Sie eine Übersicht Ihrer Aufgaben aus dem Projekt {project}. Wir bitten Sie, die Aufgaben fristgerecht zu erfüllen. Der Status wird in der folgenden Projektbesprechung entsprechend aktualisiert.',
    footer:  'GHBA',
  },
  plan_review: {
    subject: 'Planprüfung – {project} – {plan}',
    intro:   'Ihnen wurde ein Prüfvermerk zur Planprüfung im Projekt {project} zugewiesen. Wir bitten Sie, die Prüfung fristgerecht vorzunehmen.',
    footer:  'GHBA · Planprüfung',
  },
  release_notification: {
    subject: 'Neue Freimeldung – {project}',
    intro:   '{responsible} hat {count} Aufgabe(n) im Projekt {project} freigemeldet. Die Freimeldung erscheint im Protokoll an der jeweiligen Aufgabe als Hinweis „Freimeldung angefordert" und kann dort geprüft und genehmigt werden.',
    footer:  'GHBA · Aufgabenverwaltung',
  },
  weekly_report: {
    subject:        'Projektstatus – {project}',
    releases_intro: 'Folgende Aufgaben wurden in den letzten 7 Tagen genehmigt:',
    open_intro:     'Folgende Aufgaben sind aktuell noch offen oder in Bearbeitung:',
    footer:         'GHBA · Projektstatus',
    schedule_day:   5,    // 0=So, 1=Mo, 2=Di, 3=Mi, 4=Do, 5=Fr, 6=Sa
    schedule_hour:  10,
    // Abschnitte des Projektstatus (im Admin-Bereich schaltbar)
    section_meetings:     true,   // Nächste Besprechungstermine
    section_overdue:      true,   // Überfällige Aufgaben (eigener Abschnitt)
    section_releases:     true,   // Diese Woche freigemeldete Aufgaben
    section_open:         true,   // Offene Aufgaben
    section_pending:      true,   // Ausstehende Freimeldungen (nur intern)
    section_plan_reviews: true,   // Planprüfung
    section_bim_issues:   true,   // BIM-Issues
    section_documents:    true,   // Neue Dokumente (Pläne/BIM)
    section_notes:        true,   // Neue Akten-/Telefonnotizen (nur intern)
    send_external:        true,   // gekürzte Version an Projektkontakte senden
  },
}

function getEmailSettings() {
  try {
    const stored = db.appState.get('email_settings')
    const overrides = stored ? JSON.parse(stored) : {}
    const merged = {}
    for (const [type, defaults] of Object.entries(EMAIL_DEFAULTS)) {
      merged[type] = { ...defaults, ...(overrides[type] || {}) }
    }
    return merged
  } catch { return JSON.parse(JSON.stringify(EMAIL_DEFAULTS)) }
}

// Ersetzt {placeholder} im Template durch Variablen
function applyTpl(tpl, vars = {}) {
  return String(tpl || '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : ''))
}

const RELEASE_STATUS_LABELS = { offen: 'Offen', in_arbeit: 'In Arbeit', erledigt: 'Erledigt', verschoben: 'Verschoben' }

function matchResponsible(itemResponsible, target) {
  return (itemResponsible || '').trim().toLowerCase() === (target || '').trim().toLowerCase()
}

// Wird eine offene Maßnahme in ein Folgeprotokoll übernommen, entsteht dort eine
// Kopie mit carriedFromId → ID des Originals; das Original bleibt im Vorgänger
// stehen (historischer Beleg). Projektweite Listen und Meldungen dürfen nur die
// jüngste Kopie zählen, sonst erscheint dieselbe Maßnahme je Protokoll der Kette
// erneut. Liefert die IDs aller Maßnahmen, die von einer Kopie abgelöst wurden.
// Spiegelbild von supersededActionIds() in src/utils.js.
function supersededActionIds(protocols) {
  const ids = new Set()
  for (const p of protocols ?? []) {
    for (const a of (p.actionItems ?? [])) {
      if (a.carriedFromId) ids.add(a.carriedFromId)
    }
  }
  return ids
}

// Offene Aufgaben eines Verantwortlichen in einem Projekt (für die Freimelde-Seite)
function openTasksFor(projectId, responsible) {
  const allProtocols = db.protocols.list()
  const superseded   = supersededActionIds(allProtocols)
  const protocols    = allProtocols.filter(p => p.projectId === projectId)
  const tasks = []
  for (const proto of protocols) {
    const label = `${proto.meetingType ? proto.meetingType + ' · ' : ''}${proto.projectName || ''} ${fmtDateDe(proto.date)}`.trim()
    for (const a of (proto.actionItems ?? [])) {
      if (!matchResponsible(a.responsible, responsible)) continue
      if (a.status === 'erledigt') continue
      // In ein Folgeprotokoll übernommen: dort steht die aktuelle Kopie, sonst
      // würde am abgelösten Original freigemeldet.
      if (superseded.has(a.id)) continue
      tasks.push({
        protocolId:  proto.id,
        protocolNo:  label,
        actionId:    a.id,
        no:          a.no || '',
        description: a.description || '',
        deadline:    a.deadline || '',
        status:      a.status || 'offen',
        statusLabel: RELEASE_STATUS_LABELS[a.status] || a.status || 'Offen',
        pending:     !!a.releaseRequest,
      })
    }
  }
  return tasks
}

// Aktualisiert ein actionItem server-autoritativ (umgeht Versionskonflikt mit Retry).
function mutateActionItem(protocolId, actionId, transform, by) {
  function attempt() {
    const proto = db.protocols.get(protocolId)
    if (!proto) return { notFound: true }
    const { _version, _updatedAt, ...data } = proto
    const items = Array.isArray(data.actionItems) ? data.actionItems : []
    let found = false
    const nextItems = items.map(a => {
      if (a.id !== actionId) return a
      found = true
      return transform(a)
    })
    if (!found) return { notFound: true }
    const next = { ...data, actionItems: nextItems, updatedAt: new Date().toISOString() }
    return db.protocols.update(protocolId, next, _version, by)
  }
  let result = attempt()
  if (result.conflict) result = attempt()   // einmal erneut versuchen
  return result
}

function releaseUid() {
  return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10)
}

// Berechtigung: Systemadmin oder Projektadministrator (Ersteller/Co-Admin).
function canManageRelease(project, username) {
  if (username === '__apikey__' || username === '__anonymous__') return true
  const user = db.users.get(username)
  if (user?.role === 'admin') return true
  return isProjectAdmin(project, username)
}

// ── POST /api/actions/release-link – Token für Verantwortlichen holen/erzeugen ──
app.post('/api/actions/release-link', requireAuth, (req, res) => {
  try {
    const { projectId, responsible, email = '' } = req.body || {}
    if (!projectId || !responsible) return res.status(400).json({ error: '"projectId" und "responsible" erforderlich.' })
    const project = db.projects.get(projectId)
    if (!project) return res.status(404).json({ error: 'Projekt nicht gefunden.' })

    let row = db.releaseTokens.find(projectId, responsible)
    if (!row) {
      const token = auth.generateToken()
      db.releaseTokens.create({ token, projectId, responsible: responsible.trim(), email })
      row = db.releaseTokens.getByToken(token)
    } else if (email && email !== row.email) {
      db.releaseTokens.updateEmail(row.token, email)
    }
    res.json({ token: row.token, url: `${getAppUrl(req)}/freimeldung/${row.token}` })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── GET /api/projects/:id/release-tokens – aktive Freimelde-Links (Manager) ────
app.get('/api/projects/:id/release-tokens', requireAuth, (req, res) => {
  try {
    const project = db.projects.get(req.params.id)
    if (!project) return res.status(404).json({ error: 'Projekt nicht gefunden.' })
    if (!isProjectManager(project, req.user)) return res.status(403).json({ error: 'Keine Berechtigung.' })
    const appUrl = getAppUrl(req)
    res.json(db.releaseTokens.listByProject(req.params.id).map(t => ({
      token: t.token, responsible: t.responsible, email: t.email,
      createdAt: t.created_at, lastUsedAt: t.last_used_at,
      url: `${appUrl}/freimeldung/${t.token}`,
    })))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── POST /api/projects/:id/release-tokens/:token/revoke – Link widerrufen ──────
app.post('/api/projects/:id/release-tokens/:token/revoke', requireAuth, writeLimiter, (req, res) => {
  try {
    const project = db.projects.get(req.params.id)
    if (!project) return res.status(404).json({ error: 'Projekt nicht gefunden.' })
    if (!isProjectManager(project, req.user)) return res.status(403).json({ error: 'Keine Berechtigung.' })
    const row = db.releaseTokens.getByToken(req.params.token)
    if (!row || row.project_id !== req.params.id) return res.status(404).json({ error: 'Link nicht gefunden.' })
    db.releaseTokens.revoke(req.params.token)
    logEvent('RELEASE_TOKEN_REVOKED', req, `project=${req.params.id} responsible=${row.responsible} by=${req.user}`)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── GET /api/freimeldung/:token – offene Aufgaben (JSON, login-frei) ───────────
app.get('/api/freimeldung/:token', (req, res) => {
  try {
    const row = db.releaseTokens.getByToken(req.params.token)
    if (!row) return res.status(404).json({ error: 'Ungültiger oder widerrufener Link.' })
    const project = db.projects.get(row.project_id)
    res.json({
      responsible: row.responsible,
      projectName: project?.name || '',
      tasks:       openTasksFor(row.project_id, row.responsible),
    })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── POST /api/freimeldung/:token – Freimeldung(en) beantragen (login-frei) ─────
app.post('/api/freimeldung/:token', async (req, res) => {
  try {
    const row = db.releaseTokens.getByToken(req.params.token)
    if (!row) return res.status(404).json({ error: 'Ungültiger oder widerrufener Link.' })

    const { requests } = req.body || {}
    if (!Array.isArray(requests) || requests.length === 0) {
      return res.status(400).json({ error: 'Keine Freimeldung übergeben.' })
    }

    const actor      = `${row.responsible}${row.email ? ` <${row.email}>` : ''}`
    const nowIso     = new Date().toISOString()
    const touched    = new Set()
    let   accepted   = 0
    const errors     = []

    for (const r of requests) {
      const { protocolId, actionId, basis } = r || {}
      if (!protocolId || !actionId || !basis || !String(basis).trim()) {
        errors.push('Begründung fehlt für eine Aufgabe.')
        continue
      }
      // Anlagen speichern (max. 10 MB pro Datei)
      const attMeta = []
      for (const att of (Array.isArray(r.attachments) ? r.attachments : [])) {
        if (!att?.dataBase64 || !att?.name) continue
        const approxBytes = Math.floor((att.dataBase64.length * 3) / 4)
        if (approxBytes > 10 * 1024 * 1024) { errors.push(`Anlage „${att.name}" überschreitet 10 MB.`); continue }
        const id = releaseUid()
        try {
          await attachments.save(id, att.dataBase64)
          attMeta.push({ id, name: att.name, mimeType: att.mimeType || 'application/octet-stream', size: att.size || approxBytes })
        } catch (e) { errors.push(`Anlage „${att.name}" konnte nicht gespeichert werden.`) }
      }

      const result = mutateActionItem(protocolId, actionId, (a) => {
        const history = Array.isArray(a.releaseHistory) ? a.releaseHistory : []
        return {
          ...a,
          releaseRequest: {
            id:           releaseUid(),
            requestedAt:  nowIso,
            requestedBy:  actor,
            requestedVia: 'extern',
            basis:        String(basis).trim(),
            attachments:  attMeta,
          },
          releaseHistory: [
            ...history,
            { id: releaseUid(), at: nowIso, actor, actorKind: 'extern', event: 'freimeldung_beantragt',
              note: String(basis).trim(), attachments: attMeta },
          ],
        }
      }, '__freimeldung__')

      if (result.notFound) { errors.push('Eine Aufgabe wurde nicht gefunden.'); continue }
      if (result.conflict) { errors.push('Eine Aufgabe wurde zwischenzeitlich geändert – bitte erneut versuchen.'); continue }
      accepted++
      touched.add(protocolId)
    }

    db.releaseTokens.touch(row.token)
    touched.forEach(pid => broadcast('protocol', 'update', pid, nowIso))

    // Projektverantwortliche benachrichtigen (GHBA-Systemmail)
    if (accepted > 0 && mailer.mailerStatus().configured) {
      notifyManagersOfRelease(row, accepted, getAppUrl(req)).catch(e =>
        console.warn('[freimeldung] Benachrichtigung fehlgeschlagen:', e.message))
    }
    // In-App-Glocke für Projekt-/Systemadmins
    if (accepted > 0) {
      const proj = db.projects.get(row.project_id)
      notifyUsers(projectManagerUsernames(proj), 'release',
        `Freimeldung eingegangen: ${row.responsible} – ${accepted} Aufgabe${accepted !== 1 ? 'n' : ''} (${proj?.name || 'Projekt'})`,
        row.project_id)
    }

    logEvent('RELEASE_REQUESTED', req, `token=${row.token} responsible=${row.responsible} accepted=${accepted}`)
    res.json({ ok: accepted > 0, accepted, errors })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Benachrichtigt Projekt-/Systemadmins über eine neue Freimeldung.
async function notifyManagersOfRelease(tokenRow, count, appUrl) {
  const project = db.projects.get(tokenRow.project_id)
  const projName = project?.name || 'Projekt'
  const emails = new Set()
  for (const u of db.users.list()) {
    if (u.role === 'admin' && u.email) emails.add(u.email)
  }
  if (project?.projectAdminUser) {
    const pa = db.users.get(project.projectAdminUser)
    if (pa?.email) emails.add(pa.email)
  }
  if (emails.size === 0) return

  const tpl     = getEmailSettings().release_notification
  const vars    = { responsible: tokenRow.responsible, count: String(count), project: projName }
  const subject = applyTpl(tpl.subject, vars)
  const intro   = applyTpl(tpl.intro, vars)

  const { from } = systemFrom()
  const today = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;font-size:14px;color:#1f2937;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;"><tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #e5e7eb;max-width:520px;width:100%;">
  <tr><td style="background:#000040;padding:24px 36px;">
    <p style="margin:0 0 4px 0;font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#8fbeff;font-family:Arial,sans-serif;">GHBA</p>
    <p style="margin:0;font-size:18px;font-weight:bold;color:#fbffe6;font-family:Arial,sans-serif;">Neue Freimeldung</p>
  </td></tr>
  <tr><td style="padding:28px 36px;font-family:Arial,sans-serif;">
    <p style="margin:0 0 14px 0;color:#374151;">${esc(intro)}</p>
    <p style="margin:0;"><a href="${appUrl}" style="color:#2563eb;font-weight:bold;">Zur Anwendung</a></p>
  </td></tr>
  <tr><td style="padding:16px 36px;border-top:1px solid #e5e7eb;text-align:center;font-family:Arial,sans-serif;">
    <p style="margin:0;font-size:11px;color:#9ca3af;">${esc(tpl.footer)} · ${today}</p>
  </td></tr>
</table></td></tr></table></body></html>`
  const text = `${intro}\n\nZur Anwendung: ${appUrl}\n\n${tpl.footer}`
  for (const to of emails) {
    try { await mailer.sendMail({ from, to, subject, html, text }) }
    catch (e) { console.warn('[freimeldung] Mail an', to, 'fehlgeschlagen:', e.message) }
  }
}

// ── POST /api/actions/:protocolId/:actionId/approve – Freimeldung genehmigen ───
app.post('/api/actions/:protocolId/:actionId/approve', requireAuth, writeLimiter, (req, res) => {
  try {
    const { protocolId, actionId } = req.params
    const proto = db.protocols.get(protocolId)
    if (!proto) return res.status(404).json({ error: 'Protokoll nicht gefunden.' })
    const project = proto.projectId ? db.projects.get(proto.projectId) : null
    if (!canManageRelease(project, req.user)) return res.status(403).json({ error: 'Nur Projekt- oder Systemadministratoren können Freimeldungen genehmigen.' })

    const actor   = db.users.get(req.user)?.display_name || req.user
    const nowIso  = new Date().toISOString()
    const note    = (req.body?.note || '').trim()

    const result = mutateActionItem(protocolId, actionId, (a) => {
      const history = Array.isArray(a.releaseHistory) ? a.releaseHistory : []
      const { releaseRequest, ...rest } = a
      return {
        ...rest,
        status:      'erledigt',
        completedAt: nowIso,
        releaseRequest: null,
        releaseHistory: [
          ...history,
          { id: releaseUid(), at: nowIso, actor, actorKind: 'intern', event: 'genehmigt',
            fromStatus: a.status, toStatus: 'erledigt',
            note: note || (releaseRequest?.basis || ''), attachments: releaseRequest?.attachments || [] },
        ],
      }
    }, req.user)

    if (result.notFound) return res.status(404).json({ error: 'Aufgabe nicht gefunden.' })
    if (result.conflict) return res.status(409).json({ error: 'Konflikt – bitte erneut versuchen.' })
    broadcast('protocol', 'update', protocolId, nowIso)
    logEvent('RELEASE_APPROVED', req, `protocol=${protocolId} action=${actionId} by=${req.user}`)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── POST /api/actions/:protocolId/:actionId/reject – Freimeldung ablehnen ──────
app.post('/api/actions/:protocolId/:actionId/reject', requireAuth, writeLimiter, (req, res) => {
  try {
    const { protocolId, actionId } = req.params
    const proto = db.protocols.get(protocolId)
    if (!proto) return res.status(404).json({ error: 'Protokoll nicht gefunden.' })
    const project = proto.projectId ? db.projects.get(proto.projectId) : null
    if (!canManageRelease(project, req.user)) return res.status(403).json({ error: 'Nur Projekt- oder Systemadministratoren können Freimeldungen ablehnen.' })

    const actor  = db.users.get(req.user)?.display_name || req.user
    const nowIso = new Date().toISOString()
    const note   = (req.body?.note || '').trim()

    const result = mutateActionItem(protocolId, actionId, (a) => {
      const history = Array.isArray(a.releaseHistory) ? a.releaseHistory : []
      const { releaseRequest, ...rest } = a
      return {
        ...rest,
        releaseRequest: null,
        releaseHistory: [
          ...history,
          { id: releaseUid(), at: nowIso, actor, actorKind: 'intern', event: 'abgelehnt',
            note, attachments: [] },
        ],
      }
    }, req.user)

    if (result.notFound) return res.status(404).json({ error: 'Aufgabe nicht gefunden.' })
    if (result.conflict) return res.status(409).json({ error: 'Konflikt – bitte erneut versuchen.' })
    broadcast('protocol', 'update', protocolId, nowIso)
    logEvent('RELEASE_REJECTED', req, `protocol=${protocolId} action=${actionId} by=${req.user}`)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── GET /freimeldung/:token – login-freie HTML-Seite ──────────────────────────
function renderReleasePage(tokenRow) {
  const project = db.projects.get(tokenRow.project_id)
  const projName = project?.name || ''
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Freimeldung – GHBA</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0;font-family:Arial,sans-serif}
    body{font-size:14px;color:#1f2937;background:#f3f4f6;min-height:100vh;padding:24px}
    .wrap{max-width:720px;margin:0 auto;background:#fff;border:1px solid #e5e7eb}
    .hdr{background:#000040;color:#fbffe6;padding:22px 28px}
    .hdr small{font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#8fbeff;display:block;margin-bottom:4px}
    .hdr h1{font-size:18px;font-weight:bold}
    .hdr p{font-size:13px;color:#8fbeff;margin-top:4px}
    .body{padding:24px 28px}
    .intro{color:#4b5563;margin-bottom:18px;line-height:1.6}
    .task{border:1px solid #e5e7eb;border-left:4px solid #cbd5e1;margin-bottom:14px}
    .task.sel{border-left-color:#000040;background:#f8fafc}
    .task-head{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;cursor:pointer}
    .task-head input{margin-top:3px;width:16px;height:16px;flex-shrink:0}
    .task-desc{font-weight:bold;color:#000040}
    .task-meta{font-size:12px;color:#6b7280;margin-top:3px}
    .task-body{padding:0 14px 14px 40px;display:none}
    .task.sel .task-body{display:block}
    label.fld{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;margin:8px 0 4px}
    textarea{width:100%;border:1px solid #d1d5db;padding:8px 10px;font-size:14px;min-height:64px;resize:vertical}
    input[type=file]{font-size:13px}
    .pending{font-size:12px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;padding:3px 8px;display:inline-block;margin-top:4px}
    .actions{margin-top:18px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
    .btn{background:#000040;color:#fff;border:none;padding:11px 22px;font-size:14px;font-weight:bold;cursor:pointer}
    .btn:disabled{opacity:.5;cursor:not-allowed}
    .msg{padding:12px 16px;margin-bottom:16px;font-size:13px}
    .msg.ok{background:#f0fdf4;border:1px solid #bbf7d0;border-left:4px solid #16a34a;color:#14532d}
    .msg.err{background:#fef2f2;border:1px solid #fecaca;border-left:4px solid #dc2626;color:#991b1b}
    .empty{color:#6b7280;text-align:center;padding:32px 0}
    .ftr{margin-top:22px;padding-top:14px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hdr">
      <small>GHBA</small>
      <h1>Freimeldung von Aufgaben</h1>
      <p id="sub">${projName ? projName + ' · ' : ''}${tokenRow.responsible}</p>
    </div>
    <div class="body">
      <div id="msg"></div>
      <p class="intro">Bitte wählen Sie die Aufgaben aus, die Sie freimelden möchten, geben Sie jeweils eine kurze Begründung an und laden Sie bei Bedarf Nachweise hoch. Ihre Freimeldung wird im Protokoll vermerkt und in der nächsten Besprechung geprüft.</p>
      <div id="tasks"><p class="empty">Aufgaben werden geladen…</p></div>
      <div class="actions" id="actionbar" style="display:none">
        <button class="btn" id="submitBtn">Freimeldung beantragen</button>
        <span id="selcount" style="font-size:12px;color:#6b7280"></span>
      </div>
      <div class="ftr">GHBA · Aufgabenverwaltung</div>
    </div>
  </div>
<script>
(function(){
  var TOKEN = ${JSON.stringify(tokenRow.token)};
  var tasksEl = document.getElementById('tasks');
  var msgEl = document.getElementById('msg');
  var bar = document.getElementById('actionbar');
  var btn = document.getElementById('submitBtn');
  var selcount = document.getElementById('selcount');
  var data = [];

  function showMsg(kind, text){ msgEl.innerHTML = '<div class="msg '+kind+'">'+text+'</div>'; }
  function esc(s){ return (s||'').replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }

  function fmtDate(iso){ if(!iso) return ''; var p=iso.slice(0,10).split('-'); return p.length===3 ? p[2]+'.'+p[1]+'.'+p[0] : iso; }

  function render(){
    if(!data.length){ tasksEl.innerHTML = '<p class="empty">Aktuell sind für Sie keine offenen Aufgaben hinterlegt.</p>'; bar.style.display='none'; return; }
    tasksEl.innerHTML = data.map(function(t,i){
      var pend = t.pending ? '<span class="pending">Freimeldung bereits angefordert</span>' : '';
      var meta = [t.protocolNo, t.deadline ? 'Frist: '+fmtDate(t.deadline) : '', 'Status: '+t.statusLabel].filter(Boolean).join(' · ');
      return '<div class="task" data-i="'+i+'">'
        + '<div class="task-head">'
        +   '<input type="checkbox" data-i="'+i+'"'+(t.pending?' disabled':'')+'>'
        +   '<div><div class="task-desc">'+(t.no?esc(t.no)+'. ':'')+esc(t.description||'(ohne Beschreibung)')+'</div>'
        +   '<div class="task-meta">'+esc(meta)+'</div>'+pend+'</div>'
        + '</div>'
        + '<div class="task-body">'
        +   '<label class="fld">Begründung *</label>'
        +   '<textarea data-basis="'+i+'" placeholder="Warum kann diese Aufgabe als erledigt gelten?"></textarea>'
        +   '<label class="fld">Nachweise / Anlagen (optional, max. 10 MB pro Datei)</label>'
        +   '<input type="file" multiple data-files="'+i+'">'
        + '</div>';
    }).join('');
    bar.style.display = 'flex';
    tasksEl.querySelectorAll('input[type=checkbox]').forEach(function(cb){
      cb.addEventListener('change', function(){
        var card = tasksEl.querySelector('.task[data-i="'+cb.dataset.i+'"]');
        if(cb.checked) card.classList.add('sel'); else card.classList.remove('sel');
        updateCount();
      });
    });
  }
  function updateCount(){
    var n = tasksEl.querySelectorAll('input[type=checkbox]:checked').length;
    selcount.textContent = n ? (n+' Aufgabe'+(n!==1?'n':'')+' ausgewählt') : '';
  }

  function readFile(file){
    return new Promise(function(res){
      var r = new FileReader();
      r.onload = function(){ var b64 = String(r.result).split(',')[1] || ''; res({ name:file.name, mimeType:file.type, size:file.size, dataBase64:b64 }); };
      r.onerror = function(){ res(null); };
      r.readAsDataURL(file);
    });
  }

  btn.addEventListener('click', async function(){
    var checks = Array.prototype.slice.call(tasksEl.querySelectorAll('input[type=checkbox]:checked'));
    if(!checks.length){ showMsg('err','Bitte wählen Sie mindestens eine Aufgabe aus.'); return; }
    var requests = [];
    for(var k=0;k<checks.length;k++){
      var i = checks[k].dataset.i;
      var t = data[i];
      var basis = (tasksEl.querySelector('textarea[data-basis="'+i+'"]').value||'').trim();
      if(!basis){ showMsg('err','Bitte geben Sie für jede ausgewählte Aufgabe eine Begründung an.'); return; }
      var fileInput = tasksEl.querySelector('input[data-files="'+i+'"]');
      var atts = [];
      for(var f=0; f<fileInput.files.length; f++){ var meta = await readFile(fileInput.files[f]); if(meta) atts.push(meta); }
      requests.push({ protocolId:t.protocolId, actionId:t.actionId, basis:basis, attachments:atts });
    }
    btn.disabled = true; btn.textContent = 'Wird gesendet…';
    try{
      var resp = await fetch('/api/freimeldung/'+TOKEN, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ requests:requests }) });
      var out = await resp.json();
      if(resp.ok && out.accepted){
        showMsg('ok','Vielen Dank. '+out.accepted+' Freimeldung'+(out.accepted!==1?'en wurden':' wurde')+' übermittelt und wird in der nächsten Besprechung geprüft.'+(out.errors&&out.errors.length?' Hinweise: '+out.errors.join(' '):''));
        load();
      } else {
        showMsg('err', (out.errors&&out.errors.length? out.errors.join(' ') : (out.error||'Die Freimeldung konnte nicht übermittelt werden.')));
        btn.disabled=false; btn.textContent='Freimeldung beantragen';
      }
    }catch(e){ showMsg('err','Netzwerkfehler – bitte erneut versuchen.'); btn.disabled=false; btn.textContent='Freimeldung beantragen'; }
    window.scrollTo(0,0);
  });

  function load(){
    btn.disabled=false; btn.textContent='Freimeldung beantragen'; selcount.textContent='';
    fetch('/api/freimeldung/'+TOKEN).then(function(r){ return r.json(); }).then(function(d){
      if(d.error){ tasksEl.innerHTML='<p class="empty">'+esc(d.error)+'</p>'; bar.style.display='none'; return; }
      data = d.tasks||[]; render(); updateCount();
    }).catch(function(){ tasksEl.innerHTML='<p class="empty">Aufgaben konnten nicht geladen werden.</p>'; });
  }
  load();
})();
</script>
</body></html>`
}

app.get('/freimeldung/:token', (req, res) => {
  const row = db.releaseTokens.getByToken(req.params.token)
  if (!row) {
    return res.status(404).send(renderSimplePage('Ungültiger Link',
      '<p style="color:#6b7280;">Dieser Freimelde-Link ist ungültig oder wurde widerrufen.</p>'))
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.send(renderReleasePage(row))
})

// BIM-Issues und Planprüfungen werden als Maßnahme in die Protokolle gespiegelt.
// Der Status dieser Spiegel bleibt auf "offen" stehen – gepflegt wird er in der
// jeweiligen Datenquelle (bimIssues / planReviews). Sie dürfen deshalb nirgends
// als reguläre Aufgabe gezählt werden; die Oberfläche filtert sie genauso heraus
// (MassnahmenDashboard, ProjectDashboard, ActionItems).
const isMirrorAction = (a) => !!a.bimIssueId || !!a.planReviewId

// ── Wöchentliches Reporting (Freitags 10:00) ──────────────────────────────────
// Sendet je Projekt:
//   – diese Woche freigemeldete (genehmigte) Aufgaben
//   – alle offenen / in Bearbeitung befindlichen Aufgaben
// Empfänger: alle Projektkontakte mit E-Mail-Adresse (Projektdatenbank)
async function sendWeeklyReleaseReports({ appUrl } = {}) {
  if (!mailer.mailerStatus().configured) {
    console.warn('[reporting] Übersprungen: E-Mail nicht konfiguriert.')
    return { skipped: 'mailer-not-configured', sentProjects: 0, skippedProjects: [] }
  }
  const sinceMs  = Date.now() - 7 * 24 * 60 * 60 * 1000
  const todayStr = new Date().toISOString().slice(0, 10)
  const protocols   = db.protocols.list()
  const allReviews  = db.planReviews.list()
  const allIssues   = db.bimIssues.list()
  const allPlans    = db.bimPlans.list()
  const allNotes    = db.notes.list()
  const superseded  = supersededActionIds(protocols)
  // Empfänger stammen ausschließlich aus dem Projekt-Verteiler (siehe unten) –
  // keine automatische Ableitung aus Admins/Kontakten mehr.

  // Daten je Projekt sammeln
  const emptyData = () => ({
    releases: [], openTasks: [], overdueTasks: [], pendingReleases: [], meetings: [],
    planReviewsOpen: [], planReviewsDecided: [], bimIssuesOpen: [], bimIssuesNew: [],
    newDocs: [], newNotes: [],
  })
  const byProject = new Map()
  const dataFor = (projectId) => {
    if (!byProject.has(projectId)) byProject.set(projectId, emptyData())
    return byProject.get(projectId)
  }

  for (const proto of protocols) {
    if (!proto.projectId) continue
    const data     = dataFor(proto.projectId)
    const protoRef = proto.date
      ? new Date(proto.date + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : ''

    // Nächste Besprechungstermine (heute oder später)
    if (proto.nextMeeting && proto.nextMeeting >= todayStr) {
      data.meetings.push({
        date: proto.nextMeeting, time: proto.nextMeetingTime || '',
        type: proto.meetingType || 'Besprechung', location: proto.location || '',
      })
    }

    for (const a of (proto.actionItems ?? [])) {
      // Spiegel-Einträge von BIM-Issues / Planprüfungen überspringen: ihr Status
      // wird in der jeweiligen Datenquelle gepflegt, nicht am Spiegel. Sie werden
      // in den Abschnitten "BIM-Issues" bzw. "Planprüfung" berichtet.
      if (isMirrorAction(a)) continue
      // In ein Folgeprotokoll übernommen → dort zählt die jüngste Kopie
      if (superseded.has(a.id)) continue
      // Freigemeldete Aufgaben dieser Woche (genehmigt)
      for (const h of (a.releaseHistory ?? [])) {
        if (h.event !== 'genehmigt') continue
        if (!h.at || new Date(h.at).getTime() < sinceMs) continue
        data.releases.push({
          no: a.no || '', description: a.description || '',
          responsible: a.responsible || '', approvedAt: h.at,
        })
      }
      // Ausstehende Freimeldung (angefordert, noch nicht entschieden)
      if (a.releaseRequest) {
        data.pendingReleases.push({
          no: a.no || '', description: a.description || '',
          responsible: a.responsible || '', requestedAt: a.releaseRequest.at || '',
        })
      }
      // Offene und in Bearbeitung befindliche Aufgaben
      if (a.status === 'offen' || a.status === 'in_arbeit') {
        const task = {
          no: a.no || '', description: a.description || '',
          responsible: a.responsible || '', deadline: a.deadline || '',
          priority: a.priority || 'mittel', status: a.status,
          overdue: !!(a.deadline && a.deadline < todayStr),
          protoRef,
        }
        if (task.overdue) data.overdueTasks.push(task)
        else data.openTasks.push(task)
      }
    }
  }

  // Termine deduplizieren + sortieren
  for (const data of byProject.values()) {
    const seen = new Set()
    data.meetings = data.meetings
      .filter(m => { const k = `${m.date}|${m.time}|${m.type}`; if (seen.has(k)) return false; seen.add(k); return true })
      .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
  }

  // Planprüfung
  for (const r of allReviews) {
    if (!r.projectId) continue
    const data = dataFor(r.projectId)
    if (r.status === 'offen' || r.status === 'in_pruefung') {
      data.planReviewsOpen.push({
        no: r.no, title: r.title, plan: r.planTitle || '–', assignedTo: r.assignedTo || '',
        dueDate: r.dueDate || '', overdue: !!(r.dueDate && r.dueDate < todayStr),
        status: r.status,
      })
    } else if ((r.status === 'freigegeben' || r.status === 'abgelehnt')
        && r.updatedAt && new Date(r.updatedAt).getTime() >= sinceMs) {
      data.planReviewsDecided.push({
        no: r.no, title: r.title, plan: r.planTitle || '–', status: r.status, at: r.updatedAt,
      })
    }
  }

  // BIM-Issues
  for (const i of allIssues) {
    if (!i.projectId) continue
    const data = dataFor(i.projectId)
    if (i.status === 'offen' || i.status === 'in_arbeit') {
      data.bimIssuesOpen.push({
        title: i.title, assignedTo: i.assignedTo || '', dueDate: i.dueDate || '',
        priority: i.priority || 'mittel', status: i.status,
        isNew: !!(i.createdAt && new Date(i.createdAt).getTime() >= sinceMs),
      })
    }
  }

  // Neue Dokumente (2D-Pläne + BIM-Modell dieser Woche)
  for (const p of allPlans) {
    if (!p.projectId || !p.uploadedAt) continue
    if (new Date(p.uploadedAt).getTime() < sinceMs) continue
    dataFor(p.projectId).newDocs.push({ title: p.title, kind: p.planType || 'Plan', by: p.uploadedBy || '' })
  }

  // Neue Akten-/Telefonnotizen (nur interne Version)
  for (const n of allNotes) {
    if (!n.projectId || !n.createdAt) continue
    if (new Date(n.createdAt).getTime() < sinceMs) continue
    dataFor(n.projectId).newNotes.push({ subject: n.subject || n.title || 'Notiz', type: n.type || 'Notiz' })
  }

  const { from } = systemFrom()
  const weeklyTpl = getEmailSettings().weekly_report
  const on = (key) => weeklyTpl[key] !== false   // Abschnitt aktiviert? (Default: an)
  let sentProjects = 0
  const skippedProjects = []

  for (const [projectId, data] of byProject) {
    const project = db.projects.get(projectId)
    if (!project) continue
    if (project.isArchived) continue   // archivierte Projekte nicht berichten
    const projName = project.name || 'Projekt'

    // BIM-Modell-Upload dieser Woche ergänzen
    if (project.bimMeta?.uploadedAt && new Date(project.bimMeta.uploadedAt).getTime() >= sinceMs) {
      data.newDocs.push({ title: project.bimMeta.filename || 'BIM-Modell', kind: 'BIM-Modell', by: project.bimMeta.uploadedBy || '' })
    }

    // Ampel-Status
    const overdueCount = data.overdueTasks.length + data.planReviewsOpen.filter(r => r.overdue).length
    const openCount    = data.openTasks.length + data.pendingReleases.length
      + data.planReviewsOpen.length + data.bimIssuesOpen.length
    data.ampel = overdueCount > 0 ? 'rot' : openCount > 0 ? 'gelb' : 'gruen'
    data.overdueCount = overdueCount
    data.openCount    = openCount

    // Sichtbare Abschnitte je Variante (nach Admin-Konfiguration)
    const internalSections = {
      meetings: on('section_meetings') && data.meetings.length > 0,
      overdue:  on('section_overdue')  && data.overdueTasks.length > 0,
      releases: on('section_releases') && data.releases.length > 0,
      open:     on('section_open')     && data.openTasks.length > 0,
      pending:  on('section_pending')  && data.pendingReleases.length > 0,
      reviews:  on('section_plan_reviews') && (data.planReviewsOpen.length > 0 || data.planReviewsDecided.length > 0),
      issues:   on('section_bim_issues')   && data.bimIssuesOpen.length > 0,
      docs:     on('section_documents')    && data.newDocs.length > 0,
      notes:    on('section_notes')        && data.newNotes.length > 0,
    }
    // Externe Variante: ohne interne Abschnitte (ausstehende Freimeldungen, Notizen)
    const externalSections = { ...internalSections, pending: false, notes: false }

    const hasInternal = Object.values(internalSections).some(Boolean)
    if (!hasInternal) {
      console.log(`[reporting] ${projName}: nichts zu berichten – übersprungen`)
      skippedProjects.push({ id: projectId, name: projName, reason: 'no-content' })
      continue
    }

    // Empfänger kommen ausschließlich aus dem Projekt-Verteiler (Kanal "report").
    // Ohne konfigurierten Verteiler wird KEIN Bericht versendet (bewusste Wahl:
    // volle Kontrolle darüber, wer Berichte erhält). Umfang je Empfänger:
    //   scope 'full'  → interne Vollversion (alle Abschnitte)
    //   scope 'short' → gekürzte externe Fassung (ohne interne Abschnitte)
    const reportRecipients = distributionFor(project, 'report')
    if (reportRecipients.length === 0) {
      console.log(`[reporting] ${projName}: kein Verteiler-Empfänger für "Bericht" – übersprungen`)
      skippedProjects.push({ id: projectId, name: projName, reason: 'no-distribution' })
      continue
    }
    const fullTo  = reportRecipients.filter(r => r.scope === 'full').map(r => r.email)
    const shortTo = reportRecipients.filter(r => r.scope === 'short').map(r => r.email)

    const subject = applyTpl(weeklyTpl.subject, { project: projName })
    let sentAny = false

    // Vollversion (intern) an scope='full'
    if (fullTo.length > 0) {
      const html = buildProjectStatusHtml(projName, data, weeklyTpl, internalSections)
      const text = buildProjectStatusText(projName, data, weeklyTpl, internalSections)
      console.log(`[reporting] "${projName}" voll an ${fullTo.length} Empfänger`)
      try {
        await mailer.sendMail({ from, to: fullTo.join(', '), subject, html, text })
        sentAny = true
      } catch (e) {
        console.warn(`[reporting] "${projName}" (voll) fehlgeschlagen:`, e.message)
        skippedProjects.push({ id: projectId, name: projName, reason: 'send-error', detail: e.message })
      }
    }

    // Gekürzte Fassung an scope='short' (nur wenn extern etwas zu berichten ist)
    if (shortTo.length > 0 && Object.values(externalSections).some(Boolean)) {
      const html = buildProjectStatusHtml(projName, data, weeklyTpl, externalSections)
      const text = buildProjectStatusText(projName, data, weeklyTpl, externalSections)
      console.log(`[reporting] "${projName}" kurz an ${shortTo.length} Empfänger`)
      try {
        await mailer.sendMail({ from, to: shortTo.join(', '), subject, html, text })
        sentAny = true
      } catch (e) {
        console.warn(`[reporting] "${projName}" (kurz) fehlgeschlagen:`, e.message)
      }
    }

    if (sentAny) { sentProjects++; console.log(`[reporting] "${projName}" OK`) }
  }

  if (byProject.size === 0) {
    console.warn('[reporting] Keine Projekte mit Protokollen und projectId gefunden.')
  }
  console.log(`[reporting] Abgeschlossen: ${sentProjects} versendet, ${skippedProjects.length} übersprungen`)
  return { sentProjects, skippedProjects }
}

const PRIORITY_LABEL = { hoch: 'Hoch', mittel: 'Mittel', niedrig: 'Niedrig' }
const PRIORITY_COLOR = { hoch: '#DC2626', mittel: '#D97706', niedrig: '#6B7280' }
const STATUS_LABEL   = { offen: 'Offen', in_arbeit: 'In Arbeit' }
const REVIEW_STATUS_LABEL = { offen: 'Offen', in_pruefung: 'In Prüfung', freigegeben: 'Freigegeben', abgelehnt: 'Abgelehnt' }
const AMPEL = {
  rot:   { color: '#DC2626', label: 'Handlungsbedarf' },
  gelb:  { color: '#D97706', label: 'Offene Punkte' },
  gruen: { color: '#16A34A', label: 'Alles im Plan' },
}

// Generischer Tabellen-/Abschnittsbaustein für den Projektstatus
function statusSection(title, intro, headBg, headColor, cols, rowsHtml) {
  const ths = cols.map(c =>
    `<th style="padding:9px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:${headColor};font-family:Arial,sans-serif;">${c}</th>`
  ).join('')
  return `
    <tr><td style="padding:20px 36px 8px 36px;">
      <p style="margin:0 0 10px 0;font-size:13px;font-weight:bold;color:#000040;text-transform:uppercase;letter-spacing:1px;font-family:Arial,sans-serif;">${title}</p>
      ${intro ? `<p style="margin:0 0 12px 0;color:#4B5563;font-size:13px;font-family:Arial,sans-serif;">${esc(intro)}</p>` : ''}
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-collapse:collapse;">
        <thead><tr style="background:${headBg};">${ths}</tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </td></tr>`
}
const td = (content, extra = '') =>
  `<td style="padding:9px 12px;font-size:12px;color:#374151;font-family:Arial,sans-serif;${extra}">${content}</td>`
const trOpen = '<tr style="border-bottom:1px solid #E5E7EB;">'
const fmtDl  = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '–'

function buildProjectStatusHtml(projName, data, tpl, sections) {
  tpl = tpl || getEmailSettings().weekly_report
  const today = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const ampel = AMPEL[data.ampel] || AMPEL.gruen
  const parts = []

  // Ampel-/Kennzahlen-Zusammenfassung
  parts.push(`
    <tr><td style="padding:20px 36px 4px 36px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#F9FAFB;border:1px solid #E5E7EB;border-left:4px solid ${ampel.color};">
        <tr>
          <td style="padding:14px 16px;font-family:Arial,sans-serif;">
            <span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${ampel.color};margin-right:8px;vertical-align:middle;"></span>
            <span style="font-size:14px;font-weight:bold;color:#000040;vertical-align:middle;">${ampel.label}</span>
            <span style="font-size:12px;color:#6B7280;margin-left:12px;vertical-align:middle;">
              ${data.overdueCount > 0 ? `<strong style="color:#DC2626;">${data.overdueCount} überfällig</strong> · ` : ''}
              ${data.openCount} offen · ${data.releases.length} diese Woche freigemeldet
            </span>
          </td>
        </tr>
      </table>
    </td></tr>`)

  if (sections.meetings) {
    const rows = data.meetings.map(m => trOpen
      + td(`<strong style="color:#000040;">${fmtDl(m.date)}</strong>${m.time ? ' · ' + esc(m.time) + ' Uhr' : ''}`, 'white-space:nowrap;')
      + td(esc(m.type)) + td(esc(m.location || '–')) + '</tr>').join('')
    parts.push(statusSection('Nächste Besprechungstermine', null, '#000040', '#8FBEFF',
      ['Termin', 'Besprechung', 'Ort'], rows))
  }

  if (sections.overdue) {
    const rows = data.overdueTasks.map(t => trOpen
      + td(t.no || '–', 'color:#6B7280;white-space:nowrap;')
      + td(`<strong style="color:#000040;">${esc(t.description)}</strong>`)
      + td(esc(t.responsible || '–'), 'white-space:nowrap;')
      + td(`<strong style="color:#DC2626;">${fmtDl(t.deadline)} ⚠</strong>`, 'white-space:nowrap;')
      + '</tr>').join('')
    parts.push(statusSection('Überfällige Aufgaben', 'Diese Aufgaben haben ihre Frist überschritten und benötigen dringend Bearbeitung:',
      '#DC2626', '#FECACA', ['Nr.', 'Aufgabe', 'Verantwortlich', 'Frist'], rows))
  }

  if (sections.releases) {
    const rows = data.releases.map(r => trOpen
      + td(r.no || '–', 'color:#6B7280;white-space:nowrap;')
      + td(`<strong style="color:#000040;">${esc(r.description)}</strong>`)
      + td(esc(r.responsible || '–'), 'white-space:nowrap;')
      + td(fmtDateDe(r.approvedAt), 'white-space:nowrap;') + '</tr>').join('')
    parts.push(statusSection('Diese Woche freigemeldete Aufgaben', tpl.releases_intro,
      '#166534', '#BBF7D0', ['Nr.', 'Aufgabe', 'Verantwortlich', 'Freigegeben'], rows))
  }

  if (sections.pending) {
    const rows = data.pendingReleases.map(r => trOpen
      + td(r.no || '–', 'color:#6B7280;white-space:nowrap;')
      + td(`<strong style="color:#000040;">${esc(r.description)}</strong>`)
      + td(esc(r.responsible || '–'), 'white-space:nowrap;')
      + td(r.requestedAt ? fmtDateDe(r.requestedAt) : '–', 'white-space:nowrap;') + '</tr>').join('')
    parts.push(statusSection('Ausstehende Freimeldungen', 'Diese Freimeldungen warten auf Genehmigung durch die Projektleitung:',
      '#D97706', '#FEF3C7', ['Nr.', 'Aufgabe', 'Verantwortlich', 'Angefordert'], rows))
  }

  if (sections.open) {
    const rows = data.openTasks.map(t => trOpen
      + td(t.no || '–', 'color:#6B7280;white-space:nowrap;')
      + td(`<strong style="color:#000040;">${esc(t.description)}</strong>`)
      + td(esc(t.responsible || '–'), 'white-space:nowrap;')
      + td(fmtDl(t.deadline), 'white-space:nowrap;')
      + td(`<strong style="color:${PRIORITY_COLOR[t.priority] || '#6B7280'};">${PRIORITY_LABEL[t.priority] || t.priority}</strong>`, 'white-space:nowrap;font-size:11px;')
      + td(STATUS_LABEL[t.status] || t.status, 'white-space:nowrap;font-size:11px;') + '</tr>').join('')
    parts.push(statusSection('Offene Aufgaben', tpl.open_intro,
      '#000040', '#8FBEFF', ['Nr.', 'Aufgabe', 'Verantwortlich', 'Frist', 'Priorität', 'Status'], rows))
  }

  if (sections.reviews) {
    const rows = [
      ...data.planReviewsOpen.map(r => trOpen
        + td(`#${r.no}`, 'color:#6B7280;white-space:nowrap;')
        + td(`<strong style="color:#000040;">${esc(r.title)}</strong><br><span style="color:#6B7280;font-size:11px;">${esc(r.plan)}</span>`)
        + td(esc(r.assignedTo || '–'), 'white-space:nowrap;')
        + td(r.overdue ? `<strong style="color:#DC2626;">${fmtDl(r.dueDate)} ⚠</strong>` : fmtDl(r.dueDate), 'white-space:nowrap;')
        + td(REVIEW_STATUS_LABEL[r.status] || r.status, 'white-space:nowrap;font-size:11px;') + '</tr>'),
      ...data.planReviewsDecided.map(r => trOpen
        + td(`#${r.no}`, 'color:#6B7280;white-space:nowrap;')
        + td(`${esc(r.title)}<br><span style="color:#6B7280;font-size:11px;">${esc(r.plan)}</span>`)
        + td('–', 'white-space:nowrap;')
        + td(fmtDateDe(r.at), 'white-space:nowrap;')
        + td(`<strong style="color:${r.status === 'freigegeben' ? '#16A34A' : '#6B7280'};">${REVIEW_STATUS_LABEL[r.status] || r.status}</strong>`, 'white-space:nowrap;font-size:11px;') + '</tr>'),
    ].join('')
    parts.push(statusSection('Planprüfung', 'Offene Prüfvermerke und Entscheidungen der letzten Woche:',
      '#5B21B6', '#DDD6FE', ['Nr.', 'Prüfvermerk / Plan', 'Prüfberechtigt', 'Frist / Datum', 'Status'], rows))
  }

  if (sections.issues) {
    const rows = data.bimIssuesOpen.map(i => trOpen
      + td(`<strong style="color:#000040;">${esc(i.title)}</strong>${i.isNew ? ' <span style="color:#0E7490;font-size:10px;font-weight:bold;">NEU</span>' : ''}`)
      + td(esc(i.assignedTo || '–'), 'white-space:nowrap;')
      + td(fmtDl(i.dueDate), 'white-space:nowrap;')
      + td(`<strong style="color:${PRIORITY_COLOR[i.priority] || '#6B7280'};">${PRIORITY_LABEL[i.priority] || i.priority}</strong>`, 'white-space:nowrap;font-size:11px;')
      + td(STATUS_LABEL[i.status] || i.status, 'white-space:nowrap;font-size:11px;') + '</tr>').join('')
    parts.push(statusSection('BIM-Issues', 'Offene Punkte aus dem Gebäudemodell:',
      '#0E7490', '#CFFAFE', ['Issue', 'Zuständig', 'Frist', 'Priorität', 'Status'], rows))
  }

  if (sections.docs) {
    const rows = data.newDocs.map(d => trOpen
      + td(`<strong style="color:#000040;">${esc(d.title)}</strong>`)
      + td(esc(d.kind), 'white-space:nowrap;')
      + td(esc(d.by || '–'), 'white-space:nowrap;') + '</tr>').join('')
    parts.push(statusSection('Neue Dokumente', 'In der letzten Woche hochgeladen:',
      '#374151', '#D1D5DB', ['Dokument', 'Art', 'Hochgeladen von'], rows))
  }

  if (sections.notes) {
    const rows = data.newNotes.map(n => trOpen
      + td(`<strong style="color:#000040;">${esc(n.subject)}</strong>`)
      + td(esc(n.type), 'white-space:nowrap;') + '</tr>').join('')
    parts.push(statusSection('Neue Akten- / Telefonnotizen', 'In der letzten Woche erfasst (intern):',
      '#374151', '#D1D5DB', ['Betreff', 'Art'], rows))
  }

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F0F0F0;font-family:Arial,sans-serif;font-size:14px;color:#1F2937;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F0F0;padding:32px 16px;"><tr><td align="center">
    <table width="680" cellpadding="0" cellspacing="0" style="background:#FFF;border:1px solid #E5E7EB;max-width:680px;width:100%;">
      <tr><td style="background:#000040;padding:28px 36px;">
        <p style="margin:0;color:#8FBEFF;font-size:11px;letter-spacing:2px;text-transform:uppercase;font-family:Arial,sans-serif;">GHBA</p>
        <p style="margin:6px 0 0 0;color:#FBFFE6;font-size:20px;font-weight:bold;font-family:Arial,sans-serif;">Projektstatus</p>
        <p style="margin:4px 0 0 0;color:#8FBEFF;font-size:14px;font-weight:600;font-family:Arial,sans-serif;">${esc(projName)}</p>
        <p style="margin:6px 0 0 0;color:#8FBEFF;font-size:12px;font-family:Arial,sans-serif;">Stand ${today}</p>
      </td></tr>
      ${parts.join('')}
      <tr><td style="padding:20px 36px;border-top:1px solid #E5E7EB;background:#F0F0F0;text-align:center;font-family:Arial,sans-serif;">
        <p style="margin:0;color:#9CA3AF;font-size:12px;">${esc(tpl.footer)} · ${today}</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`
}

function buildProjectStatusText(projName, data, tpl, sections) {
  tpl = tpl || getEmailSettings().weekly_report
  const today = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const ampel = AMPEL[data.ampel] || AMPEL.gruen
  const lines = [
    `Projektstatus – ${projName}`, `Stand ${today}`, '',
    `STATUS: ${ampel.label.toUpperCase()}${data.overdueCount > 0 ? ` – ${data.overdueCount} überfällig` : ''} · ${data.openCount} offen · ${data.releases.length} freigemeldet`, '',
  ]
  const section = (title, intro, rows) => {
    if (!rows.length) return
    lines.push(title.toUpperCase())
    if (intro) lines.push(intro)
    lines.push('-'.repeat(50))
    rows.forEach(r => lines.push(`• ${r}`))
    lines.push('')
  }

  if (sections.meetings) section('Nächste Besprechungstermine', null,
    data.meetings.map(m => `${fmtDl(m.date)}${m.time ? ' ' + m.time + ' Uhr' : ''} – ${m.type}${m.location ? ' (' + m.location + ')' : ''}`))
  if (sections.overdue) section('Überfällige Aufgaben', null,
    data.overdueTasks.map(t => `${t.no ? t.no + '. ' : ''}${t.description} – ${t.responsible || '–'} | Frist: ${fmtDl(t.deadline)} [ÜBERFÄLLIG]`))
  if (sections.releases) section('Diese Woche freigemeldete Aufgaben', tpl.releases_intro,
    data.releases.map(r => `${r.no ? r.no + '. ' : ''}${r.description} (${r.responsible || '–'}) – freigegeben ${fmtDateDe(r.approvedAt)}`))
  if (sections.pending) section('Ausstehende Freimeldungen', null,
    data.pendingReleases.map(r => `${r.no ? r.no + '. ' : ''}${r.description} – ${r.responsible || '–'}`))
  if (sections.open) section('Offene Aufgaben', tpl.open_intro,
    data.openTasks.map(t => `${t.no ? t.no + '. ' : ''}${t.description} – ${t.responsible || '–'} | Frist: ${fmtDl(t.deadline)} | ${PRIORITY_LABEL[t.priority] || t.priority} | ${STATUS_LABEL[t.status] || t.status}`))
  if (sections.reviews) section('Planprüfung', null, [
    ...data.planReviewsOpen.map(r => `#${r.no} ${r.title} [${r.plan}] – ${r.assignedTo || '–'} | ${REVIEW_STATUS_LABEL[r.status]}${r.overdue ? ' [ÜBERFÄLLIG]' : ''}`),
    ...data.planReviewsDecided.map(r => `#${r.no} ${r.title} [${r.plan}] – ${REVIEW_STATUS_LABEL[r.status]} ${fmtDateDe(r.at)}`),
  ])
  if (sections.issues) section('BIM-Issues', null,
    data.bimIssuesOpen.map(i => `${i.title}${i.isNew ? ' [NEU]' : ''} – ${i.assignedTo || '–'} | ${STATUS_LABEL[i.status] || i.status}`))
  if (sections.docs) section('Neue Dokumente', null,
    data.newDocs.map(d => `${d.title} (${d.kind})${d.by ? ' – ' + d.by : ''}`))
  if (sections.notes) section('Neue Akten-/Telefonnotizen', null,
    data.newNotes.map(n => `${n.subject} (${n.type})`))

  lines.push(tpl.footer)
  return lines.join('\n')
}

// ── Bauherren-Portal: öffentliche Projektstatus-Seite per Magic-Link ──────────
// Sammelt den Status EINES Projekts (externe Sicht, ohne interne Abschnitte).
function collectProjectStatus(projectId) {
  const todayStr = new Date().toISOString().slice(0, 10)
  const sinceMs  = Date.now() - 7 * 24 * 60 * 60 * 1000
  const data = {
    releases: [], openTasks: [], overdueTasks: [], pendingReleases: [], meetings: [],
    planReviewsOpen: [], planReviewsDecided: [], bimIssuesOpen: [], bimIssuesNew: [],
    newDocs: [], newNotes: [],
  }
  const allProtocols = db.protocols.list()
  const superseded   = supersededActionIds(allProtocols)
  for (const proto of allProtocols) {
    if (proto.projectId !== projectId) continue
    if (proto.nextMeeting && proto.nextMeeting >= todayStr) {
      data.meetings.push({ date: proto.nextMeeting, time: proto.nextMeetingTime || '', type: proto.meetingType || 'Besprechung', location: proto.location || '' })
    }
    for (const a of (proto.actionItems ?? [])) {
      if (isMirrorAction(a)) continue   // siehe sendWeeklyReleaseReports
      if (superseded.has(a.id)) continue
      for (const h of (a.releaseHistory ?? [])) {
        if (h.event === 'genehmigt' && h.at && new Date(h.at).getTime() >= sinceMs) {
          data.releases.push({ no: a.no || '', description: a.description || '', responsible: a.responsible || '', approvedAt: h.at })
        }
      }
      if (a.status === 'offen' || a.status === 'in_arbeit') {
        const t = {
          no: a.no || '', description: a.description || '', responsible: a.responsible || '',
          deadline: a.deadline || '', priority: a.priority || 'mittel', status: a.status,
          overdue: !!(a.deadline && a.deadline < todayStr),
        }
        if (t.overdue) data.overdueTasks.push(t); else data.openTasks.push(t)
      }
    }
  }
  const seen = new Set()
  data.meetings = data.meetings
    .filter(m => { const k = `${m.date}|${m.time}|${m.type}`; if (seen.has(k)) return false; seen.add(k); return true })
    .sort((a, b) => a.date.localeCompare(b.date))
  for (const r of db.planReviews.list()) {
    if (r.projectId !== projectId) continue
    if (r.status === 'offen' || r.status === 'in_pruefung') {
      data.planReviewsOpen.push({ no: r.no, title: r.title, plan: r.planTitle || '–', assignedTo: r.assignedTo || '', dueDate: r.dueDate || '', overdue: !!(r.dueDate && r.dueDate < todayStr), status: r.status })
    } else if ((r.status === 'freigegeben' || r.status === 'abgelehnt') && r.updatedAt && new Date(r.updatedAt).getTime() >= sinceMs) {
      data.planReviewsDecided.push({ no: r.no, title: r.title, plan: r.planTitle || '–', status: r.status, at: r.updatedAt })
    }
  }
  for (const i of db.bimIssues.list()) {
    if (i.projectId !== projectId) continue
    if (i.status === 'offen' || i.status === 'in_arbeit') {
      data.bimIssuesOpen.push({ title: i.title, assignedTo: i.assignedTo || '', dueDate: i.dueDate || '', priority: i.priority || 'mittel', status: i.status, isNew: !!(i.createdAt && new Date(i.createdAt).getTime() >= sinceMs) })
    }
  }
  for (const p of db.bimPlans.list()) {
    if (p.projectId !== projectId || !p.uploadedAt) continue
    if (new Date(p.uploadedAt).getTime() >= sinceMs) data.newDocs.push({ title: p.title, kind: p.planType || 'Plan', by: p.uploadedBy || '' })
  }
  const overdueCount = data.overdueTasks.length + data.planReviewsOpen.filter(r => r.overdue).length
  const openCount    = data.openTasks.length + data.planReviewsOpen.length + data.bimIssuesOpen.length
  data.ampel = overdueCount > 0 ? 'rot' : openCount > 0 ? 'gelb' : 'gruen'
  data.overdueCount = overdueCount
  data.openCount    = openCount
  return data
}

// POST – Portal-Link erzeugen/erneuern/widerrufen (Projekt-/Systemadmin)
app.post('/api/projects/:id/portal-token', requireAuth, writeLimiter, (req, res) => {
  try {
    const project = getAccessibleProject(req, res)
    if (!project) return
    const username = req.user
    const user = db.users.get(username)
    const mayManage = username === '__apikey__' || user?.role === 'admin' || isProjectAdmin(project, username) || !db.users.hasAny()
    if (!mayManage) return res.status(403).json({ error: 'Nur Projekt-/Systemadmins.' })

    const { _version, _updatedAt, ...pData } = project
    const revoke = req.body?.action === 'revoke'
    const token  = revoke ? null : auth.generateToken()
    db.projects.update(req.params.id, { ...pData, portalToken: token, updatedAt: new Date().toISOString() }, _version, username)
    broadcast('project', 'update', req.params.id, new Date().toISOString())
    logEvent(revoke ? 'PORTAL_REVOKED' : 'PORTAL_CREATED', req, `project=${req.params.id}`)
    res.json({ ok: true, url: token ? `${getAppUrl(req)}/portal/${token}` : null })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// GET – öffentliche Statusseite (login-frei, externe Sicht)
app.get('/portal/:token', (req, res) => {
  try {
    const project = db.projects.list().find(p => p.portalToken && p.portalToken === req.params.token)
    if (!project || project.isArchived) {
      return res.status(404).send(renderSimplePage('Nicht verfügbar',
        '<p style="color:#6b7280;">Dieser Link ist ungültig oder wurde deaktiviert.</p>'))
    }
    const data = collectProjectStatus(project.id)
    const tpl  = getEmailSettings().weekly_report
    const sections = {
      meetings: data.meetings.length > 0,
      overdue:  data.overdueTasks.length > 0,
      releases: data.releases.length > 0,
      open:     data.openTasks.length > 0,
      pending:  false,   // intern
      reviews:  data.planReviewsOpen.length > 0 || data.planReviewsDecided.length > 0,
      issues:   data.bimIssuesOpen.length > 0,
      docs:     data.newDocs.length > 0,
      notes:    false,   // intern
    }
    logEvent('PORTAL_VIEW', req, `project=${project.id}`)
    res.send(buildProjectStatusHtml(project.name || 'Projekt', data, tpl, sections))
  } catch (e) { res.status(500).send(renderSimplePage('Fehler', `<p>${esc(e.message)}</p>`)) }
})

// Scheduler: prüft minütlich, ob der konfigurierte Wochentag + Uhrzeit erreicht ist.
// Feuert auch beim Start nach, wenn der heutige Versand noch aussteht.
function startWeeklyReportScheduler() {
  const KEY = 'weekly_report_last_run'   // YYYY-MM-DD des letzten Versands

  function tryRun() {
    try {
      const { schedule_day, schedule_hour } = getEmailSettings().weekly_report
      const now      = new Date()
      const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      if (now.getDay()   !== schedule_day)   return
      if (now.getHours() <  schedule_hour)   return
      if (db.appState.get(KEY) === todayKey) return   // heute schon gelaufen
      db.appState.set(KEY, todayKey)                  // Marker zuerst (verhindert Doppelversand)
      console.log('[reporting] Starte Wochenbericht …')
      sendWeeklyReleaseReports()
        .then(r => console.log('[reporting] Ergebnis:', JSON.stringify(r)))
        .catch(e => console.warn('[reporting] Fehlgeschlagen:', e.message))
    } catch (e) { console.warn('[reporting] Scheduler-Fehler:', e.message) }
  }

  // Beim Start sofort prüfen (Nachholung falls Container nach 10:00 gestartet)
  tryRun()
  // Danach minütlich prüfen
  setInterval(tryRun, 60 * 1000)
}

// Admin-Trigger zum manuellen Testen des Wochenberichts.
app.post('/api/admin/release-report-test', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await sendWeeklyReleaseReports({ appUrl: getAppUrl(req) })
    logEvent('RELEASE_REPORT_TEST', req, JSON.stringify(result))
    res.json({ ok: true, ...result })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Static frontend ───────────────────────────────────────────────────────────
const distDir = path.join(__dirname, '../dist')

function serveHtml(_req, res) {
  const htmlPath = path.join(distDir, 'index.html')
  if (!fs.existsSync(htmlPath)) {
    return res.status(503).send('Frontend nicht gebaut. Bitte zuerst "npm run build" ausführen.')
  }
  let html = fs.readFileSync(htmlPath, 'utf8')
  const vars = ['window.__SERVER_MODE__=true']
  if (API_KEY) vars.push(`window.__API_KEY__=${JSON.stringify(API_KEY)}`)
  html = html.replace('</head>', `<script>${vars.join(';')}</script></head>`)
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.send(html)
}

app.get('/', serveHtml)
app.use(express.static(distDir, {
  index: false,
  setHeaders: (res) => { res.setHeader('X-Content-Type-Options', 'nosniff') },
}))

// ── Row-level data API ────────────────────────────────────────────────────────
function makeRoutes(router, store, resourceType) {
  router.get('/', requireAuth, (req, res) => {
    try { res.json(store.list()) }
    catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.get('/:id', requireAuth, (req, res) => {
    try {
      const item = store.get(req.params.id)
      if (!item) return res.status(404).json({ error: 'Nicht gefunden.' })
      res.json(item)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.post('/', requireAuth, writeLimiter, (req, res) => {
    try {
      const data = req.body
      if (!data?.id) return res.status(400).json({ error: 'Objekt mit "id"-Feld erwartet.' })
      if (store.get(data.id)) return res.status(409).json({ error: 'ID existiert bereits.' })
      const result = store.create(data, req.user)
      broadcast(resourceType, 'create', data.id, data.updatedAt)
      res.status(201).json(result)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.patch('/:id', requireAuth, writeLimiter, (req, res) => {
    try {
      const { data, version } = req.body
      if (!data || typeof version !== 'number') return res.status(400).json({ error: '"data" und "version" erwartet.' })
      const result = store.update(req.params.id, data, version, req.user)
      if (result.notFound) return res.status(404).json({ error: 'Nicht gefunden.' })
      if (result.conflict) return res.status(409).json({
        error: 'Konflikt – Eintrag wurde zwischenzeitlich geändert.',
        serverVersion: result.serverVersion,
        serverData:    result.serverData,
      })
      broadcast(resourceType, 'update', req.params.id, data.updatedAt)
      res.json(result)
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  router.delete('/:id', requireAuth, writeLimiter, (req, res) => {
    try {
      if (!store.delete(req.params.id)) return res.status(404).json({ error: 'Nicht gefunden.' })
      broadcast(resourceType, 'delete', req.params.id, new Date().toISOString())
      res.json({ ok: true })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })

  // Legacy bulk replace – broadcasts a full-reload signal
  router.put('/', requireAuth, writeLimiter, (req, res) => {
    try {
      if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Array erwartet.' })
      store.replaceAll(req.body, req.user)
      broadcast(resourceType, 'reload', null, new Date().toISOString())
      res.json({ ok: true, count: req.body.length })
    } catch (e) { res.status(500).json({ error: e.message }) }
  })
}

const protocolRouter = express.Router()
const projectRouter  = express.Router()
makeRoutes(protocolRouter, db.protocols, 'protocol')
makeRoutes(projectRouter,  db.projects,  'project')

// ── Projektzugang: Route-Overrides vor den generischen Routern ───────────────
// Diese app.*-Routen werden vor den sub-Routern abgeglichen (FIFO in Express).

app.get('/api/protocols', requireAuth, (req, res) => {
  try {
    const all = db.protocols.list()
    res.json(all.filter(p => {
      if (!p.projectId) return true
      const proj = db.projects.get(p.projectId)
      return !proj || canAccessProject(proj, req.user)
    }))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/protocols/:id', requireAuth, (req, res) => {
  try {
    const p = db.protocols.get(req.params.id)
    if (!p) return res.status(404).json({ error: 'Nicht gefunden.' })
    if (p.projectId) {
      const proj = db.projects.get(p.projectId)
      if (proj && !canAccessProject(proj, req.user))
        return res.status(403).json({ error: 'Kein Zugriff auf dieses Protokoll.' })
    }
    res.json(p)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Protokoll als PDF-Anhang an die Teilnehmer versenden.
// Das PDF wird im Browser erzeugt (Logo liegt nur dort) und als base64 übergeben.
// Der E-Mail-Text beschreibt den Anhang, nennt den nächsten Termin und weist
// darauf hin, dass die resultierenden Aufgaben separat versendet werden.
app.post('/api/protocols/:id/send-email', requireAuth, async (req, res) => {
  try {
    const protocol = db.protocols.get(req.params.id)
    if (!protocol) return res.status(404).json({ error: 'Protokoll nicht gefunden.' })
    if (protocol.projectId) {
      const proj = db.projects.get(protocol.projectId)
      if (proj && !canAccessProject(proj, req.user))
        return res.status(403).json({ error: 'Kein Zugriff auf dieses Protokoll.' })
    }

    const { to, subject, pdfBase64, pdfFilename, mode, deadline, attachmentIds } = req.body
    const isReview = mode === 'freigabe'
    if (!to) return res.status(400).json({ error: '"to" erwartet.' })
    if (!mailer.mailerStatus().configured) return res.status(400).json({ error: 'E-Mail-Versand nicht konfiguriert.' })

    const from        = process.env.SMTP_FROM || process.env.GRAPH_SENDER || process.env.SMTP_USER || 'noreply@ghba'
    const sender      = req.user !== '__apikey__' && req.user !== '__anonymous__' ? db.users.get(req.user) : null
    const senderName  = sender?.display_name || null
    const replyTo     = sender?.email || null
    const fromAddress = senderName ? `"${senderName} (GHBA)" <${from}>` : from

    const projStr     = protocol.projectName || 'Unbekanntes Projekt'
    const meetingType = protocol.meetingType || 'Besprechung'
    const subtitleStr = (protocol.subtitle || '').trim()   // Protokollbezeichnung
    const today       = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const fmtDate     = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''
    const protoDate   = fmtDate(protocol.date)
    const tpl         = isReview ? getEmailSettings().protocol_review : getEmailSettings().protocol
    const nextStr = protocol.nextMeeting
      ? `${fmtDate(protocol.nextMeeting)}${protocol.nextMeetingTime ? `, ${protocol.nextMeetingTime} Uhr` : ''}${protocol.location ? ` · ${protocol.location}` : ''}`
      : null
    const hasActions = Array.isArray(protocol.actionItems) && protocol.actionItems.length > 0
    const deadlineStr = deadline ? fmtDate(deadline) : ''

    const protoVars = { project: projStr, date: protoDate || '', date_sep: protoDate ? ' – ' : '' }
    const mailSubject = subject || applyTpl(tpl.subject, protoVars)
    const introText   = applyTpl(tpl.intro, protoVars)

    // Protokoll-Anlagen: es werden ausschließlich Anlagen dieses Protokolls
    // berücksichtigt (IDs stammen aus dem Datensatz, nicht aus dem Request) –
    // der Client wählt daraus nur aus.
    const ownAttachments = Array.isArray(protocol.attachments) ? protocol.attachments : []
    const wanted = Array.isArray(attachmentIds)
      ? ownAttachments.filter(a => attachmentIds.includes(a.id))
      : ownAttachments

    const attachHtml = wanted.length > 0
      ? `<tr><td style="padding:8px 36px 0 36px;color:#4B5563;font-size:14px;">
           <strong>Anlagen zu diesem Protokoll:</strong>
           <ul style="margin:6px 0 0 0;padding-left:18px;color:#4B5563;font-size:13px;">
             ${wanted.map(a => `<li>${esc(a.name || 'Anlage')}</li>`).join('')}
           </ul>
         </td></tr>`
      : ''
    const attachText = wanted.length > 0
      ? ['', 'Anlagen zu diesem Protokoll:', ...wanted.map(a => `- ${a.name || 'Anlage'}`)]
      : []

    // Mittelteil unterscheidet sich: Standard = nächster Termin/Aufgaben,
    // Freigabe = Frist-/Freigabehinweis (Rückmeldung erbeten).
    let midHtml, midText
    if (isReview) {
      const deadlineHtml = deadlineStr
        ? `<tr><td style="padding:0 36px 4px 36px;color:#000040;font-size:14px;"><strong>${esc(applyTpl(tpl.deadline_note, { deadline: deadlineStr }))}</strong></td></tr>
           <tr><td style="padding:2px 36px 4px 36px;color:#6B7280;font-size:13px;">${esc(tpl.silence_note)}</td></tr>`
        : ''
      midHtml = deadlineHtml
      midText = [
        '', tpl.detail,
        ...(deadlineStr ? ['', applyTpl(tpl.deadline_note, { deadline: deadlineStr }), tpl.silence_note] : []),
      ]
    } else {
      midHtml =
        (nextStr
          ? `<tr><td style="padding:0 36px 4px 36px;color:#000040;font-size:14px;"><strong>Nächste Besprechung:</strong> ${nextStr}</td></tr>`
          : `<tr><td style="padding:0 36px 4px 36px;color:#6B7280;font-size:14px;">${esc(tpl.no_next_meeting)}</td></tr>`)
        + (hasActions ? `<tr><td style="padding:8px 36px 0 36px;color:#4B5563;font-size:14px;">${esc(tpl.actions_note)}</td></tr>` : '')
      midText = [
        '', nextStr ? `Nächste Besprechung: ${nextStr}` : tpl.no_next_meeting,
        ...(hasActions ? ['', tpl.actions_note] : []),
      ]
    }

    const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F0F0F0;font-family:Arial,sans-serif;font-size:14px;color:#1F2937;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F0F0;padding:32px 16px;">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0" style="background:#FFF;border:1px solid #E5E7EB;max-width:620px;width:100%;">
        <tr><td style="background:#000040;padding:28px 36px;">
          <p style="margin:0;color:#8FBEFF;font-size:11px;letter-spacing:2px;text-transform:uppercase;">GHBA${isReview ? ' · Freigabe erbeten' : ''}</p>
          <p style="margin:6px 0 0 0;color:#FBFFE6;font-size:20px;font-weight:bold;">${meetingType}${isReview ? ' – zur Freigabe' : ''}</p>
          ${subtitleStr ? `<p style="margin:4px 0 0 0;color:#FBFFE6;font-size:15px;font-weight:600;">${esc(subtitleStr)}</p>` : ''}
          <p style="margin:4px 0 0 0;color:#8FBEFF;font-size:14px;font-weight:600;">${projStr}</p>
          ${protoDate ? `<p style="margin:6px 0 0 0;color:#8FBEFF;font-size:12px;">Datum der Besprechung: ${protoDate}</p>` : ''}
        </td></tr>
        <tr><td style="padding:28px 36px 8px 36px;">
          <p style="margin:0;font-size:15px;color:#000040;">Guten Tag,</p>
          <p style="margin:10px 0 0 0;color:#4B5563;">${esc(introText)}</p>
          <p style="margin:10px 0 0 0;color:#4B5563;">${esc(tpl.detail)}</p>
        </td></tr>
        ${midHtml}
        ${attachHtml}
        <tr><td style="padding:16px 36px 28px 36px;color:#4B5563;font-size:14px;">
          ${esc(isReview ? '' : tpl.reply_note)}
        </td></tr>
        <tr><td style="padding:20px 36px;border-top:1px solid #E5E7EB;background:#F0F0F0;text-align:center;">
          <p style="margin:0;color:#9CA3AF;font-size:12px;">${esc(tpl.footer)}${senderName ? ` · Gesendet von ${senderName}` : ''} · ${today}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`

    const text = [
      `${meetingType} – ${projStr}${isReview ? ' (zur Freigabe)' : ''}`,
      ...(subtitleStr ? [subtitleStr] : []),
      protoDate ? `Datum der Besprechung: ${protoDate}` : '',
      '',
      'Guten Tag,',
      '',
      introText,
      tpl.detail,
      ...midText,
      ...attachText,
      ...(isReview ? [] : ['', tpl.reply_note]),
      '', tpl.footer,
    ].filter(l => l !== undefined).join('\n')

    const mailAttachments = []
    if (pdfBase64) {
      mailAttachments.push({
        filename:    pdfFilename || `Protokoll_${projStr}.pdf`,
        content:     Buffer.from(pdfBase64, 'base64'),
        contentType: 'application/pdf',
      })
    }

    // Protokoll-Anlagen als eigene Dateien anhängen.
    const missing = []
    for (const a of wanted) {
      const data = await attachments.load(a.id)
      if (!data) { missing.push(a.name || a.id); continue }
      mailAttachments.push({
        filename:    a.name || `Anlage_${a.id}`,
        content:     Buffer.from(data, 'base64'),
        contentType: a.mimeType || 'application/octet-stream',
      })
    }
    if (missing.length > 0) {
      return res.status(400).json({ error: `Anlage(n) nicht mehr im Speicher gefunden: ${missing.join(', ')}` })
    }

    await mailer.sendMail({ from: fromAddress, to, replyTo, subject: mailSubject, html, text, attachments: mailAttachments })
    logEvent(isReview ? 'PROTOCOL_REVIEW_SENT' : 'PROTOCOL_EMAIL_SENT', req, `to=${to} project=${projStr} sender=${senderName || req.user}`)

    // Freigabe-Versand am Protokoll vermerken
    if (isReview) {
      try {
        const { _version, _updatedAt, ...pData } = protocol
        db.protocols.update(protocol.id, {
          ...pData,
          reviewSentAt: new Date().toISOString(),
          reviewDeadline: deadline || null,
        }, _version, req.user)
        broadcast('protocol', 'update', protocol.id, new Date().toISOString())
      } catch (_) {}
    }
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Enriches a project with display names + emails of admin users (from users table)
function withAdminContacts(project) {
  const adminUsernames = [
    project.projectAdminUser,
    ...(Array.isArray(project.projectAdmins) ? project.projectAdmins : []),
  ].filter(Boolean)
  const adminContacts = adminUsernames.map(username => {
    const u = db.users.get(username)
    return {
      id:      `__admin__${username}`,
      name:    (u?.displayName) || username,
      email:   u?.email || '',
      company: '',
      role:    'Projektadmin',
      _isAdmin: true,
    }
  })
  return { ...project, adminContacts }
}

app.get('/api/projects', requireAuth, (req, res) => {
  try {
    res.json(db.projects.list().filter(p => canAccessProject(p, req.user)).map(withAdminContacts))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/projects/:id/access', requireAuth, (req, res) => {
  try {
    const p = db.projects.get(req.params.id)
    if (!p) return res.status(404).json({ error: 'Nicht gefunden.' })
    if (!isProjectManager(p, req.user)) return res.status(403).json({ error: 'Keine Berechtigung.' })
    res.json({
      isAccessControlled: p.isAccessControlled ?? false,
      projectAdminUser:   p.projectAdminUser   ?? null,
      projectAdmins:      Array.isArray(p.projectAdmins) ? p.projectAdmins : [],
      allowedUsers:       Array.isArray(p.allowedUsers)  ? p.allowedUsers  : [],
    })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Verwaltet Projektzugang, Co-Administratoren und Autoren. Jede der drei
// Eigenschaften ist optional – nur übergebene Felder werden geändert.
app.patch('/api/projects/:id/access', requireAuth, writeLimiter, (req, res) => {
  try {
    const { isAccessControlled, allowedUsers, projectAdmins, distribution } = req.body
    const p = db.projects.get(req.params.id)
    if (!p) return res.status(404).json({ error: 'Nicht gefunden.' })
    if (!isProjectManager(p, req.user)) return res.status(403).json({ error: 'Nur Projektadministratoren können Zugriffsrechte ändern.' })

    // Gültige Benutzernamen für Validierung
    const validUsernames = new Set(db.users.list().map(u => u.username))

    const buildPatch = (base) => {
      const next = { ...base, updatedAt: new Date().toISOString() }
      if (typeof isAccessControlled === 'boolean') next.isAccessControlled = isAccessControlled
      if (Array.isArray(allowedUsers)) {
        next.allowedUsers = allowedUsers.filter(u => validUsernames.has(u) && u !== base.projectAdminUser)
      }
      if (Array.isArray(projectAdmins)) {
        // Co-Admins: gültige Nutzer, nicht der Ersteller, dedupliziert
        next.projectAdmins = [...new Set(projectAdmins.filter(u => validUsernames.has(u) && u !== base.projectAdminUser))]
      }
      if (distribution && Array.isArray(distribution.recipients)) {
        next.distribution = { recipients: sanitizeDistributionRecipients(distribution.recipients) }
      }
      return next
    }

    const { _version, _updatedAt, ...pData } = p
    let updated = buildPatch(pData)
    let result  = db.projects.update(req.params.id, updated, _version, req.user)
    if (result.conflict) {
      const fresh = db.projects.get(req.params.id)
      const { _version: v2, _updatedAt: _2, ...freshData } = fresh
      updated = buildPatch(freshData)
      result  = db.projects.update(req.params.id, updated, v2, req.user)
    }
    if (result.notFound) return res.status(404).json({ error: 'Nicht gefunden.' })
    if (result.conflict) return res.status(409).json({ error: 'Konflikt – bitte erneut versuchen.' })
    broadcast('project', 'update', req.params.id, updated.updatedAt)
    logEvent('PROJECT_ACCESS_CHANGED', req, `project=${req.params.id} by=${req.user}`)

    // Benachrichtigung an neu hinzugefügte Co-Admins
    if (mailer.mailerStatus().configured) {
      const oldAdmins = new Set(Array.isArray(p.projectAdmins) ? p.projectAdmins : [])
      const newAdmins = (updated.projectAdmins ?? []).filter(u => !oldAdmins.has(u))
      if (newAdmins.length > 0) {
        const from        = process.env.SMTP_FROM || process.env.GRAPH_SENDER || process.env.SMTP_USER || 'noreply@ghba'
        const assignedBy  = db.users.get(req.user)
        const byName      = assignedBy?.display_name || req.user
        const appUrl      = getAppUrl(req)
        const projName    = updated.name || 'Unbekanntes Projekt'
        const today       = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
        for (const username of newAdmins) {
          const u = db.users.get(username)
          if (!u?.email) continue
          const displayName = u.display_name || username
          const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F0F0F0;font-family:Arial,sans-serif;font-size:14px;color:#1F2937;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F0F0;padding:32px 16px;">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0" style="background:#FFF;border:1px solid #E5E7EB;max-width:620px;width:100%;">
        <tr><td style="background:#000040;padding:28px 36px;">
          <p style="margin:0;color:#8FBEFF;font-size:11px;letter-spacing:2px;text-transform:uppercase;">GHBA</p>
          <p style="margin:6px 0 0 0;color:#FBFFE6;font-size:20px;font-weight:bold;">Projektadministrator</p>
          <p style="margin:4px 0 0 0;color:#8FBEFF;font-size:14px;">${projName}</p>
        </td></tr>
        <tr><td style="padding:28px 36px 16px 36px;">
          <p style="margin:0;font-size:15px;color:#000040;">Guten Tag, ${displayName},</p>
          <p style="margin:12px 0 0 0;color:#4B5563;">Sie wurden von <strong>${byName}</strong> als <strong>Projektadministrator</strong> für das Projekt <strong>${projName}</strong> ernannt.</p>
          <p style="margin:10px 0 0 0;color:#4B5563;">Als Projektadministrator können Sie den Projektzugang, Co-Administratoren, Autoren und Freimelde-Links verwalten.</p>
          ${appUrl ? `<p style="margin:20px 0 0 0;"><a href="${appUrl}" style="background:#000040;color:#FBFFE6;padding:10px 22px;text-decoration:none;font-weight:bold;font-size:14px;display:inline-block;">Zur Anwendung</a></p>` : ''}
        </td></tr>
        <tr><td style="padding:20px 36px;border-top:1px solid #E5E7EB;background:#F0F0F0;text-align:center;">
          <p style="margin:0;color:#9CA3AF;font-size:12px;">GHBA · ${today}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
          const text = `Guten Tag, ${displayName},\n\nSie wurden von ${byName} als Projektadministrator für das Projekt „${projName}" ernannt.\n\nAls Projektadministrator können Sie den Projektzugang, Co-Administratoren, Autoren und Freimelde-Links verwalten.\n\n${appUrl ? 'Zur Anwendung: ' + appUrl + '\n\n' : ''}GHBA`
          mailer.sendMail({
            from, to: u.email,
            subject: `Projektadministrator – ${projName}`,
            html, text,
          }).catch(() => {})
        }
      }
    }

    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/projects/:id', requireAuth, (req, res) => {
  try {
    const p = db.projects.get(req.params.id)
    if (!p) return res.status(404).json({ error: 'Nicht gefunden.' })
    if (!canAccessProject(p, req.user)) return res.status(403).json({ error: 'Kein Zugriff auf dieses Projekt.' })
    res.json(withAdminContacts(p))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/projects', requireAuth, writeLimiter, (req, res) => {
  try {
    const data = req.body
    if (!data?.id) return res.status(400).json({ error: 'Objekt mit "id"-Feld erwartet.' })
    if (db.projects.get(data.id)) return res.status(409).json({ error: 'ID existiert bereits.' })
    const enriched = { ...data }
    if (!enriched.projectAdminUser && req.user !== '__anonymous__' && req.user !== '__apikey__') {
      enriched.projectAdminUser = req.user
    }
    const result = db.projects.create(enriched, req.user)
    broadcast('project', 'create', enriched.id, enriched.updatedAt)
    syncOrgContacts()
    res.status(201).json(result)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.patch('/api/projects/:id', requireAuth, writeLimiter, (req, res) => {
  try {
    const { data, version } = req.body
    if (!data || typeof version !== 'number') return res.status(400).json({ error: '"data" und "version" erwartet.' })
    const existing = db.projects.get(req.params.id)
    if (!existing) return res.status(404).json({ error: 'Nicht gefunden.' })
    if (!canAccessProject(existing, req.user)) return res.status(403).json({ error: 'Kein Zugriff auf dieses Projekt.' })
    // Access-control fields may only be changed via PATCH /api/projects/:id/access.
    // Always restore them from the authoritative server copy so a stale client
    // (e.g. during the 409-retry path) cannot silently clear them.
    const safeData = {
      ...data,
      isAccessControlled: existing.isAccessControlled,
      allowedUsers:       existing.allowedUsers,
      projectAdminUser:   existing.projectAdminUser,
      projectAdmins:      existing.projectAdmins,
    }
    // Projektdatenbank (projectData) darf nur von System- oder Projektadmins
    // geändert werden – für alle anderen wird die Server-Kopie wiederhergestellt.
    const requester = req.user !== '__apikey__' && req.user !== '__anonymous__' ? db.users.get(req.user) : null
    const mayEditData = req.user === '__apikey__' || !db.users.hasAny()
      || requester?.role === 'admin' || isProjectAdmin(existing, req.user)
    if (!mayEditData) safeData.projectData = existing.projectData
    const result = db.projects.update(req.params.id, safeData, version, req.user)
    if (result.notFound) return res.status(404).json({ error: 'Nicht gefunden.' })
    if (result.conflict) return res.status(409).json({
      error: 'Konflikt – Eintrag wurde zwischenzeitlich geändert.',
      serverVersion: result.serverVersion,
      serverData:    result.serverData,
    })
    broadcast('project', 'update', req.params.id, safeData.updatedAt)
    syncOrgContacts()
    res.json(result)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/projects/:id', requireAuth, writeLimiter, (req, res) => {
  try {
    const user = db.users.get(req.user)
    const isSysAdmin = user?.role === 'admin' || req.user === '__apikey__' || req.user === '__anonymous__'
    if (!isSysAdmin) return res.status(403).json({ error: 'Keine Berechtigung. Bitte eine Löschanfrage stellen.' })
    if (!db.projects.delete(req.params.id)) return res.status(404).json({ error: 'Nicht gefunden.' })
    broadcast('project', 'delete', req.params.id, new Date().toISOString())
    syncOrgContacts()
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.use('/api/protocols', protocolRouter)
app.use('/api/projects',  projectRouter)

// ── Notizen-Endpunkte ─────────────────────────────────────────────────────────
app.get('/api/notes', requireAuth, (req, res) => {
  try {
    const all = db.notes.list()
    res.json(all.filter(n => {
      if (!n.projectId) return true
      const proj = db.projects.get(n.projectId)
      return !proj || canAccessProject(proj, req.user)
    }))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/notes/:id', requireAuth, (req, res) => {
  try {
    const n = db.notes.get(req.params.id)
    if (!n) return res.status(404).json({ error: 'Nicht gefunden.' })
    if (n.projectId) {
      const proj = db.projects.get(n.projectId)
      if (proj && !canAccessProject(proj, req.user)) return res.status(403).json({ error: 'Kein Zugriff.' })
    }
    res.json(n)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/notes', requireAuth, writeLimiter, (req, res) => {
  try {
    const data = req.body
    if (!data?.id) return res.status(400).json({ error: 'Objekt mit "id"-Feld erwartet.' })
    if (db.notes.get(data.id)) return res.status(409).json({ error: 'ID existiert bereits.' })
    const result = db.notes.create(data, req.user)
    broadcast('note', 'create', data.id, data.updatedAt)
    res.status(201).json(result)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.patch('/api/notes/:id', requireAuth, writeLimiter, (req, res) => {
  try {
    const { data, version } = req.body
    if (!data || typeof version !== 'number') return res.status(400).json({ error: '"data" und "version" erwartet.' })
    const existing = db.notes.get(req.params.id)
    if (!existing) return res.status(404).json({ error: 'Nicht gefunden.' })
    if (existing.projectId) {
      const proj = db.projects.get(existing.projectId)
      if (proj && !canAccessProject(proj, req.user)) return res.status(403).json({ error: 'Kein Zugriff.' })
    }
    const result = db.notes.update(req.params.id, data, version, req.user)
    if (result.notFound) return res.status(404).json({ error: 'Nicht gefunden.' })
    if (result.conflict) return res.status(409).json({ error: 'Konflikt.', serverVersion: result.serverVersion, serverData: result.serverData })
    broadcast('note', 'update', req.params.id, data.updatedAt)
    res.json(result)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/notes/:id', requireAuth, writeLimiter, (req, res) => {
  try {
    if (!db.notes.delete(req.params.id)) return res.status(404).json({ error: 'Nicht gefunden.' })
    broadcast('note', 'delete', req.params.id, new Date().toISOString())
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/notes/:id/send-email', requireAuth, async (req, res) => {
  try {
    const note = db.notes.get(req.params.id)
    if (!note) return res.status(404).json({ error: 'Notiz nicht gefunden.' })
    const { to, subject, pdfBase64, pdfFilename } = req.body
    if (!to) return res.status(400).json({ error: '"to" erwartet.' })
    if (!mailer.mailerStatus().configured) return res.status(400).json({ error: 'E-Mail-Versand nicht konfiguriert.' })

    const from    = process.env.SMTP_FROM || process.env.GRAPH_SENDER || process.env.SMTP_USER || 'noreply@ghba'
    const sender  = req.user !== '__apikey__' && req.user !== '__anonymous__' ? db.users.get(req.user) : null
    const replyTo = sender?.email || null
    const fromAddress = sender?.display_name ? `"${sender.display_name} (GHBA)" <${from}>` : from

    const noteTpl     = getEmailSettings().note
    const NOTE_TYPE_LABELS = { aktennotiz: 'Aktennotiz', telefonnotiz: 'Telefonnotiz', besprochen: 'Besprechungsnotiz' }
    const typeLabel   = NOTE_TYPE_LABELS[note.type] || 'Notiz'
    const dateStr     = note.date ? new Date(note.date + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''
    const today       = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const projName    = note.projectName || (note.projectId ? (db.projects.get(note.projectId)?.name || null) : null)
    const creatorName = sender?.display_name || null
    const noteVars    = { type: typeLabel, note_subject: note.subject || 'Ohne Betreff', project: projName || '', date: dateStr || '' }
    const mailSubject = subject || applyTpl(noteTpl.subject, noteVars)
    const introText   = applyTpl(noteTpl.intro, noteVars)
    const greeting    = noteTpl.greeting || 'Guten Tag,'

    const participants = Array.isArray(note.participants) ? note.participants : []
    const participantsHtml = participants.length > 0
      ? `<tr><td style="padding:0 36px 8px 36px;">
           <p style="margin:0 0 4px 0;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#777;">Teilnehmer</p>
           <p style="margin:0;font-size:13px;color:#1F2937;">${participants.map(p => esc([p.name, p.company].filter(Boolean).join(', ') || p.email)).join(' · ')}</p>
         </td></tr>`
      : ''

    const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F0F0F0;font-family:Arial,sans-serif;font-size:14px;color:#1F2937;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F0F0;padding:32px 16px;">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0" style="background:#FFF;border:1px solid #E5E7EB;max-width:620px;width:100%;">
        <tr><td style="background:#000040;padding:28px 36px;">
          <p style="margin:0;color:#8FBEFF;font-size:11px;letter-spacing:2px;text-transform:uppercase;">GHBA</p>
          <p style="margin:6px 0 0 0;color:#FBFFE6;font-size:20px;font-weight:bold;">${typeLabel}</p>
          ${projName  ? `<p style="margin:4px 0 0 0;color:#8FBEFF;font-size:14px;">${esc(projName)}</p>` : ''}
          ${dateStr   ? `<p style="margin:6px 0 0 0;color:#8FBEFF;font-size:12px;">Datum: ${dateStr}${note.time ? ', ' + note.time + ' Uhr' : ''}</p>` : ''}
        </td></tr>
        <tr><td style="padding:28px 36px 12px 36px;">
          <p style="margin:0;font-size:15px;color:#000040;">${esc(greeting)}</p>
          <p style="margin:10px 0 0 0;color:#4B5563;">${esc(introText)}</p>
          ${pdfBase64 ? `<p style="margin:10px 0 0 0;color:#4B5563;">Die <strong>${esc(typeLabel)}</strong> ist dieser E-Mail als <strong>PDF-Anlage</strong> beigefügt.</p>` : ''}
        </td></tr>
        ${participantsHtml}
        <tr><td style="padding:12px 36px 8px 36px;border-top:1px solid #E5E7EB;">
          <p style="margin:0 0 8px 0;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#9CA3AF;">Inhalt</p>
          <div style="font-size:14px;color:#1F2937;line-height:1.6;">${note.content || '<p style="color:#9CA3AF;">Kein Inhalt.</p>'}</div>
        </td></tr>
        <tr><td style="padding:20px 36px;border-top:1px solid #E5E7EB;background:#F0F0F0;text-align:center;">
          <p style="margin:0;color:#9CA3AF;font-size:12px;">${esc(noteTpl.footer)}${creatorName ? ` · Gesendet von ${esc(creatorName)}` : ''} · ${today}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`

    const attachments = []
    if (pdfBase64) {
      attachments.push({
        filename:    pdfFilename || `${typeLabel}.pdf`,
        content:     Buffer.from(pdfBase64, 'base64'),
        contentType: 'application/pdf',
      })
    }

    await mailer.sendMail({ from: fromAddress, to, replyTo, subject: mailSubject, html, attachments })
    db.notes.update(req.params.id, { ...note, sentAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, note._version || 1, req.user)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Notebooks ────────────────────────────────────────────────────────────────

app.get('/api/notebooks/:projectId', requireAuth, (req, res) => {
  try {
    const proj = db.projects.get(req.params.projectId)
    if (!proj) return res.status(404).json({ error: 'Projekt nicht gefunden.' })
    if (!canAccessProject(proj, req.user)) return res.status(403).json({ error: 'Kein Zugriff.' })
    const nb = db.notebooks.get(req.params.projectId)
    if (!nb) return res.json({ id: req.params.projectId, projectId: req.params.projectId, topics: [], updatedAt: null })
    res.json(nb)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.put('/api/notebooks/:projectId', requireAuth, writeLimiter, (req, res) => {
  try {
    const proj = db.projects.get(req.params.projectId)
    if (!proj) return res.status(404).json({ error: 'Projekt nicht gefunden.' })
    if (!canAccessProject(proj, req.user)) return res.status(403).json({ error: 'Kein Zugriff.' })
    const { version, ...rest } = req.body
    const data = { ...rest, id: req.params.projectId, projectId: req.params.projectId, updatedAt: new Date().toISOString() }
    const existing = db.notebooks.get(req.params.projectId)
    let result
    if (!existing) {
      result = db.notebooks.create(data, req.user)
    } else {
      const ver = typeof version === 'number' ? version : (existing._version || 1)
      result = db.notebooks.update(req.params.projectId, data, ver, req.user)
      if (result.conflict) {
        result = db.notebooks.update(req.params.projectId, data, result.serverVersion, req.user)
      }
      if (result.notFound) {
        result = db.notebooks.create(data, req.user)
      }
    }
    res.json(result)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/notebooks/:projectId/send-email', requireAuth, async (req, res) => {
  try {
    const proj = db.projects.get(req.params.projectId)
    if (!proj) return res.status(404).json({ error: 'Projekt nicht gefunden.' })
    if (!canAccessProject(proj, req.user)) return res.status(403).json({ error: 'Kein Zugriff.' })
    if (!mailer.mailerStatus().configured) return res.status(400).json({ error: 'E-Mail-Versand nicht konfiguriert.' })
    const { to, subject, html: bodyHtml, pdfBase64, pdfFilename } = req.body
    if (!to) return res.status(400).json({ error: '"to" erwartet.' })
    const nbTpl       = getEmailSettings().notebook
    const from        = process.env.SMTP_FROM || process.env.GRAPH_SENDER || process.env.SMTP_USER || 'noreply@ghba'
    const sender      = req.user !== '__apikey__' && req.user !== '__anonymous__' ? db.users.get(req.user) : null
    const replyTo     = sender?.email || null
    const fromAddress = sender?.display_name ? `"${sender.display_name} (GHBA)" <${from}>` : from
    const nbToday     = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const nbCreator   = sender?.display_name || null
    const nbVars      = { project: proj.name || 'Projekt' }
    const mailSubject = subject || applyTpl(nbTpl.subject, nbVars)
    const nbIntro     = applyTpl(nbTpl.intro, nbVars)
    const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F0F0F0;font-family:Arial,sans-serif;font-size:14px;color:#1F2937;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F0F0;padding:32px 16px;">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0" style="background:#FFF;border:1px solid #E5E7EB;max-width:620px;width:100%;">
        <tr><td style="background:#000040;padding:28px 36px;">
          <p style="margin:0;color:#8FBEFF;font-size:11px;letter-spacing:2px;text-transform:uppercase;">GHBA</p>
          <p style="margin:6px 0 0 0;color:#FBFFE6;font-size:20px;font-weight:bold;">Notizbuch</p>
          <p style="margin:4px 0 0 0;color:#8FBEFF;font-size:14px;">${esc(proj.name || 'Projekt')}</p>
        </td></tr>
        <tr><td style="padding:28px 36px 12px 36px;">
          <p style="margin:0;font-size:15px;color:#000040;">${esc(nbTpl.greeting)}</p>
          <p style="margin:10px 0 0 0;color:#4B5563;">${esc(nbIntro)}${nbCreator ? ` Gesendet von <strong>${esc(nbCreator)}</strong>.` : ''}</p>
          ${pdfBase64 ? `<p style="margin:10px 0 0 0;color:#4B5563;">Das Notizbuch ist dieser E-Mail als <strong>PDF-Anlage</strong> beigefügt.</p>` : ''}
        </td></tr>
        <tr><td style="padding:12px 36px 8px 36px;border-top:1px solid #E5E7EB;">
          <p style="margin:0 0 8px 0;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#9CA3AF;">Inhalt</p>
          <div style="font-size:14px;color:#1F2937;line-height:1.6;">${bodyHtml || '<p style="color:#9CA3AF;">Kein Inhalt.</p>'}</div>
        </td></tr>
        <tr><td style="padding:20px 36px;border-top:1px solid #E5E7EB;background:#F0F0F0;text-align:center;">
          <p style="margin:0;color:#9CA3AF;font-size:12px;">${esc(nbTpl.footer)}${nbCreator ? ` · Gesendet von ${esc(nbCreator)}` : ''} · ${nbToday}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
    const atts = []
    if (pdfBase64) atts.push({ filename: pdfFilename || 'Notizbuch.pdf', content: Buffer.from(pdfBase64, 'base64'), contentType: 'application/pdf' })
    await mailer.sendMail({ from: fromAddress, to, replyTo, subject: mailSubject, html, attachments: atts })
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Baudokumentation per E-Mail ───────────────────────────────────────────────
// Versand mit PDF-Anhang; das PDF entsteht aus derselben Druckansicht wie beim
// Drucken (siehe /api/projects/:id/render-pdf), damit Ausdruck und Anhang
// identisch sind.
app.post('/api/projects/:id/diary/send-email', requireAuth, async (req, res) => {
  try {
    const proj = db.projects.get(req.params.id)
    if (!proj) return res.status(404).json({ error: 'Projekt nicht gefunden.' })
    if (!canAccessProject(proj, req.user)) return res.status(403).json({ error: 'Kein Zugriff.' })
    if (!mailer.mailerStatus().configured) return res.status(400).json({ error: 'E-Mail-Versand nicht konfiguriert.' })

    const { to, subject, message, pdfBase64, pdfFilename, entryCount, periodFrom, periodTo } = req.body || {}
    if (!to || (Array.isArray(to) && to.length === 0)) return res.status(400).json({ error: '"to" erwartet.' })

    const tpl         = getEmailSettings().diary || {}
    const from        = process.env.SMTP_FROM || process.env.GRAPH_SENDER || process.env.SMTP_USER || 'noreply@ghba'
    const sender      = req.user !== '__apikey__' && req.user !== '__anonymous__' ? db.users.get(req.user) : null
    const replyTo     = sender?.email || null
    const fromAddress = sender?.display_name ? `"${sender.display_name} (GHBA)" <${from}>` : from
    const todayLabel  = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const creator     = sender?.display_name || null
    const vars        = { project: proj.name || 'Projekt', date: todayLabel }
    const mailSubject = subject || applyTpl(tpl.subject || 'Baudokumentation – {project}', vars)
    const intro       = applyTpl(tpl.intro || '', vars)
    const dateRange   = [periodFrom, periodTo].filter(Boolean).length === 2 && periodFrom !== periodTo
      ? `${periodFrom} bis ${periodTo}`
      : (periodTo || periodFrom || '')

    const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F0F0F0;font-family:Arial,sans-serif;font-size:14px;color:#1F2937;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F0F0;padding:32px 16px;">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0" style="background:#FFF;border:1px solid #E5E7EB;max-width:620px;width:100%;">
        <tr><td style="background:#000040;padding:28px 36px;">
          <p style="margin:0;color:#8FBEFF;font-size:11px;letter-spacing:2px;text-transform:uppercase;">GHBA</p>
          <p style="margin:6px 0 0 0;color:#FBFFE6;font-size:20px;font-weight:bold;">Baudokumentation</p>
          <p style="margin:4px 0 0 0;color:#8FBEFF;font-size:14px;">${esc(proj.name || 'Projekt')}</p>
        </td></tr>
        <tr><td style="padding:28px 36px 12px 36px;">
          <p style="margin:0;font-size:15px;color:#000040;">${esc(tpl.greeting || 'Guten Tag,')}</p>
          <p style="margin:10px 0 0 0;color:#4B5563;">${esc(intro)}${creator ? ` Gesendet von <strong>${esc(creator)}</strong>.` : ''}</p>
          ${message ? `<p style="margin:12px 0 0 0;color:#1F2937;white-space:pre-wrap;">${esc(message)}</p>` : ''}
          ${pdfBase64 ? `<p style="margin:12px 0 0 0;color:#4B5563;">Die Baudokumentation ist dieser E-Mail als <strong>PDF-Anlage</strong> beigefügt.</p>` : ''}
        </td></tr>
        <tr><td style="padding:12px 36px 8px 36px;border-top:1px solid #E5E7EB;">
          <p style="margin:0 0 8px 0;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#9CA3AF;">Umfang</p>
          <p style="margin:0;color:#1F2937;">
            ${Number(entryCount) > 0 ? `${esc(String(entryCount))} Eintr${Number(entryCount) === 1 ? 'ag' : 'äge'}` : 'Baudokumentation'}
            ${dateRange ? ` · Zeitraum ${esc(dateRange)}` : ''}
          </p>
        </td></tr>
        <tr><td style="padding:20px 36px;border-top:1px solid #E5E7EB;background:#F0F0F0;text-align:center;">
          <p style="margin:0;color:#9CA3AF;font-size:12px;">${esc(tpl.footer || 'GHBA')}${creator ? ` · Gesendet von ${esc(creator)}` : ''} · ${todayLabel}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`

    const atts = []
    if (pdfBase64) {
      atts.push({
        filename: pdfFilename || 'Baudokumentation.pdf',
        content: Buffer.from(pdfBase64, 'base64'),
        contentType: 'application/pdf',
      })
    }
    const recipients = Array.isArray(to) ? to.join(', ') : to
    await mailer.sendMail({ from: fromAddress, to: recipients, replyTo, subject: mailSubject, html, attachments: atts })
    logEvent('DIARY_EMAIL', req, `project=${proj.id} to=${recipients}`)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Druck-HTML einer Projektansicht (Baudokumentation, Info-Liste) zu PDF rendern
app.post('/api/projects/:id/render-pdf', requireAuth, writeLimiter, async (req, res) => {
  try {
    const proj = db.projects.get(req.params.id)
    if (!proj) return res.status(404).json({ error: 'Projekt nicht gefunden.' })
    if (!canAccessProject(proj, req.user)) return res.status(403).json({ error: 'Kein Zugriff.' })
    const { html } = req.body || {}
    if (typeof html !== 'string' || html.length < 50) {
      return res.status(400).json({ error: 'Kein Druck-HTML übergeben.' })
    }
    const { renderHtmlToPdf } = require('./pdfRender')
    const pdf = await renderHtmlToPdf(html)
    logEvent('RENDER_PDF', req, `project=${proj.id} bytes=${pdf.length}`)
    res.json({ pdfBase64: Buffer.from(pdf).toString('base64') })
  } catch (e) {
    logEvent('RENDER_PDF_FAIL', req, e.message)
    res.status(500).json({ error: 'PDF-Erzeugung fehlgeschlagen: ' + e.message })
  }
})

// ── Backup ────────────────────────────────────────────────────────────────────
const backupDir = path.join(process.env.DB_PATH || path.join(__dirname, '../data'), 'backups')
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true })

function createBackup() {
  const data = {
    version:    '1.0',
    exportedAt: new Date().toISOString(),
    protocols:  db.protocols.list(),
    projects:   db.projects.list(),
  }
  const ts       = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = `backup_${ts}.json`
  fs.writeFileSync(path.join(backupDir, filename), JSON.stringify(data, null, 2), 'utf8')
  // Nur die letzten 30 Backups behalten
  const all = fs.readdirSync(backupDir).filter(f => f.startsWith('backup_') && f.endsWith('.json')).sort()
  if (all.length > 30) all.slice(0, all.length - 30).forEach(f => { try { fs.unlinkSync(path.join(backupDir, f)) } catch {} })
  return filename
}

app.post('/api/admin/backup', requireAuth, requireAdmin, (req, res) => {
  try {
    const filename = createBackup()
    logEvent('BACKUP_CREATED', req, filename)
    res.json({ ok: true, filename })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/admin/backups', requireAuth, requireAdmin, (_req, res) => {
  try {
    const files = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('backup_') && f.endsWith('.json'))
      .sort().reverse()
      .map(f => ({ filename: f, size: fs.statSync(path.join(backupDir, f)).size }))
    res.json(files)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/admin/backups/:filename', requireAuth, requireAdmin, (req, res) => {
  try {
    const { filename } = req.params
    if (!/^backup_[\dT\-]+\.json$/.test(filename)) return res.status(400).json({ error: 'Ungültiger Dateiname.' })
    const fp = path.join(backupDir, filename)
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Nicht gefunden.' })
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.sendFile(fp)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/admin/restore', requireAuth, requireAdmin, (req, res) => {
  try {
    const { protocols, projects } = req.body
    if (!Array.isArray(protocols) || !Array.isArray(projects))
      return res.status(400).json({ error: 'Ungültiges Backup-Format.' })
    createBackup()   // Sicherheitskopie vor dem Überschreiben
    db.protocols.replaceAll(protocols, req.user)
    db.projects.replaceAll(projects,   req.user)
    logEvent('BACKUP_RESTORED', req, `protocols=${protocols.length} projects=${projects.length}`)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── Misc routes ───────────────────────────────────────────────────────────────
app.get('/api/health',  (_req, res) => res.json({ status: 'ok', time: new Date().toISOString(), version: require('../package.json').version }))
app.get('/api/version', (_req, res) => res.json({ version: require('../package.json').version }))

// Laufende Software-Version (Admin-Bereich). Die eigentliche Kennung ist die
// Build-ID aus dist/version.json: sie wird bei jedem Build neu vergeben
// (Zeitstempel) und identifiziert damit den ausgerollten Stand eindeutig.
const SERVER_STARTED_AT = new Date().toISOString()
app.get('/api/system-info', requireAuth, requireAdmin, (_req, res) => {
  let buildId = null
  try {
    buildId = JSON.parse(fs.readFileSync(path.join(distDir, 'version.json'), 'utf8')).buildId ?? null
  } catch {}
  res.json({
    version:   require('../package.json').version,
    buildId,
    startedAt: SERVER_STARTED_AT,
    uptimeSec: Math.floor(process.uptime()),
    node:      process.version,
    platform:  `${process.platform}/${process.arch}`,
  })
})

// PDF-Selbsttest (Stufe 1): prüft, ob das serverseitige Chromium-Rendering im
// Container funktioniert. Rendert ein Mini-HTML zu PDF. Nur Admin.
app.get('/api/pdf-selftest', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const { renderHtmlToPdf } = require('./pdfRender')
    const html = `<!doctype html><html><head><meta charset="utf-8">
      <style>body{font-family:Arial,sans-serif;padding:20px;color:#000}
      h1{font-size:20px}.box{background:#fef3c7;border-left:3px solid #f59e0b;padding:8px;margin-top:12px}</style>
      </head><body>
      <h1>PDF-Selbsttest – Chromium läuft ✓</h1>
      <p>Umlaute: ä ö ü ß Ä Ö Ü · Häkchen ✓ · Pfeil → · Anführung „Test".</p>
      <div class="box">Wenn dieser Kasten farbig ist, druckt Chromium Hintergrundfarben korrekt.</div>
      <p style="margin-top:12px">Erzeugt: ${new Date().toISOString()}</p>
      </body></html>`
    const pdf = await renderHtmlToPdf(html)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'inline; filename="pdf-selftest.pdf"')
    res.send(pdf)
  } catch (e) {
    logEvent('PDF_SELFTEST_FAIL', _req, e.message)
    res.status(500).json({ error: 'PDF-Selbsttest fehlgeschlagen: ' + e.message })
  }
})

// Rendert die vom Client übergebene Druckansicht (HTML) serverseitig via Chrome
// zu einem durchsuchbaren PDF. Ergebnis ist per Konstruktion identisch zu
// window.print() (gleiches DOM + CSS, Print-Media) – nur deterministisch.
app.post('/api/protocols/:id/render-pdf', requireAuth, writeLimiter, async (req, res) => {
  try {
    const { html } = req.body || {}
    if (typeof html !== 'string' || html.length < 50) {
      return res.status(400).json({ error: 'Kein Druck-HTML übergeben.' })
    }
    const { renderHtmlToPdf } = require('./pdfRender')
    const pdf = await renderHtmlToPdf(html)
    logEvent('RENDER_PDF', req, `protocol=${req.params.id} bytes=${pdf.length}`)
    res.json({ pdfBase64: Buffer.from(pdf).toString('base64') })
  } catch (e) {
    logEvent('RENDER_PDF_FAIL', req, e.message)
    res.status(500).json({ error: 'PDF-Erzeugung fehlgeschlagen: ' + e.message })
  }
})

// ── SPA fallback ──────────────────────────────────────────────────────────────
// Express 5 requires named wildcards (path-to-regexp v8)
app.get('/{*path}', serveHtml)

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  logEvent('ERROR', req, err.message)
  res.status(err.status || 500).json({ error: err.message || 'Interner Fehler' })
})

// ── Server starten ────────────────────────────────────────────────────────────
const onListen = (protocol) => () => {
  console.log(`✓ Komplizen Protokolle läuft auf ${protocol}://${HOST}:${PORT}`)
  console.log(`  Datenbank     : ${process.env.DB_PATH || path.join(__dirname, '../data')}`)
  console.log(`  API-Schlüssel : ${API_KEY ? 'Aktiv (X-API-Key)' : 'Deaktiviert'}`)
  console.log(`  CORS          : ${allowedOrigins ? allowedOrigins.join(', ') : 'Alle erlaubt'}`)

  if (!db.users.hasAny()) {
    console.log('')
    console.log('  ⚠  Kein Benutzer angelegt – offener Modus aktiv.')
    console.log('     Ersten Admin anlegen:')
    console.log('     POST /api/auth/users  { "username": "admin", "password": "...", "role": "admin" }')
    console.log('')
  } else {
    console.log(`  Benutzer      : ${db.users.list().length} registriert`)
  }

  const cleaned = db.sessions.deleteExpired()
  if (cleaned > 0) console.log(`  Sessions      : ${cleaned} abgelaufene bereinigt`)

  setInterval(() => db.sessions.deleteExpired(), 60 * 60 * 1000)

  // Automatisches Backup beim Start + alle 6 Stunden
  try { const f = createBackup(); console.log(`  Backup        : ${f}`) } catch (e) { console.warn('  Backup fehlgeschlagen:', e.message) }
  setInterval(() => { try { createBackup() } catch {} }, 6 * 60 * 60 * 1000)

  // Wöchentliches Reporting (Freitags 10:00)
  startWeeklyReportScheduler()
  console.log('  Reporting     : Wochenbericht Freitags 10:00')

  // "Eigene Organisation"-Kontakte einmal beim Start mit Benutzer-/Mitarbeiter-DB abgleichen
  try { syncOrgContacts(); console.log('  Kontakt-Sync  : Eigene Organisation abgeglichen') }
  catch (e) { console.warn('  Kontakt-Sync fehlgeschlagen:', e.message) }
}

if (certFile && keyFile && fs.existsSync(certFile) && fs.existsSync(keyFile)) {
  https.createServer({ cert: fs.readFileSync(certFile), key: fs.readFileSync(keyFile) }, app)
    .listen(PORT, HOST, onListen('https'))
} else {
  http.createServer(app).listen(PORT, HOST, onListen('http'))
}
