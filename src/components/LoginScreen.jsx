import React, { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

export default function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [error,    setError]    = useState(null)
  const [loading,  setLoading]  = useState(false)

  // Reset request state
  const [mode,         setMode]         = useState('login')   // 'login' | 'reset'
  const [resetUser,    setResetUser]     = useState('')
  const [resetSent,    setResetSent]     = useState(false)
  const [resetError,   setResetError]    = useState(null)
  const [resetLoading, setResetLoading]  = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Anmeldung fehlgeschlagen.'); return }
      localStorage.setItem('kp_session_token', data.token)
      onLogin(data.user)
    } catch {
      setError('Server nicht erreichbar.')
    } finally {
      setLoading(false)
    }
  }

  async function handleResetRequest(e) {
    e.preventDefault()
    setResetError(null)
    setResetLoading(true)
    try {
      const res  = await fetch('/api/auth/reset-request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ username: resetUser }),
      })
      const data = await res.json()
      if (!res.ok) { setResetError(data.error); return }
      setResetSent(true)
    } catch {
      setResetError('Server nicht erreichbar.')
    } finally {
      setResetLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-night flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-8">

        {/* Markenheader */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-sky/20 border border-sky/40">
            <img src="/logo.png" alt="Komplizen" className="w-10 h-10 object-contain" style={{ filter: 'brightness(0) invert(1)' }} />
          </div>
          <div>
            <h1 className="text-2xl font-headline font-black text-light tracking-wide">Komplizen Protokolle</h1>
            <p className="text-sm text-sky/80 mt-1">
              {mode === 'login' ? 'Bitte melden Sie sich an' : 'Passwort zurücksetzen'}
            </p>
          </div>
        </div>

        {/* Login-Karte */}
        <div className="bg-white/5 border border-white/10 rounded-lg p-8 space-y-6 backdrop-blur-sm">

        {mode === 'login' ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="text-sm text-red-300 bg-red-900/40 border border-red-500/40 px-3 py-2 rounded">{error}</div>
            )}
            <div>
              <label className="block text-sm font-medium text-light/80 mb-1">Benutzername</label>
              <input
                className="input w-full bg-white/10 border-white/20 text-light placeholder-white/30 focus:border-sky focus:ring-sky"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoFocus autoComplete="username" required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-light/80 mb-1">Passwort</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  className="input w-full pr-9 bg-white/10 border-white/20 text-light placeholder-white/30 focus:border-sky focus:ring-sky"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password" required
                />
                <button type="button" tabIndex={-1}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-sky"
                  onClick={() => setShowPw(v => !v)}>
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <button type="submit" className="btn btn-primary w-full justify-center" disabled={loading}>
              {loading ? 'Anmelden…' : 'Anmelden'}
            </button>
            <div className="text-center">
              <button type="button" className="text-xs text-sky/60 hover:text-sky underline"
                onClick={() => { setMode('reset'); setResetSent(false); setResetError(null) }}>
                Passwort vergessen?
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            {resetSent ? (
              <div className="text-sm text-green-300 bg-green-900/40 border border-green-500/40 px-3 py-3 rounded">
                Anfrage wurde gesendet. Der Administrator wird Ihr Passwort zurücksetzen und Sie informieren.
              </div>
            ) : (
              <form onSubmit={handleResetRequest} className="space-y-4">
                {resetError && (
                  <div className="text-sm text-red-300 bg-red-900/40 border border-red-500/40 px-3 py-2 rounded">{resetError}</div>
                )}
                <div>
                  <label className="block text-sm font-medium text-light/80 mb-1">Ihr Benutzername</label>
                  <input
                    className="input w-full bg-white/10 border-white/20 text-light placeholder-white/30 focus:border-sky focus:ring-sky"
                    value={resetUser}
                    onChange={e => setResetUser(e.target.value)}
                    autoFocus required
                  />
                </div>
                <button type="submit" className="btn btn-primary w-full justify-center" disabled={resetLoading}>
                  {resetLoading ? '…' : 'Anfrage senden'}
                </button>
              </form>
            )}
            <div className="text-center">
              <button type="button" className="text-xs text-sky/60 hover:text-sky underline"
                onClick={() => setMode('login')}>
                Zurück zur Anmeldung
              </button>
            </div>
          </div>
        )}

        </div>
      </div>
    </div>
  )
}
