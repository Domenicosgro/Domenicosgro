import React, { useState, useRef } from 'react'
import { Plus, Trash2, Search, ChevronRight, FileText, Users, FolderOpen,
         Calendar, Lock, LockOpen, X, Eye, EyeOff } from 'lucide-react'
import { formatDate, hashPassword } from '../utils'

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
export default function ProjectsHome({ projects, protocols, onCreate, onUpdate, onDelete, onOpenProject }) {
  const [search,    setSearch]    = useState('')
  const [modal,     setModal]     = useState(null)   // { mode, projectId }
  // IDs unlocked this session (in-memory only — re-locks on restart)
  const [unlocked,  setUnlocked]  = useState(() => new Set())
  // ID of the project whose name input should be auto-focused after creation
  const focusIdRef = useRef(null)

  const q = search.trim().toLowerCase()
  const filtered = projects.filter(p => !q || (p.name || '').toLowerCase().includes(q))
  const unassigned = protocols.filter(p => !p.projectId)
  const protocolsFor = (id) => protocols.filter(p => p.projectId === id)
  const lastDate = (arr) => arr.length ? arr.map(p => p.date).sort().reverse()[0] : null

  // ── Create project and auto-focus its name input ────────────────────────────
  const handleCreate = () => {
    const id = onCreate()
    focusIdRef.current = id
  }

  // ── Open project (with lock check) ──────────────────────────────────────────
  const handleCardClick = (project) => {
    // Block navigation for unnamed projects so the user can type a name first
    if (!project.name.trim()) return
    if (project.passwordHash && !unlocked.has(project.id)) {
      setModal({ mode: 'unlock', projectId: project.id })
    } else {
      onOpenProject(project.id)
    }
  }

  // ── Lock button click ────────────────────────────────────────────────────────
  const handleLockClick = (e, project) => {
    e.stopPropagation()
    if (project.passwordHash) {
      // Already locked — offer change or remove (require current password first)
      setModal({ mode: 'remove', projectId: project.id })
    } else {
      setModal({ mode: 'set', projectId: project.id })
    }
  }

  // ── Modal confirm ────────────────────────────────────────────────────────────
  const handleModalConfirm = async (pw) => {
    const { mode, projectId } = modal
    const project = projects.find(p => p.id === projectId)

    if (mode === 'unlock') {
      const hash = await hashPassword(pw)
      if (hash !== project.passwordHash) throw new Error('Falsches Passwort.')
      setUnlocked(prev => new Set([...prev, projectId]))
      setModal(null)
      onOpenProject(projectId)
    }

    if (mode === 'set' || mode === 'change') {
      const hash = await hashPassword(pw)
      onUpdate(projectId, { passwordHash: hash })
      setUnlocked(prev => new Set([...prev, projectId]))
      setModal(null)
    }

    if (mode === 'remove') {
      const hash = await hashPassword(pw)
      if (hash !== project.passwordHash) throw new Error('Falsches Passwort.')
      onUpdate(projectId, { passwordHash: null })
      setUnlocked(prev => { const s = new Set(prev); s.delete(projectId); return s })
      setModal(null)
    }
  }

  const modalProject = modal ? projects.find(p => p.id === modal.projectId) : null

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Komplizen Protokolle</h1>
          <p className="text-sm text-gray-500 mt-0.5">Projekte &amp; Besprechungsprotokolle</p>
        </div>
        <button className="btn-primary self-start sm:self-auto" onClick={handleCreate}>
          <Plus size={16} /> Neues Projekt
        </button>
      </div>

      {/* Search */}
      {projects.length > 0 && (
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9" placeholder="Projekte durchsuchen…"
            value={search} onChange={e => setSearch(e.target.value)} />
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

      {/* Project cards */}
      <div className="space-y-3">
        {filtered.map(project => {
          const protos    = protocolsFor(project.id)
          const last      = lastDate(protos)
          const open      = protos.filter(p => !p.isClosed).length
          const closed    = protos.filter(p =>  p.isClosed).length
          const isLocked  = !!project.passwordHash
          const isSession = unlocked.has(project.id)

          return (
            <div key={project.id}
              className="card p-0 overflow-hidden hover:border-brand-400 transition-colors cursor-pointer group"
              onClick={() => handleCardClick(project)}
            >
              <div className="flex items-center gap-3 p-4">
                {/* Color bar */}
                <div className={`w-1.5 self-stretch rounded-full flex-shrink-0 ${isLocked ? 'bg-amber-400' : 'bg-brand-500'}`} />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <input
                      className="font-semibold text-base text-gray-900 bg-transparent border-none outline-none w-full focus:bg-white focus:border focus:border-brand-300 focus:rounded px-1 -ml-1"
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
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                    <span className="flex items-center gap-1">
                      <FileText size={11} />
                      {protos.length} Protokoll{protos.length !== 1 ? 'e' : ''}
                      {open   > 0 && <span className="badge-yellow ml-1">{open} offen</span>}
                      {closed > 0 && <span className="badge-gray ml-1">{closed} abgeschlossen</span>}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users size={11} />
                      {(project.contacts ?? []).length} Kontakt{(project.contacts ?? []).length !== 1 ? 'e' : ''}
                    </span>
                    {last && (
                      <span className="flex items-center gap-1">
                        <Calendar size={11} />
                        Zuletzt: {formatDate(last)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                  {/* Lock / unlock button */}
                  <button
                    className={`btn-ghost p-2 ${isLocked ? 'text-amber-500 hover:text-amber-700' : 'text-gray-400 hover:text-brand-600'}`}
                    title={isLocked ? 'Passwort ändern / entfernen' : 'Passwort festlegen'}
                    onClick={e => handleLockClick(e, project)}
                  >
                    {isLocked ? <Lock size={14} /> : <LockOpen size={14} />}
                  </button>
                  <button
                    className="btn-ghost p-2 text-red-400 hover:text-red-600 hover:bg-red-50"
                    title="Projekt löschen"
                    onClick={() => {
                      const n = protos.length
                      const msg = n > 0
                        ? `Projekt „${project.name || 'Unbenannt'}" löschen?\n${n} Protokoll${n !== 1 ? 'e werden' : ' wird'} nicht gelöscht, aber vom Projekt getrennt.`
                        : `Projekt „${project.name || 'Unbenannt'}" löschen?`
                      if (confirm(msg)) onDelete(project.id)
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <ChevronRight size={16} className="text-gray-300 group-hover:text-brand-500 transition-colors flex-shrink-0" />
              </div>
            </div>
          )
        })}

        {filtered.length === 0 && projects.length > 0 && (
          <p className="text-sm text-gray-400 text-center py-4">Kein Projekt gefunden.</p>
        )}
      </div>

      {/* Unassigned protocols */}
      {unassigned.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Protokolle ohne Projekt ({unassigned.length})
          </h2>
          <div
            className="card p-4 flex items-center gap-3 hover:border-brand-400 cursor-pointer transition-colors group"
            onClick={() => onOpenProject(null)}
          >
            <div className="w-1.5 self-stretch rounded-full bg-gray-300 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-gray-700">Nicht zugeordnete Protokolle</p>
              <p className="text-xs text-gray-400 mt-0.5">{unassigned.length} Protokoll{unassigned.length !== 1 ? 'e' : ''}</p>
            </div>
            <ChevronRight size={16} className="text-gray-300 group-hover:text-brand-500 transition-colors" />
          </div>
        </div>
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
