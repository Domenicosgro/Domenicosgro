import React from 'react'
import { Plus, Trash2, CalendarClock, Link } from 'lucide-react'
import { emptyAgendaDraftItem } from '../utils'
import SpellCheckTextarea from './SpellCheckTextarea'

export default function AgendaDraft({ agenda, agendaGreeting, agendaSentAt, protocolItems, projectContacts, onChange, onChangeGreeting }) {
  const contactListId = 'agenda-contacts-list'
  const add = () => {
    const no = String(agenda.length + 1)
    onChange([...agenda, { ...emptyAgendaDraftItem(), no }])
  }

  const update = (id, field, value) =>
    onChange(agenda.map(it => it.id === id ? { ...it, [field]: value } : it))

  const remove = (id) => onChange(agenda.filter(it => it.id !== id))

  const moveUp = (i) => {
    if (i === 0) return
    const next = [...agenda]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; onChange(next)
  }
  const moveDown = (i) => {
    if (i === agenda.length - 1) return
    const next = [...agenda]; [next[i], next[i + 1]] = [next[i + 1], next[i]]; onChange(next)
  }

  const totalMin = agenda.reduce((s, a) => s + (parseInt(a.duration) || 0), 0)

  // Protocol points available for linking (open ones only)
  const linkableItems = (protocolItems ?? []).filter(it => it.topic)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-gray-200">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="section-title"><CalendarClock size={16} /> Agenda (Vorab)</h2>
          {agendaSentAt && (
            <span className="badge-green text-xs">
              Versendet {new Date(agendaSentAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
            </span>
          )}
          {totalMin > 0 && <span className="text-xs text-gray-400">Geplant: {totalMin} min</span>}
        </div>
        <button className="btn-primary no-print" onClick={add}><Plus size={14} /> Punkt hinzufügen</button>
      </div>

      {/* Greeting */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">
          Einleitungstext E-Mail <span className="text-gray-400">(optional)</span>
        </label>
        <SpellCheckTextarea className="textarea text-sm" rows={2}
          placeholder="Sehr geehrte Damen und Herren, hiermit laden wir Sie herzlich ein …"
          value={agendaGreeting} onChange={e => onChangeGreeting(e.target.value)} />
      </div>

      {/* Contact datalist */}
      {(projectContacts ?? []).length > 0 && (
        <datalist id={contactListId}>
          {(projectContacts ?? []).map(c => (
            <option key={c.id} value={c.name ? (c.company ? `${c.name} (${c.company})` : c.name) : c.company} />
          ))}
        </datalist>
      )}

      {agenda.length === 0 && (
        <p className="text-sm text-gray-400 italic">Noch keine Agendapunkte erfasst.</p>
      )}

      {agenda.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[680px]">
            <thead>
              <tr className="border-b border-gray-200 text-xs text-gray-500">
                <th className="text-left pb-2 pr-2 w-10">Nr.</th>
                <th className="text-left pb-2 pr-2">Thema</th>
                <th className="text-left pb-2 pr-2 w-24">Dauer (min)</th>
                <th className="text-left pb-2 pr-2 w-36">Zuständig</th>
                <th className="text-left pb-2 pr-2 w-40">Unterlagen</th>
                <th className="text-left pb-2 pr-2 w-44 no-print">
                  <span className="flex items-center gap-1"><Link size={11} /> Protokollpunkt</span>
                </th>
                <th className="pb-2 w-16 no-print" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {agenda.map((item, i) => {
                const linkedItem = linkableItems.find(p => p.id === item.linkedProtocolItemId)
                return (
                  <tr key={item.id}>
                    <td className="py-2 pr-2 align-top pt-3">
                      <input className="input py-1 w-10 text-center text-xs font-semibold"
                        value={item.no} placeholder={String(i + 1)}
                        onChange={e => update(item.id, 'no', e.target.value)} />
                    </td>
                    <td className="py-2 pr-2 align-top">
                      <input className="input py-1 font-medium"
                        placeholder="Thema…" value={item.topic}
                        onChange={e => update(item.id, 'topic', e.target.value)} />
                    </td>
                    <td className="py-2 pr-2 align-top">
                      <div className="flex items-center gap-1">
                        <input className="input py-1 text-right w-16" type="number" min="0" placeholder="15"
                          value={item.duration} onChange={e => update(item.id, 'duration', e.target.value)} />
                        <span className="text-xs text-gray-400">min</span>
                      </div>
                    </td>
                    <td className="py-2 pr-2 align-top">
                      <input className="input py-1 text-xs" placeholder="Name/Firma"
                        value={item.responsible}
                        list={(projectContacts ?? []).length > 0 ? contactListId : undefined}
                        onChange={e => update(item.id, 'responsible', e.target.value)} />
                    </td>
                    <td className="py-2 pr-2 align-top">
                      <input className="input py-1 text-xs" placeholder="Pläne, Berichte…"
                        value={item.documents} onChange={e => update(item.id, 'documents', e.target.value)} />
                    </td>
                    {/* Link to existing protocol point */}
                    <td className="py-2 pr-2 align-top no-print">
                      {linkableItems.length > 0 ? (
                        <select
                          className="select py-1 text-xs"
                          value={item.linkedProtocolItemId ?? ''}
                          onChange={e => update(item.id, 'linkedProtocolItemId', e.target.value || null)}
                          title="Diesem Agendapunkt einen bestehenden Protokollpunkt zuordnen"
                        >
                          <option value="">Neu erstellen</option>
                          {linkableItems.map(p => (
                            <option key={p.id} value={p.id}>
                              {p.no ? `${p.no} – ` : ''}{p.topic.slice(0, 30)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-gray-400 italic">Neu erstellen</span>
                      )}
                      {linkedItem && (
                        <span className="block text-xs text-brand-600 mt-0.5">→ {linkedItem.topic.slice(0, 25)}</span>
                      )}
                    </td>
                    <td className="py-2 align-top no-print">
                      <div className="flex gap-1 pt-1">
                        <button className="btn-ghost p-1 text-gray-400 disabled:opacity-30"
                          onClick={() => moveUp(i)} disabled={i === 0}>↑</button>
                        <button className="btn-ghost p-1 text-gray-400 disabled:opacity-30"
                          onClick={() => moveDown(i)} disabled={i === agenda.length - 1}>↓</button>
                        <button className="btn-ghost p-1.5 text-red-400 hover:text-red-600"
                          onClick={() => remove(item.id)}><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {totalMin > 0 && (
              <tfoot>
                <tr className="border-t border-gray-200">
                  <td colSpan={2} className="pt-2 text-xs text-gray-500 font-medium">Gesamt</td>
                  <td className="pt-2 text-xs font-semibold text-brand-700 pr-6 text-right">{totalMin} min</td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  )
}
