import React, { useState } from 'react'
import { Plus, Trash2, FileText, IndentIncrease, IndentDecrease, Search, X,
         CheckCircle2, Circle, User, Calendar, Paperclip, ExternalLink, GripVertical,
         ChevronRight, ChevronDown } from 'lucide-react'
import { emptyAgendaItem, emptyActionItem, uid, formatDate } from '../utils'
import RichTextEditor, { stripHtml } from './RichTextEditor'
import { attachmentStore } from '../attachmentStore'

const isElectron = typeof window !== 'undefined' && !!window.electronAPI

function formatFileSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function openAttachment(attachment) {
  // Support both old format (attachment.data) and new format (attachment.id)
  let base64 = attachment.data ?? null
  if (!base64 && attachment.id) {
    try { base64 = await attachmentStore.load(attachment.id) } catch {}
  }
  if (!base64) {
    alert('Anlage nicht gefunden. Die Datei wurde möglicherweise auf einem anderen Gerät gespeichert.')
    return
  }
  if (isElectron && window.electronAPI.openAttachment) {
    window.electronAPI.openAttachment({ ...attachment, data: base64 })
    return
  }
  const byteChars = atob(base64)
  const byteArr   = new Uint8Array(byteChars.length)
  for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i)
  const blob = new Blob([byteArr], { type: attachment.mimeType })
  window.open(URL.createObjectURL(blob), '_blank')
}

const LEVEL_STYLES = {
  1: { indent: '',       label: 'text-sm font-bold text-night',        noStyle: 'text-sm font-bold text-brand-600',     borderL: 'border-l-4 border-night' },
  2: { indent: 'ml-6',   label: 'text-sm font-semibold text-night',    noStyle: 'text-sm font-semibold text-brand-500', borderL: 'border-l-4 border-sky' },
  3: { indent: 'ml-12',  label: 'text-sm font-medium text-night/70',   noStyle: 'text-sm font-medium text-brand-400',   borderL: 'border-l-4 border-concrete' },
}

// ── Hierarchy helpers ─────────────────────────────────────────────────────────

function subtreeEnd(items, parentIdx) {
  const parentLevel = items[parentIdx].level ?? 1
  let i = parentIdx + 1
  while (i < items.length && (items[i].level ?? 1) > parentLevel) i++
  return i
}

// Move item (+ its subtree) so it is placed at insertBeforeIdx in the result array.
function moveSubtree(items, sourceId, insertBeforeIdx) {
  const srcIdx = items.findIndex(it => it.id === sourceId)
  if (srcIdx < 0) return items
  const endIdx   = subtreeEnd(items, srcIdx)
  const subtree  = items.slice(srcIdx, endIdx)
  const size     = subtree.length
  // Prevent inserting inside own subtree
  if (insertBeforeIdx > srcIdx && insertBeforeIdx < endIdx) return items
  const without  = [...items.slice(0, srcIdx), ...items.slice(endIdx)]
  let target     = insertBeforeIdx >= endIdx ? insertBeforeIdx - size : insertBeforeIdx
  target         = Math.max(0, Math.min(target, without.length))
  return [...without.slice(0, target), ...subtree, ...without.slice(target)]
}

// Renumber all items based purely on their position in the array.
function renumberItems(items) {
  const parentNo = { 1: '', 2: '', 3: '' }
  const counter  = { 1: 0,  2: 0,  3: 0  }
  return items.map(item => {
    const lvl = Math.min(Math.max(item.level ?? 1, 1), 3)
    if (lvl < 3) counter[3] = 0
    if (lvl < 2) counter[2] = 0
    counter[lvl]++
    let no
    if      (lvl === 1) { no = String(counter[1]);                       parentNo[1] = no }
    else if (lvl === 2) { no = `${parentNo[1]}.${counter[2]}`;           parentNo[2] = no }
    else                { no = `${parentNo[2]}.${counter[3]}` }
    return { ...item, no }
  })
}

// Suggest number for a new child (uses max existing suffix to avoid gaps)
function suggestChildNo(items, parentIdx) {
  const parent      = items[parentIdx]
  const childLvl    = Math.min((parent.level ?? 1) + 1, 3)
  const parentLevel = parent.level ?? 1
  const prefix      = parent.no || String(parentIdx + 1)
  let maxSuffix     = 0
  for (let i = parentIdx + 1; i < items.length; i++) {
    const lvl = items[i].level ?? 1
    if (lvl <= parentLevel) break
    if (lvl === childLvl) {
      const s = parseInt((items[i].no ?? '').split('.').pop()) || 0
      if (s > maxSuffix) maxSuffix = s
    }
  }
  return `${prefix}.${maxSuffix + 1}`
}

function suggestTopNo(items) {
  const max = items
    .filter(it => (it.level ?? 1) === 1)
    .reduce((m, it) => Math.max(m, parseInt(it.no) || 0), 0)
  return String(max + 1)
}

function isHiddenByCollapse(items, idx, collapsed) {
  const lvl = items[idx].level ?? 1
  if (lvl === 1) return false
  let targetLvl = lvl - 1
  for (let i = idx - 1; i >= 0; i--) {
    if ((items[i].level ?? 1) === targetLvl) {
      if (collapsed.has(items[i].id)) return true
      targetLvl--
      if (targetLvl === 0) break
    }
  }
  return false
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProtocolItems({ items, onChange, allTasks = [], onTasksChange = () => {}, readOnly, projectContacts }) {
  const contactListId = 'protocol-contacts-list'
  const [search,        setSearch]        = useState('')
  const [showCompleted, setShowCompleted] = useState(true)
  // Drag-and-drop state
  const [dragId,  setDragId]  = useState(null)   // id of item being dragged
  const [dropIdx, setDropIdx] = useState(null)   // insert-before index in `items`
  // Collapse state
  const [collapsed, setCollapsed] = useState(new Set())
  const toggleCollapse = (id) => setCollapsed(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next
  })
  const hasChildren = (id) => {
    const idx = items.findIndex(it => it.id === id)
    return idx >= 0 && idx + 1 < items.length && (items[idx + 1].level ?? 1) > (items[idx].level ?? 1)
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  const addTop = () => {
    if (readOnly) return
    onChange([...items, { ...emptyAgendaItem(1), no: suggestTopNo(items) }])
  }

  const addChild = (parentId) => {
    if (readOnly) return
    const parentIdx = items.findIndex(it => it.id === parentId)
    if (parentIdx < 0) return
    const parent     = items[parentIdx]
    const childLevel = Math.min((parent.level ?? 1) + 1, 3)
    const no         = suggestChildNo(items, parentIdx)
    const insertAt   = subtreeEnd(items, parentIdx)
    const next       = [...items]
    // Unterunterpunkt (Ebene 3): Titel des übergeordneten Unterpunkts übernehmen (anpassbar)
    const topic      = childLevel === 3 ? (parent.topic || '') : ''
    next.splice(insertAt, 0, { ...emptyAgendaItem(childLevel), no, topic })
    onChange(next)
  }

  const update = (id, field, value) => {
    if (readOnly) return
    onChange(items.map(it => it.id === id ? { ...it, [field]: value } : it))
  }

  // Called when the user finishes editing the `no` field.
  // Interprets the typed number to derive level + parent, then moves the item
  // to the right position and renumbers the whole list.
  const handleNoBlur = (id, typedNo) => {
    if (readOnly) return
    const raw = typedNo.trim()
    if (!raw) return
    const parts    = raw.split('.')
    const newLevel = Math.min(parts.length, 3)

    // Update level from the typed number
    let next = items.map(it => it.id === id ? { ...it, no: raw, level: newLevel } : it)

    if (newLevel === 1) {
      // Top-level: insert after the top-level item whose number is just below the target
      const targetNum = parseInt(parts[0]) || 1
      const topItems  = next.filter(it => (it.level ?? 1) === 1 && it.id !== id)
      const prev      = topItems.filter(it => (parseInt(it.no) || 0) < targetNum).pop()
      const insertAt  = prev
        ? subtreeEnd(next, next.findIndex(it => it.id === prev.id))
        : 0
      next = moveSubtree(next, id, insertAt)
    } else {
      // Find the parent by prefix (e.g., "2" for "2.3")
      const parentNo  = parts.slice(0, -1).join('.')
      const parentItem = next.find(it => it.no === parentNo)
      if (parentItem) {
        const parentIdx = next.findIndex(it => it.id === parentItem.id)
        const insertAt  = subtreeEnd(next, parentIdx)
        next = moveSubtree(next, id, insertAt)
      }
    }

    onChange(renumberItems(next))
  }

  // ── Per-item inline tasks ──────────────────────────────────────────────────
  const itemTasks  = (itemId) => allTasks.filter(t => t.protocolItemId === itemId)

  const addTask = (protocolItemId) => {
    const newTask = { ...emptyActionItem(), protocolItemId, no: String(allTasks.length + 1) }
    onTasksChange([...allTasks, newTask])
  }
  const updateTask = (taskId, field, value) => {
    onTasksChange(allTasks.map(t => {
      if (t.id !== taskId) return t
      const upd = { ...t, [field]: value }
      if (field === 'status') upd.completedAt = value === 'erledigt' ? new Date().toISOString() : null
      return upd
    }))
  }
  const removeTask = (taskId) => onTasksChange(allTasks.filter(t => t.id !== taskId))
  const toggleTask = (taskId) => onTasksChange(allTasks.map(t =>
    t.id === taskId ? { ...t, status: t.status === 'erledigt' ? 'offen' : 'erledigt',
      completedAt: t.status !== 'erledigt' ? new Date().toISOString() : null } : t
  ))

  const handleAttachFile = (id, file) => {
    if (!file) return
    if (file.size > 20 * 1024 * 1024) { alert('Datei ist zu groß (max. 20 MB).'); return }
    const reader = new FileReader()
    reader.onload = async (e) => {
      const base64 = e.target.result.split(',')[1]
      const attId  = uid()
      try {
        await attachmentStore.save(attId, base64)
        update(id, 'attachment', { name: file.name, mimeType: file.type || 'application/octet-stream', size: file.size, id: attId })
      } catch {
        alert('Anlage konnte nicht gespeichert werden.')
      }
    }
    reader.readAsDataURL(file)
  }

  const toggleDone = (id) => {
    if (readOnly) return
    onChange(items.map(it =>
      it.id === id ? { ...it, status: it.status === 'erledigt' ? 'offen' : 'erledigt' } : it
    ))
  }

  const remove = (id) => {
    if (readOnly) return
    const idx = items.findIndex(it => it.id === id)
    if (idx < 0) return
    // Den kompletten Teilbaum löschen (Punkt + alle Unterpunkte)
    const end        = subtreeEnd(items, idx)
    const removedIds = new Set(items.slice(idx, end).map(it => it.id))
    const next       = [...items.slice(0, idx), ...items.slice(end)]
    // Neu durchnummerieren, damit keine Lücke entsteht (1, 2, 4 → 1, 2, 3)
    onChange(renumberItems(next))
    // Verwaiste Aufgaben der gelöschten Punkte mitlöschen
    const remaining = allTasks.filter(t => !removedIds.has(t.protocolItemId))
    if (remaining.length !== allTasks.length) onTasksChange(remaining)
  }

  const reactivate = (id) => {
    if (readOnly) return
    onChange(items.map(it => it.id === id ? { ...it, status: 'offen', carriedGray: false } : it))
  }

  const changeLevel = (id, delta) => {
    if (readOnly) return
    const idx      = items.findIndex(it => it.id === id)
    const cur      = items[idx]
    const newLevel = Math.min(3, Math.max(1, (cur.level ?? 1) + delta))
    // Beim Einrücken zum Unterunterpunkt (Ebene 3) den Titel des übergeordneten
    // Unterpunkts übernehmen – nur wenn noch kein Titel gesetzt ist (nicht überschreiben).
    let topicPatch = {}
    if (newLevel === 3 && (cur.level ?? 1) < 3 && !(cur.topic || '').trim()) {
      for (let i = idx - 1; i >= 0; i--) {
        const l = items[i].level ?? 1
        if (l === 2) { topicPatch = { topic: items[i].topic || '' }; break }
        if (l === 1) break
      }
    }
    const next = items.map(it => it.id === id
      ? { ...it, level: newLevel, ...topicPatch }
      : it)
    onChange(renumberItems(next))
  }

  // ── Drag & Drop ────────────────────────────────────────────────────────────

  const handleDragStart = (e, id) => {
    setDragId(id)
    e.dataTransfer.effectAllowed = 'move'
    // Needed for Firefox
    e.dataTransfer.setData('text/plain', id)
  }

  const handleDragEnd = () => { setDragId(null); setDropIdx(null) }

  // Called by the drop-zone divs between items
  const handleDropZoneDragOver = (e, idx) => {
    if (!dragId) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropIdx(idx)
  }

  const handleDropZoneDrop = (e, insertBeforeIdx) => {
    e.preventDefault()
    if (!dragId) return
    const moved    = moveSubtree(items, dragId, insertBeforeIdx)
    const numbered = renumberItems(moved)
    onChange(numbered)
    setDragId(null)
    setDropIdx(null)
  }

  // ── Filtering ──────────────────────────────────────────────────────────────

  const q             = search.trim().toLowerCase()
  const completedCount = items.filter(it => it.status === 'erledigt' && !it.carriedGray).length
  const dndActive     = !q && !readOnly   // disable DnD while searching

  const visible = items.filter((it, idx) => {
    if (q) return (
      it.topic.toLowerCase().includes(q) ||
      it.discussion.toLowerCase().includes(q) ||
      (it.assignedTo ?? '').toLowerCase().includes(q) ||
      (it.no ?? '').toLowerCase().includes(q)
    )
    if (isHiddenByCollapse(items, idx, collapsed)) return false
    if (!showCompleted && it.status === 'erledigt' && !it.carriedGray) return false
    return true
  })

  const searchHitsCompleted = q && visible.some(it => it.status === 'erledigt')

  // ── Drop zone (thin bar between items) ────────────────────────────────────

  const DropZone = ({ insertBeforeIdx }) => {
    if (!dndActive || !dragId) return null
    const active = dropIdx === insertBeforeIdx
    return (
      <div
        className={`h-1.5 rounded transition-colors ${active ? 'bg-sky' : 'bg-transparent'}`}
        onDragOver={e => handleDropZoneDragOver(e, insertBeforeIdx)}
        onDragLeave={() => setDropIdx(null)}
        onDrop={e => handleDropZoneDrop(e, insertBeforeIdx)}
      />
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-gray-200">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="section-title"><FileText size={16} /> Protokollpunkte</h2>
          {completedCount > 0 && <span className="badge-green">{completedCount} freigemeldet</span>}
        </div>
        {!readOnly && (
          <button className="btn-primary btn-sm no-print" onClick={addTop}>
            <Plus size={13} /> Hauptpunkt
          </button>
        )}
      </div>

      {/* Search */}
      {items.length > 0 && (
        <div className="flex gap-2 flex-wrap no-print">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="input pl-9 pr-9"
              placeholder="Protokollpunkte durchsuchen (auch freigemeldete)…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" onClick={() => setSearch('')}>
                <X size={14} />
              </button>
            )}
          </div>
          {completedCount > 0 && !q && (
            <button className="btn-secondary text-xs" onClick={() => setShowCompleted(v => !v)}>
              {showCompleted ? 'Freigemeldete ausblenden' : 'Freigemeldete einblenden'}
            </button>
          )}
        </div>
      )}

      {searchHitsCompleted && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-1.5 no-print">
          Suche zeigt auch freigemeldete Punkte.
        </p>
      )}

      {items.length === 0 && (
        <p className="text-sm text-gray-400 italic py-2">Keine Protokollpunkte erfasst.</p>
      )}
      {visible.length === 0 && items.length > 0 && (
        <p className="text-sm text-gray-400 italic py-2">
          {q ? 'Keine Treffer.' : 'Alle Punkte freigemeldet.'}
        </p>
      )}

      {/* Contact datalist */}
      {(projectContacts ?? []).length > 0 && (
        <datalist id={contactListId}>
          {(projectContacts ?? []).map(c => (
            <option key={c.id} value={c.name ? (c.company ? `${c.name} (${c.company})` : c.name) : c.company} />
          ))}
        </datalist>
      )}

      {/* Items list */}
      <div className="space-y-0" onDragLeave={() => setDropIdx(null)}>
        {/* Drop zone before first item */}
        <DropZone insertBeforeIdx={0} />

        {visible.map((item, visIdx) => {
          const realIdx = items.findIndex(it => it.id === item.id)
          const lvl     = item.level ?? 1
          const s       = LEVEL_STYLES[lvl]
          const done    = item.status === 'erledigt'
          const gray    = done && item.carriedGray
          const isDragging = dragId === item.id

          return (
            <div key={item.id} className={`protocol-item ${isDragging ? 'opacity-40' : ''}`}>
              <div
                className={`${s.indent} print-level-${lvl} rounded-lg ${s.borderL} pl-2 pr-3 py-3 space-y-2
                  ${gray ? 'bg-gray-50 opacity-60' : done ? 'bg-green-50' : 'bg-white'}`}
              >
                {/* Row 1: collapse + drag handle + number + topic + controls */}
                <div className="flex items-start gap-2">

                  {/* Collapse toggle */}
                  {lvl <= 2 && (
                    <button
                      className={`flex-shrink-0 mt-0.5 no-print transition-colors ${
                        hasChildren(item.id) ? 'text-gray-400 hover:text-brand-600' : 'invisible'
                      }`}
                      onClick={() => toggleCollapse(item.id)}
                      tabIndex={hasChildren(item.id) ? 0 : -1}
                      title={collapsed.has(item.id) ? 'Unterpunkte einblenden' : 'Unterpunkte ausblenden'}
                    >
                      {collapsed.has(item.id) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                    </button>
                  )}

                  {/* Drag handle – nur der Griff ist ziehbar, damit Text im Punkt frei markierbar/kopierbar bleibt */}
                  {dndActive && !gray && (
                    <div
                      className="flex-shrink-0 mt-1 text-gray-300 hover:text-gray-500 cursor-grab no-print"
                      title="Zum Verschieben am Griff ziehen"
                      draggable
                      onDragStart={e => handleDragStart(e, item.id)}
                      onDragEnd={handleDragEnd}
                    >
                      <GripVertical size={14} />
                    </div>
                  )}

                  {/* Editable number */}
                  <div className="flex-shrink-0 w-14">
                    {readOnly || gray
                      ? <span className={`${s.noStyle} ${done ? 'opacity-50' : ''}`}>{item.no || '–'}</span>
                      : <input
                          className={`input py-0.5 text-center font-semibold ${s.noStyle} ${done ? 'opacity-50' : ''}`}
                          value={item.no}
                          title="Nummer ändern und Enter/Tab drücken um den Punkt automatisch zu verschieben"
                          onChange={e => update(item.id, 'no', e.target.value)}
                          onBlur={e  => handleNoBlur(item.id, e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
                          placeholder="Nr."
                        />
                    }
                  </div>

                  {!readOnly && !gray && (
                    <button
                      className={`flex-shrink-0 mt-0.5 no-print transition-colors ${done ? 'text-green-600 hover:text-gray-400' : 'text-gray-300 hover:text-green-500'}`}
                      onClick={() => toggleDone(item.id)}
                      title={done ? 'Als offen markieren' : 'Als freigemeldet markieren'}
                    >
                      {done ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                    </button>
                  )}
                  {gray && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="badge text-xs bg-gray-200 text-gray-500">Freigemeldet (Vorgänger)</span>
                      {!readOnly && (
                        <button className="text-xs text-brand-600 hover:text-brand-800 underline no-print"
                          onClick={() => reactivate(item.id)} title="Punkt wieder aktivieren">
                          Reaktivieren
                        </button>
                      )}
                    </div>
                  )}
                  {!gray && item.carriedFromId && <span className="badge-blue text-xs flex-shrink-0 no-print">↩ Übernommen</span>}

                  {/* Topic */}
                  <div className="flex-1">
                    {readOnly || gray
                      ? <span className={`${s.label} ${done ? 'line-through text-gray-400' : ''}`}>{item.topic || '–'}</span>
                      : <input className={`input py-0.5 ${s.label} ${done ? 'line-through text-gray-400' : ''}`}
                          placeholder="Thema…" value={item.topic}
                          onChange={e => update(item.id, 'topic', e.target.value)} />
                    }
                  </div>

                  {!readOnly && !gray && (
                    <div className="flex items-center gap-1 no-print flex-shrink-0">
                      <button className="btn-ghost p-1 text-gray-400 hover:text-brand-600 disabled:opacity-30"
                        onClick={() => changeLevel(item.id, 1)} disabled={lvl >= 3} title="Einrücken (Unterpunkt)">
                        <IndentIncrease size={13} />
                      </button>
                      <button className="btn-ghost p-1 text-gray-400 hover:text-brand-600 disabled:opacity-30"
                        onClick={() => changeLevel(item.id, -1)} disabled={lvl <= 1} title="Ausrücken (Hauptpunkt)">
                        <IndentDecrease size={13} />
                      </button>
                      <button className="btn-ghost p-1 text-red-400 hover:text-red-600 hover:bg-red-50"
                        onClick={() => remove(item.id)} title="Entfernen">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Row 2: createdAt + assignedTo */}
                {!gray && (
                  <div className="flex items-center gap-4 pl-16 flex-wrap">
                    <span className="flex items-center gap-1 text-xs text-gray-400 flex-shrink-0">
                      <Calendar size={11} />
                      {item.createdAt ? formatDate(item.createdAt.slice(0, 10)) : '–'}
                    </span>
                    <div className={`flex items-center gap-1 flex-1 ${!item.assignedTo ? 'print:hidden' : ''}`}>
                      <User size={13} className="text-gray-400 flex-shrink-0" />
                      {readOnly
                        ? <span className="text-xs text-gray-500">{item.assignedTo || '–'}</span>
                        : <input
                            className="input py-0.5 text-xs max-w-64"
                            placeholder="Zugewiesen an (Person / Firma)…"
                            value={item.assignedTo ?? ''}
                            list={(projectContacts ?? []).length > 0 ? contactListId : undefined}
                            onChange={e => update(item.id, 'assignedTo', e.target.value)}
                          />
                      }
                    </div>
                  </div>
                )}

                {/* Discussion */}
                {!gray && (
                  <div className={`space-y-2 pl-16 ${!stripHtml(item.discussion).trim() ? 'print:hidden' : ''}`}>
                    <div>
                      <label className="block text-xs text-gray-400 mb-0.5 no-print">Besprechungsinhalt</label>
                      {readOnly
                        ? <div
                            className={`text-sm text-gray-700 rich-text ${done ? 'text-gray-400' : ''}`}
                            dangerouslySetInnerHTML={{ __html: item.discussion || '' }}
                          />
                        : <RichTextEditor
                            value={item.discussion}
                            placeholder="Inhalt… (- oder 1. für Listen, Strg+B für Fett, Bild einfügen mit Strg+V)"
                            onChange={html => update(item.id, 'discussion', html)}
                            allowImages
                          />
                      }
                    </div>
                  </div>
                )}

                {/* Attachment */}
                {!gray && (
                  <div className="pl-16 flex items-center gap-2 flex-wrap">
                    {item.attachment ? (
                      <>
                        <Paperclip size={13} className="text-brand-600 flex-shrink-0" />
                        <span className="text-xs font-medium text-brand-700 print:text-gray-700">
                          Anlage {item.no ? `${item.no} – ` : ''}{item.attachment.name}
                        </span>
                        <span className="text-xs text-gray-400">{formatFileSize(item.attachment.size)}</span>
                        <button className="btn-ghost p-1 text-brand-600 hover:text-brand-800 no-print"
                          title="Anlage öffnen" onClick={() => openAttachment(item.attachment)}>
                          <ExternalLink size={12} />
                        </button>
                        {!readOnly && (
                          <button className="btn-ghost p-1 text-red-400 hover:text-red-600 no-print"
                            title="Anlage entfernen" onClick={() => update(item.id, 'attachment', null)}>
                            <X size={12} />
                          </button>
                        )}
                      </>
                    ) : !readOnly ? (
                      <>
                        <input type="file" id={`attach-${item.id}`} className="hidden"
                          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.dwg,.dxf"
                          onChange={e => { handleAttachFile(item.id, e.target.files?.[0]); e.target.value = '' }}
                        />
                        <label htmlFor={`attach-${item.id}`}
                          className="flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600 cursor-pointer transition-colors no-print">
                          <Paperclip size={12} /> Anlage hinzufügen
                        </label>
                      </>
                    ) : null}
                  </div>
                )}

                {/* Inline tasks per item */}
                {!gray && (itemTasks(item.id).length > 0 || (!readOnly && !q)) && (
                  <div className={`pl-16 ${itemTasks(item.id).length === 0 ? 'no-print' : ''}`}>
                    {itemTasks(item.id).length > 0 && (
                      <div className="mt-1 mb-1">
                        <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5 no-print">Aufgaben</div>
                        <div className="space-y-0.5">
                          {itemTasks(item.id).map(task => {
                            const taskDone = task.status === 'erledigt'
                            return (
                              <div key={task.id} className="flex items-center gap-1.5 py-0.5">
                                <button
                                  className={`flex-shrink-0 ${taskDone ? 'text-green-600' : 'text-gray-300'} no-print`}
                                  onClick={() => !readOnly && toggleTask(task.id)}
                                  disabled={readOnly}
                                  title={taskDone ? 'Als offen markieren' : 'Als erledigt markieren'}
                                >
                                  {taskDone ? <CheckCircle2 size={13} /> : <Circle size={13} />}
                                </button>
                                <span className={`hidden print:inline text-xs ${taskDone ? 'text-green-700' : 'text-gray-400'}`}>
                                  {taskDone ? '✓' : '○'}
                                </span>
                                {readOnly
                                  ? <span className={`text-xs flex-1 ${taskDone ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                                      {task.description || '–'}{task.responsible ? ` [${task.responsible}]` : ''}{task.deadline ? ` · bis ${formatDate(task.deadline)}` : ''}
                                    </span>
                                  : <>
                                      <input className={`input py-0.5 text-xs flex-1 ${taskDone ? 'line-through text-gray-400' : ''}`}
                                        placeholder="Aufgabe…" value={task.description}
                                        onChange={e => updateTask(task.id, 'description', e.target.value)} />
                                      <input className={`input py-0.5 text-xs w-28 ${taskDone ? 'text-gray-400' : ''}`}
                                        placeholder="Zuständig…" value={task.responsible}
                                        list={(projectContacts ?? []).length > 0 ? contactListId : undefined}
                                        onChange={e => updateTask(task.id, 'responsible', e.target.value)} />
                                      <input type="date" className={`input py-0.5 text-xs w-32 no-print ${taskDone ? 'text-gray-400' : ''}`}
                                        value={task.deadline ?? ''}
                                        onChange={e => updateTask(task.id, 'deadline', e.target.value)} />
                                      <button className="no-print btn-ghost p-0.5 text-red-400 hover:text-red-600 flex-shrink-0"
                                        onClick={() => removeTask(task.id)}><Trash2 size={11} /></button>
                                    </>
                                }
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                    {!readOnly && (
                      <button
                        className="no-print flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600 py-0.5 px-1 rounded hover:bg-brand-50 transition-colors"
                        onClick={() => addTask(item.id)}
                      >
                        <Plus size={11} /> Aufgabe
                      </button>
                    )}
                  </div>
                )}

                {/* Gray summary */}
                {gray && (
                  <div className="text-xs text-gray-400 pl-16 space-y-0.5">
                    {item.createdAt && (
                      <span className="flex items-center gap-1">
                        <Calendar size={10} />
                        {formatDate(item.createdAt.slice(0, 10))}
                      </span>
                    )}
                    {item.discussion && (
                      <p>
                        <span className="font-medium">Inhalt:</span>{' '}
                        {stripHtml(item.discussion)}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Add-child button */}
              {!readOnly && !gray && !q && lvl < 3 && !collapsed.has(item.id) && (
                <div className={`${s.indent} no-print`}>
                  <button
                    className="ml-[calc(1rem+4px)] mt-1 flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600 transition-colors py-0.5 px-2 rounded hover:bg-brand-50"
                    onClick={() => addChild(item.id)}
                    title={lvl === 1 ? 'Unterpunkt hinzufügen' : 'Unterunterpunkt hinzufügen'}
                  >
                    <Plus size={11} />
                    {lvl === 1 ? 'Unterpunkt' : 'Unterunterpunkt'}
                  </button>
                </div>
              )}

              {/* Drop zone after this item (maps to real index + 1) */}
              <DropZone insertBeforeIdx={realIdx + 1} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
