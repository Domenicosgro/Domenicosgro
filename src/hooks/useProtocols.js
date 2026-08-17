import { useState, useEffect, useCallback, useRef } from 'react'
import { emptyProtocol, uid } from '../utils'
import { attachmentStore } from '../attachmentStore'
import { subscribeToServerEvents } from '../serverEvents'
import { assertSaveOk } from '../serverSaveError'

const STORAGE_KEY = 'bb_protocols_v1'
const API_PATH    = '/api/protocols'

const isElectron = typeof window !== 'undefined' && !!window.electronAPI
const isServer   = typeof window !== 'undefined' && !!window.__SERVER_MODE__

// ── Server-mode tracking (module-level, one instance per app) ─────────────────
const _sv = new Map()   // id → server version number
const _st = new Map()   // id → updatedAt as of last successful server write
const _sk = new Set()   // ids currently known on server

function apiHeaders() {
  const h = { 'Content-Type': 'application/json' }
  if (typeof window !== 'undefined') {
    if (window.__API_KEY__) h['X-API-Key'] = window.__API_KEY__
    const token = localStorage.getItem('kp_session_token')
    if (token) h['Authorization'] = `Bearer ${token}`
  }
  return h
}

function stripMeta({ _version, _updatedAt, ...rest }) {
  return rest
}

async function serverLoad() {
  const res = await fetch(API_PATH, { headers: apiHeaders() })
  if (!res.ok) throw new Error(`Server-Laden fehlgeschlagen (${res.status})`)
  const items = await res.json()
  _sk.clear(); _sv.clear(); _st.clear()
  for (const item of items) {
    _sk.add(item.id)
    _sv.set(item.id, item._version || 1)
    _st.set(item.id, item.updatedAt)
  }
  return items.map(stripMeta)
}

async function serverSave(protocols) {
  const currentIds = new Set(protocols.map(p => p.id))

  // Deletions: IDs known to server but no longer in local state
  for (const knownId of _sk) {
    if (!currentIds.has(knownId)) {
      try {
        await fetch(`${API_PATH}/${knownId}`, { method: 'DELETE', headers: apiHeaders() })
        _sk.delete(knownId)
        _sv.delete(knownId)
        _st.delete(knownId)
      } catch (e) {
        console.warn(`[server] DELETE Protokoll ${knownId}:`, e.message)
      }
    }
  }

  // Creates + Updates
  for (const p of protocols) {
    if (!_sk.has(p.id)) {
      // New record. Netzwerk-Aussetzer tolerieren (fetch wirft) – Server-Antworten
      // NICHT verschlucken: eine 401 (Sitzung abgelaufen) muss sichtbar werden.
      let res
      try {
        res = await fetch(API_PATH, { method: 'POST', headers: apiHeaders(), body: JSON.stringify(p) })
      } catch (e) { console.warn(`[server] POST Protokoll ${p.id}:`, e.message); continue }
      if (res.ok) {
        const { version } = await res.json()
        _sk.add(p.id); _sv.set(p.id, version); _st.set(p.id, p.updatedAt)
      } else if (res.status === 409) {
        const { serverVersion } = await res.json()
        _sk.add(p.id); _sv.set(p.id, serverVersion)
      } else {
        assertSaveOk(res, 'Protokoll speichern')   // wirft → wird als Speicherfehler gemeldet
      }
    } else if (p.updatedAt !== _st.get(p.id)) {
      // Modified record
      const version = _sv.get(p.id) || 1
      let res
      try {
        res = await fetch(`${API_PATH}/${p.id}`, { method: 'PATCH', headers: apiHeaders(), body: JSON.stringify({ data: p, version }) })
      } catch (e) { console.warn(`[server] PATCH Protokoll ${p.id}:`, e.message); continue }
      if (res.status === 409) {
        const { serverVersion } = await res.json()
        _sv.set(p.id, serverVersion)
        const res2 = await fetch(`${API_PATH}/${p.id}`, { method: 'PATCH', headers: apiHeaders(), body: JSON.stringify({ data: p, version: serverVersion }) })
        if (res2.ok) {
          const { version: v2 } = await res2.json()
          _sv.set(p.id, v2); _st.set(p.id, p.updatedAt)
        } else { assertSaveOk(res2, 'Protokoll speichern') }
      } else if (res.ok) {
        const { version: newVersion } = await res.json()
        _sv.set(p.id, newVersion); _st.set(p.id, p.updatedAt)
      } else {
        assertSaveOk(res, 'Protokoll speichern')
      }
    }
  }
}

// ── Local-mode helpers ────────────────────────────────────────────────────────
async function localLoad() {
  if (isElectron) return window.electronAPI.loadProtocols()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

async function localSave(protocols) {
  if (isElectron) {
    const ok = await window.electronAPI.saveProtocols(protocols)
    if (ok === false) throw new Error('Electron-Speichern fehlgeschlagen')
    return
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(protocols))
}

// ── Attachment migration (local mode only) ────────────────────────────────────
async function migrateAttachments(protocols) {
  let changed = false
  const result = await Promise.all(protocols.map(async (protocol) => {
    let pChanged = false
    const agendaItems = await Promise.all((protocol.agendaItems ?? []).map(async (item) => {
      if (!item.attachment?.data) return item
      const id = uid()
      try {
        await attachmentStore.save(id, item.attachment.data)
        pChanged = true
        changed  = true
        const { data: _omit, ...rest } = item.attachment
        return { ...item, attachment: { ...rest, id } }
      } catch {
        return item
      }
    }))
    return pChanged ? { ...protocol, agendaItems } : protocol
  }))
  return { result, changed }
}

function buildSaveErrorMessage(err) {
  if (err?.authExpired) return err.message   // Sitzung abgelaufen – konkrete Anleitung durchreichen
  if (err instanceof DOMException && err.name === 'QuotaExceededError') {
    return 'Speicher voll – Protokolle konnten nicht gespeichert werden. Bitte löschen Sie alte Protokolle oder Anhänge.'
  }
  return err?.message || 'Protokolle konnten nicht gespeichert werden – Daten sind möglicherweise nicht gesichert.'
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useProtocols() {
  const [protocols, setProtocols] = useState([])
  const [loaded, setLoaded]       = useState(false)
  const [saveError, setSaveError] = useState(null)
  const saveTimer                  = useRef(null)
  // Automatischer Wiederholungsversuch: schlägt das Speichern fehl (429, 5xx,
  // abgelaufene Sitzung), wird es erneut versucht – sonst bliebe die Arbeit
  // ungespeichert, sobald der Nutzer aufhört zu tippen.
  const [retryTick, setRetryTick] = useState(0)
  const retryTimer  = useRef(null)
  const retryCount  = useRef(0)

  useEffect(() => {
    if (isServer) {
      serverLoad()
        .then(data => { setProtocols(Array.isArray(data) ? data : []); setLoaded(true) })
        .catch(e  => { setSaveError(`Laden vom Server fehlgeschlagen: ${e.message}`); setLoaded(true) })
    } else {
      localLoad().then(async (raw) => {
        const data = Array.isArray(raw) ? raw : []
        const { result, changed } = await migrateAttachments(data)
        setProtocols(result)
        if (changed) {
          try { await localSave(result) } catch {}
        }
        setLoaded(true)
      })
    }
  }, [])

  useEffect(() => {
    if (!loaded) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        if (isServer) {
          await serverSave(protocols)
        } else {
          await localSave(protocols)
        }
        clearTimeout(retryTimer.current)
        retryCount.current = 0
        setSaveError(null)
      } catch (err) {
        setSaveError(buildSaveErrorMessage(err))
        // Solange nicht gespeichert werden konnte: automatisch erneut versuchen.
        // Wachsender Abstand (3s → 30s), damit ein ausgelasteter Server nicht
        // zusätzlich belastet wird. Läuft weiter, bis das Speichern klappt.
        clearTimeout(retryTimer.current)
        const delay = Math.min(3000 * 2 ** retryCount.current, 30000)
        retryCount.current += 1
        retryTimer.current = setTimeout(() => setRetryTick(t => t + 1), delay)
      }
    }, 900)   // Auto-Save nach kurzer Tipp-Pause (weniger Requests als 400 ms)
    return () => clearTimeout(saveTimer.current)
  }, [protocols, loaded, retryTick])

  // Aufräumen beim Verlassen
  useEffect(() => () => clearTimeout(retryTimer.current), [])

  // SSE: live updates from other sessions/users
  useEffect(() => {
    if (!isServer || !loaded) return
    return subscribeToServerEvents(async (event) => {
      if (event.type !== 'protocol') return

      if (event.action === 'reload') {
        // Legacy bulk-PUT from another client → full re-load
        try {
          const data = await serverLoad()
          setProtocols(Array.isArray(data) ? data : [])
        } catch {}
        return
      }

      if (event.action === 'delete') {
        setProtocols(prev => {
          if (!prev.some(p => p.id === event.id)) return prev
          return prev.filter(p => p.id !== event.id)
        })
        _sk.delete(event.id)
        _sv.delete(event.id)
        _st.delete(event.id)
        return
      }

      // create / update — skip if we already have this exact version (self-echo)
      if (event.updatedAt && _st.get(event.id) === event.updatedAt) return

      try {
        const res = await fetch(`${API_PATH}/${event.id}`, { headers: apiHeaders() })
        if (!res.ok) return
        const item = await res.json()
        const { _version, _updatedAt, ...data } = item
        _sk.add(data.id)
        _sv.set(data.id, _version)
        _st.set(data.id, data.updatedAt)
        setProtocols(prev => {
          const idx = prev.findIndex(p => p.id === data.id)
          if (idx === -1) return [data, ...prev]
          if (prev[idx].updatedAt === data.updatedAt) return prev
          return prev.map((p, i) => i === idx ? data : p)
        })
      } catch (e) {
        console.warn('[SSE] Protokoll-Fetch fehlgeschlagen:', e.message)
      }
    })
  }, [loaded])

  const clearSaveError = useCallback(() => setSaveError(null), [])

  const createProtocol = useCallback((initial = {}) => {
    const p = { ...emptyProtocol(), ...initial }
    setProtocols(prev => [p, ...prev])
    return p.id
  }, [])

  const updateProtocol = useCallback((id, patch) => {
    setProtocols(prev =>
      prev.map(p => p.id === id
        ? { ...p, ...patch, updatedAt: new Date().toISOString() }
        : p
      )
    )
  }, [])

  const deleteProtocol = useCallback((id) => {
    setProtocols(prev => prev.filter(p => p.id !== id))
  }, [])

  const duplicateProtocol = useCallback((id) => {
    setProtocols(prev => {
      const src = prev.find(p => p.id === id)
      if (!src) return prev
      const copy = {
        ...JSON.parse(JSON.stringify(src)),
        id:        uid(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      return [copy, ...prev]
    })
  }, [])

  const importProtocol = useCallback((data) => {
    if (!data || typeof data !== 'object') return false
    const p = { ...data, id: uid(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    setProtocols(prev => [p, ...prev])
    return p.id
  }, [])

  const syncProjectName = useCallback((projectId, name) => {
    setProtocols(prev =>
      prev.map(p => p.projectId === projectId
        ? { ...p, projectName: name, updatedAt: new Date().toISOString() }
        : p
      )
    )
  }, [])

  const refetchProtocols = useCallback(async () => {
    try {
      if (isServer) {
        const data = await serverLoad()
        setProtocols(Array.isArray(data) ? data : [])
      } else {
        const raw = await localLoad()
        const data = Array.isArray(raw) ? raw : []
        setProtocols(data)
      }
    } catch (e) {
      setSaveError(`Aktualisierung fehlgeschlagen: ${e.message}`)
    }
  }, [])

  return {
    protocols, loaded, saveError, clearSaveError,
    createProtocol, updateProtocol, deleteProtocol, duplicateProtocol, importProtocol, syncProjectName,
    refetchProtocols,
  }
}
