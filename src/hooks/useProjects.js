import { useState, useEffect, useCallback, useRef } from 'react'
import { emptyProject, uid } from '../utils'

const STORAGE_KEY = 'bb_projects_v1'
const isElectron  = typeof window !== 'undefined' && !!window.electronAPI

async function loadData() {
  if (isElectron && window.electronAPI.loadProjects) return window.electronAPI.loadProjects()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

// Throws on failure so the caller can report the error to the user.
async function saveData(projects) {
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

export function useProjects() {
  const [projects, setProjects] = useState([])
  const [loaded, setLoaded]     = useState(false)
  const [saveError, setSaveError] = useState(null)
  const saveTimer               = useRef(null)

  useEffect(() => {
    loadData().then(data => {
      setProjects(Array.isArray(data) ? data : [])
      setLoaded(true)
    })
  }, [])

  useEffect(() => {
    if (!loaded) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        await saveData(projects)
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
