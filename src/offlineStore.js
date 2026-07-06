// Offline-Warteschlange (IndexedDB) für unterwegs erfasste Einträge.
// Einträge inkl. Foto-Daten warten hier, bis der Server wieder erreichbar
// ist (gleiches Netz/VPN), und werden dann synchronisiert.

const DB_NAME = 'kp_offline_v1'
const STORE   = 'outbox'

let _db = null
function openDb() {
  if (_db) return Promise.resolve(_db)
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = (e) => { _db = e.target.result; resolve(_db) }
    req.onerror   = (e) => reject(e.target.error)
  })
}

export async function outboxAdd(item) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(item)
    tx.oncomplete = () => resolve()
    tx.onerror    = (e) => reject(e.target.error)
  })
}

export async function outboxList(kind, projectId) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll()
    req.onsuccess = () => resolve(
      (req.result || []).filter(x => x.kind === kind && x.projectId === projectId)
    )
    req.onerror = (e) => reject(e.target.error)
  })
}

export async function outboxRemove(id) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror    = (e) => reject(e.target.error)
  })
}
