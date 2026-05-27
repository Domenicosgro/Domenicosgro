import React, { useState, useEffect } from 'react'
import { X, UserPlus, Users, Key, Eye, EyeOff, Loader, Trash2 } from 'lucide-react'

function apiHeaders() {
  const h = { 'Content-Type': 'application/json' }
  const token = localStorage.getItem('kp_session_token')
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

// ── User list + create ────────────────────────────────────────────────────────
function UsersTab({ serverUser }) {
  const [users,          setUsers]          = useState([])
  const [loading,        setLoading]        = useState(true)
  const [showForm,       setShowForm]       = useState(false)
  const [form,           setForm]           = useState({ username: '', displayName: '', password: '', role: 'user' })
  const [creating,       setCreating]       = useState(false)
  const [createError,    setCreateError]    = useState(null)
  const [deleting,       setDeleting]       = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/auth/users', { headers: apiHeaders() })
      if (res.ok) setUsers(await res.json())
    } finally { setLoading(false) }
  }

  async function handleCreate(e) {
    e.preventDefault()
    setCreateError(null)
    setCreating(true)
    try {
      const res  = await fetch('/api/auth/users', { method: 'POST', headers: apiHeaders(), body: JSON.stringify(form) })
      const data = await res.json()
      if (!res.ok) { setCreateError(data.error); return }
      setForm({ username: '', displayName: '', password: '', role: 'user' })
      setShowForm(false)
      await load()
    } catch { setCreateError('Netzwerkfehler.') }
    finally { setCreating(false) }
  }

  async function handleDelete(username) {
    if (!window.confirm(`Benutzer "${username}" wirklich löschen?`)) return
    setDeleting(username)
    try {
      await fetch(`/api/auth/users/${username}`, { method: 'DELETE', headers: apiHeaders() })
      await load()
    } finally { setDeleting(null) }
  }

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <div className="space-y-4">
      {serverUser?.devMode && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 text-sm">
          <strong>Offener Modus aktiv.</strong>{' '}
          Legen Sie einen Admin-Benutzer an, um die Anmeldung zu aktivieren.
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8 text-gray-400">
          <Loader size={18} className="animate-spin" />
        </div>
      ) : (
        <div className="border border-gray-200 divide-y divide-gray-100">
          {users.map(u => (
            <div key={u.username} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-sm font-medium text-gray-900">{u.display_name || u.username}</div>
                <div className="text-xs text-gray-500">{u.username}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`badge ${u.role === 'admin' ? 'badge-blue' : 'badge-gray'}`}>{u.role}</span>
                {u.username !== serverUser?.username && (
                  <button
                    className="btn-ghost p-1 text-gray-400 hover:text-red-500"
                    title="Benutzer löschen"
                    disabled={deleting === u.username}
                    onClick={() => handleDelete(u.username)}
                  >
                    {deleting === u.username ? <Loader size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  </button>
                )}
              </div>
            </div>
          ))}
          {users.length === 0 && (
            <div className="text-sm text-gray-400 text-center py-6">Noch keine Benutzer angelegt.</div>
          )}
        </div>
      )}

      {!showForm ? (
        <button className="btn btn-secondary w-full" onClick={() => setShowForm(true)}>
          <UserPlus size={14} /> Benutzer anlegen
        </button>
      ) : (
        <form onSubmit={handleCreate} className="border border-gray-200 p-4 space-y-3 bg-gray-50">
          <div className="text-sm font-medium text-gray-700">Neuer Benutzer</div>
          {createError && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2">{createError}</div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Benutzername *</label>
              <input className="input w-full text-sm" required value={form.username} onChange={set('username')} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Anzeigename</label>
              <input className="input w-full text-sm" value={form.displayName} onChange={set('displayName')} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Passwort * (min. 8 Zeichen)</label>
              <input type="password" className="input w-full text-sm" required minLength={8}
                value={form.password} onChange={set('password')} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Rolle</label>
              <select className="input w-full text-sm" value={form.role} onChange={set('role')}>
                <option value="user">Benutzer</option>
                <option value="admin">Administrator</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" className="btn btn-secondary text-sm"
              onClick={() => { setShowForm(false); setCreateError(null) }}>
              Abbrechen
            </button>
            <button type="submit" className="btn btn-primary text-sm" disabled={creating}>
              {creating ? '…' : 'Anlegen'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

// ── Change own password ───────────────────────────────────────────────────────
function PasswordTab({ serverUser }) {
  const [form,    setForm]    = useState({ current: '', next: '', next2: '' })
  const [error,   setError]   = useState(null)
  const [success, setSuccess] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [showPw,  setShowPw]  = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    if (form.next !== form.next2) { setError('Passwörter stimmen nicht überein.'); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/auth/users/${serverUser.username}/password`, {
        method: 'POST', headers: apiHeaders(),
        body: JSON.stringify({ currentPassword: form.current, newPassword: form.next }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setForm({ current: '', next: '', next2: '' })
      setSuccess(true)
    } catch { setError('Netzwerkfehler.') }
    finally { setSaving(false) }
  }

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const inputType = showPw ? 'text' : 'password'

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Passwort für <strong>{serverUser?.displayName || serverUser?.username}</strong> ändern.
      </p>
      {success && (
        <div className="text-sm text-green-700 bg-green-50 border border-green-200 px-3 py-2">
          Passwort erfolgreich geändert.
        </div>
      )}
      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2">{error}</div>
      )}
      <form onSubmit={handleSubmit} className="space-y-3">
        {['current', 'next', 'next2'].map((k, i) => (
          <div key={k}>
            <label className="block text-xs text-gray-500 mb-1">
              {k === 'current' ? 'Aktuelles Passwort' : k === 'next' ? 'Neues Passwort (min. 8 Zeichen)' : 'Neues Passwort wiederholen'}
            </label>
            <div className="relative">
              <input
                type={inputType}
                className="input w-full pr-9"
                required
                minLength={k !== 'current' ? 8 : undefined}
                autoFocus={i === 0}
                value={form[k]}
                onChange={set(k)}
              />
              {i === 0 && (
                <button type="button" tabIndex={-1}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setShowPw(v => !v)}>
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              )}
            </div>
          </div>
        ))}
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? '…' : 'Passwort ändern'}
        </button>
      </form>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AdminPanel({ serverUser, onClose }) {
  const isAdmin = serverUser?.role === 'admin' || serverUser?.devMode
  const [tab, setTab] = useState(isAdmin ? 'users' : 'password')

  const tabs = [
    isAdmin                  && { id: 'users',    label: 'Benutzer',  icon: <Users size={14} /> },
    !serverUser?.devMode     && { id: 'password', label: 'Passwort',  icon: <Key size={14} /> },
  ].filter(Boolean)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white w-full max-w-lg max-h-[85vh] flex flex-col border border-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Server-Einstellungen</h2>
          <button className="btn-ghost p-1" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Tabs */}
        {tabs.length > 1 && (
          <div className="flex border-b border-gray-200">
            {tabs.map(t => (
              <button key={t.id}
                className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px flex items-center gap-1.5 ${
                  tab === t.id
                    ? 'border-brand-600 text-brand-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
                onClick={() => setTab(t.id)}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="overflow-y-auto flex-1 p-5">
          {tab === 'users'    && <UsersTab    serverUser={serverUser} />}
          {tab === 'password' && <PasswordTab serverUser={serverUser} />}
        </div>
      </div>
    </div>
  )
}
