import React from 'react'
import { MEETING_TYPES, formatDate, buildProtocolNo } from '../utils'

export default function MeetingHeader({ protocol, protocols, onChange }) {
  const set = (field) => (e) => onChange({ [field]: e.target.value })

  const protocolNo = buildProtocolNo(protocol.projectName, protocol.date)

  const predecessorOptions = (protocols ?? [])
    .filter(p => p.id !== protocol.id && p.projectName === protocol.projectName)
    .sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div className="card p-6 space-y-4">
      {/* Row 1 – project + type */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-1">Projektname</label>
          <input
            className="input font-semibold"
            placeholder="Projekt XY – Neubau Wohnanlage"
            value={protocol.projectName}
            onChange={set('projectName')}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Besprechungsart</label>
          <select className="select" value={protocol.meetingType} onChange={set('meetingType')}>
            {MEETING_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {/* Protocol number – auto-generated, read-only */}
      <div className="flex items-center gap-3 bg-brand-50 border border-brand-200 rounded-lg px-4 py-2">
        <span className="text-xs font-medium text-brand-600 flex-shrink-0">Protokoll-Nr.</span>
        <span className="font-mono font-semibold text-brand-800 text-sm tracking-wide">{protocolNo}</span>
        <span className="text-xs text-brand-400 ml-auto hidden sm:inline">automatisch aus Projektname + Datum</span>
      </div>

      {/* Row 3 – date / time / location */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Datum</label>
          <input className="input" type="date" value={protocol.date} onChange={set('date')} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Uhrzeit</label>
          <input className="input" type="time" value={protocol.time} onChange={set('time')} />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-1">Ort / Raum</label>
          <input className="input" placeholder="Baubüro, Raum 2" value={protocol.location} onChange={set('location')} />
        </div>
      </div>

      {/* Row 4 – author + next meeting */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Erstellt von</label>
          <input className="input" placeholder="Max Mustermann" value={protocol.preparedBy} onChange={set('preparedBy')} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Nächste Besprechung</label>
          <input className="input" type="date" value={protocol.nextMeeting} onChange={set('nextMeeting')} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Uhrzeit</label>
          <input className="input" type="time" value={protocol.nextMeetingTime} onChange={set('nextMeetingTime')} />
        </div>
      </div>

      {/* Row 5 – predecessor */}
      <div className="pt-1 border-t border-gray-100 no-print">
        <label className="block text-xs font-medium text-gray-500 mb-1">
          Vorgänger-Protokoll{' '}
          <span className="text-gray-400 font-normal">(offene Maßnahmen werden übernommen)</span>
        </label>
        <select
          className="select max-w-sm"
          value={protocol.predecessorId ?? ''}
          onChange={e => onChange({ predecessorId: e.target.value || null })}
        >
          <option value="">– Kein Vorgänger –</option>
          {predecessorOptions.map(p => {
            const no = buildProtocolNo(p.projectName, p.date)
            return (
              <option key={p.id} value={p.id}>
                {no}{p.location ? ` – ${p.location}` : ''}
              </option>
            )
          })}
        </select>
      </div>
    </div>
  )
}
