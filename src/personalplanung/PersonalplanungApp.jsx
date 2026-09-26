import React, { useEffect, useState } from 'react'
import { CalendarClock, LogOut, ExternalLink, ShieldAlert, Loader } from 'lucide-react'
import LoginScreen from '../components/LoginScreen'
import SessionExpiredModal from '../components/SessionExpiredModal'
import MitarbeiterView from '../components/MitarbeiterView'

// ── Mitarbeiter & Projektteams als eigenständige Anwendung ──────────────────
// Die Wochenplanung ist ins Dashboard umgezogen (docs/UMZUG_PERSONALPLANUNG.md
// dort). Was hier geblieben ist, sind die Stammdaten der eigenen Organisation:
// 16 der 36 Mitarbeiter stammen nicht aus Kontakten, sondern wurden von Hand
// angelegt — sie brauchen eine Pflege, und Stammdaten werden dort gepflegt,
// wo sie liegen. Das Dashboard liest sie über die Stammdaten-Schnittstelle.

const isServer = typeof window !== 'undefined' && !!window.__SERVER_MODE__
const tokenOf  = () => (typeof localStorage !== 'undefined' ? localStorage.getItem('kp_session_token') : null)

export default function PersonalplanungApp() {
  const [user,        setUser]        = useState(null)
  const [authChecked, setAuthChecked] = useState(!isServer)
  const [expired,     setExpired]     = useState(false)


  // Anmeldung prüfen – gleiche Sitzung wie das Protokolltool
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

  const handleLogin = (u) => setUser(u)

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
  if (isServer && !user) return <LoginScreen onLogin={handleLogin} title="Komplizen Mitarbeiter" />

  // Personalplanung obliegt dem Software-Admin (wie bisher im Protokolltool)
  if (isServer && user?.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="card max-w-md p-6 text-center">
          <ShieldAlert size={32} className="mx-auto text-amber-500 mb-3" />
          <h1 className="font-semibold text-night mb-1">Kein Zugriff auf die Mitarbeiterverwaltung</h1>
          <p className="text-sm text-gray-500 mb-4">
            Die Mitarbeiterverwaltung ist Administratoren vorbehalten. Angemeldet als <strong>{user?.display_name || user?.username}</strong>.
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
          <span className="font-semibold truncate">Komplizen Mitarbeiter</span>
          <span className="hidden sm:inline text-xs text-light/60 truncate">· Stammdaten der eigenen Organisation</span>
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

      <MitarbeiterView onBack={() => { window.location.href = '/' }} />

      {expired && (
        <SessionExpiredModal
          username={user?.username}
          onSuccess={(u) => { setExpired(false); if (u) setUser(u) }}
        />
      )}
    </>
  )
}
