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

async function saveData(projects) {
  if (isElectron && window.electronAPI.saveProjects) return window.electronAPI.saveProjects(projects)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects))
}

export function useProjects() {
  const [projects, setProjects] = useState([])
  const [loaded, setLoaded]     = useState(false)
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
    saveTimer.current = setTimeout(() => saveData(projects), 400)
    return () => clearTimeout(saveTimer.current)
  }, [projects, loaded])

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

  return { projects, loaded, createProject, updateProject, deleteProject }
}
