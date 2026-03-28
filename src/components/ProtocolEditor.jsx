import React from 'react'
import { ArrowLeft, Printer, Building2 } from 'lucide-react'
import MeetingHeader from './MeetingHeader'
import ParticipantsList from './ParticipantsList'
import AgendaItems from './AgendaItems'
import ActionItems from './ActionItems'
import NotesSection from './NotesSection'
import { formatDate } from '../utils'

export default function ProtocolEditor({ protocol, onUpdate, onBack }) {
  const change = (patch) => onUpdate(protocol.id, patch)

  const handlePrint = () => window.print()

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between no-print">
        <button className="btn-secondary" onClick={onBack}>
          <ArrowLeft size={16} /> Zurück
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 hidden sm:inline">
            Zuletzt gespeichert: {new Date(protocol.updatedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
          </span>
          <button className="btn-secondary" onClick={handlePrint}>
            <Printer size={16} /> Drucken / PDF
          </button>
        </div>
      </div>

      {/* Print header */}
      <div className="hidden print:block mb-6">
        <div className="flex items-center gap-3 border-b-2 border-brand-600 pb-3 mb-2">
          <Building2 size={24} className="text-brand-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {protocol.meetingType} – Protokoll
              {protocol.protocolNo ? ` Nr. ${protocol.protocolNo}` : ''}
            </h1>
            <p className="text-sm text-gray-500">
              {protocol.projectName}
              {protocol.date ? ` · ${formatDate(protocol.date)}` : ''}
              {protocol.location ? ` · ${protocol.location}` : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Sections */}
      <MeetingHeader protocol={protocol} onChange={change} />
      <ParticipantsList
        participants={protocol.participants}
        onChange={participants => change({ participants })}
      />
      <AgendaItems
        items={protocol.agendaItems}
        onChange={agendaItems => change({ agendaItems })}
      />
      <ActionItems
        items={protocol.actionItems}
        onChange={actionItems => change({ actionItems })}
      />
      <NotesSection
        notes={protocol.notes}
        onChange={notes => change({ notes })}
      />

      {/* Print footer */}
      <div className="hidden print:block mt-8 pt-4 border-t border-gray-300 text-xs text-gray-400 flex justify-between">
        <span>Protokoll erstellt von: {protocol.preparedBy || '_______________'}</span>
        <span>Datum: {formatDate(protocol.date)}</span>
      </div>

      {/* Bottom spacer for screen */}
      <div className="h-12 no-print" />
    </div>
  )
}
