const isElectron = typeof window !== 'undefined' && !!window.electronAPI
const isServer   = typeof window !== 'undefined' && !!window.__SERVER_MODE__

// ── Server-mode backend ───────────────────────────────────────────────────────
function apiHeaders() {
  const h = { 'Content-Type': 'application/json' }
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('kp_session_token')
    if (token) h['Authorization'] = `Bearer ${token}`
    if (window.__API_KEY__) h['X-API-Key'] = window.__API_KEY__
  }
  return h
}

async function serverSave(id, base64) {
  const res = await fetch('/api/attachments', {
    method:  'POST',
    headers: apiHeaders(),
    body:    JSON.stringify({ id, data: base64 }),
  })
  if (!res.ok) {
    const d = await res.json().catch(() => ({}))
    throw new Error(d.error || 'Anhang konnte nicht gespeichert werden.')
  }
}

async function serverLoad(id) {
  const res = await fetch(`/api/attachments/${encodeURIComponent(id)}`, { headers: apiHeaders() })
  if (res.status === 404) return null
  if (!res.ok) throw new Error('Anhang konnte nicht geladen werden.')
  const d = await res.json()
  return d.data ?? null
}

async function serverRemove(id) {
  const res = await fetch(`/api/attachments/${encodeURIComponent(id)}`, {
    method:  'DELETE',
    headers: apiHeaders(),
  })
  if (!res.ok && res.status !== 404) {
    const d = await res.json().catch(() => ({}))
    throw new Error(d.error || 'Anhang konnte nicht gelöscht werden.')
  }
}

// ── IndexedDB backend (Web) ───────────────────────────────────────────────────
let _db = null

function openDb() {
  if (_db) return Promise.resolve(_db)
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('bb_attachments_v1', 1)
    req.onupgradeneeded = (e) => e.target.result.createObjectStore('files')
    req.onsuccess  = (e) => { _db = e.target.result; resolve(_db) }
    req.onerror    = (e) => reject(e.target.error)
  })
}

async function idbSave(id, base64) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('files', 'readwrite')
    tx.objectStore('files').put(base64, id)
    tx.oncomplete = resolve
    tx.onerror    = (e) => reject(e.target.error)
  })
}

async function idbLoad(id) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx  = db.transaction('files', 'readonly')
    const req = tx.objectStore('files').get(id)
    req.onsuccess = (e) => resolve(e.target.result ?? null)
    req.onerror   = (e) => reject(e.target.error)
  })
}

async function idbRemove(id) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('files', 'readwrite')
    tx.objectStore('files').delete(id)
    tx.oncomplete = resolve
    tx.onerror    = (e) => reject(e.target.error)
  })
}

// ── Public API ────────────────────────────────────────────────────────────────
export const attachmentStore = {
  async save(id, base64) {
    if (isServer)   return serverSave(id, base64)
    if (isElectron && window.electronAPI.saveAttachment)
      return window.electronAPI.saveAttachment(id, base64)
    return idbSave(id, base64)
  },
  async load(id) {
    if (isServer)   return serverLoad(id)
    if (isElectron && window.electronAPI.loadAttachment)
      return window.electronAPI.loadAttachment(id)
    return idbLoad(id)
  },
  async remove(id) {
    if (isServer)   return serverRemove(id)
    if (isElectron && window.electronAPI.deleteAttachment)
      return window.electronAPI.deleteAttachment(id)
    return idbRemove(id)
  },
}
