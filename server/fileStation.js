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

// DSM-Fehlercodes der Anmeldung (SYNO.API.Auth)
const LOGIN_FEHLER = {
  400: 'Benutzername oder Passwort falsch',
  401: 'Konto deaktiviert',
  402: 'Zugriff verweigert – App-Recht „File Station" für das Konto fehlt',
  403: 'Zwei-Faktor-Anmeldung verlangt – Service-Konto davon ausnehmen',
  404: 'Zwei-Faktor-Anmeldung fehlgeschlagen',
  406: 'Zwei-Faktor-Anmeldung ist Pflicht – Service-Konto davon ausnehmen',
  407: 'IP-Adresse von DSM gesperrt (Automatische Blockierung) – in DSM entsperren',
  408: 'Passwort abgelaufen und nicht änderbar',
  409: 'Passwort abgelaufen',
  410: 'Passwort muss geändert werden',
}

// Nach einer fehlgeschlagenen Anmeldung eine Minute warten, statt bei jeder
// Anfrage erneut zu probieren – sonst sperrt die automatische Blockierung von
// DSM nach wenigen Versuchen die IP der NAS selbst.
let loginSperreBis = 0
let letzterFehler  = ''

async function login() {
  if (Date.now() < loginSperreBis) throw new Error(letzterFehler)
  const params = new URLSearchParams({
    api: 'SYNO.API.Auth', version: '6', method: 'login',
    account: process.env.SYNOLOGY_FS_USER,
    passwd:  process.env.SYNOLOGY_FS_PASS,
    // DSM 7 nimmt hier nicht jeden Namen an; "FileStation" ist der dokumentierte.
    session: 'FileStation', format: 'sid',
  })
  let data
  try {
    data = await fetchSyno(`${baseUrl()}/webapi/auth.cgi?${params}`)
  } catch (e) {
    cachedSid = null
    throw new Error(`NAS nicht erreichbar (${baseUrl()}): ${e.message}`)
  }
  if (!data?.success) {
    cachedSid = null
    const code = data?.error?.code
    letzterFehler = `File-Station-Anmeldung von „${process.env.SYNOLOGY_FS_USER}" fehlgeschlagen`
      + (code ? ` (DSM-Code ${code}: ${LOGIN_FEHLER[code] || 'unbekannt'})` : '') + '.'
    loginSperreBis = Date.now() + 60_000
    console.warn('[fileStation]', letzterFehler)
    throw new Error(letzterFehler)
  }
  loginSperreBis = 0
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

function synoError(data, fallback) {
  const code = data?.error?.code
  const sub  = data?.error?.errors?.[0]?.code
  const c    = sub || code
  const msg  = c === 408 || c === 418 ? 'Ordner nicht gefunden.'
             : c === 407 || c === 105 ? 'Keine Berechtigung (Service-Konto braucht Schreibrechte auf diesen Ordner).'
             : c === 414 ? 'Eine Datei oder ein Ordner mit diesem Namen existiert bereits.'
             : c === 415 || c === 416 ? 'Speicherplatz auf der NAS reicht nicht aus.'
             : c === 419 ? 'Ungültiger Name.'
             : `${fallback}${c ? ` (Code ${c})` : ''}.`
  return new Error(msg)
}

// Freigegebene Ordner (Wurzeln), die das Service-Konto sieht
async function listShares() {
  const params = new URLSearchParams({
    api: 'SYNO.FileStation.List', version: '2', method: 'list_share', sort_by: 'name',
  })
  const data = await apiCall(params)
  if (!data?.success) throw synoError(data, 'Freigaben nicht abrufbar')
  return (data.data?.shares || []).map(s => ({ name: s.name, path: s.path, isdir: true }))
}

// Ordner anlegen (inkl. fehlender Elternordner). Gibt den neuen Pfad zurück.
async function createFolder(parentPath, name) {
  const params = new URLSearchParams({
    api: 'SYNO.FileStation.CreateFolder', version: '2', method: 'create',
    folder_path: JSON.stringify([parentPath]),
    name:        JSON.stringify([name]),
    force_parent: 'true',
  })
  const data = await apiCall(params)
  if (!data?.success) throw synoError(data, 'Ordner konnte nicht angelegt werden')
  return data.data?.folders?.[0]?.path || `${parentPath}/${name}`
}

// Datei hochladen (Buffer). Vorhandene Dateien werden NICHT überschrieben –
// der Aufrufer wählt vorher einen freien Namen.
async function uploadFile(destFolder, filename, buffer, mimeType = 'application/octet-stream') {
  const send = async () => {
    const form = new FormData()
    form.append('api', 'SYNO.FileStation.Upload')
    form.append('version', '2')
    form.append('method', 'upload')
    form.append('path', destFolder)
    form.append('create_parents', 'true')
    form.append('overwrite', 'false')
    // Die Datei muss das letzte Feld sein (Vorgabe der File-Station-API)
    form.append('file', new Blob([buffer], { type: mimeType }), filename)
    const res = await fetch(`${baseUrl()}/webapi/entry.cgi?_sid=${encodeURIComponent(cachedSid)}`, { method: 'POST', body: form })
    return res.json().catch(() => null)
  }
  if (!cachedSid) await login()
  let data = await send()
  if (!data?.success && [105, 106, 107, 119].includes(data?.error?.code)) {
    await login()
    data = await send()
  }
  if (!data?.success) throw synoError(data, 'Upload fehlgeschlagen')
  return `${destFolder}/${filename}`
}

// Einzelne Datei löschen (blockierender Aufruf, nicht rekursiv)
async function deleteFile(filePath) {
  const params = new URLSearchParams({
    api: 'SYNO.FileStation.Delete', version: '2', method: 'delete',
    path: JSON.stringify([filePath]), recursive: 'false',
  })
  const data = await apiCall(params)
  if (!data?.success) throw synoError(data, 'Löschen fehlgeschlagen')
}

module.exports = { isConfigured, listFolder, downloadFile, listShares, createFolder, uploadFile, deleteFile }
