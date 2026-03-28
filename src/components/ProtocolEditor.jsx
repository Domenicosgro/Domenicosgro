import React, { useMemo } from 'react'
import { ArrowLeft, Printer, Building2, RefreshCw, AlertCircle } from 'lucide-react'
import MeetingHeader from './MeetingHeader'
import ParticipantsList from './ParticipantsList'
import AgendaItems from './AgendaItems'
import ActionItems from './ActionItems'
import NotesSection from './NotesSection'
import { formatDate, uid } from '../utils'

export default function ProtocolEditor({ protocol, protocols, onUpdate, onBack }) {
  const change = (patch) => onUpdate(protocol.id, patch)

  // Predecessor protocol (if selected)
  const predecessor = useMemo(
    () => protocols.find(p => p.id === protocol.predecessorId) ?? null,
    [protocols, protocol.predecessorId]
  )

  // Open (non-completed) action items from predecessor that haven't been carried yet
  const pendingCarryover = useMemo(() => {
    if (!predecessor) return []
    const alreadyCarried = new Set(protocol.actionItems.map(a => a.carriedFromId).filter(Boolean))
    return predecessor.actionItems.filter(
      a => a.status !== 'erledigt' && !alreadyCarried.has(a.id)
    )
  }, [predecessor, protocol.actionItems])

  const handleCarryover = () => {
    if (!pendingCarryover.length) return
    const carried = pendingCarryover.map(a => ({
      ...a,
      id: uid(),
      carriedFromId: a.id,
      completedAt: null,
    }))
    change({ actionItems: [...protocol.actionItems, ...carried] })
  }

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
            Gespeichert: {new Date(protocol.updatedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
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

      {/* Carryover banner */}
      {pendingCarryover.length > 0 && (
        <div className="no-print flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
          <AlertCircle size={18} className="flex-shrink-0 text-blue-500" />
          <div className="flex-1">
            <strong>{pendingCarryover.length} offene Maßnahme{pendingCarryover.length !== 1 ? 'n' : ''}</strong>{' '}
            aus dem Vorgänger-Protokoll ({predecessor.meetingType}{predecessor.protocolNo ? ` #${predecessor.protocolNo}` : ''},{' '}
            {formatDate(predecessor.date)}) noch nicht übernommen.
            <span className="block text-blue-600 text-xs mt-0.5">Erledigte Punkte werden nicht übernommen.</span>
          </div>
          <button className="btn-primary text-xs flex-shrink-0" onClick={handleCarryover}>
            <RefreshCw size={14} /> Übernehmen
          </button>
        </div>
      )}

      {/* Sections */}
      <MeetingHeader protocol={protocol} protocols={protocols} onChange={change} />
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
      <div className="hidden print:flex mt-8 pt-4 border-t border-gray-300 text-xs text-gray-400 justify-between">
        <span>Protokoll erstellt von: {protocol.preparedBy || '_______________'}</span>
        <span>Datum: {formatDate(protocol.date)}</span>
      </div>

      <div className="h-12 no-print" />
    </div>
  )
}
