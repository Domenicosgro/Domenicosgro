import React, { useMemo } from 'react'
import { Plus, Trash2, CalendarClock } from 'lucide-react'
import { emptyAgendaDraftItem } from '../utils'
import SpellCheckTextarea from './SpellCheckTextarea'

export default function AgendaDraft({ agenda, agendaGreeting, agendaSentAt, protocolItems, projectContacts, onChange, onChangeGreeting }) {
  const contactListId = 'agenda-contacts-list'

  // Only "real" Hauptpunkte as sections — not auto-created ones (linkedFromAgendaId set)
  const sectionItems = useMemo(
    () => (protocolItems ?? []).filter(it => it.topic && (it.level ?? 1) === 1 && !it.linkedFromAgendaId),
    [protocolItems]
  )

  // Group agenda items by linkedProtocolItemId
  const sections = useMemo(() => {
    const linked = sectionItems.map(pi => ({
      id: pi.id,
      label: `${pi.no ? pi.no + ' – ' : ''}${pi.topic}`,
      items: agenda.filter(a => a.linkedProtocolItemId === pi.id),
    }))
    const newItems = agenda.filter(a =>
      !a.linkedProtocolItemId || !sectionItems.find(pi => pi.id === a.linkedProtocolItemId)
    )
    return [...linked, { id: '__new__', label: null, items: newItems }]
  }, [agenda, sectionItems])

  const totalMin = agenda.reduce((s, a) => s + (parseInt(a.duration) || 0), 0)

  const addToSection = (parentId) => {
    const no = String(agenda.length + 1)
    onChange([...agenda, {
      ...emptyAgendaDraftItem(),
      no,
      linkedProtocolItemId: parentId === '__new__' ? null : parentId,
    }])
  }

  const update = (id, field, value) =>
    onChange(agenda.map(it => it.id === id ? { ...it, [field]: value } : it))

  const remove = (id) => onChange(agenda.filter(it => it.id !== id))

  const moveUp = (sectionAgenda, item) => {
    const si = sectionAgenda.findIndex(a => a.id === item.id)
    if (si === 0) return
    const gi  = agenda.findIndex(a => a.id === item.id)
    const gp  = agenda.findIndex(a => a.id === sectionAgenda[si - 1].id)
    const next = [...agenda];
    [next[gp], next[gi]] = [next[gi], next[gp]]
    onChange(next)
  }

  const moveDown = (sectionAgenda, item) => {
    const si = sectionAgenda.findIndex(a => a.id === item.id)
    if (si === sectionAgenda.length - 1) return
    const gi  = agenda.findIndex(a => a.id === item.id)
    const gn  = agenda.findIndex(a => a.id === sectionAgenda[si + 1].id)
    const next = [...agenda];
    [next[gi], next[gn]] = [next[gn], next[gi]]
    onChange(next)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
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
        {sectionItems.length === 0 && (
          <button className="btn-primary no-print" onClick={() => addToSection('__new__')}>
            <Plus size={14} /> Neuer Hauptpunkt
          </button>
        )}
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

      {agenda.length === 0 && sectionItems.length === 0 && (
        <p className="text-sm text-gray-400 italic">Noch keine Agendapunkte erfasst.</p>
      )}

      {/* Sections */}
      <div className="space-y-3">
        {sections.map(section => {
          const isNew = section.id === '__new__'
          // Skip the "new" section entirely if it's empty and there are existing sections
          if (isNew && section.items.length === 0 && sectionItems.length > 0) return null

          return (
            <div key={section.id} className="border border-gray-200">
              {/* Section header */}
              <div className={`flex items-center justify-between px-3 py-2 ${
                isNew ? 'bg-gray-50' : 'bg-brand-50 border-b border-brand-100'
              }`}>
                <span className={`text-sm font-semibold ${isNew ? 'text-gray-500 italic' : 'text-brand-700'}`}>
                  {isNew ? 'Neuer Hauptpunkt' : section.label}
                </span>
                {(!isNew || sectionItems.length === 0) && (
                  <button className="btn-ghost py-0.5 px-2 text-xs no-print" onClick={() => addToSection(section.id)}>
                    <Plus size={12} /> Punkt hinzufügen
                  </button>
                )}
              </div>

              {/* Items table */}
              {section.items.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[560px]">
                    <thead>
                      <tr className="border-b border-gray-100 text-xs text-gray-500">
                        <th className="text-left py-1.5 pl-3 pr-2 w-10">Nr.</th>
                        <th className="text-left py-1.5 pr-2">Thema</th>
                        <th className="text-left py-1.5 pr-2 w-24">Dauer (min)</th>
                        <th className="text-left py-1.5 pr-2 w-36">Zuständig</th>
                        <th className="text-left py-1.5 pr-2 w-40">Unterlagen</th>
                        <th className="py-1.5 w-20 no-print" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {section.items.map((item, i) => (
                        <tr key={item.id}>
                          <td className="py-2 pl-3 pr-2 align-top">
                            <input className="input py-1 w-10 text-center text-xs font-semibold"
                              value={item.no} placeholder={String(i + 1)}
                              onChange={e => update(item.id, 'no', e.target.value)} />
                          </td>
                          <td className="py-2 pr-2 align-top">
                            <textarea className="textarea py-1 font-medium text-sm leading-snug" rows={2}
                              placeholder="Thema…" style={{ minHeight: '2.25rem', resize: 'vertical' }}
                              value={item.topic} onChange={e => update(item.id, 'topic', e.target.value)} />
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
                          <td className="py-2 pr-3 align-top no-print">
                            <div className="flex gap-1 pt-1">
                              <button className="btn-ghost p-1 text-gray-400 disabled:opacity-30"
                                onClick={() => moveUp(section.items, item)} disabled={i === 0}>↑</button>
                              <button className="btn-ghost p-1 text-gray-400 disabled:opacity-30"
                                onClick={() => moveDown(section.items, item)} disabled={i === section.items.length - 1}>↓</button>
                              <button className="btn-ghost p-1.5 text-red-400 hover:text-red-600"
                                onClick={() => remove(item.id)}><Trash2 size={13} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic px-3 py-2">
                  Noch keine Punkte — „Punkt hinzufügen" klicken.
                </p>
              )}
            </div>
          )
        })}
      </div>

      {totalMin > 0 && (
        <div className="text-right text-xs text-gray-500 pt-1 border-t border-gray-100">
          Gesamt: <span className="font-semibold text-brand-700">{totalMin} min</span>
        </div>
      )}
    </div>
  )
}
