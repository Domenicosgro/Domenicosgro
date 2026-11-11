import React, { useCallback, useEffect, useState } from 'react'
import { Folder, FileText, ChevronRight, Loader, AlertCircle, X, FolderPlus, Link2, HardDrive, Home } from 'lucide-react'
import { api, useEscape } from './api'

// ── Ordnerauswahl auf der NAS ────────────────────────────────────────────────
// Durchsucht die Freigaben über die File Station (Service-Konto). Startet im
// aktuell verknüpften Ordner, sonst im Projektordner, sonst bei den Freigaben.
// Neue Ordner lassen sich direkt anlegen – z. B. „Nachtrag 008".
export default function FolderPicker({ startPath, projectPath, suggestedName, onSelect, onClose }) {
  const [path,    setPath]    = useState(null)
  const [parent,  setParent]  = useState(null)
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [newName, setNewName] = useState('')
  const [showNew, setShowNew] = useState(false)
  useEscape(onClose)

  const load = useCallback(async (p) => {
    setLoading(true); setError(null)
    try {
      const data = await api(`/api/pruefstation/browse${p ? `?path=${encodeURIComponent(p)}` : ''}`)
      setPath(data.path); setParent(data.parent); setEntries(data.entries || [])
    } catch (e) {
      setError(e.message)
      if (p) { // Ordner gibt es nicht (mehr) → bei den Freigaben weitermachen
        try {
          const data = await api('/api/pruefstation/browse')
          setPath(data.path); setParent(null); setEntries(data.entries || [])
        } catch {}
      }
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load(startPath || projectPath || '') }, [load, startPath, projectPath])

  const createFolder = async () => {
    const name = newName.trim()
    if (!name || !path) return
    try {
      const { path: created } = await api('/api/pruefstation/folders', { method: 'POST', body: { parent: path, name } })
      setShowNew(false); setNewName('')
      await load(created)
    } catch (e) { setError(e.message) }
  }

  const crumbs = path ? path.split('/').filter(Boolean).map((seg, i, arr) => ({ label: seg, path: '/' + arr.slice(0, i + 1).join('/') })) : []
  const folders = entries.filter(e => e.isdir)
  const files   = entries.filter(e => !e.isdir)

  return (
    <div className="fixed inset-0 z-50 bg-night/40 flex items-center justify-center p-4" onMouseDown={onClose}>
      <div className="card w-full max-w-2xl max-h-[85vh] flex flex-col" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-concrete">
          <h2 className="font-semibold text-night flex items-center gap-2"><HardDrive size={16} className="text-brand-600" /> NAS-Ordner verknüpfen</h2>
          <button className="btn-ghost p-1" onClick={onClose} aria-label="Schließen"><X size={16} /></button>
        </div>

        {/* Pfad */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-concrete bg-gray-50 text-sm overflow-x-auto">
          <button className="flex-shrink-0 text-brand-600 hover:underline flex items-center gap-1" onClick={() => load('')}>
            <HardDrive size={13} /> Freigaben
          </button>
          {crumbs.map((c, i) => (
            <React.Fragment key={c.path}>
              <ChevronRight size={13} className="text-gray-300 flex-shrink-0" />
              <button className={`flex-shrink-0 ${i === crumbs.length - 1 ? 'font-medium text-night' : 'text-brand-600 hover:underline'}`}
                onClick={() => load(c.path)}>{c.label}</button>
            </React.Fragment>
          ))}
          {projectPath && path !== projectPath && (
            <button className="ml-auto flex-shrink-0 btn-ghost text-xs py-0.5" onClick={() => load(projectPath)} title={projectPath}>
              <Home size={12} /> Projektordner
            </button>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-700 bg-red-50 border-b border-red-200 px-4 py-2 flex items-center gap-2">
            <AlertCircle size={14} /> {error}
          </p>
        )}

        <div className="flex-1 overflow-y-auto min-h-[240px]">
          {loading ? (
            <div className="p-10 text-center text-gray-400"><Loader size={20} className="animate-spin mx-auto" /></div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {parent !== null && path && (
                <li>
                  <button className="w-full text-left px-4 py-2 text-sm text-gray-500 hover:bg-gray-50" onClick={() => load(parent)}>.. (übergeordneter Ordner)</button>
                </li>
              )}
              {folders.map(f => (
                <li key={f.path}>
                  <button className="w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-sky/10" onClick={() => load(f.path)}>
                    <Folder size={15} className="text-amber-500 flex-shrink-0" /> <span className="truncate">{f.name}</span>
                  </button>
                </li>
              ))}
              {files.slice(0, 50).map(f => (
                <li key={f.path} className="px-4 py-1.5 text-xs text-gray-400 flex items-center gap-2">
                  <FileText size={13} className="flex-shrink-0" /> <span className="truncate">{f.name}</span>
                </li>
              ))}
              {files.length > 50 && <li className="px-4 py-1.5 text-xs text-gray-400">… und {files.length - 50} weitere Dateien</li>}
              {!folders.length && !files.length && <li className="px-4 py-8 text-center text-sm text-gray-400">Ordner ist leer.</li>}
            </ul>
          )}
        </div>

        {/* Neuer Ordner */}
        {path && showNew && (
          <div className="flex gap-2 px-4 py-2 border-t border-concrete bg-gray-50">
            <input className="input flex-1" autoFocus value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') setShowNew(false) }}
              placeholder="Name des neuen Ordners" />
            <button className="btn-primary" onClick={createFolder} disabled={!newName.trim()}>Anlegen</button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-t border-concrete">
          <p className="text-xs text-gray-500 flex-1 min-w-[200px] truncate" title={path || ''}>
            {path ? <>Auswahl: <span className="font-medium text-night">{path}</span></> : 'Freigabe auswählen'}
          </p>
          {path && !showNew && (
            <button className="btn-secondary" onClick={() => { setShowNew(true); setNewName(suggestedName || '') }}>
              <FolderPlus size={14} /> Neuer Ordner
            </button>
          )}
          <button className="btn-primary" disabled={!path} onClick={() => onSelect(path)}>
            <Link2 size={14} /> Diesen Ordner verknüpfen
          </button>
        </div>
      </div>
    </div>
  )
}
