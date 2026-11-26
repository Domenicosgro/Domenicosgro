import React, { useMemo, useState } from 'react'
import { Plus, Trash2, ArrowRight, Table2, AlertTriangle, Check, ChevronUp, ChevronDown } from 'lucide-react'
import { ACTION_STATUSES, PRIORITIES, emptyNoteTask, formatDate } from '../utils'
import ContactAutocomplete from './ContactAutocomplete'

// ── Die Punkte einer Notiz ───────────────────────────────────────────────────
//
// Eine Aktennotiz oder ein Telefonat endet selten mit einem Fließtext, sondern
// mit Punkten: „Fenster OG — Meier — bis Freitag". Deshalb stehen die Punkte
// hier als **Tabelle mit Spalten**, nicht als Fließtext und nicht als Kärtchen
// untereinander:
//
//   Nr. · Thema · Punkt / Ergebnis · Zuständig · Frist · Status
//
// Ein Punkt ohne Zuständigen und Frist ist eine Feststellung; mit beidem ist er
// eine Aufgabe. Es ist derselbe Datensatz – die Felder sind die einer Maßnahme
// im Protokoll (`emptyActionItem`), damit die Übernahme dorthin eine Kopie ist
// und keine Übersetzung.
//
// Die Übernahme ist der eigentliche Zweck: dort hängen Mahnwesen, Freimeldung
// und das Maßnahmen-Dashboard. Danach führt die Maßnahme, und der Zustand des
// Punktes folgt ihr von selbst (server/maengel.js).
//
// Auf schmalen Bildschirmen wird aus der Tabelle eine gestapelte Liste – eine
// Tabelle mit sechs Spalten ist auf einem Telefon nicht zu bedienen.

const heute = () => new Date().toISOString().slice(0, 10)
const istUeberfaellig = (t) => !!(t.deadline && t.status !== 'erledigt' && t.deadline < heute())

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

  const kopf = (
    <div className="flex items-center justify-between gap-2 mb-1">
      <label className="text-xs font-medium text-gray-500 flex items-center gap-1.5">
        <Table2 size={12} /> Punkte dieser Notiz
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
  )

  if (tasks.length === 0) {
    return (
      <div>
        {kopf}
        <p className="text-xs text-gray-400">
          Noch kein Punkt. „Punkt" ergänzt eine Zeile mit Thema, Zuständigem und Frist.
        </p>
      </div>
    )
  }

  const zelleZustaendig = (t) => (
    <ContactAutocomplete
      value={t.responsible || ''}
      onChange={(v) => setze(t.id, { responsible: v })}
      contacts={contacts}
      extraOptions={vorschlaege}
      preferredLabel="Teilnehmer dieser Notiz"
      placeholder="Zuständig"
      className="input text-sm" />
  )

  const hinweise = (t) => (
    <>
      {istUeberfaellig(t) && (
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
    </>
  )

  return (
    <div>
      {kopf}

      {/* Tabelle – ab mittlerer Breite */}
      <div className="hidden md:block border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-2 py-1.5 text-xs font-medium text-gray-500 w-10">Nr.</th>
              <th className="px-2 py-1.5 text-xs font-medium text-gray-500 w-40">Thema</th>
              <th className="px-2 py-1.5 text-xs font-medium text-gray-500">Punkt / Ergebnis</th>
              <th className="px-2 py-1.5 text-xs font-medium text-gray-500 w-44">Zuständig</th>
              <th className="px-2 py-1.5 text-xs font-medium text-gray-500 w-32">Frist</th>
              <th className="px-2 py-1.5 text-xs font-medium text-gray-500 w-32">Status</th>
              <th className="px-1 py-1.5 w-16" />
            </tr>
          </thead>
          <tbody>
            {tasks.map((t, i) => {
              const spaet = istUeberfaellig(t)
              return (
                <tr key={t.id} className={`border-t border-gray-200 align-top ${spaet ? 'bg-red-50/40' : ''}`}>
                  <td className="px-2 py-1.5 text-gray-400">{t.no || i + 1}</td>
                  <td className="px-2 py-1.5">
                    <input className="input text-sm" placeholder="z. B. Fenster OG"
                           value={t.topic || ''} onChange={e => setze(t.id, { topic: e.target.value })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <textarea className="textarea text-sm" rows={2} placeholder="Was wurde festgestellt, was ist zu tun?"
                              value={t.description || ''} onChange={e => setze(t.id, { description: e.target.value })} />
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs mt-0.5">{hinweise(t)}</div>
                  </td>
                  <td className="px-2 py-1.5">{zelleZustaendig(t)}</td>
                  <td className="px-2 py-1.5">
                    <input type="date" className="input text-sm" value={t.deadline || ''}
                           onChange={e => setze(t.id, { deadline: e.target.value })} />
                    <select className="select text-xs mt-1" value={t.priority || 'mittel'}
                            onChange={e => setze(t.id, { priority: e.target.value })}>
                      {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <select className="select text-sm" value={t.status || 'offen'}
                            onChange={e => setze(t.id, { status: e.target.value })}>
                      {ACTION_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </td>
                  <td className="px-1 py-1.5">
                    <div className="flex items-center gap-0.5">
                      <div className="flex flex-col">
                        <button className="btn-ghost p-0.5 text-gray-300 hover:text-brand-600" title="nach oben"
                                onClick={() => schiebe(i, -1)} disabled={i === 0}><ChevronUp size={12} /></button>
                        <button className="btn-ghost p-0.5 text-gray-300 hover:text-brand-600" title="nach unten"
                                onClick={() => schiebe(i, 1)} disabled={i === tasks.length - 1}><ChevronDown size={12} /></button>
                      </div>
                      <button className="btn-ghost p-1 text-gray-400 hover:text-red-600" title="Punkt entfernen"
                              onClick={() => weg(t.id)}><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Gestapelt – auf schmalen Bildschirmen */}
      <div className="md:hidden space-y-1.5">
        {tasks.map((t, i) => {
          const spaet = istUeberfaellig(t)
          return (
            <div key={t.id} className={`border p-2 space-y-1.5 ${spaet ? 'border-red-300 bg-red-50/40' : 'border-gray-200'}`}>
              <div className="flex items-start gap-2">
                <span className="text-xs text-gray-400 pt-2 w-5 flex-shrink-0 text-right">{t.no || i + 1}</span>
                <div className="flex-1 space-y-1.5">
                  <input className="input text-sm" placeholder="Thema"
                         value={t.topic || ''} onChange={e => setze(t.id, { topic: e.target.value })} />
                  <textarea className="textarea text-sm" rows={2} placeholder="Punkt / Ergebnis"
                            value={t.description || ''} onChange={e => setze(t.id, { description: e.target.value })} />
                </div>
                <button className="btn-ghost p-1.5 text-gray-400 hover:text-red-600 flex-shrink-0"
                        title="Punkt entfernen" onClick={() => weg(t.id)}><Trash2 size={13} /></button>
              </div>
              <div className="grid grid-cols-2 gap-1.5 pl-7">
                {zelleZustaendig(t)}
                <input type="date" className="input text-sm" value={t.deadline || ''}
                       onChange={e => setze(t.id, { deadline: e.target.value })} />
                <select className="select text-sm" value={t.status || 'offen'}
                        onChange={e => setze(t.id, { status: e.target.value })}>
                  {ACTION_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <select className="select text-sm" value={t.priority || 'mittel'}
                        onChange={e => setze(t.id, { priority: e.target.value })}>
                  {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div className="pl-7 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">{hinweise(t)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
