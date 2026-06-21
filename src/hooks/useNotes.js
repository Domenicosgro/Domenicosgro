import { useState, useEffect, useCallback, useRef } from 'react'
import { emptyNote } from '../utils'
import { subscribeToServerEvents } from '../serverEvents'

const STORAGE_KEY = 'bb_notes_v1'
const API_PATH    = '/api/notes'

const isServer = typeof window !== 'undefined' && !!window.__SERVER_MODE__

const _sv = new Map()
const _st = new Map()
const _sk = new Set()

function apiHeaders() {
  const h = { 'Content-Type': 'application/json' }
  if (typeof window !== 'undefined') {
    if (window.__API_KEY__) h['X-API-Key'] = window.__API_KEY__
    const token = localStorage.getItem('kp_session_token')
    if (token) h['Authorization'] = `Bearer ${token}`
  }
  return h
}

function stripMeta({ _version, _updatedAt, ...rest }) { return rest }

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

async function serverSave(notes) {
  const currentIds = new Set(notes.map(n => n.id))
  for (const knownId of _sk) {
    if (!currentIds.has(knownId)) {
      try {
        await fetch(`${API_PATH}/${knownId}`, { method: 'DELETE', headers: apiHeaders() })
        _sk.delete(knownId); _sv.delete(knownId); _st.delete(knownId)
      } catch {}
    }
  }
  for (const n of notes) {
    if (!_sk.has(n.id)) {
      try {
        const res = await fetch(API_PATH, { method: 'POST', headers: apiHeaders(), body: JSON.stringify(n) })
        if (res.ok) {
          const { version } = await res.json()
          _sk.add(n.id); _sv.set(n.id, version); _st.set(n.id, n.updatedAt)
        }
      } catch {}
    } else if (n.updatedAt !== _st.get(n.id)) {
      try {
        const version = _sv.get(n.id) || 1
        const res = await fetch(`${API_PATH}/${n.id}`, {
          method: 'PATCH', headers: apiHeaders(),
          body: JSON.stringify({ data: n, version }),
        })
        if (res.status === 409) {
          const { serverVersion } = await res.json()
          _sv.set(n.id, serverVersion)
          const res2 = await fetch(`${API_PATH}/${n.id}`, {
            method: 'PATCH', headers: apiHeaders(),
            body: JSON.stringify({ data: n, version: serverVersion }),
          })
          if (res2.ok) { const { version: v2 } = await res2.json(); _sv.set(n.id, v2); _st.set(n.id, n.updatedAt) }
        } else if (res.ok) {
          const { version: v } = await res.json(); _sv.set(n.id, v); _st.set(n.id, n.updatedAt)
        }
      } catch {}
    }
  }
}

async function localLoad() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}

async function localSave(notes) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes))
}

export function useNotes() {
  const [notes,     setNotes]     = useState([])
  const [loaded,    setLoaded]    = useState(false)
  const [saveError, setSaveError] = useState(null)
  const saveTimer = useRef(null)

  useEffect(() => {
    if (isServer) {
      serverLoad()
        .then(data => { setNotes(Array.isArray(data) ? data : []); setLoaded(true) })
        .catch(e  => { setSaveError(`Laden fehlgeschlagen: ${e.message}`); setLoaded(true) })
    } else {
      localLoad().then(data => { setNotes(Array.isArray(data) ? data : []); setLoaded(true) })
    }
  }, [])

  useEffect(() => {
    if (!loaded) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        if (isServer) await serverSave(notes)
        else await localSave(notes)
        setSaveError(null)
      } catch { setSaveError('Notizen konnten nicht gespeichert werden.') }
    }, 400)
    return () => clearTimeout(saveTimer.current)
  }, [notes, loaded])

  useEffect(() => {
    if (!isServer || !loaded) return
    return subscribeToServerEvents(async (event) => {
      if (event.type !== 'note') return
      if (event.action === 'delete') {
        setNotes(prev => prev.filter(n => n.id !== event.id))
        _sk.delete(event.id); _sv.delete(event.id); _st.delete(event.id)
        return
      }
      if (event.updatedAt && _st.get(event.id) === event.updatedAt) return
      try {
        const res = await fetch(`${API_PATH}/${event.id}`, { headers: apiHeaders() })
        if (!res.ok) { setNotes(prev => prev.filter(n => n.id !== event.id)); return }
        const item = await res.json()
        const { _version, _updatedAt, ...data } = item
        _sk.add(data.id); _sv.set(data.id, _version); _st.set(data.id, data.updatedAt)
        setNotes(prev => {
          const idx = prev.findIndex(n => n.id === data.id)
          if (idx === -1) return [data, ...prev]
          if (prev[idx].updatedAt === data.updatedAt) return prev
          return prev.map((n, i) => i === idx ? data : n)
        })
      } catch {}
    })
  }, [loaded])

  const createNote = useCallback((patch = {}) => {
    const n = { ...emptyNote(patch.projectId ?? null), ...patch }
    setNotes(prev => [n, ...prev])
    return n.id
  }, [])

  const updateNote = useCallback((id, patch) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...patch, updatedAt: new Date().toISOString() } : n))
  }, [])

  const deleteNote = useCallback((id) => {
    setNotes(prev => prev.filter(n => n.id !== id))
  }, [])

  const refetchNotes = useCallback(async () => {
    try {
      const data = isServer ? await serverLoad() : await localLoad()
      setNotes(Array.isArray(data) ? data : [])
    } catch {}
  }, [])

  return { notes, loaded, saveError, createNote, updateNote, deleteNote, refetchNotes }
}
