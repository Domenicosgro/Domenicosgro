import React, { useState, useEffect, useRef } from 'react'
import { X, UserPlus, Users, Key, Eye, EyeOff, Loader, Trash2, Printer, Download, Pencil, Check, KeyRound, HardDrive, Upload, Mail, Send, Settings2, Search } from 'lucide-react'
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
  const [form,        setForm]        = useState({ username: '', displayName: '', password: '', role: 'user', email: '' })
  const [creating,    setCreating]    = useState(false)
  const [createError, setCreateError] = useState(null)
  const [deleting,    setDeleting]    = useState(null)
  const [showPw,       setShowPw]       = useState({})   // username → bool
  const [editingPw,    setEditingPw]    = useState(null) // username currently editing note
  const [pwDraft,      setPwDraft]      = useState('')
  const [requests,     setRequests]     = useState([])
  const [resolvingPw,  setResolvingPw]  = useState({})  // username → new pw draft
  const [resolving,    setResolving]    = useState(null)
  const [confirmDel,     setConfirmDel]     = useState(null)
  const [deleteError,    setDeleteError]    = useState(null)
  const [resetPw,        setResetPw]        = useState({})
  const [resettingLogin, setResettingLogin] = useState(null)
  const [editingEmail,   setEditingEmail]   = useState(null)
  const [emailDraft,     setEmailDraft]     = useState('')
  const [inviting,       setInviting]       = useState(null)
  const [inviteMsg,      setInviteMsg]      = useState({})   // username → {ok,text}
  const [showPicker,     setShowPicker]     = useState(false)
  const [contacts,       setContacts]       = useState([])
  const [contactSearch,  setContactSearch]  = useState('')
  const [smtpOk,         setSmtpOk]         = useState(null) // null=unknown, true, false

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
    setDeleteError(null)
    setDeleting(username)
    try {
      const res  = await fetch(`/api/auth/users/${encodeURIComponent(username)}`, { method: 'DELETE', headers: apiHeaders() })
      const data = await res.json()
      if (!res.ok) { setDeleteError(data.error || 'Löschen fehlgeschlagen.'); return }
      setConfirmDel(null)
      await load()
    } catch { setDeleteError('Netzwerkfehler.') }
    finally { setDeleting(null) }
  }

  async function handleResetLoginPw(username) {
    const pw = resetPw[username] || ''
    if (pw.length < 8) return
    setResettingLogin(username)
    try {
      const res = await fetch(`/api/auth/users/${encodeURIComponent(username)}/password`, {
        method: 'POST', headers: apiHeaders(),
        body: JSON.stringify({ newPassword: pw }),
      })
      if (res.ok) {
        // Also update the password note
        await fetch(`/api/auth/users/${encodeURIComponent(username)}/password-note`, {
          method: 'PUT', headers: apiHeaders(), body: JSON.stringify({ note: pw }),
        })
        setResetPw(p => { const n = { ...p }; delete n[username]; return n })
        setUsers(prev => prev.map(u => u.username === username ? { ...u, password_note: pw } : u))
      }
    } finally { setResettingLogin(null) }
  }

  async function saveEmail(username) {
    await fetch(`/api/auth/users/${encodeURIComponent(username)}/email`, {
      method: 'PUT', headers: apiHeaders(), body: JSON.stringify({ email: emailDraft }),
    })
    setEditingEmail(null)
    setUsers(prev => prev.map(u => u.username === username ? { ...u, email: emailDraft } : u))
  }

  async function handleInvite(username) {
    setInviting(username); setInviteMsg(p => ({ ...p, [username]: null }))
    try {
      const res  = await fetch(`/api/auth/users/${encodeURIComponent(username)}/invite`, { method: 'POST', headers: apiHeaders() })
      const data = await res.json()
      setInviteMsg(p => ({ ...p, [username]: { ok: res.ok, text: res.ok ? 'Einladung gesendet.' : data.error } }))
    } catch { setInviteMsg(p => ({ ...p, [username]: { ok: false, text: 'Netzwerkfehler.' } })) }
    finally { setInviting(null) }
  }

  async function loadContacts() {
    const res = await fetch('/api/admin/contacts', { headers: apiHeaders() })
    if (res.ok) setContacts(await res.json())
  }

  function openPicker() { loadContacts(); setShowPicker(true); setContactSearch('') }

  function pickContact(c) {
    setForm(f => ({
      ...f,
      displayName: f.displayName || c.name || '',
      email:       f.email       || c.email || '',
      username:    f.username    || (c.name ? c.name.split(' ')[0].toLowerCase() : ''),
    }))
    setShowPicker(false)
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
        {deleteError && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2">{deleteError}</div>
        )}
        <div className="border border-gray-200 divide-y divide-gray-100">
          {users.map(u => (
            <div key={u.username} className="px-4 py-3 space-y-2">
              {/* Name + role + delete */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-gray-900">{u.display_name || u.username}</div>
                  <div className="text-xs text-gray-500">{u.username}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`badge ${u.role === 'admin' ? 'badge-blue' : 'badge-gray'}`}>{u.role}</span>
                  {u.username !== serverUser?.username && (
                    confirmDel === u.username ? (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-red-600">Wirklich?</span>
                        <button className="btn btn-danger text-xs py-0.5 px-2"
                          disabled={deleting === u.username}
                          onClick={() => handleDelete(u.username)}>
                          {deleting === u.username ? <Loader size={11} className="animate-spin" /> : 'Ja'}
                        </button>
                        <button className="btn btn-secondary text-xs py-0.5 px-2"
                          onClick={() => { setConfirmDel(null); setDeleteError(null) }}>
                          Nein
                        </button>
                      </div>
                    ) : (
                      <button className="btn-ghost p-1 text-gray-400 hover:text-red-500"
                        title="Benutzer löschen"
                        onClick={() => { setConfirmDel(u.username); setDeleteError(null) }}>
                        <Trash2 size={13} />
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* Stored password note */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-20 shrink-0">Notiz PW:</span>
                {editingPw === u.username ? (
                  <>
                    <input className="input text-xs flex-1 font-mono" value={pwDraft}
                      onChange={e => setPwDraft(e.target.value)} autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') savePwNote(u.username); if (e.key === 'Escape') setEditingPw(null) }} />
                    <button className="btn-ghost p-1 text-green-600" onClick={() => savePwNote(u.username)}><Check size={13} /></button>
                    <button className="btn-ghost p-1 text-gray-400" onClick={() => setEditingPw(null)}><X size={13} /></button>
                  </>
                ) : (
                  <>
                    <span className="text-xs font-mono text-gray-700 flex-1">
                      {u.password_note ? (showPw[u.username] ? u.password_note : '••••••••') : <span className="text-gray-300 italic">–</span>}
                    </span>
                    {u.password_note && (
                      <button className="btn-ghost p-1 text-gray-400" onClick={() => setShowPw(p => ({ ...p, [u.username]: !p[u.username] }))}>
                        {showPw[u.username] ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    )}
                    <button className="btn-ghost p-1 text-gray-400 hover:text-brand-600" title="Notiz bearbeiten" onClick={() => startEditPw(u)}>
                      <Pencil size={13} />
                    </button>
                  </>
                )}
              </div>

              {/* Direct login-password reset */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-20 shrink-0">Login PW:</span>
                <input className="input text-xs flex-1 font-mono" placeholder="Neues Passwort setzen (min. 8)"
                  value={resetPw[u.username] || ''}
                  onChange={e => setResetPw(p => ({ ...p, [u.username]: e.target.value }))} />
                <button className="btn btn-secondary text-xs py-0.5"
                  disabled={!resetPw[u.username] || resetPw[u.username].length < 8 || resettingLogin === u.username}
                  onClick={() => handleResetLoginPw(u.username)}>
                  {resettingLogin === u.username ? <Loader size={11} className="animate-spin" /> : <Check size={13} />}
                </button>
              </div>

              {/* E-Mail + Einladung */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-20 shrink-0">E-Mail:</span>
                {editingEmail === u.username ? (
                  <>
                    <input type="email" className="input text-xs flex-1" value={emailDraft}
                      onChange={e => setEmailDraft(e.target.value)} autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') saveEmail(u.username); if (e.key === 'Escape') setEditingEmail(null) }} />
                    <button className="btn-ghost p-1 text-green-600" onClick={() => saveEmail(u.username)}><Check size={13} /></button>
                    <button className="btn-ghost p-1 text-gray-400" onClick={() => setEditingEmail(null)}><X size={13} /></button>
                  </>
                ) : (
                  <>
                    <span className="text-xs text-gray-700 flex-1 truncate">{u.email || <span className="text-gray-300 italic">–</span>}</span>
                    <button className="btn-ghost p-1 text-gray-400 hover:text-brand-600" title="E-Mail bearbeiten"
                      onClick={() => { setEditingEmail(u.username); setEmailDraft(u.email || '') }}>
                      <Pencil size={13} />
                    </button>
                    <button className="btn-ghost p-1 text-gray-400 hover:text-brand-600" title="Einladung senden"
                      disabled={!u.email || inviting === u.username}
                      onClick={() => handleInvite(u.username)}>
                      {inviting === u.username ? <Loader size={13} className="animate-spin" /> : <Send size={13} />}
                    </button>
                  </>
                )}
              </div>
              {inviteMsg[u.username] && (
                <div className={`text-xs px-2 py-1 ${inviteMsg[u.username].ok ? 'text-green-700' : 'text-red-600'}`}>
                  {inviteMsg[u.username].text}
                </div>
              )}
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
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-gray-700">Neuer Benutzer</div>
            <button type="button" className="btn btn-secondary text-xs" onClick={openPicker}>
              <Search size={12} /> Aus Kontakten
            </button>
          </div>
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
          <div>
            <label className="block text-xs text-gray-500 mb-1">E-Mail-Adresse</label>
            <input type="email" className="input w-full text-sm" value={form.email} onChange={set('email')} placeholder="einladung@beispiel.de" />
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

      {/* Contact picker modal */}
      {showPicker && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white w-full max-w-md max-h-[70vh] flex flex-col border border-gray-200">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <div className="text-sm font-semibold text-gray-900">Kontakt auswählen</div>
              <button className="btn-ghost p-1" onClick={() => setShowPicker(false)}><X size={14} /></button>
            </div>
            <div className="px-4 py-2 border-b border-gray-100">
              <input className="input w-full text-sm" placeholder="Suchen…" autoFocus
                value={contactSearch} onChange={e => setContactSearch(e.target.value)} />
            </div>
            <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
              {contacts
                .filter(c => {
                  const q = contactSearch.toLowerCase()
                  return !q || (c.name||'').toLowerCase().includes(q) || (c.email||'').toLowerCase().includes(q) || (c.company||'').toLowerCase().includes(q)
                })
                .map((c, i) => (
                  <button key={i} className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center justify-between gap-4"
                    onClick={() => pickContact(c)}>
                    <div>
                      <div className="text-sm font-medium text-gray-900">{c.name || '–'}</div>
                      <div className="text-xs text-gray-500">{[c.company, c.projectName].filter(Boolean).join(' · ')}</div>
                    </div>
                    <div className="text-xs text-gray-400 shrink-0">{c.email || ''}</div>
                  </button>
                ))}
              {contacts.length === 0 && (
                <div className="text-sm text-gray-400 text-center py-8">Keine Kontakte mit Namen oder E-Mail gefunden.</div>
              )}
            </div>
          </div>
        </div>
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

// ── SMTP tab ──────────────────────────────────────────────────────────────────
function SmtpTab() {
  const [status,  setStatus]  = useState(null)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    fetch('/api/admin/smtp-status', { headers: apiHeaders() })
      .then(r => r.json()).then(setStatus).catch(() => {})
  }, [])

  async function handleTest() {
    setTesting(true)
    try {
      const res  = await fetch('/api/admin/smtp-test', { method: 'POST', headers: apiHeaders() })
      const data = await res.json()
      setStatus(prev => ({ ...prev, testOk: res.ok, testMsg: res.ok ? 'Verbindung erfolgreich.' : data.error }))
    } finally { setTesting(false) }
  }

  return (
    <div className="space-y-4 text-sm">
      <p className="text-gray-600">
        Für den E-Mail-Versand muss der Docker-Container mit SMTP-Umgebungsvariablen gestartet werden.
      </p>
      <div className="border border-gray-200 p-4 bg-gray-50 space-y-2 font-mono text-xs">
        <div className="text-gray-500 mb-2">In start-local.ps1 ergänzen:</div>
        <div><span className="text-brand-700">-e</span> SMTP_HOST=mail.example.com <span className="text-gray-400"># SMTP-Server</span></div>
        <div><span className="text-brand-700">-e</span> SMTP_PORT=587             <span className="text-gray-400"># Port (587=STARTTLS, 465=SSL)</span></div>
        <div><span className="text-brand-700">-e</span> SMTP_USER=user@example.com</div>
        <div><span className="text-brand-700">-e</span> SMTP_PASS=passwort</div>
        <div><span className="text-brand-700">-e</span> SMTP_FROM=noreply@example.com</div>
        <div><span className="text-brand-700">-e</span> SMTP_SECURE=false         <span className="text-gray-400"># true nur für Port 465</span></div>
      </div>

      <div className={`flex items-center gap-2 px-3 py-2 border text-sm ${status?.configured ? 'border-green-200 bg-green-50 text-green-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
        <Mail size={14} />
        {status?.configured ? `SMTP konfiguriert: ${status.host}` : 'SMTP nicht konfiguriert – Einladungen können nicht gesendet werden.'}
      </div>

      {status?.configured && (
        <div className="space-y-2">
          <button className="btn btn-secondary" onClick={handleTest} disabled={testing}>
            {testing ? <Loader size={13} className="animate-spin" /> : <Send size={13} />}
            {testing ? 'Teste…' : 'Verbindung testen'}
          </button>
          {status.testMsg && (
            <div className={`text-xs px-3 py-2 border ${status.testOk ? 'text-green-700 bg-green-50 border-green-200' : 'text-red-600 bg-red-50 border-red-200'}`}>
              {status.testMsg}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Backup tab ────────────────────────────────────────────────────────────────
function BackupTab() {
  const [backups,    setBackups]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [restoring,  setRestoring]  = useState(false)
  const [msg,        setMsg]        = useState(null)  // { type: 'ok'|'err', text }
  const fileRef = useRef(null)

  useEffect(() => { loadList() }, [])

  async function loadList() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/backups', { headers: apiHeaders() })
      if (res.ok) setBackups(await res.json())
    } finally { setLoading(false) }
  }

  async function handleBackupNow() {
    setSaving(true); setMsg(null)
    try {
      const res  = await fetch('/api/admin/backup', { method: 'POST', headers: apiHeaders() })
      const data = await res.json()
      if (!res.ok) { setMsg({ type: 'err', text: data.error }); return }
      setMsg({ type: 'ok', text: `Gesichert: ${data.filename}` })
      await loadList()
    } catch { setMsg({ type: 'err', text: 'Netzwerkfehler.' }) }
    finally { setSaving(false) }
  }

  async function handleRestore(file) {
    if (!window.confirm(`Alle aktuellen Daten werden durch das Backup ersetzt.\nFortfahren?`)) return
    setRestoring(true); setMsg(null)
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      if (!data.protocols || !data.projects) { setMsg({ type: 'err', text: 'Ungültiges Backup-Format.' }); return }
      const res = await fetch('/api/admin/restore', {
        method: 'POST', headers: apiHeaders(), body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) { setMsg({ type: 'err', text: json.error }); return }
      setMsg({ type: 'ok', text: `Wiederhergestellt: ${data.protocols.length} Protokolle, ${data.projects.length} Projekte. Seite bitte neu laden.` })
    } catch { setMsg({ type: 'err', text: 'Datei konnte nicht gelesen werden.' }) }
    finally { setRestoring(false) }
  }

  function fmtSize(bytes) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  function fmtFilename(f) {
    // backup_2026-05-27T12-30-00.json → 27.05.2026, 12:30
    const m = f.match(/backup_(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})/)
    if (!m) return f
    return `${m[3]}.${m[2]}.${m[1]}  ${m[4]}:${m[5]} Uhr`
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Backups werden automatisch beim Start und alle 6 Stunden erstellt.<br />
        Gespeichert in: <code className="text-xs bg-gray-100 px-1">C:\KomplizDaten\data\backups\</code>
      </p>

      {msg && (
        <div className={`text-sm px-3 py-2 border ${msg.type === 'ok' ? 'text-green-700 bg-green-50 border-green-200' : 'text-red-700 bg-red-50 border-red-200'}`}>
          {msg.text}
        </div>
      )}

      <div className="flex gap-2">
        <button className="btn btn-primary text-sm" onClick={handleBackupNow} disabled={saving}>
          <HardDrive size={14} /> {saving ? 'Wird gesichert…' : 'Jetzt sichern'}
        </button>
        <button className="btn btn-secondary text-sm" onClick={() => fileRef.current?.click()} disabled={restoring}>
          <Upload size={14} /> {restoring ? 'Wird wiederhergestellt…' : 'Backup einspielen'}
        </button>
        <input ref={fileRef} type="file" accept=".json" className="hidden"
          onChange={e => { if (e.target.files[0]) handleRestore(e.target.files[0]); e.target.value = '' }} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6 text-gray-400"><Loader size={16} className="animate-spin" /></div>
      ) : (
        <div className="border border-gray-200 divide-y divide-gray-100">
          {backups.map(b => (
            <div key={b.filename} className="flex items-center justify-between px-4 py-2.5">
              <div>
                <div className="text-sm text-gray-800">{fmtFilename(b.filename)}</div>
                <div className="text-xs text-gray-400">{fmtSize(b.size)}</div>
              </div>
              <a className="btn btn-secondary text-xs"
                href={`/api/admin/backups/${b.filename}`}
                download={b.filename}>
                <Download size={12} /> Herunterladen
              </a>
            </div>
          ))}
          {backups.length === 0 && (
            <div className="text-sm text-gray-400 text-center py-6">Noch keine Backups vorhanden.</div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AdminPanel({ serverUser, onClose }) {
  const isAdmin = serverUser?.role === 'admin' || serverUser?.devMode
  const [tab, setTab] = useState(isAdmin ? 'users' : 'password')

  const tabs = [
    isAdmin              && { id: 'users',    label: 'Benutzer',  icon: <Users size={14} /> },
    isAdmin              && { id: 'smtp',     label: 'E-Mail',    icon: <Mail size={14} /> },
    isAdmin              && { id: 'backup',   label: 'Backup',    icon: <HardDrive size={14} /> },
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
          {tab === 'smtp'     && <SmtpTab />}
          {tab === 'backup'   && <BackupTab />}
          {tab === 'password' && <PasswordTab serverUser={serverUser} />}
        </div>
      </div>
    </div>
  )
}
