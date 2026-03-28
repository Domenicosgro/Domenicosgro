import React from 'react'
import { Plus, Trash2, List, IndentIncrease, IndentDecrease } from 'lucide-react'
import { emptyAgendaItem } from '../utils'

const LEVEL_STYLES = {
  1: { indent: 'ml-0',  bg: 'bg-white',       border: 'border-brand-200', label: 'text-sm font-bold text-gray-900',   tag: 'Ebene 1', tagColor: 'bg-brand-600 text-white' },
  2: { indent: 'ml-6',  bg: 'bg-gray-50',     border: 'border-gray-200',  label: 'text-sm font-semibold text-gray-800', tag: 'Ebene 2', tagColor: 'bg-brand-100 text-brand-700' },
  3: { indent: 'ml-12', bg: 'bg-gray-100/60', border: 'border-gray-200',  label: 'text-sm font-medium text-gray-700',  tag: 'Ebene 3', tagColor: 'bg-gray-200 text-gray-600' },
}

export default function AgendaItems({ items, onChange }) {
  const add = (level = 1) => {
    const sameLevel = items.filter(i => i.level === level)
    const no = buildNo(items, level, sameLevel.length)
    onChange([...items, { ...emptyAgendaItem(level), no }])
  }

  const update = (id, field, value) =>
    onChange(items.map(it => it.id === id ? { ...it, [field]: value } : it))

  const remove = (id) => onChange(items.filter(it => it.id !== id))

  const changeLevel = (id, delta) => {
    onChange(items.map(it => {
      if (it.id !== id) return it
      const next = Math.min(3, Math.max(1, (it.level ?? 1) + delta))
      return { ...it, level: next }
    }))
  }

  const moveUp = (idx) => {
    if (idx === 0) return
    const next = [...items]
    ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
    onChange(next)
  }

  const moveDown = (idx) => {
    if (idx === items.length - 1) return
    const next = [...items]
    ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
    onChange(next)
  }

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="section-title"><List size={16} /> Tagesordnungspunkte</h2>
        <div className="flex gap-2 no-print flex-wrap">
          <button className="btn-primary" onClick={() => add(1)}><Plus size={14} /> Hauptpunkt</button>
          <button className="btn-secondary" onClick={() => add(2)}><Plus size={14} /> Unterpunkt</button>
          <button className="btn-secondary" onClick={() => add(3)}><Plus size={14} /> Unterunterpunkt</button>
        </div>
      </div>

      {/* Level legend */}
      <div className="flex gap-3 flex-wrap no-print">
        {[1, 2, 3].map(l => (
          <span key={l} className={`text-xs px-2 py-0.5 rounded-full font-medium ${LEVEL_STYLES[l].tagColor}`}>
            {LEVEL_STYLES[l].tag}
          </span>
        ))}
      </div>

      {items.length === 0 && (
        <p className="text-sm text-gray-400 italic">Keine Tagesordnungspunkte erfasst.</p>
      )}

      <div className="space-y-3">
        {items.map((item, i) => {
          const lvl = item.level ?? 1
          const s = LEVEL_STYLES[lvl]
          return (
            <div key={item.id} className={`${s.indent} border rounded-lg p-4 space-y-3 ${s.bg} ${s.border}`}>
              {/* TOP header row */}
              <div className="flex items-start gap-2">
                {/* Level indicator */}
                <span className={`text-xs px-1.5 py-0.5 rounded font-semibold flex-shrink-0 mt-0.5 ${s.tagColor}`}>
                  E{lvl}
                </span>

                {/* Number */}
                <div className="w-16 flex-shrink-0">
                  <label className="block text-xs font-medium text-gray-500 mb-1">TOP-Nr.</label>
                  <input
                    className="input py-1 text-center font-semibold text-xs"
                    value={item.no}
                    onChange={e => update(item.id, 'no', e.target.value)}
                    placeholder={(i + 1).toString()}
                  />
                </div>

                {/* Topic */}
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Thema</label>
                  <input
                    className={`input py-1 ${s.label}`}
                    placeholder="Thema..."
                    value={item.topic}
                    onChange={e => update(item.id, 'topic', e.target.value)}
                  />
                </div>

                {/* Controls */}
                <div className="flex items-center gap-1 no-print mt-5">
                  <button
                    className="btn-ghost p-1.5 text-gray-400 hover:text-brand-600"
                    title="Ebene erhöhen (einrücken)"
                    onClick={() => changeLevel(item.id, 1)}
                    disabled={lvl >= 3}
                  >
                    <IndentIncrease size={14} />
                  </button>
                  <button
                    className="btn-ghost p-1.5 text-gray-400 hover:text-brand-600"
                    title="Ebene verringern (ausrücken)"
                    onClick={() => changeLevel(item.id, -1)}
                    disabled={lvl <= 1}
                  >
                    <IndentDecrease size={14} />
                  </button>
                  <button
                    className="btn-ghost p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50"
                    onClick={() => remove(item.id)}
                    title="Entfernen"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Discussion */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Besprechungsinhalt / Notizen</label>
                <textarea
                  className="textarea text-sm"
                  rows={3}
                  placeholder="Inhalt der Besprechung..."
                  value={item.discussion}
                  onChange={e => update(item.id, 'discussion', e.target.value)}
                />
              </div>

              {/* Result */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Ergebnis / Beschluss</label>
                <textarea
                  className="textarea text-sm"
                  rows={2}
                  placeholder="Ergebnis oder Beschluss..."
                  value={item.result}
                  onChange={e => update(item.id, 'result', e.target.value)}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// helper – not used at runtime but keeps logic centralized
function buildNo(items, level, idx) {
  return String(idx + 1)
}
