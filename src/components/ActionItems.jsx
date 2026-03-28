import React from 'react'
import { Plus, Trash2, CheckSquare } from 'lucide-react'
import { emptyActionItem, ACTION_STATUSES, PRIORITIES, statusBadge, priorityBadge, formatDate } from '../utils'

export default function ActionItems({ items, onChange }) {
  const add = () => {
    const no = String(items.length + 1)
    onChange([...items, { ...emptyActionItem(), no }])
  }

  const update = (id, field, value) =>
    onChange(items.map(it => it.id === id ? { ...it, [field]: value } : it))

  const remove = (id) => onChange(items.filter(it => it.id !== id))

  const openCount = items.filter(it => it.status === 'offen' || it.status === 'in_arbeit').length

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="section-title"><CheckSquare size={16} /> Maßnahmen &amp; Aufgaben</h2>
          {openCount > 0 && (
            <span className="badge-yellow">{openCount} offen</span>
          )}
        </div>
        <button className="btn-primary no-print" onClick={add}><Plus size={14} /> Maßnahme hinzufügen</button>
      </div>

      {items.length === 0 && (
        <p className="text-sm text-gray-400 italic">Keine Maßnahmen erfasst.</p>
      )}

      {items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left pb-2 pr-2 text-xs font-medium text-gray-500 w-10">Nr.</th>
                <th className="text-left pb-2 pr-2 text-xs font-medium text-gray-500">Maßnahme / Beschreibung</th>
                <th className="text-left pb-2 pr-2 text-xs font-medium text-gray-500 w-36">Verantwortlich</th>
                <th className="text-left pb-2 pr-2 text-xs font-medium text-gray-500 w-32 no-print">Termin</th>
                <th className="text-left pb-2 pr-2 text-xs font-medium text-gray-500 w-28 no-print">Priorität</th>
                <th className="text-left pb-2 pr-2 text-xs font-medium text-gray-500 w-28">Status</th>
                <th className="pb-2 text-xs font-medium text-gray-500 no-print"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((item, i) => {
                const sb = statusBadge(item.status)
                const pb = priorityBadge(item.priority)
                const isOverdue = item.deadline && item.status !== 'erledigt' && new Date(item.deadline) < new Date()
                return (
                  <tr key={item.id} className={isOverdue ? 'bg-red-50' : ''}>
                    <td className="py-2 pr-2 text-gray-400 text-xs align-top pt-3">
                      <input
                        className="input py-1 text-center w-10 text-xs"
                        value={item.no}
                        onChange={e => update(item.id, 'no', e.target.value)}
                        placeholder={(i + 1).toString()}
                      />
                    </td>
                    <td className="py-2 pr-2 align-top">
                      <input
                        className="input py-1 mb-1 font-medium"
                        placeholder="Beschreibung der Maßnahme..."
                        value={item.description}
                        onChange={e => update(item.id, 'description', e.target.value)}
                      />
                      <input
                        className="input py-1 text-xs text-gray-500"
                        placeholder="Bemerkungen (optional)"
                        value={item.remarks}
                        onChange={e => update(item.id, 'remarks', e.target.value)}
                      />
                    </td>
                    <td className="py-2 pr-2 align-top pt-3">
                      <input
                        className="input py-1 text-xs"
                        placeholder="Name / Firma"
                        value={item.responsible}
                        onChange={e => update(item.id, 'responsible', e.target.value)}
                      />
                    </td>
                    <td className="py-2 pr-2 align-top pt-3 no-print">
                      <input
                        className={`input py-1 text-xs ${isOverdue ? 'border-red-400 bg-red-50' : ''}`}
                        type="date"
                        value={item.deadline}
                        onChange={e => update(item.id, 'deadline', e.target.value)}
                      />
                      {isOverdue && <p className="text-red-500 text-xs mt-0.5">Überfällig</p>}
                    </td>
                    <td className="py-2 pr-2 align-top pt-3 no-print">
                      <select
                        className="select py-1 text-xs"
                        value={item.priority}
                        onChange={e => update(item.id, 'priority', e.target.value)}
                      >
                        {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                      </select>
                    </td>
                    <td className="py-2 pr-2 align-top pt-3">
                      <select
                        className="select py-1 text-xs"
                        value={item.status}
                        onChange={e => update(item.id, 'status', e.target.value)}
                      >
                        {ACTION_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </td>
                    <td className="py-2 align-top pt-3 no-print">
                      <button
                        className="btn-ghost p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50"
                        onClick={() => remove(item.id)}
                        title="Entfernen"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
