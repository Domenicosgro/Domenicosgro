import React, { useState, useEffect, useCallback } from 'react'
import { Plus, X, AlertTriangle, MessageSquare, Info, Shield, Trash2, Eye, Edit2, Camera, ChevronDown } from 'lucide-react'
import { formatDate } from '../utils'

const TYPE_CFG = {
  fehler:     { label: 'Fehler',     Icon: AlertTriangle, color: 'text-red-400' },
  anfrage:    { label: 'Anfrage',    Icon: MessageSquare, color: 'text-brand-400' },
  info:       { label: 'Info',       Icon: Info,          color: 'text-gray-400' },
  sicherheit: { label: 'Sicherheit', Icon: Shield,        color: 'text-orange-400' },
}

const STATUS_CFG = {
  offen:       { label: 'Offen',       dot: 'bg-red-400',    badge: 'bg-red-900/40 text-red-300 border-red-800' },
  in_arbeit:   { label: 'In Arbeit',   dot: 'bg-yellow-400', badge: 'bg-yellow-900/40 text-yellow-300 border-yellow-800' },
  erledigt:    { label: 'Erledigt',    dot: 'bg-green-400',  badge: 'bg-green-900/40 text-green-300 border-green-800' },
  geschlossen: { label: 'Geschlossen', dot: 'bg-gray-500',   badge: 'bg-gray-800 text-gray-400 border-gray-600' },
}

const PRIORITY_CFG = {
  hoch:    { label: 'Hoch',    color: 'text-red-400' },
  mittel:  { label: 'Mittel',  color: 'text-yellow-400' },
  niedrig: { label: 'Niedrig', color: 'text-gray-500' },
}

function IssueForm({ project, issue, viewpoint, onSave, onCancel }) {
  const contacts = project.contacts || []
  const [form, setForm] = useState({
    title:       issue?.title       || '',
    description: issue?.description || '',
    type:        issue?.type        || 'fehler',
    status:      issue?.status      || 'offen',
    priority:    issue?.priority    || 'mittel',
    assignedTo:  issue?.assignedTo  || '',
    dueDate:     issue?.dueDate     || '',
  })
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <div className="flex flex-col gap-2 p-3 bg-gray-850 border-t border-gray-700" style={{ background: '#1a1a2e' }}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-200">{issue ? 'Issue bearbeiten' : 'Neues Issue'}</span>
        <button onClick={onCancel} className="text-gray-500 hover:text-gray-300 transition-colors"><X size={13} /></button>
      </div>

      {!issue && viewpoint && (
        <div className="flex items-center gap-1.5 text-xs text-brand-400 bg-brand-900/20 border border-brand-800 px-2 py-1">
          <Camera size={11} /> Standpunkt erfasst
        </div>
      )}
      {!issue && !viewpoint && (
        <div className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-800 border border-gray-700 px-2 py-1">
          <Camera size={11} /> Kein Standpunkt (Klick auf Modellelement um Standpunkt zu setzen)
        </div>
      )}

      <input
        placeholder="Titel *"
        value={form.title}
        onChange={set('title')}
        autoFocus
        className="w-full bg-gray-800 border border-gray-600 text-white text-xs px-2 py-1.5 placeholder-gray-600 focus:outline-none focus:border-brand-500"
      />
      <textarea
        placeholder="Beschreibung"
        value={form.description}
        onChange={set('description')}
        rows={2}
        className="w-full bg-gray-800 border border-gray-600 text-white text-xs px-2 py-1.5 placeholder-gray-600 focus:outline-none focus:border-brand-500 resize-none"
      />

      <div className="grid grid-cols-2 gap-2">
        <select value={form.type} onChange={set('type')} className="bg-gray-800 border border-gray-600 text-white text-xs px-2 py-1.5 focus:outline-none focus:border-brand-500">
          {Object.entries(TYPE_CFG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
        </select>
        <select value={form.priority} onChange={set('priority')} className="bg-gray-800 border border-gray-600 text-white text-xs px-2 py-1.5 focus:outline-none focus:border-brand-500">
          {Object.entries(PRIORITY_CFG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
        </select>
      </div>

      {issue && (
        <select value={form.status} onChange={set('status')} className="bg-gray-800 border border-gray-600 text-white text-xs px-2 py-1.5 focus:outline-none focus:border-brand-500">
          {Object.entries(STATUS_CFG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
        </select>
      )}

      <select value={form.assignedTo} onChange={set('assignedTo')} className="bg-gray-800 border border-gray-600 text-white text-xs px-2 py-1.5 focus:outline-none focus:border-brand-500">
        <option value="">Zuständig (optional)</option>
        {contacts.map(c => (
          <option key={c.id || c.name} value={c.name}>
            {c.name}{c.company ? ` (${c.company})` : ''}
          </option>
        ))}
      </select>

      <input
        type="date"
        value={form.dueDate}
        onChange={set('dueDate')}
        className="bg-gray-800 border border-gray-600 text-white text-xs px-2 py-1.5 focus:outline-none focus:border-brand-500"
      />

      <div className="flex gap-2 pt-1">
        <button onClick={onCancel} className="flex-1 text-xs px-2 py-1.5 border border-gray-600 text-gray-400 hover:text-white hover:border-gray-500 transition-colors">
          Abbrechen
        </button>
        <button
          disabled={!form.title.trim()}
          onClick={() => onSave(form)}
          className="flex-1 text-xs px-2 py-1.5 bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Speichern
        </button>
      </div>
    </div>
  )
}

function IssueCard({ issue, onNavigate, onEdit, onDelete, onStatusChange }) {
  const type    = TYPE_CFG[issue.type]    || TYPE_CFG.info
  const status  = STATUS_CFG[issue.status] || STATUS_CFG.offen
  const priority = PRIORITY_CFG[issue.priority] || PRIORITY_CFG.mittel
  const TypeIcon = type.Icon

  const cycleStatus = () => {
    const order = ['offen', 'in_arbeit', 'erledigt', 'geschlossen']
    const next  = order[(order.indexOf(issue.status) + 1) % order.length]
    onStatusChange(issue, next)
  }

  return (
    <div className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors group">
      <div className="px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0 flex-1">
            <TypeIcon size={13} className={`${type.color} flex-shrink-0 mt-0.5`} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-gray-200 leading-snug truncate">{issue.title}</p>
              {issue.description && (
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{issue.description}</p>
              )}
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <button
                  onClick={cycleStatus}
                  title="Status wechseln"
                  className={`text-[10px] px-1.5 py-0.5 border ${status.badge} transition-colors cursor-pointer`}
                >
                  {status.label}
                </button>
                <span className={`text-[10px] font-medium ${priority.color}`}>{priority.label}</span>
                {issue.assignedTo && (
                  <span className="text-[10px] text-gray-500 truncate max-w-[80px]">{issue.assignedTo}</span>
                )}
                {issue.dueDate && (
                  <span className="text-[10px] text-gray-600">{formatDate(issue.dueDate)}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            {issue.viewpoint && (
              <button onClick={() => onNavigate(issue)} title="Zu Standpunkt navigieren" className="text-gray-500 hover:text-brand-400 transition-colors p-0.5">
                <Eye size={12} />
              </button>
            )}
            <button onClick={() => onEdit(issue)} title="Bearbeiten" className="text-gray-500 hover:text-gray-300 transition-colors p-0.5">
              <Edit2 size={12} />
            </button>
            <button onClick={() => onDelete(issue)} title="Löschen" className="text-gray-500 hover:text-red-400 transition-colors p-0.5">
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function BimIssuePanel({
  project, token, viewerRef, capturedViewpoint, onStartPick, onClearViewpoint,
}) {
  const [issues,      setIssues]      = useState([])
  const [loading,     setLoading]     = useState(false)
  const [creating,    setCreating]    = useState(false)
  const [editingIssue, setEditingIssue] = useState(null)
  const [filterStatus, setFilterStatus] = useState('alle')

  const fetchIssues = useCallback(async () => {
    setLoading(true)
    try {
      const headers = {}
      if (token) headers['Authorization'] = `Bearer ${token}`
      const res = await fetch(`/api/projects/${project.id}/bim-issues`, { headers })
      if (res.ok) setIssues(await res.json())
    } finally {
      setLoading(false)
    }
  }, [project.id, token])

  useEffect(() => { fetchIssues() }, [fetchIssues])

  // When a viewpoint is captured from pick mode, open the create form
  useEffect(() => {
    if (capturedViewpoint) setCreating(true)
  }, [capturedViewpoint])

  const handleCreate = async (form) => {
    const headers = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    await fetch(`/api/projects/${project.id}/bim-issues`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...form, viewpoint: capturedViewpoint }),
    })
    setCreating(false)
    onClearViewpoint()
    fetchIssues()
  }

  const handleUpdate = async (form) => {
    const { _version, _updatedAt, ...data } = editingIssue
    const updated = { ...data, ...form }
    const headers = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    await fetch(`/api/projects/${project.id}/bim-issues/${editingIssue.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ data: updated, version: _version }),
    })
    setEditingIssue(null)
    fetchIssues()
  }

  const handleStatusChange = async (issue, newStatus) => {
    const { _version, _updatedAt, ...data } = issue
    const updated = { ...data, status: newStatus, updatedAt: new Date().toISOString() }
    const headers = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    await fetch(`/api/projects/${project.id}/bim-issues/${issue.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ data: updated, version: _version }),
    })
    fetchIssues()
  }

  const handleDelete = async (issue) => {
    if (!window.confirm(`Issue „${issue.title}" wirklich löschen?`)) return
    const headers = {}
    if (token) headers['Authorization'] = `Bearer ${token}`
    await fetch(`/api/projects/${project.id}/bim-issues/${issue.id}`, {
      method: 'DELETE', headers,
    })
    fetchIssues()
  }

  const handleNavigate = (issue) => {
    const viewer = viewerRef.current
    if (!viewer || !issue.viewpoint) return
    const { position: pos, target: tgt, elementId, modelId } = issue.viewpoint
    try {
      const controls = viewer.context.ifcCamera.cameraControls
      controls.setLookAt(pos.x, pos.y, pos.z, tgt.x, tgt.y, tgt.z, true)
      if (elementId != null && modelId != null) {
        viewer.IFC.selector.pickIfcItemsByID(modelId, [elementId], true)
      }
    } catch (_) {}
  }

  const cancelCreate = () => {
    setCreating(false)
    onClearViewpoint()
  }

  const cancelEdit = () => setEditingIssue(null)

  const filtered = filterStatus === 'alle'
    ? issues
    : issues.filter(i => i.status === filterStatus)

  const openCount = issues.filter(i => i.status === 'offen' || i.status === 'in_arbeit').length

  return (
    <div className="flex flex-col w-72 flex-shrink-0 border-l border-gray-700 bg-gray-900 overflow-hidden">

      {/* Panel-Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-200">Issues</span>
          {openCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 bg-red-900/50 text-red-300 border border-red-800">{openCount} offen</span>
          )}
        </div>
        <button
          onClick={() => { setCreating(true); setEditingIssue(null) }}
          className="flex items-center gap-1 text-xs px-2 py-1 bg-brand-700/60 hover:bg-brand-700 text-brand-200 border border-brand-600 transition-colors"
        >
          <Plus size={11} /> Neu
        </button>
      </div>

      {/* Status-Filter */}
      <div className="flex gap-1 px-3 py-2 border-b border-gray-800 flex-shrink-0 overflow-x-auto">
        {[['alle', 'Alle'], ...Object.entries(STATUS_CFG).map(([v, c]) => [v, c.label])].map(([v, l]) => (
          <button
            key={v}
            onClick={() => setFilterStatus(v)}
            className={`text-[10px] px-2 py-0.5 flex-shrink-0 border transition-colors ${
              filterStatus === v
                ? 'border-brand-500 bg-brand-900/40 text-brand-300'
                : 'border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-600'
            }`}
          >
            {l}
            {v !== 'alle' && (
              <span className="ml-1 opacity-60">{issues.filter(i => i.status === v).length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Issue-Liste */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <p className="text-xs text-gray-500 p-4 text-center">Laden…</p>
        )}
        {!loading && filtered.length === 0 && !creating && !editingIssue && (
          <div className="p-4 text-center">
            <p className="text-xs text-gray-500">Keine Issues</p>
            <p className="text-[10px] text-gray-600 mt-1">
              {filterStatus === 'alle'
                ? 'Klicke auf ein Modellelement und erstelle das erste Issue.'
                : `Keine Issues mit Status „${STATUS_CFG[filterStatus]?.label}".`}
            </p>
          </div>
        )}
        {filtered.map(issue => (
          editingIssue?.id === issue.id ? (
            <IssueForm
              key={issue.id}
              project={project}
              issue={editingIssue}
              viewpoint={editingIssue.viewpoint}
              onSave={handleUpdate}
              onCancel={cancelEdit}
            />
          ) : (
            <IssueCard
              key={issue.id}
              issue={issue}
              onNavigate={handleNavigate}
              onEdit={setEditingIssue}
              onDelete={handleDelete}
              onStatusChange={handleStatusChange}
            />
          )
        ))}
      </div>

      {/* Neues Issue – Formular */}
      {creating && !editingIssue && (
        <IssueForm
          project={project}
          viewpoint={capturedViewpoint}
          onSave={handleCreate}
          onCancel={cancelCreate}
        />
      )}

      {/* Pick-Mode Hinweis */}
      {!creating && !editingIssue && (
        <div className="px-3 py-2 border-t border-gray-800 flex-shrink-0">
          <button
            onClick={onStartPick}
            className="w-full flex items-center justify-center gap-1.5 text-xs px-2 py-1.5 border border-dashed border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-500 transition-colors"
          >
            <Camera size={11} /> Standpunkt erfassen &amp; Issue erstellen
          </button>
        </div>
      )}
    </div>
  )
}
