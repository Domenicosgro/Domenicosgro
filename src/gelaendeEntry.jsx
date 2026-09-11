import React, { useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import PersonalplanungGelaende, { isoWeek } from './components/PersonalplanungGelaende'

// ─────────────────────────────────────────────────────────────────────────────
// Einbettbare Vollbildseite fuer das Komplizen-Dashboard (/gelaende).
//
//   /gelaende?token=<Team-Link-Token>   login-frei  (Dashboard-iframe)
//   /gelaende                            nutzt die Sitzung des angemeldeten
//                                        Browsers (gleicher Ursprung)
//
// Ausgeliefert wird die Seite von server/index.js (serveGelaendeHtml); nur dort
// wird die Einbettung per Content-Security-Policy erlaubt.
// ─────────────────────────────────────────────────────────────────────────────

const params = new URLSearchParams(window.location.search)
const token  = params.get('token') || ''
const week0  = params.get('week') || isoWeek(new Date())
const appUrl = window.__APP_URL__ || window.location.origin

function Page() {
  const fetchWeek = useCallback(async (week) => {
    const url = token
      ? `/api/gelaende/public/${encodeURIComponent(token)}/${week}`
      : `/api/gelaende/personalplanung/${week}`
    const headers = {}
    if (!token) {
      const t = localStorage.getItem('kp_session_token')
      if (t) headers.Authorization = `Bearer ${t}`
    }
    const res = await fetch(url, { headers })
    if (res.status === 401) throw new Error('Nicht angemeldet – Team-Link (?token=…) verwenden oder im Protokolltool anmelden.')
    if (res.status === 404) throw new Error('Link ungültig oder deaktiviert.')
    if (!res.ok) throw new Error(`Fehler ${res.status}`)
    return res.json()
  }, [])

  return (
    <PersonalplanungGelaende
      fetchWeek={fetchWeek}
      initialWeek={week0}
      appUrl={appUrl}
      embedded
    />
  )
}

createRoot(document.getElementById('gelaende')).render(<Page />)
