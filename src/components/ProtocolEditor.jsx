import React, { useMemo, useState, useEffect } from 'react'
import { ArrowLeft, Printer, Building2, RefreshCw, AlertCircle, Download, Send, ArrowDownToLine } from 'lucide-react'
import MeetingHeader from './MeetingHeader'
import ParticipantsList from './ParticipantsList'
import AgendaDraft from './AgendaDraft'
import AgendaEmailModal from './AgendaEmailModal'
import ProtocolItems from './ProtocolItems'
import ActionItems from './ActionItems'
import NotesSection from './NotesSection'
import { formatDate, buildProtocolNo, uid, emptyAgendaItem } from '../utils'

const isElectron = typeof window !== 'undefined' && !!window.electronAPI

// ── Carry protocol items from a predecessor ──────────────────────────────────
// Rule:
//   - status='offen'                          → carry forward, carriedGray=false
//   - status='erledigt', carriedGray=false    → carry forward, carriedGray=true (shown gray)
//   - status='erledigt', carriedGray=true     → skip (already shown gray once)
function carryItems(predecessorItems) {
  return predecessorItems
    .filter(it => !(it.status === 'erledigt' && it.carriedGray === true))
    .map(it => ({
      ...it,
      id: uid(),
      carriedFromId: it.id,
      carriedGray: it.status === 'erledigt',
    }))
}

export default function ProtocolEditor({ protocol, protocols, logoDataUrl, onLogoUpdate, onLogoClear, onUpdate, onBack }) {
  const change = (patch) => onUpdate(protocol.id, patch)

  const [showEmailModal, setShowEmailModal] = useState(false)

  const protocolNo   = buildProtocolNo(protocol.projectName, protocol.date)
  const createdDate  = formatDate(protocol.createdAt?.slice(0, 10) ?? protocol.date)

  // Predecessor
  const predecessor = useMemo(
    () => protocols.find(p => p.id === protocol.predecessorId) ?? null,
    [protocols, protocol.predecessorId]
  )

  // ── Pending carryover: action items ─────────────────────────────────────
  const pendingActionCarryover = useMemo(() => {
    if (!predecessor) return []
    const already = new Set(protocol.actionItems.map(a => a.carriedFromId).filter(Boolean))
    return predecessor.actionItems.filter(a => a.status !== 'erledigt' && !already.has(a.id))
  }, [predecessor, protocol.actionItems])

  // ── Pending carryover: protocol items ────────────────────────────────────
  const pendingItemCarryover = useMemo(() => {
    if (!predecessor) return []
    const already = new Set((protocol.agendaItems ?? []).map(i => i.carriedFromId).filter(Boolean))
    return predecessor.agendaItems.filter(it => {
      if (it.status === 'erledigt' && it.carriedGray === true) return false // already 2nd generation
      return !already.has(it.id)
    })
  }, [predecessor, protocol.agendaItems])

  const handleActionCarryover = () => {
    const carried = pendingActionCarryover.map(a => ({ ...a, id: uid(), carriedFromId: a.id, completedAt: null }))
    change({ actionItems: [...(protocol.actionItems ?? []), ...carried] })
  }

  const handleItemCarryover = () => {
    const carried = carryItems(pendingItemCarryover)
    change({ agendaItems: [...(protocol.agendaItems ?? []), ...carried] })
  }

  // Promote agenda draft → Protokollpunkte
  const handlePromoteAgenda = () => {
    if (!(protocol.agenda ?? []).length) return
    if (!confirm('Agenda-Punkte als Protokollpunkte übernehmen? Bestehende Punkte bleiben erhalten.')) return
    const newItems = (protocol.agenda ?? []).map(a => ({ ...emptyAgendaItem(1), no: a.no, topic: a.topic }))
    change({ agendaItems: [...(protocol.agendaItems ?? []), ...newItems] })
  }

  // Listen for native menu "Agenda versenden"
  useEffect(() => {
    const handler = () => { if ((protocol.agenda ?? []).length) setShowEmailModal(true) }
    window.addEventListener('app:send-agenda', handler)
    return () => window.removeEventListener('app:send-agenda', handler)
  }, [protocol.agenda])

  const present = (protocol.participants ?? []).filter(p => p.present)
  const absent  = (protocol.participants ?? []).filter(p => !p.present)

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-4">

      {/* ── Top bar (screen only) ── */}
      <div className="flex items-center justify-between no-print flex-wrap gap-2">
        <button className="btn-secondary" onClick={onBack}><ArrowLeft size={16} /> Zurück</button>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <span className="text-xs text-gray-400 hidden sm:inline">
            Gespeichert: {new Date(protocol.updatedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
          </span>
          {isElectron && (
            <button className="btn-secondary" onClick={() => window.electronAPI.exportJSON(protocol)}>
              <Download size={16} /> Exportieren
            </button>
          )}
          <button className="btn-secondary" onClick={() => window.print()}>
            <Printer size={16} /> Drucken / PDF
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          PRINT: AGENDA PAGE (own sheet before protocol)
          ══════════════════════════════════════════════ */}
      {(protocol.agenda ?? []).length > 0 && (
        <div className="hidden print:block">
          {/* Agenda cover */}
          <div className="print-agenda-page">
            {/* Logo + header */}
            <div className="flex items-start justify-between mb-6">
              {logoDataUrl && <img src={logoDataUrl} alt="Logo" className="h-14 max-w-[180px] object-contain" />}
              <div className={logoDataUrl ? 'text-right' : ''}>
                <div className="text-xs text-gray-400 uppercase tracking-widest">Einladung</div>
                <div className="text-2xl font-bold text-gray-900">{protocol.meetingType}</div>
              </div>
            </div>

            {/* Meeting info */}
            <table className="w-full text-sm mb-6 border-collapse">
              <tbody>
                {[
                  ['Projekt',   protocol.projectName || '–'],
                  ['Datum',     formatDate(protocol.date)],
                  ['Uhrzeit',   protocol.time ? protocol.time + ' Uhr' : '–'],
                  ['Ort',       protocol.location || '–'],
                  ['Einladung', protocol.preparedBy || '–'],
                ].map(([l, v]) => (
                  <tr key={l} className="border-b border-gray-200">
                    <td className="py-1.5 pr-6 text-xs font-medium text-gray-500 uppercase tracking-wide w-32">{l}</td>
                    <td className="py-1.5 font-medium text-gray-900">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Greeting */}
            {protocol.agendaGreeting && (
              <p className="text-sm text-gray-700 mb-6 whitespace-pre-line">{protocol.agendaGreeting}</p>
            )}

            {/* Agenda table */}
            <div className="font-semibold text-gray-700 mb-2 text-sm border-b-2 border-gray-800 pb-1">Tagesordnung</div>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-300 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="text-left py-1 pr-4 font-medium w-10">Nr.</th>
                  <th className="text-left py-1 pr-4 font-medium">Thema</th>
                  <th className="text-right py-1 pr-4 font-medium w-20">Dauer</th>
                  <th className="text-left py-1 font-medium w-36">Zuständig</th>
                </tr>
              </thead>
              <tbody>
                {(protocol.agenda ?? []).map((item, i) => (
                  <tr key={item.id} className="border-b border-gray-100">
                    <td className="py-2 pr-4 font-semibold text-gray-600">{item.no || i + 1}</td>
                    <td className="py-2 pr-4">
                      <span className="font-medium">{item.topic || '–'}</span>
                      {item.documents && <span className="block text-xs text-gray-400">Unterlagen: {item.documents}</span>}
                    </td>
                    <td className="py-2 pr-4 text-right text-gray-500">{item.duration ? `${item.duration} min` : '–'}</td>
                    <td className="py-2 text-gray-500">{item.responsible || '–'}</td>
                  </tr>
                ))}
              </tbody>
              {(protocol.agenda ?? []).reduce((s, a) => s + (parseInt(a.duration) || 0), 0) > 0 && (
                <tfoot>
                  <tr className="border-t border-gray-300">
                    <td colSpan={2} className="pt-2 text-xs text-gray-500 font-medium">Gesamt</td>
                    <td className="pt-2 text-right text-sm font-semibold text-brand-700 pr-4">
                      {(protocol.agenda ?? []).reduce((s, a) => s + (parseInt(a.duration) || 0), 0)} min
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>

            {/* Participants */}
            {present.length > 0 && (
              <div className="mt-6">
                <div className="text-xs font-medium text-gray-500 mb-1">Teilnehmer</div>
                <p className="text-sm text-gray-700">{present.map(p => p.name).filter(Boolean).join(' · ')}</p>
              </div>
            )}
          </div>

          {/* Page break after agenda */}
          <div className="print-page-break" />
        </div>
      )}

      {/* ══════════════════════════════════════════════
          PRINT: PROTOCOL COVER PAGE (Deckblatt)
          ══════════════════════════════════════════════ */}
      <div className="hidden print:block">
        <div className="print-cover-page">
          <div className="flex items-start justify-between mb-8">
            {logoDataUrl && <img src={logoDataUrl} alt="Logo" className="h-16 max-w-[200px] object-contain" />}
            <div className={logoDataUrl ? 'text-right' : ''}>
              <div className="text-xs text-gray-400 uppercase tracking-widest">Besprechungsprotokoll</div>
              <div className="text-2xl font-bold text-gray-900">{protocol.meetingType}</div>
            </div>
          </div>

          <table className="w-full text-sm mb-8 border-collapse">
            <tbody>
              {[
                ['Projektname',   protocol.projectName || '–'],
                ['Protokoll-Nr.', protocolNo],
                ['Datum',         formatDate(protocol.date)],
                ['Uhrzeit',       protocol.time ? protocol.time + ' Uhr' : '–'],
                ['Ort / Raum',    protocol.location || '–'],
                ['Erstellt von',  protocol.preparedBy || '–'],
                ...(protocol.nextMeeting ? [['Nächste Besprechung',
                  `${formatDate(protocol.nextMeeting)}${protocol.nextMeetingTime ? ', ' + protocol.nextMeetingTime + ' Uhr' : ''}`
                ]] : []),
              ].map(([label, value]) => (
                <tr key={label} className="border-b border-gray-200">
                  <td className="py-2 pr-6 font-medium text-gray-500 w-48 text-xs uppercase tracking-wide">{label}</td>
                  <td className="py-2 text-gray-900 font-medium">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {(protocol.participants ?? []).length > 0 && (
            <>
              <div className="font-semibold text-gray-700 mb-2 text-sm border-b border-gray-300 pb-1">
                Teilnehmerliste ({present.length} anwesend{absent.length > 0 ? `, ${absent.length} entschuldigt` : ''})
              </div>
              <table className="w-full text-sm border-collapse">
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
        </div>
        <div className="print-page-break" />
      </div>

      {/* ── Print running header (every page after cover) ── */}
      <div className="hidden print:flex items-center justify-between border-b border-gray-300 pb-1 mb-4 text-xs text-gray-500">
        <span className="font-semibold text-gray-700">{protocol.projectName} – {protocol.meetingType}</span>
        <span>{protocolNo}</span>
      </div>

      {/* ── Carryover banners (screen only) ── */}
      {pendingItemCarryover.length > 0 && (
        <div className="no-print flex items-center gap-3 bg-indigo-50 border border-indigo-200 rounded-lg p-4 text-sm text-indigo-800">
          <AlertCircle size={18} className="flex-shrink-0 text-indigo-500" />
          <div className="flex-1">
            <strong>{pendingItemCarryover.length} Protokollpunkt{pendingItemCarryover.length !== 1 ? 'e' : ''}</strong>{' '}
            aus dem Vorgänger noch nicht übernommen.
            <span className="block text-indigo-600 text-xs mt-0.5">
              Erledigte Punkte werden grau angezeigt, danach ausgeblendet.
            </span>
          </div>
          <button className="btn-primary text-xs flex-shrink-0" onClick={handleItemCarryover}>
            <RefreshCw size={14} /> Übernehmen
          </button>
        </div>
      )}

      {pendingActionCarryover.length > 0 && (
        <div className="no-print flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
          <AlertCircle size={18} className="flex-shrink-0 text-blue-500" />
          <div className="flex-1">
            <strong>{pendingActionCarryover.length} offene Maßnahme{pendingActionCarryover.length !== 1 ? 'n' : ''}</strong>{' '}
            aus dem Vorgänger noch nicht übernommen.
          </div>
          <button className="btn-primary text-xs flex-shrink-0" onClick={handleActionCarryover}>
            <RefreshCw size={14} /> Übernehmen
          </button>
        </div>
      )}

      {/* ── Sections ── */}
      <MeetingHeader
        protocol={protocol}
        protocols={protocols}
        logoDataUrl={logoDataUrl}
        onLogoUpdate={onLogoUpdate}
        onLogoClear={onLogoClear}
        onChange={change}
      />
      <ParticipantsList
        participants={protocol.participants ?? []}
        onChange={participants => change({ participants })}
      />

      {/* Agenda draft + send controls */}
      <AgendaDraft
        agenda={protocol.agenda ?? []}
        agendaGreeting={protocol.agendaGreeting ?? ''}
        agendaSentAt={protocol.agendaSentAt}
        onChange={agenda => change({ agenda })}
        onChangeGreeting={agendaGreeting => change({ agendaGreeting })}
      />
      <div className="no-print flex items-center gap-3 flex-wrap">
        <button className="btn-primary" onClick={() => setShowEmailModal(true)}
          disabled={!(protocol.agenda ?? []).length}>
          <Send size={15} /> Agenda versenden
        </button>
        <button className="btn-secondary" onClick={handlePromoteAgenda}
          disabled={!(protocol.agenda ?? []).length}>
          <ArrowDownToLine size={15} /> Agenda → Protokollpunkte
        </button>
        <span className="text-xs text-gray-400">Überträgt die Agenda als Protokollpunkt-Grundgerüst.</span>
      </div>

      <ProtocolItems
        items={protocol.agendaItems ?? []}
        onChange={agendaItems => change({ agendaItems })}
      />
      <ActionItems
        items={protocol.actionItems ?? []}
        onChange={actionItems => change({ actionItems })}
      />
      <NotesSection
        notes={protocol.notes ?? ''}
        onChange={notes => change({ notes })}
      />

      {/* ══════════════════════════════════════════════
          PRINT FOOTER – fixed, appears on every page
          ══════════════════════════════════════════════ */}
      <div className="print-footer hidden print:flex">
        <span>{protocol.projectName || '–'} · {protocol.meetingType}</span>
        <span className="font-semibold">{protocolNo}</span>
        <span>Erstellt: {createdDate} · {protocol.preparedBy || '–'}</span>
      </div>

      <div className="h-12 no-print" />

      {showEmailModal && (
        <AgendaEmailModal
          protocol={protocol}
          onClose={() => setShowEmailModal(false)}
          onSent={() => change({ agendaSentAt: new Date().toISOString() })}
        />
      )}
    </div>
  )
}
