import { useState, useEffect, useCallback, useRef } from 'react'
import { emptyProtocol, uid } from '../utils'

const STORAGE_KEY = 'bb_protocols_v1'

// Detect Electron context (preload script exposes window.electronAPI)
const isElectron = typeof window !== 'undefined' && !!window.electronAPI

async function loadData() {
  if (isElectron) return window.electronAPI.loadProtocols()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

async function saveData(protocols) {
  if (isElectron) return window.electronAPI.saveProtocols(protocols)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(protocols))
}

export function useProtocols() {
  const [protocols, setProtocols] = useState([])
  const [loaded, setLoaded]       = useState(false)
  const saveTimer                  = useRef(null)

  // Initial load
  useEffect(() => {
    loadData().then(data => {
      setProtocols(Array.isArray(data) ? data : [])
      setLoaded(true)
    })
  }, [])

  // Debounced save on every change (after initial load)
  useEffect(() => {
    if (!loaded) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveData(protocols), 400)
    return () => clearTimeout(saveTimer.current)
  }, [protocols, loaded])

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
        id: uid(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      return [copy, ...prev]
    })
  }, [])

  // Import a single protocol from JSON (Electron file dialog or parsed object)
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

  return { protocols, loaded, createProtocol, updateProtocol, deleteProtocol, duplicateProtocol, importProtocol, syncProjectName }
}
