import React, { useState, useRef, useEffect } from 'react'
import { Plus, Trash2, Search, ChevronRight, FileText, Users, FolderOpen,
         Calendar, Lock, LockOpen, X, Eye, EyeOff, Star,
         User, Settings, LogOut, Monitor, Download, RotateCcw, Upload, AlertTriangle,
         ShieldCheck, Loader, CalendarClock, Copy, Link2, UserCog, GraduationCap,
         Archive, ArchiveRestore, FileDown } from 'lucide-react'
import ProjectAdminPanel from './ProjectAdminPanel'
import { formatDate } from '../utils'
import { useUserSettings } from '../hooks/useUserSettings'

const isServer = typeof window !== 'undefined' && !!window.__SERVER_MODE__

// ── Löschanfrage-Modal ─────────────────────────────────────────────────────────
function DeleteRequestModal({ project, protocolCount, onConfirm, onClose }) {
  const [sending, setSending] = useState(false)
  const [sent,    setSent]    = useState(false)
  const [error,   setError]   = useState('')

  const handleConfirm = async () => {
    setSending(true)
    setError('')
    try {
      await onConfirm()
      setSent(true)
    } catch (e) {
      setError(e.message || 'Fehler beim Senden der Anfrage.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white w-full max-w-sm border border-gray-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <AlertTriangle size={16} className="text-red-500" /> Projekt löschen
          </h3>
          <button className="btn-ghost p-1" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4">
          {!sent ? (
            <>
              <div className="bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
                <strong>Freigabe erforderlich.</strong> Das Löschen eines Projekts muss vom Administrator genehmigt werden. Er erhält eine E-Mail mit einem Freigabe-Link.
              </div>
              <div className="text-sm text-gray-700 space-y-1">
                <p>Projekt: <strong>{project.name || 'Unbenanntes Projekt'}</strong></p>
                {protocolCount > 0 && (
                  <p className="text-gray-500">{protocolCount} Protokoll{protocolCount !== 1 ? 'e' : ''} bleibt erhalten, wird aber vom Projekt getrennt.</p>
                )}
              </div>
              {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2">{error}</p>}
              <div className="flex gap-2 justify-end">
                <button className="btn-secondary" onClick={onClose}>Abbrechen</button>
                <button className="btn-danger" onClick={handleConfirm} disabled={sending}>
                  {sending ? '…' : 'Löschanfrage stellen'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">
                ✓ Anfrage gesendet. Der Administrator erhält eine E-Mail zur Freigabe.
              </div>
              <div className="flex justify-end">
                <button className="btn-secondary" onClick={onClose}>Schließen</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Password modal ─────────────────────────────────────────────────────────────
function PasswordModal({ mode, projectName, onConfirm, onCancel }) {
  const [pw,      setPw]      = useState('')
  const [pw2,     setPw2]     = useState('')
  const [error,   setError]   = useState('')
  const [show,    setShow]    = useState(false)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)

  const titles = {
    unlock: `Projekt öffnen: „${projectName}"`,
    set:    'Passwort festlegen',
    change: 'Passwort ändern',
    remove: 'Passwortschutz aufheben',
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!pw) { setError('Bitte Passwort eingeben.'); return }
    if ((mode === 'set' || mode === 'change') && pw !== pw2) {
      setError('Passwörter stimmen nicht überein.'); return
    }
    setLoading(true)
    try {
      await onConfirm(pw, pw2)
    } catch (err) {
      setError(err.message ?? 'Falsches Passwort.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Lock size={16} className="text-brand-600" />
            {titles[mode]}
          </h3>
          <button className="btn-ghost p-1" onClick={onCancel}><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              {mode === 'change' ? 'Neues Passwort' : 'Passwort'}
            </label>
            <div className="relative">
              <input
                ref={inputRef}
                autoFocus
                type={show ? 'text' : 'password'}
                className="input pr-9"
                placeholder="Passwort eingeben…"
                value={pw}
                onChange={e => setPw(e.target.value)}
              />
              <button type="button" tabIndex={-1}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                onClick={() => setShow(v => !v)}>
                {show ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {(mode === 'set' || mode === 'change') && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Passwort wiederholen</label>
              <input
                type={show ? 'text' : 'password'}
                className="input"
                placeholder="Passwort wiederholen…"
                value={pw2}
                onChange={e => setPw2(e.target.value)}
              />
            </div>
          )}

          {(mode === 'set' || mode === 'change') && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2">
              <strong>Wichtig:</strong> Bei verlorenem Passwort sind die verschlüsselten Kontakte unwiederbringlich verloren.
            </p>
          )}

          {mode === 'remove' && (
            <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 px-3 py-2">
              Nach Verifikation werden die Kontakte wieder unverschlüsselt gespeichert.
            </p>
          )}

          {error && <p className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}

          <div className="flex gap-2 justify-end pt-1">
            <button type="button" className="btn-secondary" onClick={onCancel}>Abbrechen</button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? '…' : mode === 'unlock' ? 'Öffnen' : mode === 'remove' ? 'Entfernen' : 'Speichern'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function ProjectsHome({ projects, protocols, onCreate, onUpdate, onDelete, onOpenProject,
                                       onOpenProjectDashboard, onUnlock, onSetPassword, onRemovePassword,
                                       onOpenContactDatabase, onImportProject, onOpenPersonalplanung,
                                       onOpenLearning, onArchiveProject, onUnarchiveProject,
                                       serverUser, onLogout, onOpenAdmin,
                                       onRequestDeleteProject, onRefresh }) {
  const [search,          setSearch]          = useState('')
  const [showAll,         setShowAll]         = useState(false)
  const [modal,           setModal]           = useState(null)   // { mode, projectId }
  const [installPrompt,   setInstallPrompt]   = useState(null)
  const [installed,       setInstalled]       = useState(false)
  const [importError,     setImportError]     = useState('')
  const [deleteRequest,   setDeleteRequest]   = useState(null)   // { project, protocolCount }
  const [accessProject,   setAccessProject]   = useState(null)   // project for access modal
  const [adminTilePicker, setAdminTilePicker] = useState(false)  // project picker for admin tile
  const [showArchive,     setShowArchive]     = useState(false)  // Archiv-Abschnitt aufgeklappt
  const [archivingId,     setArchivingId]     = useState(null)   // Projekt-ID während PDF-Erzeugung
  const [archiveError,    setArchiveError]    = useState('')
  const importProjectRef = useRef(null)

  // Projekte, für die der aktuelle Benutzer Admin ist
  const adminProjects = isServer && serverUser
    ? (serverUser.role === 'admin'
        ? projects
        : projects.filter(p => p.projectAdminUser === serverUser.username || p.projectAdmins?.includes(serverUser.username)))
    : []

  const handleAdminTileClick = () => {
    if (serverUser?.role === 'admin' && onOpenAdmin) { onOpenAdmin(); return }
    if (adminProjects.length === 1) { setAccessProject(adminProjects[0]); return }
    if (adminProjects.length > 1)  { setAdminTilePicker(true) }
  }
  const { settings, isFavorite, toggleFavorite } = useUserSettings(serverUser?.username)

  const handleImportProjectFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportError('')
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result)
        if (data.exportType === 'project' && data.project && onImportProject) {
          onImportProject(data)
        } else {
          setImportError('Ungültige Projektdatei. Bitte eine mit „Export" gespeicherte Datei verwenden.')
        }
      } catch { setImportError('Datei konnte nicht gelesen werden.') }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setInstallPrompt(e) }
    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', () => { setInstalled(true); setInstallPrompt(null) })
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  // ID of the project whose name input should be auto-focused after creation
  const focusIdRef = useRef(null)

  const activeProjects   = projects.filter(p => !p.isArchived)
  const archivedProjects = projects.filter(p => !!p.isArchived)

  const hasFavorites = activeProjects.some(p => isFavorite(p.id))

  const q = search.trim().toLowerCase()
  const baseFiltered = activeProjects
    .filter(p => !q || (p.name || '').toLowerCase().includes(q))

  // Favorites-only mode: only show when there are favorites AND showAll=false
  const displayed = (hasFavorites && !showAll)
    ? baseFiltered.filter(p => isFavorite(p.id))
    : baseFiltered.sort((a, b) => {
        const af = isFavorite(a.id) ? 0 : 1
        const bf = isFavorite(b.id) ? 0 : 1
        return af - bf
      })

  const unassigned    = protocols.filter(p => !p.projectId)
  const protocolsFor  = (id) => protocols.filter(p => p.projectId === id)
  const lastDate      = (arr) => arr.length ? arr.map(p => p.date).sort().reverse()[0] : null

  // Archivieren darf: lokal jeder, im Server-Modus System-/Projektadmin
  const canArchive = (project) => !isServer || serverUser?.role === 'admin'
    || project.projectAdminUser === serverUser?.username
    || project.projectAdmins?.includes(serverUser?.username)

  const handleArchiveClick = async (project, protoCount) => {
    if (!onArchiveProject || archivingId) return
    const msg = `Projekt „${project.name || 'Unbenannt'}" archivieren?\n\n`
      + (protoCount > 0
          ? `Ein Gesamtprotokoll mit ${protoCount} Protokoll${protoCount !== 1 ? 'en' : ''} wird automatisch als PDF erstellt.\n`
          : '')
      + 'Das Projekt bleibt im Archiv jederzeit zugänglich und kann wiederhergestellt werden.'
    if (!confirm(msg)) return
    setArchivingId(project.id)
    setArchiveError('')
    try {
      await onArchiveProject(project.id)
      setShowArchive(true)
    } catch (e) {
      setArchiveError(`Archivierung fehlgeschlagen: ${e.message}`)
    } finally {
      setArchivingId(null)
    }
  }

  const handleCreate = () => {
    const id = onCreate()
    focusIdRef.current = id
    // Show all when creating so newly created project is visible
    if (hasFavorites) setShowAll(true)
  }

  const handleCardClick = (project) => {
    if (!project.name.trim()) return
    if (!project.isUnlocked) {
      setModal({ mode: 'unlock', projectId: project.id })
    } else {
      onOpenProjectDashboard(project.id)
    }
  }

  const handleLockClick = (e, project) => {
    e.stopPropagation()
    if (project.isEncrypted || project.passwordHash) {
      setModal({ mode: 'remove', projectId: project.id })
    } else {
      setModal({ mode: 'set', projectId: project.id })
    }
  }

  const handleModalConfirm = async (pw) => {
    const { mode, projectId } = modal
    if (mode === 'unlock') {
      await onUnlock(projectId, pw)
      setModal(null)
      onOpenProjectDashboard(projectId)
    }
    if (mode === 'set' || mode === 'change') {
      await onSetPassword(projectId, pw)
      setModal(null)
    }
    if (mode === 'remove') {
      await onRemovePassword(projectId, pw)
      setModal(null)
    }
  }

  const modalProject = modal ? projects.find(p => p.id === modal.projectId) : null

  return (
    <div className="app-page">

      {/* Dev-Mode-Banner */}
      {serverUser?.devMode && onOpenAdmin && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 text-sm flex items-center justify-between gap-4">
          <span>
            <strong>Server-Modus: Offener Zugang.</strong>{' '}
            Noch kein Benutzer angelegt – Anmeldung ist deaktiviert.
          </span>
          <button className="btn btn-secondary text-xs whitespace-nowrap" onClick={onOpenAdmin}>
            <Settings size={13} /> Admin einrichten
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-stretch justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Komplizen Protokolle</h1>
          <p className="text-sm text-gray-500 mt-0.5">Projekte &amp; Besprechungsprotokolle</p>
        </div>
        <div className="flex flex-wrap items-stretch gap-2 self-start sm:self-auto">
          {serverUser && !serverUser.devMode && (
            <>
              <div className="flex items-center gap-1.5 text-sm text-gray-600 border-r border-gray-200 pr-2">
                <User size={13} className="text-gray-400" />
                <span className="font-medium">{serverUser.displayName || serverUser.username}</span>
              </div>
              {onOpenAdmin && serverUser.role === 'admin' && (
                <button className="btn btn-ghost p-1.5" onClick={onOpenAdmin} title="Server-Einstellungen">
                  <Settings size={14} className="text-gray-500" />
                </button>
              )}
              {onLogout && (
                <button className="btn btn-ghost p-1.5" onClick={onLogout} title="Abmelden">
                  <LogOut size={14} className="text-gray-500" />
                </button>
              )}
            </>
          )}
          {window.__SERVER_MODE__ && !installed && installPrompt && (
            <button className="btn btn-secondary" title="App installieren"
              onClick={() => installPrompt.prompt()}>
              <Download size={14} /> App installieren
            </button>
          )}
          {window.__SERVER_MODE__ && !installPrompt && !installed && (
            <a className="btn btn-secondary" href="/shortcut" download title="Desktop-Verknüpfung">
              <Monitor size={14} /> Verknüpfung
            </a>
          )}
          {installed && <span className="text-xs text-green-600 font-medium px-2">✓ App installiert</span>}
          <button className="btn-ghost p-2 text-gray-400" title="Seite neu laden"
            onClick={() => window.location.reload()}>
            <RotateCcw size={15} />
          </button>
          <input ref={importProjectRef} type="file" accept=".json" className="hidden" onChange={handleImportProjectFile} />
          <button className="btn btn-secondary" onClick={() => importProjectRef.current?.click()} title="Projekt aus Export-Datei importieren">
            <Upload size={16} /> Import
          </button>
          <button className="btn btn-primary" onClick={handleCreate}>
            <Plus size={16} /> Neues Projekt
          </button>
        </div>
      </div>

      {importError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-2">{importError}</p>
      )}

      {/* Dashboard-Kacheln */}
      {(() => {
        const totalContacts = projects.reduce((s, p) => s + (p.contacts ?? []).length, 0)
        const contactProjectCount = projects.filter(p => (p.contacts ?? []).length > 0).length
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            <button
              onClick={onOpenContactDatabase}
              className="card w-full text-left flex flex-col aspect-video p-4 hover:border-brand-300 hover:bg-gray-50 transition-colors group border-l-4 border-brand-500"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-brand-600 group-hover:text-brand-700 transition-colors flex-shrink-0"><Users size={20} /></span>
                <h3 className="font-semibold text-sm text-gray-900 group-hover:text-brand-700 transition-colors truncate">Kontaktdatenbank</h3>
              </div>
              <p className="text-xs text-gray-500 line-clamp-3">Alle Projektkontakte auf einen Blick</p>
              <div className="flex gap-4 mt-auto pt-2">
                <div>
                  <div className="text-lg font-bold text-night leading-none">{totalContacts}</div>
                  <div className="text-xs text-gray-400 mt-0.5">Kontakte</div>
                </div>
                {contactProjectCount > 0 && (
                  <div>
                    <div className="text-lg font-bold text-night leading-none">{contactProjectCount}</div>
                    <div className="text-xs text-gray-400 mt-0.5">Projekte</div>
                  </div>
                )}
              </div>
            </button>

            {/* Personalplanung / Projekttermine – Inhalt folgt */}
            <button
              onClick={onOpenPersonalplanung}
              className="card w-full text-left flex flex-col aspect-video p-4 hover:border-brand-300 hover:bg-gray-50 transition-colors group border-l-4 border-purple-400"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-brand-600 group-hover:text-brand-700 transition-colors flex-shrink-0"><CalendarClock size={20} /></span>
                <h3 className="font-semibold text-sm text-gray-900 group-hover:text-brand-700 transition-colors truncate">Personalplanung / Projekttermine</h3>
              </div>
              <p className="text-xs text-gray-500 line-clamp-3">Personaleinsatz und Termine über alle Projekte</p>
              <div className="flex gap-4 mt-auto pt-2">
                <span className="text-xs text-gray-400 italic">In Vorbereitung</span>
              </div>
            </button>

            {/* Learning-Plattform – Schulungsvideos */}
            <button
              onClick={onOpenLearning}
              className="card w-full text-left flex flex-col aspect-video p-4 hover:border-brand-300 hover:bg-gray-50 transition-colors group border-l-4 border-blue-400"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-brand-600 group-hover:text-brand-700 transition-colors flex-shrink-0"><GraduationCap size={20} /></span>
                <h3 className="font-semibold text-sm text-gray-900 group-hover:text-brand-700 transition-colors truncate">Learning-Plattform</h3>
              </div>
              <p className="text-xs text-gray-500 line-clamp-3">Schulungsvideos zur richtigen Nutzung des Programms</p>
              <div className="flex gap-4 mt-auto pt-2">
                <span className="text-xs text-gray-400 italic">Videos ansehen &amp; lernen</span>
              </div>
            </button>

            {/* Admin-Kachel – nur für Projektadmins und Systemadmins */}
            {adminProjects.length > 0 && (
              <button
                onClick={handleAdminTileClick}
                className="card w-full text-left flex flex-col aspect-video p-4 hover:border-brand-300 hover:bg-gray-50 transition-colors group border-l-4 border-brand-600"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-brand-600 group-hover:text-brand-700 transition-colors flex-shrink-0"><UserCog size={20} /></span>
                  <h3 className="font-semibold text-sm text-gray-900 group-hover:text-brand-700 transition-colors truncate">Administration</h3>
                </div>
                <p className="text-xs text-gray-500 line-clamp-3">Projektzugang, Administratoren und Freimelde-Links</p>
                <div className="flex gap-4 mt-auto pt-2">
                  {serverUser?.role === 'admin' ? (
                    <div>
                      <div className="text-lg font-bold text-night leading-none">{adminProjects.length}</div>
                      <div className="text-xs text-gray-400 mt-0.5">Projekte</div>
                    </div>
                  ) : (
                    <div>
                      <div className="text-lg font-bold text-night leading-none">{adminProjects.length}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{adminProjects.length === 1 ? 'Projekt' : 'Projekte'}</div>
                    </div>
                  )}
                </div>
              </button>
            )}
          </div>
        )
      })()}

      {/* Search + favorites toggle */}
      {projects.length > 0 && (
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input pl-9" placeholder="Projekte durchsuchen…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {hasFavorites && (
            <button
              className={`btn-secondary shrink-0 ${!showAll ? 'bg-night text-light border-night hover:bg-night/90' : ''}`}
              onClick={() => setShowAll(v => !v)}
              title={showAll ? 'Nur Favoriten anzeigen' : 'Alle Projekte anzeigen'}
            >
              <Star size={14} fill={!showAll ? 'currentColor' : 'none'} />
              {showAll ? 'Nur Favoriten' : 'Alle anzeigen'}
            </button>
          )}
        </div>
      )}

      {/* Empty state */}
      {projects.length === 0 && unassigned.length === 0 && (
        <div className="card p-16 text-center">
          <FolderOpen size={44} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium text-lg">Noch keine Projekte vorhanden</p>
          <p className="text-sm text-gray-400 mt-1">Lege ein Projekt an – danach kannst du Protokolle erstellen und zuordnen.</p>
          <button className="btn-primary mt-5" onClick={handleCreate}>
            <Plus size={15} /> Erstes Projekt anlegen
          </button>
        </div>
      )}

      {/* No favorites yet hint */}
      {hasFavorites && !showAll && displayed.length === 0 && q && (
        <p className="text-sm text-gray-400 text-center py-4">Kein Favorit gefunden.</p>
      )}

      {/* Project cards – 16:9-Kacheln */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {displayed.map(project => {
          const protos    = protocolsFor(project.id)
          const last      = lastDate(protos)
          const open      = protos.filter(p => !p.isClosed).length
          const closed    = protos.filter(p =>  p.isClosed).length
          const isLocked  = project.isEncrypted || !!project.passwordHash
          const isSession = project.isUnlocked
          const isFav     = isFavorite(project.id)

          return (
            <div key={project.id}
              className={`card flex flex-col aspect-video p-4 hover:border-sky hover:bg-gray-50 transition-colors cursor-pointer group border-l-4 ${isLocked ? 'border-amber-400' : 'border-night'}`}
              onClick={() => handleCardClick(project)}
            >
              {/* Titel + Lock-Badge */}
              <div className="flex items-start gap-2">
                <input
                  className="font-semibold text-base text-gray-900 bg-transparent border-none outline-none w-full focus:bg-white focus:border focus:border-sky focus:rounded px-1 -ml-1 truncate"
                  value={project.name}
                  placeholder="Projektname…"
                  ref={el => {
                    if (el && project.id === focusIdRef.current) {
                      el.focus()
                      focusIdRef.current = null
                    }
                  }}
                  onClick={e => e.stopPropagation()}
                  onChange={e => onUpdate(project.id, { name: e.target.value })}
                />
                {isLocked && (
                  <span className={`flex-shrink-0 flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full
                    ${isSession ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                    {isSession ? <LockOpen size={11} /> : <Lock size={11} />}
                    {isSession ? 'Entsperrt' : 'Gesperrt'}
                  </span>
                )}
              </div>

              {/* Kennzahlen */}
              <div className="flex flex-col gap-1 mt-2 text-xs text-gray-500">
                <span className="flex items-center gap-1 flex-wrap">
                  <FileText size={11} className="flex-shrink-0" />
                  {protos.length} Protokoll{protos.length !== 1 ? 'e' : ''}
                  {open   > 0 && <span className="badge-yellow ml-1">{open} offen</span>}
                  {closed > 0 && <span className="badge-gray ml-1">{closed} abgeschlossen</span>}
                </span>
                <span className="flex items-center gap-1">
                  <Users size={11} className="flex-shrink-0" />
                  {isLocked && !isSession
                    ? <span className="text-amber-600">Kontakte gesperrt</span>
                    : `${(project.contacts ?? []).length} Kontakt${(project.contacts ?? []).length !== 1 ? 'e' : ''}`
                  }
                </span>
                {last && (
                  <span className="flex items-center gap-1">
                    <Calendar size={11} className="flex-shrink-0" />
                    Zuletzt: {formatDate(last)}
                  </span>
                )}
                {project.isAccessControlled && (
                  <span className="flex items-center gap-1 text-brand-600">
                    <ShieldCheck size={11} className="flex-shrink-0" /> Zugangsbeschränkt
                  </span>
                )}
              </div>

              {/* Aktionen */}
              <div className="flex items-center justify-between gap-1 mt-auto pt-2" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-0.5">
                  <button
                    className={`btn-ghost p-1.5 transition-colors ${isFav ? 'text-amber-400 hover:text-amber-500' : 'text-gray-300 hover:text-amber-400'}`}
                    title={isFav ? 'Favorit aufheben' : 'Als Favorit markieren'}
                    onClick={() => toggleFavorite(project.id)}
                  >
                    <Star size={14} fill={isFav ? 'currentColor' : 'none'} />
                  </button>
                  <button
                    className={`btn-ghost p-1.5 ${isLocked ? 'text-amber-500 hover:text-amber-700' : 'text-gray-400 hover:text-brand-600'}`}
                    title={isLocked ? 'Passwort ändern / entfernen' : 'Passwort festlegen'}
                    onClick={e => handleLockClick(e, project)}
                  >
                    {isLocked ? <Lock size={14} /> : <LockOpen size={14} />}
                  </button>
                  {isServer && (project.projectAdminUser === serverUser?.username || serverUser?.role === 'admin' || project.projectAdmins?.includes(serverUser?.username)) && (
                    <button
                      className={`btn-ghost p-1.5 ${project.isAccessControlled ? 'text-brand-600' : 'text-gray-400 hover:text-brand-600'}`}
                      title="Projekt-Admin-Panel"
                      onClick={() => setAccessProject(project)}
                    >
                      <UserCog size={14} />
                    </button>
                  )}
                  {canArchive(project) && (
                    <button
                      className="btn-ghost p-1.5 text-gray-400 hover:text-brand-600"
                      title="Projekt archivieren (Gesamtprotokoll-PDF wird erstellt)"
                      disabled={archivingId === project.id}
                      onClick={() => handleArchiveClick(project, protos.length)}
                    >
                      {archivingId === project.id
                        ? <Loader size={14} className="animate-spin text-brand-600" />
                        : <Archive size={14} />}
                    </button>
                  )}
                  <button
                    className="btn-ghost p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50"
                    title="Projekt löschen"
                    onClick={() => {
                      if (isServer && serverUser?.role !== 'admin') {
                        setDeleteRequest({ project, protocolCount: protos.length })
                      } else {
                        const n = protos.length
                        const msg = n > 0
                          ? `Projekt „${project.name || 'Unbenannt'}" löschen?\n${n} Protokoll${n !== 1 ? 'e werden' : ' wird'} nicht gelöscht, aber vom Projekt getrennt.`
                          : `Projekt „${project.name || 'Unbenannt'}" löschen?`
                        if (confirm(msg)) onDelete(project.id)
                      }
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <ChevronRight size={16} className="text-concrete group-hover:text-sky transition-colors flex-shrink-0" />
              </div>
            </div>
          )
        })}

        {displayed.length === 0 && projects.length > 0 && !q && hasFavorites && !showAll && (
          <div className="card p-10 text-center sm:col-span-2 lg:col-span-3">
            <Star size={32} className="mx-auto text-amber-300 mb-3" />
            <p className="text-gray-500 font-medium">Noch keine Favoriten</p>
            <p className="text-sm text-gray-400 mt-1">Klicke auf den Stern eines Projekts, um es als Favorit zu markieren.</p>
            <button className="btn-secondary mt-4" onClick={() => setShowAll(true)}>
              Alle Projekte anzeigen
            </button>
          </div>
        )}

        {displayed.length === 0 && q && (
          <p className="text-sm text-gray-400 text-center py-4 sm:col-span-2 lg:col-span-3">Kein Projekt gefunden.</p>
        )}
      </div>

      {/* Archivierungs-Fehler */}
      {archiveError && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 px-4 py-2.5">
          <AlertTriangle size={15} className="flex-shrink-0" />
          <span className="flex-1">{archiveError}</span>
          <button className="text-red-400 hover:text-red-600" onClick={() => setArchiveError('')}><X size={14} /></button>
        </div>
      )}

      {/* Archiv – abgeschlossene, archivierte Projekte */}
      {archivedProjects.length > 0 && (
        <div>
          <button
            className="flex items-center gap-2 text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 hover:text-gray-700 transition-colors"
            onClick={() => setShowArchive(v => !v)}
          >
            <Archive size={14} />
            Archiv ({archivedProjects.length})
            <ChevronRight size={14} className={`transition-transform ${showArchive ? 'rotate-90' : ''}`} />
          </button>
          {showArchive && (
            <div className="space-y-2">
              {archivedProjects.map(project => {
                const protos = protocolsFor(project.id)
                return (
                  <div key={project.id} className="card p-4 flex items-center gap-3 border-l-4 border-gray-300 bg-gray-50/60">
                    <Archive size={16} className="text-gray-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-700 truncate">{project.name || 'Unbenanntes Projekt'}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Archiviert {project.archivedAt ? formatDate(project.archivedAt.slice(0, 10)) : ''}
                        {' · '}{protos.length} Protokoll{protos.length !== 1 ? 'e' : ''}
                        {project.archivePdf && !project.archivePdf.local && ' · Gesamtprotokoll-PDF hinterlegt'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {isServer && project.archivePdf && !project.archivePdf.local && (
                        <a
                          className="btn-ghost p-1.5 text-gray-400 hover:text-brand-600"
                          title="Gesamtprotokoll-PDF herunterladen"
                          href={`/api/projects/${project.id}/archive-pdf?token=${encodeURIComponent(localStorage.getItem('kp_session_token') || '')}`}
                          onClick={e => e.stopPropagation()}
                        >
                          <FileDown size={15} />
                        </a>
                      )}
                      <button
                        className="btn-ghost p-1.5 text-gray-400 hover:text-brand-600"
                        title="Projekt öffnen (lesender Zugriff jederzeit möglich)"
                        onClick={() => handleCardClick(project)}
                      >
                        <ChevronRight size={15} />
                      </button>
                      {canArchive(project) && onUnarchiveProject && (
                        <button
                          className="btn-ghost p-1.5 text-gray-400 hover:text-green-600"
                          title="Aus dem Archiv wiederherstellen"
                          onClick={() => {
                            if (confirm(`Projekt „${project.name || 'Unbenannt'}" wiederherstellen?`)) onUnarchiveProject(project.id)
                          }}
                        >
                          <ArchiveRestore size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Unassigned protocols */}
      {unassigned.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Protokolle ohne Projekt ({unassigned.length})
          </h2>
          <div
            className="card p-4 flex items-center gap-3 hover:border-sky cursor-pointer transition-colors group"
            onClick={() => onOpenProject(null)}
          >
            <div className="w-1.5 self-stretch rounded-full bg-gray-300 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-gray-700">Nicht zugeordnete Protokolle</p>
              <p className="text-xs text-gray-400 mt-0.5">{unassigned.length} Protokoll{unassigned.length !== 1 ? 'e' : ''}</p>
            </div>
            <ChevronRight size={16} className="text-gray-300 group-hover:text-sky transition-colors" />
          </div>
        </div>
      )}

      {/* Admin-Kachel Projekt-Picker – bei mehreren Admin-Projekten */}
      {adminTilePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white w-full max-w-sm border border-gray-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <UserCog size={16} className="text-brand-600" /> Projekt wählen
              </h3>
              <button className="btn-ghost p-1" onClick={() => setAdminTilePicker(false)}><X size={16} /></button>
            </div>
            <div className="p-4 space-y-1 max-h-80 overflow-y-auto">
              {adminProjects.map(p => (
                <button
                  key={p.id}
                  className="w-full text-left px-4 py-3 hover:bg-brand-50 border border-gray-100 hover:border-brand-200 text-sm font-medium text-gray-900 transition-colors"
                  onClick={() => { setAdminTilePicker(false); setAccessProject(p) }}
                >
                  {p.name || 'Unbenanntes Projekt'}
                  {p.isAccessControlled && <span className="ml-2 text-xs text-brand-600"><ShieldCheck size={11} className="inline" /> Zugangsbeschränkt</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Zugangsverwaltungs-Modal */}
      {accessProject && (
        <ProjectAdminPanel
          project={accessProject}
          serverUser={serverUser}
          onClose={() => setAccessProject(null)}
          onSaved={onRefresh}
        />
      )}

      {/* Löschanfrage-Modal */}
      {deleteRequest && (
        <DeleteRequestModal
          project={deleteRequest.project}
          protocolCount={deleteRequest.protocolCount}
          onConfirm={() => onRequestDeleteProject(deleteRequest.project.id)}
          onClose={() => setDeleteRequest(null)}
        />
      )}

      {/* Password modal */}
      {modal && modalProject && (
        <PasswordModal
          mode={modal.mode}
          projectName={modalProject.name || 'Unbenannt'}
          onConfirm={handleModalConfirm}
          onCancel={() => setModal(null)}
        />
      )}
    </div>
  )
}
