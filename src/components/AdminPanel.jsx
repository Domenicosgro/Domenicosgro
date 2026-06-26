import React, { useState, useEffect, useRef } from 'react'
import { X, UserPlus, Users, Key, Eye, EyeOff, Loader, Trash2, Printer, Download, Pencil, Check, KeyRound, HardDrive, Upload, Mail, Send, Settings2, Search, AlertTriangle, Shield, ShieldOff, LogOut, Activity, RefreshCw, UserCheck, CheckSquare, Square } from 'lucide-react'
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
    ['Benutzername', 'Anzeigename', 'Rolle', 'E-Mail', 'Passwort', 'Angelegt am', 'Letzter Login'],
    ...users.map(u => [
      u.username,
      u.display_name || '',
      u.role,
      u.email || '',
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

// Exportiert Benutzer im Kontakt-Format (Name;Firma;Gewerk;Funktion;E-Mail;Telefon)
// → kann direkt in der Projektkontaktverwaltung importiert werden
function exportUsersAsContacts(users) {
  const BOM = '﻿'
  const SEP = ';'
  const wrap = (v) => {
    const s = String(v ?? '')
    return (s.includes(SEP) || s.includes('"') || s.includes('\n'))
      ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [
    ['Name', 'Firma', 'Gewerk', 'Funktion', 'E-Mail', 'Telefon'].map(wrap).join(SEP),
    ...users.map(u => [
      u.display_name || u.username,
      '',
      '',
      u.role === 'admin' ? 'Administrator' : 'Benutzer',
      u.email || '',
      '',
    ].map(wrap).join(SEP)),
  ]
  const csv  = BOM + lines.join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), { href: url, download: 'Benutzer_als_Kontakte.csv' })
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
  const [togglingRole,   setTogglingRole]   = useState(null) // username being toggled

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

  async function handleToggleRole(u) {
    const newRole = u.role === 'admin' ? 'user' : 'admin'
    setTogglingRole(u.username)
    try {
      const res = await fetch(`/api/auth/users/${encodeURIComponent(u.username)}/role`, {
        method: 'PUT', headers: apiHeaders(), body: JSON.stringify({ role: newRole }),
      })
      if (res.ok) setUsers(prev => prev.map(x => x.username === u.username ? { ...x, role: newRole } : x))
    } finally { setTogglingRole(null) }
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
        <div className="flex gap-2 justify-end flex-wrap">
          <button className="btn btn-secondary text-xs" onClick={() => printUsers(users)}>
            <Printer size={13} /> PDF drucken
          </button>
          <button className="btn btn-secondary text-xs" onClick={() => exportCsv(users)}>
            <Download size={13} /> CSV exportieren
          </button>
          <button className="btn btn-secondary text-xs" onClick={() => exportUsersAsContacts(users)}
            title="Benutzer als Kontakt-CSV exportieren (importierbar in Projektkontakte)">
            <Download size={13} /> Als Kontakte exportieren
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8 text-gray-400">
          <Loader size={18} className="animate-spin" />
        </div>
      ) : (
        <>
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
                  {u.source === 'synology' && (
                    <span className="badge badge-blue text-xs" title="Synology-Benutzer – Passwort wird über DSM verwaltet">Synology</span>
                  )}
                  {/* Rolle – klickbar zum Umschalten (nicht für eigenen Account) */}
                  {u.username !== serverUser?.username ? (
                    <button
                      className={`badge text-xs flex items-center gap-1 cursor-pointer transition-opacity hover:opacity-70 ${u.role === 'admin' ? 'badge-blue' : 'badge-gray'}`}
                      title={u.role === 'admin' ? 'Zum normalen Nutzer herabstufen' : 'Zum Administrator ernennen'}
                      disabled={togglingRole === u.username}
                      onClick={() => handleToggleRole(u)}
                    >
                      {togglingRole === u.username
                        ? <Loader size={10} className="animate-spin" />
                        : u.role === 'admin' ? <Shield size={10} /> : <ShieldOff size={10} />
                      }
                      {u.role}
                    </button>
                  ) : (
                    <span className={`badge text-xs ${u.role === 'admin' ? 'badge-blue' : 'badge-gray'}`}>{u.role}</span>
                  )}
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

              {/* Stored password note + login PW reset (nur für lokale Nutzer) */}
              {u.source !== 'synology' ? (
                <>
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
                </>
              ) : (
                <p className="text-xs text-gray-400 italic">Passwort wird über Synology DSM verwaltet.</p>
              )}

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
        </>
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

  if (serverUser?.source === 'synology') {
    return (
      <div className="space-y-3 text-sm text-gray-600">
        <p>
          Du bist als <strong>{serverUser?.displayName || serverUser?.username}</strong> über <strong>Synology DSM</strong> angemeldet.
        </p>
        <p className="text-gray-500">
          Das Passwort wird in der Synology-Benutzerverwaltung verwaltet und kann hier nicht geändert werden.
          Bitte wende dich an den NAS-Administrator oder ändere das Passwort direkt in der DSM-Oberfläche.
        </p>
      </div>
    )
  }

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
        Empfohlener Versandweg ist <strong>Microsoft Graph (OAuth2)</strong> – ohne Passwort und ohne
        Konflikt mit den Microsoft-365-Sicherheitsstandards. Die Werte stammen aus einer in Entra
        registrierten App mit Anwendungsberechtigung <span className="font-mono">Mail.Send</span>.
      </p>
      <div className="border border-gray-200 p-4 bg-gray-50 space-y-2 font-mono text-xs">
        <div className="text-gray-500 mb-2">In docker-compose.yml (NAS) setzen:</div>
        <div><span className="text-brand-700">GRAPH_TENANT_ID</span>=… <span className="text-gray-400"># Verzeichnis-(Mandanten-)ID</span></div>
        <div><span className="text-brand-700">GRAPH_CLIENT_ID</span>=… <span className="text-gray-400"># Anwendungs-(Client-)ID</span></div>
        <div><span className="text-brand-700">GRAPH_CLIENT_SECRET</span>=… <span className="text-gray-400"># geheimer Clientschlüssel (Wert)</span></div>
        <div><span className="text-brand-700">GRAPH_SENDER</span>=Protokoll@…   <span className="text-gray-400"># Absender-Postfach</span></div>
        <div className="text-gray-400 pt-2">Fallback (nur ohne GRAPH_*): SMTP_HOST/PORT/USER/PASS/FROM</div>
      </div>

      <div className={`flex items-center gap-2 px-3 py-2 border text-sm ${status?.configured ? 'border-green-200 bg-green-50 text-green-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
        <Mail size={14} />
        {status?.configured
          ? `E-Mail konfiguriert (${status.mode === 'graph' ? 'Microsoft Graph' : 'SMTP'}): ${status.host}`
          : 'E-Mail-Versand nicht konfiguriert – Einladungen können nicht gesendet werden.'}
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

// ── Löschanfragen-Tab ─────────────────────────────────────────────────────────
function DeletionRequestsTab() {
  const [requests,     setRequests]     = useState([])
  const [loading,      setLoading]      = useState(true)
  const [actionLoading, setActionLoading] = useState(null)
  const [msg,          setMsg]          = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/deletion-requests', { headers: apiHeaders() })
      if (res.ok) setRequests(await res.json())
    } finally { setLoading(false) }
  }

  async function handleAction(id, action) {
    setActionLoading(id + action)
    setMsg(null)
    try {
      const res  = await fetch(`/api/admin/deletion-requests/${id}/${action}`, { method: 'POST', headers: apiHeaders() })
      const data = await res.json()
      if (!res.ok) { setMsg({ type: 'err', text: data.error }); return }
      setMsg({ type: 'ok', text: action === 'approve' ? 'Projekt gelöscht.' : 'Anfrage abgelehnt.' })
      await load()
    } catch { setMsg({ type: 'err', text: 'Netzwerkfehler.' }) }
    finally { setActionLoading(null) }
  }

  if (loading) return (
    <div className="flex justify-center py-8 text-gray-400">
      <Loader size={16} className="animate-spin" />
    </div>
  )

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Benutzer ohne Admin-Rechte können Projekte nicht direkt löschen. Hier erscheinen ihre Löschanfragen zur Genehmigung.
      </p>

      {msg && (
        <div className={`text-sm px-3 py-2 border ${msg.type === 'ok' ? 'text-green-700 bg-green-50 border-green-200' : 'text-red-700 bg-red-50 border-red-200'}`}>
          {msg.text}
        </div>
      )}

      {requests.length === 0 ? (
        <div className="text-sm text-gray-400 text-center py-8 border border-gray-100">
          Keine ausstehenden Löschanfragen.
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map(r => (
            <div key={r.id} className="border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{r.target_name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Angefragt von <strong>{r.requested_by_name}</strong> ·{' '}
                    {new Date(r.requested_at).toLocaleString('de-DE')}
                  </p>
                  {r.protocol_count > 0 && (
                    <p className="text-xs text-amber-700 mt-1">
                      {r.protocol_count} Protokoll{r.protocol_count !== 1 ? 'e werden' : ' wird'} vom Projekt getrennt, aber nicht gelöscht.
                    </p>
                  )}
                  <div className="flex gap-2 mt-3">
                    <button
                      className="btn-danger text-xs"
                      onClick={() => handleAction(r.id, 'approve')}
                      disabled={!!actionLoading}
                    >
                      {actionLoading === r.id + 'approve' ? <Loader size={12} className="animate-spin" /> : <Trash2 size={12} />}
                      Löschen genehmigen
                    </button>
                    <button
                      className="btn-secondary text-xs"
                      onClick={() => handleAction(r.id, 'reject')}
                      disabled={!!actionLoading}
                    >
                      {actionLoading === r.id + 'reject' ? <Loader size={12} className="animate-spin" /> : null}
                      Ablehnen
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Active sessions tab ───────────────────────────────────────────────────────
function SessionsTab({ serverUser }) {
  const [sessions, setSessions] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [kicking,  setKicking]  = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/sessions', { headers: apiHeaders() })
      if (res.ok) setSessions(await res.json())
    } finally { setLoading(false) }
  }

  async function handleKick(username) {
    setKicking(username)
    try {
      const res = await fetch(`/api/admin/sessions/${encodeURIComponent(username)}`, {
        method: 'DELETE', headers: apiHeaders(),
      })
      if (res.ok) setSessions(prev => prev.filter(s => s.username !== username))
    } finally { setKicking(null) }
  }

  // Group by username: show one row per user with the latest session
  const byUser = Object.values(
    sessions.reduce((acc, s) => {
      if (!acc[s.username] || s.created_at > acc[s.username].created_at) acc[s.username] = s
      return acc
    }, {})
  ).sort((a, b) => b.created_at.localeCompare(a.created_at))

  function fmtTime(iso) {
    if (!iso) return '–'
    const d = new Date(iso + (iso.endsWith('Z') ? '' : 'Z'))
    return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  if (loading) return (
    <div className="flex justify-center py-8 text-gray-400"><Loader size={16} className="animate-spin" /></div>
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          {byUser.length === 0
            ? 'Keine aktiven Sitzungen.'
            : `${byUser.length} aktive Sitzung${byUser.length !== 1 ? 'en' : ''}`}
        </p>
        <button className="btn btn-secondary text-xs" onClick={load}>Aktualisieren</button>
      </div>

      {byUser.length > 0 && (
        <div className="border border-gray-200 divide-y divide-gray-100">
          {byUser.map(s => {
            const isSelf = s.username === serverUser?.username
            return (
              <div key={s.username} className={`flex items-center justify-between px-4 py-3 gap-3 ${isSelf ? 'bg-brand-50/50' : ''}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {s.display_name || s.username}
                    </span>
                    <span className="text-xs text-gray-400">{s.username}</span>
                    {isSelf && <span className="badge badge-green text-xs">Du</span>}
                    <span className={`badge text-xs ${s.role === 'admin' ? 'badge-blue' : 'badge-gray'}`}>{s.role || 'user'}</span>
                    {s.source === 'synology' && <span className="badge badge-blue text-xs">Synology</span>}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    Angemeldet: {fmtTime(s.created_at)} · Gültig bis: {fmtTime(s.expires_at)}
                  </div>
                </div>
                {!isSelf && (
                  <button
                    className="btn btn-secondary text-xs flex items-center gap-1 shrink-0 hover:border-red-300 hover:text-red-600"
                    title="Sitzung beenden (Nutzer wird ausgeloggt)"
                    disabled={kicking === s.username}
                    onClick={() => handleKick(s.username)}
                  >
                    {kicking === s.username ? <Loader size={11} className="animate-spin" /> : <LogOut size={11} />}
                    Abmelden
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Rollout tab: Synology-Nutzer importieren & einladen ──────────────────────
function RolloutTab() {
  const [creds,      setCreds]      = useState({ username: '', password: '' })
  const [loading,    setLoading]    = useState(false)
  const [loadErr,    setLoadErr]    = useState(null)
  const [synoUsers,  setSynoUsers]  = useState(null)   // null = noch nicht geladen
  const [selected,   setSelected]   = useState(new Set())
  const [emailMap,   setEmailMap]   = useState({})
  const [importing,  setImporting]  = useState(false)
  const [results,    setResults]    = useState(null)
  const [smtpOk,     setSmtpOk]    = useState(null)
  const [synoConfig, setSynoConfig] = useState(null)   // { configured, url }

  useEffect(() => {
    fetch('/api/admin/smtp-status',    { headers: apiHeaders() })
      .then(r => r.json()).then(d => setSmtpOk(d.configured)).catch(() => setSmtpOk(false))
    fetch('/api/admin/synology-status', { headers: apiHeaders() })
      .then(async r => { if (r.ok) setSynoConfig(await r.json()) })
      .catch(() => {})
  }, [])

  async function handleLoad(e) {
    e.preventDefault()
    setLoadErr(null); setLoading(true); setSynoUsers(null); setResults(null)
    try {
      const res  = await fetch('/api/admin/synology-list', {
        method: 'POST', headers: apiHeaders(),
        body: JSON.stringify({ username: creds.username, password: creds.password }),
      })
      const data = await res.json()
      if (!res.ok) { setLoadErr(data.error); return }
      setSynoUsers(data)
      setSelected(new Set(data.filter(u => !u.inSystem).map(u => u.username)))
      const emails = {}
      data.forEach(u => { if (u.email) emails[u.username] = u.email })
      setEmailMap(emails)
    } catch (e) { setLoadErr('Netzwerkfehler: ' + e.message) }
    finally { setLoading(false) }
  }

  function toggleUser(username) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(username) ? next.delete(username) : next.add(username)
      return next
    })
  }

  function selectAll()  { setSelected(new Set(synoUsers.map(u => u.username))) }
  function selectNone() { setSelected(new Set()) }
  function selectNew()  { setSelected(new Set(synoUsers.filter(u => !u.inSystem).map(u => u.username))) }

  async function handleImport() {
    setImporting(true); setResults(null)
    const list = [...selected].map(username => {
      const syno = synoUsers.find(u => u.username === username)
      const email = emailMap[username] || ''
      return { username, displayName: syno?.displayName || username, email, sendInvite: !!email }
    })
    try {
      const res  = await fetch('/api/admin/synology-bulk-invite', {
        method: 'POST', headers: apiHeaders(), body: JSON.stringify({ users: list }),
      })
      const data = await res.json()
      if (!res.ok) { setResults({ error: data.error }); return }
      setResults(data.results)
      setSynoUsers(prev => prev.map(u => ({
        ...u, inSystem: u.inSystem || selected.has(u.username),
      })))
      setSelected(new Set())
    } catch (e) { setResults({ error: e.message }) }
    finally { setImporting(false) }
  }

  const synoConfigured = !!window._synoConfigured   // not available, just check if loaded
  const newCount    = synoUsers ? synoUsers.filter(u => !u.inSystem).length : 0
  const selCount    = selected.size
  const inviteCount = [...selected].filter(u => emailMap[u]).length

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Alle Benutzer der Synology NAS auflisten und mit einem Klick im Tool anlegen. Einladungs-E-Mails werden
        an Benutzer gesendet, für die eine E-Mail-Adresse hinterlegt ist.
      </p>

      {synoConfig && !synoConfig.configured && (
        <div className="border border-red-200 bg-red-50 px-4 py-3 space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium text-red-700">
            <AlertTriangle size={14} className="shrink-0" /> SYNOLOGY_URL nicht konfiguriert
          </div>
          <p className="text-xs text-red-600">
            Damit Synology-Nutzer geladen werden können, muss <code className="font-mono bg-red-100 px-1">SYNOLOGY_URL</code> in der <code className="font-mono bg-red-100 px-1">docker-compose.yml</code> gesetzt sein und der Container neu erstellt werden.
          </p>
          <p className="text-xs text-gray-500 font-mono bg-red-50 border border-red-200 px-2 py-1 mt-1">
            SYNOLOGY_URL: "http://192.168.178.xxx:5000"
          </p>
          <p className="text-xs text-gray-500">
            Auf der Synology NAS ist dies bereits in <code className="font-mono">docker-compose.yml</code> eingetragen. Bitte nach der nächsten Neubereitstellung erneut versuchen.
          </p>
        </div>
      )}

      {smtpOk === false && (
        <div className="flex items-start gap-2 text-xs bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
          E-Mail-Versand nicht konfiguriert – Einladungen können nicht gesendet werden. Bitte zuerst im Tab „E-Mail" einrichten.
        </div>
      )}

      {/* Synology-Zugangsdaten */}
      <form onSubmit={handleLoad} className="border border-gray-200 bg-gray-50 p-4 space-y-3">
        <div className="text-xs font-semibold text-gray-700">Synology Admin-Zugangsdaten</div>
        <div className="text-xs text-gray-500">
          Wird nur für diesen Abruf verwendet – nicht gespeichert.
        </div>
        <div className="flex gap-2">
          <input className="input text-sm flex-1 disabled:opacity-40 disabled:cursor-not-allowed" placeholder="Synology-Benutzername"
            value={creds.username} onChange={e => setCreds(p => ({ ...p, username: e.target.value }))} required
            disabled={synoConfig?.configured === false} />
          <input type="password" className="input text-sm flex-1 disabled:opacity-40 disabled:cursor-not-allowed" placeholder="Passwort"
            value={creds.password} onChange={e => setCreds(p => ({ ...p, password: e.target.value }))} required
            disabled={synoConfig?.configured === false} />
          <button type="submit"
            className={`btn text-sm shrink-0 ${synoConfig?.configured === false ? 'btn-secondary opacity-40 cursor-not-allowed' : 'btn-primary'}`}
            disabled={loading || synoConfig?.configured === false}>
            {loading ? <Loader size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            {loading ? 'Laden…' : 'Laden'}
          </button>
        </div>
        {loadErr && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 px-2 py-1">{loadErr}</div>
        )}
      </form>

      {/* Ergebnisliste */}
      {synoUsers && (
        <>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-sm text-gray-700">
              <strong>{synoUsers.length}</strong> Benutzer gefunden
              {newCount > 0 && <span className="text-brand-600 ml-2">· {newCount} neu</span>}
            </div>
            <div className="flex gap-1.5">
              <button className="btn btn-secondary text-xs" onClick={selectAll}>Alle</button>
              <button className="btn btn-secondary text-xs" onClick={selectNew} title="Nur neue Benutzer auswählen">Nur neue</button>
              <button className="btn btn-secondary text-xs" onClick={selectNone}>Keine</button>
            </div>
          </div>

          <div className="border border-gray-200 divide-y divide-gray-100 max-h-[45vh] overflow-y-auto">
            {synoUsers.map(u => {
              const isSel = selected.has(u.username)
              return (
                <div key={u.username}
                  className={`flex items-center gap-3 px-3 py-2.5 ${isSel ? 'bg-brand-50/40' : ''}`}>
                  <button
                    type="button"
                    className="shrink-0 text-brand-600"
                    onClick={() => toggleUser(u.username)}
                    title={isSel ? 'Abwählen' : 'Auswählen'}
                  >
                    {isSel ? <CheckSquare size={16} /> : <Square size={16} className="text-gray-300" />}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-medium text-gray-900 truncate">{u.displayName}</span>
                      <span className="text-xs text-gray-400">{u.username}</span>
                      {u.synoSource === 'domain' && <span className="badge badge-blue text-xs">Domäne</span>}
                      {u.synoSource === 'group'  && <span className="badge badge-gray text-xs">Gruppe</span>}
                      {u.inSystem && (
                        <span className="badge badge-green text-xs flex items-center gap-0.5">
                          <UserCheck size={9} /> Im System
                        </span>
                      )}
                    </div>
                  </div>

                  <input
                    type="email"
                    className="input text-xs w-44 shrink-0"
                    placeholder="E-Mail für Einladung"
                    value={emailMap[u.username] || ''}
                    onChange={e => setEmailMap(p => ({ ...p, [u.username]: e.target.value }))}
                  />
                </div>
              )
            })}
          </div>

          {selCount > 0 && (
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-gray-500">
                {selCount} ausgewählt
                {inviteCount > 0 && ` · ${inviteCount} mit E-Mail (Einladung wird gesendet)`}
                {selCount - inviteCount > 0 && ` · ${selCount - inviteCount} ohne E-Mail (nur angelegt)`}
              </div>
              <button className="btn btn-primary text-sm shrink-0" onClick={handleImport} disabled={importing}>
                {importing ? <Loader size={13} className="animate-spin" /> : <UserPlus size={13} />}
                {importing ? 'Wird verarbeitet…' : 'Anlegen & einladen'}
              </button>
            </div>
          )}

          {/* Import-Ergebnisse */}
          {results && !results.error && (
            <div className="border border-gray-200 divide-y divide-gray-100">
              <div className="px-3 py-2 text-xs font-semibold text-gray-600 bg-gray-50">Ergebnis</div>
              {results.map(r => (
                <div key={r.username} className="flex items-center gap-2 px-3 py-2">
                  <span className={r.inviteError ? 'text-amber-500' : 'text-green-600'}>
                    {r.inviteError ? <AlertTriangle size={13} /> : <Check size={13} />}
                  </span>
                  <span className="text-sm text-gray-800 flex-1">{r.displayName} <span className="text-gray-400">({r.username})</span></span>
                  <span className="text-xs text-gray-500">
                    {r.invited ? 'Einladung gesendet' : r.inviteError ? r.inviteError : 'Angelegt (keine E-Mail)'}
                  </span>
                </div>
              ))}
            </div>
          )}
          {results?.error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2">{results.error}</div>
          )}
        </>
      )}
    </div>
  )
}

// ── Email templates tab ───────────────────────────────────────────────────────
const DAY_NAMES = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']

const EMAIL_TYPES = [
  {
    id: 'invite',
    label: 'Einladung',
    desc: 'Neue Benutzer einladen',
    fields: [
      { key: 'subject',  label: 'Betreff',        hint: '{name}',         rows: 1 },
      { key: 'greeting', label: 'Einleitungstext', hint: null,             rows: 3 },
      { key: 'footer',   label: 'Fußzeile',        hint: null,             rows: 1 },
    ],
  },
  {
    id: 'protocol',
    label: 'Protokoll-E-Mail',
    desc: 'Protokoll als PDF versenden',
    fields: [
      { key: 'subject',         label: 'Betreff',                    hint: '{project}, {date}',  rows: 1 },
      { key: 'intro',           label: 'Einleitungstext',             hint: '{project}, {date}',  rows: 2 },
      { key: 'detail',          label: 'Detailsatz (PDF-Anlage)',     hint: null,                 rows: 2 },
      { key: 'no_next_meeting', label: 'Kein Folgetermin – Text',     hint: null,                 rows: 2 },
      { key: 'actions_note',    label: 'Hinweis Aufgaben-Versand',    hint: null,                 rows: 1 },
      { key: 'reply_note',      label: 'Rückfragen-Hinweis',          hint: null,                 rows: 1 },
      { key: 'footer',          label: 'Fußzeile',                   hint: null,                 rows: 1 },
    ],
  },
  {
    id: 'note',
    label: 'Akten- / Telefonnotiz',
    desc: 'Notiz als PDF per E-Mail',
    fields: [
      { key: 'subject',  label: 'Betreff',        hint: '{type}, {note_subject}, {project}, {date}', rows: 1 },
      { key: 'greeting', label: 'Anrede',          hint: null,                                        rows: 1 },
      { key: 'intro',    label: 'Einleitungstext', hint: '{type}, {project}, {date}',                 rows: 2 },
      { key: 'footer',   label: 'Fußzeile',        hint: null,                                        rows: 1 },
    ],
  },
  {
    id: 'notebook',
    label: 'Notizbuch',
    desc: 'Notizbuch-Auszug versenden',
    fields: [
      { key: 'subject',  label: 'Betreff',        hint: '{project}', rows: 1 },
      { key: 'greeting', label: 'Anrede',          hint: null,        rows: 1 },
      { key: 'intro',    label: 'Einleitungstext', hint: '{project}', rows: 2 },
      { key: 'footer',   label: 'Fußzeile',        hint: null,        rows: 1 },
    ],
  },
  {
    id: 'task_assignment',
    label: 'Aufgaben-E-Mail',
    desc: 'Aufgaben pro Verantwortlicher',
    fields: [
      { key: 'subject', label: 'Betreff',        hint: '{project}, {date}',   rows: 1 },
      { key: 'intro',   label: 'Einleitungstext', hint: '{project}, {count}',  rows: 3 },
      { key: 'footer',  label: 'Fußzeile',        hint: null,                  rows: 1 },
    ],
  },
  {
    id: 'release_notification',
    label: 'Freimeldung (Admin)',
    desc: 'Benachrichtigung an Admins',
    fields: [
      { key: 'subject', label: 'Betreff', hint: '{project}, {responsible}, {count}', rows: 1 },
      { key: 'intro',   label: 'Text',    hint: '{responsible}, {count}, {project}', rows: 3 },
      { key: 'footer',  label: 'Fußzeile', hint: null,                               rows: 1 },
    ],
  },
  {
    id: 'weekly_report',
    label: 'Wochenbericht',
    desc: 'Automatisch · Freitags',
    schedule: true,
    fields: [
      { key: 'subject',        label: 'Betreff',                       hint: '{project}', rows: 1 },
      { key: 'releases_intro', label: 'Abschnitt: Freigemeldete Aufgaben', hint: null,   rows: 2 },
      { key: 'open_intro',     label: 'Abschnitt: Offene Aufgaben',    hint: null,        rows: 2 },
      { key: 'footer',         label: 'Fußzeile',                      hint: null,        rows: 1 },
    ],
  },
]

function EmailTemplatesTab() {
  const [settings, setSettings] = useState(null)
  const [saving,   setSaving]   = useState(false)
  const [msg,      setMsg]      = useState(null)
  const [active,   setActive]   = useState('invite')

  useEffect(() => {
    fetch('/api/admin/email-settings', { headers: apiHeaders() })
      .then(r => r.json()).then(setSettings).catch(() => {})
  }, [])

  function set(type, field, value) {
    setSettings(prev => ({ ...prev, [type]: { ...prev[type], [field]: value } }))
    setMsg(null)
  }

  async function handleSave() {
    setSaving(true); setMsg(null)
    try {
      const res  = await fetch('/api/admin/email-settings', {
        method: 'PUT', headers: apiHeaders(), body: JSON.stringify(settings),
      })
      const data = await res.json()
      if (!res.ok) { setMsg({ type: 'err', text: data.error || 'Fehler beim Speichern.' }); return }
      setSettings(data.settings)
      setMsg({ type: 'ok', text: 'Gespeichert.' })
    } catch { setMsg({ type: 'err', text: 'Netzwerkfehler.' }) }
    finally { setSaving(false) }
  }

  if (!settings) return <div className="text-sm text-gray-400 py-4">Lade …</div>

  const typeDef  = EMAIL_TYPES.find(t => t.id === active)
  const typeData = settings[active] || {}

  return (
    <div className="flex w-full" style={{ minHeight: 0 }}>
      {/* Sidebar */}
      <div className="w-52 flex-shrink-0 border-r border-gray-200 overflow-y-auto">
        <div className="py-1">
          {EMAIL_TYPES.map(t => (
            <button
              key={t.id}
              onClick={() => { setActive(t.id); setMsg(null) }}
              className={`w-full text-left px-3 py-2.5 border-b border-gray-100 last:border-0 transition-colors ${
                active === t.id
                  ? 'bg-brand-50 border-l-2 border-l-brand-600 text-brand-800'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <div className="text-xs font-semibold leading-tight">{t.label}</div>
              <div className="text-xs text-gray-400 mt-0.5 leading-tight">{t.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {typeDef && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900 text-sm">{typeDef.label}</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Platzhalter in <code className="bg-gray-100 px-1">{'{}'}</code> werden automatisch ersetzt.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {msg && (
                  <span className={`text-xs px-2 py-1 border ${msg.type === 'ok' ? 'text-green-700 bg-green-50 border-green-200' : 'text-red-600 bg-red-50 border-red-200'}`}>
                    {msg.text}
                  </span>
                )}
                <button className="btn-primary text-xs py-1.5 px-3" onClick={handleSave} disabled={saving}>
                  {saving ? <Loader size={12} className="animate-spin" /> : <Check size={12} />}
                  {saving ? 'Speichert…' : 'Speichern'}
                </button>
              </div>
            </div>

            {typeDef.fields.map(f => (
              <div key={f.key}>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  {f.label}
                  {f.hint && <span className="ml-1 font-normal text-gray-400">· Platzhalter: <code className="bg-gray-100 px-0.5">{f.hint}</code></span>}
                </label>
                {f.rows === 1
                  ? <input className="input text-sm w-full" value={typeData[f.key] ?? ''} onChange={e => set(active, f.key, e.target.value)} />
                  : <textarea className="input text-sm w-full resize-y" rows={f.rows} value={typeData[f.key] ?? ''} onChange={e => set(active, f.key, e.target.value)} />}
              </div>
            ))}

            {typeDef.schedule && (
              <div className="pt-2 border-t border-gray-100 space-y-3">
                <p className="text-xs font-medium text-gray-500">Versandzeitplan</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Tag</label>
                    <select className="select w-full text-sm"
                      value={typeData.schedule_day ?? 5}
                      onChange={e => set(active, 'schedule_day', parseInt(e.target.value))}
                    >
                      {DAY_NAMES.map((n, i) => <option key={i} value={i}>{n}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Uhrzeit</label>
                    <select className="select w-full text-sm"
                      value={typeData.schedule_hour ?? 10}
                      onChange={e => set(active, 'schedule_hour', parseInt(e.target.value))}
                    >
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={h}>{String(h).padStart(2, '0')}:00 Uhr</option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="text-xs text-gray-400">
                  Automatischer Versand {DAY_NAMES[typeData.schedule_day ?? 5]}s ab {String(typeData.schedule_hour ?? 10).padStart(2, '0')}:00 Uhr (Serverzeit) an alle Projektkontakte mit E-Mail-Adresse.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AdminPanel({ serverUser, onClose }) {
  const isAdmin = serverUser?.role === 'admin' || serverUser?.devMode
  const [tab, setTab] = useState(isAdmin ? 'users' : 'password')

  const tabs = [
    isAdmin              && { id: 'users',    label: 'Benutzer',      icon: <Users size={14} /> },
    isAdmin              && { id: 'rollout',  label: 'Rollout',        icon: <UserPlus size={14} /> },
    isAdmin              && { id: 'sessions', label: 'Sitzungen',      icon: <Activity size={14} /> },
    isAdmin              && { id: 'deletions', label: 'Löschanfragen', icon: <AlertTriangle size={14} /> },
    isAdmin              && { id: 'smtp',      label: 'E-Mail',          icon: <Mail size={14} /> },
    isAdmin              && { id: 'templates', label: 'E-Mail-Vorlagen', icon: <Settings2 size={14} /> },
    isAdmin              && { id: 'backup',   label: 'Backup',          icon: <HardDrive size={14} /> },
    !serverUser?.devMode && { id: 'password', label: 'Passwort',       icon: <Key size={14} /> },
  ].filter(Boolean)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white w-full max-w-5xl h-[90vh] flex flex-col border border-gray-200">
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
        <div className={`flex-1 overflow-hidden ${tab === 'templates' ? 'flex' : 'overflow-y-auto p-5'}`}>
          {tab === 'users'     && <UsersTab      serverUser={serverUser} />}
          {tab === 'rollout'   && <RolloutTab />}
          {tab === 'sessions'  && <SessionsTab   serverUser={serverUser} />}
          {tab === 'deletions' && <DeletionRequestsTab />}
          {tab === 'smtp'      && <SmtpTab />}
          {tab === 'templates' && <EmailTemplatesTab />}
          {tab === 'backup'    && <BackupTab />}
          {tab === 'password'  && <PasswordTab   serverUser={serverUser} />}
        </div>
      </div>
    </div>
  )
}
