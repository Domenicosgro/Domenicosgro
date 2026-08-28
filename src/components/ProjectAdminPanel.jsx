import React, { useState, useEffect } from 'react'
import { X, ShieldCheck, Loader, Link2, Copy, Trash2, UserCog, Image as ImageIcon, Send, BookOpen } from 'lucide-react'
import { formatDate, DIARY_BLOCKS, diaryConfigFor } from '../utils'
import LogoUpload from './LogoUpload'
import ProjectDistribution from './ProjectDistribution'

function apiHeaders() {
  const h = { 'Content-Type': 'application/json' }
  const token = localStorage.getItem('kp_session_token')
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

// ── Projekt-Admin-Panel ─────────────────────────────────────────────────────────
// Projektadministratoren (Ersteller + benannte Co-Admins) verwalten hier den
// Projektzugang, weitere Administratoren, Autoren und die Freimelde-Links.
export default function ProjectAdminPanel({ project, serverUser, onClose, onSaved, globalLogoDataUrl = null, onUpdateProject = null }) {
  const [users,              setUsers]              = useState([])
  const [loadingUsers,       setLoadingUsers]       = useState(true)
  const [saving,             setSaving]             = useState(false)
  const [isAccessControlled, setIsAccessControlled] = useState(project.isAccessControlled ?? false)
  const [allowedUsers,       setAllowedUsers]       = useState(project.allowedUsers ?? [])
  const [projectAdmins,      setProjectAdmins]      = useState(project.projectAdmins ?? [])
  const [distRecipients,     setDistRecipients]     = useState(project.distribution?.recipients ?? [])
  const [diaryCfg,           setDiaryCfg]           = useState(() => diaryConfigFor(project))
  const [tokens,             setTokens]             = useState([])
  const [error,              setError]              = useState('')
  const [copied,             setCopied]             = useState('')
  const [portalUrl,          setPortalUrl]          = useState(
    project.portalToken ? `${window.location.origin}/portal/${project.portalToken}` : null)
  const [portalBusy,         setPortalBusy]         = useState(false)
  const [portalCopied,       setPortalCopied]       = useState(false)
  const [portalError,        setPortalError]        = useState('')

  const creator = project.projectAdminUser

  // Bauherren-Portal-Link erstellen/widerrufen
  const managePortal = async (action) => {
    if (action === 'revoke' && !confirm('Portal-Link wirklich widerrufen? Der Auftraggeber verliert den Zugriff auf die Statusseite.')) return
    setPortalBusy(true)
    setPortalError('')
    try {
      const res = await fetch(`/api/projects/${project.id}/portal-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...apiHeaders() },
        body: JSON.stringify({ action }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Fehler ${res.status}`)
      setPortalUrl(data.url || null)
      if (onSaved) onSaved()
    } catch (e) {
      setPortalError(e.message)
    } finally {
      setPortalBusy(false)
    }
  }

  const loadTokens = () =>
    fetch(`/api/projects/${project.id}/release-tokens`, { headers: apiHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then(setTokens)
      .catch(() => {})

  useEffect(() => {
    fetch('/api/users', { headers: apiHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then(data => { setUsers(data); setLoadingUsers(false) })
      .catch(() => setLoadingUsers(false))
    loadTokens()
  }, [])

  // Co-Admin umschalten – wer Admin wird, braucht nicht zusätzlich in der Autorenliste zu stehen.
  const toggleAdmin = (username) => {
    setProjectAdmins(prev => {
      const isAdmin = prev.includes(username)
      if (isAdmin) return prev.filter(u => u !== username)
      setAllowedUsers(au => au.filter(u => u !== username))
      return [...prev, username]
    })
  }
  const toggleAuthor = (username) =>
    setAllowedUsers(prev => prev.includes(username) ? prev.filter(u => u !== username) : [...prev, username])

  const handleSave = async () => {
    setSaving(true); setError('')
    try {
      const res = await fetch(`/api/projects/${project.id}/access`, {
        method: 'PATCH', headers: apiHeaders(),
        body: JSON.stringify({
          isAccessControlled, allowedUsers, projectAdmins,
          distribution: { recipients: distRecipients },
        }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Fehler.'); return }
      onSaved?.()
      onClose()
    } catch { setError('Netzwerkfehler.') }
    finally { setSaving(false) }
  }

  const revokeToken = async (token) => {
    if (!confirm('Diesen Freimelde-Link widerrufen? Er funktioniert danach nicht mehr.')) return
    try {
      const res = await fetch(`/api/projects/${project.id}/release-tokens/${token}/revoke`, {
        method: 'POST', headers: apiHeaders(),
      })
      if (res.ok) loadTokens()
    } catch {}
  }

  const copyLink = (url, token) => {
    try { navigator.clipboard?.writeText(url); setCopied(token); setTimeout(() => setCopied(''), 1500) } catch {}
  }

  const nameOf = (username) => users.find(u => u.username === username)?.display_name || username
  // App-Nutzer mit Projektbezug (Admins + freigegebene Autoren + Ersteller) als
  // Verteiler-Kandidaten – nur solche mit E-Mail sind später verwertbar.
  const distUserCandidates = (() => {
    const rel = new Set([creator, ...projectAdmins, ...allowedUsers].filter(Boolean))
    return users.filter(u => u.email && (rel.has(u.username) || u.role === 'admin'))
  })()
  const sysAdmins      = users.filter(u => u.username !== creator && u.role === 'admin')
  const candidates     = users.filter(u => u.username !== creator && u.role !== 'admin')
  const authorCandidates = candidates.filter(u => !projectAdmins.includes(u.username))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white w-full max-w-3xl border border-gray-200 flex flex-col max-h-[88vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <UserCog size={16} className="text-brand-600" /> Projekt-Admin-Panel
          </h3>
          <button className="btn-ghost p-1" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          <p className="text-sm font-medium text-gray-800 truncate">{project.name || 'Unbenanntes Projekt'}</p>

          {/* Administratoren */}
          <div>
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <ShieldCheck size={13} className="text-brand-600" /> Projektadministratoren
            </p>
            <div className="bg-brand-50 border border-brand-200 px-3 py-2 text-xs text-brand-800 mb-2">
              <strong>{nameOf(creator)}</strong> · Ersteller – kann nicht entfernt werden. Administratoren verwalten Zugang, Autoren und Freimeldungen.
            </div>
            {loadingUsers ? (
              <div className="flex justify-center py-3"><Loader size={16} className="animate-spin text-gray-400" /></div>
            ) : candidates.length === 0 && sysAdmins.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-2 border border-gray-100">Keine weiteren Benutzer vorhanden.</p>
            ) : (
              <div className="border border-gray-200 divide-y divide-gray-100 max-h-40 overflow-y-auto">
                {sysAdmins.map(u => (
                  <div key={u.username} className="flex items-center gap-3 px-3 py-2 bg-gray-50 opacity-60">
                    <input type="checkbox" className="w-4 h-4 flex-shrink-0" checked disabled />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-gray-600">{u.display_name || u.username}</span>
                      <span className="text-xs text-gray-400 ml-1.5">@{u.username}</span>
                    </div>
                    <span className="text-xs text-gray-400 italic">Systemadmin</span>
                  </div>
                ))}
                {candidates.map(u => (
                  <label key={u.username} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 accent-brand-600 flex-shrink-0"
                      checked={projectAdmins.includes(u.username)} onChange={() => toggleAdmin(u.username)} />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-gray-900">{u.display_name || u.username}</span>
                      <span className="text-xs text-gray-400 ml-1.5">@{u.username}</span>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Projektzugang + Autoren */}
          <div>
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Projektzugang</p>
            <label className="flex items-start gap-3 p-3 border border-gray-200 hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-brand-600 mt-0.5 flex-shrink-0"
                checked={isAccessControlled} onChange={e => setIsAccessControlled(e.target.checked)} />
              <div>
                <p className="text-sm font-medium text-gray-900">Projektzugang einschränken</p>
                <p className="text-xs text-gray-500 mt-0.5">Nur freigegebene Autoren (und Administratoren) können dieses Projekt sehen und öffnen.</p>
              </div>
            </label>

            {isAccessControlled && (
              <div className="mt-3">
                <p className="text-xs font-medium text-gray-700 mb-2">Autoren mit Zugang:</p>
                {authorCandidates.length === 0 && sysAdmins.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-2 border border-gray-100">Keine weiteren Benutzer vorhanden.</p>
                ) : (
                  <div className="border border-gray-200 divide-y divide-gray-100 max-h-40 overflow-y-auto">
                    {sysAdmins.map(u => (
                      <div key={u.username} className="flex items-center gap-3 px-3 py-2 bg-gray-50 opacity-60">
                        <input type="checkbox" className="w-4 h-4 flex-shrink-0" checked disabled />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-gray-600">{u.display_name || u.username}</span>
                          <span className="text-xs text-gray-400 ml-1.5">@{u.username}</span>
                        </div>
                        <span className="text-xs text-gray-400 italic">Systemadmin</span>
                      </div>
                    ))}
                    {authorCandidates.map(u => (
                      <label key={u.username} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                        <input type="checkbox" className="w-4 h-4 accent-brand-600 flex-shrink-0"
                          checked={allowedUsers.includes(u.username)} onChange={() => toggleAuthor(u.username)} />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-gray-900">{u.display_name || u.username}</span>
                          <span className="text-xs text-gray-400 ml-1.5">@{u.username}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
                <p className="text-xs text-gray-400 mt-1.5">
                  Systemadministratoren haben immer uneingeschränkten Zugang. Fehlen Kollegen in der Liste, können sie über <strong>Admin → Synology-Import</strong> hinzugefügt werden.
                </p>
              </div>
            )}
          </div>

          {/* Verteiler – Nachrichten-Terminal je Projekt */}
          <div>
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Send size={13} className="text-brand-600" /> Verteiler – wer erhält welche Nachrichten
            </p>
            <ProjectDistribution
              recipients={distRecipients}
              onChange={setDistRecipients}
              projectContacts={project.contacts ?? []}
              projectUsers={distUserCandidates}
            />
          </div>

          {/* Freimelde-Links */}
          {tokens.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Link2 size={13} className="text-brand-600" /> Freimelde-Links
              </p>
              <div className="border border-gray-200 divide-y divide-gray-100 max-h-44 overflow-y-auto">
                {tokens.map(t => (
                  <div key={t.token} className="flex items-center gap-2 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-gray-900 truncate block">{t.responsible}</span>
                      <span className="text-xs text-gray-400">
                        {t.email || 'keine E-Mail'} · {t.lastUsedAt ? `zuletzt genutzt ${formatDate((t.lastUsedAt || '').slice(0, 10))}` : 'noch nicht genutzt'}
                      </span>
                    </div>
                    <button className="btn-ghost p-1 text-gray-400 hover:text-brand-600" title="Link kopieren"
                      onClick={() => copyLink(t.url, t.token)}>
                      {copied === t.token ? <span className="text-xs text-green-600">kopiert</span> : <Copy size={14} />}
                    </button>
                    <button className="btn-ghost p-1 text-red-400 hover:text-red-600" title="Link widerrufen"
                      onClick={() => revokeToken(t.token)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bauherren-Portal */}
          <div>
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Link2 size={13} className="text-brand-600" /> Bauherren-Portal
            </p>
            <p className="text-xs text-gray-500 mb-2">
              Login-freie, stets aktuelle Statusseite für Auftraggeber (Termine, Aufgabenstand,
              Planprüfung – ohne interne Inhalte). Link kann jederzeit widerrufen werden.
            </p>
            {portalUrl ? (
              <div className="flex items-center gap-2 border border-gray-200 px-3 py-2">
                <span className="text-xs text-gray-600 truncate flex-1">{portalUrl}</span>
                <button className="btn-ghost p-1 text-gray-400 hover:text-brand-600" title="Link kopieren"
                  onClick={() => { navigator.clipboard?.writeText(portalUrl); setPortalCopied(true); setTimeout(() => setPortalCopied(false), 2000) }}>
                  {portalCopied ? <span className="text-xs text-green-600">kopiert</span> : <Copy size={14} />}
                </button>
                <button className="btn-ghost p-1 text-red-400 hover:text-red-600" title="Portal-Link widerrufen"
                  onClick={() => managePortal('revoke')}>
                  <Trash2 size={14} />
                </button>
              </div>
            ) : (
              <button className="btn-secondary text-xs" onClick={() => managePortal('create')} disabled={portalBusy}>
                <Link2 size={13} /> {portalBusy ? 'Wird erstellt…' : 'Portal-Link erstellen'}
              </button>
            )}
            {portalError && <p className="text-xs text-red-600 mt-1">{portalError}</p>}
          </div>

          {/* Logos */}
          {onUpdateProject && (
            <div>
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <ImageIcon size={13} className="text-brand-600" /> Projekt-Logos
              </p>
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-medium text-gray-700 mb-1.5">Büro-Logo (projektspezifisch)</p>
                  <LogoUpload
                    label="Büro-Logo"
                    logoDataUrl={project.logo || ''}
                    onUpdate={(dataUrl) => onUpdateProject(project.id, { logo: dataUrl })}
                    onClear={() => onUpdateProject(project.id, { logo: '' })}
                  />
                  {!project.logo && globalLogoDataUrl && (
                    <p className="text-xs text-gray-400 mt-1">Aktuell wird das globale Standard-Logo verwendet.</p>
                  )}
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-700 mb-1.5">Auftraggeber-Logo</p>
                  <LogoUpload
                    label="Auftraggeber-Logo"
                    logoDataUrl={project.clientLogo || ''}
                    onUpdate={(dataUrl) => onUpdateProject(project.id, { clientLogo: dataUrl })}
                    onClear={() => onUpdateProject(project.id, { clientLogo: '' })}
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Erscheint neben dem Büro-Logo in Protokollen, Notizen, Druck, PDF und Word-Export.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Baudokumentation: welche Blöcke der Bericht führt.
              Voreinstellung nach Leistungsbild, hier je Projekt änderbar. */}
          {onUpdateProject && (
            <div>
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <BookOpen size={13} className="text-brand-600" /> Baudokumentation – Berichtsbausteine
              </p>
              <p className="text-xs text-gray-500 mb-2">
                Voreinstellung richtet sich nach dem Leistungsbild
                {project.projectData?.isGeneralplanung ? ' (Generalplanung)' : ''} und gilt für Erfassung und Ausdruck.
              </p>
              <div className="space-y-1.5">
                {DIARY_BLOCKS.map(b => (
                  <label key={b.key} className="flex items-start gap-2 text-sm cursor-pointer">
                    <input type="checkbox" className="mt-0.5" checked={!!diaryCfg[b.key]}
                      onChange={e => {
                        const next = { ...diaryCfg, [b.key]: e.target.checked }
                        setDiaryCfg(next)
                        onUpdateProject(project.id, { diaryConfig: next })
                      }} />
                    <span>
                      <span className="text-gray-800">{b.label}</span>
                      <span className="block text-xs text-gray-400">{b.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2">{error}</p>}
        </div>

        <div className="flex gap-2 justify-end px-5 py-4 border-t border-gray-200">
          <button className="btn-secondary" onClick={onClose}>Abbrechen</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? '…' : 'Speichern'}</button>
        </div>
      </div>
    </div>
  )
}
