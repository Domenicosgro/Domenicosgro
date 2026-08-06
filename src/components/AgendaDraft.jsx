import React, { useMemo, useState } from 'react'
import { Plus, Trash2, CalendarClock, GripVertical } from 'lucide-react'
import { emptyAgendaDraftItem } from '../utils'
import SpellCheckTextarea from './SpellCheckTextarea'
import ContactAutocomplete from './ContactAutocomplete'

export default function AgendaDraft({ agenda, agendaGreeting, agendaSentAt, protocolItems, projectContacts, onChange, onChangeGreeting }) {

  // Only "real" Hauptpunkte as sections — not auto-created ones (linkedFromAgendaId set)
  const sectionItems = useMemo(
    () => (protocolItems ?? []).filter(it => it.topic && (it.level ?? 1) === 1 && !it.linkedFromAgendaId),
    [protocolItems]
  )

  // Group agenda items by linkedProtocolItemId
  const sections = useMemo(() => {
    const linked = sectionItems.map(pi => ({
      id: pi.id,
      no: pi.no,
      topic: pi.topic,
      label: `${pi.no ? pi.no + ' – ' : ''}${pi.topic}`,
      items: agenda.filter(a => a.linkedProtocolItemId === pi.id),
    }))
    const newItems = agenda.filter(a =>
      !a.linkedProtocolItemId || !sectionItems.find(pi => pi.id === a.linkedProtocolItemId)
    )
    return [...linked, { id: '__new__', no: null, label: null, items: newItems }]
  }, [agenda, sectionItems])

  const totalMin = agenda.reduce((s, a) => s + (parseInt(a.duration) || 0), 0)

  const addToSection = (parentId) => {
    const pi = parentId === '__new__' ? null : sectionItems.find(p => p.id === parentId)
    onChange([...agenda, {
      ...emptyAgendaDraftItem(),
      topic: pi?.topic || '',   // erbt zunächst den Titel des Hauptpunkts (bleibt änderbar)
      linkedProtocolItemId: parentId === '__new__' ? null : parentId,
    }])
  }

  const update = (id, field, value) =>
    onChange(agenda.map(it => it.id === id ? { ...it, [field]: value } : it))

  const remove = (id) => onChange(agenda.filter(it => it.id !== id))

  // ── Drag & Drop: Agenda-Punkt einem anderen Hauptthema (Section) zuordnen ────
  const [dragId,     setDragId]     = useState(null)
  const [dragOverId, setDragOverId] = useState(null)
  const handleDropOnSection = (sectionId) => {
    if (!dragId) return
    const target = sectionId === '__new__' ? null : sectionId
    const it = agenda.find(a => a.id === dragId)
    if (it && (it.linkedProtocolItemId ?? null) !== target) {
      update(dragId, 'linkedProtocolItemId', target)
    }
    setDragId(null); setDragOverId(null)
  }

  // Punkt exakt an eine Position innerhalb SEINES Hauptthemas setzen (Auswahl).
  // afterId = null → an 1. Stelle; sonst direkt hinter den Punkt mit dieser ID.
  // Es werden nur die Slots dieses Hauptthemas im globalen agenda-Array permutiert;
  // Punkte anderer Hauptthemen bleiben an Ort und Stelle.
  const repositionItem = (sectionAgenda, item, afterId) => {
    const ids    = sectionAgenda.map(a => a.id)
    const others = ids.filter(id => id !== item.id)
    const insertAt = afterId == null ? 0 : others.indexOf(afterId) + 1
    const newOrder = [...others.slice(0, insertAt), item.id, ...others.slice(insertAt)]
    if (newOrder.join('|') === ids.join('|')) return   // keine Änderung
    const idSet = new Set(ids)
    const byId  = new Map(agenda.map(a => [a.id, a]))
    let k = 0
    const next = agenda.map(a => idSet.has(a.id) ? byId.get(newOrder[k++]) : a)
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
            <div
              key={section.id}
              className={`border transition-colors ${dragOverId === section.id ? 'border-brand-400 ring-2 ring-brand-200' : 'border-gray-200'}`}
              onDragOver={e => { if (dragId) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOverId !== section.id) setDragOverId(section.id) } }}
              onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOverId(prev => (prev === section.id ? null : prev)) }}
              onDrop={e => { e.preventDefault(); handleDropOnSection(section.id) }}
            >
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
                        <th className="text-left py-1.5 pr-2 w-20">Uhrzeit</th>
                        <th className="text-left py-1.5 pr-2">Thema</th>
                        <th className="text-left py-1.5 pr-2 w-24">Dauer (min)</th>
                        <th className="text-left py-1.5 pr-2 w-36">Zuständig</th>
                        <th className="text-left py-1.5 pr-2 w-40">Unterlagen</th>
                        <th className="py-1.5 w-20 no-print" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {section.items.map((item, i) => (
                        <tr key={item.id} className={dragId === item.id ? 'opacity-40' : ''}>
                          <td className="py-2 pl-3 pr-2 align-top">
                            <span className="block w-12 text-center text-xs font-semibold text-gray-600 pt-1.5"
                              title="Automatisch aus Hauptpunkt und Position abgeleitet">
                              {section.no ? `${section.no}.${i + 1}` : String(i + 1)}
                            </span>
                          </td>
                          <td className="py-2 pr-2 align-top">
                            <input className="input py-1 text-xs w-20" type="time"
                              value={item.time ?? ''} onChange={e => update(item.id, 'time', e.target.value)} />
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
                            <ContactAutocomplete className="input py-1 text-xs" placeholder="Name/Firma"
                              value={item.responsible}
                              contacts={projectContacts ?? []}
                              onChange={v => update(item.id, 'responsible', v)} />
                          </td>
                          <td className="py-2 pr-2 align-top">
                            <input className="input py-1 text-xs" placeholder="Pläne, Berichte…"
                              value={item.documents} onChange={e => update(item.id, 'documents', e.target.value)} />
                          </td>
                          <td className="py-2 pr-3 align-top no-print">
                            <div className="flex gap-1 pt-1 items-center">
                              <span
                                className="cursor-grab text-gray-300 hover:text-gray-500 flex-shrink-0"
                                title="Ziehen, um den Punkt einem anderen Hauptthema zuzuordnen"
                                draggable
                                onDragStart={e => { setDragId(item.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', item.id) }}
                                onDragEnd={() => { setDragId(null); setDragOverId(null) }}
                              ><GripVertical size={14} /></span>
                              {/* Genaue Position unterhalb des Hauptpunkts auswählen */}
                              {section.items.length > 1 && (
                                <select
                                  className="select py-0.5 text-xs max-w-[8.5rem]"
                                  title="Position dieses Punkts unterhalb des Hauptpunkts wählen"
                                  value={i === 0 ? '__front__' : section.items[i - 1].id}
                                  onChange={e => repositionItem(section.items, item, e.target.value === '__front__' ? null : e.target.value)}
                                >
                                  <option value="__front__">an 1. Stelle</option>
                                  {section.items.map((sib, j) => sib.id === item.id ? null : (
                                    <option key={sib.id} value={sib.id}>
                                      nach {section.no ? `${section.no}.${j + 1}` : (j + 1)}
                                      {sib.topic ? ` – ${sib.topic.slice(0, 24)}` : ''}
                                    </option>
                                  ))}
                                </select>
                              )}
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
                <p className="text-xs text-gray-400 italic px-3 py-2 no-print">
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
