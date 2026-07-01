import React, { useState, useCallback, useEffect, useRef } from 'react'
import { X, Move, Maximize2, FileText, Image as ImageIcon, ExternalLink, ZoomIn, ZoomOut,
         Loader, AlertCircle, ClipboardCheck, Plus, Trash2, Pencil, Mail, ArrowRight,
         Video, MapPin, Crosshair, Check } from 'lucide-react'
import { formatDate } from '../utils'

const INIT_W = typeof window !== 'undefined' ? Math.min(1280, Math.round(window.innerWidth  * 0.9)) : 1100
const INIT_H = typeof window !== 'undefined' ? Math.min(760, Math.round(window.innerHeight * 0.85)) : 680

const REVIEW_TYPES = {
  pruefung: { label: 'Prüfung', color: 'text-brand-400',  dot: 'bg-brand-500' },
  mangel:   { label: 'Mangel',  color: 'text-red-400',    dot: 'bg-red-500' },
  hinweis:  { label: 'Hinweis', color: 'text-gray-400',   dot: 'bg-gray-400' },
  freigabe: { label: 'Freigabe',color: 'text-green-400',  dot: 'bg-green-500' },
}
const REVIEW_STATUS = {
  offen:        { label: 'Offen',        badge: 'bg-red-900/40 text-red-300 border-red-800' },
  in_pruefung:  { label: 'In Prüfung',   badge: 'bg-yellow-900/40 text-yellow-300 border-yellow-800' },
  geprueft:     { label: 'Geprüft',      badge: 'bg-blue-900/40 text-blue-300 border-blue-800' },
  freigegeben:  { label: 'Freigegeben',  badge: 'bg-green-900/40 text-green-300 border-green-800' },
  abgelehnt:    { label: 'Abgelehnt',    badge: 'bg-gray-800 text-gray-400 border-gray-600' },
}
const REVIEW_PRIORITY = {
  hoch:    { label: 'Hoch',    color: 'text-red-400' },
  mittel:  { label: 'Mittel',  color: 'text-yellow-400' },
  niedrig: { label: 'Niedrig', color: 'text-gray-500' },
}
const STATUS_ORDER = ['offen', 'in_pruefung', 'geprueft', 'freigegeben', 'abgelehnt']

// ── Prüfvermerk-Formular ────────────────────────────────────────────────────
function ReviewForm({ review, contacts, pendingPosition, hasViewpoint, canPosition,
                      onSave, onCancel, onRequestPosition, onCaptureViewpoint, error }) {
  const [form, setForm] = useState({
    title:       review?.title       || '',
    description: review?.description || '',
    type:        review?.type        || 'pruefung',
    status:      review?.status      || 'offen',
    priority:    review?.priority    || 'mittel',
    assignedTo:  review?.assignedTo  || '',
    dueDate:     review?.dueDate     || '',
  })
  const [viewpoint, setViewpoint] = useState(review?.viewpoint || null)
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const hasPos = review ? !!review.position : !!pendingPosition

  const submit = () => {
    const contact = contacts.find(c => c.name === form.assignedTo)
    onSave({ ...form, assignedEmail: contact?.email || review?.assignedEmail || '', viewpoint })
  }

  return (
    <div className="flex flex-col gap-2 p-3 border-t border-gray-700" style={{ background: '#1a1a2e' }}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-200">{review ? 'Prüfvermerk bearbeiten' : 'Neuer Prüfvermerk'}</span>
        <button onClick={onCancel} className="text-gray-500 hover:text-gray-300 transition-colors"><X size={13} /></button>
      </div>

      {error && (
        <div className="flex items-center gap-1.5 text-xs text-red-400 bg-red-900/20 border border-red-800 px-2 py-1">
          <AlertCircle size={11} /> {error}
        </div>
      )}

      <input placeholder="Titel *" value={form.title} onChange={set('title')} autoFocus
        className="w-full bg-gray-800 border border-gray-600 text-white text-xs px-2 py-1.5 placeholder-gray-600 focus:outline-none focus:border-brand-500" />
      <textarea placeholder="Prüfbemerkung / Beschreibung" value={form.description} onChange={set('description')} rows={2}
        className="w-full bg-gray-800 border border-gray-600 text-white text-xs px-2 py-1.5 placeholder-gray-600 focus:outline-none focus:border-brand-500 resize-none" />

      <div className="grid grid-cols-2 gap-2">
        <select value={form.type} onChange={set('type')} className="bg-gray-800 border border-gray-600 text-white text-xs px-2 py-1.5 focus:outline-none focus:border-brand-500">
          {Object.entries(REVIEW_TYPES).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
        </select>
        <select value={form.priority} onChange={set('priority')} className="bg-gray-800 border border-gray-600 text-white text-xs px-2 py-1.5 focus:outline-none focus:border-brand-500">
          {Object.entries(REVIEW_PRIORITY).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
        </select>
      </div>

      {review && (
        <select value={form.status} onChange={set('status')} className="bg-gray-800 border border-gray-600 text-white text-xs px-2 py-1.5 focus:outline-none focus:border-brand-500">
          {Object.entries(REVIEW_STATUS).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
        </select>
      )}

      {/* Prüfberechtigter (aus Projektkontakten) */}
      <select value={form.assignedTo} onChange={set('assignedTo')} className="bg-gray-800 border border-gray-600 text-white text-xs px-2 py-1.5 focus:outline-none focus:border-brand-500">
        <option value="">Prüfberechtigter (aus Projektkontakten)…</option>
        {contacts.map(c => (
          <option key={c.id || c.name} value={c.name}>
            {c.name}{c.company ? ` (${c.company})` : ''}{c.email ? '' : ' – keine E-Mail'}
          </option>
        ))}
      </select>

      <input type="date" value={form.dueDate} onChange={set('dueDate')}
        className="bg-gray-800 border border-gray-600 text-white text-xs px-2 py-1.5 focus:outline-none focus:border-brand-500" />

      {/* Position auf dem Plan (nur Bildpläne) */}
      {canPosition && (
        <button type="button" onClick={onRequestPosition}
          className={`flex items-center justify-center gap-1.5 text-xs px-2 py-1.5 border transition-colors ${
            hasPos ? 'border-green-700 text-green-400 bg-green-900/20' : 'border-gray-600 text-gray-300 hover:border-gray-500'}`}>
          {hasPos ? <><Check size={11} /> Position gesetzt – neu setzen</> : <><Crosshair size={11} /> Position auf Plan setzen</>}
        </button>
      )}

      {/* 3D-Standpunkt verknüpfen */}
      {onCaptureViewpoint && (
        <button type="button"
          onClick={() => { const vp = onCaptureViewpoint(); if (vp) setViewpoint(vp) }}
          className={`flex items-center justify-center gap-1.5 text-xs px-2 py-1.5 border transition-colors ${
            viewpoint ? 'border-cyan-700 text-cyan-400 bg-cyan-900/20' : 'border-gray-600 text-gray-300 hover:border-gray-500'}`}>
          {viewpoint ? <><Check size={11} /> 3D-Standpunkt verknüpft – neu erfassen</> : <><Video size={11} /> Aktuellen 3D-Standpunkt verknüpfen</>}
        </button>
      )}

      <div className="flex gap-2 pt-1">
        <button onClick={onCancel} className="flex-1 text-xs px-2 py-1.5 border border-gray-600 text-gray-400 hover:text-white hover:border-gray-500 transition-colors">Abbrechen</button>
        <button disabled={!form.title.trim()} onClick={submit}
          className="flex-1 text-xs px-2 py-1.5 bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Speichern</button>
      </div>
    </div>
  )
}

// ── Prüfvermerk-Karte ───────────────────────────────────────────────────────
function ReviewCard({ review, protocols, canEdit, hasViewpointNav,
                      onStatusChange, onEdit, onDelete, onEmail, onAddToProtocol, onShowViewpoint, onLocate }) {
  const type   = REVIEW_TYPES[review.type]       || REVIEW_TYPES.pruefung
  const status = REVIEW_STATUS[review.status]     || REVIEW_STATUS.offen
  const prio   = REVIEW_PRIORITY[review.priority] || REVIEW_PRIORITY.mittel
  const [showProto, setShowProto] = useState(false)
  const [added,     setAdded]     = useState(false)

  const cycleStatus = () => {
    const next = STATUS_ORDER[(STATUS_ORDER.indexOf(review.status) + 1) % STATUS_ORDER.length]
    onStatusChange(review, next)
  }
  const pickProto = (e) => {
    const id = e.target.value
    if (!id) return
    onAddToProtocol(id, review)
    setShowProto(false); setAdded(true); setTimeout(() => setAdded(false), 2500)
  }
  const canProto = protocols && protocols.length > 0 && onAddToProtocol

  return (
    <div className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors group">
      <div className="px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0 flex-1">
            <span className={`flex-shrink-0 mt-1 w-2 h-2 rounded-full ${type.dot}`} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-gray-200 leading-snug">
                <span className="text-gray-500">#{review.no}</span> {review.title}
              </p>
              {review.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{review.description}</p>}
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <button onClick={cycleStatus} title="Status wechseln"
                  className={`text-[10px] px-1.5 py-0.5 border ${status.badge} transition-colors cursor-pointer`}>{status.label}</button>
                <span className={`text-[10px] ${type.color}`}>{type.label}</span>
                <span className={`text-[10px] font-medium ${prio.color}`}>{prio.label}</span>
                {review.assignedTo && <span className="text-[10px] text-gray-500 truncate max-w-[90px]" title={review.assignedTo}>{review.assignedTo}</span>}
                {review.dueDate && <span className="text-[10px] text-gray-600">{formatDate(review.dueDate)}</span>}
                {review.position && <MapPin size={10} className="text-brand-500" title="Auf Plan verortet" />}
                {review.viewpoint && <Video size={10} className="text-cyan-500" title="Mit 3D verknüpft" />}
                {review.notifiedAt && <Mail size={10} className="text-green-600" title="Per E-Mail versendet" />}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            {review.position && onLocate && (
              <button onClick={() => onLocate(review)} title="Auf Plan zeigen" className="text-gray-500 hover:text-brand-400 transition-colors p-0.5"><MapPin size={12} /></button>
            )}
            {review.viewpoint && hasViewpointNav && (
              <button onClick={() => onShowViewpoint(review.viewpoint)} title="Im 3D anzeigen" className="text-gray-500 hover:text-cyan-400 transition-colors p-0.5"><Video size={12} /></button>
            )}
            {canProto && (
              <button onClick={() => setShowProto(v => !v)} title="Als Protokoll-Aufgabe übernehmen" className="text-gray-500 hover:text-brand-400 transition-colors p-0.5"><ArrowRight size={12} /></button>
            )}
            {canEdit && onEmail && review.assignedEmail && (
              <button onClick={() => onEmail(review)} title="Prüfvermerk per E-Mail senden" className="text-gray-500 hover:text-green-400 transition-colors p-0.5"><Mail size={12} /></button>
            )}
            {canEdit && (
              <button onClick={() => onEdit(review)} title="Bearbeiten" className="text-gray-500 hover:text-gray-300 transition-colors p-0.5"><Pencil size={12} /></button>
            )}
            {canEdit && (
              <button onClick={() => onDelete(review)} title="Löschen" className="text-gray-500 hover:text-red-400 transition-colors p-0.5"><Trash2 size={12} /></button>
            )}
          </div>
        </div>
        {added && <p className="text-[10px] text-green-400 mt-1.5 ml-4">✓ Als Aufgabe zum Protokoll hinzugefügt</p>}
        {showProto && !added && (
          <div className="mt-2 ml-4">
            <select autoFocus defaultValue="" onChange={pickProto} onBlur={() => setShowProto(false)}
              className="w-full bg-gray-800 border border-brand-600 text-white text-[10px] px-1.5 py-1 focus:outline-none">
              <option value="" disabled>Protokoll auswählen…</option>
              {protocols.map(p => (
                <option key={p.id} value={p.id}>{p.date ? formatDate(p.date) : 'Ohne Datum'} – {p.meetingType || p.projectName || 'Protokoll'}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Hauptkomponente ─────────────────────────────────────────────────────────
export default function BimPlanViewer({
  projectId, plan, token, onClose,
  canEdit = false, projectContacts = [], protocols = [],
  onAddReviewToProtocol, getViewpoint, onShowViewpoint,
}) {
  const [pos,  setPos]  = useState({ x: null, y: null })
  const [size, setSize] = useState({ w: INIT_W, h: INIT_H })
  const [zoom, setZoom] = useState(1)
  const [blobUrl, setBlobUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  // Prüfvermerke
  const [reviews,      setReviews]      = useState([])
  const [reviewError,  setReviewError]  = useState(null)
  const [showReviews,  setShowReviews]  = useState(true)
  const [creating,     setCreating]     = useState(false)
  const [editing,      setEditing]      = useState(null)
  const [formError,    setFormError]    = useState(null)
  const [placeMode,    setPlaceMode]    = useState(false)
  const [pendingPos,   setPendingPos]   = useState(null)
  const [highlightId,  setHighlightId]  = useState(null)

  const wrapRef = useRef(null)
  const isPdf   = (plan.mimeType || '').includes('pdf')
  const canPin  = !isPdf   // Pins nur auf Bildplänen
  const fileUrl = `/api/projects/${projectId}/plans/${plan.id}/file?token=${encodeURIComponent(token || '')}`
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {}

  // Datei als Blob laden
  useEffect(() => {
    let cancelled = false
    let createdUrl = null
    setLoading(true); setError(null); setBlobUrl(null)
    ;(async () => {
      try {
        const res = await fetch(fileUrl, { headers: authHeaders })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Fehler ${res.status}`)
        const blob = await res.blob()
        if (cancelled) return
        createdUrl = URL.createObjectURL(blob)
        setBlobUrl(createdUrl); setLoading(false)
      } catch (e) { if (!cancelled) { setError(e.message); setLoading(false) } }
    })()
    return () => { cancelled = true; if (createdUrl) URL.revokeObjectURL(createdUrl) }
  }, [fileUrl, token])

  // Prüfvermerke laden
  const fetchReviews = useCallback(async () => {
    setReviewError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/plan-reviews?planId=${plan.id}`, { headers: authHeaders })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Fehler ${res.status}`)
      setReviews(await res.json())
    } catch (e) { setReviewError(`Prüfvermerke konnten nicht geladen werden: ${e.message}`) }
  }, [projectId, plan.id, token])

  useEffect(() => { fetchReviews() }, [fetchReviews])

  // ── CRUD ──
  const handleCreate = async (form) => {
    setFormError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/plan-reviews`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ ...form, planId: plan.id, planTitle: plan.title, position: pendingPos || null }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Fehler ${res.status}`)
      setCreating(false); setPendingPos(null); setPlaceMode(false); fetchReviews()
    } catch (e) { setFormError(`Erstellen fehlgeschlagen: ${e.message}`) }
  }

  const handleUpdate = async (form) => {
    setFormError(null)
    const { _version, _updatedAt, ...data } = editing
    const updated = { ...data, ...form, position: pendingPos !== null ? pendingPos : editing.position }
    try {
      const res = await fetch(`/api/projects/${projectId}/plan-reviews/${editing.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ data: updated, version: _version }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Fehler ${res.status}`)
      setEditing(null); setPendingPos(null); setPlaceMode(false); fetchReviews()
    } catch (e) { setFormError(`Speichern fehlgeschlagen: ${e.message}`) }
  }

  const handleStatusChange = async (review, newStatus) => {
    const { _version, _updatedAt, ...data } = review
    setReviews(prev => prev.map(r => r.id === review.id ? { ...r, status: newStatus, _version: (_version || 0) + 1 } : r))
    try {
      const res = await fetch(`/api/projects/${projectId}/plan-reviews/${review.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ data: { ...data, status: newStatus }, version: _version }),
      })
      if (res.ok) return
      if (res.status === 409) {
        const d = await res.json().catch(() => ({}))
        if (d.serverData) setReviews(prev => prev.map(r => r.id === review.id ? d.serverData : r))
        else fetchReviews()
      } else {
        setReviews(prev => prev.map(r => r.id === review.id ? review : r))
        setReviewError('Status konnte nicht geändert werden.')
      }
    } catch { setReviews(prev => prev.map(r => r.id === review.id ? review : r)) }
  }

  const handleDelete = async (review) => {
    if (!window.confirm(`Prüfvermerk „${review.title}" wirklich löschen?`)) return
    try {
      const res = await fetch(`/api/projects/${projectId}/plan-reviews/${review.id}`, { method: 'DELETE', headers: authHeaders })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Fehler ${res.status}`)
      fetchReviews()
    } catch (e) { setReviewError(`Löschen fehlgeschlagen: ${e.message}`) }
  }

  const handleEmail = async (review) => {
    const to = review.assignedEmail
    if (!to) { setReviewError('Kein Prüfberechtigter mit E-Mail hinterlegt.'); return }
    if (!window.confirm(`Prüfvermerk „${review.title}" an ${review.assignedTo} (${to}) senden?`)) return
    try {
      const res = await fetch(`/api/projects/${projectId}/plan-reviews/${review.id}/send-email`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ to }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Fehler ${res.status}`)
      fetchReviews()
    } catch (e) { setReviewError(`E-Mail-Versand fehlgeschlagen: ${e.message}`) }
  }

  const captureViewpoint = getViewpoint ? () => {
    const vp = getViewpoint()
    if (!vp) setReviewError('Kein 3D-Modell geladen – Standpunkt kann nicht erfasst werden.')
    return vp
  } : null

  // Klick auf Bildplan → Position erfassen
  const handlePlanClick = (e) => {
    if (!placeMode || !wrapRef.current) return
    const rect = wrapRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top)  / rect.height
    if (x < 0 || x > 1 || y < 0 || y > 1) return
    setPendingPos({ x, y })
    setPlaceMode(false)
  }

  const startCreate = () => { setCreating(true); setEditing(null); setFormError(null); setPendingPos(null) }
  const startEdit   = (r) => { setEditing(r); setCreating(false); setFormError(null); setPendingPos(null) }
  const locate      = (r) => { setHighlightId(r.id); setTimeout(() => setHighlightId(null), 2000) }

  // Drag / Resize
  const handleDragStart = useCallback((e) => {
    if (e.button !== 0) return
    e.preventDefault()
    const originX = pos.x ?? (window.innerWidth  / 2 - size.w / 2)
    const originY = pos.y ?? (window.innerHeight / 2 - size.h / 2)
    const dx = e.clientX - originX, dy = e.clientY - originY
    const onMove = (ev) => setPos({
      x: Math.max(0, Math.min(window.innerWidth  - size.w, ev.clientX - dx)),
      y: Math.max(0, Math.min(window.innerHeight - size.h, ev.clientY - dy)),
    })
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
  }, [pos, size])

  const handleResizeStart = useCallback((e) => {
    if (e.button !== 0) return
    e.preventDefault(); e.stopPropagation()
    const startX = e.clientX, startY = e.clientY, startW = size.w, startH = size.h
    const onMove = (ev) => setSize({ w: Math.max(560, startW + ev.clientX - startX), h: Math.max(320, startH + ev.clientY - startY) })
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
  }, [size])

  const positioned = pos.x !== null
  const openReviews = reviews.filter(r => r.status === 'offen' || r.status === 'in_pruefung').length
  const editingHasPos = editing ? (pendingPos !== null ? pendingPos : editing.position) : pendingPos

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]" onClick={onClose} />
      <div
        className="fixed z-50 flex flex-col bg-gray-900 border border-gray-700 shadow-2xl"
        style={{
          width: size.w, height: size.h,
          left: positioned ? pos.x : '50%', top: positioned ? pos.y : '50%',
          transform: positioned ? 'none' : 'translate(-50%, -50%)',
          minWidth: 560, minHeight: 320,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700 flex-shrink-0 cursor-move select-none" onMouseDown={handleDragStart}>
          <div className="flex items-center gap-2 min-w-0">
            <Move size={11} className="text-gray-500 flex-shrink-0" />
            {isPdf ? <FileText size={13} className="text-brand-400 flex-shrink-0" /> : <ImageIcon size={13} className="text-brand-400 flex-shrink-0" />}
            <span className="text-xs font-medium text-gray-200 truncate">{plan.title}</span>
            {plan.filename && <span className="text-[10px] text-gray-500 truncate hidden sm:inline">· {plan.filename}</span>}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0" onMouseDown={e => e.stopPropagation()}>
            <button
              onClick={() => setShowReviews(v => !v)}
              title="Planprüfung ein-/ausblenden"
              className={`flex items-center gap-1 text-[11px] px-2 py-0.5 border transition-colors ${
                showReviews ? 'bg-brand-700 text-white border-brand-500' : 'bg-gray-700/40 text-gray-300 border-gray-600 hover:bg-gray-700'}`}>
              <ClipboardCheck size={12} /> Prüfung{openReviews > 0 ? ` (${openReviews})` : ''}
            </button>
            {!isPdf && (
              <>
                <span className="text-gray-700">|</span>
                <button onClick={() => setZoom(z => Math.max(0.25, z - 0.25))} title="Verkleinern" className="text-gray-400 hover:text-white transition-colors"><ZoomOut size={13} /></button>
                <span className="text-[10px] text-gray-400 w-9 text-center">{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom(z => Math.min(5, z + 0.25))} title="Vergrößern" className="text-gray-400 hover:text-white transition-colors"><ZoomIn size={13} /></button>
              </>
            )}
            <span className="text-gray-700">|</span>
            <a href={fileUrl} target="_blank" rel="noreferrer" title="In neuem Tab öffnen" className="text-gray-400 hover:text-white transition-colors"><ExternalLink size={13} /></a>
            <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors ml-1"><X size={14} /></button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Plan-Anzeige */}
          <div className="flex-1 relative overflow-auto bg-gray-950" style={{ minHeight: 0, cursor: placeMode ? 'crosshair' : 'default' }}>
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center"><Loader size={26} className="animate-spin text-brand-400 mx-auto mb-2" /><p className="text-xs text-gray-400">Plan wird geladen…</p></div>
              </div>
            )}
            {error && !loading && (
              <div className="absolute inset-0 flex items-center justify-center p-4">
                <div className="text-center"><AlertCircle size={22} className="text-red-400 mx-auto mb-2" /><p className="text-xs text-red-400 max-w-xs">{error}</p></div>
              </div>
            )}
            {placeMode && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-brand-800/90 border border-brand-600 px-3 py-1.5 text-xs text-brand-200">
                <Crosshair size={12} /> Auf den Plan klicken, um die Position zu setzen
                <button onClick={() => setPlaceMode(false)} className="ml-1 text-brand-300 hover:text-white">✕</button>
              </div>
            )}
            {!loading && !error && blobUrl && (
              isPdf ? (
                <iframe title={plan.title} src={blobUrl} className="absolute inset-0 w-full h-full bg-white" />
              ) : (
                <div className="min-h-full flex items-center justify-center p-2">
                  <div ref={wrapRef} className="relative inline-block" style={{ transform: `scale(${zoom})`, transformOrigin: 'center top' }} onClick={handlePlanClick}>
                    <img src={blobUrl} alt={plan.title} className="max-w-none block" />
                    {/* Pins */}
                    {reviews.filter(r => r.position).map(r => {
                      const t = REVIEW_TYPES[r.type] || REVIEW_TYPES.pruefung
                      return (
                        <button key={r.id}
                          onClick={(e) => { e.stopPropagation(); startEdit(r) }}
                          title={`#${r.no} ${r.title}`}
                          className={`absolute -translate-x-1/2 -translate-y-full transition-transform ${highlightId === r.id ? 'scale-150 z-20' : 'hover:scale-125 z-10'}`}
                          style={{ left: `${r.position.x * 100}%`, top: `${r.position.y * 100}%` }}>
                          <MapPin size={20} className={`${t.color} drop-shadow`} fill="currentColor" />
                        </button>
                      )
                    })}
                    {/* Pending-Pin */}
                    {pendingPos && (
                      <span className="absolute -translate-x-1/2 -translate-y-full z-20 animate-pulse"
                        style={{ left: `${pendingPos.x * 100}%`, top: `${pendingPos.y * 100}%` }}>
                        <MapPin size={22} className="text-brand-400" fill="currentColor" />
                      </span>
                    )}
                  </div>
                </div>
              )
            )}
          </div>

          {/* Prüfpanel */}
          {showReviews && (
            <div className="flex flex-col w-72 flex-shrink-0 border-l border-gray-700 bg-gray-900 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <ClipboardCheck size={13} className="text-brand-400" />
                  <span className="text-xs font-semibold text-gray-200">Planprüfung</span>
                  {openReviews > 0 && <span className="text-[10px] px-1.5 py-0.5 bg-red-900/50 text-red-300 border border-red-800">{openReviews} offen</span>}
                </div>
                {canEdit && (
                  <button onClick={startCreate} className="flex items-center gap-1 text-xs px-2 py-1 bg-brand-700/60 hover:bg-brand-700 text-brand-200 border border-brand-600 transition-colors"><Plus size={11} /> Neu</button>
                )}
              </div>

              {reviewError && (
                <div className="flex items-center gap-1.5 px-3 py-2 text-xs text-red-400 bg-red-900/20 border-b border-red-900/40 flex-shrink-0">
                  <AlertCircle size={11} className="flex-shrink-0" /><span className="flex-1">{reviewError}</span>
                  <button onClick={() => setReviewError(null)} className="text-red-600 hover:text-red-400"><X size={11} /></button>
                </div>
              )}

              <div className="flex-1 overflow-y-auto">
                {reviews.length === 0 && !creating && (
                  <div className="p-4 text-center">
                    <p className="text-xs text-gray-500">Keine Prüfvermerke</p>
                    {canEdit && <p className="text-[10px] text-gray-600 mt-1">{canPin ? 'Neuen Prüfvermerk anlegen und optional auf dem Plan verorten.' : 'Neuen Prüfvermerk anlegen (Positionierung nur bei Bildplänen).'}</p>}
                  </div>
                )}
                {reviews.map(r => (
                  editing?.id === r.id ? (
                    <ReviewForm key={r.id} review={editing} contacts={projectContacts}
                      pendingPosition={pendingPos} canPosition={canPin} onRequestPosition={() => setPlaceMode(true)}
                      onCaptureViewpoint={captureViewpoint}
                      onSave={handleUpdate} onCancel={() => { setEditing(null); setPendingPos(null); setPlaceMode(false) }} error={formError} />
                  ) : (
                    <ReviewCard key={r.id} review={r} protocols={protocols} canEdit={canEdit} hasViewpointNav={!!onShowViewpoint}
                      onStatusChange={handleStatusChange} onEdit={startEdit} onDelete={handleDelete} onEmail={handleEmail}
                      onAddToProtocol={onAddReviewToProtocol} onShowViewpoint={onShowViewpoint} onLocate={canPin ? locate : null} />
                  )
                ))}
              </div>

              {creating && !editing && (
                <ReviewForm contacts={projectContacts} pendingPosition={pendingPos} canPosition={canPin}
                  onRequestPosition={() => setPlaceMode(true)} onCaptureViewpoint={captureViewpoint}
                  onSave={handleCreate} onCancel={() => { setCreating(false); setPendingPos(null); setPlaceMode(false) }} error={formError} />
              )}
            </div>
          )}
        </div>

        {/* Resize-Handle */}
        <div className="absolute bottom-0 right-0 w-5 h-5 z-20 cursor-se-resize flex items-end justify-end pb-0.5 pr-0.5" onMouseDown={handleResizeStart}>
          <Maximize2 size={10} className="text-gray-600 rotate-90" />
        </div>
      </div>
    </>
  )
}
