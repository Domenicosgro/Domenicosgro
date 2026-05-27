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
const path      = require('path')
const fs        = require('fs')
const http      = require('http')
const https     = require('https')
const os        = require('os')
const db          = require('./db')
const auth        = require('./auth')
const attachments = require('./attachments')
const nodemailer  = require('nodemailer')

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
      scriptSrc:   ["'self'", "'unsafe-inline'"],
      styleSrc:    ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:     ["'self'", 'https://fonts.gstatic.com'],
      imgSrc:      ["'self'", 'data:', 'blob:'],
      connectSrc:  ["'self'"],
      objectSrc:   ["'none'"],
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

app.use((req, _res, next) => { logEvent('REQ', req); next() })

// ── Body parser ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: '200mb' }))

// ── Authentication ────────────────────────────────────────────────────────────
const API_KEY = process.env.API_KEY

// Resolves a token string to a username or null.
function resolveToken(token) {
  if (!token) return null
  const session = db.sessions.get(token)
  if (!session) return null
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
    const user = db.users.get(username)
    if (!user || !(await auth.verifyPassword(password, user.password_hash))) {
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
  if (req.user === '__apikey__')    return res.json({ username: 'apikey',   displayName: 'API Key', role: 'admin' })
  if (req.user === '__anonymous__') return res.json({ username: '',          displayName: '',        role: 'admin', devMode: true })
  const user = db.users.get(req.user)
  if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden.' })
  res.json({ username: user.username, displayName: user.display_name, role: user.role })
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

// ── SMTP / Einladungs-E-Mail ──────────────────────────────────────────────────
function createTransport() {
  const host = process.env.SMTP_HOST
  if (!host) return null
  return nodemailer.createTransport({
    host,
    port:   parseInt(process.env.SMTP_PORT  || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth:   process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined,
  })
}

app.get('/api/admin/smtp-status', requireAuth, requireAdmin, (_req, res) => {
  res.json({ configured: !!process.env.SMTP_HOST, host: process.env.SMTP_HOST || null })
})

app.post('/api/admin/smtp-test', requireAuth, requireAdmin, async (req, res) => {
  try {
    const transport = createTransport()
    if (!transport) return res.status(400).json({ error: 'SMTP nicht konfiguriert.' })
    await transport.verify()
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/auth/users/:username/invite', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { username } = req.params
    const user = db.users.get(username)
    if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden.' })
    if (!user.email) return res.status(400).json({ error: 'Keine E-Mail-Adresse hinterlegt.' })

    const transport = createTransport()
    if (!transport) return res.status(400).json({ error: 'SMTP nicht konfiguriert. Bitte SMTP_HOST in den Server-Einstellungen setzen.' })

    const appUrl  = getAppUrl(req)
    const from    = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@komplizen'
    const pw      = user.password_note || '(bitte beim Admin erfragen)'

    const displayName = user.display_name || username
    const shortcutUrl = `${appUrl}/shortcut`

    // Logo als CID-Anhang einbetten
    const logoPath = path.join(__dirname, '../dist/Logo_Komplizen_sky1.png')
    const logoAttachment = fs.existsSync(logoPath)
      ? [{ filename: 'Logo_Komplizen_sky1.png', path: logoPath, cid: 'logo@komplizen' }]
      : []
    const logoTag = logoAttachment.length
      ? '<img src="cid:logo@komplizen" alt="Komplizen Protokolle" style="height:80px;display:block;margin:0 auto;">'
      : '<h2 style="color:#1e3a5f;text-align:center;margin:0;">KOMPLIZEN</h2>'

    const html = `<!DOCTYPE html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;font-size:14px;color:#1f2937;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;max-width:560px;width:100%;">

        <!-- Header -->
        <tr><td style="background:#ffffff;padding:32px 40px 20px 40px;text-align:center;border-bottom:3px solid #7ab3d4;">
          ${logoTag}
          <p style="color:#7ab3d4;margin:8px 0 0 0;font-size:11px;letter-spacing:2px;text-transform:uppercase;">Einladung</p>
        </td></tr>

        <!-- Greeting -->
        <tr><td style="padding:32px 40px 0 40px;">
          <p style="font-size:22px;font-weight:bold;color:#1e3a5f;margin:0 0 8px 0;">Willkommen, Komplize ${displayName}!</p>
          <p style="margin:0 0 24px 0;color:#6b7280;">Du wurdest eingeladen, Komplizen Protokolle zu nutzen – unser gemeinsames Tool für Besprechungsprotokolle und Projektdokumentation.</p>
        </td></tr>

        <!-- Credentials -->
        <tr><td style="padding:0 40px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #1e3a5f;">
            <tr><td style="padding:20px 24px;">
              <p style="margin:0 0 12px 0;font-weight:bold;color:#1e3a5f;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Deine Zugangsdaten</p>
              <table cellpadding="4" cellspacing="0">
                <tr><td style="color:#6b7280;white-space:nowrap;padding-right:16px;">Adresse</td>      <td><a href="${appUrl}" style="color:#2563eb;font-weight:bold;">${appUrl}</a></td></tr>
                <tr><td style="color:#6b7280;white-space:nowrap;padding-right:16px;">Benutzername</td> <td style="font-family:monospace;font-weight:bold;">${username}</td></tr>
                <tr><td style="color:#6b7280;white-space:nowrap;padding-right:16px;">Passwort</td>     <td style="font-family:monospace;font-weight:bold;">${pw}</td></tr>
              </table>
            </td></tr>
          </table>
          <p style="margin:12px 0 0 0;font-size:12px;color:#ef4444;">⚠ Bitte ändere dein Passwort nach der ersten Anmeldung (Einstellungen → Passwort ändern).</p>
        </td></tr>

        <!-- App installieren -->
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
              <p style="margin:8px 0 0 0;font-size:12px;color:#6b7280;">Die App erscheint im Startmenü und auf dem Desktop mit dem Komplizen-Logo. Edge ist auf jedem Windows-PC bereits vorinstalliert.</p>
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

        <!-- About -->
        <tr><td style="padding:24px 40px 0 40px;">
          <p style="font-weight:bold;color:#1e3a5f;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin:0 0 10px 0;">Was ist Komplizen Protokolle?</p>
          <ul style="margin:0;padding-left:20px;color:#374151;line-height:1.8;">
            <li>Besprechungsprotokolle erstellen und verwalten</li>
            <li>Maßnahmen und Aufgaben nachverfolgen</li>
            <li>Tagesordnungen vorbereiten und per E-Mail versenden</li>
            <li>Protokollketten über mehrere Besprechungen führen</li>
            <li>Projekte und Beteiligte organisieren</li>
          </ul>
          <p style="margin:10px 0 0 0;font-size:12px;color:#6b7280;">Alle Daten liegen sicher auf unserem eigenen Server – kein Cloud-Dienst, keine externen Abhängigkeiten.</p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:32px 40px;text-align:center;border-top:1px solid #e5e7eb;margin-top:24px;">
          <p style="margin:0;color:#9ca3af;font-size:12px;">Viel Erfolg und willkommen im Team! 🏗</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`

    await transport.sendMail({
      from,
      to:      user.email,
      subject: `Willkommen bei Komplizen Protokolle, ${displayName}!`,
      html,
      attachments: logoAttachment,
      text: [
        `Willkommen Komplize ${displayName}!`,
        '',
        'Du wurdest eingeladen, Komplizen Protokolle zu nutzen –',
        'unser gemeinsames Tool für Besprechungsprotokolle und Projektdokumentation.',
        '',
        `Adresse:      ${appUrl}`,
        `Benutzername: ${username}`,
        `Passwort:     ${pw}`,
        '',
        '⚠ Bitte ändere dein Passwort nach der ersten Anmeldung.',
        '  (Einstellungen → Passwort ändern)',
        '',
        'Desktop-Verknüpfung: ' + shortcutUrl,
        '',
        'Viel Erfolg und willkommen im Team!',
      ].join('\n'),
    })

    logEvent('INVITE_SENT', req, `to=${user.email} user=${username}`)
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

app.use('/api/protocols', protocolRouter)
app.use('/api/projects',  projectRouter)

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
}

if (certFile && keyFile && fs.existsSync(certFile) && fs.existsSync(keyFile)) {
  https.createServer({ cert: fs.readFileSync(certFile), key: fs.readFileSync(keyFile) }, app)
    .listen(PORT, HOST, onListen('https'))
} else {
  http.createServer(app).listen(PORT, HOST, onListen('http'))
}
