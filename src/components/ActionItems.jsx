import React, { useState } from 'react'
import { Plus, Trash2, CheckSquare, EyeOff, Eye, Search, X,
         CheckCircle2, Circle, User, Calendar, Flag } from 'lucide-react'
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

  const toggleDone = (id) => {
    const item = items.find(it => it.id === id)
    if (!item) return
    const next = item.status === 'erledigt' ? 'offen' : 'erledigt'
    update(id, 'status', next)
  }

  const remove = (id) => onChange(items.filter(it => it.id !== id))

  const completedCount = items.filter(it => it.status === 'erledigt').length
  const openCount      = items.filter(it => it.status === 'offen' || it.status === 'in_arbeit').length

  const q = search.trim().toLowerCase()

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
            <button className="btn-secondary text-xs" onClick={() => setHideCompleted(v => !v)}>
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
            <button className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              onClick={() => setSearch('')}>
              <X size={14} />
            </button>
          )}
        </div>
      )}

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
        <div className="space-y-0">
          {visible.map((item) => {
            const done      = item.status === 'erledigt'
            const isOverdue = item.deadline && !done && new Date(item.deadline) < new Date()
            const isCarried = !!item.carriedFromId

            const borderColor = done      ? 'border-green-400'
                              : isOverdue ? 'border-red-400'
                              : isCarried ? 'border-blue-400'
                              : 'border-gray-300'
            const bgColor     = done      ? 'bg-green-50'
                              : isOverdue ? 'bg-red-50'
                              : isCarried ? 'bg-blue-50'
                              : 'bg-white'

            return (
              <div key={item.id}
                className={`border-l-4 ${borderColor} ${bgColor} pl-3 pr-3 py-2.5 space-y-1.5 transition-all border-b border-gray-100 ${done ? 'opacity-75' : ''}`}
              >
                {/* Row 1: number + done toggle + description + delete */}
                <div className="flex items-start gap-2">
                  <input
                    className={`input py-0.5 text-center w-8 text-xs font-semibold flex-shrink-0 ${done ? 'line-through text-gray-400' : 'text-brand-700'}`}
                    value={item.no}
                    onChange={e => update(item.id, 'no', e.target.value)}
                  />
                  <button
                    className={`flex-shrink-0 mt-0.5 no-print transition-colors ${done ? 'text-green-600 hover:text-gray-400' : 'text-gray-300 hover:text-green-500'}`}
                    onClick={() => toggleDone(item.id)}
                    title={done ? 'Als offen markieren' : 'Als erledigt markieren'}
                  >
                    {done ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                  </button>
                  <span className={`hidden print:inline text-xs mt-0.5 flex-shrink-0 ${done ? 'text-green-700' : 'text-gray-400'}`}>
                    {done ? '✓' : '○'}
                  </span>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    {(isCarried || item.protocolItemId) && (
                      <div className="flex flex-wrap gap-1 mb-0.5">
                        {isCarried && <span className="badge-blue text-xs">↩ Übernommen</span>}
                        {item.protocolItemId && (() => {
                          const ref = agendaItems.find(it => it.id === item.protocolItemId)
                          return ref
                            ? <span className="badge text-xs bg-gray-100 text-gray-500">Pkt. {ref.no} – {ref.topic?.slice(0, 30)}</span>
                            : null
                        })()}
                      </div>
                    )}
                    <input
                      className={`input py-0.5 text-sm font-medium w-full ${done ? 'line-through text-gray-400' : ''}`}
                      placeholder="Beschreibung der Maßnahme…"
                      value={item.description}
                      onChange={e => update(item.id, 'description', e.target.value)}
                    />
                  </div>
                  <button
                    className="btn-ghost p-1 text-red-400 hover:text-red-600 hover:bg-red-50 no-print flex-shrink-0"
                    onClick={() => remove(item.id)}
                    title="Entfernen"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Row 2: responsible · deadline · priority · status */}
                <div className="flex items-center gap-3 pl-14 flex-wrap">
                  <div className="flex items-center gap-1">
                    <User size={12} className="text-gray-400 flex-shrink-0" />
                    <input
                      className={`input py-0.5 text-xs w-36 ${done ? 'text-gray-400' : ''}`}
                      placeholder="Zuständig…"
                      value={item.responsible}
                      list={projectContacts.length > 0 ? contactListId : undefined}
                      onChange={e => update(item.id, 'responsible', e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-1 no-print">
                    <Calendar size={12} className="text-gray-400 flex-shrink-0" />
                    <input
                      className={`input py-0.5 text-xs w-32 ${isOverdue ? 'border-red-400' : ''} ${done ? 'text-gray-400' : ''}`}
                      type="date"
                      value={item.deadline}
                      onChange={e => update(item.id, 'deadline', e.target.value)}
                    />
                    {isOverdue && <span className="text-red-500 text-xs font-medium">Überfällig</span>}
                  </div>
                  <div className="flex items-center gap-1 no-print">
                    <Flag size={12} className="text-gray-400 flex-shrink-0" />
                    <select
                      className={`select py-0.5 text-xs w-24 ${done ? 'text-gray-400' : ''}`}
                      value={item.priority}
                      onChange={e => update(item.id, 'priority', e.target.value)}
                      disabled={done}
                    >
                      {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </div>
                  <select
                    className={`select py-0.5 text-xs w-28 font-medium ${done ? 'text-green-700 bg-green-100 border-green-300' : ''}`}
                    value={item.status}
                    onChange={e => update(item.id, 'status', e.target.value)}
                  >
                    {ACTION_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                  {done && item.completedAt && (
                    <span className="text-xs text-green-600">
                      Erledigt {formatDate(item.completedAt.slice(0, 10))}
                    </span>
                  )}
                </div>

                {/* Row 3: remarks */}
                <div className="pl-14">
                  <input
                    className={`input py-0.5 text-xs text-gray-500 w-full ${done ? 'line-through text-gray-300' : ''}`}
                    placeholder="Bemerkungen (optional)"
                    value={item.remarks}
                    onChange={e => update(item.id, 'remarks', e.target.value)}
                  />
                </div>

                {/* Search highlight */}
                {q && (
                  <p className="pl-14 text-xs text-gray-400 italic">{highlight(item.description, q)}</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
