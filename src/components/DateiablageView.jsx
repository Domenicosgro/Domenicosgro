import React, { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, Folder, FileText, Download, Loader, AlertCircle, X,
         HardDrive, ChevronRight, Save } from 'lucide-react'
import { formatDate } from '../utils'

const authHeaders = () => {
  const t = typeof localStorage !== 'undefined' ? localStorage.getItem('kp_session_token') : null
  return t ? { Authorization: `Bearer ${t}` } : {}
}

function formatBytes(bytes) {
  if (!bytes) return '–'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export default function DateiablageView({ project, serverUser, canAdmin, onUpdateProject, onBack }) {
  const [path,        setPath]        = useState(null)   // null = Wurzel laden
  const [root,        setRoot]        = useState('')
  const [files,       setFiles]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [downloading, setDownloading] = useState(null)
  const [fsPathDraft, setFsPathDraft] = useState(project.fsPath || '')

  const load = useCallback(async (targetPath) => {
    setLoading(true)
    setError(null)
    try {
      const q   = targetPath ? `?path=${encodeURIComponent(targetPath)}` : ''
      const res = await fetch(`/api/projects/${project.id}/files${q}`, { headers: authHeaders() })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `Fehler ${res.status}`)
      setRoot(data.root)
      setPath(data.path)
      setFiles(data.files || [])
    } catch (e) {
      setError(e.message)
      setFiles([])
    } finally { setLoading(false) }
  }, [project.id])

  useEffect(() => { if (project.fsPath) load(null) ; else setLoading(false) }, [load, project.fsPath])

  const download = async (file) => {
    setDownloading(file.path)
    try {
      const res = await fetch(`/api/projects/${project.id}/files/download?path=${encodeURIComponent(file.path)}`, { headers: authHeaders() })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Fehler ${res.status}`)
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = file.name
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } catch (e) { setError(`Download fehlgeschlagen: ${e.message}`) }
    finally { setDownloading(null) }
  }

  // Breadcrumb relativ zur Projektwurzel
  const crumbs = (() => {
    if (!path || !root) return []
    const rel = path === root ? '' : path.slice(root.length + 1)
    const parts = rel ? rel.split('/') : []
    const out = [{ label: root.split('/').pop() || 'Projektordner', path: root }]
    let acc = root
    for (const p of parts) { acc += '/' + p; out.push({ label: p, path: acc }) }
    return out
  })()

  const saveFsPath = () => {
    const clean = fsPathDraft.trim().replace(/\/+$/, '')
    onUpdateProject(project.id, { fsPath: clean })
    if (clean) setTimeout(() => load(null), 400)
  }

  return (
    <div className="app-page">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="flex items-end gap-3">
          <button className="btn-secondary" onClick={onBack}><ArrowLeft size={16} /> Dashboard</button>
          <div>
            <h1 className="text-2xl font-bold text-night flex items-center gap-2">
              <HardDrive size={22} className="text-brand-600" /> Dateiablage
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">{project.name} · Synology-Projektordner</p>
          </div>
        </div>
      </div>

      {/* Konfiguration (Projekt-/Systemadmin) */}
      {canAdmin && (
        <div className="card p-4">
          <p className="text-xs font-medium text-gray-500 mb-1.5">NAS-Projektordner (Pfad auf der Synology, z. B. /projekte/1234_Beispiel)</p>
          <div className="flex gap-2">
            <input className="input flex-1" placeholder="/freigabe/projektordner"
              value={fsPathDraft} onChange={e => setFsPathDraft(e.target.value)} />
            <button className="btn-primary" onClick={saveFsPath} disabled={fsPathDraft.trim() === (project.fsPath || '')}>
              <Save size={14} /> Speichern
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 px-4 py-2 flex items-center gap-2">
          <AlertCircle size={14} /> {error}
          <button className="ml-auto text-red-400" onClick={() => setError(null)}><X size={13} /></button>
        </p>
      )}

      {!project.fsPath ? (
        <div className="card p-12 text-center text-gray-400">
          <HardDrive size={36} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-500">Kein Projektordner verknüpft.</p>
          <p className="text-xs mt-1">
            {canAdmin ? 'Hinterlege oben den Pfad des Projektordners auf der NAS.' : 'Ein Projekt-Administrator kann den NAS-Ordner verknüpfen.'}
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1 px-4 py-2.5 border-b border-gray-100 bg-gray-50/60 text-sm overflow-x-auto">
            {crumbs.map((c, i) => (
              <React.Fragment key={c.path}>
                {i > 0 && <ChevronRight size={13} className="text-gray-300 flex-shrink-0" />}
                <button
                  className={`flex-shrink-0 ${i === crumbs.length - 1 ? 'font-medium text-gray-800' : 'text-brand-600 hover:underline'}`}
                  onClick={() => load(c.path)}
                >
                  {i === 0 ? <span className="flex items-center gap-1"><Folder size={13} /> {c.label}</span> : c.label}
                </button>
              </React.Fragment>
            ))}
          </div>

          {loading ? (
            <div className="p-10 text-center text-gray-400"><Loader size={20} className="animate-spin mx-auto" /></div>
          ) : files.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-400">Ordner ist leer.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {[...files].sort((a, b) => (b.isdir ? 1 : 0) - (a.isdir ? 1 : 0) || a.name.localeCompare(b.name, 'de')).map(f => (
                <div key={f.path} className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 transition-colors group">
                  {f.isdir
                    ? <Folder size={16} className="text-amber-400 flex-shrink-0" />
                    : <FileText size={16} className="text-gray-400 flex-shrink-0" />}
                  {f.isdir ? (
                    <button className="flex-1 text-left text-sm font-medium text-gray-800 hover:text-brand-700 truncate" onClick={() => load(f.path)}>
                      {f.name}
                    </button>
                  ) : (
                    <span className="flex-1 text-sm text-gray-700 truncate">{f.name}</span>
                  )}
                  <span className="text-xs text-gray-400 flex-shrink-0 hidden sm:inline">
                    {f.mtime ? formatDate(new Date(f.mtime * 1000).toISOString().slice(0, 10)) : ''}
                  </span>
                  {!f.isdir && (
                    <>
                      <span className="text-xs text-gray-400 flex-shrink-0 w-16 text-right">{formatBytes(f.size)}</span>
                      <button className="btn-ghost p-1.5 text-gray-400 hover:text-brand-600 flex-shrink-0" title="Herunterladen"
                        onClick={() => download(f)} disabled={downloading === f.path}>
                        {downloading === f.path ? <Loader size={14} className="animate-spin" /> : <Download size={14} />}
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
