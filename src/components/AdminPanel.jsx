import React, { useState, useEffect } from 'react'
import { X, UserPlus, Users, Key, Eye, EyeOff, Loader, Trash2, Printer, Download, Pencil, Check, KeyRound } from 'lucide-react'
import { formatDate } from '../utils'

function apiHeaders() {
  const h = { 'Content-Type': 'application/json' }
  const token = localStorage.getItem('kp_session_token')
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

// ── CSV export ────────────────────────────────────────────────────────────────
function exportCsv(users) {
  const BOM = '﻿'
  const rows = [
    ['Benutzername', 'Anzeigename', 'Rolle', 'Passwort', 'Angelegt am', 'Letzter Login'],
    ...users.map(u => [
      u.username,
      u.display_name || '',
      u.role,
      u.password_note || '',
      u.created_at ? formatDate(u.created_at.slice(0, 10)) : '',
      u.last_login  ? formatDate(u.last_login.slice(0, 10))  : '-',
    ]),
  ]
  const csv = BOM + rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), { href: url, download: 'Benutzerliste.csv' })
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
}

// ── PDF print ─────────────────────────────────────────────────────────────────
function printUsers(users) {
  const rows = users.map((u, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${u.username}</td>
      <td>${u.display_name || '-'}</td>
      <td>${u.role === 'admin' ? 'Administrator' : 'Benutzer'}</td>
      <td class="pw">${u.password_note || '-'}</td>
      <td>${u.created_at ? formatDate(u.created_at.slice(0, 10)) : '-'}</td>
      <td>${u.last_login  ? formatDate(u.last_login.slice(0, 10))  : '-'}</td>
    </tr>`).join('')

  const html = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8">
    <title>Benutzerliste</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 11pt; margin: 20mm; }
      h1   { font-size: 14pt; margin-bottom: 4px; }
      p    { font-size: 9pt; color: #666; margin: 0 0 12px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #ccc; padding: 5px 8px; text-align: left; font-size: 10pt; }
      th { background: #1B2259; color: white; }
      tr:nth-child(even) td { background: #f5f5f5; }
      .pw { font-family: monospace; }
    </style></head><body>
    <h1>Benutzerliste – Komplizen Protokolle</h1>
    <p>Erstellt am ${new Date().toLocaleDateString('de-DE')} &nbsp;|&nbsp; Vertraulich – nur für den Administrator</p>
    <table>
      <thead><tr>
        <th>Nr</th><th>Benutzername</th><th>Anzeigename</th><th>Rolle</th>
        <th>Passwort</th><th>Angelegt</th><th>Letzter Login</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </body></html>`

  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;width:0;height:0;border:none;'
  document.body.appendChild(iframe)
  iframe.contentDocument.open()
  iframe.contentDocument.write(html)
  iframe.contentDocument.close()
  iframe.contentWindow.focus()
  iframe.contentWindow.print()
  setTimeout(() => document.body.removeChild(iframe), 2000)
}

// ── User list + create ────────────────────────────────────────────────────────
function UsersTab({ serverUser }) {
  const [users,       setUsers]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const [showForm,    setShowForm]    = useState(false)
  const [form,        setForm]        = useState({ username: '', displayName: '', password: '', role: 'user' })
  const [creating,    setCreating]    = useState(false)
  const [createError, setCreateError] = useState(null)
  const [deleting,    setDeleting]    = useState(null)
  const [showPw,       setShowPw]       = useState({})   // username → bool
  const [editingPw,    setEditingPw]    = useState(null) // username currently editing note
  const [pwDraft,      setPwDraft]      = useState('')
  const [requests,     setRequests]     = useState([])
  const [resolvingPw,  setResolvingPw]  = useState({})  // username → new pw draft
  const [resolving,    setResolving]    = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const [uRes, rRes] = await Promise.all([
        fetch('/api/auth/users',         { headers: apiHeaders() }),
        fetch('/api/auth/reset-requests',{ headers: apiHeaders() }),
      ])
      if (uRes.ok) setUsers(await uRes.json())
      if (rRes.ok) setRequests(await rRes.json())
    } finally { setLoading(false) }
  }

  async function handleResolve(username) {
    const newPw = resolvingPw[username] || ''
    if (newPw.length < 8) return
    setResolving(username)
    try {
      const res = await fetch(`/api/auth/reset-requests/${username}/resolve`, {
        method: 'POST', headers: apiHeaders(), body: JSON.stringify({ newPassword: newPw }),
      })
      if (res.ok) { await load(); setResolvingPw(p => { const n = { ...p }; delete n[username]; return n }) }
    } finally { setResolving(null) }
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

  async function savePwNote(username) {
    await fetch(`/api/auth/users/${username}/password-note`, {
      method: 'PUT', headers: apiHeaders(), body: JSON.stringify({ note: pwDraft }),
    })
    setEditingPw(null)
    setUsers(prev => prev.map(u => u.username === username ? { ...u, password_note: pwDraft } : u))
  }

  const startEditPw = (u) => { setEditingPw(u.username); setPwDraft(u.password_note || '') }
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <div className="space-y-4">
      {serverUser?.devMode && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 text-sm">
          <strong>Offener Modus aktiv.</strong>{' '}
          Legen Sie einen Admin-Benutzer an, um die Anmeldung zu aktivieren.
        </div>
      )}

      {/* Export buttons */}
      {!loading && users.length > 0 && (
        <div className="flex gap-2 justify-end">
          <button className="btn btn-secondary text-xs" onClick={() => printUsers(users)}>
            <Printer size={13} /> PDF drucken
          </button>
          <button className="btn btn-secondary text-xs" onClick={() => exportCsv(users)}>
            <Download size={13} /> CSV exportieren
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8 text-gray-400">
          <Loader size={18} className="animate-spin" />
        </div>
      ) : (
        <div className="border border-gray-200 divide-y divide-gray-100">
          {users.map(u => (
            <div key={u.username} className="px-4 py-3 space-y-1">
              <div className="flex items-center justify-between">
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

              {/* Password note row */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-16 shrink-0">Passwort:</span>
                {editingPw === u.username ? (
                  <>
                    <input
                      className="input text-xs flex-1 font-mono"
                      value={pwDraft}
                      onChange={e => setPwDraft(e.target.value)}
                      autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') savePwNote(u.username); if (e.key === 'Escape') setEditingPw(null) }}
                    />
                    <button className="btn-ghost p-1 text-green-600" onClick={() => savePwNote(u.username)}><Check size={13} /></button>
                    <button className="btn-ghost p-1 text-gray-400" onClick={() => setEditingPw(null)}><X size={13} /></button>
                  </>
                ) : (
                  <>
                    <span className="text-xs font-mono text-gray-700 flex-1">
                      {u.password_note
                        ? (showPw[u.username] ? u.password_note : '••••••••')
                        : <span className="text-gray-300 italic">–</span>}
                    </span>
                    {u.password_note && (
                      <button className="btn-ghost p-1 text-gray-400" onClick={() => setShowPw(p => ({ ...p, [u.username]: !p[u.username] }))}>
                        {showPw[u.username] ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    )}
                    <button className="btn-ghost p-1 text-gray-400 hover:text-brand-600" title="Passwort bearbeiten" onClick={() => startEditPw(u)}>
                      <Pencil size={13} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
          {users.length === 0 && (
            <div className="text-sm text-gray-400 text-center py-6">Noch keine Benutzer angelegt.</div>
          )}
        </div>
      )}

      {/* Reset requests */}
      {requests.length > 0 && (
        <div className="border border-amber-200 bg-amber-50 p-3 space-y-2">
          <div className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
            <KeyRound size={13} /> Offene Passwort-Anfragen ({requests.length})
          </div>
          {requests.map(r => (
            <div key={r.username} className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-gray-800 w-28 shrink-0">{r.username}</span>
              <input
                className="input text-sm font-mono flex-1 min-w-32"
                placeholder="Neues Passwort (min. 8 Zeichen)"
                value={resolvingPw[r.username] || ''}
                onChange={e => setResolvingPw(p => ({ ...p, [r.username]: e.target.value }))}
              />
              <button
                className="btn btn-primary text-xs"
                disabled={!resolvingPw[r.username] || resolvingPw[r.username].length < 8 || resolving === r.username}
                onClick={() => handleResolve(r.username)}
              >
                {resolving === r.username ? '…' : 'Zurücksetzen'}
              </button>
            </div>
          ))}
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
              <input type="text" className="input w-full text-sm font-mono" required minLength={8}
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
          <div className="text-xs text-gray-400">Das Passwort wird automatisch in der Benutzerliste gespeichert.</div>
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
    isAdmin              && { id: 'users',    label: 'Benutzer',  icon: <Users size={14} /> },
    !serverUser?.devMode && { id: 'password', label: 'Passwort',  icon: <Key size={14} /> },
  ].filter(Boolean)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white w-full max-w-lg max-h-[90vh] flex flex-col border border-gray-200">
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
