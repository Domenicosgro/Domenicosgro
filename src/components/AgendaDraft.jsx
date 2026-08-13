import React, { useMemo, useState } from 'react'
import { Plus, Trash2, CalendarClock, GripVertical } from 'lucide-react'
import { emptyAgendaDraftItem } from '../utils'
import SpellCheckTextarea from './SpellCheckTextarea'
import ContactAutocomplete from './ContactAutocomplete'

export default function AgendaDraft({ agenda, agendaGreeting, agendaSentAt, protocolItems, projectContacts, onChange, onChangeGreeting }) {

  // Die Agenda zeigt/verwaltet NUR die Hauptpunkte (Ebene 1). Unterpunkte gehören
  // in den Protokollbereich; auto-aus dem Agenda-Entwurf erzeugte Punkte ausgenommen.
  const targetPoints = useMemo(
    () => (protocolItems ?? []).filter(it => it.topic && (it.level ?? 1) === 1 && !it.linkedFromAgendaId),
    [protocolItems]
  )

  // Gruppiert die Agendapunkte nach ihrem verknüpften Protokollpunkt (beliebige Ebene).
  const sections = useMemo(() => {
    const linked = targetPoints.map(pi => ({
      id: pi.id,
      no: pi.no,
      level: pi.level ?? 1,
      topic: pi.topic,
      label: `${pi.no ? pi.no + ' – ' : ''}${pi.topic}`,
      items: agenda.filter(a => a.linkedProtocolItemId === pi.id),
    }))
    const newItems = agenda.filter(a =>
      !a.linkedProtocolItemId || !targetPoints.find(pi => pi.id === a.linkedProtocolItemId)
    )
    return [...linked, { id: '__new__', no: null, level: 1, label: null, items: newItems }]
  }, [agenda, targetPoints])

  const totalMin = agenda.reduce((s, a) => s + (parseInt(a.duration) || 0), 0)

  const addToSection = (parentId) => {
    const pi = parentId === '__new__' ? null : targetPoints.find(p => p.id === parentId)
    onChange([...agenda, {
      ...emptyAgendaDraftItem(),
      topic: pi?.topic || '',   // erbt zunächst den Titel des Zielpunkts (bleibt änderbar)
      linkedProtocolItemId: parentId === '__new__' ? null : parentId,
    }])
  }

  const update = (id, field, value) =>
    onChange(agenda.map(it => it.id === id ? { ...it, [field]: value } : it))

  const remove = (id) => onChange(agenda.filter(it => it.id !== id))

  // ── Drag & Drop: Agenda-Punkt einem anderen Protokollpunkt zuordnen ──────────
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

  // Agendapunkt einem Protokollpunkt zuweisen: verknüpfen und ans ENDE dieses
  // Punkts anhängen. targetId '__none__' = ohne Zuordnung (neue Punkte).
  const assignToPoint = (item, targetId) => {
    const link    = targetId === '__none__' ? null : targetId
    const moved   = { ...item, linkedProtocolItemId: link }
    const without = agenda.filter(a => a.id !== item.id)
    // Index nach dem letzten Punkt derselben Gruppe (oder ans Ende).
    let lastIdx = -1
    without.forEach((a, idx) => { if ((a.linkedProtocolItemId ?? null) === (link ?? null)) lastIdx = idx })
    const insertAt = lastIdx === -1 ? without.length : lastIdx + 1
    onChange([...without.slice(0, insertAt), moved, ...without.slice(insertAt)])
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
        <button className="btn-primary no-print" onClick={() => addToSection('__new__')}>
          <Plus size={14} /> Agendapunkt hinzufügen
        </button>
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

      {agenda.length === 0 && (
        <p className="text-sm text-gray-400 italic">
          Noch keine Agendapunkte. „Agendapunkt hinzufügen" klicken und über „Zuordnen zu"
          einem Protokollpunkt zuweisen.
        </p>
      )}

      {/* Sections – die Agenda SPIEGELT die Protokollstruktur: JEDER Protokollpunkt
          (Haupt- und Unterpunkt, inkl. der aus dem Vorgänger übernommenen) erscheint
          als Abschnitt – auch ohne Agenda-Detail. Der Neu-Bereich nur, wenn er welche hat. */}
      <div className="space-y-3">
        {sections.map(section => {
          const isNew = section.id === '__new__'
          if (isNew && section.items.length === 0) return null   // leeren Neu-Bereich ausblenden

          const indent = isNew ? 0 : ((section.level ?? 1) - 1) * 20
          return (
            <div
              key={section.id}
              style={indent ? { marginLeft: indent } : undefined}
              className={`border transition-colors ${dragOverId === section.id ? 'border-brand-400 ring-2 ring-brand-200' : 'border-gray-200'}`}
              onDragOver={e => { if (dragId) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOverId !== section.id) setDragOverId(section.id) } }}
              onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOverId(prev => (prev === section.id ? null : prev)) }}
              onDrop={e => { e.preventDefault(); handleDropOnSection(section.id) }}
            >
              {/* Section header */}
              <div className={`flex items-center justify-between px-3 py-2 ${
                isNew ? 'bg-gray-50' : (section.level ?? 1) === 1 ? 'bg-brand-50 border-b border-brand-100' : 'bg-gray-50 border-b border-gray-100'
              }`}>
                <span className={`text-sm font-semibold ${isNew ? 'text-gray-500 italic' : (section.level ?? 1) === 1 ? 'text-brand-700' : 'text-gray-600'}`}>
                  {isNew ? 'Nicht zugeordnete Punkte' : section.label}
                </span>
                {!isNew && (
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
                        <th className="text-left py-1.5 pr-2 w-44 no-print">Zuordnen zu</th>
                        <th className="text-left py-1.5 pr-2 w-20">Uhrzeit</th>
                        <th className="text-left py-1.5 pr-2">Thema</th>
                        <th className="text-left py-1.5 pr-2 w-24">Dauer (min)</th>
                        <th className="text-left py-1.5 pr-2 w-36">Zuständig</th>
                        <th className="text-left py-1.5 pr-2 w-40">Unterlagen</th>
                        <th className="py-1.5 w-16 no-print" />
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
                          {/* Auswahl: Agendapunkt einem echten Protokollpunkt (Haupt- ODER
                              Unterpunkt) zuweisen → wird ans Ende dieses Punkts angehängt. */}
                          <td className="py-2 pr-2 align-top no-print">
                            <select
                              className="select py-1 text-xs w-44"
                              title="Diesen Agendapunkt einem Protokollpunkt zuordnen (wird ans Ende angehängt)"
                              value={item.linkedProtocolItemId ?? '__none__'}
                              onChange={e => assignToPoint(item, e.target.value)}
                            >
                              <option value="__none__">– ohne Zuordnung –</option>
                              {targetPoints.map(pt => (
                                <option key={pt.id} value={pt.id}>
                                  {' '.repeat(((pt.level ?? 1) - 1) * 2)}
                                  {pt.no ? `${pt.no} – ` : ''}{pt.topic}
                                </option>
                              ))}
                            </select>
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
