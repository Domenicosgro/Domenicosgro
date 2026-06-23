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

const storageKey = (projectId) => `kp_notebook_${projectId}`

export function useNotebook(projectId) {
  const [notebook,  setNotebook]  = useState(null)
  const [loaded,    setLoaded]    = useState(false)
  const [saving,    setSaving]    = useState(false)
  const versionRef  = useRef(1)
  const saveTimer   = useRef(null)

  useEffect(() => {
    if (!projectId) { setNotebook(null); setLoaded(false); return }
    setLoaded(false)
    if (isServer) {
      fetch(`/api/notebooks/${projectId}`, { headers: apiHeaders() })
        .then(r => r.ok ? r.json() : { id: projectId, projectId, topics: [] })
        .then(data => {
          versionRef.current = data._version || 1
          const { _version, _updatedAt, ...nb } = data
          setNotebook(nb.topics ? nb : { id: projectId, projectId, topics: [] })
          setLoaded(true)
        })
        .catch(() => { setNotebook({ id: projectId, projectId, topics: [] }); setLoaded(true) })
    } else {
      try {
        const stored = JSON.parse(localStorage.getItem(storageKey(projectId)) || 'null')
        setNotebook(stored || { id: projectId, projectId, topics: [] })
      } catch {
        setNotebook({ id: projectId, projectId, topics: [] })
      }
      setLoaded(true)
    }
  }, [projectId])

  const saveNow = useCallback(async (nb) => {
    if (!nb || !projectId) return
    const data = { ...nb, updatedAt: new Date().toISOString() }
    if (isServer) {
      try {
        setSaving(true)
        const res = await fetch(`/api/notebooks/${projectId}`, {
          method: 'PUT',
          headers: apiHeaders(),
          body: JSON.stringify({ ...data, version: versionRef.current }),
        })
        if (res.ok) {
          const result = await res.json()
          if (result.version) versionRef.current = result.version
        }
      } catch {} finally { setSaving(false) }
    } else {
      localStorage.setItem(storageKey(projectId), JSON.stringify(data))
    }
  }, [projectId])

  useEffect(() => {
    if (!loaded || !notebook) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveNow(notebook), 800)
    return () => clearTimeout(saveTimer.current)
  }, [notebook, loaded, saveNow])

  const addTopic = useCallback((title = 'Neues Thema') => {
    const id   = uid()
    const ts   = new Date().toISOString()
    const topic = { id, title, notes: [], createdAt: ts }
    setNotebook(prev => {
      if (!prev) return prev
      return { ...prev, topics: [...(prev.topics || []), topic] }
    })
    return id
  }, [])

  const updateTopic = useCallback((topicId, patch) => {
    setNotebook(prev => {
      if (!prev) return prev
      return { ...prev, topics: prev.topics.map(t => t.id === topicId ? { ...t, ...patch } : t) }
    })
  }, [])

  const deleteTopic = useCallback((topicId) => {
    setNotebook(prev => {
      if (!prev) return prev
      return { ...prev, topics: prev.topics.filter(t => t.id !== topicId) }
    })
  }, [])

  const addNote = useCallback((topicId, patch = {}) => {
    const id   = uid()
    const ts   = new Date().toISOString()
    const note = { id, title: 'Neue Notiz', content: '', tasks: [], createdAt: ts, updatedAt: ts, ...patch }
    setNotebook(prev => {
      if (!prev) return prev
      return {
        ...prev,
        topics: prev.topics.map(t =>
          t.id === topicId ? { ...t, notes: [...(t.notes || []), note] } : t
        ),
      }
    })
    return id
  }, [])

  const updateNote = useCallback((topicId, noteId, patch) => {
    const ts = new Date().toISOString()
    setNotebook(prev => {
      if (!prev) return prev
      return {
        ...prev,
        topics: prev.topics.map(t =>
          t.id === topicId
            ? { ...t, notes: t.notes.map(n => n.id === noteId ? { ...n, ...patch, updatedAt: ts } : n) }
            : t
        ),
      }
    })
  }, [])

  const deleteNote = useCallback((topicId, noteId) => {
    setNotebook(prev => {
      if (!prev) return prev
      return {
        ...prev,
        topics: prev.topics.map(t =>
          t.id === topicId ? { ...t, notes: t.notes.filter(n => n.id !== noteId) } : t
        ),
      }
    })
  }, [])

  return { notebook, loaded, saving, addTopic, updateTopic, deleteTopic, addNote, updateNote, deleteNote }
}
