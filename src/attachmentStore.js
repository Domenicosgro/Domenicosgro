const isElectron = typeof window !== 'undefined' && !!window.electronAPI

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
    if (isElectron && window.electronAPI.saveAttachment)
      return window.electronAPI.saveAttachment(id, base64)
    return idbSave(id, base64)
  },
  async load(id) {
    if (isElectron && window.electronAPI.loadAttachment)
      return window.electronAPI.loadAttachment(id)
    return idbLoad(id)
  },
  async remove(id) {
    if (isElectron && window.electronAPI.deleteAttachment)
      return window.electronAPI.deleteAttachment(id)
    return idbRemove(id)
  },
}
