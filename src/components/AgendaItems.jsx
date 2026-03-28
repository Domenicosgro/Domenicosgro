import React from 'react'
import { Plus, Trash2, List } from 'lucide-react'
import { emptyAgendaItem } from '../utils'

export default function AgendaItems({ items, onChange }) {
  const add = () => {
    const no = String(items.length + 1)
    onChange([...items, { ...emptyAgendaItem(), no }])
  }

  const update = (id, field, value) =>
    onChange(items.map(it => it.id === id ? { ...it, [field]: value } : it))

  const remove = (id) => onChange(items.filter(it => it.id !== id))

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="section-title"><List size={16} /> Tagesordnungspunkte</h2>
        <button className="btn-primary no-print" onClick={add}><Plus size={14} /> Punkt hinzufügen</button>
      </div>

      {items.length === 0 && (
        <p className="text-sm text-gray-400 italic">Keine Tagesordnungspunkte erfasst.</p>
      )}

      <div className="space-y-4">
        {items.map((item, i) => (
          <div key={item.id} className="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50">
            <div className="flex items-start gap-3">
              <div className="w-16 flex-shrink-0">
                <label className="block text-xs font-medium text-gray-500 mb-1">TOP-Nr.</label>
                <input
                  className="input py-1 text-center font-semibold"
                  value={item.no}
                  onChange={e => update(item.id, 'no', e.target.value)}
                  placeholder={(i + 1).toString()}
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1">Thema</label>
                <input
                  className="input py-1 font-medium"
                  placeholder="Thema der Besprechung..."
                  value={item.topic}
                  onChange={e => update(item.id, 'topic', e.target.value)}
                />
              </div>
              <button
                className="btn-ghost p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 mt-5 no-print"
                onClick={() => remove(item.id)}
                title="Entfernen"
              >
                <Trash2 size={14} />
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Besprechungsinhalt / Notizen</label>
              <textarea
                className="textarea"
                rows={3}
                placeholder="Inhalt der Besprechung..."
                value={item.discussion}
                onChange={e => update(item.id, 'discussion', e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Ergebnis / Beschluss</label>
              <textarea
                className="textarea"
                rows={2}
                placeholder="Ergebnis oder Beschluss..."
                value={item.result}
                onChange={e => update(item.id, 'result', e.target.value)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
