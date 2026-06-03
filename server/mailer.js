// ── E-Mail-Versand: Microsoft Graph (OAuth2) mit SMTP-Fallback ────────────────
//
// Hintergrund: Bei aktiven Microsoft-365-Sicherheitsstandards ist Basic-Auth-SMTP
// gesperrt (MFA erzwungen, App-Kennwörter nicht verfügbar). Der moderne Weg ist
// der OAuth2-Client-Credentials-Flow gegen Microsoft Graph: Eine in Entra
// registrierte App mit Anwendungsberechtigung "Mail.Send" sendet ohne Passwort
// und ohne MFA im Namen eines festen Postfachs (GRAPH_SENDER).
//
// Aktivierung über Umgebungsvariablen (docker-compose.yml auf der NAS):
//   GRAPH_TENANT_ID      Verzeichnis-(Mandanten-)ID aus Entra
//   GRAPH_CLIENT_ID      Anwendungs-(Client-)ID der registrierten App
//   GRAPH_CLIENT_SECRET  Geheimer Clientschlüssel (Wert, nicht die ID!)
//   GRAPH_SENDER         Absender-Postfach, z.B. Protokoll@ghbarchitekten.de
//
// Sind diese gesetzt → Graph wird verwendet. Sonst fällt der Versand auf das
// klassische SMTP (SMTP_HOST/...) zurück, falls konfiguriert.

const fs         = require('fs')
const nodemailer = require('nodemailer')

const GRAPH_SCOPE      = 'https://graph.microsoft.com/.default'
const GRAPH_BASE       = 'https://graph.microsoft.com/v1.0'

function graphConfig() {
  const tenant = process.env.GRAPH_TENANT_ID
  const client = process.env.GRAPH_CLIENT_ID
  const secret = process.env.GRAPH_CLIENT_SECRET
  const sender = process.env.GRAPH_SENDER || process.env.SMTP_FROM || process.env.SMTP_USER
  if (tenant && client && secret && sender) return { tenant, client, secret, sender }
  return null
}

// ── OAuth2-Token (Client Credentials) mit einfachem In-Memory-Cache ───────────
let _tokenCache = { token: null, expiresAt: 0 }

async function getGraphToken({ tenant, client, secret }) {
  const now = Date.now()
  if (_tokenCache.token && now < _tokenCache.expiresAt - 60_000) return _tokenCache.token

  const url  = `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`
  const body = new URLSearchParams({
    client_id:     client,
    client_secret: secret,
    scope:         GRAPH_SCOPE,
    grant_type:    'client_credentials',
  })
  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`Graph-Token fehlgeschlagen (${res.status}): ${data.error_description || data.error || 'unbekannt'}`)
  }
  _tokenCache = {
    token:     data.access_token,
    expiresAt: now + (data.expires_in || 3600) * 1000,
  }
  return _tokenCache.token
}

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────
// "Anzeigename <adresse@domain>" oder "adresse@domain" → { name, address }
function parseAddress(value) {
  if (!value) return null
  const m = /^\s*"?([^"<]*?)"?\s*<\s*([^>]+)\s*>\s*$/.exec(value)
  if (m) return { name: m[1].trim() || undefined, address: m[2].trim() }
  return { address: String(value).trim() }
}

// Komma-/Semikolon-getrennte Empfängerliste → Graph-Recipient-Array
function toRecipients(value) {
  if (!value) return []
  const list = Array.isArray(value) ? value : String(value).split(/[,;]/)
  return list
    .map(v => parseAddress(v))
    .filter(a => a && a.address)
    .map(a => ({ emailAddress: { address: a.address, ...(a.name ? { name: a.name } : {}) } }))
}

// nodemailer-Attachments → Graph-fileAttachments (inline via cid → contentId)
function toGraphAttachments(attachments = []) {
  return attachments.map(att => {
    let contentBytes = ''
    if (att.path && fs.existsSync(att.path)) {
      contentBytes = fs.readFileSync(att.path).toString('base64')
    } else if (att.content) {
      contentBytes = Buffer.isBuffer(att.content)
        ? att.content.toString('base64')
        : Buffer.from(att.content).toString('base64')
    }
    return {
      '@odata.type':  '#microsoft.graph.fileAttachment',
      name:           att.filename || 'anhang',
      contentBytes,
      ...(att.contentType ? { contentType: att.contentType } : {}),
      ...(att.cid ? { isInline: true, contentId: att.cid } : {}),
    }
  }).filter(a => a.contentBytes)
}

// ── Versand über Microsoft Graph ──────────────────────────────────────────────
async function sendViaGraph(cfg, { from, to, subject, html, text, replyTo, attachments }) {
  const token    = await getGraphToken(cfg)
  const fromAddr = parseAddress(from)

  const message = {
    subject: subject || '',
    body: {
      contentType: html ? 'HTML' : 'Text',
      content:     html || text || '',
    },
    toRecipients: toRecipients(to),
  }
  // Anzeigename überschreiben (Adresse bleibt das authentifizierte Postfach)
  if (fromAddr?.name) {
    message.from = { emailAddress: { address: cfg.sender, name: fromAddr.name } }
  }
  if (replyTo) message.replyTo = toRecipients(replyTo)

  const graphAtts = toGraphAttachments(attachments)
  if (graphAtts.length) message.attachments = graphAtts

  const url = `${GRAPH_BASE}/users/${encodeURIComponent(cfg.sender)}/sendMail`
  const res = await fetch(url, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ message, saveToSentItems: true }),
  })
  if (!res.ok && res.status !== 202) {
    const data = await res.json().catch(() => ({}))
    throw new Error(`Graph-Versand fehlgeschlagen (${res.status}): ${data.error?.message || 'unbekannt'}`)
  }
}

// ── SMTP-Fallback (klassisch, nodemailer) ─────────────────────────────────────
function createSmtpTransport() {
  const host = process.env.SMTP_HOST
  if (!host) return null
  return nodemailer.createTransport({
    host,
    port:   parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth:   process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined,
  })
}

// ── Öffentliche API ───────────────────────────────────────────────────────────
function mailerStatus() {
  const graph = graphConfig()
  if (graph) return { configured: true, mode: 'graph',  sender: graph.sender }
  if (process.env.SMTP_HOST) return { configured: true, mode: 'smtp', sender: process.env.SMTP_FROM || process.env.SMTP_USER || null }
  return { configured: false, mode: null, sender: null }
}

// Prüft, ob der konfigurierte Versandweg grundsätzlich erreichbar ist.
async function verifyMailer() {
  const graph = graphConfig()
  if (graph) {
    await getGraphToken(graph)   // wirft bei falschen Zugangsdaten
    return { ok: true, mode: 'graph' }
  }
  const transport = createSmtpTransport()
  if (!transport) throw new Error('Kein Versandweg konfiguriert (weder Graph noch SMTP).')
  await transport.verify()
  return { ok: true, mode: 'smtp' }
}

// Einheitlicher Versand – Graph bevorzugt, sonst SMTP.
async function sendMail(opts) {
  const graph = graphConfig()
  if (graph) return sendViaGraph(graph, opts)
  const transport = createSmtpTransport()
  if (!transport) throw new Error('Kein Versandweg konfiguriert (weder Graph noch SMTP).')
  return transport.sendMail(opts)
}

module.exports = { mailerStatus, verifyMailer, sendMail }
