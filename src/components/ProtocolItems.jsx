import React, { useState } from 'react'
import { Plus, Trash2, FileText, IndentIncrease, IndentDecrease, Search, X, CheckCircle2, Circle } from 'lucide-react'
import { emptyAgendaItem, uid } from '../utils'

const LEVEL_STYLES = {
  1: { indent: 'ml-0',  bg: 'bg-white',       border: 'border-brand-200', label: 'text-sm font-bold text-gray-900',     tag: 'E1', tagColor: 'bg-brand-600 text-white' },
  2: { indent: 'ml-6',  bg: 'bg-gray-50',     border: 'border-gray-200',  label: 'text-sm font-semibold text-gray-800', tag: 'E2', tagColor: 'bg-brand-100 text-brand-700' },
  3: { indent: 'ml-12', bg: 'bg-gray-100/60', border: 'border-gray-200',  label: 'text-sm font-medium text-gray-700',   tag: 'E3', tagColor: 'bg-gray-200 text-gray-600' },
}

export default function ProtocolItems({ items, onChange }) {
  const [search, setSearch] = useState('')
  const [showCompleted, setShowCompleted] = useState(true)

  const add = (level = 1) => {
    const same = items.filter(i => i.level === level)
    onChange([...items, { ...emptyAgendaItem(level), no: String(same.length + 1) }])
  }

  const update = (id, field, value) =>
    onChange(items.map(it => it.id === id ? { ...it, [field]: value } : it))

  const toggleDone = (id) => {
    onChange(items.map(it => {
      if (it.id !== id) return it
      return { ...it, status: it.status === 'erledigt' ? 'offen' : 'erledigt' }
    }))
  }

  const remove = (id) => onChange(items.filter(it => it.id !== id))

  const changeLevel = (id, delta) =>
    onChange(items.map(it => it.id === id
      ? { ...it, level: Math.min(3, Math.max(1, (it.level ?? 1) + delta)) }
      : it))

  const q = search.trim().toLowerCase()
  const completedCount = items.filter(it => it.status === 'erledigt').length

  // Filtering: search overrides showCompleted toggle (always shows matches)
  const visible = items.filter(it => {
    if (q) {
      return (
        it.topic.toLowerCase().includes(q) ||
        it.discussion.toLowerCase().includes(q) ||
        it.result.toLowerCase().includes(q) ||
        (it.no || '').toLowerCase().includes(q)
      )
    }
    // Items that are erledigt+gray (second generation) always visible (user opted to see them)
    // But if showCompleted=false, hide erledigt items (except carriedGray ones which are already faded)
    if (!showCompleted && it.status === 'erledigt' && !it.carriedGray) return false
    return true
  })

  const searchHitsCompleted = q && visible.some(it => it.status === 'erledigt')

  return (
    <div className="card p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="section-title"><FileText size={16} /> Protokollpunkte</h2>
          {completedCount > 0 && <span className="badge-green">{completedCount} freigemeldet</span>}
        </div>
        <div className="flex gap-2 no-print flex-wrap">
          <button className="btn-primary"   onClick={() => add(1)}><Plus size={14} /> Hauptpunkt</button>
          <button className="btn-secondary" onClick={() => add(2)}><Plus size={14} /> Unterpunkt</button>
          <button className="btn-secondary" onClick={() => add(3)}><Plus size={14} /> Unterunterpunkt</button>
        </div>
      </div>

      {/* Search bar */}
      {items.length > 0 && (
        <div className="flex gap-2 items-center flex-wrap no-print">
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
        <p className="text-sm text-gray-400 italic">Keine Protokollpunkte erfasst.</p>
      )}

      {visible.length === 0 && items.length > 0 && (
        <p className="text-sm text-gray-400 italic">
          {q ? 'Keine Treffer.' : 'Alle Punkte freigemeldet.'}
        </p>
      )}

      <div className="space-y-3">
        {visible.map((item, i) => {
          const lvl  = item.level ?? 1
          const s    = LEVEL_STYLES[lvl]
          const done = item.status === 'erledigt'
          // carriedGray = was erledigt in direct predecessor → show faded gray
          const gray = done && item.carriedGray

          return (
            <div
              key={item.id}
              className={`${s.indent} border rounded-lg p-4 space-y-3 transition-all ${
                gray
                  ? 'bg-gray-100 border-gray-200 opacity-60'
                  : done
                  ? 'bg-green-50 border-green-200'
                  : `${s.bg} ${s.border}`
              }`}
            >
              {/* Header row */}
              <div className="flex items-start gap-2">
                {/* Level badge */}
                <span className={`text-xs px-1.5 py-0.5 rounded font-semibold flex-shrink-0 mt-0.5 ${s.tagColor} ${gray || done ? 'opacity-60' : ''}`}>
                  {s.tag}
                </span>

                {/* Erledigt toggle */}
                <button
                  className={`flex-shrink-0 mt-0.5 no-print transition-colors ${done ? 'text-green-600 hover:text-gray-400' : 'text-gray-300 hover:text-green-500'}`}
                  onClick={() => toggleDone(item.id)}
                  title={done ? 'Als offen markieren' : 'Als freigemeldet markieren'}
                >
                  {done ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                </button>

                {/* Carried badge */}
                {item.carriedFromId && !gray && (
                  <span className="badge-blue text-xs flex-shrink-0 mt-0.5 no-print">↩ Übernommen</span>
                )}
                {gray && (
                  <span className="badge text-xs flex-shrink-0 mt-0.5 bg-gray-200 text-gray-500">Freigemeldet (Vorgänger)</span>
                )}

                {/* No. */}
                <div className="w-14 flex-shrink-0">
                  <label className="block text-xs font-medium text-gray-400 mb-1">Nr.</label>
                  <input
                    className={`input py-1 text-center font-semibold text-xs ${gray || done ? 'text-gray-400 line-through' : ''}`}
                    value={item.no}
                    onChange={e => update(item.id, 'no', e.target.value)}
                    placeholder={String(i + 1)}
                    readOnly={gray}
                  />
                </div>

                {/* Topic */}
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-400 mb-1">Thema</label>
                  <input
                    className={`input py-1 ${s.label} ${gray || done ? 'text-gray-400 line-through' : ''}`}
                    placeholder="Thema…"
                    value={item.topic}
                    onChange={e => update(item.id, 'topic', e.target.value)}
                    readOnly={gray}
                  />
                </div>

                {/* Controls */}
                {!gray && (
                  <div className="flex items-center gap-1 no-print mt-5">
                    <button className="btn-ghost p-1.5 text-gray-400 hover:text-brand-600 disabled:opacity-30"
                      title="Einrücken" onClick={() => changeLevel(item.id, 1)} disabled={lvl >= 3}>
                      <IndentIncrease size={14} />
                    </button>
                    <button className="btn-ghost p-1.5 text-gray-400 hover:text-brand-600 disabled:opacity-30"
                      title="Ausrücken" onClick={() => changeLevel(item.id, -1)} disabled={lvl <= 1}>
                      <IndentDecrease size={14} />
                    </button>
                    <button className="btn-ghost p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50"
                      onClick={() => remove(item.id)} title="Entfernen">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>

              {/* Discussion + Result (only editable when not gray) */}
              {!gray && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Besprechungsinhalt / Notizen</label>
                    <textarea className={`textarea text-sm ${done ? 'text-gray-400' : ''}`} rows={3}
                      placeholder="Inhalt…" value={item.discussion}
                      onChange={e => update(item.id, 'discussion', e.target.value)} readOnly={done && item.carriedGray} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Ergebnis / Beschluss</label>
                    <textarea className={`textarea text-sm ${done ? 'text-gray-400' : ''}`} rows={2}
                      placeholder="Ergebnis…" value={item.result}
                      onChange={e => update(item.id, 'result', e.target.value)} readOnly={done && item.carriedGray} />
                  </div>
                </>
              )}

              {/* Gray items: show read-only summary */}
              {gray && (item.discussion || item.result) && (
                <div className="text-xs text-gray-400 space-y-1 pl-1">
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
