import { useState, useEffect, useRef, useCallback } from 'react'

const isServer = typeof window !== 'undefined' && !!window.__SERVER_MODE__
const LS_KEY   = 'bb_user_settings'

function apiHeaders() {
  const h = { 'Content-Type': 'application/json' }
  const token = localStorage.getItem('kp_session_token')
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

function loadLocal() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') } catch { return {} }
}

function saveLocal(settings) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(settings)) } catch {}
}

export function useUserSettings(username) {
  const [settings, setSettings] = useState(() => isServer ? {} : loadLocal())
  const [loaded,   setLoaded]   = useState(!isServer)
  const saveTimer = useRef(null)

  // Load from server on mount (server mode only)
  useEffect(() => {
    if (!isServer || !username) { setLoaded(true); return }
    fetch(`/api/auth/users/${encodeURIComponent(username)}/settings`, { headers: apiHeaders() })
      .then(r => r.ok ? r.json() : {})
      .then(data => { setSettings(data); setLoaded(true) })
      .catch(() => setLoaded(true))
  }, [username])

  // Debounced save to server (or localStorage)
  const persist = useCallback((next) => {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      if (isServer && username) {
        fetch(`/api/auth/users/${encodeURIComponent(username)}/settings`, {
          method: 'PUT', headers: apiHeaders(), body: JSON.stringify(next),
        }).catch(() => {})
      } else {
        saveLocal(next)
      }
    }, 500)
  }, [username])

  const update = useCallback((patch) => {
    setSettings(prev => {
      const next = { ...prev, ...patch }
      persist(next)
      return next
    })
  }, [persist])

  const isFavorite = useCallback((id) =>
    ((settings.favorites ?? [])).includes(id),
  [settings.favorites])

  const toggleFavorite = useCallback((id) => {
    const cur = new Set(settings.favorites ?? [])
    if (cur.has(id)) cur.delete(id)
    else cur.add(id)
    update({ favorites: [...cur] })
  }, [settings.favorites, update])

  return { settings, loaded, update, isFavorite, toggleFavorite }
}
