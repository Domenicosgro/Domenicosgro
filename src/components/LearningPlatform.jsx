import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { ArrowLeft, GraduationCap, Plus, Play, Upload, Loader, X, Pencil,
         Trash2, Film, AlertCircle, FolderOpen, ChevronRight } from 'lucide-react'

const isServer = typeof window !== 'undefined' && !!window.__SERVER_MODE__

function formatBytes(bytes) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

const token = () => (typeof localStorage !== 'undefined' ? localStorage.getItem('kp_session_token') : null)
const authHeaders = () => { const t = token(); return t ? { Authorization: `Bearer ${t}` } : {} }

// ── Upload-/Bearbeiten-Modal ────────────────────────────────────────────────
function VideoModal({ video, categories, onClose, onSaved }) {
  const isEdit = !!video
  const [title,       setTitle]       = useState(video?.title       || '')
  const [description, setDescription] = useState(video?.description || '')
  const [category,    setCategory]    = useState(video?.category    || 'Allgemein')
  const [file,        setFile]        = useState(null)
  const [uploading,   setUploading]   = useState(false)
  const [progress,    setProgress]    = useState(0)
  const [error,       setError]       = useState(null)
  const fileRef = useRef(null)

  const save = async () => {
    if (!title.trim()) { setError('Bitte einen Titel angeben.'); return }
    if (!isEdit && !file) { setError('Bitte eine Videodatei auswählen.'); return }
    setUploading(true)
    setError(null)
    try {
      let videoId = video?.id
      const meta = { title: title.trim(), description: description.trim(), category: category.trim() || 'Allgemein' }

      if (isEdit) {
        const res = await fetch(`/api/learning-videos/${videoId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify(meta),
        })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Fehler ${res.status}`)
      } else {
        const res = await fetch('/api/learning-videos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify(meta),
        })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Fehler ${res.status}`)
        videoId = (await res.json()).id
      }

      // Datei hochladen (falls eine neue gewählt wurde)
      if (file) {
        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest()
          xhr.open('POST', `/api/learning-videos/${videoId}/file`)
          const t = token()
          if (t) xhr.setRequestHeader('Authorization', `Bearer ${t}`)
          xhr.setRequestHeader('Content-Type', 'application/octet-stream')
          xhr.setRequestHeader('X-Filename', file.name)
          xhr.setRequestHeader('X-Mimetype', file.type || 'video/mp4')
          xhr.upload.onprogress = (e) => { if (e.lengthComputable) setProgress(Math.round(e.loaded / e.total * 100)) }
          xhr.onload  = () => xhr.status < 300 ? resolve() : reject(new Error(xhr.responseText || `Fehler ${xhr.status}`))
          xhr.onerror = () => reject(new Error('Netzwerkfehler beim Upload'))
          xhr.send(file)
        })
      }
      onSaved()
      onClose()
    } catch (e) {
      // Bei fehlgeschlagenem Upload das gerade angelegte (leere) Video wieder entfernen
      if (!isEdit && video?.id == null) { /* best effort – Liste wird neu geladen */ }
      setError(e.message)
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-night flex items-center gap-2">
            <Film size={18} /> {isEdit ? 'Video bearbeiten' : 'Schulungsvideo hinzufügen'}
          </h3>
          <button className="btn-ghost p-1" onClick={onClose} disabled={uploading}><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2">
              <AlertCircle size={14} className="flex-shrink-0" /> {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Titel *</label>
            <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="z. B. Protokoll anlegen" autoFocus />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Kategorie</label>
            <input className="input" value={category} onChange={e => setCategory(e.target.value)} list="learning-categories" placeholder="z. B. Grundlagen" />
            <datalist id="learning-categories">
              {categories.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Beschreibung</label>
            <textarea className="input resize-none" rows={3} value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Worum geht es in diesem Video?" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Videodatei {isEdit && <span className="text-gray-400">(leer lassen, um die vorhandene zu behalten)</span>}
            </label>
            <input ref={fileRef} type="file" accept="video/*" className="hidden"
              onChange={e => { setFile(e.target.files?.[0] || null); setError(null) }} />
            <button className="btn-secondary w-full justify-center" onClick={() => fileRef.current?.click()} disabled={uploading}>
              <Upload size={14} /> {file ? file.name : (isEdit ? 'Andere Datei wählen…' : 'Datei auswählen…')}
            </button>
            {file && <p className="text-xs text-gray-400 mt-1">{formatBytes(file.size)}</p>}
            {isEdit && video?.filename && !file && (
              <p className="text-xs text-gray-400 mt-1">Aktuell: {video.filename} · {formatBytes(video.size)}</p>
            )}
          </div>

          {uploading && progress > 0 && (
            <div>
              <div className="h-2 bg-gray-100 overflow-hidden">
                <div className="h-full bg-brand-500 transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-xs text-gray-400 mt-1">Wird hochgeladen… {progress}%</p>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose} disabled={uploading}>Abbrechen</button>
          <button className="btn-primary" onClick={save} disabled={uploading}>
            {uploading ? <><Loader size={14} className="animate-spin" /> Speichern…</> : <>Speichern</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Hauptansicht ────────────────────────────────────────────────────────────
export default function LearningPlatform({ serverUser, onBack }) {
  const [videos,    setVideos]    = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [selected,  setSelected]  = useState(null)
  const [modal,     setModal]     = useState(null)   // { video } | { } für neu
  const [activeCat, setActiveCat] = useState(null)

  const isAdmin = isServer && serverUser?.role === 'admin'

  const fetchVideos = useCallback(async () => {
    if (!isServer) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/learning-videos', { headers: authHeaders() })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Fehler ${res.status}`)
      const data = await res.json()
      setVideos(data)
      setSelected(prev => prev ? data.find(v => v.id === prev.id) || data.find(v => v.hasFile) || null
                               : data.find(v => v.hasFile) || data[0] || null)
    } catch (e) {
      setError(`Videos konnten nicht geladen werden: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchVideos() }, [fetchVideos])

  // Kategorien (sortiert) + Gruppierung
  const categories = useMemo(() => {
    const set = new Set(videos.map(v => v.category || 'Allgemein'))
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'de'))
  }, [videos])

  const visibleVideos = useMemo(() => {
    const list = activeCat ? videos.filter(v => (v.category || 'Allgemein') === activeCat) : videos
    return list
  }, [videos, activeCat])

  const handleDelete = async (video) => {
    if (!window.confirm(`Video „${video.title}" wirklich löschen?`)) return
    try {
      const res = await fetch(`/api/learning-videos/${video.id}`, { method: 'DELETE', headers: authHeaders() })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Fehler ${res.status}`)
      if (selected?.id === video.id) setSelected(null)
      fetchVideos()
    } catch (e) {
      setError(`Löschen fehlgeschlagen: ${e.message}`)
    }
  }

  // Lokaler/Electron-Modus: Plattform braucht den Server
  if (!isServer) {
    return (
      <div className="app-page">
        <div className="flex items-end gap-3">
          <button className="btn-secondary" onClick={onBack}><ArrowLeft size={16} /> Start</button>
          <h1 className="text-2xl font-bold text-night flex items-center gap-2">
            <GraduationCap size={24} className="text-brand-600" /> Learning-Plattform
          </h1>
        </div>
        <div className="card p-12 text-center text-gray-500">
          <Film size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm">Die Learning-Plattform ist nur im Server-Modus verfügbar.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="app-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="flex items-end gap-3">
          <button className="btn-secondary" onClick={onBack}><ArrowLeft size={16} /> Start</button>
          <div>
            <h1 className="text-2xl font-bold text-night flex items-center gap-2">
              <GraduationCap size={24} className="text-brand-600" /> Learning-Plattform
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Schulungsvideos zur richtigen Nutzung des Programms
              {videos.length > 0 && ` · ${videos.length} Video${videos.length !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>
        {isAdmin && (
          <button className="btn-primary" onClick={() => setModal({})}>
            <Plus size={16} /> Video hinzufügen
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2">
          <AlertCircle size={14} className="flex-shrink-0" /> {error}
          <button className="ml-auto text-red-400 hover:text-red-600" onClick={() => setError(null)}><X size={14} /></button>
        </div>
      )}

      {loading ? (
        <div className="card p-12 text-center text-gray-400 text-sm">
          <Loader size={24} className="animate-spin mx-auto mb-2 text-brand-400" /> Videos werden geladen…
        </div>
      ) : videos.length === 0 ? (
        <div className="card p-12 text-center text-gray-500">
          <Film size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm font-medium">Noch keine Schulungsvideos vorhanden.</p>
          {isAdmin
            ? <p className="text-xs text-gray-400 mt-1">Lade das erste Video über „Video hinzufügen" hoch.</p>
            : <p className="text-xs text-gray-400 mt-1">Sobald ein Administrator Videos hochlädt, erscheinen sie hier.</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Player */}
          <div className="lg:col-span-2 space-y-3">
            {selected && selected.hasFile ? (
              <>
                <div className="bg-black overflow-hidden border border-gray-200">
                  <video
                    key={selected.id}
                    controls
                    className="w-full aspect-video bg-black"
                    src={`/api/learning-videos/${selected.id}/file?token=${encodeURIComponent(token() || '')}`}
                  />
                </div>
                <div className="card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="badge-blue text-xs mb-1 inline-block">{selected.category || 'Allgemein'}</span>
                      <h2 className="text-lg font-semibold text-night">{selected.title}</h2>
                    </div>
                    {isAdmin && (
                      <div className="flex gap-1 flex-shrink-0">
                        <button className="btn-ghost p-1.5 text-gray-400 hover:text-brand-600" title="Bearbeiten"
                          onClick={() => setModal({ video: selected })}><Pencil size={15} /></button>
                        <button className="btn-ghost p-1.5 text-gray-400 hover:text-red-600" title="Löschen"
                          onClick={() => handleDelete(selected)}><Trash2 size={15} /></button>
                      </div>
                    )}
                  </div>
                  {selected.description && (
                    <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{selected.description}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-3">
                    {selected.filename} · {formatBytes(selected.size)}
                    {selected.uploadedBy && ` · hochgeladen von ${selected.uploadedBy}`}
                  </p>
                </div>
              </>
            ) : selected ? (
              <div className="card p-12 text-center text-gray-400">
                <Film size={36} className="mx-auto text-gray-300 mb-2" />
                <p className="text-sm">Für „{selected.title}" wurde noch keine Videodatei hochgeladen.</p>
                {isAdmin && (
                  <button className="btn-secondary mt-3 mx-auto" onClick={() => setModal({ video: selected })}>
                    <Upload size={14} /> Datei hochladen
                  </button>
                )}
              </div>
            ) : (
              <div className="card p-12 text-center text-gray-400 text-sm">Wähle rechts ein Video aus.</div>
            )}
          </div>

          {/* Liste / Kategorien */}
          <div className="space-y-3">
            {/* Kategorie-Filter */}
            {categories.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setActiveCat(null)}
                  className={`text-xs px-2.5 py-1 border transition-colors ${!activeCat ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
                >Alle</button>
                {categories.map(c => (
                  <button key={c}
                    onClick={() => setActiveCat(c)}
                    className={`text-xs px-2.5 py-1 border transition-colors ${activeCat === c ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
                  >{c}</button>
                ))}
              </div>
            )}

            <div className="card divide-y divide-gray-100 overflow-hidden">
              {visibleVideos.map(v => {
                const active = selected?.id === v.id
                return (
                  <button
                    key={v.id}
                    onClick={() => setSelected(v)}
                    className={`w-full text-left px-3 py-2.5 flex items-start gap-2.5 transition-colors group ${active ? 'bg-brand-50' : 'hover:bg-gray-50'}`}
                  >
                    <span className={`flex-shrink-0 mt-0.5 w-9 h-9 flex items-center justify-center ${active ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-400 group-hover:text-brand-600'}`}>
                      {v.hasFile ? <Play size={15} /> : <Film size={15} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm font-medium truncate ${active ? 'text-brand-700' : 'text-gray-800'}`}>{v.title}</span>
                      <span className="block text-xs text-gray-400 truncate">
                        {v.category || 'Allgemein'}{v.hasFile ? '' : ' · keine Datei'}
                      </span>
                    </span>
                    {active && <ChevronRight size={14} className="text-brand-500 flex-shrink-0 mt-1.5" />}
                  </button>
                )
              })}
              {visibleVideos.length === 0 && (
                <div className="px-3 py-6 text-center text-xs text-gray-400 flex flex-col items-center gap-1">
                  <FolderOpen size={20} className="text-gray-300" />
                  Keine Videos in dieser Kategorie.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {modal && (
        <VideoModal
          video={modal.video}
          categories={categories}
          onClose={() => setModal(null)}
          onSaved={fetchVideos}
        />
      )}
    </div>
  )
}
