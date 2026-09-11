import React, { useEffect, useState, useCallback } from 'react'
import { CalendarClock, LogOut, ExternalLink, ShieldAlert, Loader } from 'lucide-react'
import LoginScreen from '../components/LoginScreen'
import SessionExpiredModal from '../components/SessionExpiredModal'
import PersonalplanungView from '../components/PersonalplanungView'
import { useProjects } from '../hooks/useProjects'

// ── Personalplanung als eigenständige Anwendung ──────────────────────────────
// Eigene Oberfläche mit eigener URL, aber gemeinsames Backend mit dem
// Protokolltool: dieselben Benutzer und Sitzungen (kp_session_token), dieselbe
// Projekt-Datenbank, dieselben Live-Updates (SSE in useProjects). Was hier am
// Projektteam geändert wird, steht sofort im Protokolltool – und umgekehrt.
// Es gibt keine zweite Datenhaltung und nichts abzugleichen.

const isServer = typeof window !== 'undefined' && !!window.__SERVER_MODE__
const tokenOf  = () => (typeof localStorage !== 'undefined' ? localStorage.getItem('kp_session_token') : null)

export default function PersonalplanungApp() {
  const [user,        setUser]        = useState(null)
  const [authChecked, setAuthChecked] = useState(!isServer)
  const [expired,     setExpired]     = useState(false)

  const { projects, saveError, clearSaveError, updateProject, refetchProjects } = useProjects()

  // Anmeldung prüfen – gleiche Sitzung wie das Protokolltool
  useEffect(() => {
    if (!isServer) return
    const token = tokenOf()
    fetch('/api/auth/me', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => {
        if (r.status === 401) { localStorage.removeItem('kp_session_token'); return null }
        return r.json()
      })
      .then(u => { setUser(u || null); setAuthChecked(true); if (u) refetchProjects() })
      .catch(() => { setUser(null); setAuthChecked(true) })
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // Abgelaufene Sitzung: Overlay statt Login-Seite, damit nichts verloren geht
  useEffect(() => {
    const onExpired = () => setExpired(true)
    window.addEventListener('kp-auth-expired', onExpired)
    return () => window.removeEventListener('kp-auth-expired', onExpired)
  }, [])

  // Nach An-/Abmeldung: Daten neu laden und die Live-Verbindung (SSE) mit dem
  // neuen Token aufbauen – dasselbe Ereignis, das auch das Protokolltool feuert.
  useEffect(() => {
    window.dispatchEvent(new Event('kp-auth-changed'))
  }, [user?.username])

  const handleLogin = (u) => { setUser(u); refetchProjects() }

  const handleLogout = async () => {
    const token = tokenOf()
    try { if (token) await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }) } catch {}
    localStorage.removeItem('kp_session_token')
    setUser(null)
  }

  // Projektänderungen (Team, Gesellschaft) gehen direkt in die gemeinsame
  // Projektdatenbank – die Personalplanung fasst keine Kontakte an, daher ist
  // hier keine Verschlüsselungslogik nötig.
  const handleUpdateProject = useCallback((id, patch) => updateProject(id, patch), [updateProject])

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">
        <Loader size={18} className="animate-spin mr-2" /> Anmeldung wird geprüft…
      </div>
    )
  }
  if (isServer && !user) return <LoginScreen onLogin={handleLogin} title="Komplizen Personalplanung" />

  // Personalplanung obliegt dem Software-Admin (wie bisher im Protokolltool)
  if (isServer && user?.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="card max-w-md p-6 text-center">
          <ShieldAlert size={32} className="mx-auto text-amber-500 mb-3" />
          <h1 className="font-semibold text-night mb-1">Kein Zugriff auf die Personalplanung</h1>
          <p className="text-sm text-gray-500 mb-4">
            Die Personalplanung ist Administratoren vorbehalten. Angemeldet als <strong>{user?.display_name || user?.username}</strong>.
          </p>
          <div className="flex justify-center gap-2">
            <a className="btn-secondary" href="/"><ExternalLink size={14} /> Zum Protokolltool</a>
            <button className="btn-ghost" onClick={handleLogout}><LogOut size={14} /> Abmelden</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Kopfzeile der eigenständigen App */}
      <header className="no-print sticky top-0 z-30 bg-night text-light px-4 sm:px-6 lg:px-10 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <CalendarClock size={18} className="text-sky flex-shrink-0" />
          <span className="font-semibold truncate">Komplizen Personalplanung</span>
          <span className="hidden sm:inline text-xs text-light/60 truncate">· Projektdaten synchron mit dem Protokolltool</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {user && <span className="hidden sm:inline text-xs text-light/70">{user.display_name || user.username}</span>}
          <a className="btn btn-ghost text-light hover:bg-white/10 hover:text-light" href="/" title="Zum Protokolltool wechseln">
            <ExternalLink size={14} /> Protokolltool
          </a>
          {isServer && (
            <button className="btn btn-ghost text-light hover:bg-white/10 hover:text-light" onClick={handleLogout} title="Abmelden">
              <LogOut size={14} />
            </button>
          )}
        </div>
      </header>

      <PersonalplanungView
        projects={projects}
        onUpdateProject={handleUpdateProject}
        serverUser={user}
        onBack={() => { window.location.href = '/' }}
      />

      {expired && (
        <SessionExpiredModal
          username={user?.username}
          onSuccess={(u) => { setExpired(false); if (u) setUser(u); clearSaveError() }}
        />
      )}
      {!expired && saveError && (
        <div className="fixed top-0 inset-x-0 z-50 flex items-center justify-between gap-4 bg-red-700 text-white px-5 py-3 text-sm no-print">
          <span><strong>Speichern fehlgeschlagen.</strong> {saveError}</span>
          <button className="shrink-0 text-white/70 hover:text-white text-lg" onClick={clearSaveError}>×</button>
        </div>
      )}
    </>
  )
}
