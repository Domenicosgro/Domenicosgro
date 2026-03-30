import React from 'react'
import { Plus, Trash2, CalendarClock } from 'lucide-react'
import { emptyAgendaDraftItem } from '../utils'

export default function AgendaDraft({ agenda, agendaGreeting, agendaSentAt, onChange, onChangeGreeting }) {
  const add = () => {
    const no = String(agenda.length + 1)
    onChange([...agenda, { ...emptyAgendaDraftItem(), no }])
  }

  const update = (id, field, value) =>
    onChange(agenda.map(it => it.id === id ? { ...it, [field]: value } : it))

  const remove = (id) => onChange(agenda.filter(it => it.id !== id))

  const moveUp = (i) => {
    if (i === 0) return
    const next = [...agenda]
    ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
    onChange(next)
  }

  const moveDown = (i) => {
    if (i === agenda.length - 1) return
    const next = [...agenda]
    ;[next[i], next[i + 1]] = [next[i + 1], next[i]]
    onChange(next)
  }

  const totalMin = agenda.reduce((s, a) => s + (parseInt(a.duration) || 0), 0)

  return (
    <div className="card p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="section-title"><CalendarClock size={16} /> Agenda (Vorab)</h2>
          {agendaSentAt && (
            <span className="badge-green text-xs">
              Versendet am {new Date(agendaSentAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
            </span>
          )}
          {totalMin > 0 && (
            <span className="text-xs text-gray-400">Geplant: {totalMin} min</span>
          )}
        </div>
        <button className="btn-primary no-print" onClick={add}><Plus size={14} /> Punkt hinzufügen</button>
      </div>

      {/* Greeting / intro text */}
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">
          Einleitungstext für die E-Mail{' '}
          <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <textarea
          className="textarea text-sm"
          rows={2}
          placeholder="Sehr geehrte Damen und Herren, hiermit laden wir Sie herzlich zur Besprechung ein …"
          value={agendaGreeting}
          onChange={e => onChangeGreeting(e.target.value)}
        />
      </div>

      {agenda.length === 0 && (
        <p className="text-sm text-gray-400 italic">Noch keine Agendapunkte erfasst.</p>
      )}

      {agenda.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left pb-2 pr-2 text-xs font-medium text-gray-500 w-10">Nr.</th>
                <th className="text-left pb-2 pr-2 text-xs font-medium text-gray-500">Thema / Tagesordnungspunkt</th>
                <th className="text-left pb-2 pr-2 text-xs font-medium text-gray-500 w-24">Dauer (min)</th>
                <th className="text-left pb-2 pr-2 text-xs font-medium text-gray-500 w-36">Zuständig</th>
                <th className="text-left pb-2 pr-2 text-xs font-medium text-gray-500 w-40">Unterlagen / Vorbereitung</th>
                <th className="pb-2 w-16 no-print" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {agenda.map((item, i) => (
                <tr key={item.id}>
                  <td className="py-2 pr-2 align-top pt-3">
                    <input
                      className="input py-1 w-10 text-center text-xs font-semibold"
                      value={item.no}
                      onChange={e => update(item.id, 'no', e.target.value)}
                      placeholder={String(i + 1)}
                    />
                  </td>
                  <td className="py-2 pr-2 align-top">
                    <input
                      className="input py-1 font-medium"
                      placeholder="Thema …"
                      value={item.topic}
                      onChange={e => update(item.id, 'topic', e.target.value)}
                    />
                  </td>
                  <td className="py-2 pr-2 align-top">
                    <div className="flex items-center gap-1">
                      <input
                        className="input py-1 text-right w-16"
                        type="number"
                        min="0"
                        placeholder="15"
                        value={item.duration}
                        onChange={e => update(item.id, 'duration', e.target.value)}
                      />
                      <span className="text-xs text-gray-400">min</span>
                    </div>
                  </td>
                  <td className="py-2 pr-2 align-top">
                    <input
                      className="input py-1 text-xs"
                      placeholder="Name"
                      value={item.responsible}
                      onChange={e => update(item.id, 'responsible', e.target.value)}
                    />
                  </td>
                  <td className="py-2 pr-2 align-top">
                    <input
                      className="input py-1 text-xs"
                      placeholder="Pläne, Berichte …"
                      value={item.documents}
                      onChange={e => update(item.id, 'documents', e.target.value)}
                    />
                  </td>
                  <td className="py-2 align-top no-print">
                    <div className="flex gap-1 pt-1">
                      <button
                        className="btn-ghost p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                        onClick={() => moveUp(i)} disabled={i === 0} title="Nach oben"
                      >↑</button>
                      <button
                        className="btn-ghost p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                        onClick={() => moveDown(i)} disabled={i === agenda.length - 1} title="Nach unten"
                      >↓</button>
                      <button
                        className="btn-ghost p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50"
                        onClick={() => remove(item.id)} title="Entfernen"
                      ><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            {totalMin > 0 && (
              <tfoot>
                <tr className="border-t border-gray-200">
                  <td colSpan={2} className="pt-2 text-xs text-gray-500 font-medium">Gesamt</td>
                  <td className="pt-2 text-xs font-semibold text-brand-700 text-right pr-6">{totalMin} min</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  )
}
