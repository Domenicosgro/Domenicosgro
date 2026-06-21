'use strict'

// Synology DSM Web API – Anmeldung + Admin-Gruppen-Check
// Aktiv wenn SYNOLOGY_URL gesetzt ist (z.B. http://192.168.178.250:5000)
// SYNOLOGY_ADMIN_GROUP – Gruppenname für App-Admins (Standard: "administrators")
// SYNOLOGY_ADMIN_USERS – Kommaliste fester Admin-Benutzernamen (Fallback falls Group-API nicht verfügbar)

const ADMIN_GROUP = process.env.SYNOLOGY_ADMIN_GROUP || 'administrators'
const ADMIN_USERS = (process.env.SYNOLOGY_ADMIN_USERS || '')
  .split(',').map(s => s.trim()).filter(Boolean)

async function fetchSyno(url, timeoutMs = 6000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

// Gibt { isAdmin, displayName } zurück wenn Anmeldung erfolgreich, sonst null.
// Wirft bei Netzwerkfehlern (NAS nicht erreichbar).
async function synologyAuth(username, password) {
  const baseUrl = (process.env.SYNOLOGY_URL || '').replace(/\/$/, '')
  if (!baseUrl) return null

  // ── Schritt 1: Login ────────────────────────────────────────────────────────
  const loginParams = new URLSearchParams({
    api:     'SYNO.API.Auth',
    version: '6',
    method:  'login',
    account: username,
    passwd:  password,
    session: 'KomPlizenProtokolle',
    format:  'sid',
  })

  const loginData = await fetchSyno(`${baseUrl}/webapi/auth.cgi?${loginParams}`)
  if (!loginData.success) return null   // falsches Passwort / unbekannter Nutzer

  const sid = loginData.data?.sid
  let isAdmin = ADMIN_USERS.includes(username)

  // ── Schritt 2: Admin-Gruppe prüfen ─────────────────────────────────────────
  if (!isAdmin && sid) {
    try {
      const groupParams = new URLSearchParams({
        api:     'SYNO.Core.Group',
        version: '1',
        method:  'member_list',
        name:    ADMIN_GROUP,
        _sid:    sid,
      })
      const groupData = await fetchSyno(`${baseUrl}/webapi/entry.cgi?${groupParams}`)
      if (groupData.success && Array.isArray(groupData.data?.members)) {
        isAdmin = groupData.data.members.includes(username)
      }
    } catch {
      // Group-API nicht verfügbar (z.B. älteres DSM) – kein Admin-Recht
    }
  }

  // ── Schritt 3: Synology-Session aufräumen ──────────────────────────────────
  if (sid) {
    try {
      const logoutParams = new URLSearchParams({
        api:     'SYNO.API.Auth',
        version: '6',
        method:  'logout',
        session: 'KomPlizenProtokolle',
        _sid:    sid,
      })
      await fetchSyno(`${baseUrl}/webapi/auth.cgi?${logoutParams}`, 3000)
    } catch {
      // Logout-Fehler ignorieren
    }
  }

  return { isAdmin, displayName: username }
}

// Listet alle lokalen Synology-Benutzer auf (erfordert Admin-Zugangsdaten).
// Gibt Array von { username, displayName, email } zurück, oder null bei falschen Zugangsdaten.
// Wirft bei Netzwerkfehlern.
async function listSynologyUsers(adminUsername, adminPassword) {
  const baseUrl = (process.env.SYNOLOGY_URL || '').replace(/\/$/, '')
  if (!baseUrl) return null

  const loginParams = new URLSearchParams({
    api: 'SYNO.API.Auth', version: '6', method: 'login',
    account: adminUsername, passwd: adminPassword,
    session: 'KPUserList', format: 'sid',
  })
  const loginData = await fetchSyno(`${baseUrl}/webapi/auth.cgi?${loginParams}`)
  if (!loginData.success) return null

  const sid = loginData.data?.sid
  let users = []

  try {
    const userParams = new URLSearchParams({
      api:        'SYNO.Core.User',
      version:    '1',
      method:     'list',
      additional: '["email","fullname"]',
      limit:      '500',
      _sid:       sid,
    })
    const userData = await fetchSyno(`${baseUrl}/webapi/entry.cgi?${userParams}`)
    if (userData.success && Array.isArray(userData.data?.users)) {
      users = userData.data.users.map(u => ({
        username:    u.name,
        displayName: u.fullname || u.name,
        email:       u.email || '',
      }))
    }
  } catch { /* User-Listen-API nicht verfügbar */ }

  try {
    const logoutParams = new URLSearchParams({
      api: 'SYNO.API.Auth', version: '6', method: 'logout',
      session: 'KPUserList', _sid: sid,
    })
    await fetchSyno(`${baseUrl}/webapi/auth.cgi?${logoutParams}`, 3000)
  } catch {}

  return users
}

module.exports = { synologyAuth, listSynologyUsers }
