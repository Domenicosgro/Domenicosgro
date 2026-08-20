import React, { useState, useRef, useEffect } from 'react'
import { LogIn, Eye, EyeOff, ShieldAlert, Loader } from 'lucide-react'

// ── Neuanmeldung bei abgelaufener Sitzung ─────────────────────────────────────
// Legt sich als Overlay ÜBER die App, statt zum Login-Screen zu wechseln:
// So bleiben alle ungespeicherten Eingaben im Editor erhalten. Nach erfolgreicher
// Anmeldung liegt ein gültiger Token vor – der automatische Wiederholungsversuch
// in useProtocols/useProjects speichert die offenen Änderungen dann von selbst.
export default function SessionExpiredModal({ username, onSuccess }) {
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [error,    setError]    = useState(null)
  const [loading,  setLoading]  = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true); setError(null)
    try {
      const res  = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ username, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'Anmeldung fehlgeschlagen.'); return }
      localStorage.setItem('kp_session_token', data.token)
      onSuccess?.(data.user)
    } catch {
      setError('Server nicht erreichbar.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 no-print">
      <div className="bg-white w-full max-w-md border border-gray-200 shadow-2xl">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-200 bg-amber-50">
          <ShieldAlert size={18} className="text-amber-600 flex-shrink-0" />
          <h3 className="font-semibold text-gray-900">Anmeldung abgelaufen</h3>
        </div>

        <form onSubmit={submit} className="p-5 space-y-4">
          <p className="text-sm text-gray-600">
            Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an, damit weiter
            gespeichert werden kann.
          </p>
          <p className="text-xs text-gray-700 bg-brand-50 border border-brand-100 px-3 py-2">
            <strong>Ihre Eingaben bleiben erhalten.</strong> Nach der Anmeldung werden noch nicht
            gespeicherte Änderungen automatisch übernommen. Bitte das Fenster nicht neu laden.
          </p>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Benutzer</label>
            <input className="input bg-gray-50 text-gray-600" value={username || ''} readOnly />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Passwort</label>
            <div className="relative">
              <input
                ref={inputRef}
                className="input pr-10"
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
              />
              <button type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                onClick={() => setShowPw(v => !v)} tabIndex={-1}>
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2">{error}</p>}

          <button className="btn-primary w-full justify-center" type="submit" disabled={loading || !password}>
            {loading ? <Loader size={15} className="animate-spin" /> : <LogIn size={15} />}
            {loading ? 'Wird angemeldet…' : 'Anmelden und weiterarbeiten'}
          </button>
        </form>
      </div>
    </div>
  )
}
