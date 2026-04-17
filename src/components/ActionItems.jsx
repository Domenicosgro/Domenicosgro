import React, { useState } from 'react'
import { Plus, Trash2, CheckSquare, EyeOff, Eye, Search, X } from 'lucide-react'
import { emptyActionItem, ACTION_STATUSES, PRIORITIES, formatDate } from '../utils'

function highlight(text, query) {
  if (!query || !text) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 rounded px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  )
}

export default function ActionItems({ items, onChange, agendaItems = [], projectContacts = [] }) {
  const [hideCompleted, setHideCompleted] = useState(false)
  const [search, setSearch] = useState('')
  const contactListId = 'action-contacts-list'

  const add = () => {
    const no = String(items.length + 1)
    onChange([...items, { ...emptyActionItem(), no }])
  }

  const update = (id, field, value) => {
    onChange(items.map(it => {
      if (it.id !== id) return it
      const updated = { ...it, [field]: value }
      if (field === 'status') {
        updated.completedAt = value === 'erledigt' ? new Date().toISOString() : null
      }
      return updated
    }))
  }

  const remove = (id) => onChange(items.filter(it => it.id !== id))

  const completedCount = items.filter(it => it.status === 'erledigt').length
  const openCount      = items.filter(it => it.status === 'offen' || it.status === 'in_arbeit').length

  const q = search.trim().toLowerCase()

  // Search matches all fields including completed ones (ignores hideCompleted when searching)
  const visible = items.filter(it => {
    if (q) {
      return (
        it.description.toLowerCase().includes(q) ||
        it.responsible.toLowerCase().includes(q) ||
        it.remarks.toLowerCase().includes(q) ||
        it.no.toLowerCase().includes(q)
      )
    }
    return hideCompleted ? it.status !== 'erledigt' : true
  })

  // When searching and hitting a completed item, show a hint
  const searchHitsCompleted = q && visible.some(it => it.status === 'erledigt')

  return (
    <div className="card p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="section-title"><CheckSquare size={16} /> Maßnahmen &amp; Aufgaben</h2>
          {openCount > 0      && <span className="badge-yellow">{openCount} offen</span>}
          {completedCount > 0 && <span className="badge-green">{completedCount} erledigt</span>}
        </div>
        <div className="flex gap-2 no-print flex-wrap">
          {completedCount > 0 && !q && (
            <button
              className="btn-secondary text-xs"
              onClick={() => setHideCompleted(v => !v)}
            >
              {hideCompleted ? <Eye size={14} /> : <EyeOff size={14} />}
              {hideCompleted ? 'Erledigte einblenden' : 'Erledigte ausblenden'}
            </button>
          )}
          <button className="btn-primary" onClick={add}><Plus size={14} /> Maßnahme</button>
        </div>
      </div>

      {/* Search bar */}
      {items.length > 0 && (
        <div className="relative no-print">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9 pr-9"
            placeholder="Maßnahmen durchsuchen (auch erledigte)…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              onClick={() => setSearch('')}
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {/* Search hint when completed items appear */}
      {searchHitsCompleted && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-1.5 no-print">
          Die Suche zeigt auch erledigte Punkte.
        </p>
      )}

      {projectContacts.length > 0 && (
        <datalist id={contactListId}>
          {projectContacts.map(c => (
            <option key={c.id} value={c.name ? (c.company ? `${c.name} (${c.company})` : c.name) : c.company} />
          ))}
        </datalist>
      )}

      {items.length === 0 && (
        <p className="text-sm text-gray-400 italic">Keine Maßnahmen erfasst.</p>
      )}

      {visible.length === 0 && items.length > 0 && (
        <p className="text-sm text-gray-400 italic">
          {q ? 'Keine Treffer gefunden.' : 'Alle Maßnahmen erledigt – Einblenden über den Button oben.'}
        </p>
      )}

      {visible.length > 0 && (
        <div className="space-y-2">
          {/* Column header */}
          <div className="hidden sm:grid grid-cols-[2rem_1fr_8rem_8rem_7rem_7rem_2rem] gap-2 px-3 pb-1 border-b border-gray-100">
            <span className="text-xs font-medium text-gray-400">Nr.</span>
            <span className="text-xs font-medium text-gray-400">Maßnahme</span>
            <span className="text-xs font-medium text-gray-400">Verantwortlich</span>
            <span className="text-xs font-medium text-gray-400 no-print">Termin</span>
            <span className="text-xs font-medium text-gray-400 no-print">Priorität</span>
            <span className="text-xs font-medium text-gray-400">Status</span>
            <span className="no-print" />
          </div>

          {visible.map((item) => {
            const done     = item.status === 'erledigt'
            const isOverdue = item.deadline && !done && new Date(item.deadline) < new Date()
            const isCarried = !!item.carriedFromId

            return (
              <div
                key={item.id}
                className={`rounded-lg border px-3 py-2 transition-all ${
                  done      ? 'bg-green-50 border-green-200 opacity-70'
                  : isOverdue ? 'bg-red-50 border-red-200'
                  : isCarried ? 'bg-blue-50 border-blue-200'
                  : 'bg-white border-gray-200'
                }`}
              >
                <div className="grid grid-cols-1 sm:grid-cols-[2rem_1fr_8rem_8rem_7rem_7rem_2rem] gap-2 items-start">
                  {/* Nr */}
                  <input
                    className={`input py-1 text-center w-8 text-xs ${done ? 'line-through text-gray-400' : ''}`}
                    value={item.no}
                    onChange={e => update(item.id, 'no', e.target.value)}
                  />

                  {/* Description */}
                  <div className="space-y-1">
                    {isCarried && <span className="badge-blue text-xs">↩ Übernommen</span>}
                    {item.protocolItemId && (() => {
                      const ref = agendaItems.find(it => it.id === item.protocolItemId)
                      return ref ? <span className="badge text-xs bg-gray-100 text-gray-500">Pkt. {ref.no} – {ref.topic?.slice(0,30)}</span> : null
                    })()}
                    <input
                      className={`input py-1 text-sm font-medium ${done ? 'line-through text-gray-400 bg-green-50' : ''}`}
                      placeholder="Beschreibung der Maßnahme..."
                      value={item.description}
                      onChange={e => update(item.id, 'description', e.target.value)}
                    />
                    <input
                      className={`input py-1 text-xs text-gray-500 ${done ? 'line-through text-gray-300' : ''}`}
                      placeholder="Bemerkungen (optional)"
                      value={item.remarks}
                      onChange={e => update(item.id, 'remarks', e.target.value)}
                    />
                    {done && item.completedAt && (
                      <p className="text-xs text-green-600">
                        Erledigt am {formatDate(item.completedAt.slice(0, 10))}
                      </p>
                    )}
                    {/* Highlight match in read mode (shown below when searching) */}
                    {q && (
                      <p className="text-xs text-gray-400 italic">
                        {highlight(item.description, q)}
                      </p>
                    )}
                  </div>

                  {/* Responsible */}
                  <input
                    className={`input py-1 text-xs ${done ? 'text-gray-400' : ''}`}
                    placeholder="Name / Firma"
                    value={item.responsible}
                    list={projectContacts.length > 0 ? contactListId : undefined}
                    onChange={e => update(item.id, 'responsible', e.target.value)}
                  />

                  {/* Deadline */}
                  <div className="no-print">
                    <input
                      className={`input py-1 text-xs ${isOverdue ? 'border-red-400 bg-red-50' : ''} ${done ? 'text-gray-400' : ''}`}
                      type="date"
                      value={item.deadline}
                      onChange={e => update(item.id, 'deadline', e.target.value)}
                    />
                    {isOverdue && <p className="text-red-500 text-xs mt-0.5 font-medium">Überfällig</p>}
                  </div>

                  {/* Priority */}
                  <div className="no-print">
                    <select
                      className={`select py-1 text-xs ${done ? 'text-gray-400' : ''}`}
                      value={item.priority}
                      onChange={e => update(item.id, 'priority', e.target.value)}
                      disabled={done}
                    >
                      {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </div>

                  {/* Status */}
                  <select
                    className={`select py-1 text-xs font-medium ${done ? 'text-green-700 bg-green-100 border-green-300' : ''}`}
                    value={item.status}
                    onChange={e => update(item.id, 'status', e.target.value)}
                  >
                    {ACTION_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>

                  {/* Delete */}
                  <button
                    className="btn-ghost p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 no-print justify-self-center"
                    onClick={() => remove(item.id)}
                    title="Entfernen"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
