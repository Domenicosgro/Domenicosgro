// ── Warteschlange für Originalfotos ──────────────────────────────────────────
//
// Im Bericht steht die verkleinerte Fassung (photoUtils.js, 120 KB) – die
// braucht der Versand. Das Original gehört in den Projektordner auf der NAS,
// und dort kommt es nicht immer sofort hin: auf der Baustelle ist oft kein
// Netz, und ein 8-MB-Upload soll das Speichern des Berichts nicht aufhalten.
//
// Deshalb wartet das Original hier – als Blob in IndexedDB, ohne base64, das
// ein Foto um ein Drittel aufblähen würde. Abgelegt wird es, sobald es geht:
// nach dem Speichern, beim Öffnen der Baudokumentation, wenn der Browser
// wieder online meldet, oder von Hand über die Schaltfläche.
//
// Gegenstück auf dem Server: server/bautagebuchFotos.js

const DB_NAME = 'kp_fotooriginale_v1'
const STORE   = 'originale'

// Datensatz: { id (= Foto-Id im Bericht), projectId, entryId, blob, name,
//              queuedAt, versuche, fehler }

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

// Ein Schreibvorgang; erfüllt sich erst, wenn die Transaktion durch ist.
async function schreibe(arbeit) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite')
    arbeit(t.objectStore(STORE))
    t.oncomplete = () => resolve()
    t.onerror    = (e) => reject(e.target.error)
  })
}

/** Original in die Warteschlange legen. */
export async function originalAdd(satz) {
  try {
    await schreibe(s => s.put({ versuche: 0, fehler: '', queuedAt: new Date().toISOString(), ...satz }))
    return true
  } catch { return false }
}

/** Wartende Originale – alle oder nur die eines Projekts. */
export async function originalList(projectId = null) {
  try {
    const db = await openDb()
    const alle = await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll()
      req.onsuccess = () => resolve(req.result || [])
      req.onerror   = (e) => reject(e.target.error)
    })
    return projectId ? alle.filter(x => x.projectId === projectId) : alle
  } catch { return [] }
}

export async function originalRemove(id) {
  try { await schreibe(s => s.delete(id)); return true } catch { return false }
}

/** Alle Wartenden eines Projekts verwerfen (nur auf ausdrücklichen Wunsch). */
export async function originalClear(projectId) {
  const liste = await originalList(projectId)
  for (const s of liste) await originalRemove(s.id)
  return liste.length
}

// Versuchszähler und letzte Meldung am Datensatz festhalten – sichtbar machen,
// woran es hängt, statt still weiterzuprobieren.
async function originalPatch(satz, patch) {
  try { await schreibe(s => s.put({ ...satz, ...patch })) } catch {}
}

// Nur ein Durchlauf je Projekt gleichzeitig. Sonst schicken zwei Anläufe –
// einer nach dem Speichern, einer beim Öffnen – dasselbe Foto zweimal, und im
// Projektordner lägen „Foto 01.jpg" und „Foto 01 (2).jpg".
const laeuft = new Set()

/**
 * Wartende Originale eines Projekts auf die NAS schieben.
 *
 * Fehlt der Fotoordner (409), wird abgebrochen statt bei jedem Foto erneut
 * angefragt – das ist keine Störung, sondern eine offene Einstellung.
 * Rückgabe: { abgelegt, offen, grund, fehler }
 */
export async function originaleSenden(projectId, headers = {}) {
  if (laeuft.has(projectId)) {
    return { abgelegt: 0, offen: (await originalList(projectId)).length, grund: 'laeuft', fehler: '' }
  }
  laeuft.add(projectId)
  try {
    return await sendeDurchlauf(projectId, headers)
  } finally {
    laeuft.delete(projectId)
  }
}

async function sendeDurchlauf(projectId, headers) {
  const liste = await originalList(projectId)
  let abgelegt = 0
  let grund = null
  let fehler = ''

  for (const satz of liste) {
    if (!navigator.onLine) { grund = 'offline'; break }
    if (!satz.entryId || !satz.bytes) { await originalRemove(satz.id); continue }
    const url = `/api/projects/${encodeURIComponent(projectId)}/bautagebuch/${encodeURIComponent(satz.entryId)}/fotos`
      + `?fotoId=${encodeURIComponent(satz.id)}&name=${encodeURIComponent(satz.name || 'foto.jpg')}`
    try {
      // Rohdaten, keine Verpackung. Der Content-Type muss octet-stream sein –
      // daran erkennt der Server den Rumpf (express.raw).
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', ...headers },
        body: satz.bytes,
      })
      if (res.ok) { await originalRemove(satz.id); abgelegt++; continue }

      const d = await res.json().catch(() => ({}))
      // Fotoordner fehlt oder Projektordner fehlt → Einstellung, kein Fehler
      if (res.status === 409) { grund = d.grund || 'fotoordner'; fehler = d.error || ''; break }
      // Bericht oder Foto gibt es nicht mehr → das Original wartet umsonst
      if (res.status === 404) { await originalRemove(satz.id); continue }
      fehler = d.error || `Fehler ${res.status}`
      await originalPatch(satz, { versuche: (satz.versuche || 0) + 1, fehler })
    } catch (e) {
      // Server nicht erreichbar – später weiterversuchen
      grund = 'offline'
      fehler = e.message
      await originalPatch(satz, { versuche: (satz.versuche || 0) + 1, fehler: e.message })
      break
    }
  }

  const offen = (await originalList(projectId)).length
  return { abgelegt, offen, grund, fehler }
}
