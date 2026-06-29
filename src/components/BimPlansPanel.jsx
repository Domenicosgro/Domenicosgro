import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, X, FileText, Image as ImageIcon, Trash2, Pencil, Upload, Loader, AlertCircle, Map } from 'lucide-react'
import { formatDate } from '../utils'

const PLAN_TYPES = [
  { value: 'grundriss', label: 'Grundriss' },
  { value: 'schnitt',   label: 'Schnitt' },
  { value: 'ansicht',   label: 'Ansicht' },
  { value: 'lageplan',  label: 'Lageplan' },
  { value: 'sonstige',  label: 'Sonstige' },
]
const typeLabel = (t) => PLAN_TYPES.find(p => p.value === t)?.label || 'Plan'

function formatBytes(bytes) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── Formular zum Anlegen/Bearbeiten + Datei-Upload ──────────────────────────
function PlanForm({ projectId, token, plan, onSaved, onCancel }) {
  const isEdit = !!plan
  const [title,       setTitle]       = useState(plan?.title       || '')
  const [planType,    setPlanType]    = useState(plan?.planType    || 'grundriss')
  const [description, setDescription] = useState(plan?.description || '')
  const [file,        setFile]        = useState(null)
  const [busy,        setBusy]        = useState(false)
  const [progress,    setProgress]    = useState(0)
  const [error,       setError]       = useState(null)
  const fileRef = useRef(null)

  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {}

  const save = async () => {
    if (!title.trim()) { setError('Bitte einen Titel angeben.'); return }
    if (!isEdit && !file) { setError('Bitte eine Datei (PDF oder Bild) auswählen.'); return }
    setBusy(true); setError(null)
    try {
      let planId = plan?.id
      const meta = { title: title.trim(), planType, description: description.trim() }
      if (isEdit) {
        const res = await fetch(`/api/projects/${projectId}/plans/${planId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify(meta),
        })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Fehler ${res.status}`)
      } else {
        const res = await fetch(`/api/projects/${projectId}/plans`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify(meta),
        })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Fehler ${res.status}`)
        planId = (await res.json()).id
      }
      if (file) {
        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest()
          xhr.open('POST', `/api/projects/${projectId}/plans/${planId}/file`)
          if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
          xhr.setRequestHeader('Content-Type', 'application/octet-stream')
          xhr.setRequestHeader('X-Filename', file.name)
          xhr.setRequestHeader('X-Mimetype', file.type || 'application/pdf')
          xhr.upload.onprogress = (e) => { if (e.lengthComputable) setProgress(Math.round(e.loaded / e.total * 100)) }
          xhr.onload  = () => xhr.status < 300 ? resolve() : reject(new Error(xhr.responseText || `Fehler ${xhr.status}`))
          xhr.onerror = () => reject(new Error('Netzwerkfehler beim Upload'))
          xhr.send(file)
        })
      }
      onSaved()
    } catch (e) {
      setError(e.message); setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 p-3 border-t border-gray-700" style={{ background: '#1a1a2e' }}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-200">{isEdit ? 'Plan bearbeiten' : 'Neuer Plan'}</span>
        <button onClick={onCancel} className="text-gray-500 hover:text-gray-300 transition-colors" disabled={busy}><X size={13} /></button>
      </div>

      {error && (
        <div className="flex items-center gap-1.5 text-xs text-red-400 bg-red-900/20 border border-red-800 px-2 py-1">
          <AlertCircle size={11} /> {error}
        </div>
      )}

      <input placeholder="Titel *" value={title} onChange={e => setTitle(e.target.value)} autoFocus
        className="w-full bg-gray-800 border border-gray-600 text-white text-xs px-2 py-1.5 placeholder-gray-600 focus:outline-none focus:border-brand-500" />

      <select value={planType} onChange={e => setPlanType(e.target.value)}
        className="bg-gray-800 border border-gray-600 text-white text-xs px-2 py-1.5 focus:outline-none focus:border-brand-500">
        {PLAN_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>

      <textarea placeholder="Beschreibung (optional)" value={description} onChange={e => setDescription(e.target.value)} rows={2}
        className="w-full bg-gray-800 border border-gray-600 text-white text-xs px-2 py-1.5 placeholder-gray-600 focus:outline-none focus:border-brand-500 resize-none" />

      <input ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden"
        onChange={e => { setFile(e.target.files?.[0] || null); setError(null) }} />
      <button onClick={() => fileRef.current?.click()} disabled={busy}
        className="flex items-center justify-center gap-1.5 text-xs px-2 py-1.5 border border-gray-600 text-gray-300 hover:border-gray-500 transition-colors">
        <Upload size={11} /> {file ? file.name : (isEdit ? 'Datei ersetzen…' : 'PDF/Bild wählen…')}
      </button>
      {file && <p className="text-[10px] text-gray-500">{formatBytes(file.size)}</p>}
      {isEdit && plan?.filename && !file && <p className="text-[10px] text-gray-500">Aktuell: {plan.filename} · {formatBytes(plan.size)}</p>}

      {busy && progress > 0 && (
        <div className="h-1.5 bg-gray-800 overflow-hidden">
          <div className="h-full bg-brand-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button onClick={onCancel} disabled={busy}
          className="flex-1 text-xs px-2 py-1.5 border border-gray-600 text-gray-400 hover:text-white hover:border-gray-500 transition-colors">Abbrechen</button>
        <button onClick={save} disabled={busy}
          className="flex-1 text-xs px-2 py-1.5 bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-40 transition-colors flex items-center justify-center gap-1">
          {busy ? <><Loader size={11} className="animate-spin" /> Speichern…</> : 'Speichern'}
        </button>
      </div>
    </div>
  )
}

export default function BimPlansPanel({ project, token, canEdit, onOpenPlan, onClose }) {
  const [plans,    setPlans]    = useState([])
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)
  const [creating, setCreating] = useState(false)
  const [editing,  setEditing]  = useState(null)

  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {}

  const fetchPlans = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/projects/${project.id}/plans`, { headers: authHeaders })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Fehler ${res.status}`)
      setPlans(await res.json())
    } catch (e) {
      setError(`Pläne konnten nicht geladen werden: ${e.message}`)
    } finally { setLoading(false) }
  }, [project.id, token])

  useEffect(() => { fetchPlans() }, [fetchPlans])

  const handleDelete = async (plan) => {
    if (!window.confirm(`Plan „${plan.title}" wirklich löschen?`)) return
    try {
      const res = await fetch(`/api/projects/${project.id}/plans/${plan.id}`, { method: 'DELETE', headers: authHeaders })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Fehler ${res.status}`)
      fetchPlans()
    } catch (e) { setError(`Löschen fehlgeschlagen: ${e.message}`) }
  }

  // Nach Typ gruppieren
  const groups = PLAN_TYPES
    .map(t => ({ type: t, items: plans.filter(p => p.planType === t.value) }))
    .filter(g => g.items.length > 0)

  return (
    <div className="flex flex-col w-72 flex-shrink-0 border-r border-gray-700 bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Map size={13} className="text-brand-400" />
          <span className="text-xs font-semibold text-gray-200">2D-Pläne</span>
          {plans.length > 0 && <span className="text-[10px] text-gray-500">{plans.length}</span>}
        </div>
        <div className="flex items-center gap-1.5">
          {canEdit && (
            <button
              onClick={() => { setCreating(true); setEditing(null) }}
              className="flex items-center gap-1 text-xs px-2 py-1 bg-brand-700/60 hover:bg-brand-700 text-brand-200 border border-brand-600 transition-colors"
            ><Plus size={11} /> Neu</button>
          )}
          {onClose && (
            <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors" title="Schließen"><X size={14} /></button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-1.5 px-3 py-2 text-xs text-red-400 bg-red-900/20 border-b border-red-900/40 flex-shrink-0">
          <AlertCircle size={11} className="flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-600 hover:text-red-400"><X size={11} /></button>
        </div>
      )}

      {/* Liste */}
      <div className="flex-1 overflow-y-auto">
        {loading && <p className="text-xs text-gray-500 p-4 text-center">Laden…</p>}
        {!loading && plans.length === 0 && !creating && (
          <div className="p-4 text-center">
            <p className="text-xs text-gray-500">Keine Pläne hinterlegt</p>
            {canEdit && <p className="text-[10px] text-gray-600 mt-1">Lade Grundrisse, Schnitte oder Ansichten als PDF/Bild hoch.</p>}
          </div>
        )}

        {groups.map(({ type, items }) => (
          <div key={type.value}>
            <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-gray-500 bg-gray-850 border-b border-gray-800" style={{ background: '#16161f' }}>
              {type.label} <span className="opacity-60">{items.length}</span>
            </div>
            {items.map(plan => (
              editing?.id === plan.id ? (
                <PlanForm key={plan.id} projectId={project.id} token={token} plan={editing}
                  onSaved={() => { setEditing(null); fetchPlans() }} onCancel={() => setEditing(null)} />
              ) : (
                <div key={plan.id} className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors group">
                  <div className="px-3 py-2.5 flex items-start gap-2">
                    <button
                      onClick={() => plan.hasFile && onOpenPlan(plan)}
                      disabled={!plan.hasFile}
                      className="flex items-start gap-2 min-w-0 flex-1 text-left disabled:cursor-default"
                      title={plan.hasFile ? 'Plan anzeigen' : 'Keine Datei hochgeladen'}
                    >
                      <span className="flex-shrink-0 mt-0.5 text-gray-400 group-hover:text-brand-400 transition-colors">
                        {(plan.mimeType || '').includes('pdf') ? <FileText size={14} /> : <ImageIcon size={14} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-medium text-gray-200 truncate">{plan.title}</span>
                        <span className="block text-[10px] text-gray-500 truncate">
                          {plan.hasFile ? `${plan.filename} · ${formatBytes(plan.size)}` : 'Keine Datei'}
                        </span>
                        {plan.description && <span className="block text-[10px] text-gray-600 truncate mt-0.5">{plan.description}</span>}
                      </span>
                    </button>
                    {canEdit && (
                      <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { setEditing(plan); setCreating(false) }} title="Bearbeiten"
                          className="text-gray-500 hover:text-gray-300 transition-colors p-0.5"><Pencil size={12} /></button>
                        <button onClick={() => handleDelete(plan)} title="Löschen"
                          className="text-gray-500 hover:text-red-400 transition-colors p-0.5"><Trash2 size={12} /></button>
                      </div>
                    )}
                  </div>
                </div>
              )
            ))}
          </div>
        ))}
      </div>

      {creating && !editing && (
        <PlanForm projectId={project.id} token={token}
          onSaved={() => { setCreating(false); fetchPlans() }} onCancel={() => setCreating(false)} />
      )}
    </div>
  )
}
