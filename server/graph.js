'use strict'
// ── Microsoft Graph: Zugangsdaten, Token, Anfrage ────────────────────────────
//
// Eine Stelle fuer das, was Mailversand (server/mailer.js) und Kalender
// (server/termine.js) gemeinsam haben: dieselbe in Entra registrierte App,
// derselbe Client-Credentials-Flow, derselbe Token.
//
// Dass der Token gemeinsam ist, ist der eigentliche Grund fuer diese Datei.
// Zwei Zwischenspeicher wuerden zwei Token holen, zwei Ablauffristen fuehren
// und bei abgelaufenem Secret an zwei Stellen unterschiedlich scheitern --
// also genau die Art Fehler, die man einmal im Quartal sieht.
//
// Umgebungsvariablen (docker-compose.yml auf der NAS, NICHT in Git):
//   GRAPH_TENANT_ID      Verzeichnis-(Mandanten-)ID aus Entra
//   GRAPH_CLIENT_ID      Anwendungs-(Client-)ID der registrierten App
//   GRAPH_CLIENT_SECRET  Geheimer Clientschluessel (der Wert, nicht die ID)
//
// Anwendungsberechtigungen je Funktion:
//   Mail.Send, Mail.ReadWrite   Versand (server/mailer.js)
//   Calendars.Read              Termine lesen (server/termine.js)
//
// Anwendungsberechtigungen gelten TENANTWEIT. Welche Postfaecher die App
// wirklich anfassen darf, gehoert deshalb zusaetzlich in eine Application
// Access Policy (Exchange Online PowerShell). Diese Anwendung verlaesst sich
// nicht darauf -- sie liest nur Postfaecher, die sie selbst zulaesst (siehe
// postfaecherFuer in server/termine.js) -- aber eine Richtlinie ist die
// zweite Mauer, und die will man haben.

const SCOPE      = 'https://graph.microsoft.com/.default'
// Ueberschreibbar, damit die Wege gegen eine Attrappe geprueft werden koennen
// (Testlaeufe ohne echtes Microsoft-365-Konto).
const BASE       = process.env.GRAPH_BASE_URL  || 'https://graph.microsoft.com/v1.0'
const LOGIN_BASE = process.env.GRAPH_LOGIN_URL || 'https://login.microsoftonline.com'

/** Die drei Zugangsdaten -- oder null, wenn eine fehlt. */
function graphAuth() {
  const tenant = process.env.GRAPH_TENANT_ID
  const client = process.env.GRAPH_CLIENT_ID
  const secret = process.env.GRAPH_CLIENT_SECRET
  if (tenant && client && secret) return { tenant, client, secret }
  return null
}

/** Was fehlt -- in Worten, die in der Oberflaeche stehen duerfen. */
function warumNicht() {
  const fehlt = ['GRAPH_TENANT_ID', 'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET']
    .filter(n => !process.env[n])
  if (!fehlt.length) return null
  return fehlt.join(', ') + (fehlt.length > 1 ? ' fehlen.' : ' fehlt.')
}

// ── Token (Client Credentials) mit Zwischenspeicher ──────────────────────────
let _cache = { token: null, expiresAt: 0 }

async function graphToken(auth = null) {
  const a = auth || graphAuth()
  if (!a) throw new Error('Microsoft Graph ist nicht eingerichtet (' + warumNicht() + ')')

  const now = Date.now()
  if (_cache.token && now < _cache.expiresAt - 60_000) return _cache.token

  const url  = `${LOGIN_BASE}/${encodeURIComponent(a.tenant)}/oauth2/v2.0/token`
  const body = new URLSearchParams({
    client_id:     a.client,
    client_secret: a.secret,
    scope:         SCOPE,
    grant_type:    'client_credentials',
  })
  const res  = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString(),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`Graph-Token fehlgeschlagen (${res.status}): ${data.error_description || data.error || 'unbekannt'}`)
  }
  _cache = { token: data.access_token, expiresAt: now + (data.expires_in || 3600) * 1000 }
  return _cache.token
}

/**
 * Eine Graph-Anfrage. Pfad relativ zur Basis, also '/users/x@y/calendarView'.
 *
 * Wirft bei HTTP-Fehlern mit einer Meldung, die man einer Person zeigen kann,
 * und haengt den Status als .status an -- der Aufrufer unterscheidet damit
 * "darf nicht" (403) von "gibt es nicht" (404) von "kaputt".
 */
async function graphFetch(pfad, { method = 'GET', headers = {}, body = null } = {}) {
  const token  = await graphToken()
  const kopf   = { Authorization: `Bearer ${token}`, Accept: 'application/json', ...headers }
  if (body && !kopf['Content-Type']) kopf['Content-Type'] = 'application/json'
  const res = await fetch(BASE + pfad, {
    method,
    headers: kopf,
    ...(body ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  })
  if (res.status === 204) return null
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const grund = data?.error?.message || data?.error_description || `HTTP ${res.status}`
    const e = new Error(grund)
    e.status   = res.status
    e.graphCode = data?.error?.code || null
    throw e
  }
  return data
}

module.exports = { graphAuth, warumNicht, graphToken, graphFetch, BASE, LOGIN_BASE }
