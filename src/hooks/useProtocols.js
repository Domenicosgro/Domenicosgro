import { useState, useEffect, useCallback } from 'react'
import { emptyProtocol, uid } from '../utils'

const STORAGE_KEY = 'bb_protocols_v1'

const load = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

const save = (data) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function useProtocols() {
  const [protocols, setProtocols] = useState(load)

  useEffect(() => {
    save(protocols)
  }, [protocols])

  const createProtocol = useCallback(() => {
    const p = emptyProtocol()
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
        protocolNo: src.protocolNo ? src.protocolNo + ' (Kopie)' : '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      return [copy, ...prev]
    })
  }, [])

  return { protocols, createProtocol, updateProtocol, deleteProtocol, duplicateProtocol }
}
