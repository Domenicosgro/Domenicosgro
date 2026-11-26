import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Plus, Trash2, ArrowRight, ListChecks, AlertTriangle, Check, User, Calendar,
  CheckCircle2, Circle, ChevronUp, ChevronDown,
} from 'lucide-react'
import { ACTION_STATUSES, PRIORITIES, emptyNoteTask, formatDate } from '../utils'
import ContactAutocomplete from './ContactAutocomplete'

// ── Die Punkte einer Notiz ───────────────────────────────────────────────────
//
// Eine Aktennotiz endet selten mit einem Fließtext, sondern mit Punkten:
// „Fenster OG — Meier — bis Freitag". Jeder Punkt hat deshalb Thema, Text,
// Zuständigen, Frist und Zustand.
//
// **Eingabe wie im Protokoll, Ausgabe als Tabelle.** Die Eingabe steht
// untereinander in ganzer Breite (wie `ActionItems.jsx`): Nummer, Haken,
// Thema, Text, darunter Zuständig · Frist · Dringlichkeit · Zustand. Eine
// Tabelle mit sechs Spalten sieht geordnet aus, aber man schreibt in
// briefmarkengroße Felder und sieht den eigenen Satz nicht. Gedruckt wird
// dann als Tabelle — quer, damit die Spalten Platz haben
// (`buildNotePrintHtml`, `notePdf.js`).
//
// Ein Punkt ohne Zuständigen und Frist ist eine Feststellung, mit beidem eine
// Aufgabe — derselbe Datensatz, dieselben Felder wie eine Maßnahme im
// Protokoll (`emptyActionItem` plus `topic`). Die Übernahme dorthin ist damit
// eine Kopie und keine Übersetzung; danach führt die Maßnahme, und der Zustand
// des Punktes folgt ihr (server/maengel.js).

const heute = () => new Date().toISOString().slice(0, 10)
const istUeberfaellig = (t) => !!(t.deadline && t.status !== 'erledigt' && t.deadline < heute())

// Textfeld, das mit dem Inhalt wächst. Der Grund steht oben: man muss sehen,
// was man schreibt — auch wenn der Punkt fünf Zeilen braucht.
function WachsendesFeld({ value, onChange, className = '', ...rest }) {
  const ref = useRef(null)
  const anpassen = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(el.scrollHeight, 34)}px`
  }, [])
  useEffect(() => { anpassen() }, [value, anpassen])
  return (
    <textarea
      ref={ref}
      rows={1}
      className={`textarea overflow-hidden ${className}`}
      value={value || ''}
      onChange={(e) => { onChange(e); anpassen() }}
      {...rest}
    />
  )
}

export default function NoteTasks({
  note, contacts = [], protocols = [], onUpdate, onAddToProtocol,
}) {
  const tasks = Array.isArray(note.actionItems) ? note.actionItems : []
  const [protoWahl, setProtoWahl] = useState(false)

  // Die Teilnehmer der Notiz stehen bei der Zuständigkeit oben – wer am
  // Telefon war, übernimmt meistens auch den Punkt.
  const vorschlaege = useMemo(() => {
    const aus = (note.participants ?? []).map(p => p.name || p.company).filter(Boolean)
    return [...new Set(aus)]
  }, [note.participants])

  const schreibe = (liste) => onUpdate(note.id, { actionItems: liste })
  const setze = (id, patch) => schreibe(tasks.map(t => (t.id === id ? { ...t, ...patch } : t)))

  const hinzu = () => schreibe([
    ...tasks,
    { ...emptyNoteTask(), no: tasks.reduce((m, t) => Math.max(m, t.no || 0), 0) + 1 },
  ])

  const weg = (id) => schreibe(tasks.filter(t => t.id !== id))

  const erledigt = (t) => setze(t.id, { status: t.status === 'erledigt' ? 'offen' : 'erledigt' })

  // Reihenfolge ändern: die Nummern laufen mit, sonst stimmt der Verweis aus
  // dem Protokoll („Punkt 3") nach dem Verschieben nicht mehr.
  const schiebe = (index, richtung) => {
    const ziel = index + richtung
    if (ziel < 0 || ziel >= tasks.length) return
    const neu = [...tasks]
    const [raus] = neu.splice(index, 1)
    neu.splice(ziel, 0, raus)
    schreibe(neu.map((t, i) => ({ ...t, no: i + 1 })))
  }

  // Übernommen wird nur, was wirklich ausgefüllt ist. Eine Zeile, die nur ein
  // Thema aus der Vorlage trägt („Termine" ohne Text, ohne Zuständigen, ohne
  // Frist), ist ein leeres Gerüst – daraus darf keine Maßnahme werden.
  const uebertragbar = tasks.filter(t => !t.protocolRef && (
    (t.description || '').trim() || (t.responsible || '').trim() || t.deadline))
  const offeneZahl = tasks.filter(t => t.status !== 'erledigt').length

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1">
        <label className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
          <ListChecks size={12} /> Punkte dieser Notiz
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
                      title="Offene Punkte als Maßnahmen in ein Protokoll übernehmen">
                <ArrowRight size={12} /> {uebertragbar.length === 1 ? 'Punkt' : `${uebertragbar.length} Punkte`} ins Protokoll
              </button>
            )
          )}
          <button className="btn-ghost text-xs flex items-center gap-1" onClick={hinzu}>
            <Plus size={12} /> Punkt
          </button>
        </div>
      </div>

      {tasks.length === 0 ? (
        <p className="text-xs text-gray-400">
          Noch kein Punkt. „Punkt" ergänzt eine Zeile mit Thema, Zuständigem und Frist.
        </p>
      ) : (
        <div className="border border-gray-200">
          {tasks.map((t, i) => {
            const fertig = t.status === 'erledigt'
            const spaet  = istUeberfaellig(t)
            const rand   = fertig ? 'border-green-400' : spaet ? 'border-red-400' : 'border-gray-300'
            const grund  = fertig ? 'bg-green-50' : spaet ? 'bg-red-50' : 'bg-white'
            return (
              <div key={t.id}
                   className={`border-l-4 ${rand} ${grund} pl-3 pr-3 py-2.5 space-y-1.5 border-b border-gray-100 ${fertig ? 'opacity-75' : ''}`}>

                {/* Zeile 1: Nummer · Haken · Thema und Text · Entfernen */}
                <div className="flex items-start gap-2">
                  <span className={`w-8 flex-shrink-0 text-center text-xs font-semibold pt-1.5 ${fertig ? 'line-through text-gray-400' : 'text-brand-700'}`}>
                    {t.no || i + 1}
                  </span>
                  <button
                    className={`flex-shrink-0 mt-1 transition-colors ${fertig ? 'text-green-600 hover:text-gray-400' : 'text-gray-300 hover:text-green-500'}`}
                    onClick={() => erledigt(t)}
                    title={fertig ? 'Als offen markieren' : 'Als erledigt markieren'}>
                    {fertig ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                  </button>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <input
                      className={`input py-0.5 text-sm font-semibold w-full ${fertig ? 'line-through text-gray-400' : ''}`}
                      placeholder="Thema, z. B. Fenster OG…"
                      value={t.topic || ''}
                      onChange={e => setze(t.id, { topic: e.target.value })} />
                    <WachsendesFeld
                      className={`py-1 text-sm w-full ${fertig ? 'line-through text-gray-400' : ''}`}
                      placeholder="Was wurde festgestellt, was ist zu tun?"
                      value={t.description}
                      onChange={e => setze(t.id, { description: e.target.value })} />
                  </div>
                  <div className="flex flex-col flex-shrink-0">
                    <button className="btn-ghost p-0.5 text-gray-300 hover:text-brand-600" title="nach oben"
                            onClick={() => schiebe(i, -1)} disabled={i === 0}><ChevronUp size={13} /></button>
                    <button className="btn-ghost p-0.5 text-gray-300 hover:text-brand-600" title="nach unten"
                            onClick={() => schiebe(i, 1)} disabled={i === tasks.length - 1}><ChevronDown size={13} /></button>
                  </div>
                  <button className="btn-ghost p-1 text-red-400 hover:text-red-600 hover:bg-red-50 flex-shrink-0"
                          onClick={() => weg(t.id)} title="Punkt entfernen">
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Zeile 2: Zuständig · Frist · Dringlichkeit · Zustand */}
                <div className="flex items-center gap-3 pl-14 flex-wrap">
                  <div className="flex items-center gap-1">
                    <User size={12} className="text-gray-400 flex-shrink-0" />
                    <ContactAutocomplete
                      className={`input py-0.5 text-xs w-40 ${fertig ? 'text-gray-400' : ''}`}
                      placeholder="Zuständig…"
                      value={t.responsible || ''}
                      onChange={(v) => setze(t.id, { responsible: v })}
                      contacts={contacts}
                      extraOptions={vorschlaege}
                      preferredLabel="Teilnehmer dieser Notiz" />
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar size={12} className={`flex-shrink-0 ${spaet ? 'text-red-500' : 'text-gray-400'}`} />
                    <input type="date" title="Frist"
                           className={`input py-0.5 text-xs w-32 ${spaet ? 'text-red-600 font-semibold' : ''}`}
                           value={t.deadline || ''}
                           onChange={e => setze(t.id, { deadline: e.target.value })} />
                  </div>
                  <select className="select py-0.5 text-xs w-28" value={t.priority || 'mittel'}
                          onChange={e => setze(t.id, { priority: e.target.value })}>
                    {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                  <select className="select py-0.5 text-xs w-32" value={t.status || 'offen'}
                          onChange={e => setze(t.id, { status: e.target.value })}>
                    {ACTION_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>

                  {spaet && (
                    <span className="text-xs text-red-600 font-medium flex items-center gap-1">
                      <AlertTriangle size={11} /> Frist überschritten
                    </span>
                  )}
                  {t.protocolRef && (
                    <span className="text-xs text-gray-500 flex items-center gap-1">
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
