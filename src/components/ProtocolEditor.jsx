import React, { useMemo } from 'react'
import { ArrowLeft, Printer, Building2, RefreshCw, AlertCircle, Download } from 'lucide-react'

const isElectron = typeof window !== 'undefined' && !!window.electronAPI
import MeetingHeader from './MeetingHeader'
import ParticipantsList from './ParticipantsList'
import AgendaItems from './AgendaItems'
import ActionItems from './ActionItems'
import NotesSection from './NotesSection'
import { formatDate, buildProtocolNo, uid } from '../utils'

export default function ProtocolEditor({ protocol, protocols, onUpdate, onBack }) {
  const change = (patch) => onUpdate(protocol.id, patch)

  const protocolNo = buildProtocolNo(protocol.projectName, protocol.date)

  const predecessor = useMemo(
    () => protocols.find(p => p.id === protocol.predecessorId) ?? null,
    [protocols, protocol.predecessorId]
  )

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

  const present = protocol.participants.filter(p => p.present)
  const absent  = protocol.participants.filter(p => !p.present)

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-4">
      {/* ── Screen top bar ── */}
      <div className="flex items-center justify-between no-print">
        <button className="btn-secondary" onClick={onBack}>
          <ArrowLeft size={16} /> Zurück
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 hidden sm:inline">
            Gespeichert: {new Date(protocol.updatedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
          </span>
          {isElectron && (
            <button
              className="btn-secondary"
              title="Als JSON-Datei exportieren"
              onClick={() => window.electronAPI.exportJSON(protocol)}
            >
              <Download size={16} /> Exportieren
            </button>
          )}
          <button className="btn-secondary" onClick={() => window.print()}>
            <Printer size={16} /> Drucken / PDF
          </button>
        </div>
      </div>

      {/* ── Print cover page (Deckblatt) ── */}
      <div className="hidden print:block print-cover">
        {/* Logo row */}
        <div className="flex items-center gap-3 mb-8">
          <Building2 size={32} className="text-brand-600" />
          <div>
            <div className="text-xs text-gray-400 uppercase tracking-widest">Besprechungsprotokoll</div>
            <div className="text-2xl font-bold text-gray-900">{protocol.meetingType}</div>
          </div>
        </div>

        {/* Main info table */}
        <table className="w-full text-sm mb-8 border-collapse">
          <tbody>
            {[
              ['Projektname',   protocol.projectName || '–'],
              ['Protokoll-Nr.', protocolNo],
              ['Datum',         formatDate(protocol.date)],
              ['Uhrzeit',       protocol.time || '–'],
              ['Ort / Raum',    protocol.location || '–'],
              ['Erstellt von',  protocol.preparedBy || '–'],
              ...(protocol.nextMeeting ? [['Nächste Besprechung', `${formatDate(protocol.nextMeeting)}${protocol.nextMeetingTime ? ', ' + protocol.nextMeetingTime + ' Uhr' : ''}`]] : []),
            ].map(([label, value]) => (
              <tr key={label} className="border-b border-gray-200">
                <td className="py-2 pr-6 font-medium text-gray-500 w-48 text-xs uppercase tracking-wide">{label}</td>
                <td className="py-2 text-gray-900 font-medium">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Participant list */}
        {protocol.participants.length > 0 && (
          <>
            <div className="font-semibold text-gray-700 mb-2 text-sm border-b border-gray-300 pb-1">
              Teilnehmerliste ({present.length} anwesend{absent.length > 0 ? `, ${absent.length} entschuldigt` : ''})
            </div>
            <table className="w-full text-sm mb-6 border-collapse">
              <thead>
                <tr className="border-b-2 border-gray-300 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="text-left py-1 pr-4 font-medium w-6">#</th>
                  <th className="text-left py-1 pr-4 font-medium">Name</th>
                  <th className="text-left py-1 pr-4 font-medium">Firma</th>
                  <th className="text-left py-1 pr-4 font-medium">Funktion</th>
                  <th className="text-left py-1 pr-4 font-medium">E-Mail</th>
                  <th className="text-center py-1 font-medium w-20">Anwesend</th>
                </tr>
              </thead>
              <tbody>
                {protocol.participants.map((p, i) => (
                  <tr key={p.id} className={`border-b border-gray-100 ${!p.present ? 'text-gray-400 italic' : ''}`}>
                    <td className="py-1.5 pr-4 text-gray-400 text-xs">{i + 1}</td>
                    <td className="py-1.5 pr-4 font-medium">{p.name || '–'}</td>
                    <td className="py-1.5 pr-4">{p.company || '–'}</td>
                    <td className="py-1.5 pr-4">{p.role || '–'}</td>
                    <td className="py-1.5 pr-4 text-xs">{p.email || '–'}</td>
                    <td className="py-1.5 text-center">{p.present ? '✓' : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* Page break before content */}
        <div style={{ pageBreakAfter: 'always' }} />
      </div>

      {/* ── Print content header (repeated on pages after cover) ── */}
      <div className="hidden print:block mb-4">
        <div className="flex items-center justify-between border-b border-gray-300 pb-2 text-xs text-gray-500">
          <span className="font-semibold text-gray-700">{protocol.projectName} – {protocol.meetingType}</span>
          <span>{protocolNo}</span>
        </div>
      </div>

      {/* ── Carryover banner (screen only) ── */}
      {pendingCarryover.length > 0 && (
        <div className="no-print flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
          <AlertCircle size={18} className="flex-shrink-0 text-blue-500" />
          <div className="flex-1">
            <strong>{pendingCarryover.length} offene Maßnahme{pendingCarryover.length !== 1 ? 'n' : ''}</strong>{' '}
            aus dem Vorgänger-Protokoll noch nicht übernommen.
            <span className="block text-blue-600 text-xs mt-0.5">Erledigte Punkte werden nicht übernommen.</span>
          </div>
          <button className="btn-primary text-xs flex-shrink-0" onClick={handleCarryover}>
            <RefreshCw size={14} /> Übernehmen
          </button>
        </div>
      )}

      {/* ── Sections ── */}
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

      {/* ── Print footer ── */}
      <div className="hidden print:flex mt-8 pt-4 border-t border-gray-300 text-xs text-gray-400 justify-between">
        <span>Erstellt von: {protocol.preparedBy || '_______________'}</span>
        <span>{protocolNo}</span>
        <span>Datum: {formatDate(protocol.date)}</span>
      </div>

      <div className="h-12 no-print" />
    </div>
  )
}
