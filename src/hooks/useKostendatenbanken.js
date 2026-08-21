// Büroweite Kostendatenbanken: CRUD und Dokument-Upload.
//
// Server-Modus  → /api/kostendatenbanken (Lesen für alle, Pflege für Admins)
// Lokal/Electron → localStorage
//
// Nachweisdokumente laufen über die vorhandene Anhang-Ablage
// (/api/attachments → /data/attachments/{id}), damit auch große PDF-Ausgaben
// nicht in der Datenbankzeile landen.

import { useState, useEffect, useCallback, useRef } from 'react'
import { uid } from '../utils'

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

const STORAGE_KEY = 'kp_kostendatenbanken'
const readLocal  = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] } }
const writeLocal = (l) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(l)) } catch {} }

export function useKostendatenbanken() {
  const [databases, setDatabases] = useState([])
  const [loaded,    setLoaded]    = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState(null)
  const versions = useRef({})

  const load = useCallback(() => {
    if (!isServer) { setDatabases(readLocal()); setLoaded(true); return }
    fetch('/api/kostendatenbanken', { headers: apiHeaders() })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('Kostendatenbanken konnten nicht geladen werden.'))))
      .then(list => {
        const arr = Array.isArray(list) ? list : []
        arr.forEach(d => { versions.current[d.id] = d._version || 1 })
        setDatabases(arr.map(({ _version, _updatedAt, ...d }) => d))
        setLoaded(true)
      })
      .catch(e => { setError(e.message); setDatabases([]); setLoaded(true) })
  }, [])

  useEffect(() => { load() }, [load])

  const create = useCallback(async (database) => {
    const data = { ...database, updatedAt: new Date().toISOString() }
    if (!isServer) {
      const next = [data, ...readLocal()]
      writeLocal(next); setDatabases(next)
      return data
    }
    setSaving(true)
    try {
      const res = await fetch('/api/kostendatenbanken', {
        method: 'POST', headers: apiHeaders(), body: JSON.stringify(data),
      })
      if (res.status === 403) throw new Error('Kostendatenbanken dürfen nur Systemadministratoren anlegen.')
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Anlegen fehlgeschlagen')
      const saved = await res.json()
      versions.current[saved.id] = 1
      setDatabases(prev => [saved, ...prev])
      return saved
    } catch (e) { setError(e.message); throw e }
    finally { setSaving(false) }
  }, [])

  const save = useCallback(async (database) => {
    const data = { ...database, updatedAt: new Date().toISOString() }
    if (!isServer) {
      const next = readLocal().map(d => (d.id === data.id ? data : d))
      writeLocal(next); setDatabases(next)
      return data
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/kostendatenbanken/${data.id}`, {
        method: 'PATCH', headers: apiHeaders(),
        body: JSON.stringify({ data, version: versions.current[data.id] ?? 1 }),
      })
      if (res.status === 403) { setError('Änderungen an Kostendatenbanken sind Systemadministratoren vorbehalten.'); return null }
      if (res.status === 409) { setError('Die Kostendatenbank wurde zwischenzeitlich geändert. Bitte neu laden.'); return null }
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Speichern fehlgeschlagen')
      const { version } = await res.json()
      if (version) versions.current[data.id] = version
      setDatabases(prev => prev.map(d => (d.id === data.id ? data : d)))
      setError(null)
      return data
    } catch (e) { setError(e.message); return null }
    finally { setSaving(false) }
  }, [])

  const remove = useCallback(async (id) => {
    if (!isServer) {
      const next = readLocal().filter(d => d.id !== id)
      writeLocal(next); setDatabases(next)
      return
    }
    try {
      const res = await fetch(`/api/kostendatenbanken/${id}`, { method: 'DELETE', headers: apiHeaders() })
      if (res.status === 403) { setError('Löschen ist Systemadministratoren vorbehalten.'); return }
      setDatabases(prev => prev.filter(d => d.id !== id))
    } catch (e) { setError(e.message) }
  }, [])

  return { databases, loaded, saving, error, setError, create, save, remove, reload: load }
}

// ── Nachweisdokumente ────────────────────────────────────────────────────────

/** Legt eine Datei in der Anhang-Ablage ab und liefert die Dokument-Metadaten. */
export async function uploadDocument(file) {
  const id     = uid().replace(/-/g, '')
  const base64 = await fileToBase64(file)

  if (isServer) {
    const res = await fetch('/api/attachments', {
      method: 'POST', headers: apiHeaders(), body: JSON.stringify({ id, data: base64 }),
    })
    if (!res.ok) throw new Error('Das Dokument konnte nicht abgelegt werden.')
  } else {
    try { localStorage.setItem(`kp_kostendoc_${id}`, base64) }
    catch { throw new Error('Lokaler Speicher voll – Dokument konnte nicht abgelegt werden.') }
  }

  return {
    attachmentId: id,
    name:     file.name,
    mimeType: file.type || 'application/octet-stream',
    size:     file.size,
    uploadedAt: new Date().toISOString(),
  }
}

/** Öffnet ein abgelegtes Dokument in einem neuen Tab. */
export async function openDocument(doc) {
  let base64
  if (isServer) {
    const res = await fetch(`/api/attachments/${doc.attachmentId}`, { headers: apiHeaders() })
    if (!res.ok) throw new Error('Dokument nicht gefunden.')
    base64 = (await res.json()).data
  } else {
    base64 = localStorage.getItem(`kp_kostendoc_${doc.attachmentId}`)
    if (!base64) throw new Error('Dokument nicht gefunden.')
  }
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
  const url   = URL.createObjectURL(new Blob([bytes], { type: doc.mimeType || 'application/octet-stream' }))
  window.open(url, '_blank')
  // Objekt-URL erst freigeben, wenn der neue Tab sie geladen hat.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export async function deleteDocument(doc) {
  if (!doc?.attachmentId) return
  if (isServer) {
    try { await fetch(`/api/attachments/${doc.attachmentId}`, { method: 'DELETE', headers: apiHeaders() }) } catch {}
  } else {
    try { localStorage.removeItem(`kp_kostendoc_${doc.attachmentId}`) } catch {}
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(String(reader.result).split(',')[1])
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'))
    reader.readAsDataURL(file)
  })
}
