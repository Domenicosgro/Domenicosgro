import { useState, useEffect, useCallback, useRef } from 'react'
import { emptyProtocol, uid } from '../utils'
import { attachmentStore } from '../attachmentStore'

const STORAGE_KEY = 'bb_protocols_v1'

const isElectron = typeof window !== 'undefined' && !!window.electronAPI

async function loadData() {
  if (isElectron) return window.electronAPI.loadProtocols()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

// Throws on failure so the caller can report the error to the user.
async function saveData(protocols) {
  if (isElectron) {
    const ok = await window.electronAPI.saveProtocols(protocols)
    if (ok === false) throw new Error('Electron-Speichern fehlgeschlagen')
    return
  }
  // localStorage.setItem throws QuotaExceededError when storage is full.
  // If it throws, the previous data is still intact — no silent overwrite.
  localStorage.setItem(STORAGE_KEY, JSON.stringify(protocols))
}

// Migrate old inline-base64 attachments to the external store.
// Idempotent: items with attachment.data are old-format; items with attachment.id are already migrated.
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
        return item  // keep original on error — no data loss
      }
    }))
    return pChanged ? { ...protocol, agendaItems } : protocol
  }))
  return { result, changed }
}

function buildSaveErrorMessage(err) {
  if (err instanceof DOMException && err.name === 'QuotaExceededError') {
    return 'Speicher voll – Protokolle konnten nicht gespeichert werden. Bitte löschen Sie alte Protokolle oder Anhänge.'
  }
  return 'Protokolle konnten nicht gespeichert werden – Daten sind möglicherweise nicht gesichert.'
}

export function useProtocols() {
  const [protocols, setProtocols] = useState([])
  const [loaded, setLoaded]       = useState(false)
  const [saveError, setSaveError] = useState(null)
  const saveTimer                  = useRef(null)

  // Initial load + one-time migration of inline base64 attachments
  useEffect(() => {
    loadData().then(async (raw) => {
      const data = Array.isArray(raw) ? raw : []
      const { result, changed } = await migrateAttachments(data)
      setProtocols(result)
      if (changed) {
        try { await saveData(result) } catch {}   // best-effort; errors reported on next change
      }
      setLoaded(true)
    })
  }, [])

  // Debounced save on every change (after initial load)
  useEffect(() => {
    if (!loaded) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        await saveData(protocols)
        setSaveError(null)
      } catch (err) {
        setSaveError(buildSaveErrorMessage(err))
      }
    }, 400)
    return () => clearTimeout(saveTimer.current)
  }, [protocols, loaded])

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
        id: uid(),
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

  return {
    protocols, loaded, saveError, clearSaveError,
    createProtocol, updateProtocol, deleteProtocol, duplicateProtocol, importProtocol, syncProjectName,
  }
}
