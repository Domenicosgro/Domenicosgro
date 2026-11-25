// ── Warteschlange der Baustellen-Oberfläche ──────────────────────────────────
//
// Auf der Baustelle gibt es oft kein Netz. Ein Tagesbericht muss deshalb auch
// dann fertig geschrieben werden können – gespeichert wird er lokal, gesendet
// wird, sobald wieder etwas geht.
//
// Zwei Speicher, mit Absicht getrennt:
//
//   berichte  – Felder des Berichts und die kleinen Fassungen der Fotos
//               (base64, ~120 KB je Bild). Das ist, was der Bericht braucht.
//   originale – die Rohdaten der Fotos (3–8 MB je Bild), ein Satz je Foto.
//               Als eigene Sätze, damit nicht bei jedem Tippen ein Datensatz
//               von 100 MB neu geschrieben wird.
//
// Reihenfolge beim Senden: erst die kleinen Fassungen, dann der Bericht, dann
// wandern die Originale in die Warteschlange für den Projektordner
// (src/fotoOriginale.js) – die kennt den Bericht erst, wenn er eine Kennung hat.
//
// Gegen doppelte Berichte: jeder Bericht trägt eine eigene Kennung (clientId).
// Bricht die Verbindung ab, nachdem der Server ihn angelegt hat, bekommt der
// zweite Versuch denselben Bericht zurück statt eines zweiten Eintrags.

import { uid } from '../utils'
import { anhangSpeichern, berichtAnlegen, berichtAendern, authHeaders, fotoPfad } from './api'
import { originalAdd, originaleSenden } from '../fotoOriginale'

const DB_NAME = 'kp_baustelle_v1'
const BERICHTE = 'berichte'
const BILDER   = 'originale'

let _db = null
function openDb() {
  if (_db) return Promise.resolve(_db)
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(BERICHTE)) db.createObjectStore(BERICHTE, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(BILDER))   db.createObjectStore(BILDER,   { keyPath: 'id' })
    }
    req.onsuccess = (e) => { _db = e.target.result; resolve(_db) }
    req.onerror   = (e) => reject(e.target.error)
  })
}

async function schreibe(store, arbeit) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readwrite')
    arbeit(t.objectStore(store))
    t.oncomplete = () => resolve()
    t.onerror    = (e) => reject(e.target.error)
  })
}

async function alle(store) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAll()
    req.onsuccess = () => resolve(req.result || [])
    req.onerror   = (e) => reject(e.target.error)
  })
}

/**
 * Bericht in die Warteschlange legen.
 * fotos: [{ id, name, caption, base64, bytes, typ }] – `bytes` ist optional
 * (ohne Original gibt es nur die kleine Fassung im Bericht).
 */
export async function berichtEinstellen({ projectId, entryId = null, version = null, felder, fotos = [] }) {
  const id = uid()
  await schreibe(BERICHTE, s => s.put({
    id, projectId, entryId, version,
    clientId: id,
    felder,
    fotos: fotos.map(f => ({ id: f.id, name: f.name, caption: f.caption || '', base64: f.base64 })),
    queuedAt: new Date().toISOString(), versuche: 0, fehler: '',
  }))
  for (const f of fotos) {
    if (!f.bytes) continue
    await schreibe(BILDER, s => s.put({
      id: f.id, berichtId: id, projectId, name: f.name || 'foto.jpg', typ: f.typ || 'image/jpeg', bytes: f.bytes,
    }))
  }
  return id
}

/** Wartende Berichte – alle oder die eines Projekts. */
export async function berichteOffen(projectId = null) {
  const liste = await alle(BERICHTE)
  return projectId ? liste.filter(b => b.projectId === projectId) : liste
}

async function berichtEntfernen(id) {
  const bilder = (await alle(BILDER)).filter(b => b.berichtId === id)
  for (const b of bilder) await schreibe(BILDER, s => s.delete(b.id))
  await schreibe(BERICHTE, s => s.delete(id))
}

/** Einen wartenden Bericht verwerfen (nur auf ausdrücklichen Wunsch). */
export const berichtVerwerfen = berichtEntfernen

// Nur ein Durchlauf gleichzeitig – sonst schicken zwei Anläufe denselben
// Bericht, und im Büro stehen zwei.
let laeuft = false

/**
 * Wartende Berichte senden. Rückgabe: { gesendet, offen, grund, fehler }
 * grund: 'offline' | 'laeuft' | null
 */
export async function warteschlangeSenden() {
  if (laeuft) return { gesendet: 0, offen: (await alle(BERICHTE)).length, grund: 'laeuft', fehler: '' }
  laeuft = true
  try {
    return await durchlauf()
  } finally {
    laeuft = false
  }
}

async function durchlauf() {
  const liste = (await alle(BERICHTE)).sort((a, b) => (a.queuedAt || '').localeCompare(b.queuedAt || ''))
  let gesendet = 0
  let grund = null
  let fehler = ''
  const projekte = new Set()

  for (const satz of liste) {
    if (!navigator.onLine) { grund = 'offline'; break }
    try {
      // 1) Kleine Fassungen – ohne sie hätte der Bericht leere Bilder
      for (const f of satz.fotos || []) {
        if (f.base64) await anhangSpeichern(satz.projectId, f.id, f.base64)
      }
      // 2) Der Bericht selbst
      const nutzlast = {
        ...satz.felder,
        clientId: satz.clientId,
        fotos: (satz.fotos || []).map(f => ({ id: f.id, name: f.name, caption: f.caption || '' })),
      }
      const angelegt = satz.entryId
        ? await berichtAendern(satz.projectId, satz.entryId, { ...nutzlast, version: satz.version })
        : await berichtAnlegen(satz.projectId, nutzlast)

      // 3) Originale an den Bericht hängen und in die Ablage-Warteschlange
      const bilder = (await alle(BILDER)).filter(b => b.berichtId === satz.id)
      for (const b of bilder) {
        await originalAdd({
          id: b.id, projectId: satz.projectId, entryId: angelegt?.id || satz.entryId,
          bytes: b.bytes, typ: b.typ, name: b.name,
        })
      }
      await berichtEntfernen(satz.id)
      projekte.add(satz.projectId)
      gesendet++
    } catch (e) {
      // Server nicht erreichbar → später weiter. Ein inhaltlicher Fehler
      // (z. B. Bericht im Büro gesperrt) bleibt am Satz stehen und wird
      // angezeigt, statt still zu verschwinden.
      const netz = e instanceof TypeError || /fetch|network|failed/i.test(e.message || '')
      fehler = e.message || 'Unbekannter Fehler'
      await schreibe(BERICHTE, s => s.put({ ...satz, versuche: (satz.versuche || 0) + 1, fehler }))
      if (netz) { grund = 'offline'; break }
    }
  }

  // Die Originale wandern nebenher in den Projektordner.
  for (const pid of projekte) {
    try { await originaleSenden(pid, authHeaders(), { pfad: fotoPfad }) } catch {}
  }

  return { gesendet, offen: (await alle(BERICHTE)).length, grund, fehler }
}
