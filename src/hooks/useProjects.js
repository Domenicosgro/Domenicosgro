import { useState, useEffect, useCallback, useRef } from 'react'
import { emptyProject, uid } from '../utils'

const STORAGE_KEY = 'bb_projects_v1'
const API_PATH    = '/api/projects'

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

async function serverSave(projects) {
  const currentIds = new Set(projects.map(p => p.id))

  // Deletions
  for (const knownId of _sk) {
    if (!currentIds.has(knownId)) {
      try {
        await fetch(`${API_PATH}/${knownId}`, { method: 'DELETE', headers: apiHeaders() })
        _sk.delete(knownId)
        _sv.delete(knownId)
        _st.delete(knownId)
      } catch (e) {
        console.warn(`[server] DELETE Projekt ${knownId}:`, e.message)
      }
    }
  }

  // Creates + Updates
  for (const p of projects) {
    if (!_sk.has(p.id)) {
      try {
        const res = await fetch(API_PATH, {
          method:  'POST',
          headers: apiHeaders(),
          body:    JSON.stringify(p),
        })
        if (res.ok) {
          const { version } = await res.json()
          _sk.add(p.id)
          _sv.set(p.id, version)
          _st.set(p.id, p.updatedAt)
        } else if (res.status === 409) {
          const { serverVersion } = await res.json()
          _sk.add(p.id)
          _sv.set(p.id, serverVersion)
        }
      } catch (e) {
        console.warn(`[server] POST Projekt ${p.id}:`, e.message)
      }
    } else if (p.updatedAt !== _st.get(p.id)) {
      try {
        const version = _sv.get(p.id) || 1
        const res = await fetch(`${API_PATH}/${p.id}`, {
          method:  'PATCH',
          headers: apiHeaders(),
          body:    JSON.stringify({ data: p, version }),
        })
        if (res.status === 409) {
          const { serverVersion } = await res.json()
          _sv.set(p.id, serverVersion)
          const res2 = await fetch(`${API_PATH}/${p.id}`, {
            method:  'PATCH',
            headers: apiHeaders(),
            body:    JSON.stringify({ data: p, version: serverVersion }),
          })
          if (res2.ok) {
            const { version: v2 } = await res2.json()
            _sv.set(p.id, v2)
            _st.set(p.id, p.updatedAt)
          }
        } else if (res.ok) {
          const { version: newVersion } = await res.json()
          _sv.set(p.id, newVersion)
          _st.set(p.id, p.updatedAt)
        }
      } catch (e) {
        console.warn(`[server] PATCH Projekt ${p.id}:`, e.message)
      }
    }
  }
}

// ── Local-mode helpers ────────────────────────────────────────────────────────
async function localLoad() {
  if (isElectron && window.electronAPI.loadProjects) return window.electronAPI.loadProjects()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

async function localSave(projects) {
  if (isElectron && window.electronAPI.saveProjects) {
    const ok = await window.electronAPI.saveProjects(projects)
    if (ok === false) throw new Error('Electron-Speichern fehlgeschlagen')
    return
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects))
}

function buildSaveErrorMessage(err) {
  if (err instanceof DOMException && err.name === 'QuotaExceededError') {
    return 'Speicher voll – Projekte konnten nicht gespeichert werden. Bitte löschen Sie nicht mehr benötigte Daten.'
  }
  return 'Projekte konnten nicht gespeichert werden – Daten sind möglicherweise nicht gesichert.'
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useProjects() {
  const [projects, setProjects] = useState([])
  const [loaded, setLoaded]     = useState(false)
  const [saveError, setSaveError] = useState(null)
  const saveTimer               = useRef(null)

  useEffect(() => {
    if (isServer) {
      serverLoad()
        .then(data => { setProjects(Array.isArray(data) ? data : []); setLoaded(true) })
        .catch(e  => { setSaveError(`Laden vom Server fehlgeschlagen: ${e.message}`); setLoaded(true) })
    } else {
      localLoad().then(data => {
        setProjects(Array.isArray(data) ? data : [])
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
          await serverSave(projects)
        } else {
          await localSave(projects)
        }
        setSaveError(null)
      } catch (err) {
        setSaveError(buildSaveErrorMessage(err))
      }
    }, 400)
    return () => clearTimeout(saveTimer.current)
  }, [projects, loaded])

  const clearSaveError = useCallback(() => setSaveError(null), [])

  const createProject = useCallback(() => {
    const p = emptyProject()
    setProjects(prev => [p, ...prev])
    return p.id
  }, [])

  const updateProject = useCallback((id, patch) => {
    setProjects(prev =>
      prev.map(p => p.id === id
        ? { ...p, ...patch, updatedAt: new Date().toISOString() }
        : p
      )
    )
  }, [])

  const deleteProject = useCallback((id) => {
    setProjects(prev => prev.filter(p => p.id !== id))
  }, [])

  return { projects, loaded, saveError, clearSaveError, createProject, updateProject, deleteProject }
}
