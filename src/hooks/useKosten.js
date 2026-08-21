// CRUD für Kostenermittlungen eines Projekts.
//
// Server-Modus  → /api/projects/:id/kostenermittlung (SQLite, optimistische Versionierung)
// Lokal/Electron → localStorage
//
// Der Editor arbeitet auf einem lokalen Entwurf und speichert entprellt zurück;
// das hält die Tabelleneingabe flüssig, ohne bei jedem Tastendruck zu schreiben.

import { useState, useEffect, useCallback, useRef } from 'react'

const isServer = typeof window !== 'undefined' && !!window.__SERVER_MODE__

function apiHeaders() {
  const h = { 'Content-Type': 'application/json' }
  if (typeof window !== 'undefined') {
    if (window.__API_KEY__) h['X-API-Key'] = window.__API_KEY__
    const token = localStorage.getItem('kp_session_token')
    if (token) h['Authorization'] = `Bearer ${token}`
  }
  return h
}

const storageKey = (projectId) => `kp_kosten_${projectId}`

const readLocal = (projectId) => {
  try { return JSON.parse(localStorage.getItem(storageKey(projectId)) || '[]') } catch { return [] }
}
const writeLocal = (projectId, list) => {
  try { localStorage.setItem(storageKey(projectId), JSON.stringify(list)) } catch {}
}

export function useKosten(projectId) {
  const [estimates, setEstimates] = useState([])
  const [loaded,    setLoaded]    = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState(null)
  const versions = useRef({})          // id → Serverversion

  const load = useCallback(() => {
    if (!projectId) { setEstimates([]); setLoaded(true); return }
    if (!isServer) { setEstimates(readLocal(projectId)); setLoaded(true); return }
    fetch(`/api/projects/${projectId}/kostenermittlung`, { headers: apiHeaders() })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('Laden fehlgeschlagen'))))
      .then(list => {
        const arr = Array.isArray(list) ? list : []
        arr.forEach(e => { versions.current[e.id] = e._version || 1 })
        setEstimates(arr.map(({ _version, _updatedAt, ...e }) => e))
        setLoaded(true)
      })
      .catch(e => { setError(e.message); setEstimates([]); setLoaded(true) })
  }, [projectId])

  useEffect(() => { setLoaded(false); load() }, [load])

  const create = useCallback(async (estimate) => {
    const data = { ...estimate, projectId, updatedAt: new Date().toISOString() }
    if (!isServer) {
      const next = [data, ...readLocal(projectId)]
      writeLocal(projectId, next); setEstimates(next)
      return data
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/kostenermittlung`, {
        method: 'POST', headers: apiHeaders(), body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Anlegen fehlgeschlagen')
      const saved = await res.json()
      versions.current[saved.id] = 1
      setEstimates(prev => [saved, ...prev])
      return saved
    } catch (e) { setError(e.message); throw e }
    finally { setSaving(false) }
  }, [projectId])

  const save = useCallback(async (estimate) => {
    // projectId muss mitgeschickt werden – der Server filtert die Projektliste
    // danach; ein Speichern ohne dieses Feld würde den Eintrag unsichtbar machen.
    const data = { ...estimate, projectId, updatedAt: new Date().toISOString() }
    if (!isServer) {
      const next = readLocal(projectId).map(e => (e.id === data.id ? data : e))
      writeLocal(projectId, next); setEstimates(next)
      return data
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/kostenermittlung/${data.id}`, {
        method: 'PATCH', headers: apiHeaders(),
        body: JSON.stringify({ data, version: versions.current[data.id] ?? 1 }),
      })
      if (res.status === 409) {
        setError('Die Kostenermittlung wurde zwischenzeitlich von jemand anderem geändert. Bitte neu laden.')
        return null
      }
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Speichern fehlgeschlagen')
      const { version } = await res.json()
      if (version) versions.current[data.id] = version
      setEstimates(prev => prev.map(e => (e.id === data.id ? data : e)))
      setError(null)
      return data
    } catch (e) { setError(e.message); return null }
    finally { setSaving(false) }
  }, [projectId])

  const remove = useCallback(async (id) => {
    if (!isServer) {
      const next = readLocal(projectId).filter(e => e.id !== id)
      writeLocal(projectId, next); setEstimates(next)
      return
    }
    try {
      await fetch(`/api/projects/${projectId}/kostenermittlung/${id}`, { method: 'DELETE', headers: apiHeaders() })
      setEstimates(prev => prev.filter(e => e.id !== id))
    } catch (e) { setError(e.message) }
  }, [projectId])

  return { estimates, loaded, saving, error, setError, create, save, remove, reload: load }
}

/**
 * Editor-Zustand: hält einen lokalen Entwurf und schreibt ihn entprellt zurück.
 * `patch` verändert Kopfdaten, `mutate` erlaubt beliebige Umbauten am Entwurf.
 */
export function useKostenDraft(estimate, onSave, delay = 900) {
  const [draft, setDraft] = useState(estimate)
  const [dirty, setDirty] = useState(false)
  const timer   = useRef(null)
  const saveRef = useRef(onSave)
  saveRef.current = onSave

  useEffect(() => { setDraft(estimate); setDirty(false) }, [estimate?.id])

  useEffect(() => {
    if (!dirty || !draft) return
    clearTimeout(timer.current)
    timer.current = setTimeout(() => { saveRef.current?.(draft); setDirty(false) }, delay)
    return () => clearTimeout(timer.current)
  }, [draft, dirty, delay])

  const mutate = useCallback((fn) => { setDraft(prev => (prev ? fn(prev) : prev)); setDirty(true) }, [])
  const patch  = useCallback((p) => mutate(prev => ({ ...prev, ...p })), [mutate])
  const flush  = useCallback(() => {
    clearTimeout(timer.current)
    if (dirty && draft) { saveRef.current?.(draft); setDirty(false) }
  }, [dirty, draft])

  return { draft, dirty, mutate, patch, flush }
}
