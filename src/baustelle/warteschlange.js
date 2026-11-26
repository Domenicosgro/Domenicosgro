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
//
// Zwei Arten warten hier, im selben Speicher und mit derselben Reihenfolge:
//
//   art: 'bericht' – Tagesbericht der Baudokumentation, mit Originalfotos
//   art: 'mangel'  – ein Mangel, neu oder geändert
//
// Für Mängel werden keine Originale verwahrt. Ein Mangelfoto dient dem
// Nachweis im Bericht und in der Mängelliste, nicht dem Archiv – und die
// Ablage im Projektordner hängt am Tagesbericht (server/bautagebuchFotos.js).

import { uid } from '../utils'
import { anhangSpeichern, berichtAnlegen, berichtAendern,
         mangelAnlegen, mangelAendern, authHeaders, fotoPfad } from './api'
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
    id, art: 'bericht', projectId, entryId, version,
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

/**
 * Mangel in die Warteschlange legen.
 * mangelId gesetzt = Änderung, sonst neu. fotos: [{ id, name, base64 }]
 */
export async function mangelEinstellen({ projectId, mangelId = null, version = null, felder, fotos = [] }) {
  const id = uid()
  await schreibe(BERICHTE, s => s.put({
    id, art: 'mangel', projectId, mangelId, version,
    clientId: id,
    felder,
    fotos: fotos.map(f => ({ id: f.id, name: f.name, base64: f.base64 })),
    queuedAt: new Date().toISOString(), versuche: 0, fehler: '',
  }))
  return id
}

/** Wartende Sätze – alle oder die eines Projekts, nach Art gefiltert. */
export async function berichteOffen(projectId = null, art = 'bericht') {
  const liste = await alle(BERICHTE)
  return liste
    .filter(b => (b.art || 'bericht') === art)
    .filter(b => !projectId || b.projectId === projectId)
}

/** Wie viel wartet, nach Art getrennt. */
export async function offeneAnzahl(projectId = null) {
  const liste = await alle(BERICHTE)
  const mein = liste.filter(b => !projectId || b.projectId === projectId)
  return {
    berichte: mein.filter(b => (b.art || 'bericht') === 'bericht').length,
    maengel:  mein.filter(b => b.art === 'mangel').length,
  }
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

      // 2a) Ein Mangel ist mit dem Senden fertig – kein Original, keine Ablage
      if (satz.art === 'mangel') {
        const nutzlast = {
          ...satz.felder,
          clientId: satz.clientId,
          fotos: (satz.fotos || []).map(f => ({ id: f.id, name: f.name })),
        }
        if (satz.mangelId) await mangelAendern(satz.projectId, satz.mangelId, { ...nutzlast, version: satz.version })
        else               await mangelAnlegen(satz.projectId, nutzlast)
        await berichtEntfernen(satz.id)
        gesendet++
        continue
      }

      // 2b) Der Bericht selbst
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
