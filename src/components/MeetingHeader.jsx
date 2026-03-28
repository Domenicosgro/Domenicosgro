import React from 'react'
import { MEETING_TYPES } from '../utils'

export default function MeetingHeader({ protocol, onChange }) {
  const set = (field) => (e) => onChange({ [field]: e.target.value })

  return (
    <div className="card p-6 space-y-4">
      {/* Row 1 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-500 mb-1">Projektname</label>
          <input className="input" placeholder="Projekt XY – Neubau Wohnanlage" value={protocol.projectName} onChange={set('projectName')} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Besprechungsart</label>
          <select className="select" value={protocol.meetingType} onChange={set('meetingType')}>
            {MEETING_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {/* Row 2 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Protokoll-Nr.</label>
          <input className="input" placeholder="001" value={protocol.protocolNo} onChange={set('protocolNo')} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Datum</label>
          <input className="input" type="date" value={protocol.date} onChange={set('date')} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Uhrzeit</label>
          <input className="input" type="time" value={protocol.time} onChange={set('time')} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Ort / Raum</label>
          <input className="input" placeholder="Baubüro, Raum 2" value={protocol.location} onChange={set('location')} />
        </div>
      </div>

      {/* Row 3 */}
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
    </div>
  )
}
