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
// Basis-URLs überschreibbar, damit der Versandweg gegen eine Attrappe geprüft
// werden kann (Testläufe ohne echtes Microsoft-365-Konto).
const GRAPH_BASE       = process.env.GRAPH_BASE_URL  || 'https://graph.microsoft.com/v1.0'
const GRAPH_LOGIN_BASE = process.env.GRAPH_LOGIN_URL || 'https://login.microsoftonline.com'

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

  const url  = `${GRAPH_LOGIN_BASE}/${encodeURIComponent(tenant)}/oauth2/v2.0/token`
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

// Rohdaten eines nodemailer-Anhangs als Buffer
function attachmentBuffer(att) {
  if (att.path && fs.existsSync(att.path)) return fs.readFileSync(att.path)
  if (att.content) return Buffer.isBuffer(att.content) ? att.content : Buffer.from(att.content)
  return null
}

// Microsoft begrenzt Anhänge, die direkt in sendMail eingebettet werden, auf
// ~3 MB je Nachricht. Größere Dateien (Baudokumentation mit Fotos, Protokolle
// mit Bildanlagen) müssen über eine Upload-Session an einen Entwurf gehängt
// werden – in Blöcken, die ein Vielfaches von 320 KiB sind, bis 150 MB.
const GRAPH_INLINE_LIMIT = 3 * 1024 * 1024
const GRAPH_CHUNK        = 320 * 1024 * 10   // 3,2 MiB je Block

async function graphFetch(token, url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  })
  if (!res.ok && res.status !== 202) {
    const data = await res.json().catch(() => ({}))
    throw new Error(`Graph-Versand fehlgeschlagen (${res.status}): ${data.error?.message || 'unbekannt'}`)
  }
  return res
}

// Großen Anhang per Upload-Session an einen Nachrichtenentwurf hängen
async function graphUploadAttachment(token, base, att) {
  const bytes = attachmentBuffer(att)
  const session = await graphFetch(token, `${base}/attachments/createUploadSession`, {
    method: 'POST',
    body: JSON.stringify({
      AttachmentItem: {
        attachmentType: 'file',
        name: att.filename || 'anhang',
        size: bytes.length,
        ...(att.contentType ? { contentType: att.contentType } : {}),
      },
    }),
  }).then(r => r.json())
  const uploadUrl = session.uploadUrl
  if (!uploadUrl) throw new Error('Graph: keine Upload-Session erhalten.')

  for (let start = 0; start < bytes.length; start += GRAPH_CHUNK) {
    const end   = Math.min(start + GRAPH_CHUNK, bytes.length)
    const chunk = bytes.subarray(start, end)
    // Upload-URL ist vorauthentifiziert – KEIN Authorization-Header
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type':   'application/octet-stream',
        'Content-Length': String(chunk.length),
        'Content-Range':  `bytes ${start}-${end - 1}/${bytes.length}`,
      },
      body: chunk,
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(`Graph-Upload fehlgeschlagen (${res.status}): ${data.error?.message || 'unbekannt'}`)
    }
  }
}

// ── Versand über Microsoft Graph ──────────────────────────────────────────────
async function sendViaGraph(cfg, { from, to, cc, subject, html, text, replyTo, attachments }) {
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
  if (cc) message.ccRecipients = toRecipients(cc)
  // Anzeigename überschreiben (Adresse bleibt das authentifizierte Postfach)
  if (fromAddr?.name) {
    message.from = { emailAddress: { address: cfg.sender, name: fromAddr.name } }
  }
  if (replyTo) message.replyTo = toRecipients(replyTo)

  const userBase  = `${GRAPH_BASE}/users/${encodeURIComponent(cfg.sender)}`
  const totalSize = (attachments || []).reduce((s, a) => s + (attachmentBuffer(a)?.length || 0), 0)

  // Kleiner Fall: alles in einem Aufruf
  if (totalSize <= GRAPH_INLINE_LIMIT) {
    const graphAtts = toGraphAttachments(attachments)
    if (graphAtts.length) message.attachments = graphAtts
    await graphFetch(token, `${userBase}/sendMail`, {
      method: 'POST',
      body:   JSON.stringify({ message, saveToSentItems: true }),
    })
    return
  }

  // Großer Fall: Entwurf anlegen → Anhänge hochladen → Entwurf senden
  const draft   = await graphFetch(token, `${userBase}/messages`, {
    method: 'POST', body: JSON.stringify(message),
  }).then(r => r.json())
  const msgBase = `${userBase}/messages/${encodeURIComponent(draft.id)}`

  for (const att of (attachments || [])) {
    const bytes = attachmentBuffer(att)
    if (!bytes) continue
    if (bytes.length > GRAPH_INLINE_LIMIT) {
      await graphUploadAttachment(token, msgBase, att)
    } else {
      await graphFetch(token, `${msgBase}/attachments`, {
        method: 'POST', body: JSON.stringify(toGraphAttachments([att])[0]),
      })
    }
  }
  await graphFetch(token, `${msgBase}/send`, { method: 'POST' })
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
