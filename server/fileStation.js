'use strict'

// Synology File Station – projektbezogene Dateiablage über ein Service-Konto.
// Aktiv wenn SYNOLOGY_URL + SYNOLOGY_FS_USER + SYNOLOGY_FS_PASS gesetzt sind
// (nur in der NAS-docker-compose.yml, nie in Git). Das Service-Konto braucht
// Lesezugriff auf die freigegebenen Projektordner.

let cachedSid = null

function baseUrl() { return (process.env.SYNOLOGY_URL || '').replace(/\/$/, '') }

function isConfigured() {
  return !!(baseUrl() && process.env.SYNOLOGY_FS_USER && process.env.SYNOLOGY_FS_PASS)
}

async function fetchSyno(url, timeoutMs = 8000) {
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

async function login() {
  const params = new URLSearchParams({
    api: 'SYNO.API.Auth', version: '6', method: 'login',
    account: process.env.SYNOLOGY_FS_USER,
    passwd:  process.env.SYNOLOGY_FS_PASS,
    session: 'KomplizenFS', format: 'sid',
  })
  const data = await fetchSyno(`${baseUrl()}/webapi/auth.cgi?${params}`)
  if (!data?.success) {
    cachedSid = null
    throw new Error('File-Station-Anmeldung fehlgeschlagen (SYNOLOGY_FS_USER/SYNOLOGY_FS_PASS prüfen).')
  }
  cachedSid = data.data.sid
  return cachedSid
}

// API-Aufruf mit automatischem Re-Login bei abgelaufener Session
async function apiCall(params) {
  if (!cachedSid) await login()
  let data = await fetchSyno(`${baseUrl()}/webapi/entry.cgi?${params}&_sid=${encodeURIComponent(cachedSid)}`)
  if (!data?.success && [105, 106, 107, 119].includes(data?.error?.code)) {
    await login()
    data = await fetchSyno(`${baseUrl()}/webapi/entry.cgi?${params}&_sid=${encodeURIComponent(cachedSid)}`)
  }
  return data
}

// Ordnerinhalt auflisten
async function listFolder(folderPath) {
  const params = new URLSearchParams({
    api: 'SYNO.FileStation.List', version: '2', method: 'list',
    folder_path: folderPath,
    additional: '["size","time","type"]',
    sort_by: 'name',
  })
  const data = await apiCall(params)
  if (!data?.success) {
    const code = data?.error?.code
    const msg  = code === 408 || code === 418 ? 'Ordner nicht gefunden.'
               : code === 407 ? 'Keine Berechtigung für diesen Ordner (Service-Konto prüfen).'
               : `File-Station-Fehler${code ? ` (Code ${code})` : ''}.`
    throw new Error(msg)
  }
  return (data.data?.files || []).map(f => ({
    name:  f.name,
    path:  f.path,
    isdir: !!f.isdir,
    size:  f.additional?.size ?? 0,
    mtime: f.additional?.time?.mtime ?? null,
  }))
}

// Datei streamen (gibt Web-ReadableStream + Header-Infos zurück)
async function downloadFile(filePath) {
  if (!cachedSid) await login()
  const params = new URLSearchParams({
    api: 'SYNO.FileStation.Download', version: '2', method: 'download',
    path: filePath, mode: 'download',
  })
  let res = await fetch(`${baseUrl()}/webapi/entry.cgi?${params}&_sid=${encodeURIComponent(cachedSid)}`)
  // Fehler kommen als JSON zurück – erkennen und ggf. mit frischer Session wiederholen
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/json')) {
    const data = await res.json().catch(() => null)
    if (!data?.success && [105, 106, 107, 119].includes(data?.error?.code)) {
      await login()
      res = await fetch(`${baseUrl()}/webapi/entry.cgi?${params}&_sid=${encodeURIComponent(cachedSid)}`)
    } else {
      throw new Error(`Download fehlgeschlagen${data?.error?.code ? ` (Code ${data.error.code})` : ''}.`)
    }
  }
  if (!res.ok) throw new Error(`Download fehlgeschlagen (HTTP ${res.status}).`)
  return res
}

module.exports = { isConfigured, listFolder, downloadFile }
