import React, { useMemo, useState } from 'react'
import { Plus, Trash2, ArrowRight, CheckSquare, AlertTriangle, Check } from 'lucide-react'
import { ACTION_STATUSES, PRIORITIES, emptyNoteTask, formatDate } from '../utils'
import ContactAutocomplete from './ContactAutocomplete'

// ── Aufgaben aus einer Notiz ─────────────────────────────────────────────────
//
// Eine Aktennotiz oder ein Telefonat endet oft mit „X kümmert sich bis
// Freitag". Bisher stand das im Fließtext und damit nirgends, wo jemand
// nachsieht. Hier bekommt jeder Punkt einen Zuständigen, eine Frist und einen
// Zustand – dieselben Felder und dieselben Wörter wie eine Maßnahme im
// Protokoll (`emptyActionItem` in utils.js), damit die Übernahme ins Protokoll
// eine Kopie ist und keine Übersetzung.
//
// Die Übernahme ist der eigentliche Zweck: dort hängen Mahnwesen, Freimeldung
// und das Maßnahmen-Dashboard. Danach führt die Maßnahme, und der Zustand der
// Notizaufgabe folgt ihr von selbst (server/maengel.js).

const heute = () => new Date().toISOString().slice(0, 10)
const istUeberfaellig = (t) => !!(t.deadline && t.status !== 'erledigt' && t.deadline < heute())

export default function NoteTasks({
  note, contacts = [], protocols = [], onUpdate, onAddToProtocol,
}) {
  const tasks = Array.isArray(note.actionItems) ? note.actionItems : []
  const [protoWahl, setProtoWahl] = useState(false)

  // Die Teilnehmer der Notiz stehen bei der Zuständigkeit oben – wer am
  // Telefon war, übernimmt meistens auch die Aufgabe.
  const vorschlaege = useMemo(() => {
    const aus = (note.participants ?? []).map(p => p.name || p.company).filter(Boolean)
    return [...new Set(aus)]
  }, [note.participants])

  const setze = (id, patch) => onUpdate(note.id, {
    actionItems: tasks.map(t => (t.id === id ? { ...t, ...patch } : t)),
  })

  const hinzu = () => onUpdate(note.id, {
    actionItems: [...tasks, { ...emptyNoteTask(), no: tasks.reduce((m, t) => Math.max(m, t.no || 0), 0) + 1 }],
  })

  const weg = (id) => onUpdate(note.id, { actionItems: tasks.filter(t => t.id !== id) })

  // Übernommen wird, was offen und noch nicht übernommen ist.
  const uebertragbar = tasks.filter(t => !t.protocolRef && (t.description || '').trim())
  const offeneZahl = tasks.filter(t => t.status !== 'erledigt').length

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1">
        <label className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
          <CheckSquare size={12} /> Aufgaben aus dieser Notiz
          {tasks.length > 0 && <span className="text-gray-400">· {offeneZahl} von {tasks.length} offen</span>}
        </label>
        <div className="flex items-center gap-1">
          {onAddToProtocol && protocols.length > 0 && uebertragbar.length > 0 && (
            protoWahl ? (
              <select
                autoFocus className="select text-xs max-w-[16rem]" defaultValue=""
                onBlur={() => setProtoWahl(false)}
                onChange={(e) => {
                  if (e.target.value) onAddToProtocol(e.target.value, note, uebertragbar)
                  setProtoWahl(false)
                }}>
                <option value="" disabled>Protokoll auswählen…</option>
                {protocols.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.date ? formatDate(p.date) : 'Ohne Datum'} – {p.meetingType || 'Protokoll'}
                  </option>
                ))}
              </select>
            ) : (
              <button className="btn-ghost text-xs flex items-center gap-1" onClick={() => setProtoWahl(true)}
                      title="Offene Aufgaben als Maßnahmen in ein Protokoll übernehmen">
                <ArrowRight size={12} /> {uebertragbar.length === 1 ? 'Aufgabe' : `${uebertragbar.length} Aufgaben`} ins Protokoll
              </button>
            )
          )}
          <button className="btn-ghost text-xs flex items-center gap-1" onClick={hinzu}>
            <Plus size={12} /> Aufgabe
          </button>
        </div>
      </div>

      {tasks.length === 0 ? (
        <p className="text-xs text-gray-400">
          Noch keine Aufgabe. „Aufgabe" ergänzt eine Zeile mit Zuständigem und Frist.
        </p>
      ) : (
        <div className="space-y-1.5">
          {tasks.map(t => {
            const spaet = istUeberfaellig(t)
            return (
              <div key={t.id}
                   className={`border p-2 space-y-1.5 ${spaet ? 'border-red-300 bg-red-50/40' : 'border-gray-200'}`}>
                <div className="flex items-start gap-2">
                  <span className="text-xs text-gray-400 pt-2 w-5 flex-shrink-0 text-right">{t.no || ''}</span>
                  <textarea
                    className="textarea text-sm flex-1" rows={2} placeholder="Was ist zu tun?"
                    value={t.description || ''}
                    onChange={e => setze(t.id, { description: e.target.value })} />
                  <button className="btn-ghost p-1.5 text-gray-400 hover:text-red-600 flex-shrink-0"
                          title="Aufgabe entfernen" onClick={() => weg(t.id)}>
                    <Trash2 size={13} />
                  </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 pl-7">
                  <ContactAutocomplete
                    value={t.responsible || ''}
                    onChange={(v) => setze(t.id, { responsible: v })}
                    contacts={contacts}
                    extraOptions={vorschlaege}
                    preferredLabel="Teilnehmer dieser Notiz"
                    placeholder="Zuständig"
                    className="input text-sm" />
                  <input type="date" className="input text-sm" title="Frist"
                         value={t.deadline || ''} onChange={e => setze(t.id, { deadline: e.target.value })} />
                  <select className="select text-sm" value={t.status || 'offen'}
                          onChange={e => setze(t.id, { status: e.target.value })}>
                    {ACTION_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                  <select className="select text-sm" value={t.priority || 'mittel'}
                          onChange={e => setze(t.id, { priority: e.target.value })}>
                    {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>

                <div className="pl-7 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  {spaet && (
                    <span className="text-red-600 font-medium flex items-center gap-1">
                      <AlertTriangle size={11} /> Frist überschritten
                    </span>
                  )}
                  {t.protocolRef && (
                    <span className="text-gray-500 flex items-center gap-1">
                      <Check size={11} className="text-green-600" />
                      Als Maßnahme im Protokoll{t.protocolRef.datum ? ` vom ${formatDate(t.protocolRef.datum)}` : ''}
                      {t.statusQuelle === 'massnahme' && ' · Zustand folgt dort'}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
