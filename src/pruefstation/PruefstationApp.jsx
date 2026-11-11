import React, { useEffect, useState } from 'react'
import { ScanSearch, LogOut, ExternalLink, Loader } from 'lucide-react'
import LoginScreen from '../components/LoginScreen'
import SessionExpiredModal from '../components/SessionExpiredModal'
import Pruefstation from './Pruefstation'
import { tokenOf } from './api'

// ── Prüfstation ──────────────────────────────────────────────────────────────
// Eigenständige Oberfläche unter /pruefstation. Links die Prüfvorgänge (nach
// Projekt gefiltert), rechts der gewählte Vorgang mit seinem NAS-Ordner.
// Gleiche Sitzung (kp_session_token) und gleiche Projekte wie das Protokolltool.

const isServer = typeof window !== 'undefined' && !!window.__SERVER_MODE__

export default function PruefstationApp() {
  const [user,        setUser]        = useState(null)
  const [authChecked, setAuthChecked] = useState(!isServer)
  const [expired,     setExpired]     = useState(false)

  useEffect(() => {
    if (!isServer) return
    const token = tokenOf()
    fetch('/api/auth/me', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => {
        if (r.status === 401) { localStorage.removeItem('kp_session_token'); return null }
        return r.json()
      })
      .then(u => { setUser(u || null); setAuthChecked(true) })
      .catch(() => { setUser(null); setAuthChecked(true) })
  }, [])

  useEffect(() => {
    const onExpired = () => setExpired(true)
    window.addEventListener('kp-auth-expired', onExpired)
    return () => window.removeEventListener('kp-auth-expired', onExpired)
  }, [])

  const handleLogout = async () => {
    const token = tokenOf()
    try { if (token) await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }) } catch {}
    localStorage.removeItem('kp_session_token')
    setUser(null)
  }

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">
        <Loader size={18} className="animate-spin mr-2" /> Anmeldung wird geprüft…
      </div>
    )
  }
  if (!isServer) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center text-sm text-gray-500">
        Die Prüfstation läuft nur im Server-Modus (NAS), weil sie auf die Projektordner der NAS zugreift.
      </div>
    )
  }
  if (!user) return <LoginScreen onLogin={setUser} title="Komplizen Prüfstation" />

  return (
    <>
      <header className="no-print sticky top-0 z-30 bg-night text-light px-4 sm:px-6 lg:px-10 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <ScanSearch size={18} className="text-sky flex-shrink-0" />
          <span className="font-semibold truncate">Komplizen Prüfstation</span>
          <span className="hidden sm:inline text-xs text-light/60 truncate">· Nachträge und Rechnungen prüfen</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="hidden sm:inline text-xs text-light/70">{user.display_name || user.displayName || user.username}</span>
          <a className="btn btn-ghost text-light hover:bg-white/10 hover:text-light" href="/" title="Zum Protokolltool wechseln">
            <ExternalLink size={14} /> Protokolltool
          </a>
          <button className="btn btn-ghost text-light hover:bg-white/10 hover:text-light" onClick={handleLogout} title="Abmelden">
            <LogOut size={14} />
          </button>
        </div>
      </header>

      <Pruefstation key={user.username} standalone />

      {expired && (
        <SessionExpiredModal
          username={user?.username}
          onSuccess={(u) => { setExpired(false); if (u) setUser(u) }}
        />
      )}
    </>
  )
}
