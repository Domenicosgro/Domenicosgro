import React, { useState } from 'react'
import { Plus, Trash2, FileText, IndentIncrease, IndentDecrease, Search, X, CheckCircle2, Circle, User } from 'lucide-react'
import { emptyAgendaItem } from '../utils'

const LEVEL_STYLES = {
  1: { indent: '',       label: 'text-sm font-bold text-gray-900',     tag: 'E1', tagColor: 'bg-brand-600 text-white',       borderL: 'border-l-4 border-brand-400' },
  2: { indent: 'ml-6',   label: 'text-sm font-semibold text-gray-800', tag: 'E2', tagColor: 'bg-brand-100 text-brand-700',   borderL: 'border-l-4 border-brand-200' },
  3: { indent: 'ml-12',  label: 'text-sm font-medium text-gray-700',   tag: 'E3', tagColor: 'bg-gray-200 text-gray-600',     borderL: 'border-l-4 border-gray-300'  },
}

export default function ProtocolItems({ items, onChange, readOnly }) {
  const [search, setSearch]           = useState('')
  const [showCompleted, setShowCompleted] = useState(true)

  const add = (level = 1) => {
    if (readOnly) return
    const no = String(items.filter(i => i.level === level).length + 1)
    onChange([...items, { ...emptyAgendaItem(level), no }])
  }

  const update = (id, field, value) => {
    if (readOnly) return
    onChange(items.map(it => it.id === id ? { ...it, [field]: value } : it))
  }

  const toggleDone = (id) => {
    if (readOnly) return
    onChange(items.map(it =>
      it.id === id ? { ...it, status: it.status === 'erledigt' ? 'offen' : 'erledigt' } : it
    ))
  }

  const remove = (id) => { if (!readOnly) onChange(items.filter(it => it.id !== id)) }

  const changeLevel = (id, delta) => {
    if (readOnly) return
    onChange(items.map(it => it.id === id
      ? { ...it, level: Math.min(3, Math.max(1, (it.level ?? 1) + delta)) }
      : it))
  }

  const q = search.trim().toLowerCase()
  const completedCount = items.filter(it => it.status === 'erledigt' && !it.carriedGray).length

  const visible = items.filter(it => {
    if (q) return (
      it.topic.toLowerCase().includes(q) ||
      it.discussion.toLowerCase().includes(q) ||
      it.result.toLowerCase().includes(q) ||
      (it.assignedTo ?? '').toLowerCase().includes(q) ||
      (it.no ?? '').toLowerCase().includes(q)
    )
    if (!showCompleted && it.status === 'erledigt' && !it.carriedGray) return false
    return true
  })

  const searchHitsCompleted = q && visible.some(it => it.status === 'erledigt')

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-gray-200">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="section-title"><FileText size={16} /> Protokollpunkte</h2>
          {completedCount > 0 && <span className="badge-green">{completedCount} freigemeldet</span>}
        </div>
        {!readOnly && (
          <div className="flex gap-2 no-print flex-wrap">
            <button className="btn-primary btn-sm"   onClick={() => add(1)}><Plus size={13} /> Hauptpunkt</button>
            <button className="btn-secondary btn-sm" onClick={() => add(2)}><Plus size={13} /> Unterpunkt</button>
            <button className="btn-secondary btn-sm" onClick={() => add(3)}><Plus size={13} /> Unterunterpunkt</button>
          </div>
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

      {/* Items */}
      <div className="space-y-2">
        {visible.map((item, i) => {
          const lvl  = item.level ?? 1
          const s    = LEVEL_STYLES[lvl]
          const done = item.status === 'erledigt'
          const gray = done && item.carriedGray

          return (
            <div
              key={item.id}
              className={`${s.indent} rounded-lg ${s.borderL} pl-4 pr-3 py-3 space-y-2
                ${gray ? 'bg-gray-50 opacity-60' : done ? 'bg-green-50' : 'bg-white'}`}
            >
              {/* Row 1: badges + number + topic + controls */}
              <div className="flex items-start gap-2">
                <span className={`text-xs px-1.5 py-0.5 rounded font-semibold flex-shrink-0 ${s.tagColor} ${done ? 'opacity-60' : ''}`}>
                  {s.tag}
                </span>

                {!readOnly && !gray && (
                  <button
                    className={`flex-shrink-0 mt-0.5 no-print transition-colors ${done ? 'text-green-600 hover:text-gray-400' : 'text-gray-300 hover:text-green-500'}`}
                    onClick={() => toggleDone(item.id)}
                    title={done ? 'Als offen markieren' : 'Als freigemeldet markieren'}
                  >
                    {done ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                  </button>
                )}
                {gray && <span className="badge text-xs bg-gray-200 text-gray-500 flex-shrink-0">Freigemeldet (Vorgänger)</span>}
                {!gray && item.carriedFromId && <span className="badge-blue text-xs flex-shrink-0 no-print">↩ Übernommen</span>}

                {/* No + Topic */}
                <div className="w-12 flex-shrink-0">
                  {readOnly || gray
                    ? <span className="text-xs font-semibold text-gray-500">{item.no || i + 1}</span>
                    : <input className={`input py-0.5 text-center font-semibold text-xs ${done ? 'line-through text-gray-400' : ''}`}
                        value={item.no} onChange={e => update(item.id, 'no', e.target.value)}
                        placeholder={String(i + 1)} />
                  }
                </div>
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
                      onClick={() => changeLevel(item.id, 1)} disabled={lvl >= 3} title="Einrücken">
                      <IndentIncrease size={13} />
                    </button>
                    <button className="btn-ghost p-1 text-gray-400 hover:text-brand-600 disabled:opacity-30"
                      onClick={() => changeLevel(item.id, -1)} disabled={lvl <= 1} title="Ausrücken">
                      <IndentDecrease size={13} />
                    </button>
                    <button className="btn-ghost p-1 text-red-400 hover:text-red-600 hover:bg-red-50"
                      onClick={() => remove(item.id)} title="Entfernen">
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>

              {/* Row 2: assignedTo */}
              {!gray && (
                <div className="flex items-center gap-2 pl-[calc(1.5rem+0.5rem)]">
                  <User size={13} className="text-gray-400 flex-shrink-0" />
                  {readOnly
                    ? <span className="text-xs text-gray-500">{item.assignedTo || '–'}</span>
                    : <input
                        className="input py-0.5 text-xs max-w-64"
                        placeholder="Zugewiesen an (Person / Firma)…"
                        value={item.assignedTo ?? ''}
                        onChange={e => update(item.id, 'assignedTo', e.target.value)}
                      />
                  }
                </div>
              )}

              {/* Discussion + Result */}
              {!gray && (
                <div className="space-y-2 pl-[calc(1.5rem+0.5rem)]">
                  <div>
                    <label className="block text-xs text-gray-400 mb-0.5">Besprechungsinhalt</label>
                    {readOnly
                      ? <p className="text-sm text-gray-700 whitespace-pre-line">{item.discussion || '–'}</p>
                      : <textarea className={`textarea text-sm ${done ? 'text-gray-400' : ''}`} rows={2}
                          placeholder="Inhalt…" value={item.discussion}
                          onChange={e => update(item.id, 'discussion', e.target.value)} />
                    }
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-0.5">Ergebnis / Beschluss</label>
                    {readOnly
                      ? <p className="text-sm text-gray-700 whitespace-pre-line">{item.result || '–'}</p>
                      : <textarea className={`textarea text-sm ${done ? 'text-gray-400' : ''}`} rows={2}
                          placeholder="Ergebnis…" value={item.result}
                          onChange={e => update(item.id, 'result', e.target.value)} />
                    }
                  </div>
                </div>
              )}

              {/* Gray: read-only summary */}
              {gray && (item.discussion || item.result) && (
                <div className="text-xs text-gray-400 pl-2 space-y-0.5">
                  {item.discussion && <p><span className="font-medium">Inhalt:</span> {item.discussion}</p>}
                  {item.result     && <p><span className="font-medium">Ergebnis:</span> {item.result}</p>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
